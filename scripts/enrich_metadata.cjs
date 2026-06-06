#!/usr/bin/env node
// Enriches records.json with genre and year from iTunes Search API.
// Skips records that already have both fields populated.
// Run: node scripts/enrich_metadata.cjs
// Options:
//   --concurrency N   (default 8)
//   --save-every N    (default 500)
//   --max-records N   (default 0 = all)
//   --dry-run         (print stats, no writes)

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const DATA_DIR = path.join(__dirname, "..", "netlify", "data");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");
const REPORT_PATH = path.join(DATA_DIR, "metadata_enrichment_report.json");

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { concurrency: 2, saveEvery: 500, maxRecords: 0, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--concurrency": args.concurrency = Math.max(1, Number(argv[++i]) || 8); break;
      case "--save-every":  args.saveEvery  = Math.max(50, Number(argv[++i]) || 500); break;
      case "--max-records": args.maxRecords = Math.max(0, Number(argv[++i]) || 0); break;
      case "--dry-run":     args.dryRun = true; break;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// iTunes lookup
// ---------------------------------------------------------------------------
function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "ProjectV-Enrichment/1.0" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", () => resolve({ ok: false, status: 0, text: "" }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, status: 0, text: "" }); });
  });
}

let _rateLimitedUntil = 0;

async function httpsGetWithBackoff(url, attempt = 0) {
  const now = Date.now();
  if (_rateLimitedUntil > now) {
    await new Promise(r => setTimeout(r, _rateLimitedUntil - now));
  }
  const res = await httpsGet(url);
  if (res.status === 429) {
    const pauseMs = 60000 * (attempt + 1); // 60s, 120s, 180s...
    _rateLimitedUntil = Date.now() + pauseMs;
    console.warn(`  [429 rate limited — pausing ${pauseMs / 1000}s]`);
    await new Promise(r => setTimeout(r, pauseMs));
    return httpsGetWithBackoff(url, attempt + 1);
  }
  if (res.status === 403) {
    const pauseMs = 300000; // 5 min block
    _rateLimitedUntil = Date.now() + pauseMs;
    console.warn(`  [403 forbidden — pausing 5min]`);
    await new Promise(r => setTimeout(r, pauseMs));
    return httpsGetWithBackoff(url, attempt + 1);
  }
  return res;
}

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/[^\w֐-׿]/g, " ").replace(/\s+/g, " ").trim();
}

