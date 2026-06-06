#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "netlify", "data");

function fail(message) {
  throw new Error(message);
}

function readJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    fail(`Missing required snapshot file: ${fileName}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function check() {
  const records = readJson("records.json");
  const searchRecords = readJson("search_records.json");
  const stores = readJson("stores.json");
  const dbInfo = readJson("database_info.json");
  const snapshotMeta = readJson("snapshot_meta.json");
  const recordIntegrity = readJson("record_integrity.json");

  if (!Array.isArray(records)) fail("records.json must be an array");
  if (!Array.isArray(searchRecords)) fail("search_records.json must be an array");
  if (!Array.isArray(stores)) fail("stores.json must be an array");
  if (!dbInfo || typeof dbInfo !== "object") fail("database_info.json must be an object");
  if (!snapshotMeta || typeof snapshotMeta !== "object") fail("snapshot_meta.json must be an object");
  if (!recordIntegrity || typeof recordIntegrity !== "object") fail("record_integrity.json must be an object");

  const integritySummary =
    recordIntegrity.summary && typeof recordIntegrity.summary === "object"
      ? recordIntegrity.summary
      : fail("record_integrity.json missing summary object");

  const renderableIds = Array.isArray(recordIntegrity.renderable_ids)
    ? recordIntegrity.renderable_ids.map((id) => String(id))
    : fail("record_integrity.renderable_ids must be an array");
  const quarantinedIds = Array.isArray(recordIntegrity.quarantined_ids)
    ? recordIntegrity.quarantined_ids.map((id) => String(id))
    : fail("record_integrity.quarantined_ids must be an array");

  const totalFromIntegrity = asNumber(integritySummary.total_records);
  if (totalFromIntegrity !== records.length) {
    fail(
      `record_integrity total_records (${totalFromIntegrity}) does not match records.json length (${records.length})`,
    );
  }

  if (renderableIds.length + quarantinedIds.length !== records.length) {
    fail(
      `record_integrity IDs mismatch: renderable (${renderableIds.length}) + quarantined (${quarantinedIds.length}) != records (${records.length})`,
    );
  }

  const renderableSet = new Set(renderableIds);
  const quarantinedSet = new Set(quarantinedIds);
  if (renderableSet.size !== renderableIds.length) {
    fail("record_integrity.renderable_ids contains duplicate ids");
  }
  if (quarantinedSet.size !== quarantinedIds.length) {
    fail("record_integrity.quarantined_ids contains duplicate ids");
  }
  for (const id of renderableSet) {
    if (quarantinedSet.has(id)) {
      fail(`record id ${id} appears in both renderable_ids and quarantined_ids`);
    }
  }

  if (asNumber(integritySummary.renderable_records) !== renderableIds.length) {
    fail(
      `record_integrity summary renderable_records (${integritySummary.renderable_records}) does not match renderable_ids length (${renderableIds.length})`,
    );
  }
  if (asNumber(integritySummary.quarantined_records) !== quarantinedIds.length) {
    fail(
      `record_integrity summary quarantined_records (${integritySummary.quarantined_records}) does not match quarantined_ids length (${quarantinedIds.length})`,
    );
  }

  const totalRecords = asNumber(dbInfo.total_records);
  if (totalRecords !== records.length) {
    fail(`database_info total_records (${totalRecords}) does not match records.json length (${records.length})`);
  }

  const metaRecords = asNumber(snapshotMeta.records);
  const metaSearchRecords = asNumber(snapshotMeta.search_records);
  const metaStores = asNumber(snapshotMeta.stores);

  if (metaRecords !== records.length) {
    fail(`snapshot_meta records (${metaRecords}) does not match records.json length (${records.length})`);
  }

  if (metaSearchRecords !== searchRecords.length) {
    fail(
      `snapshot_meta search_records (${metaSearchRecords}) does not match search_records.json length (${searchRecords.length})`,
    );
  }

  if (metaStores !== stores.length) {
    fail(`snapshot_meta stores (${metaStores}) does not match stores.json length (${stores.length})`);
  }

  const storeCount = asNumber(dbInfo.store_count);
  const dbStoreMap = dbInfo.stores && typeof dbInfo.stores === "object" ? dbInfo.stores : {};
  const dbStoreNames = Object.keys(dbStoreMap);
  if (storeCount !== dbStoreNames.length) {
    fail(`database_info store_count (${storeCount}) does not match stores map size (${dbStoreNames.length})`);
  }

  for (const store of stores) {
    if (!store || typeof store !== "object") {
      fail("stores.json contains non-object entry");
    }

    if (typeof store.name !== "string" || !store.name.trim()) {
      fail("stores.json contains store entry without name");
    }

    if (!Object.prototype.hasOwnProperty.call(store, "connectivity_status")) {
      fail(`Store ${store.name} missing connectivity_status`);
    }

    if (!Object.prototype.hasOwnProperty.call(store, "pricing_status")) {
      fail(`Store ${store.name} missing pricing_status`);
    }

    const recordCount = asNumber(store.record_count);
    const pricedRecords = asNumber(store.priced_records);
    if (recordCount < 0 || pricedRecords < 0) {
      fail(`Store ${store.name} has negative record/priced counts`);
    }

    if (pricedRecords > recordCount) {
      fail(`Store ${store.name} has priced_records > record_count (${pricedRecords} > ${recordCount})`);
    }
  }

  const pricingIntegrity = snapshotMeta.pricing_integrity || {};
  const connectivity = snapshotMeta.connectivity || {};
  const assetIntegrity = snapshotMeta.asset_integrity || {};

  if (typeof pricingIntegrity !== "object") {
    fail("snapshot_meta pricing_integrity must be an object");
  }
  if (typeof connectivity !== "object") {
    fail("snapshot_meta connectivity must be an object");
  }
  if (typeof assetIntegrity !== "object") {
    fail("snapshot_meta asset_integrity must be an object");
  }

  const failOnStale = process.env.QA_FAIL_ON_STALE === "1";
  const failOnPricingTarget = process.env.QA_FAIL_ON_PRICING_TARGET === "1";
  const failOnNonBlockedQuarantine = process.env.QA_FAIL_ON_NON_BLOCKED_QUARANTINE === "1";

  if (failOnStale && snapshotMeta.is_stale === true) {
    fail(`Snapshot is stale (freshness_hours=${snapshotMeta.freshness_hours}, stale_after_hours=${snapshotMeta.stale_after_hours})`);
  }

  if (failOnPricingTarget && pricingIntegrity.meets_target === false) {
    fail(
      `Pricing integrity target not met (coverage=${pricingIntegrity.enabled_coverage_percent} target=${pricingIntegrity.target_percent})`,
    );
  }

  if (failOnNonBlockedQuarantine && asNumber(integritySummary.non_blocked_quarantined_records) > 0) {
    fail(
      `Integrity policy failed: non_blocked_quarantined_records=${integritySummary.non_blocked_quarantined_records}`,
    );
  }

  console.log("SNAPSHOT_INTEGRITY_CHECK=PASS");
  console.log(
    JSON.stringify(
      {
        records: records.length,
        search_records: searchRecords.length,
        stores: stores.length,
        stale: snapshotMeta.is_stale,
        pricing_coverage_percent: pricingIntegrity.enabled_coverage_percent ?? null,
        renderable_coverage_percent: integritySummary.renderable_coverage_percent ?? null,
      },
      null,
      2,
    ),
  );
}

try {
  check();
} catch (error) {
  console.error("SNAPSHOT_INTEGRITY_CHECK=FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
