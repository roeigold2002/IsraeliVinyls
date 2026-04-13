const test = require("node:test");
const assert = require("node:assert/strict");

const { __testables } = require("../../netlify/functions/api.cjs");

const {
  parseMultiValueParam,
  normalizeInStock,
  parseNumericPrice,
  applySearchFiltering,
  applySorting,
  isSafeOutboundUrl,
} = __testables;

function sampleRecords() {
  return [
    {
      id: "1",
      artist: "Pink Floyd",
      album: "The Wall",
      genre: "Rock",
      store_name: "Beatnik",
      format: "LP",
      price: 120,
      year: 1979,
      in_stock: true,
    },
    {
      id: "2",
      artist: "Miles Davis",
      album: "Kind of Blue",
      genre: "Jazz",
      store_name: "Third Ear",
      format: "LP",
      price: 0,
      year: 1959,
      in_stock: false,
    },
    {
      id: "3",
      artist: "David Bowie",
      album: "Heroes",
      genre: "Rock",
      store_name: "Beatnik",
      format: "CD",
      price: 80,
      year: 1977,
      in_stock: "1",
    },
  ];
}

test("parseMultiValueParam supports repeated and comma-separated values", () => {
  const params = new URLSearchParams();
  params.append("genre", "Rock,Jazz");
  params.append("genre", "Classical");

  const values = parseMultiValueParam(params, "genre");
  assert.deepEqual(values, ["Rock", "Jazz", "Classical"]);
});

test("normalizeInStock parses common truthy and falsey values", () => {
  assert.equal(normalizeInStock(true), true);
  assert.equal(normalizeInStock(false), false);
  assert.equal(normalizeInStock("1"), true);
  assert.equal(normalizeInStock("yes"), true);
  assert.equal(normalizeInStock("0"), false);
  assert.equal(normalizeInStock("no"), false);
  assert.equal(normalizeInStock("maybe"), null);
});

test("parseNumericPrice handles ILS symbols and decimal separators", () => {
  assert.equal(parseNumericPrice("₪129"), 129);
  assert.equal(parseNumericPrice("129,90 ILS"), 129.9);
  assert.equal(parseNumericPrice("Price: 77.5"), 77.5);
  assert.equal(parseNumericPrice("not a number"), 0);
});

test("applySearchFiltering applies query, genre, store, stock, format, price, and year filters", () => {
  const params = new URLSearchParams();
  params.set("q", "pink");
  params.append("genre", "rock");
  params.append("store_filter", "Beatnik");
  params.set("in_stock", "1");
  params.append("format", "LP");
  params.set("price_min", "100");
  params.set("price_max", "130");
  params.set("year_min", "1970");
  params.set("year_max", "1985");

  const filtered = applySearchFiltering(sampleRecords(), params);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "1");
});

test("applySorting keeps zero-price records last for ascending sort", () => {
  const params = new URLSearchParams([["sort", "price_asc"]]);
  const sorted = applySorting(sampleRecords(), params);

  assert.equal(sorted[0].id, "3");
  assert.equal(sorted[1].id, "1");
  assert.equal(sorted[2].id, "2");
});

test("isSafeOutboundUrl rejects localhost and private networks", () => {
  assert.equal(isSafeOutboundUrl("https://example.com/product"), true);
  assert.equal(isSafeOutboundUrl("http://localhost/test"), false);
  assert.equal(isSafeOutboundUrl("http://127.0.0.1/test"), false);
  assert.equal(isSafeOutboundUrl("http://192.168.1.2/test"), false);
  assert.equal(isSafeOutboundUrl("javascript:alert(1)"), false);
});
