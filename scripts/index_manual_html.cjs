#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  writeJson,
  extractPriceValue,
  extractCoverCandidates,
  normalizeCoverUrl,
  isLikelyCoverUrl,
  isValidHttpUrl,
} = require("./remediation_common.cjs");

const DEFAULT_ARCHIVE_ROOT =
  process.env.MANUAL_HTML_ROOT || "E:\\Code\\DB\\IsraeliVinyls-main";

const OUTPUT_PATH = path.resolve(
  __dirname,
  "..",
  "netlify",
  "data",
  "manual_enrichment_index.json"
);

const REPORT_PATH = path.resolve(
  __dirname,
  "..",
  "netlify",
  "data",
  "manual_enrichment_report.json"
);

const STORE_CONFIG = {
  beatnik_pages: {
    store_name: "Beatnik",
    base_url: "https://www.beatnik.co.il",
  },
  giora_pages: {
    store_name: "Giora Records",
    base_url: "https://www.giorarecords.co.il",
  },
  hasivoov_pages: {
    store_name: "HaSivoov",
    base_url: "https://hasivoov.co.il",
  },
  rollindice_pages: {
    store_name: "Roll Indice",
    base_url: "https://rollindice.com",
  },
  shablool_pages: {
    store_name: "Shablool",
    base_url: "https://shabloolrecords.co.il",
  },
  taklithouse_pages: {
    store_name: "TaklitHouse",
    base_url: "https://www.taklithouse.co.il",
  },
  third_ear_pages: {
    store_name: "Third Ear",
    base_url: "https://third-ear.com",
  },
  vinylroom_pages: {
    store_name: "The Vinyl Room",
    base_url: "https://thevinylroom.co.il",
  },
};

const TRACKING_QUERY_PARAM_RE = /^(utm_|fbclid$|gclid$|mc_(cid|eid)$|ref$|srsltid$|_ga$|_gl$)/i;

