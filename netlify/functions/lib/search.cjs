"use strict";

/**
 * The search engine: inverted index, candidate retrieval, term-wise
 * verification, filtering, ranking, sorting, dedupe, and suggestions.
 *
 * Query-time guarantees:
 *  - no network I/O
 *  - no mutation of snapshot records
 *  - all string normalization happens once (build time / load time),
 *    never per record per request
 */

const {
  toSearchable,
  buildSearchTokens,
  parseQueryTerms,
  normalizeInStock,
  normalizeDisplayText,
  toLowerSafe,
} = require("./text.cjs");
const { normalizeManualLookupUrl } = require("./urls.cjs");
const { hasCoverUrl } = require("./covers.cjs");

/** Small bounded LRU used for query-result caching. */
class LruCache {
  constructor(maxEntries) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 1);
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) {
      return undefined;
    }
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, value);
  }

  clear() {
    this.map.clear();
  }
}

/**
 * Per-record precomputed searchable fields, parallel to the records array.
 * Computed once at snapshot load; the hot path only reads plain strings
 * and numbers from here.
 */
function buildSearchMeta(records) {
  const meta = new Array(records.length);
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] || {};
    const artistCmp = toSearchable(record.artist);
    const albumCmp = toSearchable(record.album);
    meta[i] = {
      artistCmp,
      albumCmp,
      haystack: artistCmp && albumCmp ? `${artistCmp} ${albumCmp}` : artistCmp || albumCmp,
      genreLc: toLowerSafe(record.genre),
      storeLc: toLowerSafe(record.store_name),
      formatLc: toLowerSafe(record.format),
      price: Number(record.price || 0),
      year: Number(record.year || 0),
      inStock: normalizeInStock(record.in_stock),
      hasCover: hasCoverUrl(record),
    };
  }
  return meta;
}

/** Builds the inverted index: token → ascending array of record indexes. */
function buildInvertedIndex(records) {
  const tokenToIndexes = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] || {};
    const tokens = new Set(buildSearchTokens(`${record.artist || ""} ${record.album || ""}`));
    for (const token of tokens) {
      let posting = tokenToIndexes.get(token);
      if (!posting) {
        posting = [];
        tokenToIndexes.set(token, posting);
      }
      posting.push(index);
    }
  }

  return tokenToIndexes;
}

function buildSearchIndex(records) {
  const tokenToIndexes = buildInvertedIndex(records);
  return {
    recordsRef: records,
    tokenToIndexes,
    tokenKeys: [...tokenToIndexes.keys()].sort(),
  };
}

/** Reconstructs a search index from the serialized bundle form. */
function searchIndexFromSerialized(records, serialized) {
  const tokenToIndexes = new Map(Object.entries(serialized || {}));
  return {
    recordsRef: records,
    tokenToIndexes,
    tokenKeys: [...tokenToIndexes.keys()].sort(),
  };
}

function serializeSearchIndex(searchIndex) {
  return Object.fromEntries(searchIndex.tokenToIndexes.entries());
}

/** Binary search for the [start, end) range of keys sharing a prefix. */
function findPrefixRange(sortedKeys, prefix) {
  let lo = 0;
  let hi = sortedKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedKeys[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  const upperBound = prefix + "￿";
  lo = start;
  hi = sortedKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedKeys[mid] < upperBound) lo = mid + 1;
    else hi = mid;
  }
  return [start, lo];
}

const MAX_PREFIX_EXPANSION_KEYS = 2000;

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

/**
 * Candidate record indexes for a term list: exact posting when available,
 * bounded prefix expansion otherwise (so partially-typed words match).
 * Returns null when the index cannot answer (no terms), [] when the index
 * proves there are no matches.
 */
