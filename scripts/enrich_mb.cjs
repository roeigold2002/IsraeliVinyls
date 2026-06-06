#!/usr/bin/env node
// Enriches records.json with genre and year from MusicBrainz.
// Uses deduplication: 97K records → ~50K unique artist+album combos.
// Run: node scripts/enrich_mb.cjs
// Options:
//   --concurrency N   (default 4)
//   --save-every N    (default 200)
//   --max-records N   (default 0 = all)
//   --dry-run

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");
const REPORT_PATH = path.join(DATA_DIR, "mb_enrichment_report.json");

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "ProjectV/1.0 (roeigshit@gmail.com)";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { concurrency: 4, saveEvery: 200, maxRecords: 0, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--concurrency": args.concurrency = Math.max(1, Number(argv[++i]) || 4); break;
      case "--save-every":  args.saveEvery  = Math.max(50, Number(argv[++i]) || 200); break;
      case "--max-records": args.maxRecords = Math.max(0, Number(argv[++i]) || 0); break;
      case "--dry-run":     args.dryRun = true; break;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function httpsGet(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", () => resolve({ status: 0, text: "" }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, text: "" }); });
  });
}

let _pauseUntil = 0;

async function get(url, attempt = 0) {
  const now = Date.now();
  if (_pauseUntil > now) await new Promise(r => setTimeout(r, _pauseUntil - now));

  const res = await httpsGet(url);

  if (res.status === 503 || res.status === 429) {
    const wait = 5000 * Math.pow(2, Math.min(attempt, 4)); // 5s, 10s, 20s, 40s, 80s
    _pauseUntil = Date.now() + wait;
    console.warn(`  [${res.status} — backing off ${wait / 1000}s]`);
    await new Promise(r => setTimeout(r, wait));
    return get(url, attempt + 1);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Query cleaning (same logic as enrich_metadata.cjs)
// ---------------------------------------------------------------------------
const _PAREN_RE = /\s*\([^)]*\)/g;
const _FORMAT_SUFFIX_RE = /\s+(?:\d{1,2}[xX]?)?(?:LP|2LP|3LP|4LP|EP|CD|DVD|7"|10"|12"|Single|Vinyl|Box\s*Set|Deluxe|Remaster(?:ed)?|Limited|Edition|Reissue|Colou?red?\s*Vinyl)\b.*$/i;
const _PRESS_YEAR_RE = /\s*:\s*\d{4}\b.*$/;
const _TRAIL_SEP_RE = /[\s\-–:,|/;.]+$/;

function cleanForQuery(text) {
  if (!text) return "";
  let s = text.replace(_PAREN_RE, "");
  s = s.replace(_FORMAT_SUFFIX_RE, "");
  s = s.replace(_PRESS_YEAR_RE, "");
  s = s.replace(_TRAIL_SEP_RE, "").trim();
  return s || text.trim();
}

function primaryArtist(artist) {
  if (!artist) return "";
  const first = artist.split(/[,/&]|feat\.|ft\./i)[0].trim();
  return first || artist.trim();
}

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/[^\w֐-׿]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreMatch(a, b) {
  const na = normalizeText(a), nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tokens = nb.split(" ").filter(t => t.length > 1);
  if (!tokens.length) return 0;
  const hits = tokens.filter(t => na.includes(t)).length;
  return hits / tokens.length;
}

// ---------------------------------------------------------------------------
// MusicBrainz lookup
// ---------------------------------------------------------------------------
async function fetchMBMeta(artist, album) {
  const cleanAlbum = cleanForQuery(album);
  const cleanArtist = primaryArtist(artist);
  if (!cleanAlbum && !cleanArtist) return null;

  // Build query: prefer artist+release, fall back to just release
  const terms = [];
  if (cleanArtist) terms.push(`artist:${encodeURIComponent(cleanArtist)}`);
  if (cleanAlbum)  terms.push(`release:${encodeURIComponent(cleanAlbum)}`);
  const query = terms.join("+AND+");

  const url = `${MB_BASE}/release?query=${query}&fmt=json&limit=5`;
  const res = await get(url);
  if (res.status !== 200 || !res.text) return null;

  let payload;
  try { payload = JSON.parse(res.text); } catch { return null; }

  const releases = Array.isArray(payload.releases) ? payload.releases : [];
  if (!releases.length) return null;

  let best = null;
  for (const rel of releases) {
    const mbScore = Number(rel.score || 0);
    if (mbScore < 60) continue;

    const scoreAlbum = scoreMatch(cleanAlbum, rel.title);
    const artistCredit = rel["artist-credit"] && rel["artist-credit"][0];
    const artistName = artistCredit ? (artistCredit.artist && artistCredit.artist.name || artistCredit.name || "") : "";
    const scoreArtist = cleanArtist ? scoreMatch(cleanArtist, artistName) : 0.5;
    const score = scoreAlbum * 0.7 + scoreArtist * 0.3;

    if (!best || score > best.score) {
      const dateStr = String(rel.date || "");
      const yr = dateStr.slice(0, 4);
      best = {
        score,
        year: /^\d{4}$/.test(yr) && Number(yr) >= 1900 ? Number(yr) : null,
        rgId: rel["release-group"] && rel["release-group"].id || null,
      };
    }
  }

  if (!best || best.score < 0.40) return null;

  // Fetch genres from release-group if we have an ID
  let genre = null;
  if (best.rgId) {
    const rgUrl = `${MB_BASE}/release-group/${best.rgId}?inc=genres&fmt=json`;
    const rgRes = await get(rgUrl);
    if (rgRes.status === 200 && rgRes.text) {
      try {
        const rg = JSON.parse(rgRes.text);
        const genres = Array.isArray(rg.genres) ? rg.genres : [];
        // Take highest-vote genre
        genres.sort((a, b) => (b.count || 0) - (a.count || 0));
        if (genres[0] && genres[0].name) {
          genre = genres[0].name;
        }
      } catch {}
    }
  }

  return { year: best.year, genre };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const records = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));

  // Build dedup map: dedup key → [record indices]
  const dedupMap = new Map();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.genre && r.year) continue; // already enriched
    const key = normalizeText(r.artist || "") + "|||" + normalizeText(cleanForQuery(r.album || ""));
    if (!key || key === "|||") continue;
    if (!dedupMap.has(key)) dedupMap.set(key, { artist: r.artist, album: r.album, indices: [] });
    dedupMap.get(key).indices.push(i);
  }

  let uniqueCombos = [...dedupMap.values()];
  if (args.maxRecords > 0) uniqueCombos = uniqueCombos.slice(0, args.maxRecords);

  console.log(`Records total: ${records.length}`);
  console.log(`Unique combos to look up: ${uniqueCombos.length}`);
  if (args.dryRun) { console.log("Dry run — no writes."); return; }

  const report = {
    generated_at: new Date().toISOString(),
    unique_combos: uniqueCombos.length,
    processed: 0,
    genre_filled: 0,
    year_filled: 0,
    api_hits: 0,
    api_misses: 0,
  };

  let cursor = 0;

  function saveProgress() {
    fs.writeFileSync(RECORDS_PATH, JSON.stringify(records), "utf8");
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ ...report, saved_at: new Date().toISOString() }, null, 2), "utf8");
    const pct = ((report.processed / uniqueCombos.length) * 100).toFixed(1);
    console.log(
      `  saved  processed=${report.processed}/${uniqueCombos.length} (${pct}%)` +
      `  genre=${report.genre_filled}  year=${report.year_filled}` +
      `  hits=${report.api_hits}  misses=${report.api_misses}`
    );
  }

  async function worker() {
    while (cursor < uniqueCombos.length) {
      const combo = uniqueCombos[cursor++];
      const meta = await fetchMBMeta(combo.artist || "", combo.album || "");

      report.processed++;

      if (meta) {
        report.api_hits++;
        for (const i of combo.indices) {
          if (!records[i].year  && meta.year)  { records[i].year  = meta.year;  report.year_filled++;  }
          if (!records[i].genre && meta.genre) { records[i].genre = meta.genre; report.genre_filled++; }
        }
      } else {
        report.api_misses++;
      }

      if (report.processed % args.saveEvery === 0) {
        saveProgress();
      }

      // ~4 req/s across 4 workers (MusicBrainz is lenient with proper User-Agent)
      await new Promise(r => setTimeout(r, 250));
    }
  }

  const workers = Array.from(
    { length: Math.min(args.concurrency, Math.max(1, uniqueCombos.length)) },
    () => worker()
  );
  await Promise.all(workers);

  saveProgress();
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("\nDone.");
  console.log(`  genre filled : ${report.genre_filled}`);
  console.log(`  year  filled : ${report.year_filled}`);
  console.log(`  api hits     : ${report.api_hits}`);
  console.log(`  api misses   : ${report.api_misses}`);
}

main().catch(err => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
