#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9,he;q=0.8",
};

const VALID_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"];
const INVALID_COVER_TOKENS = [
  "logo",
  "favicon",
  "sprite",
  "banner",
  "placeholder",
  "avatar",
  "facebook",
  "instagram",
  "whatsapp",
  "youtube",
  "phone",
  "contact",
  "menu",
  "social",
  "share",
];

function readJson(filePath) {
  const absolute = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function writeJson(filePath, payload) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function isValidHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

function getEnrichmentUrl(record) {
  if (isValidHttpUrl(record && record.product_url)) {
    return String(record.product_url).trim();
  }
  if (isValidHttpUrl(record && record.store_url)) {
    return String(record.store_url).trim();
  }
  return "";
}

function normalizeCoverUrl(rawCoverUrl, sourcePageUrl) {
  if (!rawCoverUrl) {
    return null;
  }

  let candidate = String(rawCoverUrl)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
  if (!candidate) {
    return null;
  }

  candidate = candidate.replace(/\\\//g, "/").replace(/^['"]+|['"]+$/g, "");
  if (!candidate || /^data:/i.test(candidate) || /^javascript:/i.test(candidate)) {
    return null;
  }

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
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function isLikelyCoverUrl(url) {
  const normalized = String(url || "").trim();
  if (!isValidHttpUrl(normalized)) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_error) {
    return false;
  }

  const pathLower = String(parsed.pathname || "").toLowerCase();
  const searchLower = String(parsed.search || "").toLowerCase();
  const lowered = `${parsed.hostname.toLowerCase()}${pathLower}?${searchLower}`;

  const hasKnownImageExtension = VALID_IMAGE_EXTENSIONS.some((ext) => pathLower.endsWith(ext));
  const hasImageHints =
    /(?:format|fm|ext)=(?:jpe?g|png|webp|avif|gif)/i.test(searchLower) ||
    /(?:wp-content\/uploads|cdn\/shop\/files|cloudinary|\/images?\/|\/products?\/)/i.test(pathLower);

  if (!hasKnownImageExtension && !hasImageHints) {
    return false;
  }

  if (INVALID_COVER_TOKENS.some((token) => lowered.includes(token))) {
    return false;
  }

  if (/(?:dummyimage\.com|via\.placeholder\.com|placehold\.co)/i.test(lowered)) {
    return false;
  }

  return true;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractPriceValue(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return 0;
  }

  const patterns = [
    /"price"\s*:\s*"?([0-9]{1,6}(?:[.,][0-9]{1,2})?)"?/i,
    /product:price:amount[^>]*content=["']([0-9]{1,6}(?:[.,][0-9]{1,2})?)["']/i,
    /\b([0-9]{1,6}(?:[.,][0-9]{1,2})?)\s*(?:₪|ILS)\b/i,
    /(?:₪|ILS)\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i,
    /class=["'][^"']*(?:price|amount)[^"']*["'][^>]*>[^<]*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match || !match[1]) {
      continue;
    }

    const numeric = Number.parseFloat(match[1].replace(/,/g, "."));
    if (!Number.isFinite(numeric)) {
      continue;
    }

    if (numeric >= 5 && numeric <= 20000) {
      return Number(numeric.toFixed(2));
    }
  }

  return 0;
}

function extractArtistFromText(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return "";
  }

  const patterns = [
    /"byArtist"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]{2,120})"/i,
    /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]{2,120})"/i,
    /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']{2,120})["']/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function extractCoverCandidates(text, sourcePageUrl) {
  const source = String(text || "");
  if (!source.trim()) {
    return [];
  }

  const pushCandidate = (rawValue, out, seen) => {
    const normalized = normalizeCoverUrl(rawValue, sourcePageUrl);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    out.push(normalized);
  };

  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /data-large_image=["']([^"']+)["']/gi,
    /"image"\s*:\s*\[\s*"([^"]+)"/gi,
    /"image"\s*:\s*"([^"]+)"/gi,
    /<img[^>]*(?:src|data-src|data-lazy-src)=["']([^"']+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"']*)?)["'][^>]*>/gi,
    /<a[^>]*href=["']([^"']+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"']*)?)["'][^>]*>/gi,
  ];

  const out = [];
  const seen = new Set();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      pushCandidate(match[1], out, seen);
      if (out.length >= 30) {
        break;
      }
    }
    if (out.length >= 30) {
      break;
    }
  }

  for (const srcsetMatch of source.matchAll(/srcset=["']([^"']+)["']/gi)) {
    const srcset = srcsetMatch && srcsetMatch[1] ? srcsetMatch[1] : "";
    const entries = srcset.split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const candidate = entry.split(/\s+/)[0];
      pushCandidate(candidate, out, seen);
    }
  }

  const absoluteMatches =
    source.match(/https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^\s"'<>]*)?/gi) || [];
  for (const absoluteCandidate of absoluteMatches) {
    pushCandidate(absoluteCandidate, out, seen);
  }

  return out
    .sort((a, b) => Number(isLikelyCoverUrl(b)) - Number(isLikelyCoverUrl(a)))
    .slice(0, 40);
}