function getCandidateIndexes(searchIndex, terms) {
  if (!searchIndex || !Array.isArray(terms) || terms.length === 0) {
    return null;
  }

  const postingLists = [];
  for (const term of terms) {
    let posting = searchIndex.tokenToIndexes.get(term);
    if (!posting) {
      const [lo, hi] = findPrefixRange(searchIndex.tokenKeys, term);
      const boundedHi = Math.min(hi, lo + MAX_PREFIX_EXPANSION_KEYS);
      const prefixLists = [];
      for (let i = lo; i < boundedHi; i += 1) {
        const list = searchIndex.tokenToIndexes.get(searchIndex.tokenKeys[i]);
        if (list) prefixLists.push(list);
      }
      posting = mergePostingLists(prefixLists);
    }

    if (!posting || posting.length === 0) {
      return [];
    }
    postingLists.push(posting);
  }

  postingLists.sort((a, b) => a.length - b.length);

  let candidates = new Set(postingLists[0]);
  for (let i = 1; i < postingLists.length && candidates.size > 0; i += 1) {
    const nextSet = new Set(postingLists[i]);
    const intersected = new Set();
    for (const index of candidates) {
      if (nextSet.has(index)) {
        intersected.add(index);
      }
    }
    candidates = intersected;
  }

  return [...candidates].sort((a, b) => a - b);
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

/**
 * Relevance score for a record against a query. `fields` carries the
 * precomputed searchable artist/album strings; when absent (unit tests,
 * legacy callers) they are computed on the fly.
 */
function scoreRecordForQuery(record, queryTerms, rawQuery, fields) {
  const artistCmp = fields ? fields.artistCmp : toSearchable(record.artist);
  const albumCmp = fields ? fields.albumCmp : toSearchable(record.album);
  const queryCmp = toSearchable(rawQuery);
  let score = 0;

  if (albumCmp === queryCmp) score += 100;
  else if (albumCmp.startsWith(queryCmp)) score += 50;
  if (artistCmp === queryCmp) score += 40;
  else if (artistCmp.startsWith(queryCmp)) score += 20;

  if (queryTerms.length > 0) {
    let albumHits = 0;
    let artistHits = 0;
    for (const term of queryTerms) {
      if (albumCmp.includes(term)) albumHits += 1;
      if (artistCmp.includes(term)) artistHits += 1;
    }
    if (albumHits === queryTerms.length) score += 30;
    else score += Math.floor((albumHits / queryTerms.length) * 15);
    if (artistHits === queryTerms.length) score += 25;
    else score += Math.floor((artistHits / queryTerms.length) * 10);
  }

  const hasCover = fields ? fields.hasCover : hasCoverUrl(record);
  if (hasCover) score += 2;
  if (Number(record.price || 0) > 0) score += 1;
  if (normalizeInStock(record.in_stock) === true) score += 1;

  return score;
}

/**
 * Applies query + all filters. `context` (optional) provides { searchIndex,
 * meta } for the indexed fast path; without it the function degrades to a
 * scan, which keeps it usable against arbitrary record arrays in tests.
 *
 * When `scoreMap` is provided and a query is present, relevance scores are
 * recorded for every surviving record.
 */
function applySearchFiltering(records, params, context, scoreMap) {
  const searchIndex =
    context && context.searchIndex && context.searchIndex.recordsRef === records
      ? context.searchIndex
      : null;
  const meta = context && Array.isArray(context.meta) && context.meta.length === records.length
    ? context.meta
    : null;

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

  const terms = q ? parseQueryTerms(q) : [];

  // Candidate selection: indexed retrieval when possible, full scan otherwise.
  let candidateIndexes = null;
  if (terms.length > 0 && searchIndex) {
    candidateIndexes = getCandidateIndexes(searchIndex, terms);
  }
  if (candidateIndexes === null) {
    candidateIndexes = records.map((_, index) => index);
  }

  const haystackFor = (index) => {
    if (meta) {
      return meta[index].haystack;
    }
    const record = records[index] || {};
    return toSearchable(`${record.artist || ""} ${record.album || ""}`);
  };

  const genreNeedles = genres.map((value) => value.toLowerCase());
  const allowedStores = storeFilters.length > 0
    ? new Set(storeFilters.map((value) => value.toLowerCase()))
    : null;
  const allowedFormats = formats.length > 0
    ? new Set(formats.map((value) => value.toLowerCase()))
    : null;
  const wantInStock =
    inStockParam === "1" || inStockParam === "true" || inStockParam === "yes"
      ? true
      : inStockParam === "0" || inStockParam === "false" || inStockParam === "no"
        ? false
        : null;

  const filtered = [];
  const filteredFields = scoreMap instanceof Map && terms.length > 0 ? [] : null;

  for (const index of candidateIndexes) {
    const record = records[index];
    if (!record) continue;

    // Term-wise verification: every term must appear somewhere in the
    // combined artist+album text. (Terms may span fields — "pink floyd
    // animals" matches artist "Pink Floyd", album "Animals".)
    if (terms.length > 0) {
      const haystack = haystackFor(index);
      let allMatch = true;
      for (const term of terms) {
        if (!haystack.includes(term)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) continue;
    }

    const fields = meta ? meta[index] : null;
    const genreLc = fields ? fields.genreLc : toLowerSafe(record.genre);
    const storeLc = fields ? fields.storeLc : toLowerSafe(record.store_name);
    const formatLc = fields ? fields.formatLc : toLowerSafe(record.format);
    const price = fields ? fields.price : Number(record.price || 0);
    const year = fields ? fields.year : Number(record.year || 0);
    const inStock = fields ? fields.inStock : normalizeInStock(record.in_stock);

    if (genreNeedles.length > 0) {
      let genreOk = false;
      for (const needle of genreNeedles) {
        if (genreLc.includes(needle)) {
          genreOk = true;
          break;
        }
      }
      if (!genreOk) continue;
    }

    if (allowedStores) {
      if (!allowedStores.has(storeLc)) continue;
    } else if (source === "Discogs") {
      if (String(record.store_name || "") !== "Discogs") continue;
    } else if (source === "local") {
      if (String(record.store_name || "") === "Discogs") continue;
    }

    if (wantInStock !== null && inStock !== wantInStock) continue;
    if (allowedFormats && !allowedFormats.has(formatLc)) continue;
    if (!Number.isNaN(priceMin) && price < priceMin) continue;
    if (!Number.isNaN(priceMax) && priceMax > 0 && price > priceMax) continue;
    if (!Number.isNaN(yearMin) && yearMin > 0 && year < yearMin) continue;
    if (!Number.isNaN(yearMax) && yearMax > 0 && year > yearMax) continue;

    filtered.push(record);
    if (filteredFields) {
      filteredFields.push(fields);
    }
  }

  if (scoreMap instanceof Map && terms.length > 0) {
    for (let i = 0; i < filtered.length; i += 1) {
      const record = filtered[i];
      scoreMap.set(
        String(record.id),
        scoreRecordForQuery(record, terms, q, filteredFields ? filteredFields[i] : null)
      );
    }
  }

  return filtered;
}

/**
 * Sorts filtered results. When a query produced relevance scores and no
 * explicit sort was requested, relevance wins — search results should
 * never default to ingestion order.
 */
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
  if (sort === "year_desc" || sort === "year_asc") {
    const direction = sort === "year_desc" ? -1 : 1;
    return [...records].sort((a, b) => {
      const ya = Number(a.year || 0);
      const yb = Number(b.year || 0);
      if (!ya && !yb) return 0;
      if (!ya) return 1;
      if (!yb) return -1;
      return (ya - yb) * direction;
    });
  }
  if (sort === "in_stock") {
    return [...records].sort((a, b) => {
      const ia = normalizeInStock(a.in_stock) === true ? 0 : 1;
      const ib = normalizeInStock(b.in_stock) === true ? 0 : 1;
      return ia - ib;
    });
  }

  const hasScores = scoreMap instanceof Map && scoreMap.size > 0;
  const wantsRelevance = sort === "relevance" || (!sort && hasScores);

  if (wantsRelevance && hasScores) {
    return [...records].sort(
      (a, b) => (scoreMap.get(String(b.id)) || 0) - (scoreMap.get(String(a.id)) || 0)
    );
  }

  return records; // no query, no explicit sort: keep snapshot order
}

function buildSearchRecordDedupeKey(record) {
  const productUrlKey = normalizeManualLookupUrl(record && record.product_url);
  if (productUrlKey) {
    return `product:${productUrlKey}`;
  }

  const storeName = toLowerSafe(record && record.store_name);
  const artist = normalizeDisplayText(record && record.artist, { stripLeadingFormat: true }).toLowerCase();
  const album = normalizeDisplayText(record && record.album, { stripLeadingFormat: true }).toLowerCase();

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
  if (hasCoverUrl(record)) score += 4;
  if (Number(record.price || 0) > 0) score += 3;

  const inStock = normalizeInStock(record.in_stock);
  if (inStock === true) score += 2;
  else if (inStock === false) score += 1;

  if (String(record.product_url || "").startsWith("http")) score += 2;
  if (normalizeDisplayText(record.artist, { stripLeadingFormat: true })) score += 1;
  if (normalizeDisplayText(record.album, { stripLeadingFormat: true })) score += 1;

  return score;
}

/**
 * Collapses duplicate listings (same product URL, or same store+title),
 * keeping the richest record. Runs at build time only.
 */
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

    if (score > (scoreByKey.get(key) ?? Number.NEGATIVE_INFINITY)) {
      selectedByKey.set(key, record);
      scoreByKey.set(key, score);
    }
  }

  return order.map((key) => selectedByKey.get(key)).filter(Boolean);
}

