const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ENRICH_TIMEOUT_MS = 3000;
const ENRICH_MAX_ITEMS = 50;
const ENRICH_CONCURRENCY = 8;
const DEFAULT_COVER_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#16213e'/><stop offset='100%' stop-color='#0f3460'/></linearGradient></defs><rect width='600' height='600' fill='url(#g)'/><circle cx='300' cy='300' r='170' fill='none' stroke='#e94560' stroke-width='24'/><circle cx='300' cy='300' r='35' fill='#e94560'/><text x='300' y='520' fill='#ffffff' font-size='48' text-anchor='middle' font-family='Arial, sans-serif' letter-spacing='6'>VINYL</text></svg>"
  );
const ENRICH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9,he;q=0.8",
};

let snapshotCache = null;
const enrichCache = new Map();

function readJsonFile(fileName) {
  const fullPath = path.join(DATA_DIR, fileName);
  const text = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(text);
}

function loadSnapshot() {
  if (snapshotCache) {
    return snapshotCache;
  }

  const records = readJsonFile("records.json");
  const searchRecords = fs.existsSync(path.join(DATA_DIR, "search_records.json"))
    ? readJsonFile("search_records.json")
    : records;
  const stores = readJsonFile("stores.json");
  const genres = readJsonFile("genres.json");
  const databaseInfo = readJsonFile("database_info.json");

  snapshotCache = {
    records,
    searchRecords,
    stores,
    genres,
    databaseInfo,
  };

  return snapshotCache;
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
    body: JSON.stringify(payload),
  };
}

