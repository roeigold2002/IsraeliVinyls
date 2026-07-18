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
const { getLiveSearchableStores } = require("./live_stores.cjs");

const LIVE_SEARCH_TTL_MS = 10 * 60 * 1000; // per (store, query)
const LIVE_REFRESH_TTL_MS = 10 * 60 * 1000; // per product URL
const LIVE_STORE_TIMEOUT_MS = 3500; // per store fetch
// Netlify synchronous functions cap at ~10s; keep the whole federation pass
// safely inside that (the client treats live results as progressive anyway).
const LIVE_TOTAL_BUDGET_MS = 7000;
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
  const firstNumber = text.match(/([0-9]{1,5}(?:[.,][0-9]{1,2})?)/);
  return firstNumber ? parseNumericPrice(firstNumber[1]) : 0;
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
function parseWooProducts(html, baseUrl) {
  const source = String(html || "");
  if (!source) {
    return [];
  }

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

    // Product URL: first link into /product/ (or /products/)
    const urlMatch = block.match(/href="([^"]*\/products?\/[^"]+)"/i);
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

  const timeoutMs = Math.min(LIVE_STORE_TIMEOUT_MS, budgetLeft - 700);
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

      const parsed = parseWooProducts(attempt.html, store.base);
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
      liveSearchCache.set(cacheKey, payload);
      return payload;
    }
  }

  const payload = { store: store.storeName, status: "no_results", records: [] };
  liveSearchCache.set(cacheKey, payload);
  return payload;
}

/**
 * Federated live search across all adapter-enabled stores.
 * Returns { records, stores: [{store, status, count}], elapsed_ms }.
 * `knownProductUrls` (Set of canonical URLs) lets the caller drop listings
 * that the cached catalog already shows.
 */
async function runLiveSearch(query, options = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + (Number(options.budgetMs) || LIVE_TOTAL_BUDGET_MS);
  const stores = getLiveSearchableStores();

  const settled = await Promise.allSettled(
    stores.map((store) => searchOneStore(store, query, deadline))
  );

  const records = [];
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
    storeStatuses.push({
      store: payload.store,
      status: payload.status,
      cached: Boolean(payload.cached),
      count: kept,
    });
  }

  return {
    records,
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
  runLiveSearch,
  runLiveRefresh,
};
