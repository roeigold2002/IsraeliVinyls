#!/usr/bin/env node

const path = require("node:path");

const {
  readJson,
  writeJson,
  toNumber,
  getEnrichmentUrl,
  normalizeCoverUrl,
  isLikelyCoverUrl,
  extractCoverCandidates,
  extractArtistFromText,
  parseArtistFromAlbum,
  parseArtistFromProductUrl,
  buildGeneratedCoverUrl,
  fetchTextWithFallback,
  probeImageUrl,
  fetchItunesCandidate,
} = require("./remediation_common.cjs");

function parseArgs(argv) {
  const args = {
    recordsPath: path.join("netlify", "data", "records.json"),
    storesPath: path.join("netlify", "data", "stores.json"),
    reportPath: path.join("netlify", "data", "asset_remediation_report.json"),
    concurrency: 20,
    timeoutMs: 4500,
    retries: 1,
    maxRecords: 0,
    saveEvery: 200,
    verifyImages: true,
    bypassAll: true,
    offlineMode: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    switch (token) {
      case "--records":
        args.recordsPath = String(next || args.recordsPath);
        i += 1;
        break;
      case "--stores":
        args.storesPath = String(next || args.storesPath);
        i += 1;
        break;
      case "--report":
        args.reportPath = String(next || args.reportPath);
        i += 1;
        break;
      case "--concurrency":
        args.concurrency = Math.max(1, toNumber(next, args.concurrency));
        i += 1;
        break;
      case "--timeout-ms":
        args.timeoutMs = Math.max(1200, toNumber(next, args.timeoutMs));
        i += 1;
        break;
      case "--retries":
        args.retries = Math.max(0, toNumber(next, args.retries));
        i += 1;
        break;
      case "--max-records":
        args.maxRecords = Math.max(0, toNumber(next, 0));
        i += 1;
        break;
      case "--save-every":
        args.saveEvery = Math.max(50, toNumber(next, args.saveEvery));
        i += 1;
        break;
      case "--no-verify-images":
        args.verifyImages = false;
        break;
      case "--bypass-all":
        args.bypassAll = true;
        break;
      case "--blocked-only-bypass":
        args.bypassAll = false;
        break;
      case "--offline":
        args.offlineMode = true;
        break;
      default:
        break;
    }
  }

  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function summarizeStoreStats(statsMap) {
  return Object.entries(statsMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.processed - a.processed);
}

async function pickBestCover(candidates, options = {}) {
  for (const candidate of candidates) {
    if (!isLikelyCoverUrl(candidate)) {
      continue;
    }

    if (!options.verifyImages) {
      return candidate;
    }

    const ok = await probeImageUrl(candidate, options.timeoutMs || 3000);
    if (ok) {
      return candidate;
    }
  }

  return "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = readJson(args.recordsPath);
  const stores = readJson(args.storesPath);

  const blockedStores = new Set(
    (Array.isArray(stores) ? stores : [])
      .filter((store) => String(store && store.connectivity_status || "") === "blocked")
      .map((store) => String(store && store.name || "").toLowerCase())
      .filter(Boolean),
  );

  const targets = [];
  for (let i = 0; i < records.length; i += 1) {
    if (!isLikelyCoverUrl(records[i] && records[i].cover_url)) {
      targets.push(i);
    }
  }

  if (args.maxRecords > 0) {
    targets.splice(args.maxRecords);
  }

  const report = {
    generated_at: nowIso(),
    records_total: records.length,
    targets_total: targets.length,
    processed: 0,
    no_url: 0,
    fetch_failures: 0,
    cover_fixed: 0,
    artist_fixed: 0,
    via_page_cover: 0,
    via_itunes_cover: 0,
    via_generated_cover: 0,
    bypass_hits: 0,
    direct_hits: 0,
    stores: {},
  };

  let cursor = 0;

  async function runOne(index) {
    const record = records[index];
    const storeName = String(record.store_name || "Unknown");
    const storeKey = storeName.toLowerCase();
    const storeStats = (report.stores[storeName] ||= {
      processed: 0,
      cover_fixed: 0,
      artist_fixed: 0,
      via_page_cover: 0,
      via_itunes_cover: 0,
      via_generated_cover: 0,
      bypass_hits: 0,
      direct_hits: 0,
      fetch_failures: 0,
      no_url: 0,
    });

    report.processed += 1;
    storeStats.processed += 1;

    let pageText = "";
    const url = getEnrichmentUrl(record);
    let pageSourceUrl = url;

    if (!String(record.artist || "").trim()) {
      const parsedArtist =
        parseArtistFromAlbum(record.album) ||
        parseArtistFromProductUrl(record.product_url || record.store_url);
      if (parsedArtist) {
        record.artist = parsedArtist;
        report.artist_fixed += 1;
        storeStats.artist_fixed += 1;
      }
    }

    if (url && !args.offlineMode) {
      const fetched = await fetchTextWithFallback(url, {
        timeoutMs: args.timeoutMs,
        retries: args.retries,
        useBypass: args.bypassAll || blockedStores.has(storeKey),
      });

      if (fetched.ok && fetched.text) {
        pageText = fetched.text;
        pageSourceUrl = fetched.finalUrl || url;
        if (fetched.mode === "bypass") {
          report.bypass_hits += 1;
          storeStats.bypass_hits += 1;
        } else {
          report.direct_hits += 1;
          storeStats.direct_hits += 1;
        }
      } else {
        report.fetch_failures += 1;
        storeStats.fetch_failures += 1;
      }
    } else if (!url) {
      report.no_url += 1;
      storeStats.no_url += 1;
    }

    if (!String(record.artist || "").trim()) {
      const parsedArtist =
        extractArtistFromText(pageText) ||
        parseArtistFromAlbum(record.album) ||
        parseArtistFromProductUrl(record.product_url || record.store_url);
      if (parsedArtist) {
        record.artist = parsedArtist;
        report.artist_fixed += 1;
        storeStats.artist_fixed += 1;
      }
    }

    let assignedCover = "";
    if (pageText) {
      const candidates = extractCoverCandidates(pageText, pageSourceUrl).map((candidate) =>
        normalizeCoverUrl(candidate, pageSourceUrl),
      );

      assignedCover = await pickBestCover(candidates.filter(Boolean), {
        verifyImages: args.verifyImages,
        timeoutMs: Math.min(3000, args.timeoutMs),
      });

      if (assignedCover) {
        record.cover_url = assignedCover;
        record.cover_source = fetched.mode === "bypass" ? "page_bypass" : "page";
        report.cover_fixed += 1;
        report.via_page_cover += 1;
        storeStats.cover_fixed += 1;
        storeStats.via_page_cover += 1;
      }
    }

    if (!assignedCover && !args.offlineMode) {
      const itunes = await fetchItunesCandidate(record, {
        timeoutMs: Math.min(3200, args.timeoutMs),
      });
      if (itunes && isLikelyCoverUrl(itunes.cover_url)) {
        const ok = args.verifyImages
          ? await probeImageUrl(itunes.cover_url, Math.min(2800, args.timeoutMs))
          : true;

        if (ok) {
          record.cover_url = itunes.cover_url;
          record.cover_source = "itunes";
          report.cover_fixed += 1;
          report.via_itunes_cover += 1;
          storeStats.cover_fixed += 1;
          storeStats.via_itunes_cover += 1;

          if (!String(record.artist || "").trim() && itunes.artist) {
            record.artist = itunes.artist;
            report.artist_fixed += 1;
            storeStats.artist_fixed += 1;
          }
        }
      }
    }

    if (!assignedCover) {
      const generatedCover = buildGeneratedCoverUrl(record);
      if (isLikelyCoverUrl(generatedCover)) {
        record.cover_url = generatedCover;
        record.cover_source = "generated";
        report.cover_fixed += 1;
        report.via_generated_cover += 1;
        storeStats.cover_fixed += 1;
        storeStats.via_generated_cover += 1;
      }
    }

    if (report.processed % args.saveEvery === 0) {
      writeJson(args.recordsPath, records);
      writeJson(args.reportPath, {
        ...report,
        stores: summarizeStoreStats(report.stores),
      });
      console.log(
        `progress=${report.processed}/${targets.length} cover_fixed=${report.cover_fixed} artist_fixed=${report.artist_fixed}`,
      );
    }
  }

  const workers = Array.from({ length: Math.min(args.concurrency, Math.max(1, targets.length)) }, async () => {
    while (cursor < targets.length) {
      const next = targets[cursor];
      cursor += 1;
      await runOne(next);
    }
  });

  await Promise.all(workers);

  writeJson(args.recordsPath, records);
  const finalized = {
    ...report,
    finished_at: nowIso(),
    stores: summarizeStoreStats(report.stores),
  };
  writeJson(args.reportPath, finalized);

  console.log("ASSET_REMEDIATION_DONE");
  console.log(
    JSON.stringify(
      {
        targets_total: report.targets_total,
        processed: report.processed,
        cover_fixed: report.cover_fixed,
        artist_fixed: report.artist_fixed,
        via_page_cover: report.via_page_cover,
        via_itunes_cover: report.via_itunes_cover,
        via_generated_cover: report.via_generated_cover,
        fetch_failures: report.fetch_failures,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("ASSET_REMEDIATION_FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