function parseIntParam(value, fallback, keyName) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${keyName} parameter. Must be an integer.`);
  }

  return parsed;
}

function clampPerPage(perPage) {
  if (perPage < 1 || perPage > 500) {
    return 50;
  }
  return perPage;
}

function toLowerSafe(value) {
  return String(value || "").toLowerCase();
}

function normalizeInStock(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true" || lowered === "1" || lowered === "yes") {
    return true;
  }
  if (lowered === "false" || lowered === "0" || lowered === "no") {
    return false;
  }

  return null;
}

function parseNumericPrice(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  const match = String(value).match(/([0-9]{1,5}(?:[.,][0-9]{1,2})?)/);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

function extractCoverUrl(html) {
  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<figure[^>]*class=["'][^"']*woocommerce-product-gallery__image[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["']/i,
    /<img[^>]*class=["'][^"']*(?:wp-post-image|attachment-woocommerce_single|woocommerce-main-image|product-main-image)[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i,
    /<img[^>]*data-large_image=["']([^"']+)["'][^>]*>/i,
    /"image"\s*:\s*\[\s*"([^\"]+)"/i,
    /"image"\s*:\s*"([^\"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/\\\//g, "/");
    }
  }

  return null;
}

function normalizeCoverUrl(rawCoverUrl, sourcePageUrl) {
  if (!rawCoverUrl) {
    return null;
  }

  let candidate = String(rawCoverUrl).trim();
  if (!candidate) {
    return null;
  }
  candidate = candidate.replace(/\\\//g, "/");

  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  }

  try {
    const parsed = new URL(candidate, sourcePageUrl);
    const sourceIsHttps = String(sourcePageUrl || "").startsWith("https://");
    if (parsed.protocol === "http:" && sourceIsHttps) {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (/^www\.www\./i.test(parsed.hostname)) {
      parsed.hostname = parsed.hostname.replace(/^www\.www\./i, "www.");
    }
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function hasCoverUrl(record) {
  return Boolean(record && typeof record.cover_url === "string" && record.cover_url.trim());
}

function isLikelyCoverUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(value)) {
    return false;
  }
  const excluded = [
    "logo",
    "header",
    "cart",
    "small-out-of-stock",
    "gift-card",
    "favicon",
    "sprite",
    "banner",
    "placeholder",
    "blank",
    "avatar",
    "icon",
    "android-chrome",
    "apple-touch",
    "mstile",
    "site.webmanifest",
    "cropped-android-chrome",
  ];
  return !excluded.some((word) => value.includes(word));
}

function extractImageCandidatesFromHtml(html, sourcePageUrl) {
  const candidates = [];
  const pushCandidate = (rawValue) => {
    const normalized = normalizeCoverUrl(rawValue, sourcePageUrl);
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
    const srcsetValue = match[1];
    const entries = srcsetValue.split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const firstPart = entry.split(/\s+/)[0];
      if (firstPart) {
        pushCandidate(firstPart);
      }
    }
  }

  return [...new Set(candidates)];
}

function looksLikeBlockedHtml(html) {
  const value = String(html || "").toLowerCase();
  if (!value) {
    return false;
  }

  return (
    value.includes("cloudflare") ||
    value.includes("just a moment") ||
    value.includes("attention required") ||
    value.includes("cf-chl") ||
    value.includes("access denied")
  );
}

function buildSearchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .slice(0, 10);
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
    const endpoint =
      `https://itunes.apple.com/search?entity=album&limit=8&term=` +
      encodeURIComponent(term);

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
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
        item && (item.collectionName || item.trackName)
          ? item.collectionName || item.trackName
          : ""
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

      if (targetArtist && candidateArtistLower === targetArtist) {
        score += 3;
      } else if (targetArtist && candidateArtistLower.includes(targetArtist)) {
        score += 1;
      }

      if (targetAlbum && candidateAlbumLower === targetAlbum) {
        score += 4;
      } else if (targetAlbum && candidateAlbumLower.includes(targetAlbum)) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCover = artCandidate;
      }
    }

    if (!bestCover && results[0]) {
      bestCover =
        toHighResItunesArtwork(results[0].artworkUrl100) ||
        toHighResItunesArtwork(results[0].artworkUrl60) ||
        toHighResItunesArtwork(results[0].artworkUrl30);
    }

    enrichCache.set(cacheKey, bestCover || null);
    return bestCover || null;
  } catch (_error) {
    enrichCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function selectBestCoverCandidate(candidates, record) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const tokens = [...buildSearchTokens(record.artist), ...buildSearchTokens(record.album)];
  let bestUrl = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const url of candidates) {
    const value = String(url || "").toLowerCase();
    let score = 0;

    if (value.includes("/wp-content/uploads/")) score += 3;
    if (value.includes("/cdn/shop/files/")) score += 3;
    if (value.includes("/product") || value.includes("/products")) score += 2;
    if (/\b(?:80x80|100x100|150x150|300x300|thumbnail)\b/.test(value)) score -= 2;

    for (const token of tokens) {
      if (value.includes(token)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  return bestUrl || candidates[0] || null;
}

function buildStoreSearchQuery(record) {
  const artist = String(record.artist || "").trim();
  const album = String(record.album || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[:\-]\s*\d{2,4}.*$/g, " ")
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
      // Ignore parse failures and fallback to store mapping.
    }
  }

  const storeName = String(record.store_name || "").toLowerCase();
  const knownHosts = {
    beatnik: "https://www.beatnik.co.il",
    shablool: "https://shabloolrecords.co.il",
    "third ear": "https://third-ear.com",
    giora: "https://www.giorarecords.co.il",
    "the vinyl room": "https://thevinylroom.co.il",
    hasivoov: "https://hasivoov.co.il",
  };

  return knownHosts[storeName] || "";
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

  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
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

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
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

async function fetchBeatnikCoverFromSearch(record) {
  const query = buildStoreSearchQuery(record);
  if (!query) {
    return null;
  }

  const cacheKey = `beatnik-search:${query.toLowerCase()}`;
  if (enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  const searchUrl = `https://www.beatnik.co.il/?s=${encodeURIComponent(query)}&post_type=product`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

  try {
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: ENRICH_HEADERS,
    });

    if (!res.ok) {
      enrichCache.set(cacheKey, null);
      return null;
    }

    const html = await res.text();
    const candidates = extractImageCandidatesFromHtml(html, searchUrl);
    const cover = selectBestCoverCandidate(candidates, record);
    enrichCache.set(cacheKey, cover || null);
    return cover || null;
  } catch (_error) {
    enrichCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoverFromStoreSearch(record, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: ENRICH_HEADERS,
      });

      if (!res.ok) {
        continue;
      }

      const html = await res.text();
      const candidates = extractImageCandidatesFromHtml(html, searchUrl);
      const cover = selectBestCoverCandidate(candidates, record);
      if (cover) {
        enrichCache.set(cacheKey, cover);
        return cover;
      }
    } catch (_error) {
      // Continue trying the next search URL.
    } finally {
      clearTimeout(timeout);
    }
  }

  enrichCache.set(cacheKey, null);
  return null;
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

