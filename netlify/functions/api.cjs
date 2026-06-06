const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ENRICH_TIMEOUT_MS = 3000;
const ENRICH_CACHE_TTL_MS = 10 * 60 * 1000;
const ENRICH_MAX_ITEMS = 12;
const ENRICH_CONCURRENCY = 4;
const MANUAL_ENRICHMENT_INDEX_FILE = "manual_enrichment_index.json";
const MANUAL_TRACKING_QUERY_PARAM_RE =
  /^(utm_|fbclid$|gclid$|mc_(cid|eid)$|ref$|srsltid$|_ga$|_gl$)/i;
const DEFAULT_COVER_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#16213e'/><stop offset='100%' stop-color='#0f3460'/></linearGradient></defs><rect width='600' height='600' fill='url(#g)'/><circle cx='300' cy='300' r='170' fill='none' stroke='#e94560' stroke-width='24'/><circle cx='300' cy='300' r='35' fill='#e94560'/><text x='300' y='520' fill='#ffffff' font-size='48' text-anchor='middle' font-family='Arial, sans-serif' letter-spacing='6'>VINYL</text></svg>"
  );
const ENRICH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9,he;q=0.8",
};

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

const COVER_PLACEHOLDER_HOST_RE = /(?:dummyimage\.com|via\.placeholder\.com|placehold\.co)/i;
const ARTIST_NOISE_TOKEN_RE =
  /(original\s+price|current\s+price|\u05de\u05d1\u05e6\u05e2|\u05d7\u05e1\u05e8\s*\u05d1\u05de\u05dc\u05d0\u05d9|\u05d0\u05d6\u05dc\s*\u05de(?:\u05d4)?\u05de\u05dc\u05d0\u05d9|\u05e2\u05d3\u05db\u05e0\u05d5\s*\u05d0\u05d5\u05ea\u05d9|\u05de\u05d9\u05d3\u05e2\s*\u05e0\u05d5\u05e1\u05e3|\u05e4\u05e8\u05d8\u05d9\u05dd\s*\u05e0\u05d5\u05e1\u05e4\u05d9\u05dd|\u05d1\u05de\u05dc\u05d0\u05d9|out\s*of\s*stock|sold\s*out|in\s*stock)/i;
const LEADING_MEDIA_TOKEN_RE =
  /^(?:(?:\d{1,2}\s*x?\s*)?(?:LP|EP|CD|DVD|Blu[\s-]?ray|BOX\s*SET|VINYL)\s+)+/gi;
const PRICE_FRAGMENT_RE =
  /(?:\b(?:original\s+price\s+was|current\s+price\s+is)\b\s*:?\s*[^.;]+)|(?:(?:[₪$€]|ILS|NIS|USD|EUR)\s*[0-9]{1,5}(?:[.,][0-9]{1,2})?)|(?:[0-9]{1,5}(?:[.,][0-9]{1,2})?\s*(?:₪|ILS|NIS|USD|EUR))/gi;
const PROMO_AND_STOCK_PREFIX_RE =
  /^(?:\s*(?:\u05d7\u05e1\u05e8\s*\u05d1\u05de\u05dc\u05d0\u05d9|\u05d0\u05d6\u05dc\s*\u05de(?:\u05d4)?\u05de\u05dc\u05d0\u05d9|\u05de\u05d1\u05e6\u05e2!?\s*\d{0,3}%?\s*\u05d4\u05e0\u05d7\u05d4?|out\s*of\s*stock|sold\s*out|instock|in\s*stock|\u05e2\u05d3\u05db\u05e0\u05d5\s*\u05d0\u05d5\u05ea\u05d9\s*\u05db\u05e9\u05d7\u05d6\u05e8\s*\u05dc\u05de\u05dc\u05d0\u05d9|\u05de\u05d9\u05d3\u05e2\s*\u05e0\u05d5\u05e1\u05e3|\u05e4\u05e8\u05d8\u05d9\u05dd\s*\u05e0\u05d5\u05e1\u05e4\u05d9\u05dd|\u05de\u05d7\u05d9\u05e8\s*\u05d0\u05d5\u05e0\u05dc\u05d9\u05d9\u05df|\u05de\u05d7\u05d9\u05e8\s*:)\s*)+/i;
const INLINE_NOISE_TOKEN_RE =
  /(\u05d7\u05e1\u05e8\s*\u05d1\u05de\u05dc\u05d0\u05d9|\u05d0\u05d6\u05dc\s*\u05de(?:\u05d4)?\u05de\u05dc\u05d0\u05d9|\u05dc\u05d0\s*\u05d1\u05de\u05dc\u05d0\u05d9|\u05de\u05d9\u05d3\u05e2\s*\u05e0\u05d5\u05e1\u05e3|\u05e4\u05e8\u05d8\u05d9\u05dd\s*\u05e0\u05d5\u05e1\u05e4\u05d9\u05dd|\u05d1\u05de\u05dc\u05d0\u05d9|out\s*of\s*stock|sold\s*out|in\s*stock)/gi;

function maybeFixMojibake(value) {
  const source = String(value || "");
  if (!source || !/[ÃÂâ]/.test(source)) {
    return source;
  }

  try {
    const repaired = Buffer.from(source, "latin1").toString("utf8");
    if (repaired && repaired !== source && !repaired.includes("�")) {
      return repaired;
    }
  } catch (_error) {
    return source;
  }

  return source;
}

function decodeBasicHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8212;|&mdash;/gi, "-")
    .replace(/&#8362;|&shekel;/gi, "₪");
}

