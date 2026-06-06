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
  assert.equal("record_integrity" in body, true);
  assert.equal("is_stale" in body, true);
});

test("quarantined records are not returned by detail endpoint", async () => {
  const metaResponse = await call("/api/snapshot-meta");
  assert.equal(metaResponse.statusCode, 200);

  const summaryResponse = await call("/api/quarantine-summary");
  assert.equal(summaryResponse.statusCode, 200);
  assert.equal(typeof summaryResponse.body, "object");

  const sampleIds = Array.isArray(metaResponse.body.record_integrity?.quarantined_sample_ids)
    ? metaResponse.body.record_integrity.quarantined_sample_ids
    : [];

  if (sampleIds.length === 0) {
    return;
  }

  const quarantined = await call(
    "/api/record",
    new URLSearchParams([["id", String(sampleIds[0])]]),
  );

  assert.equal(quarantined.statusCode, 404);
  assert.equal(quarantined.body.reason, "record_quarantined_by_integrity_policy");
});

test("link-health rejects unsafe outbound URLs", async () => {
  const result = await call(
    "/api/link-health",
    new URLSearchParams([["url", "http://localhost/internal-only"]]),
  );

  assert.equal(result.statusCode, 400);
  assert.equal(typeof result.body.error, "string");
});

test("genres endpoint returns an array (computed from records when genres.json is empty)", async () => {
  const { statusCode, body } = await call("/api/genres");
  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(body.genres), "genres should be an array");
  // Array may be empty if all records have null genre — that is valid
  // What we verify is that the endpoint works and returns the correct shape
  assert.ok(typeof body.genres.length === "number", "genres.length should be a number");
});

test("/api/records batch endpoint returns matching records in request order", async () => {
  const first = await call(
    "/api/all-records",
    new URLSearchParams([["page", "1"], ["per_page", "3"]]),
  );
  const ids = (first.body.records || []).map((r) => String(r.id));
  if (ids.length === 0) return;

  const reversed = [...ids].reverse().join(",");
  const batch = await call(
    "/api/records",
    new URLSearchParams([["ids", reversed]]),
  );
  assert.equal(batch.statusCode, 200);
  assert.equal(batch.body.records.length, ids.length);
  assert.equal(String(batch.body.records[0].id), reversed.split(",")[0]);
});

test("/api/records with invalid ids returns empty array", async () => {
  const { statusCode, body } = await call(
    "/api/records",
    new URLSearchParams([["ids", "999999999,invalid-id"]]),
  );
  assert.equal(statusCode, 200);
  assert.equal(body.records.length, 0);
});

test("/api/records with missing ids param returns 400", async () => {
  const { statusCode } = await call("/api/records");
  assert.equal(statusCode, 400);
});

test("/api/suggest returns suggestions array for valid query", async () => {
  const { statusCode, body } = await call(
    "/api/suggest",
    new URLSearchParams([["q", "ro"]]),
  );
  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(body.suggestions), "suggestions should be an array");
});

test("/api/suggest returns empty array for short query (< 2 chars)", async () => {
  const { statusCode, body } = await call(
    "/api/suggest",
    new URLSearchParams([["q", "a"]]),
  );
  assert.equal(statusCode, 200);
  assert.deepEqual(body.suggestions, []);
});

test("search?sort=year_desc returns records with descending year values", async () => {
  const { statusCode, body } = await call(
    "/api/search",
    new URLSearchParams([["sort", "year_desc"], ["per_page", "50"]]),
  );
  assert.equal(statusCode, 200);
  const years = (body.records || [])
    .map((r) => Number(r.year || 0))
    .filter((y) => y > 0);
  for (let i = 1; i < years.length; i++) {
    assert.ok(years[i - 1] >= years[i], `year at index ${i - 1} (${years[i - 1]}) should be >= ${years[i]}`);
  }
});

test("search?sort=in_stock returns in-stock records before out-of-stock", async () => {
  const { statusCode, body } = await call(
    "/api/search",
    new URLSearchParams([["sort", "in_stock"], ["per_page", "50"]]),
  );
  assert.equal(statusCode, 200);
  const stocks = (body.records || []).map((r) => r.in_stock);
  const firstFalse = stocks.findIndex((s) => s !== true);
  const lastTrue = stocks.lastIndexOf(true);
  assert.ok(
    firstFalse === -1 || lastTrue === -1 || lastTrue < firstFalse,
    "in-stock records should appear before out-of-stock records"
  );
});
