#!/usr/bin/env node
// Enriches records.json with genre, year, cover_url from Deezer + Last.fm.
// Uses deduplication: 97K records → ~44K unique artist+album combos.
// Deezer: year + cover (2 calls per hit)
// Last.fm: genre tags (1 call per hit, better quality genre data)
// Run: node scripts/enrich_deezer.cjs

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");
const REPORT_PATH = path.join(DATA_DIR, "deezer_enrichment_report.json");

const LFM_KEY = "b25b959554ed76058ac220b7b2e0a026";

function parseArgs(argv) {
  const args = { concurrency: 5, saveEvery: 200, maxRecords: 0, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--concurrency": args.concurrency = Math.max(1, Number(argv[++i]) || 5); break;
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
    const req = https.get(url, { headers: { "User-Agent": "ProjectV/1.0 (roeigshit@gmail.com)" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", () => resolve({ status: 0, text: "" }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, text: "" }); });
  });
}

// Per-host backoff state
const _pauseUntil = { deezer: 0, lastfm: 0 };

async function get(url, host, attempt = 0) {
  const now = Date.now();
  if (_pauseUntil[host] > now) await new Promise(r => setTimeout(r, _pauseUntil[host] - now));

  const res = await httpsGet(url);

  if (res.status === 429 || res.status === 503) {
    const wait = 5000 * Math.pow(2, Math.min(attempt, 4));
    _pauseUntil[host] = Date.now() + wait;
    console.warn(`  [${host} ${res.status} — backing off ${wait / 1000}s]`);
    await new Promise(r => setTimeout(r, wait));
    return get(url, host, attempt + 1);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Query cleaning
// ---------------------------------------------------------------------------
const _PAREN_RE = /\s*\([^)]*\)/g;
const _FORMAT_RE = /\s+(?:\d{1,2}[xX]?)?(?:LP|2LP|3LP|4LP|EP|CD|DVD|7"|10"|12"|Single|Vinyl|Box\s*Set|Deluxe|Remaster(?:ed)?|Limited|Edition|Reissue|Colou?red?\s*Vinyl)\b.*$/i;
const _PRESS_RE  = /\s*:\s*\d{4}\b.*$/;
const _TRAIL_RE  = /[\s\-–:,|/;.]+$/;

function cleanForQuery(text) {
  if (!text) return "";
  let s = text.replace(_PAREN_RE, "").replace(_FORMAT_RE, "").replace(_PRESS_RE, "").replace(_TRAIL_RE, "").trim();
  return s || text.trim();
}

function primaryArtist(artist) {
  if (!artist) return "";
  return artist.split(/[,/&]|feat\.|ft\./i)[0].trim() || artist.trim();
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
  return tokens.filter(t => na.includes(t)).length / tokens.length;
}

// ---------------------------------------------------------------------------
// Deezer lookup: year + cover_url
// ---------------------------------------------------------------------------
async function fetchDeezerMeta(artist, album) {
  const ca = primaryArtist(artist);
  const cb = cleanForQuery(album);
  if (!cb && !ca) return null;

  const q = encodeURIComponent(`${ca} ${cb}`.trim());
  const searchUrl = `https://api.deezer.com/search/album?q=${q}&limit=5`;
  const res = await get(searchUrl, "deezer");
  if (res.status !== 200 || !res.text) return null;

  let data;
  try { data = JSON.parse(res.text); } catch { return null; }

  const results = Array.isArray(data.data) ? data.data : [];
  let bestId = null, bestScore = 0, bestCover = null;

  for (const item of results) {
    const scoreA = scoreMatch(cb || ca, item.title);
    const scoreB = ca ? scoreMatch(ca, item.artist && item.artist.name || "") : 0.5;
    const score = scoreA * 0.7 + scoreB * 0.3;
    if (score > bestScore) {
      bestScore = score;
      bestId = item.id;
      bestCover = item.cover_xl || item.cover_big || item.cover_medium || null;
    }
  }

  if (!bestId || bestScore < 0.40) return null;

  // Fetch album detail for year + genre
  const detRes = await get(`https://api.deezer.com/album/${bestId}`, "deezer");
  if (detRes.status !== 200 || !detRes.text) return { cover_url: bestCover };

  let det;
  try { det = JSON.parse(detRes.text); } catch { return { cover_url: bestCover }; }

  const yearStr = String(det.release_date || "").slice(0, 4);
  const year = /^\d{4}$/.test(yearStr) && Number(yearStr) >= 1900 ? Number(yearStr) : null;
  const genre = det.genres && det.genres.data && det.genres.data[0] && det.genres.data[0].name || null;

  return { year, genre, cover_url: bestCover };
}

// ---------------------------------------------------------------------------
// Last.fm lookup: genre tags (higher quality than Deezer genre)
// ---------------------------------------------------------------------------
async function fetchLastfmGenre(artist, album) {
  const ca = primaryArtist(artist);
  const cb = cleanForQuery(album);
  if (!cb || !ca) return null;

  const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&artist=${encodeURIComponent(ca)}&album=${encodeURIComponent(cb)}&api_key=${LFM_KEY}&format=json`;
  const res = await get(url, "lastfm");
  if (res.status !== 200 || !res.text) return null;

  let payload;
  try { payload = JSON.parse(res.text); } catch { return null; }

  const tags = payload.album && payload.album.tags && payload.album.tags.tag;
  if (!Array.isArray(tags) || !tags.length) return null;

  // Return the top tag that isn't generic like "seen live", "favorites"
  const IGNORE_TAGS = new Set(["seen live", "favorites", "favourite", "albums i own", "my library", "owned"]);
  const best = tags.find(t => t.name && !IGNORE_TAGS.has(t.name.toLowerCase()));
  return best ? best.name : null;
}

// ---------------------------------------------------------------------------
// Combined lookup
// ---------------------------------------------------------------------------
async function fetchMeta(artist, album) {
  const [deezer, lfmGenre] = await Promise.allSettled([
    fetchDeezerMeta(artist, album),
    fetchLastfmGenre(artist, album),
  ]);

  const dz = deezer.status === "fulfilled" ? deezer.value : null;
  const lfm = lfmGenre.status === "fulfilled" ? lfmGenre.value : null;

  if (!dz && !lfm) return null;

  return {
    year: dz && dz.year || null,
    genre: lfm || (dz && dz.genre) || null,
    cover_url: dz && dz.cover_url || null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));

  // Build dedup map: normalized key → { artist, album, indices[] }
  const dedupMap = new Map();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.genre && r.year) continue;
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
    processed: 0, genre_filled: 0, year_filled: 0, cover_filled: 0,
    api_hits: 0, api_misses: 0,
  };

  let cursor = 0;

  function saveProgress() {
    fs.writeFileSync(RECORDS_PATH, JSON.stringify(records), "utf8");
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ ...report, saved_at: new Date().toISOString() }, null, 2), "utf8");
    const pct = ((report.processed / uniqueCombos.length) * 100).toFixed(1);
    console.log(
      `  saved  ${report.processed}/${uniqueCombos.length} (${pct}%)` +
      `  genre=${report.genre_filled}  year=${report.year_filled}  cover=${report.cover_filled}` +
      `  hits=${report.api_hits}  misses=${report.api_misses}`
    );
  }

  async function worker() {
    while (cursor < uniqueCombos.length) {
      const combo = uniqueCombos[cursor++];
      const meta = await fetchMeta(combo.artist || "", combo.album || "");

      report.processed++;
      if (meta) {
        report.api_hits++;
        for (const i of combo.indices) {
          if (!records[i].year     && meta.year)      { records[i].year      = meta.year;      report.year_filled++;  }
          if (!records[i].genre    && meta.genre)     { records[i].genre     = meta.genre;     report.genre_filled++; }
          if (!records[i].cover_url && meta.cover_url) { records[i].cover_url = meta.cover_url; report.cover_filled++; }
        }
      } else {
        report.api_misses++;
      }

      if (report.processed % args.saveEvery === 0) saveProgress();

      // ~5 req/s across 5 workers per API
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const workers = Array.from(
    { length: Math.min(args.concurrency, uniqueCombos.length) },
    () => worker()
  );
  await Promise.all(workers);

  saveProgress();
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("\nDone.");
  console.log(`  genre  filled : ${report.genre_filled}`);
  console.log(`  year   filled : ${report.year_filled}`);
  console.log(`  cover  filled : ${report.cover_filled}`);
  console.log(`  api hits      : ${report.api_hits}`);
  console.log(`  api misses    : ${report.api_misses}`);
}

main().catch(err => { console.error("FAILED:", err.message || err); process.exit(1); });
