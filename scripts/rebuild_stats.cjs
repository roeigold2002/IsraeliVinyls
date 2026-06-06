#!/usr/bin/env node
// Regenerates genres.json and database_info.json from the current records.json.
// Run after any enrichment pass to keep stats accurate.
// Usage: node scripts/rebuild_stats.cjs

const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");
const GENRES_PATH = path.join(DATA_DIR, "genres.json");
const DB_INFO_PATH = path.join(DATA_DIR, "database_info.json");

const PLACEHOLDER_RE = /(?:dummyimage\.com|via\.placeholder\.com|placehold\.co)/i;

function isRealCoverUrl(url) {
  if (!url) return false;
  const v = String(url).toLowerCase();
  if (v.startsWith("data:image/svg+xml")) return false;
  if (PLACEHOLDER_RE.test(v)) return false;
  return /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(v);
}

function main() {
  console.log("Reading records.json …");
  const records = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));
  const total = records.length;

  const storeCounts = {};
  const genreMap = {};
  let withCover = 0, withGenre = 0, withYear = 0;
  let inStock = 0, outOfStock = 0, stockUnknown = 0;

  for (const r of records) {
    // store counts
    const s = r.store_name || "Unknown";
    storeCounts[s] = (storeCounts[s] || 0) + 1;

    // genre
    const g = String(r.genre || "").trim();
    if (g.length > 1) {
      genreMap[g] = (genreMap[g] || 0) + 1;
      withGenre++;
    }

    // year
    if (r.year && Number(r.year) >= 1900) withYear++;

    // cover (real only)
    if (isRealCoverUrl(r.cover_url)) withCover++;

    // stock
    if (r.in_stock === true) inStock++;
    else if (r.in_stock === false) outOfStock++;
    else stockUnknown++;
  }

  // Build sorted genre list
  const sortedGenres = Object.keys(genreMap).sort((a, b) => a.localeCompare(b, "he"));

  // Write genres.json
  fs.writeFileSync(GENRES_PATH, JSON.stringify(sortedGenres), "utf8");
  console.log(`Wrote genres.json — ${sortedGenres.length} genres`);

  // Build top-10 genres map for database_info
  const topGenres = {};
  Object.entries(genreMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([name, count]) => { topGenres[name] = count; });

  // Read existing db info to preserve non-data-quality fields
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(DB_INFO_PATH, "utf8")); } catch {}

  const dbInfo = {
    ...existing,
    total_records: total,
    stores: storeCounts,
    store_count: Object.keys(storeCounts).length,
    genres: topGenres,
    genre_count: sortedGenres.length,
    data_quality: {
      records_with_cover: withCover,
      coverage_percent_covers: Number(((withCover / total) * 100).toFixed(1)),
      records_with_genre: withGenre,
      coverage_percent_genres: Number(((withGenre / total) * 100).toFixed(1)),
      records_with_year: withYear,
      coverage_percent_years: Number(((withYear / total) * 100).toFixed(1)),
      records_in_stock: inStock,
      records_out_of_stock: outOfStock,
      records_stock_unknown: stockUnknown,
      records_with_known_stock: inStock + outOfStock,
      coverage_percent_stock_known: Number((((inStock + outOfStock) / total) * 100).toFixed(1)),
    },
    rebuilt_at: new Date().toISOString(),
  };

  fs.writeFileSync(DB_INFO_PATH, JSON.stringify(dbInfo, null, 2), "utf8");
  console.log("Wrote database_info.json");

  console.log("\nStats:");
  console.log(`  total      : ${total.toLocaleString()}`);
  console.log(`  genre      : ${withGenre.toLocaleString()} (${dbInfo.data_quality.coverage_percent_genres}%)`);
  console.log(`  year       : ${withYear.toLocaleString()} (${dbInfo.data_quality.coverage_percent_years}%)`);
  console.log(`  real cover : ${withCover.toLocaleString()} (${dbInfo.data_quality.coverage_percent_covers}%)`);
  console.log(`  in stock   : ${inStock.toLocaleString()} | out: ${outOfStock.toLocaleString()} | unknown: ${stockUnknown.toLocaleString()}`);
  console.log(`  genres     : ${sortedGenres.length} unique`);
  console.log("\nTop genres:");
  Object.entries(topGenres).forEach(([g, c]) => console.log(`  ${g}: ${c}`));
}

main();
