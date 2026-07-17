"use strict";

/**
 * URL canonicalization helpers shared by the bundle builder, the manual
 * enrichment index, dedupe keys, and the outbound-fetch safety guard.
 */

const MANUAL_TRACKING_QUERY_PARAM_RE =
  /^(utm_|fbclid$|gclid$|mc_(cid|eid)$|ref$|srsltid$|_ga$|_gl$)/i;

/** Best URL to fetch/enrich a record from: product page first, store page second. */
function getEnrichmentUrl(record) {
  if (record && typeof record.product_url === "string" && record.product_url.startsWith("http")) {
    return record.product_url;
  }
  if (record && typeof record.store_url === "string" && record.store_url.startsWith("http")) {
    return record.store_url;
  }
  return "";
}

/**
 * Canonical "host/path?sorted-query" form of a product URL with tracking
 * params removed. Used as the manual-index lookup key and the dedupe key.
 */
function normalizeManualLookupUrl(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(String(url).trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    if (/^www\.www\./i.test(parsed.hostname)) {
      parsed.hostname = parsed.hostname.replace(/^www\.www\./i, "www.");
    }

    const host = parsed.hostname.toLowerCase();
    const pathname = (parsed.pathname || "/").replace(/\/+$/g, "") || "/";

    const queryPairs = [];
    for (const [name, value] of parsed.searchParams.entries()) {
      if (MANUAL_TRACKING_QUERY_PARAM_RE.test(name)) {
        continue;
      }
      queryPairs.push([name, value]);
    }

    queryPairs.sort((a, b) => {
      if (a[0] === b[0]) {
        return a[1].localeCompare(b[1]);
      }
      return a[0].localeCompare(b[0]);
    });

    const query =
      queryPairs.length > 0
        ? `?${queryPairs
            .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
            .join("&")}`
        : "";

    return `${host}${pathname}${query}`;
  } catch (_error) {
    return "";
  }
}

/** Lookup keys for a URL: canonical form, plus the query-less form. */
function buildManualLookupKeys(url) {
  const primary = normalizeManualLookupUrl(url);
  if (!primary) {
    return [];
  }

  const keys = [primary];
  const queryIndex = primary.indexOf("?");
  if (queryIndex > -1) {
    keys.push(primary.slice(0, queryIndex));
  }

  return [...new Set(keys)].filter(Boolean);
}

/** Normalizes a raw manual-index key that may lack a scheme. */
function normalizeManualLookupKey(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    return normalizeManualLookupUrl(raw);
  }
  if (raw.startsWith("//")) {
    return normalizeManualLookupUrl(`https:${raw}`);
  }
  return normalizeManualLookupUrl(`https://${raw.replace(/^\/+/, "")}`);
}

/** Rejects non-http(s) schemes and private/loopback hosts for outbound fetches. */
function isSafeOutboundUrl(candidate) {
  try {
    const parsed = new URL(String(candidate || ""));
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
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = {
  getEnrichmentUrl,
  normalizeManualLookupUrl,
  buildManualLookupKeys,
  normalizeManualLookupKey,
  isSafeOutboundUrl,
};
