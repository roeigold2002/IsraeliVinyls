const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

let snapshotCache = null;

function readJsonFile(fileName) {
  const fullPath = path.join(DATA_DIR, fileName);
  const text = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(text);
}

function loadSnapshot() {
  if (snapshotCache) {
    return snapshotCache;
  }

  const records = readJsonFile("records.json");
  const searchRecords = fs.existsSync(path.join(DATA_DIR, "search_records.json"))
    ? readJsonFile("search_records.json")
    : records;
  const stores = readJsonFile("stores.json");
  const genres = readJsonFile("genres.json");
  const databaseInfo = readJsonFile("database_info.json");

  snapshotCache = {
    records,
    searchRecords,
    stores,
    genres,
    databaseInfo,
  };

  return snapshotCache;
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
    body: JSON.stringify(payload),
  };
}

function parseIntParam(value, fallback, keyName) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${keyName} parameter. Must be an integer.`);
  }

  return parsed;
}

function clampPerPage(perPage) {
  if (perPage < 1 || perPage > 500) {
    return 50;
  }
  return perPage;
}

function toLowerSafe(value) {
  return String(value || "").toLowerCase();
}

function applySearchFiltering(records, params) {
  let filtered = records;

  const q = (params.get("q") || "").trim();
  const genre = (params.get("genre") || "").trim();
  const source = (params.get("source") || "").trim();
  const storeFilter = (params.get("store_filter") || "").trim();

  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((item) => {
      return toLowerSafe(item.artist).includes(needle) || toLowerSafe(item.album).includes(needle);
    });
  }

  if (genre) {
    const genreNeedle = genre.toLowerCase();
    filtered = filtered.filter((item) => toLowerSafe(item.genre).includes(genreNeedle));
  }

  if (storeFilter) {
    filtered = filtered.filter((item) => String(item.store_name || "") === storeFilter);
  } else if (source === "Discogs") {
    filtered = filtered.filter((item) => String(item.store_name || "") === "Discogs");
  } else if (source === "local") {
    filtered = filtered.filter((item) => String(item.store_name || "") !== "Discogs");
  }

  return filtered;
}

function getApiPath(event) {
  const eventPath = event.path || "";

  if (eventPath.startsWith("/.netlify/functions/api")) {
    const mapped = eventPath.replace("/.netlify/functions/api", "/api");
    return mapped || "/api";
  }

  if (eventPath.startsWith("/api")) {
    return eventPath;
  }

  if (event.rawUrl) {
    try {
      const pathname = new URL(event.rawUrl).pathname;
      if (pathname.startsWith("/.netlify/functions/api")) {
        const mapped = pathname.replace("/.netlify/functions/api", "/api");
        return mapped || "/api";
      }
      if (pathname.startsWith("/api")) {
        return pathname;
      }
    } catch (_error) {
      return "/api";
    }
  }

  return "/api";
}

function getQueryParams(event) {
  if (event.rawQuery && event.rawQuery.length > 0) {
    return new URLSearchParams(event.rawQuery);
  }

  const params = new URLSearchParams();
  const map = event.queryStringParameters || {};

  for (const [key, value] of Object.entries(map)) {
    if (value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  }

  return params;
}

function handleSearch(snapshot, params) {
  const q = (params.get("q") || "").trim();
  const source = (params.get("source") || "").trim();

  if (source === "live") {
    const pageLive = Math.max(1, parseIntParam(params.get("page"), 1, "page"));
    const perPageLive = clampPerPage(parseIntParam(params.get("per_page"), 50, "per_page"));
    if (q.length < 2) {
      return response(200, {
        records: [],
        total: 0,
        page: pageLive,
        per_page: perPageLive,
        total_pages: 0,
        has_next: false,
        has_prev: false,
        source: "live",
        message: "Type at least 2 characters for live store scraping",
      });
    }

    return response(200, {
      records: [],
      total: 0,
      page: pageLive,
      per_page: perPageLive,
      total_pages: 0,
      has_next: false,
      has_prev: false,
      source: "live",
      message: "Live source is unavailable in Netlify snapshot mode",
    });
  }

  let page = parseIntParam(params.get("page"), 1, "page");
  let perPage = parseIntParam(params.get("per_page"), 50, "per_page");

  if (page < 1) {
    page = 1;
  }
  perPage = clampPerPage(perPage);

  const filtered = applySearchFiltering(snapshot.searchRecords, params);
  const total = filtered.length;
  const offset = (page - 1) * perPage;
  const pageItems = filtered.slice(offset, offset + perPage);
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  return response(200, {
    records: pageItems,
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  });
}

function handleAllRecords(snapshot, params) {
  let page = parseIntParam(params.get("page"), 1, "page");
  let perPage = parseIntParam(params.get("per_page"), 100, "per_page");

  if (page < 1) {
    page = 1;
  }
  if (perPage > 500) {
    perPage = 500;
  }
  if (perPage < 1) {
    perPage = 100;
  }

  const total = snapshot.records.length;
  const offset = (page - 1) * perPage;
  const records = snapshot.records.slice(offset, offset + perPage);
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  return response(200, {
    total_records: total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    records,
  });
}

exports.handler = async (event) => {
  try {
    const snapshot = loadSnapshot();
    const apiPath = getApiPath(event);
    const endpoint = apiPath.replace(/^\/api\/?/, "");

    const params = getQueryParams(event);

    if (endpoint === "" || endpoint === "health") {
      return response(200, {
        ok: true,
        records: snapshot.records.length,
        stores: snapshot.stores.length,
        genres: snapshot.genres.length,
      });
    }

    if (endpoint === "stores") {
      return response(200, { stores: snapshot.stores });
    }

    if (endpoint === "genres") {
      return response(200, { genres: snapshot.genres });
    }

    if (endpoint === "database-info") {
      return response(200, snapshot.databaseInfo);
    }

    if (endpoint === "all-records") {
      return handleAllRecords(snapshot, params);
    }

    if (endpoint === "search") {
      return handleSearch(snapshot, params);
    }

    return response(404, { error: `Unknown API route: /api/${endpoint}` });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return response(400, { error: error.message });
    }

    return response(500, {
      error: "Failed to serve snapshot API",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