function normalizeDisplayText(value, options = {}) {
  const stripLeadingFormat = Boolean(options.stripLeadingFormat);

  let text = maybeFixMojibake(decodeBasicHtmlEntities(value));
  if (!text) {
    return "";
  }

  text = text
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    .replace(/\\\//g, "/")
    .replace(PROMO_AND_STOCK_PREFIX_RE, " ")
    .replace(INLINE_NOISE_TOKEN_RE, " ")
    .replace(PRICE_FRAGMENT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripLeadingFormat) {
    text = text.replace(LEADING_MEDIA_TOKEN_RE, "").trim();
  }

  text = text
    .replace(/^[-–—|/:;,.\s]+/, "")
    .replace(/[-–—|/:;,.\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function isLikelyNoisyArtist(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  if (ARTIST_NOISE_TOKEN_RE.test(text)) {
    return true;
  }

  if (/[₪$€]/.test(text)) {
    return true;
  }

  return false;
}

function isPlausibleArtistName(value) {
  const text = normalizeDisplayText(value, { stripLeadingFormat: true });
  if (!text || text.length < 2 || text.length > 140) {
    return false;
  }

  if (isLikelyNoisyArtist(text)) {
    return false;
  }

  if (/^(?:lp|ep|cd|dvd|vinyl|box\s*set)$/i.test(text)) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(text);
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitArtistAlbumFromText(value) {
  const source = normalizeDisplayText(value, { stripLeadingFormat: true });
  if (!source) {
    return null;
  }

  const delimiters = ["/", "|", " – ", " - "];

  for (const delimiter of delimiters) {
    const index = source.indexOf(delimiter);
    if (index < 2) {
      continue;
    }

    const left = source.slice(0, index);
    const right = source.slice(index + delimiter.length);
    const artist = normalizeDisplayText(left, { stripLeadingFormat: true });
    const album = normalizeDisplayText(right, { stripLeadingFormat: true });

    if (!artist || !album) {
      continue;
    }

    if (!isPlausibleArtistName(artist)) {
      continue;
    }

    return {
      artist,
      album,
    };
  }

  return null;
}

function deriveArtistFromProductUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return "";
    }

    const slug = decodeURIComponent(parts[parts.length - 1] || "");
    if (!slug || slug.length < 2) {
      return "";
    }
    if (/\.[a-z]{2,5}$/i.test(slug)) {
      return "";
    }

    const stop = new Set([
      "vinyl",
      "lp",
      "lps",
      "cd",
      "dvd",
      "box",
      "set",
      "edition",
      "limited",
      "deluxe",
      "colored",
      "colour",
      "color",
      "reissue",
      "anniversary",
      "the",
      "a",
    ]);

    const tokens = slug
      .split(/[-_]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !stop.has(token.toLowerCase()))
      .filter((token) => !/^\d{1,4}$/.test(token));

    if (tokens.length === 0) {
      return "";
    }

    const candidate = tokens
      .slice(0, 4)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ");

    return isPlausibleArtistName(candidate) ? candidate : "";
  } catch (_error) {
    return "";
  }
}

function normalizeRecordTextFields(record) {
  if (!record) {
    return false;
  }

  const originalArtist = String(record.artist || "").trim();
  const originalAlbum = String(record.album || "").trim();

  let artist = normalizeDisplayText(originalArtist, { stripLeadingFormat: true });
  let album = normalizeDisplayText(originalAlbum, { stripLeadingFormat: true });

  if ((!artist || isLikelyNoisyArtist(artist)) && album) {
    const split = splitArtistAlbumFromText(album);
    if (split) {
      artist = split.artist;
      album = split.album;
    }
  }

  if ((!artist || isLikelyNoisyArtist(artist)) && record.product_url) {
    const derivedArtist = deriveArtistFromProductUrl(record.product_url);
    if (derivedArtist) {
      artist = derivedArtist;
    }
  }

  if (artist && album.includes("/")) {
    const split = splitArtistAlbumFromText(album);
    if (split) {
      const splitArtistComparable = normalizeComparableText(split.artist);
      const currentArtistComparable = normalizeComparableText(artist);
      if (
        splitArtistComparable &&
        currentArtistComparable &&
        (splitArtistComparable === currentArtistComparable ||
          splitArtistComparable.includes(currentArtistComparable) ||
          currentArtistComparable.includes(splitArtistComparable))
      ) {
        album = split.album;
      }
    }
  }

  const changed =
    (artist && artist !== originalArtist) ||
    (album && album !== originalAlbum);

  if (artist && artist !== originalArtist) {
    record.artist = artist;
  }

  if (album && album !== originalAlbum) {
    record.album = album;
  }

  return changed;
}

function normalizeSnapshotRecordText(records, searchRecords) {
  for (const record of records || []) {
    normalizeRecordTextFields(record);
  }

  if (searchRecords !== records) {
    for (const record of searchRecords || []) {
      normalizeRecordTextFields(record);
    }
  }
}

function getAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (!raw) {
    return DEFAULT_CORS_ALLOWED_ORIGINS;
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (parsed.length === 0) {
    return DEFAULT_CORS_ALLOWED_ORIGINS;
  }

  return parsed;
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

class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  set(key, value, ttlMs) {
    const effectiveTtlMs =
      Number.isFinite(ttlMs) && ttlMs > 0 ? Number(ttlMs) : this.ttlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + effectiveTtlMs,
    });
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

let snapshotCache = null;
let snapshotCachePromise = null;
const enrichCache = new TTLCache(ENRICH_CACHE_TTL_MS);
const linkHealthCache = new Map();
const LINK_HEALTH_TTL_MS = 15 * 60 * 1000;
let manualEnrichmentLookupCache = null;

async function readJsonFileAsync(fileName) {
  const fullPath = path.join(DATA_DIR, fileName);
  const text = await fs.promises.readFile(fullPath, "utf8");
  return JSON.parse(text);
}

async function readJsonFileIfExists(fileName) {
  const fullPath = path.join(DATA_DIR, fileName);
  try {
    await fs.promises.access(fullPath);
  } catch {
    return null;
  }
  const text = await fs.promises.readFile(fullPath, "utf8");
  return JSON.parse(text);
}

function parseQueryTerms(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (!normalized) {
    return [];
  }

  const tokenized = buildSearchTokens(normalized);
  if (tokenized.length > 0) {
    return [...new Set(tokenized)];
  }

  return [...new Set(normalized.split(/\s+/).filter(Boolean))];
}

function mergePostingLists(lists) {
  if (!Array.isArray(lists) || lists.length === 0) {
    return [];
  }

  const merged = new Set();
  for (const list of lists) {
    for (const index of list || []) {
      merged.add(index);
    }
  }

  return [...merged].sort((a, b) => a - b);
}

function findPrefixRange(sortedKeys, prefix) {
  let lo = 0, hi = sortedKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedKeys[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  const upperBound = prefix + "￿";
  lo = start; hi = sortedKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedKeys[mid] < upperBound) lo = mid + 1;
    else hi = mid;
  }
  return [start, lo];
}

function buildSearchIndex(records) {
  const tokenToIndexes = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] || {};
    const tokens = parseQueryTerms(`${record.artist || ""} ${record.album || ""}`);
    if (tokens.length === 0) {
      continue;
    }

    for (const token of tokens) {
      if (!tokenToIndexes.has(token)) {
        tokenToIndexes.set(token, []);
      }
      tokenToIndexes.get(token).push(index);
    }
  }

  return {
    recordsRef: records,
    tokenToIndexes,
    tokenKeys: [...tokenToIndexes.keys()].sort(),
    queryCache: new Map(),
  };
}

function getIndexedQueryCandidateIndexes(searchIndex, query) {
  if (!searchIndex || !query) {
    return null;
  }

  const terms = parseQueryTerms(query);
  if (terms.length === 0) {
    return null;
  }

  const cacheKey = terms.join("|");
  if (searchIndex.queryCache.has(cacheKey)) {
    return searchIndex.queryCache.get(cacheKey);
  }

  const postingLists = [];
  for (const term of terms) {
    let posting = searchIndex.tokenToIndexes.get(term);
    if (!posting) {
      const [lo, hi] = findPrefixRange(searchIndex.tokenKeys, term);
      const prefixLists = [];
      for (let i = lo; i < hi; i++) {
        const list = searchIndex.tokenToIndexes.get(searchIndex.tokenKeys[i]);
        if (list) prefixLists.push(list);
      }
      posting = mergePostingLists(prefixLists);
    }

    if (!posting || posting.length === 0) {
      searchIndex.queryCache.set(cacheKey, []);
      return [];
    }

    postingLists.push(posting);
  }

  postingLists.sort((a, b) => a.length - b.length);

  let candidates = new Set(postingLists[0]);
  for (let i = 1; i < postingLists.length; i += 1) {
    const nextSet = new Set(postingLists[i]);
    const intersected = new Set();
    for (const index of candidates) {
      if (nextSet.has(index)) {
        intersected.add(index);
      }
    }
    candidates = intersected;
    if (candidates.size === 0) {
      break;
    }
  }

  const result = [...candidates].sort((a, b) => a - b);
  searchIndex.queryCache.set(cacheKey, result);
  return result;
}

function readJsonFile(fileName) {
  const fullPath = path.join(DATA_DIR, fileName);
  const text = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(text);
}

function toIdSet(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }
  return new Set(values.map((value) => String(value || "")).filter(Boolean));
}

function buildRenderableViews(records, searchRecords, recordIntegrity) {
  const quarantinedIds = toIdSet(recordIntegrity && recordIntegrity.quarantined_ids);
  if (quarantinedIds.size === 0) {
    return {
      recordsRenderable: records,
      searchRecordsRenderable: searchRecords,
      quarantinedIds,
    };
  }

  const recordsRenderable = records.filter((record) => !quarantinedIds.has(String(record.id)));
  const searchRecordsRenderable = searchRecords.filter((record) => !quarantinedIds.has(String(record.id)));

  return {
    recordsRenderable,
    searchRecordsRenderable,
    quarantinedIds,
  };
}

function computeGenresFromRecords(records) {
  const seen = new Set();
  for (const r of records) {
    const g = String(r.genre || "").trim();
    if (g.length > 1) seen.add(g);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "he"));
}

async function buildSnapshot() {
  const [
    records,
    searchRecordsRaw,
    stores,
    rawGenres,
    databaseInfo,
    snapshotMeta,
    recordIntegrity,
  ] = await Promise.all([
    readJsonFileAsync("records.json"),
    readJsonFileIfExists("search_records.json"),
    readJsonFileAsync("stores.json"),
    readJsonFileAsync("genres.json"),
    readJsonFileAsync("database_info.json"),
    readJsonFileIfExists("snapshot_meta.json"),
    readJsonFileIfExists("record_integrity.json"),
  ]);

  const searchRecords = searchRecordsRaw || records;
  const genres = Array.isArray(rawGenres) && rawGenres.length > 0
    ? rawGenres
    : computeGenresFromRecords(records);

  normalizeSnapshotRecordText(records, searchRecords);
  const manualEnrichment = await hydrateRecordsFromManualIndex(records, searchRecords);
  const renderableViews = buildRenderableViews(records, searchRecords, recordIntegrity);
  const searchIndex = buildSearchIndex(renderableViews.searchRecordsRenderable);

  snapshotCache = {
    records,
    searchRecords,
    recordsRenderable: renderableViews.recordsRenderable,
    searchRecordsRenderable: renderableViews.searchRecordsRenderable,
    quarantinedIds: renderableViews.quarantinedIds,
    stores,
    genres,
    databaseInfo,
    snapshotMeta: snapshotMeta || {},
    recordIntegrity,
    searchIndex,
    manualEnrichment,
  };

  return snapshotCache;
}

async function loadSnapshot() {
  if (snapshotCache) {
    return snapshotCache;
  }
  if (!snapshotCachePromise) {
    snapshotCachePromise = buildSnapshot();
  }
  return snapshotCachePromise;
}

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
    records: Number(meta.records || snapshot.records.length || 0),
    search_records: Number(meta.search_records || snapshot.searchRecords.length || 0),
    stores: Number(meta.stores || snapshot.stores.length || 0),
    genres: Number(meta.genres || snapshot.genres.length || 0),
    freshness_hours: freshnessHours,
    stale_after_hours: staleAfterHours,
    is_stale: isStale,
    pricing_integrity: meta.pricing_integrity || snapshot.databaseInfo?.pricing_integrity || null,
    connectivity: meta.connectivity || snapshot.databaseInfo?.connectivity || null,
    record_integrity:
      meta.record_integrity || snapshot.databaseInfo?.record_integrity || snapshot.recordIntegrity?.summary || null,
    manual_enrichment: snapshot.manualEnrichment || null,
    asset_integrity: meta.asset_integrity || {
      records_with_cover: Number(dataQuality.records_with_cover || 0),
      coverage_percent_covers: Number(dataQuality.coverage_percent_covers || 0),
    },
  };
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
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": corsOrigin,
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      vary: "Origin",
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