const MAX_SUGGEST_CANDIDATES = 500;

/** Typeahead suggestions from the token index: artists first, then albums. */
function buildSuggestions(records, searchIndex, rawQuery, limit) {
  const q = toSearchable(rawQuery);
  if (q.length < 2 || !searchIndex || !searchIndex.tokenKeys) {
    return [];
  }

  const [lo, hi] = findPrefixRange(searchIndex.tokenKeys, q.split(" ")[0]);
  const candidateSet = new Set();
  for (let i = lo; i < hi && candidateSet.size < MAX_SUGGEST_CANDIDATES; i += 1) {
    const list = searchIndex.tokenToIndexes.get(searchIndex.tokenKeys[i]) || [];
    for (const idx of list) {
      candidateSet.add(idx);
      if (candidateSet.size >= MAX_SUGGEST_CANDIDATES) break;
    }
  }

  const seen = new Set();
  const suggestions = [];

  for (const idx of candidateSet) {
    const record = records[idx];
    if (!record) continue;
    if (record.artist && toSearchable(record.artist).includes(q) && !seen.has(record.artist)) {
      seen.add(record.artist);
      suggestions.push({ type: "artist", value: record.artist });
      if (suggestions.length >= limit) return suggestions;
    }
  }

  for (const idx of candidateSet) {
    if (suggestions.length >= limit) break;
    const record = records[idx];
    if (!record) continue;
    if (record.album && toSearchable(record.album).includes(q) && !seen.has(record.album)) {
      seen.add(record.album);
      suggestions.push({ type: "album", value: record.album });
    }
  }

  return suggestions;
}

function computeGenresFromRecords(records) {
  const seen = new Set();
  for (const r of records) {
    const g = String(r.genre || "").trim();
    if (g.length > 1) seen.add(g);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "he"));
}

module.exports = {
  LruCache,
  buildSearchMeta,
  buildSearchIndex,
  searchIndexFromSerialized,
  serializeSearchIndex,
  findPrefixRange,
  getCandidateIndexes,
  parseMultiValueParam,
  scoreRecordForQuery,
  applySearchFiltering,
  applySorting,
  buildSearchRecordDedupeKey,
  dedupeSearchRecords,
  buildSuggestions,
  computeGenresFromRecords,
};
