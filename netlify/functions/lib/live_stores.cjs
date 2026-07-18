"use strict";

/**
 * Live-search adapter registry.
 *
 * Each entry describes how to query one store's own search endpoint in real
 * time. Adding a new Israeli vinyl store to live search = adding one entry
 * here (plus, if its platform is exotic, a parser in live_search.cjs).
 *
 * `adapter` values:
 *   - "woocommerce": standard WooCommerce product-grid markup (the majority
 *     of Israeli vinyl stores). Parsed generically.
 *   - "none": store cannot be live-searched (SPA/custom platform); its
 *     records still get live *revalidation* via their product pages, and
 *     cached results still appear instantly.
 *
 * `storeName` must match `store_name` in records.json so live results can
 * be deduped against the cached catalog.
 */

const LIVE_STORES = [
  {
    storeName: "Beatnik",
    base: "https://www.beatnik.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/product/?s={query}"],
    adapter: "woocommerce",
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
    storeName: "Third Ear",
    base: "https://third-ear.com",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "The Vinyl Room",
    base: "https://thevinylroom.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/?s={query}"],
    adapter: "woocommerce",
  },
  {
    storeName: "HaSivoov",
    base: "https://hasivoov.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Holit Records",
    base: "https://holit-records.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Vinyl Stock",
    base: "https://www.vinylstock.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Vinylia Records",
    base: "https://vinyliarecords.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Transistore",
    base: "https://transistore.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "My Records",
    base: "https://www.my-records.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Rolling Dise",
    base: "https://www.rollindise.com",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Rock Store 1970",
    base: "https://rockstore1970.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/?s={query}"],
    adapter: "woocommerce",
  },
  {
    storeName: "Hod Hamahat",
    base: "https://hodhamahat.com",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "Taklit House",
    base: "https://www.taklithouse.com",
    searchPaths: ["/?s={query}&post_type=product", "/search?q={query}"],
    adapter: "woocommerce",
  },
  {
    storeName: "Disc Center",
    base: "https://www.disccenter.co.il",
    searchPaths: ["/?s={query}&post_type=product", "/search?q={query}"],
    adapter: "woocommerce",
  },
  {
    storeName: "B-Side Haifa",
    base: "https://www.bsidehaifa.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  {
    storeName: "H2Shop",
    base: "https://h2shop.co.il",
    searchPaths: ["/?s={query}&post_type=product"],
    adapter: "woocommerce",
  },
  // Custom platform (no server-rendered search results) — revalidation only.
  { storeName: "Tav8", base: "https://www.tav8.co.il", searchPaths: [], adapter: "none" },
  // Supabase SPA; full catalog is imported and revalidated via JSON-LD
  // product pages. No server-rendered search endpoint.
  { storeName: "Grooves", base: "https://groovesil.shop", searchPaths: [], adapter: "none" },
];

function getLiveSearchableStores() {
  return LIVE_STORES.filter((store) => store.adapter !== "none" && store.searchPaths.length > 0);
}

function getLiveStoreByName(name) {
  const needle = String(name || "").toLowerCase();
  return LIVE_STORES.find((store) => store.storeName.toLowerCase() === needle) || null;
}

module.exports = {
  LIVE_STORES,
  getLiveSearchableStores,
  getLiveStoreByName,
};
