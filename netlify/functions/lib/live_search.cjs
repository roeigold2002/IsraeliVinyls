"use strict";

/**
 * Real-time federated store search + batched live revalidation.
 *
 * Tiers (see docs/SEARCH_ARCHITECTURE.md):
 *   - runLiveSearch(query): fans the user's query out to every store's own
 *     search endpoint concurrently, parses product cards, and returns fresh
 *     listings with per-store status. Results are cached for a short TTL so
 *     repeated queries don't hammer the stores.
 *   - runLiveRefresh(records): re-fetches price/stock for a bounded batch of
 *     known records from their product pages (used to revalidate the page of
 *     results a user is currently looking at).
 *
 * Both paths degrade gracefully: a store that times out, blocks, or returns
 * nothing simply reports its status — cached results remain the floor.
 */

const crypto = require("crypto");

const {
  normalizeDisplayText,
  splitArtistAlbumFromText,
  parseNumericPrice,
  normalizeInStock,
} = require("./text.cjs");
const { resolveUsableCoverUrl } = require("./covers.cjs");
const { normalizeManualLookupUrl, getEnrichmentUrl } = require("./urls.cjs");
const {
  fetchHtmlWithFallback,
  extractPriceValue,
  extractInStockValue,
  looksLikeBlockedHtml,
  TTLCache,
} = require("./enrich.cjs");
const { getLiveSearchableStores, getRevalidateStores } = require("./live_stores.cjs");

const LIVE_SEARCH_TTL_MS = 10 * 60 * 1000; // per (store, query), successful results
// Failures (timeouts/flakes/no_results) retry much sooner — a store that was
// momentarily slow shouldn't disappear from live results for 10 minutes.
const LIVE_SEARCH_NEGATIVE_TTL_MS = 2 * 60 * 1000;
const LIVE_REFRESH_TTL_MS = 10 * 60 * 1000; // per product URL
const LIVE_STORE_TIMEOUT_MS = 3500; // per store fetch
// Netlify synchronous functions cap at ~10s; keep the whole federation pass
// safely inside that (the client treats live results as progressive anyway).
const LIVE_TOTAL_BUDGET_MS = 6500;
const MAX_RESULTS_PER_STORE = 12;
const LIVE_REFRESH_MAX_IDS = 12;
const LIVE_REFRESH_CONCURRENCY = 6;

const liveSearchCache = new TTLCache(LIVE_SEARCH_TTL_MS, 500);
const liveRefreshCache = new TTLCache(LIVE_REFRESH_TTL_MS, 2000);

// ---------------------------------------------------------------------------
// Generic WooCommerce product-grid parser
// ---------------------------------------------------------------------------

