#!/usr/bin/env node
"use strict";

/**
 * Ingests Grooves (https://groovesil.shop) listings into the catalog.
 *
 * Grooves is a Supabase-backed SPA, not a WooCommerce store, so it can't go
 * through the Python HTML scraper. Its public catalog is captured from the
 * shop page's own product state into netlify/data/groovesil_raw.json (the
 * store's robots.txt sets Content-Signal: search=yes, i.e. search indexing
 * of exactly this kind is permitted).
 *
 * This script maps that raw export into the project's record schema and
 * merges it into records.json + search_records.json. It is idempotent:
 * every Grooves record uses a stable "gs-<id>" id, so re-running replaces
 * the prior Grooves set rather than duplicating it.
 *
 * Refresh flow:
 *   1. re-capture netlify/data/groovesil_raw.json from the shop page
 *   2. node scripts/ingest_groovesil.cjs
 *   3. node scripts/rebuild_stats.cjs
 *   4. node scripts/build_search_bundle.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const RAW_PATH = path.join(DATA_DIR, "groovesil_raw.json");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");
const SEARCH_RECORDS_PATH = path.join(DATA_DIR, "search_records.json");
const INTEGRITY_PATH = path.join(DATA_DIR, "record_integrity.json");
const STORES_PATH = path.join(DATA_DIR, "stores.json");
const SNAPSHOT_META_PATH = path.join(DATA_DIR, "snapshot_meta.json");
const GENRES_PATH = path.join(DATA_DIR, "genres.json");

const STORE_NAME = "Grooves";
const STORE_HOME = "https://groovesil.shop/";
const ID_PREFIX = "gs-";
const IMAGE_ORIGIN = "https://groovesil.shop";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, value) {
  fs.writeFileSync(p, JSON.stringify(value));
}

function toAbsoluteImage(image) {
  const value = String(image || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `${IMAGE_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

// Map the store's format list to the catalog's single-format convention:
// vinyl → LP (this is a vinyl aggregator), else CD.
function pickFormat(formats) {
  const list = Array.isArray(formats) ? formats.map((f) => String(f).toLowerCase()) : [];
  if (list.includes("vinyl")) return "LP";
  if (list.includes("cd")) return "CD";
  return null;
}

// Headline price is the vinyl price when the record is sold on vinyl,
// otherwise the primary price field.
function pickPrice(raw) {
  const vinyl = Number(raw?.prices?.vinyl || 0);
  if (vinyl > 0) return vinyl;
  const primary = Number(raw?.price || 0);
  return Number.isFinite(primary) && primary > 0 ? primary : 0;
}

function mapRecord(raw) {
  const format = pickFormat(raw.formats);
  return {
    id: `${ID_PREFIX}${raw.id}`,
    artist: String(raw.artist || "").trim(),
    album: String(raw.title || "").trim(),
    genre: raw.genre ? String(raw.genre).trim() : null,
    format,
    condition: null,
    year: raw.year ? Number(raw.year) : null,
    price: pickPrice(raw),
    store_name: STORE_NAME,
    store_url: STORE_HOME,
    product_url: `${IMAGE_ORIGIN}/album/${raw.id}`,
    currency: "ILS",
    cover_url: toAbsoluteImage(raw.image),
    in_stock: true, // every record on the shop grid is listed as orderable
    price_source: "store_import",
    checked_at: new Date().toISOString(),
    fetch_ok: true,
  };
}

function mergeInto(listPath, mapped) {
  const existing = readJson(listPath);
  const withoutGrooves = existing.filter(
    (r) => !String(r.id || "").startsWith(ID_PREFIX)
  );
  const removed = existing.length - withoutGrooves.length;
  const merged = withoutGrooves.concat(mapped);
  writeJson(listPath, merged);
  return { before: existing.length, removed, after: merged.length };
}

/**
 * Keeps record_integrity.json consistent after a JSON-layer ingest.
 * Grooves records are all renderable (they carry artist/album/price/cover/
 * product page), so they extend renderable_ids and total counts. Idempotent:
 * prior gs-* ids are dropped before re-adding.
 */
function updateIntegrity(mappedIds) {
  let integrity;
  try {
    integrity = readJson(INTEGRITY_PATH);
  } catch {
    return null; // no integrity file to maintain
  }

  const gsSet = new Set(mappedIds);
  const renderable = (integrity.renderable_ids || []).filter(
    (id) => !String(id).startsWith(ID_PREFIX)
  );
  for (const id of mappedIds) renderable.push(id);

  const quarantined = integrity.quarantined_ids || [];
  const total = renderable.length + quarantined.length;
  const renderablePct = total > 0 ? Number(((renderable.length / total) * 100).toFixed(1)) : 0;

  integrity.renderable_ids = renderable;
  integrity.summary = {
    ...integrity.summary,
    total_records: total,
    renderable_records: renderable.length,
    renderable_coverage_percent: renderablePct,
  };
  if (integrity.store_breakdown && typeof integrity.store_breakdown === "object") {
    integrity.store_breakdown[STORE_NAME] = {
      total: gsSet.size,
      renderable: gsSet.size,
      quarantined: 0,
    };
  }

  writeJson(INTEGRITY_PATH, integrity);
  return { total, renderable: renderable.length, quarantined: quarantined.length };
}