function parseArtistFromAlbum(album) {
  const value = String(album || "").trim();
  if (!value) {
    return "";
  }

  const match = value.match(/^([^\-–]{2,100})\s*[\-–]\s*.+$/);
  return match ? match[1].trim() : "";
}

function parseArtistFromProductUrl(url) {
  if (!isValidHttpUrl(url)) {
    return "";
  }

  let slug = "";
  try {
    const parsed = new URL(String(url));
    const segments = parsed.pathname.split("/").filter(Boolean);
    slug = segments.length > 0 ? segments[segments.length - 1] : "";
  } catch (_error) {
    return "";
  }

  if (!slug) {
    return "";
  }

  const stop = new Set([
    "vinyl",
    "lp",
    "lps",
    "cd",
    "new",
    "used",
    "pre",
    "order",
    "edition",
    "colored",
    "colour",
    "color",
    "press",
    "usa",
    "uk",
    "eu",
    "import",
    "reissue",
    "limited",
    "anniversary",
    "box",
    "set",
    "single",
    "double",
    "triple",
    "gram",
    "black",
    "white",
    "red",
    "blue",
    "green",
    "gold",
    "silver",
    "pink",
    "orange",
    "yellow",
  ]);

  const tokens = slug.split("-").filter(Boolean);
  const selected = [];

  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (stop.has(lowered)) {
      continue;
    }
    if (/^\d{4}$/.test(lowered)) {
      continue;
    }
    if (/^\d+(?:x\d+)?$/.test(lowered)) {
      continue;
    }
    if (lowered.length <= 1) {
      continue;
    }
    selected.push(token);
    if (selected.length >= 3) {
      break;
    }
  }

  if (selected.length === 0) {
    return "";
  }

  return selected.map((token) => token[0].toUpperCase() + token.slice(1)).join(" ");
}

function extractStockStatus(html) {
  const source = String(html || "");
  if (!source.trim()) return null;

  // JSON-LD / schema.org availability (most reliable)
  const jldMatch = source.match(/"availability"\s*:\s*"([^"]{1,120})"/i);
  if (jldMatch) {
    const val = jldMatch[1].toLowerCase();
    if (/instock|in.stock|instoreonly|onlineonly|limitedavailability/.test(val)) return true;
    if (/outofstock|out.of.stock|soldout|sold.out|discontinued/.test(val)) return false;
  }

  // OG meta availability
  const ogMatch =
    source.match(/property=["']og:availability["'][^>]*content=["']([^"']{1,40})["']/i) ||
    source.match(/content=["']([^"']{1,40})["'][^>]*property=["']og:availability["']/i);
  if (ogMatch) {
    const val = ogMatch[1].toLowerCase().replace(/\s/g, "");
    if (val === "instock" || val === "available") return true;
    if (val === "outofstock" || val === "oos") return false;
  }

  // Hebrew explicit out-of-stock markers
  if (/אזל\s*מהמלאי|אין\s*במלאי|לא\s*במלאי/.test(source)) return false;

  // English patterns (only strong signals)
  const lc = source.toLowerCase();
  if (/\bout[\s-]of[\s-]stock\b|\bsold[\s-]out\b/.test(lc)) return false;

  return null;
}

function buildGeneratedCoverUrl(_record) {
  return "";
}

function makeBypassUrl(url) {
  const normalized = String(url || "").replace(/^https?:\/\//i, "");
  return `https://r.jina.ai/http://${normalized}`;
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, status: response.status, text: "", finalUrl: response.url || url };
    }

    return {
      ok: true,
      status: response.status,
      text: await response.text(),
      finalUrl: response.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      text: "",
      finalUrl: url,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithFallback(url, options = {}) {
  const timeoutMs = toNumber(options.timeoutMs, 4500);
  const retries = Math.max(0, toNumber(options.retries, 1));
  const useBypass = Boolean(options.useBypass);

  let last = { ok: false, status: null, text: "", finalUrl: url, mode: "direct" };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await fetchText(url, timeoutMs);
    if (last.ok && last.text) {
      return { ...last, mode: "direct" };
    }
  }

  if (!useBypass) {
    return { ...last, mode: "direct" };
  }

  const bypassUrl = makeBypassUrl(url);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await fetchText(bypassUrl, timeoutMs + 1500);
    if (last.ok && last.text) {
      return { ...last, mode: "bypass" };
    }
  }

  return { ...last, mode: "bypass" };
}

async function probeImageUrl(url, timeoutMs = 3000) {
  if (!isLikelyCoverUrl(url)) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));

  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
    });

    if (response.status === 405 || response.status === 403 || response.status === 401) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: DEFAULT_HEADERS,
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      return false;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType) {
      return true;
    }

    return contentType.includes("image/");
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeArtworkUrl(url, size = 600) {
  const text = String(url || "").trim();
  if (!text) {
    return "";
  }

  return text
    .replace(/\d+x\d+bb\.jpg$/i, `${size}x${size}bb.jpg`)
    .replace(/\d+x\d+bb-\d+\.jpg$/i, `${size}x${size}bb.jpg`);
}

