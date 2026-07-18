"use strict";

/**
 * Netlify function API for the vinyl catalog.
 *
 * This file is a thin HTTP layer: routing, CORS, params, response shaping.
 * The actual work lives in lib/:
 *   - lib/snapshot.cjs  — bundle/legacy snapshot loading, lazy detail store
 *   - lib/search.cjs    — index, filtering, ranking, dedupe, suggestions
 *   - lib/enrich.cjs    — live per-record refresh (detail endpoint only)
 *   - lib/text.cjs      — normalization/tokenization shared with build time
 *
 * Performance contract for /api/search and /api/suggest:
 * NO network I/O, NO snapshot mutation, NO per-request re-normalization.
 */

const {
  normalizeInStock,
  parseNumericPrice,
} = require("./lib/text.cjs");
const { isSafeOutboundUrl, normalizeManualLookupUrl: canonicalProductUrl } = require("./lib/urls.cjs");
const { selectBestCoverCandidate, hasCoverUrl } = require("./lib/covers.cjs");
const {
  LruCache,
  parseMultiValueParam,
  applySearchFiltering,
  applySorting,
  dedupeSearchRecords,
  findPrefixRange,
  computeGenresFromRecords,
  scoreRecordForQuery,
  buildSuggestions,
} = require("./lib/search.cjs");
const {
  loadSnapshot,
  loadDetailStore,
  loadManualLookup,
  prepareDetailRecord,
  projectRecordInPlace,
} = require("./lib/snapshot.cjs");
const {
  TTLCache,
  enrichRecord,
  fetchItunesCover,
  extractInStockValue,
  probeUrl,
} = require("./lib/enrich.cjs");
const { runLiveSearch, runLiveRefresh } = require("./lib/live_search.cjs");

// ---------------------------------------------------------------------------
// CORS + response helpers
// ---------------------------------------------------------------------------

const PRODUCTION_SITE_URL = String(
  process.env.PRODUCTION_SITE_URL || "https://israeli-vinyls-projectv.netlify.app"
)
  .trim()
  .replace(/\/$/, "");

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  PRODUCTION_SITE_URL,
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function getAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (!raw) {
    return DEFAULT_CORS_ALLOWED_ORIGINS;
  }
  const parsed = raw
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_CORS_ALLOWED_ORIGINS;
}

function pickCorsOrigin(event) {
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes("*")) {
    return "*";
  }

  const requestOrigin = String(
    (event && event.headers && (event.headers.origin || event.headers.Origin)) || ""
  )
    .trim()
    .replace(/\/$/, "");

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0] || PRODUCTION_SITE_URL;
}

function response(statusCode, payload, event) {
  const corsOrigin = pickCorsOrigin(event);

  if (statusCode === 204) {
    return {
      statusCode,
      headers: {
        "access-control-allow-origin": corsOrigin,
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
        vary: "Origin",
      },
      body: "",
    };
  }

  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "access-control-allow-origin": corsOrigin,
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      vary: "Origin",
    },
    body: JSON.stringify(payload),
  };
}

// ---------------------------------------------------------------------------
// Param parsing
// ---------------------------------------------------------------------------

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