function decodeHtmlEntities(value) {
  if (!value) {
    return "";
  }

  const namedReplacements = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&#8211;": "-",
    "&#8212;": "-",
    "&#8216;": "'",
    "&#8217;": "'",
    "&#8220;": '"',
    "&#8221;": '"',
    "&#8362;": "₪",
  };

  let decoded = String(value);
  for (const [entity, plain] of Object.entries(namedReplacements)) {
    decoded = decoded.split(entity).join(plain);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_match, codePoint) => {
    const parsed = Number.parseInt(codePoint, 10);
    if (!Number.isFinite(parsed)) {
      return "";
    }
    try {
      return String.fromCodePoint(parsed);
    } catch (_error) {
      return "";
    }
  });

  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
    const parsed = Number.parseInt(hex, 16);
    if (!Number.isFinite(parsed)) {
      return "";
    }
    try {
      return String.fromCodePoint(parsed);
    } catch (_error) {
      return "";
    }
  });

  return decoded;
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupUrl(url) {
  if (!isValidHttpUrl(url)) {
    return "";
  }

  try {
    const parsed = new URL(String(url).trim());
    if (/^www\.www\./i.test(parsed.hostname)) {
      parsed.hostname = parsed.hostname.replace(/^www\.www\./i, "www.");
    }

    const host = parsed.hostname.toLowerCase();
    const pathname = (parsed.pathname || "/").replace(/\/+$/g, "") || "/";

    const queryPairs = [];
    for (const [name, value] of parsed.searchParams.entries()) {
      if (TRACKING_QUERY_PARAM_RE.test(name)) {
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

function buildLookupKeys(url) {
  const primary = normalizeLookupUrl(url);
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

function extractInStockValue(source) {
  const lowered = String(source || "").toLowerCase();
  if (!lowered.trim()) {
    return null;
  }

  const outOfStockMarkers = [
    "outofstock",
    "out of stock",
    "sold out",
    "currently unavailable",
    "לא במלאי",
    "אין במלאי",
    "אזל",
    "חסר במלאי",
  ];

  for (const marker of outOfStockMarkers) {
    if (lowered.includes(marker)) {
      return false;
    }
  }

  if (lowered.includes("onbackorder") || lowered.includes("backorder")) {
    return null;
  }

  const inStockMarkers = [
    "instock",
    "in stock",
    "available now",
    "available for purchase",
    "במלאי",
    "זמין במלאי",
    "קיים במלאי",
  ];

  for (const marker of inStockMarkers) {
    if (lowered.includes(marker)) {
      return true;
    }
  }

  return null;
}

function extractCurrency(source) {
  const text = String(source || "");
  if (!text.trim()) {
    return null;
  }

  if (/(₪|&#8362;|\bILS\b|\bNIS\b|ש"ח|ש״ח)/i.test(text)) {
    return "ILS";
  }

  if (/(\$|\bUSD\b)/i.test(text)) {
    return "USD";
  }

  if (/(€|\bEUR\b)/i.test(text)) {
    return "EUR";
  }

  return null;
}

function extractTitle(block) {
  const patterns = [
    /<h2[^>]*class=["'][^"']*woocommerce-loop-product__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i,
    /<a[^>]*class=["'][^"']*woocommerce-LoopProduct-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    /<img[^>]*alt=["']([^"']{2,300})["']/i,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (!match || !match[1]) {
      continue;
    }

    const cleaned = stripHtml(match[1]);
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 260);
    }
  }

  return "";
}

function isLikelyListingOrUtilityUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!value) {
    return true;
  }

  const blockedPatterns = [
    /\/(?:cart|checkout|my-account|account|wishlist)(?:\/|$)/i,
    /\/(?:product-category|category|collections?|tags?)(?:\/|$)/i,
    /[?&](?:add-to-cart|orderby|min_price|max_price|rating_filter|post_type=product&s=|s=)/i,
  ];

  return blockedPatterns.some((pattern) => pattern.test(value));
}

function resolveProductUrl(rawUrl, storeBaseUrl) {
  const candidate = decodeHtmlEntities(String(rawUrl || "")).trim();
  if (!candidate) {
    return "";
  }

  if (/^#/.test(candidate) || /^(?:javascript:|mailto:|tel:)/i.test(candidate)) {
    return "";
  }

  if (/^\?add-to-cart=/i.test(candidate)) {
    return "";
  }

  try {
    const resolvedUrl = new URL(candidate, storeBaseUrl);
    resolvedUrl.hash = "";
    for (const key of [...resolvedUrl.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAM_RE.test(key)) {
        resolvedUrl.searchParams.delete(key);
      }
    }

    const resolved = resolvedUrl.toString();
    if (!isValidHttpUrl(resolved)) {
      return "";
    }

    if (isLikelyListingOrUtilityUrl(resolved)) {
      return "";
    }

    return resolved;
  } catch (_error) {
    return "";
  }
}

function extractProductUrl(block, storeBaseUrl) {
  const hrefMatches = [
    ...[...block.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((match) =>
      resolveProductUrl(match[1], storeBaseUrl)
    ),
    ...[...block.matchAll(/data-product_permalink=["']([^"']+)["']/gi)].map((match) =>
      resolveProductUrl(match[1], storeBaseUrl)
    ),
  ]
    .filter(Boolean)
    .filter((url, index, list) => list.indexOf(url) === index);

  if (hrefMatches.length === 0) {
    return "";
  }

  const preferred = hrefMatches.find((url) => /\/products?\//i.test(url));
  if (preferred) {
    return preferred;
  }

  return (
    [...hrefMatches].sort((a, b) => {
      const aDepth = String(a).split("/").filter(Boolean).length;
      const bDepth = String(b).split("/").filter(Boolean).length;
      return bDepth - aDepth;
    })[0] || ""
  );
}

function extractProductBlocks(html) {
  const source = String(html || "");
  if (!source.trim()) {
    return [];
  }

  const listItems = source.match(/<li[^>]*class=["'][^"']*product[^"']*["'][\s\S]*?<\/li>/gi) || [];
  if (listItems.length > 0) {
    return listItems;
  }

  const articles = source.match(/<article[^>]*class=["'][^"']*product[^"']*["'][\s\S]*?<\/article>/gi) || [];
  if (articles.length > 0) {
    return articles;
  }

  const divBlocks =
    source.match(/<div[^>]*class=["'][^"']*(?:product|product-item|type-product)[^"']*["'][\s\S]*?<\/div>/gi) ||
    [];

  return divBlocks;
}

function entryScore(entry) {
  let score = 0;
  if (entry.cover_url) score += 4;
  if (entry.price > 0) score += 3;
  if (entry.in_stock !== null) score += 2;
  if (entry.title) score += 1;
  return score;
}

function mergeEntries(existing, candidate) {
  if (!existing) {
    return {
      ...candidate,
      source_files: [...new Set(candidate.source_files || [])],
      lookup_keys: [...new Set(candidate.lookup_keys || [])],
    };
  }

  const existingScore = entryScore(existing);
  const candidateScore = entryScore(candidate);

  const preferred = candidateScore > existingScore ? candidate : existing;
  const secondary = preferred === candidate ? existing : candidate;

  return {
    ...secondary,
    ...preferred,
    product_url: preferred.product_url || secondary.product_url,
    title: preferred.title || secondary.title,
    cover_url: preferred.cover_url || secondary.cover_url || null,
    price: preferred.price > 0 ? preferred.price : secondary.price,
    currency: preferred.currency || secondary.currency || null,
    in_stock: preferred.in_stock !== null ? preferred.in_stock : secondary.in_stock,
    product_id: preferred.product_id || secondary.product_id || "",
    sku: preferred.sku || secondary.sku || "",
    source_files: [...new Set([...(existing.source_files || []), ...(candidate.source_files || [])])].slice(0, 6),
    lookup_keys: [...new Set([...(existing.lookup_keys || []), ...(candidate.lookup_keys || [])])],
  };
}

function buildEntryFromBlock(block, storeName, storeBaseUrl, sourceFile) {
  const productUrl = extractProductUrl(block, storeBaseUrl);
  if (!productUrl) {
    return null;
  }

  const coverCandidates = extractCoverCandidates(block, productUrl);
  const coverUrl = coverCandidates.find((url) => isLikelyCoverUrl(url)) || null;

  const price = extractPriceValue(block);
  const inStock = extractInStockValue(block);
  const currency = extractCurrency(block);
  const title = extractTitle(block)
    .replace(/(?:[₪$€]|\bILS\b|\bNIS\b|\bUSD\b|\bEUR\b)\s*[0-9]{1,5}(?:[.,][0-9]{1,2})?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:\u05db\u05d5\u05ea\u05e8\u05d9\u05dd\s+\u05e0\u05d5\u05e1\u05e4\u05d9\u05dd|view\s+all|see\s+more)$/i.test(title)) {
    return null;
  }

  if (!title && !coverUrl && price <= 0 && inStock === null) {
    return null;
  }

  const productIdMatch = block.match(/data-product_id=["']([^"']+)["']/i);
  const skuMatch = block.match(/data-product_sku=["']([^"']*)["']/i);

  const lookupKeys = buildLookupKeys(productUrl);
  if (lookupKeys.length === 0) {
    return null;
  }

  return {
    store_name: storeName,
    product_url: productUrl,
    title,
    cover_url: coverUrl,
    price,
    currency,
    in_stock: inStock,
    product_id: productIdMatch ? String(productIdMatch[1] || "") : "",
    sku: skuMatch ? String(skuMatch[1] || "") : "",
    source_files: [sourceFile],
    lookup_keys: lookupKeys,
  };
}

function scanStoreDirectory(rootDir, folderName, lookupMap, summary) {
  const storeConfig = STORE_CONFIG[folderName] || {
    store_name: folderName.replace(/_pages$/i, "").replace(/_/g, " "),
    base_url: "https://example.invalid",
  };

  const storeDir = path.join(rootDir, folderName);
  const files = fs
    .readdirSync(storeDir)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const storeStats = {
    files: files.length,
    product_blocks: 0,
    entries_seen: 0,
    entries_indexed: 0,
    with_cover: 0,
    with_price: 0,
    with_in_stock: 0,
  };

  for (const fileName of files) {
    const fullPath = path.join(storeDir, fileName);
    const sourceFile = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    let html = "";
    try {
      html = fs.readFileSync(fullPath, "utf8");
    } catch (_error) {
      continue;
    }

    const productBlocks = extractProductBlocks(html);
    storeStats.product_blocks += productBlocks.length;

    for (const block of productBlocks) {
      const entry = buildEntryFromBlock(block, storeConfig.store_name, storeConfig.base_url, sourceFile);
      if (!entry) {
        continue;
      }

      storeStats.entries_seen += 1;

      const existing = entry.lookup_keys.map((key) => lookupMap.get(key)).find(Boolean) || null;
      const merged = mergeEntries(existing, entry);

      for (const key of merged.lookup_keys) {
        lookupMap.set(key, merged);
      }

      storeStats.entries_indexed += 1;
      if (merged.cover_url) storeStats.with_cover += 1;
      if (merged.price > 0) storeStats.with_price += 1;
      if (merged.in_stock !== null) storeStats.with_in_stock += 1;
    }
  }

  summary.stores[folderName] = storeStats;
  summary.files_scanned += storeStats.files;
  summary.product_blocks += storeStats.product_blocks;
  summary.entries_seen += storeStats.entries_seen;
}

function buildUniqueEntries(lookupMap) {
  const byProductUrl = new Map();

  for (const record of lookupMap.values()) {
    const key = normalizeLookupUrl(record.product_url) || record.product_url;
    const existing = byProductUrl.get(key);
    byProductUrl.set(key, mergeEntries(existing, record));
  }

  return [...byProductUrl.values()].map((entry) => ({
    store_name: entry.store_name,
    product_url: entry.product_url,
    title: entry.title || "",
    cover_url: entry.cover_url || null,
    price: Number.isFinite(Number(entry.price)) ? Number(entry.price) : 0,
    currency: entry.currency || null,
    in_stock: entry.in_stock === true ? true : entry.in_stock === false ? false : null,
    product_id: entry.product_id || "",
    sku: entry.sku || "",
    source_files: [...new Set(entry.source_files || [])].slice(0, 6),
    lookup_keys: [...new Set(entry.lookup_keys || buildLookupKeys(entry.product_url))],
  }));
}

function main() {
  const archiveRoot = path.resolve(DEFAULT_ARCHIVE_ROOT);
  if (!fs.existsSync(archiveRoot)) {
    throw new Error(`Archive root not found: ${archiveRoot}`);
  }

  const storeFolders = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => name.endsWith("_pages"));

  if (storeFolders.length === 0) {
    throw new Error(`No store folders found under: ${archiveRoot}`);
  }

  const lookupMap = new Map();
  const summary = {
    generated_at: new Date().toISOString(),
    archive_root: archiveRoot,
    stores: {},
    files_scanned: 0,
    product_blocks: 0,
    entries_seen: 0,
    unique_entries: 0,
    with_cover: 0,
    with_price: 0,
    with_in_stock: 0,
  };

  for (const folderName of storeFolders.sort((a, b) => a.localeCompare(b, "en"))) {
    scanStoreDirectory(archiveRoot, folderName, lookupMap, summary);
  }

  const entries = buildUniqueEntries(lookupMap);
  summary.unique_entries = entries.length;
  summary.with_cover = entries.filter((entry) => Boolean(entry.cover_url)).length;
  summary.with_price = entries.filter((entry) => Number(entry.price || 0) > 0).length;
  summary.with_in_stock = entries.filter((entry) => entry.in_stock !== null).length;

  const output = {
    generated_at: summary.generated_at,
    archive_root: summary.archive_root,
    summary,
    entries,
  };

  writeJson(OUTPUT_PATH, output);
  writeJson(REPORT_PATH, summary);

  console.log("MANUAL_HTML_INDEX_BUILD=PASS");
  console.log(
    JSON.stringify(
      {
        archive_root: archiveRoot,
        stores: storeFolders.length,
        files_scanned: summary.files_scanned,
        product_blocks: summary.product_blocks,
        unique_entries: summary.unique_entries,
        with_cover: summary.with_cover,
        with_price: summary.with_price,
        with_in_stock: summary.with_in_stock,
        output: OUTPUT_PATH,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error("MANUAL_HTML_INDEX_BUILD=FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
