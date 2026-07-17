"use strict";

/**
 * Manual enrichment index: metadata (cover/price/stock) extracted from an
 * archived HTML crawl, keyed by canonical product URL.
 *
 * At build time the bundle builder applies it to every search record once.
 * At runtime it is only loaded lazily for record-detail requests.
 */

const fs = require("fs");
const path = require("path");

const { normalizeInStock, parseNumericPrice } = require("./text.cjs");
const { resolveUsableCoverUrl, normalizeCoverUrl, hasCoverUrl } = require("./covers.cjs");
const {
  getEnrichmentUrl,
  buildManualLookupKeys,
  normalizeManualLookupKey,
} = require("./urls.cjs");

const MANUAL_ENRICHMENT_INDEX_FILE = "manual_enrichment_index.json";

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
  if (resolveUsableCoverUrl(metadata && metadata.cover_url)) score += 4;
  if (parseNumericPrice(metadata && metadata.price) > 0) score += 3;
  if (normalizeInStock(metadata && metadata.in_stock) !== null) score += 2;
  return score;
}

function mergeMetadataByScore(existing, candidate) {
  if (!existing) return candidate;
  if (!candidate) return existing;

  const preferred = scoreMetadata(candidate) > scoreMetadata(existing) ? candidate : existing;
  const secondary = preferred === candidate ? existing : candidate;
  return mergeMetadata(preferred, secondary);
}

/**
 * Builds the lookup Map from the raw index payload.
 * Exposed separately so the build script can pass an already-parsed payload.
 */
function buildLookupFromPayload(payload) {
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
      lookup.set(key, mergeMetadataByScore(lookup.get(key), metadata));
    }
  }

  return {
    generated_at: typeof (payload && payload.generated_at) === "string" ? payload.generated_at : null,
    entries: rows.length,
    lookup,
  };
}

let lookupCache = null;

/** Lazily loads and caches the manual index from the data directory. */
async function loadManualEnrichmentLookup(dataDir) {
  if (lookupCache) {
    return lookupCache;
  }

  const empty = { generated_at: null, entries: 0, lookup: new Map() };
  const filePath = path.join(dataDir, MANUAL_ENRICHMENT_INDEX_FILE);

  try {
    const text = await fs.promises.readFile(filePath, "utf8");
    lookupCache = buildLookupFromPayload(JSON.parse(text));
  } catch (_error) {
    lookupCache = empty;
  }

  return lookupCache;
}

function findManualMetadataInLookup(url, lookup) {
  if (!url || !lookup || lookup.size === 0) {
    return null;
  }

  for (const lookupKey of buildManualLookupKeys(url)) {
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

  for (const candidateUrl of candidateUrls) {
    const metadata = findManualMetadataInLookup(candidateUrl, lookup);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

/**
 * Fills missing cover/price/stock on a record from the manual index.
 * Only fills gaps — never overwrites live or scraped values.
 */
function applyManualMetadataToRecord(record, lookup) {
  if (!record) {
    return false;
  }

  const metadata = findManualMetadataForRecord(record, lookup);
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
    record.price_source = record.price_source || "manual_index";
    changed = true;
  }

  if (normalizeInStock(record.in_stock) === null && normalizeInStock(metadata.in_stock) !== null) {
    record.in_stock = normalizeInStock(metadata.in_stock);
    changed = true;
  }

  if (!record.product_url && typeof record.store_url === "string" && record.store_url.startsWith("http")) {
    record.product_url = record.store_url;
  }

  return changed;
}

module.exports = {
  MANUAL_ENRICHMENT_INDEX_FILE,
  metadataHasUsefulFields,
  mergeMetadata,
  mergeMetadataByScore,
  buildLookupFromPayload,
  loadManualEnrichmentLookup,
  findManualMetadataInLookup,
  findManualMetadataForRecord,
  applyManualMetadataToRecord,
};
