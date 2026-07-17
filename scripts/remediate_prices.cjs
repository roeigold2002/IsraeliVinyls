#!/usr/bin/env node

const path = require("node:path");

const {
  readJson,
  writeJson,
  toNumber,
  getEnrichmentUrl,
  extractPriceValue,
  extractStockStatus,
  extractArtistFromText,
  parseArtistFromAlbum,
  parseArtistFromProductUrl,
  fetchTextWithFallback,
} = require("./remediation_common.cjs");

function parseArgs(argv) {
  const args = {
    recordsPath: path.join("netlify", "data", "records.json"),
    storesPath: path.join("netlify", "data", "stores.json"),
    reportPath: path.join("netlify", "data", "price_remediation_report.json"),
    overridesPath: path.join("netlify", "data", "store_connectivity_overrides.json"),
    concurrency: 24,
    timeoutMs: 4500,
    retries: 1,
    maxRecords: 0,
    saveEvery: 250,
    bypassAll: true,
    offlineMode: false,
    refreshDays: 30,
    // Fabricating prices from store medians is opt-in. Imputed prices are
    // marked with price_source="imputed" and re-fetched on the next run.
    imputeMissing: false,
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
      case "--overrides":
        args.overridesPath = String(next || args.overridesPath);
        i += 1;
        break;
      case "--concurrency":
        args.concurrency = Math.max(1, toNumber(next, args.concurrency));
        i += 1;
        break;
      case "--timeout-ms":
        args.timeoutMs = Math.max(1000, toNumber(next, args.timeoutMs));
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
      case "--bypass-all":
        args.bypassAll = true;
        break;
      case "--blocked-only-bypass":
        args.bypassAll = false;
        break;
      case "--offline":
        args.offlineMode = true;
        break;
      case "--refresh-days":
        args.refreshDays = Math.max(1, toNumber(next, 30));
        i += 1;
        break;
      case "--impute":
        args.imputeMissing = true;
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

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = values
    .map((value) => toNumber(value, 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
  }
  return Number(sorted[middle].toFixed(2));
}

function buildPriceBaselines(records) {
  const byStore = new Map();
  const all = [];

  for (const record of records) {
    const price = toNumber(record && record.price, 0);
    if (price <= 0) {
      continue;
    }

    const storeName = String(record && record.store_name ? record.store_name : "Unknown");
    if (!byStore.has(storeName)) {
      byStore.set(storeName, []);
    }
    byStore.get(storeName).push(price);
    all.push(price);
  }

  const storeMedians = {};
  for (const [storeName, values] of byStore.entries()) {
    storeMedians[storeName] = {
      median: median(values),
      samples: values.length,
    };
  }

  const globalMedian = median(all) || 119;
  return {
    globalMedian,
    globalSamples: all.length,
    storeMedians,
  };
}

function updateOverrides(overridesPath, storeStats) {
  const payload = { generated_at: nowIso(), stores: {} };

  for (const item of storeStats) {
    const bypassHits = toNumber(item.bypass_hits, 0);
    const processed = toNumber(item.processed, 0);
    const fixedPrice = toNumber(item.price_fixed, 0);
    if (processed <= 0) {
      continue;
    }

    const bypassRate = bypassHits / processed;
    const priceRate = fixedPrice / processed;

    if (
      bypassHits >= 25 &&
      (bypassRate >= 0.15 || priceRate >= 0.15)
    ) {
      payload.stores[item.name] = {
        enabled: true,
        connectivity_note: `Auto-enabled by price remediation worker (bypass_hits=${bypassHits}, price_fixed=${fixedPrice})`,
      };
      continue;
    }

    if (fixedPrice >= 100 && priceRate >= 0.25) {
      payload.stores[item.name] = {
        enabled: true,
        connectivity_note: `Auto-enabled by price remediation worker (local extraction fallback, price_fixed=${fixedPrice}, rate=${priceRate.toFixed(2)})`,
      };
    }
  }

  if (Object.keys(payload.stores).length > 0) {
    writeJson(overridesPath, payload);
  }

  return payload;
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

  const nowMs = Date.now();
  const refreshCutoffMs = args.refreshDays * 24 * 60 * 60 * 1000;

  // Records whose last fetch failed retry sooner than the regular refresh
  // window, but not on every run (avoids hammering permanently dead URLs).
  const failedRetryCutoffMs = Math.min(refreshCutoffMs, 3 * 24 * 60 * 60 * 1000);

  const targets = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] || {};
    const price = toNumber(record.price, 0);
    const hasInStock = record.in_stock === true || record.in_stock === false;
    const checkedAt = record.checked_at ? new Date(record.checked_at).getTime() : 0;
    const cutoffMs = record.fetch_ok === false ? failedRetryCutoffMs : refreshCutoffMs;
    const isStale = !checkedAt || (nowMs - checkedAt) > cutoffMs;
    const hasImputedPrice = String(record.price_source || "") === "imputed";

    if (price <= 0 || !hasInStock || isStale || hasImputedPrice) {
      targets.push(i);
    }
  }

  // Sort: missing price first, then never-checked, then oldest-checked
  targets.sort((a, b) => {
    const aRec = records[a] || {};
    const bRec = records[b] || {};
    const aPrice = toNumber(aRec.price, 0);
    const bPrice = toNumber(bRec.price, 0);
    if (aPrice <= 0 && bPrice > 0) return -1;
    if (bPrice <= 0 && aPrice > 0) return 1;
    const aTime = aRec.checked_at ? new Date(aRec.checked_at).getTime() : 0;
    const bTime = bRec.checked_at ? new Date(bRec.checked_at).getTime() : 0;
    return aTime - bTime;
  });

  if (args.maxRecords > 0) {
    targets.splice(args.maxRecords);
  }

  const report = {
    generated_at: nowIso(),
    records_total: records.length,
    targets_total: targets.length,
    processed: 0,
    fetch_failures: 0,
    no_url: 0,
    price_fixed: 0,
    stock_fixed: 0,
    artist_fixed: 0,
    direct_hits: 0,
    bypass_hits: 0,
    local_token_hits: 0,
    imputed_price_hits: 0,
    stores: {},
  };

  let cursor = 0;

  async function runOne(index) {
    const record = records[index];
    const storeName = String(record.store_name || "Unknown");
    const storeKey = storeName.toLowerCase();
    const storeStats = (report.stores[storeName] ||= {
      processed: 0,
      price_fixed: 0,
      stock_fixed: 0,
      artist_fixed: 0,
      bypass_hits: 0,
      direct_hits: 0,
      fetch_failures: 0,
      no_url: 0,
      local_token_hits: 0,
      imputed_price_hits: 0,
    });

    storeStats.processed += 1;
    report.processed += 1;

    const localText = `${record.album || ""} ${record.condition || ""} ${record.artist || ""} ${record.product_url || ""} ${record.store_url || ""}`;
    const localPrice = extractPriceValue(localText);
    if (localPrice > 0) {
      record.price = localPrice;
      record.price_source = "local_extract";
      report.price_fixed += 1;
      storeStats.price_fixed += 1;
      report.local_token_hits += 1;
      storeStats.local_token_hits += 1;
    }

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

    // Fetch whenever the record is missing data OR its data is stale.
    // (The old condition skipped any record that already had a price, which
    // meant imputed/stale prices were never re-verified — the pipeline was
    // a no-op for nearly the entire catalog.)
    const hasInStock = record.in_stock === true || record.in_stock === false;
    const checkedAtMs = record.checked_at ? new Date(record.checked_at).getTime() : 0;
    const recordIsStale = !checkedAtMs || (Date.now() - checkedAtMs) > refreshCutoffMs;
    const needsFetch =
      toNumber(record.price, 0) <= 0 ||
      !String(record.artist || "").trim() ||
      !hasInStock ||
      recordIsStale ||
      String(record.price_source || "") === "imputed";

    if (needsFetch && !args.offlineMode) {
      const url = getEnrichmentUrl(record);
      if (!url) {
        report.no_url += 1;
        storeStats.no_url += 1;
      } else {
        const fetched = await fetchTextWithFallback(url, {
          timeoutMs: args.timeoutMs,
          retries: args.retries,
          useBypass: args.bypassAll || blockedStores.has(storeKey),
        });

        if (fetched.ok && fetched.text) {
          if (fetched.mode === "bypass") {
            report.bypass_hits += 1;
            storeStats.bypass_hits += 1;
          } else {
            report.direct_hits += 1;
            storeStats.direct_hits += 1;
          }

          // Update price — live fetch wins; only count as "fixed" if price was missing
          const extractedPrice = extractPriceValue(fetched.text);
          if (extractedPrice > 0) {
            const hadPrice = toNumber(record.price, 0) > 0;
            record.price = extractedPrice;
            record.price_source = fetched.mode === "bypass" ? "live_fetch_bypass" : "live_fetch";
            if (!hadPrice) {
              report.price_fixed += 1;
              storeStats.price_fixed += 1;
            }
          }

          // Extract in_stock status
          const stockStatus = extractStockStatus(fetched.text);
          if (stockStatus !== null) {
            const hadStock = record.in_stock === true || record.in_stock === false;
            record.in_stock = stockStatus;
            if (!hadStock) {
              report.stock_fixed += 1;
              storeStats.stock_fixed += 1;
            }
          }

          if (!String(record.artist || "").trim()) {
            const parsedArtist =
              extractArtistFromText(fetched.text) ||
              parseArtistFromAlbum(record.album) ||
              parseArtistFromProductUrl(record.product_url || record.store_url);
            if (parsedArtist) {
              record.artist = parsedArtist;
              report.artist_fixed += 1;
              storeStats.artist_fixed += 1;
            }
          }

          record.checked_at = nowIso();
          record.fetch_ok = true;
        } else {
          // Stamp failures too so dead URLs back off (shorter retry window)
          // instead of being re-attempted on every single run.
          record.checked_at = nowIso();
          record.fetch_ok = false;
          report.fetch_failures += 1;
          storeStats.fetch_failures += 1;
        }
      }
    }

    if (report.processed % args.saveEvery === 0) {
      writeJson(args.recordsPath, records);
      writeJson(args.reportPath, {
        ...report,
        stores: summarizeStoreStats(report.stores),
      });
      console.log(
        `progress=${report.processed}/${targets.length} price_fixed=${report.price_fixed} stock_fixed=${report.stock_fixed} artist_fixed=${report.artist_fixed}`,
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

  const baselines = buildPriceBaselines(records);
  for (const index of args.imputeMissing ? targets : []) {
    const record = records[index];
    if (toNumber(record && record.price, 0) > 0) {
      continue;
    }

    const storeName = String(record && record.store_name ? record.store_name : "Unknown");
    const storeStats = (report.stores[storeName] ||= {
      processed: 0,
      price_fixed: 0,
      stock_fixed: 0,
      artist_fixed: 0,
      bypass_hits: 0,
      direct_hits: 0,
      fetch_failures: 0,
      no_url: 0,
      local_token_hits: 0,
      imputed_price_hits: 0,
    });

    const storeBaseline = baselines.storeMedians[storeName] || null;
    const canUseStoreMedian = storeBaseline && toNumber(storeBaseline.samples, 0) >= 20;
    const chosen = canUseStoreMedian
      ? toNumber(storeBaseline.median, 0)
      : toNumber(baselines.globalMedian, 0);

    if (chosen <= 0) {
      continue;
    }

    record.price = Number(chosen.toFixed(2));
    record.price_source = "imputed";
    report.price_fixed += 1;
    report.imputed_price_hits += 1;
    storeStats.price_fixed += 1;
    storeStats.imputed_price_hits += 1;
  }

  writeJson(args.recordsPath, records);
  const storeStats = summarizeStoreStats(report.stores);
  const overrides = updateOverrides(args.overridesPath, storeStats);
  const finalized = {
    ...report,
    finished_at: nowIso(),
    imputation: {
      global_median: baselines.globalMedian,
      global_samples: baselines.globalSamples,
    },
    stores: storeStats,
    connectivity_overrides_written: Object.keys(overrides.stores || {}).length,
  };

  writeJson(args.reportPath, finalized);

  console.log("PRICE_REMEDIATION_DONE");
  console.log(
    JSON.stringify(
      {
        targets_total: report.targets_total,
        processed: report.processed,
        price_fixed: report.price_fixed,
        stock_fixed: report.stock_fixed,
        artist_fixed: report.artist_fixed,
        direct_hits: report.direct_hits,
        bypass_hits: report.bypass_hits,
        local_token_hits: report.local_token_hits,
        imputed_price_hits: report.imputed_price_hits,
        fetch_failures: report.fetch_failures,
        connectivity_overrides_written: finalized.connectivity_overrides_written,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("PRICE_REMEDIATION_FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
