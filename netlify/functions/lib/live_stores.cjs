"use strict";

/**
 * Live-search adapter registry — ALL 20 stores participate in real time.
 *
 * Adapter types (parsers live in live_search.cjs):
 *   - "woocommerce": standard WooCommerce product-grid markup.
 *     `productPathRe` overrides the product-URL shape for custom permalinks.
 *   - "linkgrid": generic parser for platforms whose search pages are
 *     server-rendered grids of product links (Shopify, Wix, custom Israeli
 *     platforms). Configured by `searchPaths` + `productPathRe`.
 *   - "dgwt": WordPress "FiboSearch/DGWT WC Ajax Search" JSON endpoint.
 *   - "revalidate": the platform has NO query endpoint (SPA / no server-side
 *     search). The store still participates in real time: its catalog
 *     matches for the query get price/stock live-fetched from the store's
 *     product pages at search time and returned as verifications.
 *
 * `storeName` must match `store_name` in records.json.
 * Adding a new store = one entry here.
 */

const LIVE_STORES = [
  // --- WooCommerce ---
  {
    // Cloudflare-challenged for direct fetches; the proxy fallback needs
    // extra headroom.
    storeName: "Beatnik",
    base: "https://www.beatnik.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/product/?s={query}"],
    adapter: "woocommerce",
    timeoutMs: 5500,
  },
  {
    storeName: "Shablool",
    base: "https://shabloolrecords.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Giora",
    base: "https://www.giorarecords.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    // Large catalog; its search endpoint regularly needs >3.5s.
    storeName: "Third Ear",
    base: "https://third-ear.com",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
    timeoutMs: 5500,
  },
  {
    storeName: "The Vinyl Room",
    base: "https://thevinylroom.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/?s={query}"],
    adapter: "woocommerce",
  },
  {
    storeName: "Rock Store 1970",
    base: "https://rockstore1970.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/?s={query}"],
    adapter: "woocommerce",
  },
  {
    storeName: "Vinylia Records",
    base: "https://vinyliarecords.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "H2Shop",
    base: "https://h2shop.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    // WooCommerce with custom "/p/<slug>" permalinks and a nonstandard
    // card theme — the generic link-grid parser handles it better.
    storeName: "B-Side Haifa",
    base: "https://www.bsidehaifa.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/?s={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/p\\/[^\"'#?]+",
  },

  // --- FiboSearch JSON (WordPress) ---
  {
    storeName: "HaSivoov",
    base: "https://hasivoov.co.il",
    searchPaths: ["/?wc-ajax=dgwt_wcas_ajax_search&s={query}"],
    adapter: "dgwt",
  },

  // --- Shopify (server-rendered /search page, /products/<handle> links) ---
  {
    storeName: "Holit Records",
    base: "https://holit-records.co.il",
    searchPaths: ["/search?q={query}&type=product", "/search?q={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/products\\/[^\"'#?]+",
    timeoutMs: 5500,
  },
  {
    storeName: "Rolling Dise",
    base: "https://www.rollindise.com",
    searchPaths: ["/search?q={query}&type=product", "/search?q={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/products\\/[^\"'#?]+",
    timeoutMs: 5500,
  },
  {
    storeName: "Hod Hamahat",
    base: "https://hodhamahat.com",
    searchPaths: ["/search?q={query}&type=product", "/search?q={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/products\\/[^\"'#?]+",
    timeoutMs: 5500,
  },

  // --- Custom platforms with server-rendered search ---
  {
    // Custom storefront; /search?q= renders /products/<id>/<name> links.
    storeName: "Vinyl Stock",
    base: "https://www.vinylstock.co.il",
    searchPaths: ["/search?q={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/products\\/\\d+\\/[^\"'#?]+",
  },
  {
    // Custom storefront; /Results?q= renders /prod/<id> links.
    storeName: "Disc Center",
    base: "https://www.disccenter.co.il",
    searchPaths: ["/Results?q={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/prod\\/[^\"'#?]+",
  },
  {
    // Wix; /search?q= server-renders /product-page/<slug> links.
    storeName: "Taklit House",
    base: "https://www.taklithouse.com",
    searchPaths: ["/search?q={query}"],
    adapter: "linkgrid",
    productPathRe: "\\/product-page\\/[^\"'#?]+",
  },

  // --- No server-side search: live verification of catalog matches ---
  { storeName: "Transistore", base: "https://transistore.co.il", searchPaths: [], adapter: "revalidate" },
  { storeName: "My Records", base: "https://www.my-records.co.il", searchPaths: [], adapter: "revalidate" },
  { storeName: "Tav8", base: "https://www.tav8.co.il", searchPaths: [], adapter: "revalidate" },
  { storeName: "Grooves", base: "https://groovesil.shop", searchPaths: [], adapter: "revalidate" },
];

function getLiveSearchableStores() {
  return LIVE_STORES.filter((store) => store.adapter !== "revalidate" && store.searchPaths.length > 0);
}

function getRevalidateStores() {
  return LIVE_STORES.filter((store) => store.adapter === "revalidate");
}

function getLiveStoreByName(name) {
  const needle = String(name || "").toLowerCase();
  return LIVE_STORES.find((store) => store.storeName.toLowerCase() === needle) || null;
}

module.exports = {
  LIVE_STORES,
  getLiveSearchableStores,
  getRevalidateStores,
  getLiveStoreByName,
};