function isSafeOutboundUrl(candidate) {
  try {
    const parsed = new URL(String(candidate || ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

async function probeUrl(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: ENRICH_HEADERS,
    });

    if (res.status === 405 || res.status === 403 || res.status === 401) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: ENRICH_HEADERS,
      });
    }

    const finalUrl = res && res.url ? String(res.url) : url;
    const status = Number.isFinite(Number(res.status)) ? Number(res.status) : null;
    const ok = Boolean(res.ok);

    return {
      ok,
      status,
      final_url: finalUrl,
      checked_at: new Date().toISOString(),
      cached: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      final_url: null,
      checked_at: new Date().toISOString(),
      cached: false,
      error: error instanceof Error ? error.message : "link_probe_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

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
  if (cached && cached.expiresAt > Date.now()) {
    return response(200, {
      ...cached.payload,
      cached: true,
    }, event);
  }

  const payload = await probeUrl(targetUrl);
  linkHealthCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + LINK_HEALTH_TTL_MS,
  });

  return response(200, payload, event);
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

function parseMultiValueParam(params, key) {
  const rawValues = params.getAll(key);
  if (!rawValues || rawValues.length === 0) {
    return [];
  }

  return rawValues
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeInStock(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true" || lowered === "1" || lowered === "yes") {
    return true;
  }
  if (lowered === "false" || lowered === "0" || lowered === "no") {
    return false;
  }

  return null;
}

function parseNumericPrice(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  const match = String(value).match(/([0-9]{1,5}(?:[.,][0-9]{1,2})?)/);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

function normalizeManualLookupUrl(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(String(url).trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    if (/^www\.www\./i.test(parsed.hostname)) {
      parsed.hostname = parsed.hostname.replace(/^www\.www\./i, "www.");
    }

    const host = parsed.hostname.toLowerCase();
    const pathname = (parsed.pathname || "/").replace(/\/+$/g, "") || "/";

    const queryPairs = [];
    for (const [name, value] of parsed.searchParams.entries()) {
      if (MANUAL_TRACKING_QUERY_PARAM_RE.test(name)) {
        continue;
      }
      queryPairs.push([name, value]);
    }

    queryPairs.sort((a, b) => {
      if (a[0] === b[0]) {
        return a[1].localeCompare(b[1]);
      }
      return a[0].localeCompare(b[0]);
    });

    const query =
      queryPairs.length > 0
        ? `?${queryPairs
            .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
            .join("&")}`
        : "";

    return `${host}${pathname}${query}`;
  } catch (_error) {
    return "";
  }
}

function buildManualLookupKeys(url) {
  const primary = normalizeManualLookupUrl(url);
  if (!primary) {
    return [];
  }

  const keys = [primary];
  const queryIndex = primary.indexOf("?");
  if (queryIndex > -1) {
    keys.push(primary.slice(0, queryIndex));
  }

  return [...new Set(keys)].filter(Boolean);
}

function normalizeManualLookupKey(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return normalizeManualLookupUrl(raw);
  }

  if (raw.startsWith("//")) {
    return normalizeManualLookupUrl(`https:${raw}`);
  }

  return normalizeManualLookupUrl(`https://${raw.replace(/^\/+/, "")}`);
}

function metadataHasUsefulFields(metadata) {
  if (!metadata) {
    return false;
  }

  return (
    Boolean(resolveUsableCoverUrl(metadata.cover_url)) ||
    parseNumericPrice(metadata.price) > 0 ||
    normalizeInStock(metadata.in_stock) !== null
  );
}

function mergeMetadata(primary, fallback) {
  const primaryInStock = normalizeInStock(primary && primary.in_stock);
  const fallbackInStock = normalizeInStock(fallback && fallback.in_stock);
  const primaryPrice = parseNumericPrice(primary && primary.price);
  const fallbackPrice = parseNumericPrice(fallback && fallback.price);
  const primaryCover = resolveUsableCoverUrl(primary && primary.cover_url);
  const fallbackCover = resolveUsableCoverUrl(fallback && fallback.cover_url);

  return {
    cover_url: primaryCover || fallbackCover || null,
    price: primaryPrice > 0 ? primaryPrice : fallbackPrice,
    in_stock: primaryInStock !== null ? primaryInStock : fallbackInStock,
  };
}

function scoreMetadata(metadata) {
  let score = 0;
  if (resolveUsableCoverUrl(metadata && metadata.cover_url)) {
    score += 4;
  }
  if (parseNumericPrice(metadata && metadata.price) > 0) {
    score += 3;
  }
  if (normalizeInStock(metadata && metadata.in_stock) !== null) {
    score += 2;
  }
  return score;
}

function mergeMetadataByScore(existing, candidate) {
  if (!existing) {
    return candidate;
  }
  if (!candidate) {
    return existing;
  }

  const candidateScore = scoreMetadata(candidate);
  const existingScore = scoreMetadata(existing);
  const preferred = candidateScore > existingScore ? candidate : existing;
  const secondary = preferred === candidate ? existing : candidate;
  return mergeMetadata(preferred, secondary);
}

async function loadManualEnrichmentLookup() {
  if (manualEnrichmentLookupCache) {
    return manualEnrichmentLookupCache;
  }

  const empty = {
    generated_at: null,
    entries: 0,
    lookup: new Map(),
  };

  const filePath = path.join(DATA_DIR, MANUAL_ENRICHMENT_INDEX_FILE);
  try {
    await fs.promises.access(filePath);
  } catch {
    manualEnrichmentLookupCache = empty;
    return manualEnrichmentLookupCache;
  }

  try {
    const payload = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    const rows = Array.isArray(payload && payload.entries) ? payload.entries : [];
    const lookup = new Map();

    for (const row of rows) {
      const productUrl = String(row && row.product_url ? row.product_url : "").trim();
      const sourceUrl = productUrl || "https://example.com/";
      const metadata = {
        cover_url: normalizeCoverUrl(row && row.cover_url, sourceUrl),
        price: parseNumericPrice(row && row.price),
        in_stock: normalizeInStock(row && row.in_stock),
      };

      if (!metadataHasUsefulFields(metadata)) {
        continue;
      }

      const keySet = new Set();
      const lookupKeys = Array.isArray(row && row.lookup_keys) ? row.lookup_keys : [];
      for (const rawKey of lookupKeys) {
        const normalizedKey = normalizeManualLookupKey(rawKey);
        if (normalizedKey) {
          keySet.add(normalizedKey);
        }
      }

      for (const derivedKey of buildManualLookupKeys(productUrl)) {
        keySet.add(derivedKey);
      }

      if (keySet.size === 0) {
        continue;
      }

      for (const key of keySet) {
        const existing = lookup.get(key);
        lookup.set(key, mergeMetadataByScore(existing, metadata));
      }
    }

    manualEnrichmentLookupCache = {
      generated_at: typeof payload.generated_at === "string" ? payload.generated_at : null,
      entries: rows.length,
      lookup,
    };
  } catch (_error) {
    manualEnrichmentLookupCache = empty;
  }

  return manualEnrichmentLookupCache;
}

function findManualMetadataByUrl(url) {
  if (!url) {
    return null;
  }

  const cached = manualEnrichmentLookupCache;
  if (!cached || !cached.lookup || cached.lookup.size === 0) {
    return null;
  }

  const lookupKeys = buildManualLookupKeys(url);
  for (const lookupKey of lookupKeys) {
    const metadata = cached.lookup.get(lookupKey);
    if (metadata && metadataHasUsefulFields(metadata)) {
      return metadata;
    }
  }

  return null;
}

function findManualMetadataInLookup(url, lookup) {
  if (!url || !lookup || lookup.size === 0) {
    return null;
  }

  const lookupKeys = buildManualLookupKeys(url);
  for (const lookupKey of lookupKeys) {
    const metadata = lookup.get(lookupKey);
    if (metadata && metadataHasUsefulFields(metadata)) {
      return metadata;
    }
  }

  return null;
}