// Strip format/press noise from album names before querying iTunes.
// e.g. "The Wall 2LP 1982 Germany Press (יד שנייה)" → "The Wall"
const _PAREN_RE = /\s*\([^)]*\)/g;
const _FORMAT_SUFFIX_RE = /\s+(?:\d{1,2}[xX]?)?(?:LP|2LP|3LP|4LP|EP|CD|DVD|7"|10"|12"|Single|Vinyl|Box\s*Set|Deluxe|Remaster(?:ed)?|Limited|Edition|Reissue|Colou?red?\s*Vinyl)\b.*$/i;
const _PRESS_YEAR_RE = /\s*:\s*\d{4}\b.*$/;
const _TRAIL_SEP_RE = /[\s\-–:,|/;.]+$/;

function cleanForQuery(text) {
  if (!text) return "";
  let s = text.replace(_PAREN_RE, "");        // strip (anything in parens)
  s = s.replace(_FORMAT_SUFFIX_RE, "");       // strip " 2LP..." and similar
  s = s.replace(_PRESS_YEAR_RE, "");          // strip ": 1982 USA Press..."
  s = s.replace(_TRAIL_SEP_RE, "").trim();
  return s || text.trim();
}

// Trim artist to first credited name for multi-artist strings like "A, B, C"
function primaryArtist(artist) {
  if (!artist) return "";
  const first = artist.split(/[,/&]|feat\.|ft\./i)[0].trim();
  return first || artist.trim();
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

async function fetchItunesMeta(artist, album) {
  const cleanAlbum = cleanForQuery(album);
  const cleanArtist = primaryArtist(artist);
  const query = cleanArtist && cleanAlbum ? `${cleanArtist} ${cleanAlbum}` : (cleanAlbum || cleanArtist);
  if (!query) return null;

  const url = `https://itunes.apple.com/search?entity=album&limit=10&term=${encodeURIComponent(query)}`;
  const res = await httpsGetWithBackoff(url);
  if (!res.ok || !res.text) return null;

  let payload;
  try { payload = JSON.parse(res.text); } catch { return null; }

  const results = Array.isArray(payload && payload.results) ? payload.results : [];
  let best = null;

  for (const item of results) {
    const artworkRaw = String(item.artworkUrl100 || "");
    const artwork = artworkRaw.replace("100x100bb", "600x600bb");
    const scoreAlbum = scoreMatch(cleanAlbum || query, item.collectionName);
    const scoreArtist = cleanArtist ? scoreMatch(cleanArtist, item.artistName) : 0.5;
    const score = scoreAlbum * 0.7 + scoreArtist * 0.3;

    if (!best || score > best.score) {
      const relDate = String(item.releaseDate || "");
      const yr = relDate.slice(0, 4);
      best = {
        score,
        genre: String(item.primaryGenreName || "").trim() || null,
        year: /^\d{4}$/.test(yr) ? Number(yr) : null,
        cover_url: artwork.startsWith("http") ? artwork : null,
        artist_name: String(item.artistName || "").trim() || null,
      };
    }
  }

  return best && best.score >= 0.40 ? best : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const records = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));
  const targets = records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.genre || !r.year);

  if (args.maxRecords > 0) targets.splice(args.maxRecords);

  console.log(`Records total: ${records.length}`);
  console.log(`Needing enrichment: ${targets.length}`);
  if (args.dryRun) { console.log("Dry run — no writes."); return; }

  const report = {
    generated_at: new Date().toISOString(),
    targets: targets.length,
    processed: 0,
    genre_filled: 0,
    year_filled: 0,
    cover_filled: 0,
    api_hits: 0,
    api_misses: 0,
  };

  let cursor = 0;

  function saveProgress() {
    fs.writeFileSync(RECORDS_PATH, JSON.stringify(records), "utf8");
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ ...report, saved_at: new Date().toISOString() }, null, 2), "utf8");
    console.log(
      `  saved  processed=${report.processed}/${targets.length}` +
      `  genre=${report.genre_filled}  year=${report.year_filled}  cover=${report.cover_filled}` +
      `  hits=${report.api_hits}  misses=${report.api_misses}`
    );
  }

  async function worker() {
    while (cursor < targets.length) {
      const { r, i } = targets[cursor++];
      const meta = await fetchItunesMeta(r.artist || "", r.album || "");

      report.processed++;

      if (meta) {
        report.api_hits++;
        if (!r.genre && meta.genre) { records[i].genre = meta.genre; report.genre_filled++; }
        if (!r.year  && meta.year)  { records[i].year  = meta.year;  report.year_filled++;  }
        // Fill cover only if still missing (null after remediate_names)
        if (!r.cover_url && meta.cover_url) { records[i].cover_url = meta.cover_url; report.cover_filled++; }
        // Backfill artist if missing
        if (!r.artist && meta.artist_name) { records[i].artist = meta.artist_name; }
      } else {
        report.api_misses++;
      }

      if (report.processed % args.saveEvery === 0) {
        saveProgress();
      }

      // ~3 req/s across 2 workers (~6 req/s total) — well under iTunes limit
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const workers = Array.from(
    { length: Math.min(args.concurrency, Math.max(1, targets.length)) },
    () => worker()
  );
  await Promise.all(workers);

  saveProgress();
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("\nDone.");
  console.log(`  genre filled : ${report.genre_filled}`);
  console.log(`  year  filled : ${report.year_filled}`);
  console.log(`  cover filled : ${report.cover_filled}`);
  console.log(`  api hits     : ${report.api_hits}`);
  console.log(`  api misses   : ${report.api_misses}`);
}

main().catch(err => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
