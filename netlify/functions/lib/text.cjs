"use strict";

/**
 * Text normalization and tokenization shared by the build-time bundle
 * builder (scripts/build_search_bundle.cjs) and the runtime API.
 *
 * Everything here is pure and deterministic: the same functions run at
 * build time to produce the search bundle and at query time to normalize
 * user input, which guarantees that indexed tokens and query tokens agree.
 */

const ARTIST_NOISE_TOKEN_RE =
  /(original\s+price|current\s+price|מבצע|חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|עדכנו\s*אותי|מידע\s*נוסף|פרטים\s*נוספים|במלאי|out\s*of\s*stock|sold\s*out|in\s*stock)/i;
const LEADING_MEDIA_TOKEN_RE =
  /^(?:(?:\d{1,2}\s*x?\s*)?(?:LP|EP|CD|DVD|Blu[\s-]?ray|BOX\s*SET|VINYL)\s+)+/gi;
const PRICE_FRAGMENT_RE =
  /(?:\b(?:original\s+price\s+was|current\s+price\s+is)\b\s*:?\s*[^.;]+)|(?:(?:[₪$€]|ILS|NIS|USD|EUR)\s*[0-9]{1,5}(?:[.,][0-9]{1,2})?)|(?:[0-9]{1,5}(?:[.,][0-9]{1,2})?\s*(?:₪|ILS|NIS|USD|EUR))/gi;
const PROMO_AND_STOCK_PREFIX_RE =
  /^(?:\s*(?:חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|מבצע!?\s*\d{0,3}%?\s*הנחה?|out\s*of\s*stock|sold\s*out|instock|in\s*stock|עדכנו\s*אותי\s*כשחזר\s*למלאי|מידע\s*נוסף|פרטים\s*נוספים|מחיר\s*אונליין|מחיר\s*:|הוספה\s*לסל|הוסף\s*לסל|לצפייה\s*מהירה|צפייה\s*מהירה|קנה\s*עכשיו|add\s*to\s*cart|quick\s*view|buy\s*now)\s*)+/i;
const INLINE_NOISE_TOKEN_RE =
  /(חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|לא\s*במלאי|מידע\s*נוסף|פרטים\s*נוספים|במלאי|הוספה\s*לסל|הוסף\s*לסל|לצפייה\s*מהירה|צפייה\s*מהירה|out\s*of\s*stock|sold\s*out|in\s*stock|add\s*to\s*cart|quick\s*view)/gi;

// Hebrew final letters fold to their medial forms so "אלבום" and a final-form
// variant tokenize identically regardless of word position or user input.
const HEBREW_FINALS = new Map([
  ["ך", "כ"], // ך → כ
  ["ם", "מ"], // ם → מ
  ["ן", "נ"], // ן → נ
  ["ף", "פ"], // ף → פ
  ["ץ", "צ"], // ץ → צ
]);
const HEBREW_FINALS_RE = /[ךםןףץ]/g;

// Apostrophe-like marks are removed (not split on) so ג'אז → גאז and
// don't → dont; searching either form matches.
const APOSTROPHE_RE = /['’׳״`]/g;

function foldHebrewFinals(value) {
  return String(value || "").replace(HEBREW_FINALS_RE, (ch) => HEBREW_FINALS.get(ch) || ch);
}

function maybeFixMojibake(value) {
  const source = String(value || "");
  if (!source || !/[ÃÂâ]/.test(source)) {
    return source;
  }

  try {
    const repaired = Buffer.from(source, "latin1").toString("utf8");
    if (repaired && repaired !== source && !repaired.includes("�")) {
      return repaired;
    }
  } catch (_error) {
    return source;
  }

  return source;
}

function decodeBasicHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8212;|&mdash;/gi, "-")
    .replace(/&#8362;|&shekel;/gi, "₪");
}