const PRODUCT_CONTAINER_RE =
  /<(li|div|article)[^>]*class="[^"]*(?:\btype-product\b|\bproduct-box\b|\bproduct-grid-item\b)[^"]*"[^>]*>/g;

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#8362;/g, "₪")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) && num > 31 ? String.fromCodePoint(num) : " ";
    });
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Price from an HTML snippet: decode entities, prefer ₪-adjacent numbers. */
function priceFromHtmlSnippet(html) {
  const text = stripTags(html);
  const symbolAdjacent = text.match(/₪\s*([0-9][0-9.,]{0,8})|([0-9][0-9.,]{0,8})\s*₪/);
  if (symbolAdjacent) {
    return parseNumericPrice(symbolAdjacent[1] || symbolAdjacent[2]);
  }
  // No currency symbol: only accept a plausible standalone price (2-4
  // digits, not glued to units like "2LP" / "3xLP" / years in titles).
  const standalone = text.match(/(?<![0-9])([0-9]{2,4}(?:[.,][0-9]{1,2})?)(?!\s*(?:LP|EP|CD|X|×|")\b)(?![0-9])/i);
  return standalone ? parseNumericPrice(standalone[1]) : 0;
}

function extractBlockPrice(block) {
  // Sale price (inside <ins>) beats the struck-through original.
  const insMatch = block.match(/<ins[^>]*>([\s\S]{0,400}?)<\/ins>/i);
  if (insMatch) {
    const salePrice = priceFromHtmlSnippet(insMatch[1]);
    if (salePrice > 0) return salePrice;
  }

  const amountIdx = block.search(/woocommerce-Price-amount/i);
  if (amountIdx >= 0) {
    const amountPrice = priceFromHtmlSnippet(block.slice(amountIdx, amountIdx + 300));
    if (amountPrice > 0) return amountPrice;
  }

  const anywhere = stripTags(block).match(/₪\s*([0-9][0-9.,]{0,8})/);
  return anywhere ? parseNumericPrice(anywhere[1]) : 0;
}

/**
 * Splits a WooCommerce search-results page into product blocks and extracts
 * {title, product_url, cover_url, price, in_stock} from each.
 */
function parseWooProducts(html, baseUrl, productPathRe) {
  const source = String(html || "");
  if (!source) {
    return [];
  }
  const productLinkRe = new RegExp(
    `href="([^"]*${productPathRe || "\\/products?\\/[^\"]+"})"`,
    "i"
  );

  const starts = [];
  let match;
  PRODUCT_CONTAINER_RE.lastIndex = 0;
  while ((match = PRODUCT_CONTAINER_RE.exec(source)) !== null) {
    starts.push({ index: match.index, classAttr: match[0] });
    if (starts.length > 60) break; // sanity bound
  }
  if (starts.length === 0) {
    return [];
  }

  const results = [];
  for (let i = 0; i < starts.length && results.length < MAX_RESULTS_PER_STORE; i += 1) {
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : Math.min(source.length, from + 8000);
    const block = source.slice(from, to);

    // Product URL: first link matching the store's product-path shape
    const urlMatch = block.match(productLinkRe);
    if (!urlMatch) continue;
    let productUrl;
    try {
      productUrl = new URL(decodeEntities(urlMatch[1]), baseUrl).toString();
    } catch {
      continue;
    }

    // Title: heading text, else the longest link text pointing at the product
    let title = "";
    const headingMatch = block.match(/<(?:h\d|p)[^>]*>([^<]{3,200})<\/(?:h\d|p)>/);
    if (headingMatch) {
      title = stripTags(headingMatch[1]);
    }
    if (!title || /הוספה לסל|add to cart|במלאי/i.test(title)) {
      const linkTexts = [...block.matchAll(/<a[^>]*href="[^"]*\/products?\/[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/gi)]
        .map((m) => stripTags(m[1]))
        .filter((t) => t.length >= 3 && !/הוספה לסל|add to cart|quick view|לצפייה/i.test(t));
      linkTexts.sort((a, b) => b.length - a.length);
      title = linkTexts[0] || "";
    }
    if (!title) continue;

    // Price: decode entities FIRST (so &#8362; becomes ₪, not the number
    // 8362), sale price inside <ins> wins, else first amount.
    const price = extractBlockPrice(block);

    // Stock: container classes first, then text markers
    let inStock = null;
    const classAttr = starts[i].classAttr;
    if (/\boutofstock\b/.test(classAttr)) inStock = false;
    else if (/\binstock\b/.test(classAttr)) inStock = true;
    if (inStock === null) {
      const blockText = block.toLowerCase();
      if (/אזל מהמלאי|out of stock|sold out/.test(blockText)) inStock = false;
      else if (/במלאי|in stock/.test(blockText)) inStock = true;
    }

    // Cover: first content image in the block
    let coverUrl = null;
    const imgMatch = block.match(/<img[^>]*src="([^"]+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"]*)?)"/i);
    if (imgMatch) {
      coverUrl = resolveUsableCoverUrl(decodeEntities(imgMatch[1]), baseUrl);
    }

    results.push({
      title: normalizeDisplayText(title, { stripLeadingFormat: true }) || title,
      product_url: productUrl,
      cover_url: coverUrl,
      price,
      in_stock: inStock,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// FiboSearch (DGWT WC Ajax Search) JSON parser — used by HaSivoov
// ---------------------------------------------------------------------------

function parseDgwtJson(jsonText) {
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const results = [];
  for (const item of payload.suggestions || []) {
    if (!item || item.type !== "product" || !item.url) continue;
    results.push({
      title: stripTags(String(item.value || "")),
      product_url: String(item.url),
      cover_url: resolveUsableCoverUrl(item.thumb_html ? (String(item.thumb_html).match(/src="([^"]+)"/) || [])[1] : null, item.url),
      price: priceFromHtmlSnippet(String(item.price || "")),
      in_stock: null,
    });
    if (results.length >= MAX_RESULTS_PER_STORE) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Generic link-grid parser — Shopify, Wix, and custom server-rendered
// storefronts. Finds product links by a configurable path pattern, then
// pulls title/price/cover from the markup around each link.
// ---------------------------------------------------------------------------

function titleFromSlug(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts[parts.length - 1] || "");
    return slug.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function parseLinkGrid(html, baseUrl, productPathRe) {
  const source = String(html || "");
  if (!source) return [];

  // Product links may carry tracking query strings (Shopify: ?_pos=…) —
  // match the path, tolerate an optional ?query/#hash before the closing quote.
  const linkRe = new RegExp(`href="((?:https?:\\/\\/[^"\\/]+)?${productPathRe})(?:[?#][^"]*)?"`, "gi");
  const byUrl = new Map(); // canonical url -> { url, positions: [] }

  let match;
  while ((match = linkRe.exec(source)) !== null) {
    let url;
    try {
      url = new URL(decodeEntities(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
    const canonical = url.split("#")[0];
    if (!byUrl.has(canonical)) {
      byUrl.set(canonical, { url: canonical, positions: [] });
    }
    byUrl.get(canonical).positions.push(match.index);
    if (byUrl.size > 40) break;
  }

  const results = [];
  for (const entry of byUrl.values()) {
    if (results.length >= MAX_RESULTS_PER_STORE) break;

    // Examine a window around each occurrence for title / price / image.
    let title = "";
    let price = 0;
    let coverUrl = null;
    let inStock = null;

    for (const pos of entry.positions) {
      const windowHtml = source.slice(pos, Math.min(source.length, pos + 1600));

      if (!title) {
        const anchorText = windowHtml.match(/^[^>]*>([\s\S]{0,300}?)<\/a>/);
        const candidate = anchorText ? stripTags(anchorText[1]) : "";
        if (candidate.length >= 4 && !/^\d+$/.test(candidate)) {
          title = candidate;
        }
      }
      if (!coverUrl) {
        const imgMatch = windowHtml.match(/<img[^>]*src="([^"]+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"]*)?)"/i);
        if (imgMatch) coverUrl = resolveUsableCoverUrl(decodeEntities(imgMatch[1]), baseUrl);
        if (!coverUrl) {
          const altImg = windowHtml.match(/<img[^>]*(?:data-src|srcset)="([^" ]+)/i);
          if (altImg) coverUrl = resolveUsableCoverUrl(decodeEntities(altImg[1]), baseUrl);
        }
      }
      if (price <= 0) {
        price = priceFromHtmlSnippet(windowHtml);
      }
      if (inStock === null) {
        const text = stripTags(windowHtml).toLowerCase();
        if (/אזל מהמלאי|out of stock|sold out/.test(text)) inStock = false;
      }
      if (title && price > 0 && coverUrl) break;
    }

    if (!title) {
      title = titleFromSlug(entry.url);
    }
    if (!title || title.length < 3) continue;

    results.push({
      title: normalizeDisplayText(title, { stripLeadingFormat: true }) || title,
      product_url: entry.url,
      cover_url: coverUrl,
      price,
      in_stock: inStock,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Federation
// ---------------------------------------------------------------------------

function liveRecordId(productUrl) {
  return `live-${crypto.createHash("sha1").update(normalizeManualLookupUrl(productUrl) || productUrl).digest("hex").slice(0, 12)}`;
}

function toLiveRecord(parsed, store) {
  const split = splitArtistAlbumFromText(parsed.title);
  return {
    id: liveRecordId(parsed.product_url),
    artist: split ? split.artist : "",
    album: split ? split.album : parsed.title,
    genre: null,
    format: null,
    condition: null,
    year: null,
    price: parsed.price,
    store_name: store.storeName,
    store_url: `${store.base}/`,
    product_url: parsed.product_url,
    currency: "ILS",
    cover_url: parsed.cover_url,
    in_stock: parsed.in_stock,
    price_source: "live_search",
    live: true,
    checked_at: new Date().toISOString(),
  };
}

async function searchOneStore(store, query, deadline) {
  const cacheKey = `${store.storeName}|${query.toLowerCase()}`;
  const cached = liveSearchCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const budgetLeft = deadline - Date.now();
  if (budgetLeft < 1200) {
    return { store: store.storeName, status: "skipped_budget", records: [] };
  }

  const storeTimeout = Number(store.timeoutMs) || LIVE_STORE_TIMEOUT_MS;
  const timeoutMs = Math.min(storeTimeout, budgetLeft - 700);
  const encoded = encodeURIComponent(query);

  for (const pathTemplate of store.searchPaths) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;

    const url = `${store.base}${pathTemplate.replace("{query}", encoded)}`;
    const attempts = await fetchHtmlWithFallback(url, {
      timeoutMs: Math.min(timeoutMs, remaining - 900),
      useBypass: true,
    });

    let blocked = false;
    for (const attempt of attempts) {
      if (!attempt.ok || !attempt.html) continue;
      if (looksLikeBlockedHtml(attempt.html)) {
        blocked = true;
        continue;
      }

      let parsed;
      if (store.adapter === "dgwt") {
        parsed = parseDgwtJson(attempt.html);
      } else if (store.adapter === "linkgrid") {
        parsed = parseLinkGrid(attempt.html, store.base, store.productPathRe);
      } else {
        parsed = parseWooProducts(attempt.html, store.base, store.productPathRe);
      }
      if (parsed.length > 0) {
        const payload = {
          store: store.storeName,
          status: "ok",
          mode: attempt.mode,
          records: parsed.map((p) => toLiveRecord(p, store)),
        };
        liveSearchCache.set(cacheKey, payload);
        return payload;
      }
    }

    if (blocked) {
      const payload = { store: store.storeName, status: "blocked", records: [] };
      liveSearchCache.set(cacheKey, payload, LIVE_SEARCH_NEGATIVE_TTL_MS);
      return payload;
    }
  }

  const payload = { store: store.storeName, status: "no_results", records: [] };
  liveSearchCache.set(cacheKey, payload, LIVE_SEARCH_NEGATIVE_TTL_MS);
  return payload;
}

/**
 * Live verification for stores whose platforms have no query endpoint:
 * their catalog matches for this query get price/stock re-fetched from the
 * store's product pages RIGHT NOW. Returns per-record verifications.
 */
async function verifyOneStore(store, catalogRecords, deadline) {
  const candidates = (catalogRecords || []).slice(0, 4).filter((r) => getEnrichmentUrl(r));
  if (candidates.length === 0) {
    return { store: store.storeName, status: "no_results", records: [], verified: [] };
  }
  if (deadline - Date.now() < 1500) {
    return { store: store.storeName, status: "skipped_budget", records: [], verified: [] };
  }

  const verified = [];
  await Promise.all(
    candidates.map(async (record) => {
      const result = await refreshOneRecord(record);
      if (result.status === "ok") {
        verified.push({
          id: result.id,
          price: result.price,
          in_stock: result.in_stock,
          checked_at: result.checked_at,
        });
      }
    })
  );

  return {
    store: store.storeName,
    status: verified.length > 0 ? "verified" : "unreachable",
    records: [],
    verified,
  };
}

/**
 * Federated live search + live verification across ALL registered stores.
 * Returns { records, verified, stores: [{store, status, count}], elapsed_ms }.
 *  - `records`: fresh listings the cached catalog does not show
 *  - `verified`: live price/stock confirmations for catalog records from
 *    stores without a search endpoint (client patches these in place)
 * `knownProductUrls` drops listings the catalog already shows;
 * `catalogMatchesByStore` (Map storeName → records) feeds verification.
 */
async function runLiveSearch(query, options = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + (Number(options.budgetMs) || LIVE_TOTAL_BUDGET_MS);
  const searchable = getLiveSearchableStores();
  const revalidate = getRevalidateStores();
  const catalogMatches = options.catalogMatchesByStore instanceof Map
    ? options.catalogMatchesByStore
    : new Map();

  const settled = await Promise.allSettled([
    ...searchable.map((store) => searchOneStore(store, query, deadline)),
    ...revalidate.map((store) =>
      verifyOneStore(store, catalogMatches.get(store.storeName.toLowerCase()), deadline)
    ),
  ]);

  const records = [];
  const verified = [];
  const storeStatuses = [];
  const seenUrls = new Set();
  const known = options.knownProductUrls instanceof Set ? options.knownProductUrls : new Set();

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const payload = result.value;
    let kept = 0;
    for (const record of payload.records || []) {
      const canonical = normalizeManualLookupUrl(record.product_url);
      if (!canonical || seenUrls.has(canonical)) continue;
      seenUrls.add(canonical);
      if (known.has(canonical)) continue; // catalog already shows this listing
      records.push(record);
      kept += 1;
    }
    for (const item of payload.verified || []) {
      verified.push(item);
      kept += 1;
    }
    storeStatuses.push({
      store: payload.store,
      status: payload.status,
      cached: Boolean(payload.cached),
      count: kept,
    });
  }

  return {
    records,
    verified,
    stores: storeStatuses,
    elapsed_ms: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Batched live revalidation of known records
// ---------------------------------------------------------------------------

async function refreshOneRecord(record) {
  const url = getEnrichmentUrl(record);
  if (!url) {
    return { id: String(record.id), status: "no_url" };
  }

  const cacheKey = normalizeManualLookupUrl(url) || url;
  const cached = liveRefreshCache.get(cacheKey);
  if (cached) {
    return { id: String(record.id), status: "ok", cached: true, ...cached };
  }

  const attempts = await fetchHtmlWithFallback(url, {
    timeoutMs: LIVE_STORE_TIMEOUT_MS,
    useBypass: true,
  });

  for (const attempt of attempts) {
    if (!attempt.ok || !attempt.html || looksLikeBlockedHtml(attempt.html)) continue;

    const price = extractPriceValue(attempt.html);
    const inStock = extractInStockValue(attempt.html);
    if (price > 0 || inStock !== null) {
      const payload = {
        price: price > 0 ? price : null,
        in_stock: normalizeInStock(inStock),
        checked_at: new Date().toISOString(),
      };
      liveRefreshCache.set(cacheKey, payload);
      return { id: String(record.id), status: "ok", ...payload };
    }
  }

  return { id: String(record.id), status: "unreachable" };
}

/**
 * Live-refreshes up to LIVE_REFRESH_MAX_IDS records concurrently.
 * Returns per-record fresh price/stock (nulls where unknown).
 */
async function runLiveRefresh(records) {
  const queue = records.slice(0, LIVE_REFRESH_MAX_IDS);
  const results = [];
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(LIVE_REFRESH_CONCURRENCY, queue.length) },
    async () => {
      while (cursor < queue.length) {
        const record = queue[cursor];
        cursor += 1;
        results.push(await refreshOneRecord(record));
      }
    }
  );

  await Promise.all(workers);
  return results;
}

module.exports = {
  LIVE_SEARCH_TTL_MS,
  LIVE_REFRESH_TTL_MS,
  LIVE_REFRESH_MAX_IDS,
  parseWooProducts,
  parseLinkGrid,
  parseDgwtJson,
  runLiveSearch,
  runLiveRefresh,
};
