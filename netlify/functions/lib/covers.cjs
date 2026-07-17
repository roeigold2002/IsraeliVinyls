"use strict";

/**
 * Cover-art URL validation, normalization, and candidate scoring.
 * Used at build time (manual-index hydration) and by the record-detail
 * enrichment path. Never used on the search hot path.
 */

const { decodeBasicHtmlEntities, buildSearchTokens } = require("./text.cjs");
const { getEnrichmentUrl } = require("./urls.cjs");

const COVER_PLACEHOLDER_HOST_RE = /(?:dummyimage\.com|via\.placeholder\.com|placehold\.co)/i;

const DEFAULT_COVER_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#16213e'/><stop offset='100%' stop-color='#0f3460'/></linearGradient></defs><rect width='600' height='600' fill='url(#g)'/><circle cx='300' cy='300' r='170' fill='none' stroke='#e94560' stroke-width='24'/><circle cx='300' cy='300' r='35' fill='#e94560'/><text x='300' y='520' fill='#ffffff' font-size='48' text-anchor='middle' font-family='Arial, sans-serif' letter-spacing='6'>VINYL</text></svg>"
  );

function cleanRawCoverCandidate(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  value = decodeBasicHtmlEntities(value).replace(/\\\//g, "/").trim();
  if (!value) {
    return "";
  }

  if (value.includes(")](")) {
    const segments = value.split(")](");
    value = segments[segments.length - 1] || value;
  }

  return value
    .replace(/^[\("'\[]+/, "")
    .replace(/[\)"'\] ]+$/g, "")
    .trim();
}

function normalizeCoverUrl(rawCoverUrl, sourcePageUrl) {
  if (!rawCoverUrl) {
    return null;
  }

  let candidate = cleanRawCoverCandidate(rawCoverUrl);
  if (!candidate) {
    return null;
  }
  candidate = candidate.replace(/\s+/g, "").trim();

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

function isGeneratedPlaceholderCoverUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return true;
  }
  const lowered = value.toLowerCase();
  return lowered.startsWith("data:image/svg+xml") || COVER_PLACEHOLDER_HOST_RE.test(lowered);
}

const EXCLUDED_COVER_TOKENS = [
  "logo", "header", "small-out-of-stock", "gift-card", "favicon", "sprite",
  "banner", "placeholder", "blank", "avatar", "icon", "android-chrome",
  "apple-touch", "mstile", "site.webmanifest", "cropped-android-chrome",
  "facebook", "instagram", "whatsapp", "youtube", "social",
  "dummyimage.com", "via.placeholder", "placehold.co",
];

function isLikelyCoverUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(value)) {
    return false;
  }
  if (EXCLUDED_COVER_TOKENS.some((word) => value.includes(word))) {
    return false;
  }
  if (/(?:\/cart(?:[/?#]|$)|add-to-cart|shopping-cart|cart-icon|mini-cart)/.test(value)) {
    return false;
  }
  return true;
}

/** Full pipeline: clean → normalize → reject placeholders/non-covers. */
function resolveUsableCoverUrl(rawCoverUrl, sourcePageUrl) {
  const normalized = normalizeCoverUrl(rawCoverUrl, sourcePageUrl);
  if (!normalized) {
    return null;
  }
  if (isGeneratedPlaceholderCoverUrl(normalized) || !isLikelyCoverUrl(normalized)) {
    return null;
  }
  return normalized;
}

function hasCoverUrl(record) {
  if (!record) {
    return false;
  }
  return Boolean(resolveUsableCoverUrl(record.cover_url, getEnrichmentUrl(record)));
}

const COVER_REFERENCE_TOKEN_STOPWORDS = new Set([
  "product", "products", "shop", "records", "record", "vinyl", "music",
  "page", "pages", "category", "item", "post", "type", "store",
]);

function buildCoverReferenceTokens(referenceUrl) {
  const raw = String(referenceUrl || "").trim();
  if (!raw) {
    return [];
  }

  let value = raw;
  try {
    const parsed = new URL(raw);
    value = `${decodeURIComponent(parsed.pathname || "")} ${decodeURIComponent(parsed.search || "")}`;
  } catch (_error) {
    value = raw;
  }

  return buildSearchTokens(value).filter((token) => !COVER_REFERENCE_TOKEN_STOPWORDS.has(token));
}

/**
 * Picks the most plausible product cover among scraped image candidates by
 * scoring CDN path shape and token overlap with the record/reference URL.
 */
function selectBestCoverCandidate(candidates, record, options = {}) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const recordArtistTokens = buildSearchTokens(record && record.artist);
  const recordAlbumTokens = buildSearchTokens(record && record.album);
  const referenceTokens = buildCoverReferenceTokens(options.referenceUrl);
  const tokens = [...new Set([...recordArtistTokens, ...recordAlbumTokens, ...referenceTokens])];
  let bestUrl = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const url of candidates) {
    const value = String(url || "").toLowerCase();
    let score = 0;
    let tokenHits = 0;

    if (value.includes("/wp-content/uploads/")) score += 3;
    if (value.includes("/cdn/shop/files/")) score += 3;
    if (value.includes("/product") || value.includes("/products")) score += 2;
    if (/\b(?:80x80|100x100|150x150|300x300|thumbnail)\b/.test(value)) score -= 2;
    if (/(?:prodimage[_-]?\d+)/.test(value)) score -= 2;
    if (/(?:logo|icon|phone|contact|menu|facebook|instagram|whatsapp|youtube|telegram|social|share)/.test(value)) {
      score -= 6;
    }

    for (const token of tokens) {
      if (value.includes(token)) {
        score += 2;
        tokenHits += 1;
      }
    }

    if (tokenHits > 0) {
      score += Math.min(4, tokenHits);
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  if (!bestUrl || bestScore <= 0) {
    return null;
  }
  return bestUrl;
}

module.exports = {
  DEFAULT_COVER_URL,
  COVER_PLACEHOLDER_HOST_RE,
  cleanRawCoverCandidate,
  normalizeCoverUrl,
  isGeneratedPlaceholderCoverUrl,
  isLikelyCoverUrl,
  resolveUsableCoverUrl,
  hasCoverUrl,
  buildCoverReferenceTokens,
  selectBestCoverCandidate,
};
