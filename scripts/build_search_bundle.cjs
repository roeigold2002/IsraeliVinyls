#!/usr/bin/env node
"use strict";

/**
 * Builds netlify/data/search_bundle.json — the precomputed search snapshot
 * consumed by netlify/functions/api.cjs.
 *
 * Everything expensive that the API used to do on every cold start now
 * happens exactly once, here:
 *   1. text normalization / artist-album repair
 *   2. manual enrichment index hydration (cover / price / stock gaps)
 *   3. quarantine filtering
 *   4. duplicate-listing collapse
 *   5. inverted index construction
 *   6. canonical response projection (numeric price, tri-state stock,
 *      validated cover URL)
 *
 * Run as part of `npm run export:snapshot` (and therefore every build).
 */

const fs = require("fs");
const path = require("path");

const { normalizeRecordTextFields } = require("../netlify/functions/lib/text.cjs");
const {
  buildLookupFromPayload,
  applyManualMetadataToRecord,
} = require("../netlify/functions/lib/manual_index.cjs");
const {
  buildSearchIndex,
  serializeSearchIndex,
  dedupeSearchRecords,
  computeGenresFromRecords,
} = require("../netlify/functions/lib/search.cjs");
const { projectRecordInPlace } = require("../netlify/functions/lib/snapshot.cjs");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const OUTPUT_FILE = path.join(DATA_DIR, "search_bundle.json");

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}

function readJsonIfExists(fileName) {
  try {
    return readJson(fileName);
  } catch {
    return null;
  }
}

/**
 * The nightly refresh updates records.json in place, but search_records.json
 * (the deduped search subset, produced by the SQLite export) is only rebuilt
 * on full exports. Overlay the freshest per-record values so search results
 * always reflect the latest verified data.
 */
function overlayFreshValues(searchRecords, fullRecords) {
  const freshById = new Map();
  for (const record of fullRecords) {
    freshById.set(String(record.id), record);
  }

  let overlaid = 0;
  for (const record of searchRecords) {
    const fresh = freshById.get(String(record.id));
    if (!fresh) {
      continue;
    }

    let changed = false;
    for (const field of ["price", "price_source", "in_stock", "cover_url", "product_url", "checked_at", "fetch_ok", "artist"]) {
      if (fresh[field] !== undefined && fresh[field] !== record[field]) {
        record[field] = fresh[field];
        changed = true;
      }
    }
    if (changed) {
      overlaid += 1;
    }
  }
  return overlaid;
}

function main() {
  const startedAt = Date.now();

  let overlaid = 0;
  let searchRecords = readJsonIfExists("search_records.json");
  if (searchRecords) {
    const fullRecords = readJsonIfExists("records.json");
    if (fullRecords) {
      overlaid = overlayFreshValues(searchRecords, fullRecords);
    }
  } else {
    searchRecords = readJson("records.json");
  }
  const recordIntegrity = readJsonIfExists("record_integrity.json");
  const manualIndexPayload = readJsonIfExists("manual_enrichment_index.json");
  const genresFile = readJsonIfExists("genres.json");

  const quarantinedIds = new Set(
    (recordIntegrity && recordIntegrity.quarantined_ids ? recordIntegrity.quarantined_ids : [])
      .map((value) => String(value || ""))
      .filter(Boolean)
  );

  const manual = manualIndexPayload
    ? buildLookupFromPayload(manualIndexPayload)
    : { generated_at: null, entries: 0, lookup: new Map() };

  let hydrated = 0;
  let normalized = 0;
  const renderable = [];

  for (const record of searchRecords) {
    if (quarantinedIds.has(String(record.id))) {
      continue;
    }
    if (normalizeRecordTextFields(record)) {
      normalized += 1;
    }
    if (applyManualMetadataToRecord(record, manual.lookup)) {
      hydrated += 1;
    }
    projectRecordInPlace(record);
    renderable.push(record);
  }

  const deduped = dedupeSearchRecords(renderable);
  const searchIndex = buildSearchIndex(deduped);

  const priceProvenance = { live: 0, manual: 0, imputed: 0, local_extract: 0, unknown: 0 };
  for (const record of deduped) {
    if (Number(record.price || 0) <= 0) {
      continue;
    }
    const source = String(record.price_source || "");
    if (source.startsWith("live_fetch")) priceProvenance.live += 1;
    else if (source === "manual_index") priceProvenance.manual += 1;
    else if (source === "imputed") priceProvenance.imputed += 1;
    else if (source === "local_extract") priceProvenance.local_extract += 1;
    else priceProvenance.unknown += 1;
  }

  const genres =
    Array.isArray(genresFile) && genresFile.length > 0
      ? genresFile
      : computeGenresFromRecords(deduped);

  const bundle = {
    version: 1,
    generated_at: new Date().toISOString(),
    source: {
      search_records: searchRecords.length,
      quarantined_excluded: searchRecords.length - renderable.length,
      after_dedupe: deduped.length,
      manual_index_entries: manual.entries,
      manual_index_generated_at: manual.generated_at,
    },
    hydration: {
      index_entries: manual.entries,
      index_generated_at: manual.generated_at,
      records_hydrated: hydrated,
      records_normalized: normalized,
    },
    price_provenance: priceProvenance,
    genres,
    records: deduped,
    index: serializeSearchIndex(searchIndex),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(bundle));

  const sizeMb = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(1);
  console.log("SEARCH_BUNDLE_DONE");
  console.log(
    JSON.stringify(
      {
        input_records: searchRecords.length,
        fresh_values_overlaid: overlaid,
        quarantined_excluded: bundle.source.quarantined_excluded,
        normalized,
        hydrated,
        after_dedupe: deduped.length,
        index_tokens: searchIndex.tokenToIndexes.size,
        price_provenance: priceProvenance,
        output: path.relative(process.cwd(), OUTPUT_FILE),
        size_mb: Number(sizeMb),
        elapsed_ms: Date.now() - startedAt,
      },
      null,
      2
    )
  );
}

main();
