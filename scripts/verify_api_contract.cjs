#!/usr/bin/env node

const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/api.cjs");

function makeEvent(pathname, params = new URLSearchParams()) {
  const rawQuery = params.toString();
  const queryStringParameters = {};
  for (const [key, value] of params.entries()) {
    queryStringParameters[key] = value;
  }

  const rawUrl = `http://localhost${pathname}${rawQuery ? `?${rawQuery}` : ""}`;

  return {
    path: pathname,
    rawUrl,
    rawQuery,
    queryStringParameters,
    httpMethod: "GET",
    headers: {},
  };
}

async function callApi(endpoint, params = new URLSearchParams()) {
  const event = makeEvent(`/api/${endpoint}`, params);
  const result = await handler(event);
  const body = JSON.parse(result.body || "{}");

  if (result.statusCode >= 400) {
    throw new Error(`API /api/${endpoint} failed (${result.statusCode}): ${JSON.stringify(body)}`);
  }

  return body;
}

async function callRawApi(endpoint, params = new URLSearchParams()) {
  const event = makeEvent(`/api/${endpoint}`, params);
  const result = await handler(event);
  return {
    statusCode: result.statusCode,
    body: JSON.parse(result.body || "{}"),
  };
}

function assertPriceRange(records, min, max) {
  for (const record of records) {
    const price = Number(record.price || 0);
    assert(price >= min, `Expected price >= ${min}, got ${price} (record ${record.id})`);
    assert(price <= max, `Expected price <= ${max}, got ${price} (record ${record.id})`);
  }
}

async function main() {
  const storesPayload = await callApi("stores");
  const stores = storesPayload.stores || [];
  assert(stores.length > 0, "No stores returned from /api/stores");

  const enabledStores = stores
    .filter((store) => store.connectivity_status !== "blocked")
    .filter((store) => Number(store.record_count || 0) > 0);

  assert(enabledStores.length > 0, "No enabled stores with records for contract tests");

  const selectedStoreNames = enabledStores.slice(0, 2).map((store) => String(store.name || ""));
  const storeParams = new URLSearchParams();
  selectedStoreNames.forEach((name) => storeParams.append("store_filter", name));
  storeParams.set("per_page", "120");

  const byStore = await callApi("search", storeParams);
  assert(Array.isArray(byStore.records), "Search response records must be an array");
  for (const record of byStore.records) {
    assert(
      selectedStoreNames.includes(String(record.store_name || "")),
      `store_filter mismatch: got ${record.store_name}`,
    );
  }

  const baseline = await callApi("search", new URLSearchParams([["per_page", "300"]]));
  const formats = [...new Set((baseline.records || []).map((record) => String(record.format || "").trim()).filter(Boolean))].slice(0, 2);

  if (formats.length > 0) {
    const formatParams = new URLSearchParams();
    formats.forEach((format) => formatParams.append("format", format));
    formatParams.set("per_page", "120");

    const byFormat = await callApi("search", formatParams);
    for (const record of byFormat.records) {
      assert(
        formats.includes(String(record.format || "").trim()),
        `format filter mismatch: got ${record.format}`,
      );
    }
  }

  const sortedPrice = await callApi(
    "search",
    new URLSearchParams([
      ["price_min", "1"],
      ["price_max", "1000"],
      ["sort", "price_asc"],
      ["per_page", "120"],
    ]),
  );

  assertPriceRange(sortedPrice.records || [], 1, 1000);
  let previous = 0;
  for (const record of sortedPrice.records || []) {
    const current = Number(record.price || 0);
    assert(current >= previous, `price_asc ordering mismatch: ${current} < ${previous}`);
    previous = current;
  }

  const legacyRange = await callApi(
    "search",
    new URLSearchParams([
      ["pmin", "1"],
      ["pmax", "1000"],
      ["per_page", "120"],
    ]),
  );

  assertPriceRange(legacyRange.records || [], 1, 1000);

  const snapshotMeta = await callApi("snapshot-meta");
  assert(snapshotMeta && typeof snapshotMeta === "object", "snapshot-meta must return an object");
  assert("pricing_integrity" in snapshotMeta, "snapshot-meta missing pricing_integrity");
  assert("connectivity" in snapshotMeta, "snapshot-meta missing connectivity");
  assert("asset_integrity" in snapshotMeta, "snapshot-meta missing asset_integrity");

  const invalidLink = await callRawApi(
    "link-health",
    new URLSearchParams([["url", "http://localhost/internal"]]),
  );
  assert.equal(invalidLink.statusCode, 400, "link-health should reject unsafe localhost URL");

  const validLink = await callApi(
    "link-health",
    new URLSearchParams([["url", "https://example.com/"]]),
  );
  assert.equal(typeof validLink.ok, "boolean", "link-health must return ok boolean");
  assert("status" in validLink, "link-health must return status");
  assert("checked_at" in validLink, "link-health must return checked_at");

  console.log("API_CONTRACT_CHECK=PASS");
}

main().catch((error) => {
  console.error("API_CONTRACT_CHECK=FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
