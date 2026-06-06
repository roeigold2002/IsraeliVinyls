#!/usr/bin/env node
// Cleans album/artist names (strips embedded ₪ prices and Hebrew stock markers)
// and nulls out dummyimage.com / via.placeholder.com cover URLs in the JSON snapshot.
// Run: node scripts/remediate_names.cjs
// Then re-export the snapshot: python scripts/export_snapshot.py

const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const FILES_TO_CLEAN = ["records.json", "search_records.json"];

const PRICE_RE = /\s*₪\s*\d[\d.,]*/g;
// Stock markers that may appear inline or at end of album/artist names
const STOCK_SUFFIX_RE =
  /\s*[-–—,]\s*(חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|לא\s*במלאי|במלאי|out\s*of\s*stock|sold\s*out|in\s*stock)\b.*/gi;
const STOCK_PREFIX_RE =
  /(חסר\s*במלאי|אזל\s*מ(?:ה)?מלאי|לא\s*במלאי|במלאי|out\s*of\s*stock|sold\s*out|in\s*stock)\s*[-–—,]?\s*/gi;
const TRAILING_SEP_RE = /[-–—,|/:;.\s]+$/;

const DUMMY_RE = /(?:dummyimage\.com|via\.placeholder\.com|placehold\.co)/i;

function clean(text) {
  if (!text || typeof text !== "string") return text;
  let s = text
    .replace(PRICE_RE, "")
    .replace(STOCK_SUFFIX_RE, "")
    .replace(STOCK_PREFIX_RE, "")
    .replace(TRAILING_SEP_RE, "")
    .trim();
  // Restore original if cleaning produces empty string
  return s || text;
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return { skipped: true };

  const raw = fs.readFileSync(filePath, "utf8");
  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    console.error(`  Failed to parse ${path.basename(filePath)}`);
    return { skipped: true };
  }

  if (!Array.isArray(records)) return { skipped: true };

  let nameFixed = 0;
  let coverNulled = 0;

  for (const record of records) {
    if (!record || typeof record !== "object") continue;

    const newArtist = clean(record.artist);
    const newAlbum = clean(record.album);
    const isDummy =
      record.cover_url &&
      typeof record.cover_url === "string" &&
      DUMMY_RE.test(record.cover_url);

    if (newArtist !== record.artist || newAlbum !== record.album) {
      record.artist = newArtist;
      record.album = newAlbum;
      nameFixed++;
    }
    if (isDummy) {
      record.cover_url = null;
      coverNulled++;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(records), "utf8");
  return { nameFixed, coverNulled };
}

let totalNameFixed = 0;
let totalCoverNulled = 0;

for (const fileName of FILES_TO_CLEAN) {
  const filePath = path.join(DATA_DIR, fileName);
  const result = processFile(filePath);
  if (result.skipped) {
    console.log(`  ${fileName}: skipped (not found or not an array)`);
  } else {
    console.log(
      `  ${fileName}: names_fixed=${result.nameFixed} cover_urls_nulled=${result.coverNulled}`,
    );
    totalNameFixed += result.nameFixed;
    totalCoverNulled += result.coverNulled;
  }
}

console.log(
  `\nTotal: names_fixed=${totalNameFixed} cover_urls_nulled=${totalCoverNulled}`,
);
