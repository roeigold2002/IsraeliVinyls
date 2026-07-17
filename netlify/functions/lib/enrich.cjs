"use strict";

/**
 * Live enrichment: fetches cover/price/stock for a SINGLE record from its
 * store page (with proxy and iTunes fallbacks). Used exclusively by the
 * record-detail endpoint and the link-health probe — never by search.
 */

const {
  normalizeDisplayText,
  normalizeInStock,
  parseNumericPrice,
  buildSearchTokens,
  toLowerSafe,
  PRICE_FRAGMENT_RE,
  PROMO_AND_STOCK_PREFIX_RE,
} = require("./text.cjs");
const {
  resolveUsableCoverUrl,
  normalizeCoverUrl,
  isLikelyCoverUrl,
  cleanRawCoverCandidate,
  selectBestCoverCandidate,
  hasCoverUrl,
} = require("./covers.cjs");
const { getEnrichmentUrl } = require("./urls.cjs");
const { findManualMetadataInLookup, metadataHasUsefulFields, mergeMetadata, mergeMetadataByScore } = require("./manual_index.cjs");

const ENRICH_TIMEOUT_MS = 3000;
const ENRICH_CACHE_TTL_MS = 10 * 60 * 1000;

const ENRICH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9,he;q=0.8",
};

class TTLCache {
  constructor(ttlMs, maxEntries = 2000) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  set(key, value, ttlMs) {
    const effectiveTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? Number(ttlMs) : this.ttlMs;
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + effectiveTtlMs });
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return cached.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }
}

const enrichCache = new TTLCache(ENRICH_CACHE_TTL_MS);

function looksLikeBlockedHtml(html) {
  const value = String(html || "");
  if (!value) {
    return false;
  }

  const probe = value.slice(0, 12000).toLowerCase();
  if (!probe) {
    return false;
  }

  if (probe.includes("cf-chl") || probe.includes("/cdn-cgi/challenge-platform")) {
    return true;
  }
  if (
    probe.includes("<title>just a moment") ||
    probe.includes("checking your browser before accessing") ||
    probe.includes("attention required")
  ) {
    return true;
  }
  if (probe.includes("<title>access denied") && probe.includes("cloudflare")) {
    return true;
  }
  return false;
}

function extractCoverUrl(html) {
  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<figure[^>]*class=["'][^"']*woocommerce-product-gallery__image[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["']/i,
    /<img[^>]*data-large_image=["']([^"']+)["'][^>]*>/i,
    /<img[^>]*class=["'][^"']*(?:attachment-woocommerce_single|woocommerce-main-image|product-main-image)[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i,
    /"image"\s*:\s*\[\s*"([^\"]+)"/i,
    /"image"\s*:\s*"([^\"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return cleanRawCoverCandidate(match[1]);
    }
  }
  return null;
}

function extractImageCandidatesFromHtml(html, sourcePageUrl) {
  const candidates = [];
  const pushCandidate = (rawValue) => {
    const normalized = normalizeCoverUrl(cleanRawCoverCandidate(rawValue), sourcePageUrl);
    if (!normalized || !isLikelyCoverUrl(normalized)) {
      return;
    }
    candidates.push(normalized);
  };

  const absoluteImageUrls =
    html.match(/https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^\s"'<>]*)?/gi) || [];
  for (const candidate of absoluteImageUrls) {
    pushCandidate(candidate);
  }

  const attrPattern =
    /(?:src|data-src|data-lazy-src|data-large_image|href)=["']([^"']+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"']*)?)["']/gi;
  for (const match of html.matchAll(attrPattern)) {
    if (match && match[1]) {
      pushCandidate(match[1]);
    }
  }

  const srcsetPattern = /srcset=["']([^"']+)["']/gi;
  for (const match of html.matchAll(srcsetPattern)) {
    if (!match || !match[1]) {
      continue;
    }
    const entries = match[1].split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const firstPart = entry.split(/\s+/)[0];
      if (firstPart) {
        pushCandidate(firstPart);
      }
    }
  }

  return [...new Set(candidates)];
}