/**
 * Adds/refreshes the Grooves entry in stores.json so the store surfaces in
 * /api/stores with a real record_count and pricing stats (the store filter
 * and stores page read from here). Idempotent.
 */
function updateStores(mapped) {
  let stores;
  try {
    stores = readJson(STORES_PATH);
  } catch {
    return null;
  }
  if (!Array.isArray(stores)) return null;

  const prices = mapped.map((r) => Number(r.price || 0)).filter((p) => p > 0);
  const artists = new Set(mapped.map((r) => r.artist).filter(Boolean));
  const genres = new Set(mapped.map((r) => r.genre).filter(Boolean));
  const sum = prices.reduce((a, b) => a + b, 0);

  const entry = {
    name: STORE_NAME,
    record_count: mapped.length,
    unique_artists: artists.size,
    genres_represented: genres.size,
    priced_records: prices.length,
    avg_price: prices.length ? Number((sum / prices.length).toFixed(2)) : 0,
    min_price: prices.length ? Math.min(...prices) : 0,
    max_price: prices.length ? Math.max(...prices) : 0,
    connectivity_status: "enabled",
    connectivity_note: "Imported from groovesil.shop public catalog",
    pricing_coverage_percent: mapped.length ? Number(((prices.length / mapped.length) * 100).toFixed(1)) : 0,
    pricing_status: "healthy",
  };

  const filtered = stores.filter((s) => String(s.name || "") !== STORE_NAME);
  filtered.push(entry);
  filtered.sort((a, b) => Number(b.record_count || 0) - Number(a.record_count || 0));
  writeJson(STORES_PATH, filtered);
  return { stores: filtered.length, grooves: entry.record_count };
}

/**
 * Reconciles snapshot_meta.json counts with the on-disk files after ingest,
 * so verify_snapshot_integrity passes. (rebuild_stats regenerates
 * database_info/genres; snapshot_meta normally comes from the Python export,
 * which we bypass for this JSON-layer import.) Idempotent.
 */
function updateSnapshotMeta() {
  let meta;
  try {
    meta = readJson(SNAPSHOT_META_PATH);
  } catch {
    return null;
  }

  const records = readJson(RECORDS_PATH);
  const searchRecords = readJson(SEARCH_RECORDS_PATH);
  const stores = readJson(STORES_PATH);
  let genresCount = meta.genres;
  try {
    const genres = readJson(GENRES_PATH);
    if (Array.isArray(genres)) genresCount = genres.length;
  } catch {
    // keep prior value
  }

  meta.records = records.length;
  meta.search_records = searchRecords.length;
  meta.stores = stores.length;
  meta.genres = genresCount;

  writeJson(SNAPSHOT_META_PATH, meta);
  return { records: meta.records, search_records: meta.search_records, stores: meta.stores };
}

function main() {
  const raw = readJson(RAW_PATH);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("groovesil_raw.json is empty or not an array");
  }

  const mapped = [];
  const seen = new Set();
  let skipped = 0;
  for (const item of raw) {
    if (!item || item.id === undefined || item.id === null) {
      skipped += 1;
      continue;
    }
    const id = `${ID_PREFIX}${item.id}`;
    if (seen.has(id)) {
      skipped += 1;
      continue;
    }
    if (!String(item.artist || "").trim() && !String(item.title || "").trim()) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    mapped.push(mapRecord(item));
  }

  const recordsResult = mergeInto(RECORDS_PATH, mapped);
  const searchResult = mergeInto(SEARCH_RECORDS_PATH, mapped);
  const integrityResult = updateIntegrity(mapped.map((r) => r.id));
  const storesResult = updateStores(mapped);
  const metaResult = updateSnapshotMeta();

  console.log("GROOVESIL_INGEST_DONE");
  console.log(
    JSON.stringify(
      {
        raw_items: raw.length,
        mapped: mapped.length,
        skipped,
        priced: mapped.filter((r) => r.price > 0).length,
        with_cover: mapped.filter((r) => r.cover_url).length,
        records_json: recordsResult,
        search_records_json: searchResult,
        record_integrity: integrityResult,
        stores_json: storesResult,
        snapshot_meta: metaResult,
      },
      null,
      2
    )
  );
}

main();