function scoreTextMatch(candidate, query) {
  const c = String(candidate || "").toLowerCase();
  const q = String(query || "").toLowerCase();
  if (!c || !q) {
    return 0;
  }

  const tokens = q.split(/[^a-z0-9\u0590-\u05ff]+/).filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;
  for (const token of tokens) {
    if (c.includes(token)) {
      score += 1;
    }
  }

  return score / tokens.length;
}

async function fetchItunesCandidate(record, options = {}) {
  const timeoutMs = toNumber(options.timeoutMs, 3500);
  const artist = String(record.artist || "").trim();
  const album = String(record.album || "").trim();
  const queries = [];
  if (artist && album) queries.push(`${artist} ${album}`);
  if (album) queries.push(album);

  for (const query of queries) {
    const endpoint = `https://itunes.apple.com/search?entity=album&limit=10&term=${encodeURIComponent(query)}`;
    const result = await fetchText(endpoint, timeoutMs);
    if (!result.ok || !result.text) {
      continue;
    }

    let payload = null;
    try {
      payload = JSON.parse(result.text);
    } catch (_error) {
      payload = null;
    }

    const list = Array.isArray(payload && payload.results) ? payload.results : [];
    let best = null;

    for (const item of list) {
      const cover = normalizeArtworkUrl(item && item.artworkUrl100);
      if (!isLikelyCoverUrl(cover)) {
        continue;
      }

      const scoreAlbum = scoreTextMatch(item && item.collectionName, album || query);
      const scoreArtist = artist ? scoreTextMatch(item && item.artistName, artist) : 0.6;
      const score = scoreAlbum * 0.7 + scoreArtist * 0.3;

      if (!best || score > best.score) {
        const releaseDateRaw = String(item && item.releaseDate ? item.releaseDate : "");
        const yearStr = releaseDateRaw.slice(0, 4);
        best = {
          score,
          cover_url: cover,
          artist: String(item && item.artistName ? item.artistName : "").trim(),
          genre: String(item && item.primaryGenreName ? item.primaryGenreName : "").trim() || null,
          year: yearStr.length === 4 && /^\d{4}$/.test(yearStr) ? Number(yearStr) : null,
          source: "itunes",
        };
      }
    }

    if (best && best.score >= 0.45) {
      return best;
    }
  }

  return null;
}

module.exports = {
  readJson,
  writeJson,
  toNumber,
  isValidHttpUrl,
  getEnrichmentUrl,
  normalizeCoverUrl,
  isLikelyCoverUrl,
  extractPriceValue,
  extractStockStatus,
  extractArtistFromText,
  extractCoverCandidates,
  parseArtistFromAlbum,
  parseArtistFromProductUrl,
  buildGeneratedCoverUrl,
  fetchTextWithFallback,
  probeImageUrl,
  fetchItunesCandidate,
};
