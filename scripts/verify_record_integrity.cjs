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
  const recordIntegrity = readJson("record_integrity.json");
  const records = readJson("records.json");

  if (!recordIntegrity || typeof recordIntegrity !== "object") {
    fail("record_integrity.json must be an object");
  }

  const summary = recordIntegrity.summary;
  if (!summary || typeof summary !== "object") {
    fail("record_integrity.json missing summary object");
  }

  const renderableIds = Array.isArray(recordIntegrity.renderable_ids)
    ? recordIntegrity.renderable_ids.map((id) => String(id || ""))
    : fail("record_integrity.renderable_ids must be an array");
  const quarantinedIds = Array.isArray(recordIntegrity.quarantined_ids)
    ? recordIntegrity.quarantined_ids.map((id) => String(id || ""))
    : fail("record_integrity.quarantined_ids must be an array");

  const total = records.length;
  if (asNumber(summary.total_records) !== total) {
    fail(`summary.total_records (${summary.total_records}) does not match records length (${total})`);
  }

  const renderableSet = new Set(renderableIds);
  const quarantinedSet = new Set(quarantinedIds);

  if (renderableSet.size !== renderableIds.length) {
    fail("record_integrity.renderable_ids contains duplicate ids");
  }
  if (quarantinedSet.size !== quarantinedIds.length) {
    fail("record_integrity.quarantined_ids contains duplicate ids");
  }

  if (renderableSet.size + quarantinedSet.size !== total) {
    fail(
      `renderable/quarantined partition mismatch: ${renderableSet.size} + ${quarantinedSet.size} != ${total}`,
    );
  }

  for (const id of renderableSet) {
    if (quarantinedSet.has(id)) {
      fail(`Record id ${id} appears in both renderable and quarantined sets`);
    }
  }

  const failOnAnyQuarantine = process.env.INTEGRITY_FAIL_ON_ANY_QUARANTINE === "1";
  const failOnNonBlockedQuarantine = process.env.INTEGRITY_FAIL_ON_NON_BLOCKED_QUARANTINE === "1";

  if (failOnAnyQuarantine && asNumber(summary.quarantined_records) > 0) {
    fail(`Integrity hard fail: quarantined_records=${summary.quarantined_records}`);
  }

  if (
    failOnNonBlockedQuarantine &&
    asNumber(summary.non_blocked_quarantined_records) > 0
  ) {
    fail(
      `Integrity hard fail: non_blocked_quarantined_records=${summary.non_blocked_quarantined_records}`,
    );
  }

  console.log("RECORD_INTEGRITY_CHECK=PASS");
  console.log(
    JSON.stringify(
      {
        total_records: asNumber(summary.total_records),
        renderable_records: asNumber(summary.renderable_records),
        quarantined_records: asNumber(summary.quarantined_records),
        non_blocked_quarantined_records: asNumber(summary.non_blocked_quarantined_records),
        renderable_coverage_percent: asNumber(summary.renderable_coverage_percent),
      },
      null,
      2,
    ),
  );
}

try {
  check();
} catch (error) {
  console.error("RECORD_INTEGRITY_CHECK=FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