function findManualMetadataForRecord(record, lookup) {
  if (!record) {
    return null;
  }

  const candidateUrls = [record.product_url, record.store_url]
    .map((value) => String(value || "").trim())
    .filter((value) => /^https?:\/\//i.test(value));

  if (candidateUrls.length === 0) {
    return null;
  }

  for (const candidateUrl of candidateUrls) {
    const metadata = lookup
      ? findManualMetadataInLookup(candidateUrl, lookup)
      : findManualMetadataByUrl(candidateUrl);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

function applyManualMetadataToRecord(record, options = {}) {
  if (!record) {
    return false;
  }

  const metadata = findManualMetadataForRecord(record, options.lookup);
  if (!metadata) {
    return false;
  }

  let changed = false;

  const normalizedCover = resolveUsableCoverUrl(metadata.cover_url, getEnrichmentUrl(record));
  if (normalizedCover && !hasCoverUrl(record)) {
    record.cover_url = normalizedCover;
    changed = true;
  }

  if (metadata.price > 0 && Number(record.price || 0) <= 0) {
    record.price = metadata.price;
    changed = true;
  }

  const existingInStock = normalizeInStock(record.in_stock);
  const metadataInStock = normalizeInStock(metadata.in_stock);
  if (existingInStock === null && metadataInStock !== null) {
    record.in_stock = metadataInStock;
    changed = true;
  }

  if (!record.product_url && typeof record.store_url === "string" && record.store_url.startsWith("http")) {
    record.product_url = record.store_url;
  }

  return changed;
}

async function hydrateRecordsFromManualIndex(records, searchRecords) {
  const cached = await loadManualEnrichmentLookup();
  const lookup = cached && cached.lookup ? cached.lookup : null;

  const summary = {
    index_entries: Number(cached && cached.entries ? cached.entries : 0),
    index_generated_at: cached && cached.generated_at ? cached.generated_at : null,
    records_hydrated: 0,
    search_records_hydrated: 0,
  };

  if (!lookup || lookup.size === 0) {
    return summary;
  }

  for (const record of records || []) {
    if (applyManualMetadataToRecord(record, { lookup })) {
      summary.records_hydrated += 1;
    }
  }

  if (searchRecords !== records) {
    for (const record of searchRecords || []) {
      if (applyManualMetadataToRecord(record, { lookup })) {
        summary.search_records_hydrated += 1;
      }
    }
  }

  return summary;
}

function extractCoverUrl(html) {
  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<figure[^>]*class=["'][^"']*woocommerce-product-gallery__image[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["']/i,
    /<img[^>]*data-large_image=["']([^"']+)["'][^>]*>/i,
    /<img[^>]*class=["'][^"']*(?:attachment-woocommerce_single|woocommerce-main-image|product-main-image)[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i,
    /"image"\s*:\s*\[\s*"([^\"]+)"/i,
    /"image"\s*:\s*"([^\"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return cleanRawCoverCandidate(match[1]);
    }
  }

  return null;
}

function cleanRawCoverCandidate(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  value = decodeBasicHtmlEntities(value).replace(/\\\//g, "/").trim();
  if (!value) {
    return "";
  }

  if (value.includes(")](")) {
    const segments = value.split(")](");
    value = segments[segments.length - 1] || value;
  }

  value = value
    .replace(/^[\("'\[]+/, "")
    .replace(/[\)"'\]\u00a0]+$/g, "")
    .trim();

  return value;
}

function normalizeCoverUrl(rawCoverUrl, sourcePageUrl) {
  if (!rawCoverUrl) {
    return null;
  }

  let candidate = cleanRawCoverCandidate(rawCoverUrl);
  if (!candidate) {
    return null;
  }
  candidate = candidate.replace(/\s+/g, "").trim();

  if (!candidate || /^data:/i.test(candidate) || /^javascript:/i.test(candidate)) {
    return null;
  }

  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  }

  try {
    const parsed = new URL(candidate, sourcePageUrl);
    const sourceIsHttps = String(sourcePageUrl || "").startsWith("https://");
    if (parsed.protocol === "http:" && sourceIsHttps) {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (/^www\.www\./i.test(parsed.hostname)) {
      parsed.hostname = parsed.hostname.replace(/^www\.www\./i, "www.");
    }
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function isGeneratedPlaceholderCoverUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return true;
  }

  const lowered = value.toLowerCase();
  return (
    lowered.startsWith("data:image/svg+xml") ||
    lowered.includes("dummyimage.com") ||
    COVER_PLACEHOLDER_HOST_RE.test(lowered)
  );
}

function resolveUsableCoverUrl(rawCoverUrl, sourcePageUrl) {
  const normalized = normalizeCoverUrl(rawCoverUrl, sourcePageUrl);
  if (!normalized) {
    return null;
  }

  if (isGeneratedPlaceholderCoverUrl(normalized)) {
    return null;
  }

  if (!isLikelyCoverUrl(normalized)) {
    return null;
  }

  return normalized;
}

function hasCoverUrl(record) {
  if (!record) {
    return false;
  }

  const sourceUrl = getEnrichmentUrl(record);
  return Boolean(resolveUsableCoverUrl(record.cover_url, sourceUrl));
}

function isLikelyCoverUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(value)) {
    return false;
  }
  const excluded = [
    "logo",
    "header",
    "small-out-of-stock",
    "gift-card",
    "favicon",
    "sprite",
    "banner",
    "placeholder",
    "blank",
    "avatar",
    "icon",
    "android-chrome",
    "apple-touch",
    "mstile",
    "site.webmanifest",
    "cropped-android-chrome",
    "facebook",
    "instagram",
    "whatsapp",
    "youtube",
    "social",
    "dummyimage.com",
    "via.placeholder",
    "placehold.co",
  ];
  if (excluded.some((word) => value.includes(word))) {
    return false;
  }

  if (/(?:\/cart(?:[/?#]|$)|add-to-cart|shopping-cart|cart-icon|mini-cart)/.test(value)) {
    return false;
  }

  return true;
}

function extractImageCandidatesFromHtml(html, sourcePageUrl) {
  const candidates = [];
  const pushCandidate = (rawValue) => {
    const normalized = normalizeCoverUrl(cleanRawCoverCandidate(rawValue), sourcePageUrl);
    if (!normalized || !isLikelyCoverUrl(normalized)) {
      return;
    }
    candidates.push(normalized);
  };

  const absoluteImageUrls =
    html.match(/https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^\s"'<>]*)?/gi) || [];
  for (const candidate of absoluteImageUrls) {
    pushCandidate(candidate);
  }

  const attrPattern =
    /(?:src|data-src|data-lazy-src|data-large_image|href)=["']([^"']+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"']*)?)["']/gi;
  for (const match of html.matchAll(attrPattern)) {
    if (match && match[1]) {
      pushCandidate(match[1]);
    }
  }

  const srcsetPattern = /srcset=["']([^"']+)["']/gi;
  for (const match of html.matchAll(srcsetPattern)) {
    if (!match || !match[1]) {
      continue;
    }
    const srcsetValue = match[1];
    const entries = srcsetValue.split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const firstPart = entry.split(/\s+/)[0];
      if (firstPart) {
        pushCandidate(firstPart);
      }
    }
  }

  return [...new Set(candidates)];
}

function looksLikeBlockedHtml(html) {
  const value = String(html || "");
  if (!value) {
    return false;
  }

  // Only treat as blocked when high-confidence anti-bot challenge markers appear.
  const probe = value.slice(0, 12000).toLowerCase();
  if (!probe) {
    return false;
  }

  if (probe.includes("cf-chl") || probe.includes("/cdn-cgi/challenge-platform")) {
    return true;
  }

  if (
    probe.includes("<title>just a moment") ||
    probe.includes("checking your browser before accessing") ||
    probe.includes("attention required")
  ) {
    return true;
  }

  if (probe.includes("<title>access denied") && probe.includes("cloudflare")) {
    return true;
  }

  return false;
}

function buildSearchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .slice(0, 10);
}

const COVER_REFERENCE_TOKEN_STOPWORDS = new Set([
  "product",
  "products",
  "shop",
  "records",
  "record",
  "vinyl",
  "music",
  "page",
  "pages",
  "category",
  "item",
  "post",
  "type",
  "store",
]);

function buildCoverReferenceTokens(referenceUrl) {
  const raw = String(referenceUrl || "").trim();
  if (!raw) {
    return [];
  }

  let value = raw;
  try {
    const parsed = new URL(raw);
    value = `${decodeURIComponent(parsed.pathname || "")} ${decodeURIComponent(
      parsed.search || ""
    )}`;
  } catch (_error) {
    value = raw;
  }

  return buildSearchTokens(value).filter((token) => !COVER_REFERENCE_TOKEN_STOPWORDS.has(token));
}

function toHighResItunesArtwork(url) {
  const value = String(url || "").trim();
  if (!value) {
    return null;
  }

  const upgraded = value
    .replace(/\/(\d{2,4})x(\d{2,4})bb(?=\.|\?|$)/i, "/600x600bb")
    .replace(/\b(\d{2,4})x(\d{2,4})(?=bb\b)/i, "600x600");

  return normalizeCoverUrl(upgraded, "https://itunes.apple.com");
}

async function fetchItunesCover(record, options = {}) {
  if (!record) {
    return null;
  }

  const artist = String(record.artist || "").trim();
  const album = String(record.album || "").trim();
  const term = `${artist} ${album}`.trim();
  if (term.length < 2) {
    return null;
  }

  const cacheKey = `itunes:${term.toLowerCase()}`;
  const bypassCache = Boolean(options.bypassCache);
  if (!bypassCache && enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const timeoutMs = Number(options.timeoutMs || ENRICH_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint =
      `https://itunes.apple.com/search?entity=album&limit=8&term=` +
      encodeURIComponent(term);

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!res.ok) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const payload = await res.json();
    const results = Array.isArray(payload && payload.results) ? payload.results : [];
    if (results.length === 0) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const targetArtist = toLowerSafe(artist);
    const targetAlbum = toLowerSafe(album);
    const targetTokens = new Set(buildSearchTokens(`${artist} ${album}`));

    let bestCover = null;
    let bestScore = -1;

    for (const item of results) {
      const candidateArtist = String(item && item.artistName ? item.artistName : "");
      const candidateAlbum = String(
        item && (item.collectionName || item.trackName)
          ? item.collectionName || item.trackName
          : ""
      );

      const artCandidate =
        toHighResItunesArtwork(item && item.artworkUrl100) ||
        toHighResItunesArtwork(item && item.artworkUrl60) ||
        toHighResItunesArtwork(item && item.artworkUrl30);

      if (!artCandidate || !isLikelyCoverUrl(artCandidate)) {
        continue;
      }

      const candidateTokens = new Set(buildSearchTokens(`${candidateArtist} ${candidateAlbum}`));
      let score = 0;

      for (const token of targetTokens) {
        if (candidateTokens.has(token)) {
          score += 1;
        }
      }

      const candidateArtistLower = toLowerSafe(candidateArtist);
      const candidateAlbumLower = toLowerSafe(candidateAlbum);

      if (targetArtist && candidateArtistLower === targetArtist) {
        score += 3;
      } else if (targetArtist && candidateArtistLower.includes(targetArtist)) {
        score += 1;
      }

      if (targetAlbum && candidateAlbumLower === targetAlbum) {
        score += 4;
      } else if (targetAlbum && candidateAlbumLower.includes(targetAlbum)) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCover = artCandidate;
      }
    }

    const minimumScore = targetArtist && targetAlbum ? 5 : 4;
    const selectedCover = bestCover && bestScore >= minimumScore ? bestCover : null;

    enrichCache.set(cacheKey, selectedCover || null);
    return selectedCover || null;
  } catch (_error) {
    enrichCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function selectBestCoverCandidate(candidates, record, options = {}) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const recordArtistTokens = buildSearchTokens(record && record.artist);
  const recordAlbumTokens = buildSearchTokens(record && record.album);
  const referenceTokens = buildCoverReferenceTokens(options.referenceUrl);
  const tokens = [...new Set([...recordArtistTokens, ...recordAlbumTokens, ...referenceTokens])];
  let bestUrl = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const url of candidates) {
    const value = String(url || "").toLowerCase();
    let score = 0;
    let tokenHits = 0;

    if (value.includes("/wp-content/uploads/")) score += 3;
    if (value.includes("/cdn/shop/files/")) score += 3;
    if (value.includes("/product") || value.includes("/products")) score += 2;
    if (/\b(?:80x80|100x100|150x150|300x300|thumbnail)\b/.test(value)) score -= 2;
    if (/(?:prodimage[_-]?\d+)/.test(value)) score -= 2;
    if (/(?:logo|icon|phone|contact|menu|facebook|instagram|whatsapp|youtube|telegram|social|share)/.test(value)) {
      score -= 6;
    }

    for (const token of tokens) {
      if (value.includes(token)) {
        score += 2;
        tokenHits += 1;
      }
    }

    if (tokenHits > 0) {
      score += Math.min(4, tokenHits);
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  if (!bestUrl || bestScore <= 0) {
    return null;
  }

  return bestUrl;
}

function buildStoreSearchQuery(record) {
  const artist = normalizeDisplayText(record && record.artist, { stripLeadingFormat: true });
  const album = normalizeDisplayText(record && record.album, { stripLeadingFormat: true })
    .replace(/\([^)]*\)/g, " ")
    .replace(PRICE_FRAGMENT_RE, " ")
    .replace(/[:\-]\s*\d{2,4}.*$/g, " ")
    .replace(PROMO_AND_STOCK_PREFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${artist} ${album}`.trim().slice(0, 120);
}

function getStoreBaseUrl(record) {
  const directUrl = getEnrichmentUrl(record);
  if (directUrl) {
    try {
      const parsed = new URL(directUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch (_error) {
      // Ignore parse failures and fallback to store mapping.
    }
  }

  const storeName = String(record.store_name || "").toLowerCase();
  const knownHosts = {
    beatnik: "https://www.beatnik.co.il",
    shablool: "https://shabloolrecords.co.il",
    "third ear": "https://third-ear.com",
    giora: "https://www.giorarecords.co.il",
    "the vinyl room": "https://thevinylroom.co.il",
    hasivoov: "https://hasivoov.co.il",
  };

  return knownHosts[storeName] || "";
}

function buildStoreSearchUrls(baseUrl, query) {
  const encoded = encodeURIComponent(query);
  return [
    `${baseUrl}/?s=${encoded}&post_type=product`,
    `${baseUrl}/?post_type=product&s=${encoded}`,
    `${baseUrl}/?s=${encoded}`,
    `${baseUrl}/search?q=${encoded}`,
  ];
}

function isThirdEarUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    return host === "third-ear.com" || host.endsWith(".third-ear.com");
  } catch (_error) {
    return false;
  }
}

async function fetchThirdEarOembedCoverFromUrl(url, options = {}) {
  if (!isThirdEarUrl(url)) {
    return null;
  }

  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);
  const cacheKey = `third-ear-oembed:${String(url).toLowerCase()}`;

  if (!bypassCache && enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const endpoint = `https://third-ear.com/wp-json/oembed/1.0/embed?url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      redirect: "follow",
      headers: ENRICH_HEADERS,
    });

    if (!res.ok) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const thumbnail = normalizeCoverUrl(data && data.thumbnail_url, url);
    if (thumbnail && isLikelyCoverUrl(thumbnail)) {
      enrichCache.set(cacheKey, thumbnail);
      return thumbnail;
    }

    enrichCache.set(cacheKey, null);
    return null;
  } catch (_error) {
    enrichCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildJinaBypassUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return "";
  }
  return `https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, "")}`;
}

async function fetchHtmlPage(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: ENRICH_HEADERS,
    });

    if (!res.ok) {
      return {
        ok: false,
        status: Number(res.status || 0) || null,
        html: "",
        final_url: res.url || url,
      };
    }

    return {
      ok: true,
      status: Number(res.status || 0) || null,
      html: await res.text(),
      final_url: res.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      html: "",
      final_url: url,
      error: error instanceof Error ? error.message : "fetch_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlWithFallback(url, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
  const useBypass = options.useBypass !== false;

  const attempts = [];
  const direct = await fetchHtmlPage(url, timeoutMs);
  attempts.push({
    ...direct,
    mode: "direct",
  });

  const shouldTryBypass =
    useBypass &&
    (!direct.ok || !direct.html || looksLikeBlockedHtml(direct.html));

  if (shouldTryBypass) {
    const bypassUrl = buildJinaBypassUrl(url);
    if (bypassUrl) {
      const bypass = await fetchHtmlPage(bypassUrl, timeoutMs + 1500);
      attempts.push({
        ...bypass,
        mode: "bypass",
      });
    }
  }

  return attempts;
}

async function fetchBeatnikCoverFromSearch(record) {
  const query = buildStoreSearchQuery(record);
  if (!query) {
    return null;
  }

  const cacheKey = `beatnik-search:${query.toLowerCase()}`;
  if (enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const searchUrl = `https://www.beatnik.co.il/?s=${encodeURIComponent(query)}&post_type=product`;
  const attempts = await fetchHtmlWithFallback(searchUrl, {
    timeoutMs: ENRICH_TIMEOUT_MS,
    useBypass: true,
  });

  for (const attempt of attempts) {
    if (!attempt.ok || !attempt.html) {
      continue;
    }

    const sourcePageUrl = attempt.mode === "bypass" ? searchUrl : attempt.final_url || searchUrl;
    const candidates = extractImageCandidatesFromHtml(attempt.html, sourcePageUrl);
    const selected = selectBestCoverCandidate(candidates, record, {
      referenceUrl: sourcePageUrl,
    });
    const cover = resolveUsableCoverUrl(selected, sourcePageUrl);
    if (cover) {
      enrichCache.set(cacheKey, cover);
      return cover;
    }
  }

  enrichCache.set(cacheKey, null);
  return null;
}

async function fetchCoverFromStoreSearch(record, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  const query = buildStoreSearchQuery(record);
  const baseUrl = getStoreBaseUrl(record);
  if (!query || !baseUrl) {
    return null;
  }

  const cacheKey = `store-search:${baseUrl}:${query.toLowerCase()}`;
  if (!bypassCache && enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const searchUrls = [...new Set(buildStoreSearchUrls(baseUrl, query))];

  for (const searchUrl of searchUrls) {
    const attempts = await fetchHtmlWithFallback(searchUrl, {
      timeoutMs,
      useBypass: true,
    });

    for (const attempt of attempts) {
      if (!attempt.ok || !attempt.html) {
        continue;
      }

      const sourcePageUrl = attempt.mode === "bypass" ? searchUrl : attempt.final_url || searchUrl;
      const candidates = extractImageCandidatesFromHtml(attempt.html, sourcePageUrl);
      const selected = selectBestCoverCandidate(candidates, record, {
        referenceUrl: sourcePageUrl,
      });
      const cover = resolveUsableCoverUrl(selected, sourcePageUrl);
      if (cover) {
        enrichCache.set(cacheKey, cover);
        return cover;
      }
    }
  }

  enrichCache.set(cacheKey, null);
  return null;
}

function extractPriceValue(html) {
  const patterns = [
    /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /"price"\s*:\s*"([0-9]{1,5}(?:[.,][0-9]{1,2})?)"/i,
    /woocommerce-Price-currencySymbol[^>]*>[^<]*<\/span>\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
    /<bdi>\s*(?:<span[^>]*>[^<]*<\/span>\s*)?([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*<\/bdi>/i,
    /(?:&#8362;|₪)\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const parsed = parseNumericPrice(match[1]);
      if (parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
}

function extractInStockValue(html) {
  const source = String(html || "");
  if (!source.trim()) {
    return null;
  }

  const schemaAvailabilityMatch = source.match(
    /"availability"\s*:\s*"https?:\/\/schema\.org\/(InStock|OutOfStock)"/i
  );
  if (schemaAvailabilityMatch && schemaAvailabilityMatch[1]) {
    return schemaAvailabilityMatch[1].toLowerCase() === "instock";
  }

  const metaAvailabilityMatch = source.match(
    /<meta[^>]*property=["']product:availability["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (metaAvailabilityMatch && metaAvailabilityMatch[1]) {
    const value = String(metaAvailabilityMatch[1]).toLowerCase();
    if (value.includes("outofstock") || value.includes("out_of_stock")) {
      return false;
    }
    if (value.includes("instock") || value.includes("in_stock")) {
      return true;
    }
  }

  const cleaned = source
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  // Prefer product-scoped stock classes before any loose text scanning.
  const mainProductClassMatch = cleaned.match(
    /<(?:div|article)[^>]*class=["']([^"']*\b(?:type-product|product)\b[^"']*)["'][^>]*>/i
  );
  if (mainProductClassMatch && mainProductClassMatch[1]) {
    const mainClasses = ` ${mainProductClassMatch[1].toLowerCase()} `;
    if (/\boutofstock\b/.test(mainClasses)) {
      return false;
    }
    if (/\binstock\b/.test(mainClasses)) {
      return true;
    }
  }

  const stockClassMatches = cleaned.matchAll(/class=["']([^"']+)["']/gi);
  for (const match of stockClassMatches) {
    const rawClasses = String(match && match[1] ? match[1] : "")
      .toLowerCase()
      .trim();
    if (!rawClasses) {
      continue;
    }

    const tokens = rawClasses.split(/\s+/).filter(Boolean);
    if (!tokens.includes("stock")) {
      continue;
    }

    if (tokens.includes("out-of-stock")) {
      return false;
    }
    if (tokens.includes("in-stock")) {
      return true;
    }
  }

  if (
    /single_add_to_cart_button/i.test(cleaned) &&
    !/(?:single_add_to_cart_button[^>]*\bdisabled\b|\bdisabled\b[^>]*single_add_to_cart_button)/i.test(
      cleaned
    )
  ) {
    return true;
  }

  const lowered = cleaned.toLowerCase();
  const outOfStockIndicators = [
    "out of stock",
    "sold out",
    "currently unavailable",
    "not available",
    "אזל מהמלאי",
    "אזל מן המלאי",
    "לא במלאי",
    "אין במלאי",
    "חסר במלאי",
  ];

  const inStockIndicators = [
    "in stock",
    "available now",
    "available for purchase",
    "במלאי",
    "זמין במלאי",
    "קיים במלאי",
  ];

  const hasOutOfStockIndicator = outOfStockIndicators.some((indicator) => lowered.includes(indicator));
  const hasInStockIndicator = inStockIndicators.some((indicator) => lowered.includes(indicator));

  if (hasInStockIndicator && !hasOutOfStockIndicator) {
    return true;
  }

  if (hasOutOfStockIndicator && !hasInStockIndicator) {
    return false;
  }

  if (/\b\d+\s*in\s*stock\b/i.test(source) || /\b\d+\s*במלאי\b/i.test(source)) {
    return true;
  }

  return null;
}

function getEnrichmentUrl(record) {
  if (record && typeof record.product_url === "string" && record.product_url.startsWith("http")) {
    return record.product_url;
  }

  if (record && typeof record.store_url === "string" && record.store_url.startsWith("http")) {
    return record.store_url;
  }

  return "";
}

async function fetchMetadataForUrl(url, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  if (!url) {
    return null;
  }

  if (!bypassCache && enrichCache.has(url)) {
    return enrichCache.get(url);
  }

  const manualMetadata = findManualMetadataByUrl(url);

  const attempts = await fetchHtmlWithFallback(url, {
    timeoutMs,
    useBypass: true,
  });

  let bestPayload = null;
  let blockedSignal = false;

  for (const attempt of attempts) {
    if (!attempt.ok || !attempt.html) {
      continue;
    }

    if (looksLikeBlockedHtml(attempt.html)) {
      blockedSignal = true;
      continue;
    }

    const sourceUrl = attempt.mode === "bypass" ? url : attempt.final_url || url;
    let coverUrl = resolveUsableCoverUrl(extractCoverUrl(attempt.html), sourceUrl);
    const price = extractPriceValue(attempt.html);
    const inStock = extractInStockValue(attempt.html);

    if (!coverUrl) {
      const candidates = extractImageCandidatesFromHtml(attempt.html, sourceUrl);
      const selected = selectBestCoverCandidate(candidates, options.record || { artist: "", album: "" }, {
        referenceUrl: sourceUrl,
      });
      coverUrl = resolveUsableCoverUrl(selected, sourceUrl);
    }

    const candidatePayload = {
      cover_url: coverUrl,
      price,
      in_stock: inStock,
    };

    bestPayload = mergeMetadataByScore(bestPayload, candidatePayload);

    if (metadataHasUsefulFields(bestPayload) && bestPayload.cover_url && bestPayload.price > 0) {
      break;
    }
  }

  if ((!bestPayload || !bestPayload.cover_url) && isThirdEarUrl(url)) {
    const thirdEarCover = await fetchThirdEarOembedCoverFromUrl(url, {
      timeoutMs,
      bypassCache,
    });
    if (thirdEarCover) {
      bestPayload = mergeMetadataByScore(bestPayload, {
        cover_url: thirdEarCover,
        price: 0,
        in_stock: null,
      });
    }
  }

  if (manualMetadata) {
    bestPayload = mergeMetadata(bestPayload || { cover_url: null, price: 0, in_stock: null }, manualMetadata);
  }

  if (!bestPayload || !metadataHasUsefulFields(bestPayload)) {
    // Avoid poisoning cache with challenge pages and transient anti-bot responses.
    if (blockedSignal) {
      return null;
    }

    if (manualMetadata && metadataHasUsefulFields(manualMetadata)) {
      enrichCache.set(url, manualMetadata);
      return manualMetadata;
    }

    enrichCache.set(url, null);
    return null;
  }

  bestPayload.cover_url = resolveUsableCoverUrl(bestPayload.cover_url, url);
  enrichCache.set(url, bestPayload);
  return bestPayload;
}

async function enrichMissingCoverFallback(record) {
  if (!record || hasCoverUrl(record)) {
    return;
  }

  const storeName = String(record.store_name || "").toLowerCase();
  const hasDirectProductUrl =
    typeof record.product_url === "string" && record.product_url.startsWith("http");
  if (storeName === "third ear") {
    const url = getEnrichmentUrl(record);
    if (url) {
      const thirdEarCover = await fetchThirdEarOembedCoverFromUrl(url);
      if (thirdEarCover) {
        record.cover_url = thirdEarCover;
        return;
      }
    }
  }

  if (storeName === "beatnik" && !hasDirectProductUrl) {
    const beatnikCover = await fetchBeatnikCoverFromSearch(record);
    if (beatnikCover) {
      record.cover_url = beatnikCover;
      return;
    }
  }

  if (!hasDirectProductUrl) {
    const fallbackCover = await fetchCoverFromStoreSearch(record);
    if (fallbackCover) {
      record.cover_url = fallbackCover;
      return;
    }
  }

  const itunesCover = await fetchItunesCover(record);
  if (itunesCover) {
    record.cover_url = itunesCover;
  }
}

function withGuaranteedCover(record) {
  const sourceUrl = getEnrichmentUrl(record);
  const normalized = resolveUsableCoverUrl(record.cover_url, sourceUrl);
  const normalizedInStock = normalizeInStock(record && record.in_stock);
  const cleanArtist = record.artist
    ? normalizeDisplayText(record.artist, { stripLeadingFormat: true }) || record.artist
    : record.artist;
  const cleanAlbum = record.album
    ? normalizeDisplayText(record.album, { stripLeadingFormat: true }) || record.album
    : record.album;
  return {
    ...record,
    artist: cleanArtist,
    album: cleanAlbum,
    in_stock: normalizedInStock,
    cover_url: normalized || null,
  };
}

async function enrichRecord(record, options = {}) {
  if (!record) {
    return;
  }

  const forceRefresh = Boolean(options.forceRefresh);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  if (!forceRefresh) {
    applyManualMetadataToRecord(record);
  }

  const hasPrice = Number(record.price || 0) > 0;
  const hasCover = hasCoverUrl(record);
  const hasInStock = normalizeInStock(record.in_stock) !== null;
  if (!forceRefresh && hasPrice && hasCover && hasInStock) {
    return;
  }

  const url = getEnrichmentUrl(record);
  if (!url) {
    await enrichMissingCoverFallback(record);
    return;
  }

  const metadata = await fetchMetadataForUrl(url, {
    timeoutMs,
    bypassCache,
    record,
  });
  if (!metadata) {
    await enrichMissingCoverFallback(record);
    return;
  }

  const metadataCover = resolveUsableCoverUrl(metadata.cover_url, url);
  if (metadataCover && (!hasCover || forceRefresh)) {
    record.cover_url = metadataCover;
  }

  if (metadata.price > 0 && (!hasPrice || forceRefresh || Number(record.price || 0) !== metadata.price)) {
    record.price = metadata.price;
  }

  const normalizedInStock = normalizeInStock(metadata.in_stock);
  if (normalizedInStock !== null) {
    record.in_stock = normalizedInStock;
  }

  if (!hasCoverUrl(record)) {
    await enrichMissingCoverFallback(record);
  }

  if (!record.product_url && url) {
    record.product_url = url;
  }
}

async function enrichSearchRecords(records) {
  const enrichmentPriority = (record) => {
    let score = 0;
    if (!hasCoverUrl(record)) {
      score += 4;
    }
    if (Number(record.price || 0) <= 0) {
      score += 3;
    }
    if (normalizeInStock(record.in_stock) === null) {
      score += 2;
    }
    if (getEnrichmentUrl(record)) {
      score += 1;
    }
    return score;
  };

  const queue = records
    .filter((record) => {
      return (
        !hasCoverUrl(record) ||
        Number(record.price || 0) <= 0 ||
        normalizeInStock(record.in_stock) === null
      );
    })
    .sort((a, b) => enrichmentPriority(b) - enrichmentPriority(a))
    .slice(0, ENRICH_MAX_ITEMS);

  if (queue.length === 0) {
    return;
  }

  let index = 0;

  const workers = Array.from(
    { length: Math.min(ENRICH_CONCURRENCY, queue.length) },
    async () => {
      while (index < queue.length) {
        const next = queue[index];
        index += 1;
        await enrichRecord(next);
      }
    }
  );

  await Promise.all(workers);
}

function scoreRecordForQuery(record, queryTerms, rawQuery) {
  const artistLower = toLowerSafe(record.artist);
  const albumLower = toLowerSafe(record.album);
  let score = 0;

  if (albumLower === rawQuery) score += 100;
  else if (albumLower.startsWith(rawQuery)) score += 50;
  if (artistLower === rawQuery) score += 40;
  else if (artistLower.startsWith(rawQuery)) score += 20;

  if (queryTerms.length > 0) {
    const albumHits = queryTerms.filter((t) => albumLower.includes(t)).length;
    const artistHits = queryTerms.filter((t) => artistLower.includes(t)).length;
    if (albumHits === queryTerms.length) score += 30;
    else score += Math.floor((albumHits / queryTerms.length) * 15);
    if (artistHits === queryTerms.length) score += 25;
    else score += Math.floor((artistHits / queryTerms.length) * 10);
  }

  if (hasCoverUrl(record)) score += 2;
  if (Number(record.price || 0) > 0) score += 1;
  if (normalizeInStock(record.in_stock) === true) score += 1;

  return score;
}

function applySearchFiltering(records, params, searchIndex, scoreMap) {
  let filtered = records;

  const q = (params.get("q") || "").trim();
  const genres = parseMultiValueParam(params, "genre");
  const source = (params.get("source") || "").trim();
  const storeFilters = parseMultiValueParam(params, "store_filter");
  const inStockParam = (params.get("in_stock") || "").trim().toLowerCase();
  const formats = parseMultiValueParam(params, "format");
  const priceMin = parseFloat(params.get("price_min") || params.get("pmin") || "");
  const priceMax = parseFloat(params.get("price_max") || params.get("pmax") || "");
  const yearMin = parseInt(params.get("year_min") || params.get("ymin") || "", 10);
  const yearMax = parseInt(params.get("year_max") || params.get("ymax") || "", 10);

  if (q) {
    const needle = q.toLowerCase();

    if (searchIndex && searchIndex.recordsRef === records) {
      const candidateIndexes = getIndexedQueryCandidateIndexes(searchIndex, needle);
      if (candidateIndexes && candidateIndexes.length > 0) {
        filtered = candidateIndexes.map((index) => records[index]).filter(Boolean);
      } else if (candidateIndexes && candidateIndexes.length === 0) {
        filtered = [];
      }
    }

    filtered = filtered.filter((item) => {
      return toLowerSafe(item.artist).includes(needle) || toLowerSafe(item.album).includes(needle);
    });
  }

  if (genres.length > 0) {
    const genreNeedles = genres.map((value) => value.toLowerCase());
    filtered = filtered.filter((item) => {
      const genreValue = toLowerSafe(item.genre);
      return genreNeedles.some((needle) => genreValue.includes(needle));
    });
  }

  if (storeFilters.length > 0) {
    const allowedStores = new Set(storeFilters.map((value) => value.toLowerCase()));
    filtered = filtered.filter((item) => allowedStores.has(String(item.store_name || "").toLowerCase()));
  } else if (source === "Discogs") {
    filtered = filtered.filter((item) => String(item.store_name || "") === "Discogs");
  } else if (source === "local") {
    filtered = filtered.filter((item) => String(item.store_name || "") !== "Discogs");
  }

  if (inStockParam === "1" || inStockParam === "true" || inStockParam === "yes") {
    filtered = filtered.filter((item) => normalizeInStock(item.in_stock) === true);
  } else if (inStockParam === "0" || inStockParam === "false" || inStockParam === "no") {
    filtered = filtered.filter((item) => normalizeInStock(item.in_stock) === false);
  }

  if (formats.length > 0) {
    const allowedFormats = new Set(formats.map((value) => value.toLowerCase()));
    filtered = filtered.filter((item) => allowedFormats.has((item.format || "").toLowerCase()));
  }

  if (!isNaN(priceMin)) {
    filtered = filtered.filter((item) => Number(item.price || 0) >= priceMin);
  }

  if (!isNaN(priceMax) && priceMax > 0) {
    filtered = filtered.filter((item) => Number(item.price || 0) <= priceMax);
  }

  if (!isNaN(yearMin) && yearMin > 0) {
    filtered = filtered.filter((item) => Number(item.year || 0) >= yearMin);
  }

  if (!isNaN(yearMax) && yearMax > 0) {
    filtered = filtered.filter((item) => Number(item.year || 0) <= yearMax);
  }

  if (q && scoreMap instanceof Map) {
    const needle = q.toLowerCase();
    const queryTerms = parseQueryTerms(needle);
    for (const item of filtered) {
      scoreMap.set(String(item.id), scoreRecordForQuery(item, queryTerms, needle));
    }
  }

  return filtered;
}

function applySorting(records, params, scoreMap) {
  const sort = (params.get("sort") || params.get("sort_by") || "").toLowerCase();
  if (sort === "price_asc") {
    return [...records].sort((a, b) => {
      const pa = Number(a.price || 0);
      const pb = Number(b.price || 0);
      if (pa === pb) return 0;
      if (pa === 0) return 1;
      if (pb === 0) return -1;
      return pa - pb;
    });
  }
  if (sort === "price_desc") {
    return [...records].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }
  if (sort === "year_desc") {
    return [...records].sort((a, b) => {
      const ya = Number(a.year || 0), yb = Number(b.year || 0);
      if (!ya && !yb) return 0;
      if (!ya) return 1;
      if (!yb) return -1;
      return yb - ya;
    });
  }
  if (sort === "year_asc") {
    return [...records].sort((a, b) => {
      const ya = Number(a.year || 0), yb = Number(b.year || 0);
      if (!ya && !yb) return 0;
      if (!ya) return 1;
      if (!yb) return -1;
      return ya - yb;
    });
  }
  if (sort === "in_stock") {
    return [...records].sort((a, b) => {
      const ia = normalizeInStock(a.in_stock) === true ? 0 : 1;
      const ib = normalizeInStock(b.in_stock) === true ? 0 : 1;
      return ia - ib;
    });
  }
  if (sort === "relevance" && scoreMap instanceof Map && scoreMap.size > 0) {
    return [...records].sort((a, b) =>
      (scoreMap.get(String(b.id)) || 0) - (scoreMap.get(String(a.id)) || 0)
    );
  }
  return records; // default: keep insertion order (newest first in data)
}

function buildSearchRecordDedupeKey(record) {
  const productUrlKey = normalizeManualLookupUrl(record && record.product_url);
  if (productUrlKey) {
    return `product:${productUrlKey}`;
  }

  const storeName = toLowerSafe(record && record.store_name);
  const artist = normalizeDisplayText(record && record.artist, {
    stripLeadingFormat: true,
  }).toLowerCase();
  const album = normalizeDisplayText(record && record.album, {
    stripLeadingFormat: true,
  }).toLowerCase();

  if (storeName && (artist || album)) {
    return `text:${storeName}|${artist}|${album}`;
  }

  return `id:${String(record && record.id ? record.id : "")}`;
}

function scoreSearchRecordForDedupe(record) {
  if (!record) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (hasCoverUrl(record)) {
    score += 4;
  }
  if (Number(record.price || 0) > 0) {
    score += 3;
  }

  const inStock = normalizeInStock(record.in_stock);
  if (inStock === true) {
    score += 2;
  } else if (inStock === false) {
    score += 1;
  }

  if (String(record.product_url || "").startsWith("http")) {
    score += 2;
  }
  if (normalizeDisplayText(record.artist, { stripLeadingFormat: true })) {
    score += 1;
  }
  if (normalizeDisplayText(record.album, { stripLeadingFormat: true })) {
    score += 1;
  }

  return score;
}

function dedupeSearchRecords(records) {
  if (!Array.isArray(records) || records.length <= 1) {
    return records;
  }

  const order = [];
  const selectedByKey = new Map();
  const scoreByKey = new Map();

  for (const record of records) {
    const key = buildSearchRecordDedupeKey(record);
    const score = scoreSearchRecordForDedupe(record);

    if (!selectedByKey.has(key)) {
      order.push(key);
      selectedByKey.set(key, record);
      scoreByKey.set(key, score);
      continue;
    }

    const existingScore = scoreByKey.get(key) || Number.NEGATIVE_INFINITY;
    if (score > existingScore) {
      selectedByKey.set(key, record);
      scoreByKey.set(key, score);
    }
  }

  return order.map((key) => selectedByKey.get(key)).filter(Boolean);
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

async function handleSearch(snapshot, params, event) {
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
      }, event);
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
    }, event);
  }

  let page = parseIntParam(params.get("page"), 1, "page");
  let perPage = parseIntParam(params.get("per_page"), 50, "per_page");

  if (page < 1) {
    page = 1;
  }
  perPage = clampPerPage(perPage);

  const scoreMap = new Map();
  const filtered = applySorting(
    dedupeSearchRecords(
      applySearchFiltering(snapshot.searchRecordsRenderable, params, snapshot.searchIndex, scoreMap)
    ),
    params,
    scoreMap
  );
  const total = filtered.length;
  const offset = (page - 1) * perPage;
  const pageItems = filtered.slice(offset, offset + perPage);
  for (const record of pageItems) {
    applyManualMetadataToRecord(record);
  }
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  const explicitEnrichOptIn = params.get("enrich") === "1";
  const explicitSkipEnrichment =
    params.get("enrich") === "0" || params.get("no_enrich") === "1";
  const autoSkipForInteractiveQuery = q.length > 0 && !explicitEnrichOptIn;
  const skipEnrichment = explicitSkipEnrichment || autoSkipForInteractiveQuery;
  if (!skipEnrichment && pageItems.length > 0) {
    await enrichSearchRecords(pageItems);
  }

  const outputRecords = pageItems.map((record) => withGuaranteedCover(record));

  return response(200, {
    records: outputRecords,
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  }, event);
}

async function handleRecord(snapshot, params, event) {
  const id = (params.get("id") || "").trim();
  if (!id) {
    return response(400, { error: "Missing id parameter" }, event);
  }

  const record = snapshot.recordsRenderable.find((item) => String(item.id) === id);
  if (!record) {
    if (snapshot.quarantinedIds && snapshot.quarantinedIds.has(id)) {
      return response(404, {
        error: `Record not found: ${id}`,
        reason: "record_quarantined_by_integrity_policy",
      }, event);
    }
    return response(404, { error: `Record not found: ${id}` }, event);
  }

  applyManualMetadataToRecord(record);

  const forceRefresh = params.get("refresh") === "1";

  await enrichRecord(record, {
    forceRefresh,
    bypassCache: forceRefresh,
  });

  if (!hasCoverUrl(record)) {
    const url = getEnrichmentUrl(record);
    if (url) {
      const metadata = await fetchMetadataForUrl(url, {
        timeoutMs: 8000,
        bypassCache: true,
        record,
      });
      const metadataCover = resolveUsableCoverUrl(metadata && metadata.cover_url, url);
      if (metadataCover) {
        record.cover_url = metadataCover;
      }
      if (metadata && Number(record.price || 0) <= 0 && metadata.price > 0) {
        record.price = metadata.price;
      }
    }
  }

  if (!hasCoverUrl(record)) {
    const hasDirectProductUrl =
      typeof record.product_url === "string" && record.product_url.startsWith("http");
    if (!hasDirectProductUrl) {
      const fallbackCover = await fetchCoverFromStoreSearch(record, {
        timeoutMs: 8000,
        bypassCache: true,
      });
      if (fallbackCover) {
        record.cover_url = fallbackCover;
      }
    }
  }

  if (!hasCoverUrl(record)) {
    const itunesCover = await fetchItunesCover(record, {
      timeoutMs: 4000,
      bypassCache: true,
    });
    if (itunesCover) {
      record.cover_url = itunesCover;
    }
  }

  const searchRecord = snapshot.searchRecordsRenderable.find((item) => String(item.id) === id);
  if (searchRecord) {
    if (hasCoverUrl(record)) {
      searchRecord.cover_url = record.cover_url;
    }
    if (Number(record.price || 0) > 0) {
      searchRecord.price = record.price;
    }
    const normalizedInStock = normalizeInStock(record.in_stock);
    if (normalizedInStock !== null) {
      searchRecord.in_stock = normalizedInStock;
    }
    if (!searchRecord.product_url && record.product_url) {
      searchRecord.product_url = record.product_url;
    }
  }

  return response(200, {
    record: withGuaranteedCover(record),
  }, event);
}

function handleAllRecords(snapshot, params, event) {
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

  const total = snapshot.recordsRenderable.length;
  const offset = (page - 1) * perPage;
  const records = snapshot.recordsRenderable
    .slice(offset, offset + perPage)
    .map((record) => {
      applyManualMetadataToRecord(record);
      return withGuaranteedCover(record);
    });
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  return response(200, {
    total_records: total,
    total_catalog_records: snapshot.records.length,
    quarantined_records: Math.max(0, snapshot.records.length - snapshot.recordsRenderable.length),
    page,
    per_page: perPage,
    total_pages: totalPages,
    records,
  }, event);
}

function handleBatchRecords(snapshot, params, event) {
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

  const recordsById = new Map(
    snapshot.recordsRenderable.map((r) => [String(r.id), r])
  );

  const found = [];
  for (const id of requestedIds) {
    const record = recordsById.get(id);
    if (record) {
      applyManualMetadataToRecord(record);
      found.push(withGuaranteedCover(record));
    }
  }

  return response(200, { records: found, total: found.length }, event);
}

function handleSuggest(snapshot, params, event) {
  const q = (params.get("q") || "").trim().toLowerCase();
  const limit = Math.min(10, Math.max(1, parseInt(params.get("limit") || "8", 10) || 8));

  if (q.length < 2) {
    return response(200, { suggestions: [] }, event);
  }

  const searchIndex = snapshot.searchIndex;
  if (!searchIndex || !searchIndex.tokenKeys) {
    return response(200, { suggestions: [] }, event);
  }

  const [lo, hi] = findPrefixRange(searchIndex.tokenKeys, q);
  const candidateSet = new Set();
  for (let i = lo; i < hi && candidateSet.size < 500; i++) {
    const list = searchIndex.tokenToIndexes.get(searchIndex.tokenKeys[i]) || [];
    for (const idx of list) candidateSet.add(idx);
  }

  const seen = new Set();
  const suggestions = [];

  for (const idx of candidateSet) {
    const record = snapshot.searchRecordsRenderable[idx];
    if (!record) continue;
    const artistLower = toLowerSafe(record.artist);
    if (artistLower.includes(q) && record.artist && !seen.has(record.artist)) {
      seen.add(record.artist);
      suggestions.push({ type: "artist", value: record.artist });
      if (suggestions.length >= limit) break;
    }
  }

  for (const idx of candidateSet) {
    if (suggestions.length >= limit) break;
    const record = snapshot.searchRecordsRenderable[idx];
    if (!record) continue;
    const albumLower = toLowerSafe(record.album);
    if (albumLower.includes(q) && record.album && !seen.has(record.album)) {
      seen.add(record.album);
      suggestions.push({ type: "album", value: record.album });
    }
  }

  return response(200, { suggestions }, event);
}

exports.handler = async (event) => {
  try {
    const method = String(event && event.httpMethod ? event.httpMethod : "GET").toUpperCase();
    if (method === "OPTIONS") {
      return response(204, null, event);
    }

    const snapshot = await loadSnapshot();
    const apiPath = getApiPath(event);
    const endpoint = apiPath.replace(/^\/api\/?/, "");

    const params = getQueryParams(event);

    if (endpoint === "" || endpoint === "health") {
      return response(200, {
        ok: true,
        records: snapshot.recordsRenderable.length,
        total_catalog_records: snapshot.records.length,
        quarantined_records: Math.max(0, snapshot.records.length - snapshot.recordsRenderable.length),
        stores: snapshot.stores.length,
        genres: snapshot.genres.length,
        manual_enrichment: snapshot.manualEnrichment || null,
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

    if (endpoint === "link-health") {
      return await handleLinkHealth(params, event);
    }

    if (endpoint === "record") {
      return await handleRecord(snapshot, params, event);
    }

    if (endpoint === "all-records") {
      return handleAllRecords(snapshot, params, event);
    }

    if (endpoint === "search") {
      return await handleSearch(snapshot, params, event);
    }

    if (endpoint === "records") {
      return handleBatchRecords(snapshot, params, event);
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