function normalizeDisplayText(value, options = {}) {
  const stripLeadingFormat = Boolean(options.stripLeadingFormat);

  let text = maybeFixMojibake(decodeBasicHtmlEntities(value));
  if (!text) {
    return "";
  }

  text = text
    .replace(/[​-‏‪-‮﻿]/g, "")
    .replace(/\\\//g, "/")
    .replace(PROMO_AND_STOCK_PREFIX_RE, " ")
    .replace(INLINE_NOISE_TOKEN_RE, " ")
    .replace(PRICE_FRAGMENT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripLeadingFormat) {
    text = text.replace(LEADING_MEDIA_TOKEN_RE, "").trim();
  }

  text = text
    .replace(/^[-–—|/:;,.\s]+/, "")
    .replace(/[-–—|/:;,.\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function isLikelyNoisyArtist(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }
  if (ARTIST_NOISE_TOKEN_RE.test(text)) {
    return true;
  }
  if (/[₪$€]/.test(text)) {
    return true;
  }
  return false;
}

function isPlausibleArtistName(value) {
  const text = normalizeDisplayText(value, { stripLeadingFormat: true });
  if (!text || text.length < 2 || text.length > 140) {
    return false;
  }
  if (isLikelyNoisyArtist(text)) {
    return false;
  }
  if (/^(?:lp|ep|cd|dvd|vinyl|box\s*set)$/i.test(text)) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(text);
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitArtistAlbumFromText(value) {
  const source = normalizeDisplayText(value, { stripLeadingFormat: true });
  if (!source) {
    return null;
  }

  const delimiters = ["/", "|", " – ", " - "];

  for (const delimiter of delimiters) {
    const index = source.indexOf(delimiter);
    if (index < 2) {
      continue;
    }

    const artist = normalizeDisplayText(source.slice(0, index), { stripLeadingFormat: true });
    const album = normalizeDisplayText(source.slice(index + delimiter.length), {
      stripLeadingFormat: true,
    });

    if (!artist || !album || !isPlausibleArtistName(artist)) {
      continue;
    }

    return { artist, album };
  }

  return null;
}

function deriveArtistFromProductUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return "";
    }

    const slug = decodeURIComponent(parts[parts.length - 1] || "");
    if (!slug || slug.length < 2 || /\.[a-z]{2,5}$/i.test(slug)) {
      return "";
    }

    const stop = new Set([
      "vinyl", "lp", "lps", "cd", "dvd", "box", "set", "edition", "limited",
      "deluxe", "colored", "colour", "color", "reissue", "anniversary", "the", "a",
    ]);

    const tokens = slug
      .split(/[-_]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !stop.has(token.toLowerCase()))
      .filter((token) => !/^\d{1,4}$/.test(token));

    if (tokens.length === 0) {
      return "";
    }

    const candidate = tokens
      .slice(0, 4)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ");

    return isPlausibleArtistName(candidate) ? candidate : "";
  } catch (_error) {
    return "";
  }
}

/**
 * Repairs artist/album fields in place. Returns true when a field changed.
 * Runs at build time; the runtime only calls it for lazily-accessed detail
 * records that were exported before the bundle builder existed.
 */
function normalizeRecordTextFields(record) {
  if (!record) {
    return false;
  }

  const originalArtist = String(record.artist || "").trim();
  const originalAlbum = String(record.album || "").trim();

  let artist = normalizeDisplayText(originalArtist, { stripLeadingFormat: true });
  let album = normalizeDisplayText(originalAlbum, { stripLeadingFormat: true });

  if ((!artist || isLikelyNoisyArtist(artist)) && album) {
    const split = splitArtistAlbumFromText(album);
    if (split) {
      artist = split.artist;
      album = split.album;
    }
  }

  if ((!artist || isLikelyNoisyArtist(artist)) && record.product_url) {
    const derivedArtist = deriveArtistFromProductUrl(record.product_url);
    if (derivedArtist) {
      artist = derivedArtist;
    }
  }

  if (artist && album.includes("/")) {
    const split = splitArtistAlbumFromText(album);
    if (split) {
      const splitArtistComparable = normalizeComparableText(split.artist);
      const currentArtistComparable = normalizeComparableText(artist);
      if (
        splitArtistComparable &&
        currentArtistComparable &&
        (splitArtistComparable === currentArtistComparable ||
          splitArtistComparable.includes(currentArtistComparable) ||
          currentArtistComparable.includes(splitArtistComparable))
      ) {
        album = split.album;
      }
    }
  }

  const changed =
    (artist && artist !== originalArtist) || (album && album !== originalAlbum);

  if (artist && artist !== originalArtist) {
    record.artist = artist;
  }
  if (album && album !== originalAlbum) {
    record.album = album;
  }

  return changed;
}

/**
 * Canonical searchable form of a string: lowercase, apostrophes removed,
 * Hebrew finals folded, punctuation collapsed to single spaces.
 * Index tokens, query tokens, and verification haystacks all derive from
 * this one function.
 */
function toSearchable(value) {
  return foldHebrewFinals(
    String(value || "")
      .toLowerCase()
      .replace(APOSTROPHE_RE, "")
  )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_TOKEN_LENGTH = 2;
const MAX_QUERY_TOKENS = 12;

function buildSearchTokens(value) {
  return toSearchable(value)
    .split(" ")
    .filter((token) => token.length >= MIN_TOKEN_LENGTH)
    .slice(0, MAX_QUERY_TOKENS);
}

/**
 * Query terms for matching: tokenized form when possible, raw whitespace
 * split otherwise (so single-character queries still work via scan).
 */
function parseQueryTerms(value) {
  const tokenized = buildSearchTokens(value);
  if (tokenized.length > 0) {
    return [...new Set(tokenized)];
  }

  const fallback = toSearchable(value).split(" ").filter(Boolean);
  return [...new Set(fallback)];
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
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLowerSafe(value) {
  return String(value || "").toLowerCase();
}

module.exports = {
  maybeFixMojibake,
  decodeBasicHtmlEntities,
  normalizeDisplayText,
  isLikelyNoisyArtist,
  isPlausibleArtistName,
  normalizeComparableText,
  splitArtistAlbumFromText,
  deriveArtistFromProductUrl,
  normalizeRecordTextFields,
  foldHebrewFinals,
  toSearchable,
  buildSearchTokens,
  parseQueryTerms,
  normalizeInStock,
  parseNumericPrice,
  toLowerSafe,
  PRICE_FRAGMENT_RE,
  PROMO_AND_STOCK_PREFIX_RE,
};
