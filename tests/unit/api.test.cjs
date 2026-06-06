const test = require("node:test");
const assert = require("node:assert/strict");

const { __testables } = require("../../netlify/functions/api.cjs");

const {
  parseMultiValueParam,
  normalizeInStock,
  parseNumericPrice,
  extractInStockValue,
  applySearchFiltering,
  applySorting,
  dedupeSearchRecords,
  selectBestCoverCandidate,
  isSafeOutboundUrl,
  findPrefixRange,
  computeGenresFromRecords,
  scoreRecordForQuery,
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

test("dedupeSearchRecords collapses duplicate product URLs and keeps richer record", () => {
  const input = [
    {
      id: "10",
      artist: "Playboi Carti",
      album: "Die Lit",
      store_name: "Shablool",
      product_url: "https://shabloolrecords.co.il/product/playboi-carti-die-lit-2lp/",
      price: 0,
      in_stock: null,
      cover_url: null,
    },
    {
      id: "11",
      artist: "Playboi Carti",
      album: "Playboi Carti – Die Lit 2LP",
      store_name: "Shablool",
      product_url: "https://shabloolrecords.co.il/product/playboi-carti-die-lit-2lp/",
      price: 160,
      in_stock: true,
      cover_url: "https://shabloolrecords.co.il/wp-content/uploads/2025/09/Playboi-Carti-Die-Lit-2LP-Vinyl.jpg",
    },
    {
      id: "12",
      artist: "Playboi Carti",
      album: "Die Lit",
      store_name: "Giora",
      product_url: "https://www.giorarecords.co.il/product/playboi-carti-die-lit-2lp/",
      price: 159,
      in_stock: true,
      cover_url: "https://www.giorarecords.co.il/wp-content/uploads/product_images/0602527346540-555x555.jpg",
    },
  ];

  const output = dedupeSearchRecords(input);
  assert.equal(output.length, 2);
  assert.equal(output[0].id, "11");
  assert.equal(output[1].id, "12");
});

test("selectBestCoverCandidate prefers URL token-aligned product image", () => {
  const selected = selectBestCoverCandidate(
    [
      "https://shabloolrecords.co.il/wp-content/uploads/2020/11/prodimage_37025.jpg",
      "https://shabloolrecords.co.il/wp-content/uploads/2025/09/Playboi-Carti-Die-Lit-2LP-Vinyl.jpg",
    ],
    { artist: "", album: "" },
    {
      referenceUrl: "https://shabloolrecords.co.il/product/playboi-carti-die-lit-2lp/",
    },
  );

  assert.equal(
    selected,
    "https://shabloolrecords.co.il/wp-content/uploads/2025/09/Playboi-Carti-Die-Lit-2LP-Vinyl.jpg",
  );
});

test("extractInStockValue prefers product stock markers over script/style noise", () => {
  const html = `
    <style>
      .product.outofstock::before { content: "OUT OF STOCK"; }
    </style>
    <script>
      // Out-of-stock alert for variation combinations only
      var example = "out of stock";
    </script>
    <div class="product type-product status-publish instock">
      <p class="stock in-stock">קיים במלאי</p>
      <button class="single_add_to_cart_button">הוספה לסל</button>
    </div>
  `;

  assert.equal(extractInStockValue(html), true);
});

test("extractInStockValue detects out-of-stock from primary product container", () => {
  const html = `
    <div class="product type-product status-publish outofstock">
      <p class="stock out-of-stock">אזל מהמלאי</p>
    </div>
    <li class="product instock">related item</li>
  `;

  assert.equal(extractInStockValue(html), false);
});

test("extractInStockValue ignores price-not-in-stock class false positive", () => {
  const html = `
    <p class="price product-page-price price-not-in-stock">₪160.00</p>
    <div id="product-145063" class="product type-product post-145063 outofstock">
      <div class="meta-wrap"><p class="stock out-of-stock">המלאי אזל</p></div>
    </div>
  `;

  assert.equal(extractInStockValue(html), false);
});

test("extractInStockValue reads schema availability from JSON-LD", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@type": "Product",
        "offers": {
          "@type": "Offer",
          "availability": "https://schema.org/OutOfStock"
        }
      }
    </script>
  `;

  assert.equal(extractInStockValue(html), false);
});

test("isSafeOutboundUrl rejects localhost and private networks", () => {
  assert.equal(isSafeOutboundUrl("https://example.com/product"), true);
  assert.equal(isSafeOutboundUrl("http://localhost/test"), false);
  assert.equal(isSafeOutboundUrl("http://127.0.0.1/test"), false);
  assert.equal(isSafeOutboundUrl("http://192.168.1.2/test"), false);
  assert.equal(isSafeOutboundUrl("javascript:alert(1)"), false);
});

test("findPrefixRange finds exact prefix range in sorted keys", () => {
  const sorted = ["abbey", "beatnik", "beethoven", "pink", "pink floyd", "radiohead"].sort();
  const [lo, hi] = findPrefixRange(sorted, "pink");
  const matches = sorted.slice(lo, hi);
  assert.deepEqual(matches, ["pink", "pink floyd"]);
});

test("findPrefixRange returns empty range when no prefix matches", () => {
  const sorted = ["abbey", "beatnik", "radiohead"].sort();
  const [lo, hi] = findPrefixRange(sorted, "zzz");
  assert.equal(lo, hi);
});

test("findPrefixRange handles single-element exact match", () => {
  const sorted = ["jazz"].sort();
  const [lo, hi] = findPrefixRange(sorted, "jazz");
  assert.equal(hi - lo, 1);
  assert.equal(sorted[lo], "jazz");
});

test("computeGenresFromRecords deduplicates and sorts genres", () => {
  const records = [
    { genre: "Rock" },
    { genre: "Jazz" },
    { genre: "Rock" },
    { genre: null },
    { genre: "" },
    { genre: "A" }, // too short (length <= 1)
  ];
  const genres = computeGenresFromRecords(records);
  assert.ok(genres.includes("Rock"));
  assert.ok(genres.includes("Jazz"));
  // deduplication
  assert.equal(genres.filter((g) => g === "Rock").length, 1);
  // nulls/empty/single chars excluded
  assert.ok(!genres.includes(""));
  assert.ok(!genres.includes("A"));
});

test("applySorting year_desc puts most recent year first, nulls last", () => {
  const params = new URLSearchParams([["sort", "year_desc"]]);
  const records = [
    { id: "1", year: 1965, price: 0 },
    { id: "2", year: 2020, price: 0 },
    { id: "3", year: null, price: 0 },
    { id: "4", year: 1999, price: 0 },
  ];
  const sorted = applySorting(records, params);
  assert.equal(sorted[0].id, "2");
  assert.equal(sorted[1].id, "4");
  assert.equal(sorted[2].id, "1");
  assert.equal(sorted[3].id, "3");
});

test("applySorting year_asc puts oldest year first, nulls last", () => {
  const params = new URLSearchParams([["sort", "year_asc"]]);
  const records = [
    { id: "1", year: 1999, price: 0 },
    { id: "2", year: null, price: 0 },
    { id: "3", year: 1965, price: 0 },
    { id: "4", year: 2020, price: 0 },
  ];
  const sorted = applySorting(records, params);
  assert.equal(sorted[0].id, "3");
  assert.equal(sorted[1].id, "1");
  assert.equal(sorted[2].id, "4");
  assert.equal(sorted[3].id, "2");
});

test("applySorting in_stock puts in-stock records first", () => {
  const params = new URLSearchParams([["sort", "in_stock"]]);
  const records = [
    { id: "1", in_stock: false, price: 0 },
    { id: "2", in_stock: true, price: 0 },
    { id: "3", in_stock: null, price: 0 },
  ];
  const sorted = applySorting(records, params);
  assert.equal(sorted[0].id, "2");
});

test("scoreRecordForQuery scores exact album title match highest", () => {
  const exact = { id: "1", artist: "Pink Floyd", album: "the wall", price: 100, in_stock: true, cover_url: "https://example.com/cover.jpg" };
  const partial = { id: "2", artist: "The Wall Band", album: "Live Show", price: 0, in_stock: null, cover_url: null };
  const exactScore = scoreRecordForQuery(exact, ["the", "wall"], "the wall");
  const partialScore = scoreRecordForQuery(partial, ["the", "wall"], "the wall");
  assert.ok(exactScore > partialScore, `exact (${exactScore}) should score higher than partial (${partialScore})`);
});

test("scoreRecordForQuery gives artist match a higher base score than unrelated record", () => {
  const artistMatch = { id: "1", artist: "david bowie", album: "Ziggy Stardust", price: 0, in_stock: null, cover_url: null };
  const noMatch = { id: "2", artist: "Bob Dylan", album: "Blood on the Tracks", price: 0, in_stock: null, cover_url: null };
  const artistScore = scoreRecordForQuery(artistMatch, ["david", "bowie"], "david bowie");
  const noMatchScore = scoreRecordForQuery(noMatch, ["david", "bowie"], "david bowie");
  assert.ok(artistScore > noMatchScore);
});
