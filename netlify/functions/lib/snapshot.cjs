"use strict";

/**
 * Snapshot loading.
 *
 * Fast path: `search_bundle.json` — records already normalized, hydrated,
 * deduped, and indexed at build time (scripts/build_search_bundle.cjs).
 * Cold start is a single JSON.parse plus Map construction.
 *
 * Legacy path (bundle absent, e.g. fresh dev checkout): rebuilds the same
 * artifacts at load time from search_records.json using the shared lib
 * code, so behavior is identical either way.
 *
 * The full detail catalog (records.json, ~48MB) is loaded lazily and only
 * for detail endpoints — search requests never pay for it.
 */

const fs = require("fs");
const path = require("path");

const {
  normalizeRecordTextFields,
  normalizeInStock,
} = require("./text.cjs");
const { resolveUsableCoverUrl } = require("./covers.cjs");
const { getEnrichmentUrl } = require("./urls.cjs");
const {
  loadManualEnrichmentLookup,
  applyManualMetadataToRecord,
} = require("./manual_index.cjs");
const {
  buildSearchIndex,
  searchIndexFromSerialized,
  buildSearchMeta,
  dedupeSearchRecords,
  computeGenresFromRecords,
} = require("./search.cjs");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const SEARCH_BUNDLE_FILE = "search_bundle.json";

async function readJsonFileAsync(fileName) {
  const text = await fs.promises.readFile(path.join(DATA_DIR, fileName), "utf8");
  return JSON.parse(text);
}

async function readJsonFileIfExists(fileName) {
  try {
    const text = await fs.promises.readFile(path.join(DATA_DIR, fileName), "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toIdSet(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }
  return new Set(values.map((value) => String(value || "")).filter(Boolean));
}

/**
 * Canonical response projection, applied ONCE per record at load/build
 * time: numeric price, tri-state stock, resolved-or-null cover.
 */
function projectRecordInPlace(record) {
  record.price = Number(record.price || 0) || 0;
  record.in_stock = normalizeInStock(record.in_stock);
  record.cover_url = resolveUsableCoverUrl(record.cover_url, getEnrichmentUrl(record)) || null;
  return record;
}

let snapshotCache = null;
let snapshotCachePromise = null;

async function buildSnapshot() {
  const [bundle, stores, rawGenres, databaseInfo, snapshotMeta, recordIntegrity] = await Promise.all([
    readJsonFileIfExists(SEARCH_BUNDLE_FILE),
    readJsonFileAsync("stores.json"),
    readJsonFileIfExists("genres.json"),
    readJsonFileAsync("database_info.json"),
    readJsonFileIfExists("snapshot_meta.json"),
    readJsonFileIfExists("record_integrity.json"),
  ]);

  const quarantinedIds = toIdSet(recordIntegrity && recordIntegrity.quarantined_ids);

  let searchRecords;
  let searchIndex;
  let bundleMeta = null;

  if (bundle && Array.isArray(bundle.records) && bundle.index) {
    // Fast path: everything precomputed at build time.
    searchRecords = bundle.records;
    searchIndex = searchIndexFromSerialized(searchRecords, bundle.index);
    bundleMeta = {
      generated_at: bundle.generated_at || null,
      version: Number(bundle.version || 1),
      source: bundle.source || null,
      hydration: bundle.hydration || null,
      price_provenance: bundle.price_provenance || null,
    };
  } else {
    // Legacy path: rebuild bundle artifacts in memory.
    const rawSearchRecords =
      (await readJsonFileIfExists("search_records.json")) ||
      (await readJsonFileAsync("records.json"));

    const manual = await loadManualEnrichmentLookup(DATA_DIR);
    const renderable = [];
    for (const record of rawSearchRecords) {
      if (quarantinedIds.has(String(record.id))) {
        continue;
      }
      normalizeRecordTextFields(record);
      applyManualMetadataToRecord(record, manual.lookup);
      projectRecordInPlace(record);
      renderable.push(record);
    }

    searchRecords = dedupeSearchRecords(renderable);
    searchIndex = buildSearchIndex(searchRecords);
  }

  const genres =
    Array.isArray(rawGenres) && rawGenres.length > 0
      ? rawGenres
      : (bundle && Array.isArray(bundle.genres) && bundle.genres.length > 0
          ? bundle.genres
          : computeGenresFromRecords(searchRecords));

  snapshotCache = {
    searchRecords,
    searchIndex,
    searchMeta: buildSearchMeta(searchRecords),
    quarantinedIds,
    stores,
    genres,
    databaseInfo,
    snapshotMeta: snapshotMeta || {},
    recordIntegrity,
    bundleMeta,
  };

  return snapshotCache;
}

async function loadSnapshot() {
  if (snapshotCache) {
    return snapshotCache;
  }
  if (!snapshotCachePromise) {
    snapshotCachePromise = buildSnapshot().catch((error) => {
      snapshotCachePromise = null;
      throw error;
    });
  }
  return snapshotCachePromise;
}

// ---------------------------------------------------------------------------
// Lazy detail catalog (records.json)
// ---------------------------------------------------------------------------

let detailStorePromise = null;

async function buildDetailStore() {
  const [records, recordIntegrity] = await Promise.all([
    readJsonFileAsync("records.json"),
    readJsonFileIfExists("record_integrity.json"),
  ]);

  const quarantinedIds = toIdSet(recordIntegrity && recordIntegrity.quarantined_ids);
  const renderable = [];
  const byId = new Map();
  const prepared = new Set();

  for (const record of records) {
    const id = String(record.id);
    if (quarantinedIds.has(id)) {
      continue;
    }
    renderable.push(record);
    byId.set(id, record);
  }

  return {
    totalCatalogRecords: records.length,
    renderable,
    byId,
    quarantinedIds,
    prepared,
  };
}

async function loadDetailStore() {
  if (!detailStorePromise) {
    detailStorePromise = buildDetailStore().catch((error) => {
      detailStorePromise = null;
      throw error;
    });
  }
  return detailStorePromise;
}

/**
 * One-time per-record preparation for detail responses: text repair,
 * manual-index hydration, canonical projection. Idempotent and memoized.
 */
function prepareDetailRecord(store, record, manualLookup) {
  const id = String(record.id);
  if (store.prepared.has(id)) {
    return record;
  }
  normalizeRecordTextFields(record);
  if (manualLookup) {
    applyManualMetadataToRecord(record, manualLookup);
  }
  projectRecordInPlace(record);
  store.prepared.add(id);
  return record;
}

async function loadManualLookup() {
  const manual = await loadManualEnrichmentLookup(DATA_DIR);
  return manual && manual.lookup ? manual.lookup : null;
}

/** Test-only: clears module-level caches so tests can reload from disk. */
function resetCachesForTests() {
  snapshotCache = null;
  snapshotCachePromise = null;
  detailStorePromise = null;
}

module.exports = {
  DATA_DIR,
  SEARCH_BUNDLE_FILE,
  loadSnapshot,
  loadDetailStore,
  loadManualLookup,
  prepareDetailRecord,
  projectRecordInPlace,
  resetCachesForTests,
};
