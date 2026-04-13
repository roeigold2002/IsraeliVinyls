const test = require("node:test");
const assert = require("node:assert/strict");

const { handler } = require("../../netlify/functions/api.cjs");

function makeEvent(pathname, params = new URLSearchParams()) {
  const rawQuery = params.toString();
  const queryStringParameters = {};

  for (const [key, value] of params.entries()) {
    queryStringParameters[key] = value;
  }

  return {
    path: pathname,
    rawUrl: `http://localhost${pathname}${rawQuery ? `?${rawQuery}` : ""}`,
    rawQuery,
    queryStringParameters,
    httpMethod: "GET",
    headers: {},
  };
}

async function call(pathname, params = new URLSearchParams()) {
  const result = await handler(makeEvent(pathname, params));
  return {
    statusCode: result.statusCode,
    body: JSON.parse(result.body || "{}"),
  };
}

test("health endpoint returns counts", async () => {
  const { statusCode, body } = await call("/api/health");

  assert.equal(statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.records, "number");
  assert.equal(typeof body.stores, "number");
  assert.equal(typeof body.genres, "number");
});

test("search pagination remains consistent across pages", async () => {
  const pageSize = 40;

  const firstPage = await call(
    "/api/search",
    new URLSearchParams([
      ["page", "1"],
      ["per_page", String(pageSize)],
    ]),
  );
  const secondPage = await call(
    "/api/search",
    new URLSearchParams([
      ["page", "2"],
      ["per_page", String(pageSize)],
    ]),
  );

  assert.equal(firstPage.statusCode, 200);
  assert.equal(secondPage.statusCode, 200);
  assert.equal(firstPage.body.total, secondPage.body.total);
  assert.equal(firstPage.body.per_page, pageSize);
  assert.equal(secondPage.body.per_page, pageSize);

  const ids1 = new Set((firstPage.body.records || []).map((record) => String(record.id)));
  const ids2 = new Set((secondPage.body.records || []).map((record) => String(record.id)));

  if (firstPage.body.total > pageSize) {
    const overlap = [...ids1].filter((id) => ids2.has(id));
    assert.equal(overlap.length, 0, "page 1 and page 2 should not overlap");
  }

  assert.equal(firstPage.body.has_prev, false);
  assert.equal(firstPage.body.page, 1);
  assert.equal(secondPage.body.page, 2);
});

test("store_filter and format filters return consistent records", async () => {
  const storesPayload = await call("/api/stores");
  assert.equal(storesPayload.statusCode, 200);

  const enabledStores = (storesPayload.body.stores || [])
    .filter((store) => store.connectivity_status !== "blocked")
    .filter((store) => Number(store.record_count || 0) > 0)
    .map((store) => String(store.name || ""))
    .filter(Boolean);

  assert(enabledStores.length > 0, "expected at least one enabled store with records");

  const storeName = enabledStores[0];
  const byStore = await call(
    "/api/search",
    new URLSearchParams([
      ["store_filter", storeName],
      ["per_page", "120"],
    ]),
  );

  assert.equal(byStore.statusCode, 200);
  for (const record of byStore.body.records || []) {
    assert.equal(String(record.store_name || ""), storeName);
  }

  const baseline = await call("/api/search", new URLSearchParams([["per_page", "300"]]));
  assert.equal(baseline.statusCode, 200);

  const firstFormat = [...new Set((baseline.body.records || []).map((record) => String(record.format || "").trim()))]
    .find(Boolean);

  if (firstFormat) {
    const byFormat = await call(
      "/api/search",
      new URLSearchParams([
        ["format", firstFormat],
        ["per_page", "120"],
      ]),
    );

    assert.equal(byFormat.statusCode, 200);
    for (const record of byFormat.body.records || []) {
      assert.equal(String(record.format || "").trim(), firstFormat);
    }
  }
});

test("snapshot-meta includes integrity sections", async () => {
  const { statusCode, body } = await call("/api/snapshot-meta");

  assert.equal(statusCode, 200);
  assert.equal(typeof body, "object");
  assert.equal("pricing_integrity" in body, true);
  assert.equal("connectivity" in body, true);
  assert.equal("asset_integrity" in body, true);
  assert.equal("is_stale" in body, true);
});

test("link-health rejects unsafe outbound URLs", async () => {
  const result = await call(
    "/api/link-health",
    new URLSearchParams([["url", "http://localhost/internal-only"]]),
  );

  assert.equal(result.statusCode, 400);
  assert.equal(typeof result.body.error, "string");
});