function extractPriceValue(html) {
  const patterns = [
    /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /"price"\s*:\s*"([0-9]{1,5}(?:[.,][0-9]{1,2})?)"/i,
    /woocommerce-Price-currencySymbol[^>]*>[^<]*<\/span>\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
    /<bdi>\s*(?:<span[^>]*>[^<]*<\/span>\s*)?([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*<\/bdi>/i,
    /(?:&#8362;|₪)\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const parsed = parseNumericPrice(match[1]);
      if (parsed > 0) {
        return parsed;
      }
    }
  }
  return 0;
}

function extractInStockValue(html) {
  const source = String(html || "");
  if (!source.trim()) {
    return null;
  }

  const schemaAvailabilityMatch = source.match(
    /"availability"\s*:\s*"https?:\/\/schema\.org\/(InStock|OutOfStock)"/i
  );
  if (schemaAvailabilityMatch && schemaAvailabilityMatch[1]) {
    return schemaAvailabilityMatch[1].toLowerCase() === "instock";
  }

  const metaAvailabilityMatch = source.match(
    /<meta[^>]*property=["']product:availability["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (metaAvailabilityMatch && metaAvailabilityMatch[1]) {
    const value = String(metaAvailabilityMatch[1]).toLowerCase();
    if (value.includes("outofstock") || value.includes("out_of_stock")) {
      return false;
    }
    if (value.includes("instock") || value.includes("in_stock")) {
      return true;
    }
  }

  const cleaned = source
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  // Prefer product-scoped stock classes before any loose text scanning.
  const mainProductClassMatch = cleaned.match(
    /<(?:div|article)[^>]*class=["']([^"']*\b(?:type-product|product)\b[^"']*)["'][^>]*>/i
  );
  if (mainProductClassMatch && mainProductClassMatch[1]) {
    const mainClasses = ` ${mainProductClassMatch[1].toLowerCase()} `;
    if (/\boutofstock\b/.test(mainClasses)) {
      return false;
    }
    if (/\binstock\b/.test(mainClasses)) {
      return true;
    }
  }

  const stockClassMatches = cleaned.matchAll(/class=["']([^"']+)["']/gi);
  for (const match of stockClassMatches) {
    const rawClasses = String(match && match[1] ? match[1] : "").toLowerCase().trim();
    if (!rawClasses) {
      continue;
    }

    const tokens = rawClasses.split(/\s+/).filter(Boolean);
    if (!tokens.includes("stock")) {
      continue;
    }
    if (tokens.includes("out-of-stock")) {
      return false;
    }
    if (tokens.includes("in-stock")) {
      return true;
    }
  }

  if (
    /single_add_to_cart_button/i.test(cleaned) &&
    !/(?:single_add_to_cart_button[^>]*\bdisabled\b|\bdisabled\b[^>]*single_add_to_cart_button)/i.test(cleaned)
  ) {
    return true;
  }

  const lowered = cleaned.toLowerCase();
  const outOfStockIndicators = [
    "out of stock", "sold out", "currently unavailable", "not available",
    "אזל מהמלאי", "אזל מן המלאי", "לא במלאי", "אין במלאי", "חסר במלאי",
  ];
  const inStockIndicators = [
    "in stock", "available now", "available for purchase",
    "במלאי", "זמין במלאי", "קיים במלאי",
  ];

  const hasOut = outOfStockIndicators.some((indicator) => lowered.includes(indicator));
  const hasIn = inStockIndicators.some((indicator) => lowered.includes(indicator));

  if (hasIn && !hasOut) return true;
  if (hasOut && !hasIn) return false;

  if (/\b\d+\s*in\s*stock\b/i.test(source) || /\b\d+\s*במלאי\b/i.test(source)) {
    return true;
  }

  return null;
}

function buildJinaBypassUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return "";
  }
  return `https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, "")}`;
}

async function fetchHtmlPage(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: ENRICH_HEADERS,
    });

    if (!res.ok) {
      return { ok: false, status: Number(res.status || 0) || null, html: "", final_url: res.url || url };
    }

    return {
      ok: true,
      status: Number(res.status || 0) || null,
      html: await res.text(),
      final_url: res.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      html: "",
      final_url: url,
      error: error instanceof Error ? error.message : "fetch_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlWithFallback(url, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : ENRICH_TIMEOUT_MS;
  const useBypass = options.useBypass !== false;

  const attempts = [];
  const direct = await fetchHtmlPage(url, timeoutMs);
  attempts.push({ ...direct, mode: "direct" });

  const shouldTryBypass = useBypass && (!direct.ok || !direct.html || looksLikeBlockedHtml(direct.html));
  if (shouldTryBypass) {
    const bypassUrl = buildJinaBypassUrl(url);
    if (bypassUrl) {
      const bypass = await fetchHtmlPage(bypassUrl, timeoutMs + 1500);
      attempts.push({ ...bypass, mode: "bypass" });
    }
  }

  return attempts;
}

function toHighResItunesArtwork(url) {
  const value = String(url || "").trim();
  if (!value) {
    return null;
  }

  const upgraded = value
    .replace(/\/(\d{2,4})x(\d{2,4})bb(?=\.|\?|$)/i, "/600x600bb")
    .replace(/\b(\d{2,4})x(\d{2,4})(?=bb\b)/i, "600x600");

  return normalizeCoverUrl(upgraded, "https://itunes.apple.com");
}

async function fetchItunesCover(record, options = {}) {
  if (!record) {
    return null;
  }

  const artist = String(record.artist || "").trim();
  const album = String(record.album || "").trim();
  const term = `${artist} ${album}`.trim();
  if (term.length < 2) {
    return null;
  }

  const cacheKey = `itunes:${term.toLowerCase()}`;
  const bypassCache = Boolean(options.bypassCache);
  if (!bypassCache && enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const timeoutMs = Number(options.timeoutMs || ENRICH_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = `https://itunes.apple.com/search?entity=album&limit=8&term=${encodeURIComponent(term)}`;
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const payload = await res.json();
    const results = Array.isArray(payload && payload.results) ? payload.results : [];
    if (results.length === 0) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const targetArtist = toLowerSafe(artist);
    const targetAlbum = toLowerSafe(album);
    const targetTokens = new Set(buildSearchTokens(`${artist} ${album}`));

    let bestCover = null;
    let bestScore = -1;

    for (const item of results) {
      const candidateArtist = String(item && item.artistName ? item.artistName : "");
      const candidateAlbum = String(
        item && (item.collectionName || item.trackName) ? item.collectionName || item.trackName : ""
      );

      const artCandidate =
        toHighResItunesArtwork(item && item.artworkUrl100) ||
        toHighResItunesArtwork(item && item.artworkUrl60) ||
        toHighResItunesArtwork(item && item.artworkUrl30);

      if (!artCandidate || !isLikelyCoverUrl(artCandidate)) {
        continue;
      }

      const candidateTokens = new Set(buildSearchTokens(`${candidateArtist} ${candidateAlbum}`));
      let score = 0;
      for (const token of targetTokens) {
        if (candidateTokens.has(token)) {
          score += 1;
        }
      }

      const candidateArtistLower = toLowerSafe(candidateArtist);
      const candidateAlbumLower = toLowerSafe(candidateAlbum);

      if (targetArtist && candidateArtistLower === targetArtist) score += 3;
      else if (targetArtist && candidateArtistLower.includes(targetArtist)) score += 1;

      if (targetAlbum && candidateAlbumLower === targetAlbum) score += 4;
      else if (targetAlbum && candidateAlbumLower.includes(targetAlbum)) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestCover = artCandidate;
      }
    }

    const minimumScore = targetArtist && targetAlbum ? 5 : 4;
    const selectedCover = bestCover && bestScore >= minimumScore ? bestCover : null;

    enrichCache.set(cacheKey, selectedCover || null);
    return selectedCover || null;
  } catch (_error) {
    enrichCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isThirdEarUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    return host === "third-ear.com" || host.endsWith(".third-ear.com");
  } catch (_error) {
    return false;
  }
}

async function fetchThirdEarOembedCoverFromUrl(url, options = {}) {
  if (!isThirdEarUrl(url)) {
    return null;
  }

  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);
  const cacheKey = `third-ear-oembed:${String(url).toLowerCase()}`;

  if (!bypassCache && enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const endpoint = `https://third-ear.com/wp-json/oembed/1.0/embed?url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      redirect: "follow",
      headers: ENRICH_HEADERS,
    });

    if (!res.ok) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    let data = null;
    try {
      data = JSON.parse(await res.text());
    } catch (_error) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const thumbnail = normalizeCoverUrl(data && data.thumbnail_url, url);
    if (thumbnail && isLikelyCoverUrl(thumbnail)) {
      enrichCache.set(cacheKey, thumbnail);
      return thumbnail;
    }

    enrichCache.set(cacheKey, null);
    return null;
  } catch (_error) {
    enrichCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildStoreSearchQuery(record) {
  const artist = normalizeDisplayText(record && record.artist, { stripLeadingFormat: true });
  const album = normalizeDisplayText(record && record.album, { stripLeadingFormat: true })
    .replace(/\([^)]*\)/g, " ")
    .replace(PRICE_FRAGMENT_RE, " ")
    .replace(/[:\-]\s*\d{2,4}.*$/g, " ")
    .replace(PROMO_AND_STOCK_PREFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${artist} ${album}`.trim().slice(0, 120);
}

function getStoreBaseUrl(record) {
  const directUrl = getEnrichmentUrl(record);
  if (directUrl) {
    try {
      const parsed = new URL(directUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch (_error) {
      // Fall through to the known-hosts mapping.
    }
  }

  const knownHosts = {
    beatnik: "https://www.beatnik.co.il",
    shablool: "https://shabloolrecords.co.il",
    "third ear": "https://third-ear.com",
    giora: "https://www.giorarecords.co.il",
    "the vinyl room": "https://thevinylroom.co.il",
    hasivoov: "https://hasivoov.co.il",
  };

  return knownHosts[String(record.store_name || "").toLowerCase()] || "";
}

function buildStoreSearchUrls(baseUrl, query) {
  const encoded = encodeURIComponent(query);
  return [
    `${baseUrl}/?s=${encoded}&post_type=product`,
    `${baseUrl}/?post_type=product&s=${encoded}`,
    `${baseUrl}/?s=${encoded}`,
    `${baseUrl}/search?q=${encoded}`,
  ];
}

async function fetchCoverFromStoreSearch(record, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  const query = buildStoreSearchQuery(record);
  const baseUrl = getStoreBaseUrl(record);
  if (!query || !baseUrl) {
    return null;
  }

  const cacheKey = `store-search:${baseUrl}:${query.toLowerCase()}`;
  if (!bypassCache && enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const searchUrls = [...new Set(buildStoreSearchUrls(baseUrl, query))];

  for (const searchUrl of searchUrls) {
    const attempts = await fetchHtmlWithFallback(searchUrl, { timeoutMs, useBypass: true });

    for (const attempt of attempts) {
      if (!attempt.ok || !attempt.html) {
        continue;
      }

      const sourcePageUrl = attempt.mode === "bypass" ? searchUrl : attempt.final_url || searchUrl;
      const candidates = extractImageCandidatesFromHtml(attempt.html, sourcePageUrl);
      const selected = selectBestCoverCandidate(candidates, record, { referenceUrl: sourcePageUrl });
      const cover = resolveUsableCoverUrl(selected, sourcePageUrl);
      if (cover) {
        enrichCache.set(cacheKey, cover);
        return cover;
      }
    }
  }

  enrichCache.set(cacheKey, null);
  return null;
}

/**
 * Fetches best-effort metadata for a product URL. `manualLookup` (a Map)
 * supplies archived metadata that fills gaps in the live fetch.
 */
async function fetchMetadataForUrl(url, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  if (!url) {
    return null;
  }

  if (!bypassCache && enrichCache.has(url)) {
    return enrichCache.get(url);
  }

  const manualMetadata = options.manualLookup
    ? findManualMetadataInLookup(url, options.manualLookup)
    : null;

  const attempts = await fetchHtmlWithFallback(url, { timeoutMs, useBypass: true });

  let bestPayload = null;
  let blockedSignal = false;

  for (const attempt of attempts) {
    if (!attempt.ok || !attempt.html) {
      continue;
    }
    if (looksLikeBlockedHtml(attempt.html)) {
      blockedSignal = true;
      continue;
    }

    const sourceUrl = attempt.mode === "bypass" ? url : attempt.final_url || url;
    let coverUrl = resolveUsableCoverUrl(extractCoverUrl(attempt.html), sourceUrl);
    const price = extractPriceValue(attempt.html);
    const inStock = extractInStockValue(attempt.html);

    if (!coverUrl) {
      const candidates = extractImageCandidatesFromHtml(attempt.html, sourceUrl);
      const selected = selectBestCoverCandidate(candidates, options.record || { artist: "", album: "" }, {
        referenceUrl: sourceUrl,
      });
      coverUrl = resolveUsableCoverUrl(selected, sourceUrl);
    }

    bestPayload = mergeMetadataByScore(bestPayload, { cover_url: coverUrl, price, in_stock: inStock });

    if (metadataHasUsefulFields(bestPayload) && bestPayload.cover_url && bestPayload.price > 0) {
      break;
    }
  }

  if ((!bestPayload || !bestPayload.cover_url) && isThirdEarUrl(url)) {
    const thirdEarCover = await fetchThirdEarOembedCoverFromUrl(url, { timeoutMs, bypassCache });
    if (thirdEarCover) {
      bestPayload = mergeMetadataByScore(bestPayload, {
        cover_url: thirdEarCover,
        price: 0,
        in_stock: null,
      });
    }
  }

  if (manualMetadata) {
    bestPayload = mergeMetadata(bestPayload || { cover_url: null, price: 0, in_stock: null }, manualMetadata);
  }

  if (!bestPayload || !metadataHasUsefulFields(bestPayload)) {
    // Avoid poisoning the cache with challenge pages and transient anti-bot responses.
    if (blockedSignal) {
      return null;
    }
    if (manualMetadata && metadataHasUsefulFields(manualMetadata)) {
      enrichCache.set(url, manualMetadata);
      return manualMetadata;
    }
    enrichCache.set(url, null);
    return null;
  }

  bestPayload.cover_url = resolveUsableCoverUrl(bestPayload.cover_url, url);
  enrichCache.set(url, bestPayload);
  return bestPayload;
}

async function enrichMissingCoverFallback(record, options = {}) {
  if (!record || hasCoverUrl(record)) {
    return;
  }

  const storeName = String(record.store_name || "").toLowerCase();
  const hasDirectProductUrl = typeof record.product_url === "string" && record.product_url.startsWith("http");

  if (storeName === "third ear") {
    const url = getEnrichmentUrl(record);
    if (url) {
      const thirdEarCover = await fetchThirdEarOembedCoverFromUrl(url, options);
      if (thirdEarCover) {
        record.cover_url = thirdEarCover;
        return;
      }
    }
  }

  if (!hasDirectProductUrl) {
    const fallbackCover = await fetchCoverFromStoreSearch(record, options);
    if (fallbackCover) {
      record.cover_url = fallbackCover;
      return;
    }
  }

  const itunesCover = await fetchItunesCover(record, options);
  if (itunesCover) {
    record.cover_url = itunesCover;
  }
}

/**
 * Live-refreshes a single record in place: price, stock, cover.
 * The caller decides whether to force a refresh (bypassing caches) or only
 * fill gaps.
 */
async function enrichRecord(record, options = {}) {
  if (!record) {
    return;
  }

  const forceRefresh = Boolean(options.forceRefresh);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  const hasPrice = Number(record.price || 0) > 0;
  const hasCover = hasCoverUrl(record);
  const hasInStock = normalizeInStock(record.in_stock) !== null;
  if (!forceRefresh && hasPrice && hasCover && hasInStock) {
    return;
  }

  const url = getEnrichmentUrl(record);
  if (!url) {
    await enrichMissingCoverFallback(record, { timeoutMs, bypassCache });
    return;
  }

  const metadata = await fetchMetadataForUrl(url, {
    timeoutMs,
    bypassCache,
    record,
    manualLookup: options.manualLookup,
  });
  if (!metadata) {
    await enrichMissingCoverFallback(record, { timeoutMs, bypassCache });
    return;
  }

  const metadataCover = resolveUsableCoverUrl(metadata.cover_url, url);
  if (metadataCover && (!hasCover || forceRefresh)) {
    record.cover_url = metadataCover;
  }

  if (metadata.price > 0 && (!hasPrice || forceRefresh || Number(record.price || 0) !== metadata.price)) {
    record.price = metadata.price;
    record.price_source = "live_fetch";
  }

  const normalizedInStock = normalizeInStock(metadata.in_stock);
  if (normalizedInStock !== null) {
    record.in_stock = normalizedInStock;
  }

  if (!hasCoverUrl(record)) {
    await enrichMissingCoverFallback(record, { timeoutMs, bypassCache });
  }

  if (!record.product_url && url) {
    record.product_url = url;
  }
}

async function probeUrl(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: ENRICH_HEADERS,
    });

    if (res.status === 405 || res.status === 403 || res.status === 401) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: ENRICH_HEADERS,
      });
    }

    return {
      ok: Boolean(res.ok),
      status: Number.isFinite(Number(res.status)) ? Number(res.status) : null,
      final_url: res && res.url ? String(res.url) : url,
      checked_at: new Date().toISOString(),
      cached: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      final_url: null,
      checked_at: new Date().toISOString(),
      cached: false,
      error: error instanceof Error ? error.message : "link_probe_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  ENRICH_TIMEOUT_MS,
  TTLCache,
  enrichCache,
  looksLikeBlockedHtml,
  extractCoverUrl,
  extractImageCandidatesFromHtml,
  extractPriceValue,
  extractInStockValue,
  fetchHtmlPage,
  fetchHtmlWithFallback,
  fetchItunesCover,
  fetchThirdEarOembedCoverFromUrl,
  fetchCoverFromStoreSearch,
  fetchMetadataForUrl,
  enrichMissingCoverFallback,
  enrichRecord,
  probeUrl,
};