function getApiPath(event) {
  const eventPath = event.path || "";

  if (eventPath.startsWith("/.netlify/functions/api")) {
    return eventPath.replace("/.netlify/functions/api", "/api") || "/api";
  }
  if (eventPath.startsWith("/api")) {
    return eventPath;
  }

  if (event.rawUrl) {
    try {
      const pathname = new URL(event.rawUrl).pathname;
      if (pathname.startsWith("/.netlify/functions/api")) {
        return pathname.replace("/.netlify/functions/api", "/api") || "/api";
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
  for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
    if (value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// Snapshot meta
// ---------------------------------------------------------------------------

function buildSnapshotMeta(snapshot) {
  const meta = snapshot.snapshotMeta || {};
  const generatedAt = typeof meta.generated_at === "string" ? meta.generated_at : null;
  const staleAfterHours = 24;

  let freshnessHours = null;
  if (generatedAt) {
    const parsed = Date.parse(generatedAt);
    if (!Number.isNaN(parsed)) {
      freshnessHours = Number(((Date.now() - parsed) / (1000 * 60 * 60)).toFixed(2));
    }
  }

  const isStale = freshnessHours === null ? null : freshnessHours > staleAfterHours;
  const dataQuality = snapshot.databaseInfo?.data_quality || {};

  return {
    ...meta,
    generated_at: generatedAt,
    records: Number(meta.records || 0),
    search_records: Number(meta.search_records || snapshot.searchRecords.length || 0),
    stores: Number(meta.stores || snapshot.stores.length || 0),
    genres: Number(meta.genres || snapshot.genres.length || 0),
    freshness_hours: freshnessHours,
    stale_after_hours: staleAfterHours,
    is_stale: isStale,
    pricing_integrity: meta.pricing_integrity || snapshot.databaseInfo?.pricing_integrity || null,
    connectivity: meta.connectivity || snapshot.databaseInfo?.connectivity || null,
    record_integrity:
      meta.record_integrity ||
      snapshot.databaseInfo?.record_integrity ||
      snapshot.recordIntegrity?.summary ||
      null,
    search_bundle: snapshot.bundleMeta || null,
    manual_enrichment: snapshot.bundleMeta?.hydration || null,
    asset_integrity: meta.asset_integrity || {
      records_with_cover: Number(dataQuality.records_with_cover || 0),
      coverage_percent_covers: Number(dataQuality.coverage_percent_covers || 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const SEARCH_RESULT_CACHE = new LruCache(200);

const SEARCH_CACHE_PARAM_KEYS = [
  "q", "genre", "store_filter", "source", "in_stock", "format",
  "price_min", "pmin", "price_max", "pmax",
  "year_min", "ymin", "year_max", "ymax",
  "sort", "sort_by",
];

function buildSearchCacheKey(params) {
  const parts = [];
  for (const key of SEARCH_CACHE_PARAM_KEYS) {
    const values = params.getAll(key);
    if (values.length > 0) {
      parts.push(`${key}=${values.map((v) => v.trim().toLowerCase()).sort().join(",")}`);
    }
  }
  return parts.join("&");
}

function runSearch(snapshot, params) {
  const cacheKey = buildSearchCacheKey(params);
  const cached = SEARCH_RESULT_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const scoreMap = new Map();
  const filtered = applySearchFiltering(
    snapshot.searchRecords,
    params,
    { searchIndex: snapshot.searchIndex, meta: snapshot.searchMeta },
    scoreMap
  );
  const sorted = applySorting(filtered, params, scoreMap);

  SEARCH_RESULT_CACHE.set(cacheKey, sorted);
  return sorted;
}

async function handleSearch(snapshot, params, event) {
  const q = (params.get("q") || "").trim();
  const source = (params.get("source") || "").trim();

  let page = Math.max(1, parseIntParam(params.get("page"), 1, "page"));
  const perPage = clampPerPage(parseIntParam(params.get("per_page"), 50, "per_page"));

  if (source === "live") {
    if (q.length < 2) {
      return response(200, {
        records: [],
        total: 0,
        page,
        per_page: perPage,
        total_pages: 0,
        has_next: false,
        has_prev: false,
        source: "live",
        message: "Type at least 2 characters for live store search",
      }, event);
    }
    return await handleLiveSearch(snapshot, params, event);
  }

  const filtered = runSearch(snapshot, params);
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
  }, event);
}

/**
 * Real-time federated search: queries every adapter-enabled store's own
 * search endpoint concurrently and returns fresh listings that the cached
 * catalog does NOT already show, plus per-store status. Results are TTL-
 * cached (~10 min) server-side.
 */
async function handleLiveSearch(snapshot, params, event) {
  const q = (params.get("q") || "").trim();
  if (q.length < 2) {
    return response(200, { records: [], stores: [], elapsed_ms: 0, source: "live" }, event);
  }

  // Canonical product URLs already present in cached search results for this
  // query — used to return only genuinely new listings. Catalog matches are
  // also grouped per store to drive live verification for stores whose
  // platforms have no search endpoint.
  const knownProductUrls = new Set();
  const catalogMatchesByStore = new Map();
  const cachedMatches = runSearch(snapshot, params);
  for (const record of cachedMatches) {
    const canonical = canonicalProductUrl(record.product_url);
    if (canonical) {
      knownProductUrls.add(canonical);
    }
    const storeKey = String(record.store_name || "").toLowerCase();
    if (storeKey) {
      if (!catalogMatchesByStore.has(storeKey)) {
        catalogMatchesByStore.set(storeKey, []);
      }
      const list = catalogMatchesByStore.get(storeKey);
      if (list.length < 4) list.push(record);
    }
  }

  const result = await runLiveSearch(q, { knownProductUrls, catalogMatchesByStore });

  return response(200, {
    source: "live",
    query: q,
    records: result.records,
    verified: result.verified,
    total: result.records.length,
    stores: result.stores,
    elapsed_ms: result.elapsed_ms,
  }, event);
}

/**
 * Batched live revalidation: re-fetches current price/stock for up to 12
 * known records directly from their store pages. The client calls this for
 * the page of results the user is looking at, then patches the UI.
 */
async function handleLiveRefresh(params, event) {
  const idsParam = (params.get("ids") || "").trim();
  if (!idsParam) {
    return response(400, { error: "Missing ids parameter" }, event);
  }

  const requestedIds = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))];
  if (requestedIds.length === 0) {
    return response(400, { error: "ids parameter must contain at least one id" }, event);
  }

  const store = await loadDetailStore();
  const records = requestedIds
    .map((id) => store.byId.get(id))
    .filter(Boolean);

  const updates = await runLiveRefresh(records);
  return response(200, { updates, checked: updates.length }, event);
}

function handleSuggest(snapshot, params, event) {
  const q = (params.get("q") || "").trim();
  const limit = Math.min(10, Math.max(1, parseInt(params.get("limit") || "8", 10) || 8));

  if (q.length < 2) {
    return response(200, { suggestions: [] }, event);
  }

  const suggestions = buildSuggestions(snapshot.searchRecords, snapshot.searchIndex, q, limit);
  return response(200, { suggestions }, event);
}

// ---------------------------------------------------------------------------
// Detail endpoints (lazy catalog; the only place live enrichment happens)
// ---------------------------------------------------------------------------

async function handleRecord(params, event) {
  const id = (params.get("id") || "").trim();
  if (!id) {
    return response(400, { error: "Missing id parameter" }, event);
  }

  const [store, manualLookup] = await Promise.all([loadDetailStore(), loadManualLookup()]);

  const record = store.byId.get(id);
  if (!record) {
    if (store.quarantinedIds.has(id)) {
      return response(404, {
        error: `Record not found: ${id}`,
        reason: "record_quarantined_by_integrity_policy",
      }, event);
    }
    return response(404, { error: `Record not found: ${id}` }, event);
  }

  prepareDetailRecord(store, record, manualLookup);

  const forceRefresh = params.get("refresh") === "1";

  await enrichRecord(record, {
    forceRefresh,
    bypassCache: forceRefresh,
    manualLookup,
  });

  if (!hasCoverUrl(record)) {
    const itunesCover = await fetchItunesCover(record, { timeoutMs: 4000 });
    if (itunesCover) {
      record.cover_url = itunesCover;
    }
  }

  return response(200, { record: projectRecordInPlace({ ...record }) }, event);
}

async function handleAllRecords(params, event) {
  let page = Math.max(1, parseIntParam(params.get("page"), 1, "page"));
  let perPage = parseIntParam(params.get("per_page"), 100, "per_page");
  if (perPage > 500) perPage = 500;
  if (perPage < 1) perPage = 100;

  const [store, manualLookup] = await Promise.all([loadDetailStore(), loadManualLookup()]);

  const total = store.renderable.length;
  const offset = (page - 1) * perPage;
  const records = store.renderable
    .slice(offset, offset + perPage)
    .map((record) => prepareDetailRecord(store, record, manualLookup));
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  return response(200, {
    total_records: total,
    total_catalog_records: store.totalCatalogRecords,
    quarantined_records: Math.max(0, store.totalCatalogRecords - total),
    page,
    per_page: perPage,
    total_pages: totalPages,
    records,
  }, event);
}

async function handleBatchRecords(params, event) {
  const idsParam = (params.get("ids") || "").trim();
  if (!idsParam) {
    return response(400, { error: "Missing ids parameter" }, event);
  }

  const requestedIds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  if (requestedIds.length === 0) {
    return response(400, { error: "ids parameter must contain at least one id" }, event);
  }

  const [store, manualLookup] = await Promise.all([loadDetailStore(), loadManualLookup()]);

  const found = [];
  for (const id of requestedIds) {
    const record = store.byId.get(id);
    if (record) {
      found.push(prepareDetailRecord(store, record, manualLookup));
    }
  }

  return response(200, { records: found, total: found.length }, event);
}

// ---------------------------------------------------------------------------
// Link health
// ---------------------------------------------------------------------------

const LINK_HEALTH_TTL_MS = 15 * 60 * 1000;
const linkHealthCache = new TTLCache(LINK_HEALTH_TTL_MS, 500);

async function handleLinkHealth(params, event) {
  const targetUrl = (params.get("url") || "").trim();
  if (!targetUrl) {
    return response(400, { error: "Missing url parameter" }, event);
  }
  if (!isSafeOutboundUrl(targetUrl)) {
    return response(400, { error: "URL is not allowed" }, event);
  }

  const cacheKey = targetUrl.toLowerCase();
  const cached = linkHealthCache.get(cacheKey);
  if (cached) {
    return response(200, { ...cached, cached: true }, event);
  }

  const payload = await probeUrl(targetUrl);
  linkHealthCache.set(cacheKey, payload);
  return response(200, payload, event);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
  try {
    const method = String(event && event.httpMethod ? event.httpMethod : "GET").toUpperCase();
    if (method === "OPTIONS") {
      return response(204, null, event);
    }

    const apiPath = getApiPath(event);
    const endpoint = apiPath.replace(/^\/api\/?/, "");
    const params = getQueryParams(event);

    // Detail endpoints do not need the search snapshot at all.
    if (endpoint === "record") {
      return await handleRecord(params, event);
    }
    if (endpoint === "all-records") {
      return await handleAllRecords(params, event);
    }
    if (endpoint === "records") {
      return await handleBatchRecords(params, event);
    }
    if (endpoint === "link-health") {
      return await handleLinkHealth(params, event);
    }

    const snapshot = await loadSnapshot();

    if (endpoint === "" || endpoint === "health") {
      const integritySummary = snapshot.recordIntegrity?.summary || {};
      return response(200, {
        ok: true,
        records: Number(integritySummary.renderable_records || snapshot.searchRecords.length),
        total_catalog_records: Number(integritySummary.total_records || snapshot.searchRecords.length),
        quarantined_records: Number(integritySummary.quarantined_records || snapshot.quarantinedIds.size || 0),
        stores: snapshot.stores.length,
        genres: snapshot.genres.length,
        search_records: snapshot.searchRecords.length,
        manual_enrichment: snapshot.bundleMeta?.hydration || null,
      }, event);
    }

    if (endpoint === "stores") {
      return response(200, { stores: snapshot.stores }, event);
    }
    if (endpoint === "genres") {
      return response(200, { genres: snapshot.genres }, event);
    }
    if (endpoint === "database-info") {
      return response(200, snapshot.databaseInfo, event);
    }
    if (endpoint === "snapshot-meta") {
      return response(200, buildSnapshotMeta(snapshot), event);
    }
    if (endpoint === "quarantine-summary") {
      return response(200, snapshot.recordIntegrity?.summary || null, event);
    }
    if (endpoint === "search") {
      return await handleSearch(snapshot, params, event);
    }
    if (endpoint === "live-search") {
      return await handleLiveSearch(snapshot, params, event);
    }
    if (endpoint === "live-refresh") {
      return await handleLiveRefresh(params, event);
    }
    if (endpoint === "suggest") {
      return handleSuggest(snapshot, params, event);
    }

    return response(404, { error: `Unknown API route: /api/${endpoint}` }, event);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return response(400, { error: error.message }, event);
    }
    return response(500, {
      error: "Failed to serve snapshot API",
      details: error instanceof Error ? error.message : String(error),
    }, event);
  }
};

exports.__testables = {
  parseMultiValueParam,
  normalizeInStock,
  parseNumericPrice,
  extractInStockValue,
  applySearchFiltering,
  applySorting,
  dedupeSearchRecords,
  selectBestCoverCandidate,
  isSafeOutboundUrl,
  buildSnapshotMeta,
  findPrefixRange,
  computeGenresFromRecords,
  scoreRecordForQuery,
};