function getEnrichmentUrl(record) {
  if (record && typeof record.product_url === "string" && record.product_url.startsWith("http")) {
    return record.product_url;
  }

  if (record && typeof record.store_url === "string" && record.store_url.startsWith("http")) {
    return record.store_url;
  }

  return "";
}

async function fetchMetadataForUrl(url, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : ENRICH_TIMEOUT_MS;
  const bypassCache = Boolean(options.bypassCache);

  if (!url) {
    return null;
  }

  if (!bypassCache && enrichCache.has(url)) {
    return enrichCache.get(url);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: ENRICH_HEADERS,
    });

    if (!res.ok) {
      enrichCache.set(url, null);
      return null;
    }

    const html = await res.text();
    let coverUrl = normalizeCoverUrl(extractCoverUrl(html), url);
    const price = extractPriceValue(html);

    if (!coverUrl) {
      const candidates = extractImageCandidatesFromHtml(html, url);
      coverUrl = selectBestCoverCandidate(candidates, { artist: "", album: "" });
    }

    if (!coverUrl && isThirdEarUrl(url)) {
      const thirdEarCover = await fetchThirdEarOembedCoverFromUrl(url, {
        timeoutMs,
        bypassCache,
      });
      if (thirdEarCover) {
        coverUrl = thirdEarCover;
      }
    }

    const payload = {
      cover_url: coverUrl,
      price,
    };

    // If the source likely returned a bot/challenge page, avoid caching a null forever.
    if (!payload.cover_url && payload.price <= 0 && looksLikeBlockedHtml(html)) {
      return null;
    }

    enrichCache.set(url, payload);
    return payload;
  } catch (_error) {
    enrichCache.set(url, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichMissingCoverFallback(record) {
  if (!record || hasCoverUrl(record)) {
    return;
  }

  const storeName = String(record.store_name || "").toLowerCase();
  if (storeName === "third ear") {
    const url = getEnrichmentUrl(record);
    if (url) {
      const thirdEarCover = await fetchThirdEarOembedCoverFromUrl(url);
      if (thirdEarCover) {
        record.cover_url = thirdEarCover;
        return;
      }
    }
  }

  if (storeName === "beatnik") {
    const beatnikCover = await fetchBeatnikCoverFromSearch(record);
    if (beatnikCover) {
      record.cover_url = beatnikCover;
      return;
    }
  }

  const fallbackCover = await fetchCoverFromStoreSearch(record);
  if (fallbackCover) {
    record.cover_url = fallbackCover;
    return;
  }

  const itunesCover = await fetchItunesCover(record);
  if (itunesCover) {
    record.cover_url = itunesCover;
  }
}

function withGuaranteedCover(record) {
  const sourceUrl = getEnrichmentUrl(record);
  const normalized = normalizeCoverUrl(record.cover_url, sourceUrl);
  const normalizedInStock = normalizeInStock(record && record.in_stock);
  if (normalized && isLikelyCoverUrl(normalized)) {
    return {
      ...record,
      in_stock: normalizedInStock,
      cover_url: normalized,
    };
  }

  return {
    ...record,
    in_stock: normalizedInStock,
    cover_url: DEFAULT_COVER_URL,
  };
}

async function enrichRecord(record) {
  if (!record) {
    return;
  }

  const hasPrice = Number(record.price || 0) > 0;
  const hasCover = hasCoverUrl(record);
  if (hasPrice && hasCover) {
    return;
  }

  const url = getEnrichmentUrl(record);
  if (!url) {
    await enrichMissingCoverFallback(record);
    return;
  }

  const metadata = await fetchMetadataForUrl(url);
  if (!metadata) {
    await enrichMissingCoverFallback(record);
    return;
  }

  if (!hasCover && metadata.cover_url) {
    record.cover_url = metadata.cover_url;
  }

  if (!hasPrice && metadata.price > 0) {
    record.price = metadata.price;
  }

  if (!record.cover_url) {
    await enrichMissingCoverFallback(record);
  }

  if (!record.product_url && url) {
    record.product_url = url;
  }
}

async function enrichSearchRecords(records) {
  const enrichmentPriority = (record) => {
    let score = 0;
    if (!record.cover_url) {
      score += 2;
    }
    if (Number(record.price || 0) <= 0) {
      score += 1;
    }
    return score;
  };

  const queue = records
    .filter((record) => Number(record.price || 0) <= 0 || !record.cover_url)
    .sort((a, b) => enrichmentPriority(b) - enrichmentPriority(a))
    .slice(0, ENRICH_MAX_ITEMS);

  if (queue.length === 0) {
    return;
  }

  let index = 0;

  const workers = Array.from(
    { length: Math.min(ENRICH_CONCURRENCY, queue.length) },
    async () => {
      while (index < queue.length) {
        const next = queue[index];
        index += 1;
        await enrichRecord(next);
      }
    }
  );

  await Promise.all(workers);
}

function applySearchFiltering(records, params) {
  let filtered = records;

  const q = (params.get("q") || "").trim();
  const genre = (params.get("genre") || "").trim();
  const source = (params.get("source") || "").trim();
  const storeFilter = (params.get("store_filter") || "").trim();
  const inStockParam = (params.get("in_stock") || "").trim().toLowerCase();

  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((item) => {
      return toLowerSafe(item.artist).includes(needle) || toLowerSafe(item.album).includes(needle);
    });
  }

  if (genre) {
    const genreNeedle = genre.toLowerCase();
    filtered = filtered.filter((item) => toLowerSafe(item.genre).includes(genreNeedle));
  }

  if (storeFilter) {
    filtered = filtered.filter((item) => String(item.store_name || "") === storeFilter);
  } else if (source === "Discogs") {
    filtered = filtered.filter((item) => String(item.store_name || "") === "Discogs");
  } else if (source === "local") {
    filtered = filtered.filter((item) => String(item.store_name || "") !== "Discogs");
  }

  if (inStockParam === "1" || inStockParam === "true" || inStockParam === "yes") {
    filtered = filtered.filter((item) => normalizeInStock(item.in_stock) === true);
  } else if (inStockParam === "0" || inStockParam === "false" || inStockParam === "no") {
    filtered = filtered.filter((item) => normalizeInStock(item.in_stock) === false);
  }

  return filtered;
}

function getApiPath(event) {
  const eventPath = event.path || "";

  if (eventPath.startsWith("/.netlify/functions/api")) {
    const mapped = eventPath.replace("/.netlify/functions/api", "/api");
    return mapped || "/api";
  }

  if (eventPath.startsWith("/api")) {
    return eventPath;
  }

  if (event.rawUrl) {
    try {
      const pathname = new URL(event.rawUrl).pathname;
      if (pathname.startsWith("/.netlify/functions/api")) {
        const mapped = pathname.replace("/.netlify/functions/api", "/api");
        return mapped || "/api";
      }
      if (pathname.startsWith("/api")) {
        return pathname;
      }
    } catch (_error) {
      return "/api";
    }
  }

  return "/api";
}

function getQueryParams(event) {
  if (event.rawQuery && event.rawQuery.length > 0) {
    return new URLSearchParams(event.rawQuery);
  }

  const params = new URLSearchParams();
  const map = event.queryStringParameters || {};

  for (const [key, value] of Object.entries(map)) {
    if (value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  }

  return params;
}

async function handleSearch(snapshot, params) {
  const q = (params.get("q") || "").trim();
  const source = (params.get("source") || "").trim();

  if (source === "live") {
    const pageLive = Math.max(1, parseIntParam(params.get("page"), 1, "page"));
    const perPageLive = clampPerPage(parseIntParam(params.get("per_page"), 50, "per_page"));
    if (q.length < 2) {
      return response(200, {
        records: [],
        total: 0,
        page: pageLive,
        per_page: perPageLive,
        total_pages: 0,
        has_next: false,
        has_prev: false,
        source: "live",
        message: "Type at least 2 characters for live store scraping",
      });
    }

    return response(200, {
      records: [],
      total: 0,
      page: pageLive,
      per_page: perPageLive,
      total_pages: 0,
      has_next: false,
      has_prev: false,
      source: "live",
      message: "Live source is unavailable in Netlify snapshot mode",
    });
  }

  let page = parseIntParam(params.get("page"), 1, "page");
  let perPage = parseIntParam(params.get("per_page"), 50, "per_page");

  if (page < 1) {
    page = 1;
  }
  perPage = clampPerPage(perPage);

  const filtered = applySearchFiltering(snapshot.searchRecords, params);
  const total = filtered.length;
  const offset = (page - 1) * perPage;
  const pageItems = filtered.slice(offset, offset + perPage);
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  // Enrichment does remote fetches and can be expensive in serverless environments.
  // Keep default search fast/stable and only enrich when explicitly requested.
  if (params.get("enrich") === "1") {
    await enrichSearchRecords(pageItems);
  }

  const outputRecords = pageItems.map((record) => withGuaranteedCover(record));

  return response(200, {
    records: outputRecords,
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  });
}

async function handleRecord(snapshot, params) {
  const id = (params.get("id") || "").trim();
  if (!id) {
    return response(400, { error: "Missing id parameter" });
  }

  const record = snapshot.records.find((item) => String(item.id) === id);
  if (!record) {
    return response(404, { error: `Record not found: ${id}` });
  }

  await enrichRecord(record);

  if (!hasCoverUrl(record)) {
    const url = getEnrichmentUrl(record);
    if (url) {
      const metadata = await fetchMetadataForUrl(url, {
        timeoutMs: 8000,
        bypassCache: true,
      });
      if (metadata && metadata.cover_url) {
        record.cover_url = metadata.cover_url;
      }
      if (metadata && Number(record.price || 0) <= 0 && metadata.price > 0) {
        record.price = metadata.price;
      }
    }
  }

  if (!hasCoverUrl(record)) {
    const fallbackCover = await fetchCoverFromStoreSearch(record, {
      timeoutMs: 8000,
      bypassCache: true,
    });
    if (fallbackCover) {
      record.cover_url = fallbackCover;
    }
  }

  if (!hasCoverUrl(record)) {
    const itunesCover = await fetchItunesCover(record, {
      timeoutMs: 4000,
      bypassCache: true,
    });
    if (itunesCover) {
      record.cover_url = itunesCover;
    }
  }

  const searchRecord = snapshot.searchRecords.find((item) => String(item.id) === id);
  if (searchRecord) {
    if (hasCoverUrl(record)) {
      searchRecord.cover_url = record.cover_url;
    }
    if (Number(searchRecord.price || 0) <= 0 && Number(record.price || 0) > 0) {
      searchRecord.price = record.price;
    }
    if (!searchRecord.product_url && record.product_url) {
      searchRecord.product_url = record.product_url;
    }
  }

  return response(200, {
    record: withGuaranteedCover(record),
  });
}

function handleAllRecords(snapshot, params) {
  let page = parseIntParam(params.get("page"), 1, "page");
  let perPage = parseIntParam(params.get("per_page"), 100, "per_page");

  if (page < 1) {
    page = 1;
  }
  if (perPage > 500) {
    perPage = 500;
  }
  if (perPage < 1) {
    perPage = 100;
  }

  const total = snapshot.records.length;
  const offset = (page - 1) * perPage;
  const records = snapshot.records.slice(offset, offset + perPage).map((record) => withGuaranteedCover(record));
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  return response(200, {
    total_records: total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    records,
  });
}

exports.handler = async (event) => {
  try {
    const snapshot = loadSnapshot();
    const apiPath = getApiPath(event);
    const endpoint = apiPath.replace(/^\/api\/?/, "");

    const params = getQueryParams(event);

    if (endpoint === "" || endpoint === "health") {
      return response(200, {
        ok: true,
        records: snapshot.records.length,
        stores: snapshot.stores.length,
        genres: snapshot.genres.length,
      });
    }

    if (endpoint === "stores") {
      return response(200, { stores: snapshot.stores });
    }

    if (endpoint === "genres") {
      return response(200, { genres: snapshot.genres });
    }

    if (endpoint === "database-info") {
      return response(200, snapshot.databaseInfo);
    }

    if (endpoint === "record") {
      return await handleRecord(snapshot, params);
    }

    if (endpoint === "all-records") {
      return handleAllRecords(snapshot, params);
    }

    if (endpoint === "search") {
      return await handleSearch(snapshot, params);
    }

    return response(404, { error: `Unknown API route: /api/${endpoint}` });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return response(400, { error: error.message });
    }

    return response(500, {
      error: "Failed to serve snapshot API",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
