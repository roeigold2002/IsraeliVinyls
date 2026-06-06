#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  readJson,
  writeJson,
  toNumber,
  getEnrichmentUrl,
  normalizeCoverUrl,
  isLikelyCoverUrl,
  extractPriceValue,
  extractArtistFromText,
  extractCoverCandidates,
  parseArtistFromAlbum,
  parseArtistFromProductUrl,
  fetchTextWithFallback,
} = require("./remediation_common.cjs");

const DEFAULT_PROXY_TEMPLATES = String(
  process.env.TRUEUP_PROXY_TEMPLATES || "https://r.jina.ai/http://{url_raw}"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

let playwrightModule = undefined;

function nowIso() {
  return new Date().toISOString();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBool(value, fallback = false) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseArgs(argv) {
  const args = {
    recordsPath: path.join("netlify", "data", "records.json"),
    storesPath: path.join("netlify", "data", "stores.json"),
    queuePath: path.join("netlify", "data", "trueup_queue.json"),
    reportPath: path.join("netlify", "data", "trueup_report.json"),
    batchSize: Math.max(1, toNumber(process.env.TRUEUP_BATCH_SIZE, 180)),
    concurrency: Math.max(1, toNumber(process.env.TRUEUP_CONCURRENCY, 6)),
    timeoutMs: Math.max(1200, toNumber(process.env.TRUEUP_TIMEOUT_MS, 5000)),
    retries: Math.max(0, toNumber(process.env.TRUEUP_RETRIES, 1)),
    maxAttempts: Math.max(1, toNumber(process.env.TRUEUP_MAX_ATTEMPTS, 6)),
    retryBaseMs: Math.max(1000, toNumber(process.env.TRUEUP_RETRY_BASE_MS, 20000)),
    rebuildQueue: false,
    loop: false,
    intervalMs: Math.max(1000, toNumber(process.env.TRUEUP_INTERVAL_MS, 300000)),
    auditAllPrices: parseBool(process.env.TRUEUP_AUDIT_ALL_PRICES, true),
    refreshSnapshot: parseBool(process.env.TRUEUP_REFRESH_SNAPSHOT, false),
    useHeadless: parseBool(process.env.TRUEUP_USE_HEADLESS, true),
    maxHeadless: Math.max(0, toNumber(process.env.TRUEUP_MAX_HEADLESS, 8)),
    proxyTemplates: [...DEFAULT_PROXY_TEMPLATES],
    forcePriceRefresh: parseBool(process.env.TRUEUP_FORCE_PRICE_REFRESH, false),
    saveEvery: Math.max(10, toNumber(process.env.TRUEUP_SAVE_EVERY, 60)),
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
      case "--queue":
        args.queuePath = String(next || args.queuePath);
        i += 1;
        break;
      case "--report":
        args.reportPath = String(next || args.reportPath);
        i += 1;
        break;
      case "--batch-size":
        args.batchSize = Math.max(1, toNumber(next, args.batchSize));
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
      case "--max-attempts":
        args.maxAttempts = Math.max(1, toNumber(next, args.maxAttempts));
        i += 1;
        break;
      case "--retry-base-ms":
        args.retryBaseMs = Math.max(1000, toNumber(next, args.retryBaseMs));
        i += 1;
        break;
      case "--interval-ms":
        args.intervalMs = Math.max(1000, toNumber(next, args.intervalMs));
        i += 1;
        break;
      case "--max-headless":
        args.maxHeadless = Math.max(0, toNumber(next, args.maxHeadless));
        i += 1;
        break;
      case "--save-every":
        args.saveEvery = Math.max(10, toNumber(next, args.saveEvery));
        i += 1;
        break;
      case "--proxy-template":
        if (next) {
          args.proxyTemplates.push(String(next));
          i += 1;
        }
        break;
      case "--no-proxy":
        args.proxyTemplates = [];
        break;
      case "--rebuild-queue":
        args.rebuildQueue = true;
        break;
      case "--loop":
        args.loop = true;
        break;
      case "--audit-all-prices":
        args.auditAllPrices = true;
        break;
      case "--no-audit-all-prices":
        args.auditAllPrices = false;
        break;
      case "--refresh-snapshot":
        args.refreshSnapshot = true;
        break;
      case "--no-headless":
        args.useHeadless = false;
        break;
      case "--force-price-refresh":
        args.forcePriceRefresh = true;
        break;
      default:
        break;
    }
  }

  args.proxyTemplates = [...new Set(args.proxyTemplates.map((value) => String(value || "").trim()).filter(Boolean))];

  return args;
}

function isGeneratedCoverUrl(value) {
  const url = String(value || "").toLowerCase().trim();
  if (!url) {
    return false;
  }

  if (url.startsWith("data:image/svg+xml")) {
    return true;
  }

  return (
    url.includes("dummyimage.com") ||
    url.includes("placehold.co") ||
    url.includes("placeholder") ||
    url.includes("via.placeholder")
  );
}

function buildProxyUrl(template, url) {
  const normalizedTemplate = String(template || "").trim();
  if (!normalizedTemplate) {
    return "";
  }

  const encodedUrl = encodeURIComponent(url);
  const rawUrl = String(url || "").replace(/^https?:\/\//i, "");

  if (normalizedTemplate.includes("{url}")) {
    return normalizedTemplate.replaceAll("{url}", encodedUrl);
  }

  if (normalizedTemplate.includes("{url_raw}")) {
    return normalizedTemplate.replaceAll("{url_raw}", rawUrl);
  }

  const suffix = normalizedTemplate.endsWith("/") ? "" : "/";
  return `${normalizedTemplate}${suffix}${encodedUrl}`;
}

function buildQueueState() {
  return {
    version: 1,
    generated_at: nowIso(),
    last_run_at: null,
    pending: [],
    attempts: {},
    cooldown_until: {},
    processed_total: 0,
    updated_total: 0,
    failed_total: 0,
  };
}

function loadQueueState(filePath) {
  try {
    const loaded = readJson(filePath);
    if (!loaded || typeof loaded !== "object") {
      return buildQueueState();
    }

    return {
      ...buildQueueState(),
      ...loaded,
      pending: Array.isArray(loaded.pending) ? loaded.pending.map((id) => String(id)) : [],
      attempts: loaded.attempts && typeof loaded.attempts === "object" ? loaded.attempts : {},
      cooldown_until:
        loaded.cooldown_until && typeof loaded.cooldown_until === "object" ? loaded.cooldown_until : {},
    };
  } catch (_error) {
    return buildQueueState();
  }
}

function getBlockedStoreSet(stores) {
  return new Set(
    (Array.isArray(stores) ? stores : [])
      .filter((store) => String(store && store.connectivity_status || "") === "blocked")
      .map((store) => String(store && store.name || "").toLowerCase())
      .filter(Boolean)
  );
}

function determineNeeds(record, args) {
  const priceSource = String(record && record.price_source ? record.price_source : "").toLowerCase();
  const coverSource = String(record && record.cover_source ? record.cover_source : "").toLowerCase();
  const currentPrice = toNumber(record && record.price, 0);
  const coverUrl = String(record && record.cover_url ? record.cover_url : "").trim();
  const generatedCover = isGeneratedCoverUrl(coverUrl) || coverSource === "generated";

  const needsCover = generatedCover || !isLikelyCoverUrl(coverUrl);
  const needsPrice =
    currentPrice <= 0 ||
    priceSource === "imputed" ||
    (args.auditAllPrices && priceSource !== "live");
  const needsArtist = !String(record && record.artist ? record.artist : "").trim();

  return {
    needsCover,
    needsPrice,
    needsArtist,
  };
}

function shouldQueueRecord(record, args, blockedStores) {
  const storeName = String(record && record.store_name ? record.store_name : "").toLowerCase();
  if (blockedStores.has(storeName)) {
    return false;
  }

  const url = getEnrichmentUrl(record);
  if (!url) {
    return false;
  }

  const needs = determineNeeds(record, args);
  return needs.needsCover || needs.needsPrice || needs.needsArtist;
}

function buildInitialQueue(records, args, blockedStores) {
  const out = [];
  for (const record of records) {
    if (!record || !record.id) {
      continue;
    }
    if (shouldQueueRecord(record, args, blockedStores)) {
      out.push(String(record.id));
    }
  }
  return out;
}

function dequeueReadyIds(queueState, batchSize) {
  const ready = [];
  const totalToScan = queueState.pending.length;
  const now = Date.now();

  for (let i = 0; i < totalToScan && ready.length < batchSize; i += 1) {
    const id = queueState.pending.shift();
    if (!id) {
      continue;
    }

    const cooldownUntil = toNumber(queueState.cooldown_until[id], 0);
    if (cooldownUntil > now) {
      queueState.pending.push(id);
      continue;
    }

    delete queueState.cooldown_until[id];
    ready.push(id);
  }

  return ready;
}

function parseLiveDataFromHtml(html, sourceUrl) {
  const cover = extractCoverCandidates(html, sourceUrl)
    .map((candidate) => normalizeCoverUrl(candidate, sourceUrl))
    .filter((candidate) => candidate && isLikelyCoverUrl(candidate) && !isGeneratedCoverUrl(candidate))[0] || null;

  return {
    price: extractPriceValue(html),
    cover,
    artist: extractArtistFromText(html),
  };
}

async function fetchHtmlViaProxy(url, proxyTemplate, args) {
  const proxiedUrl = buildProxyUrl(proxyTemplate, url);
  if (!proxiedUrl) {
    return { ok: false, text: "", finalUrl: url, mode: "proxy" };
  }

  const result = await fetchTextWithFallback(proxiedUrl, {
    timeoutMs: args.timeoutMs + 1500,
    retries: Math.max(0, args.retries - 1),
    useBypass: false,
  });

  return {
    ...result,
    mode: "proxy",
  };
}

async function loadPlaywright() {
  if (playwrightModule !== undefined) {
    return playwrightModule;
  }

  try {
    playwrightModule = await import("playwright");
  } catch (_error) {
    playwrightModule = null;
  }

  return playwrightModule;
}

async function fetchHtmlViaHeadless(url, args) {
  const playwright = await loadPlaywright();
  if (!playwright || !playwright.chromium) {
    return {
      ok: false,
      text: "",
      finalUrl: url,
      mode: "headless",
      error: "playwright_unavailable",
    };
  }

  let browser = null;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    page.setDefaultTimeout(args.timeoutMs + 3000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: args.timeoutMs + 3000 });
    await page.waitForTimeout(700);
    const html = await page.content();
    const finalUrl = page.url() || url;

    return {
      ok: true,
      text: html,
      finalUrl,
      mode: "headless",
    };
  } catch (error) {
    return {
      ok: false,
      text: "",
      finalUrl: url,
      mode: "headless",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function fetchLiveCandidates(record, args, headlessState) {
  const url = getEnrichmentUrl(record);
  if (!url) {
    return [];
  }

  const candidates = [];

  const direct = await fetchTextWithFallback(url, {
    timeoutMs: args.timeoutMs,
    retries: args.retries,
    useBypass: false,
  });

  if (direct && direct.ok && direct.text) {
    candidates.push({
      strategy: "direct",
      text: direct.text,
      finalUrl: direct.finalUrl || url,
    });
  }

  for (const proxyTemplate of args.proxyTemplates) {
    const proxyResult = await fetchHtmlViaProxy(url, proxyTemplate, args);
    if (proxyResult && proxyResult.ok && proxyResult.text) {
      candidates.push({
        strategy: "proxy",
        text: proxyResult.text,
        finalUrl: url,
      });
      break;
    }
  }

  if (args.useHeadless && headlessState.used < args.maxHeadless) {
    const headlessResult = await fetchHtmlViaHeadless(url, args);
    if (headlessResult && headlessResult.ok && headlessResult.text) {
      headlessState.used += 1;
      candidates.push({
        strategy: "headless",
        text: headlessResult.text,
        finalUrl: headlessResult.finalUrl || url,
      });
    } else if (headlessResult && headlessResult.error === "playwright_unavailable") {
      headlessState.available = false;
    }
  }

  return candidates;
}

function applyLiveUpdates(record, parsed, strategy, args) {
  const before = {
    price: toNumber(record && record.price, 0),
    cover: String(record && record.cover_url ? record.cover_url : ""),
    artist: String(record && record.artist ? record.artist : ""),
  };

  let priceUpdated = false;
  let coverUpdated = false;
  let artistUpdated = false;

  if (toNumber(parsed && parsed.price, 0) > 0) {
    const nextPrice = Number(toNumber(parsed.price, 0).toFixed(2));
    const shouldRefreshPrice =
      before.price <= 0 ||
      String(record && record.price_source ? record.price_source : "").toLowerCase() === "imputed" ||
      args.forcePriceRefresh ||
      Math.abs(before.price - nextPrice) >= 0.01;

    if (shouldRefreshPrice) {
      record.price = nextPrice;
      record.price_source = "live";
      record.price_trueup_strategy = strategy;
      record.price_trueup_at = nowIso();
      priceUpdated = true;
    }
  }

  if (parsed && parsed.cover && parsed.cover !== before.cover) {
    record.cover_url = parsed.cover;
    record.cover_source = "live";
    record.cover_trueup_strategy = strategy;
    record.cover_trueup_at = nowIso();
    coverUpdated = true;
  }

  if (!before.artist.trim()) {
    const nextArtist =
      String(parsed && parsed.artist ? parsed.artist : "").trim() ||
      parseArtistFromAlbum(record && record.album) ||
      parseArtistFromProductUrl(record && (record.product_url || record.store_url));

    if (nextArtist) {
      record.artist = nextArtist;
      record.artist_source = "trueup";
      artistUpdated = true;
    }
  }

  record.last_trueup_at = nowIso();
  record.trueup_attempts = toNumber(record.trueup_attempts, 0) + 1;

  return {
    changed: priceUpdated || coverUpdated || artistUpdated,
    priceUpdated,
    coverUpdated,
    artistUpdated,
  };
}

async function trueUpRecord(record, args, headlessState) {
  if (!record) {
    return {
      ok: true,
      changed: false,
      reason: "missing_record",
      strategy: "skip",
    };
  }

  const needs = determineNeeds(record, args);
  if (!needs.needsCover && !needs.needsPrice && !needs.needsArtist) {
    return {
      ok: true,
      changed: false,
      reason: "already_fresh",
      strategy: "skip",
    };
  }

  const candidates = await fetchLiveCandidates(record, args, headlessState);
  if (!candidates || candidates.length === 0) {
    return {
      ok: false,
      changed: false,
      reason: "fetch_failed",
      strategy: "none",
      retryable: true,
    };
  }

  let finalUpdate = {
    changed: false,
    priceUpdated: false,
    coverUpdated: false,
    artistUpdated: false,
  };
  let lastStrategy = "none";

  for (const candidate of candidates) {
    const parsed = parseLiveDataFromHtml(candidate.text, candidate.finalUrl || getEnrichmentUrl(record));
    if (!parsed.price && !parsed.cover && !parsed.artist) {
      continue;
    }

    lastStrategy = candidate.strategy;
    const updateResult = applyLiveUpdates(record, parsed, candidate.strategy, args);
    finalUpdate = {
      changed: finalUpdate.changed || updateResult.changed,
      priceUpdated: finalUpdate.priceUpdated || updateResult.priceUpdated,
      coverUpdated: finalUpdate.coverUpdated || updateResult.coverUpdated,
      artistUpdated: finalUpdate.artistUpdated || updateResult.artistUpdated,
    };

    const unresolved = determineNeeds(record, args);
    if (!unresolved.needsCover && !unresolved.needsPrice && !unresolved.needsArtist) {
      break;
    }
  }

  if (!finalUpdate.changed) {
    return {
      ok: false,
      changed: false,
      reason: "no_live_improvement",
      strategy: lastStrategy,
      retryable: true,
      ...finalUpdate,
    };
  }

  return {
    ok: true,
    strategy: lastStrategy,
    reason: "updated",
    ...finalUpdate,
  };
}

function scheduleRetry(queueState, id, args) {
  const attempts = toNumber(queueState.attempts[id], 0) + 1;
  queueState.attempts[id] = attempts;

  if (attempts >= args.maxAttempts) {
    queueState.failed_total += 1;
    delete queueState.attempts[id];
    delete queueState.cooldown_until[id];
    return false;
  }

  const delayMs = args.retryBaseMs * Math.pow(2, Math.max(0, attempts - 1));
  queueState.cooldown_until[id] = Date.now() + delayMs;
  queueState.pending.push(id);
  return true;
}

function saveProgress(recordsPath, records, queuePath, queueState, reportPath, report) {
  writeJson(recordsPath, records);
  writeJson(queuePath, queueState);
  writeJson(reportPath, report);
}

function runExportSnapshot() {
  const commands = [
    [process.env.PYTHON_BIN || "python", ["-m", "scripts.export_snapshot"]],
    ["python3", ["-m", "scripts.export_snapshot"]],
  ];

  for (const [cmd, args] of commands) {
    const proc = spawnSync(cmd, args, {
      stdio: "pipe",
      encoding: "utf8",
      windowsHide: true,
    });

    if (proc && proc.status === 0) {
      return {
        ok: true,
        command: `${cmd} ${args.join(" ")}`,
        exit_code: proc.status,
      };
    }
  }

  return {
    ok: false,
    command: "python -m scripts.export_snapshot",
    exit_code: 1,
  };
}

async function runOnce(args) {
  const records = readJson(args.recordsPath);
  const stores = readJson(args.storesPath);
  const blockedStores = getBlockedStoreSet(stores);
  const queueState = loadQueueState(args.queuePath);

  if (args.rebuildQueue || queueState.pending.length === 0) {
    queueState.pending = buildInitialQueue(records, args, blockedStores);
    queueState.attempts = {};
    queueState.cooldown_until = {};
  }

  const idToIndex = new Map();
  for (let i = 0; i < records.length; i += 1) {
    idToIndex.set(String(records[i] && records[i].id), i);
  }

  const readyIds = dequeueReadyIds(queueState, args.batchSize);

  const runStats = {
    started_at: nowIso(),
    processed: 0,
    updated: 0,
    price_updated: 0,
    cover_updated: 0,
    artist_updated: 0,
    retries_scheduled: 0,
    exhausted_failures: 0,
    strategies: {
      direct: 0,
      proxy: 0,
      headless: 0,
      skip: 0,
      none: 0,
    },
    queue_before: queueState.pending.length + readyIds.length,
    queue_after: queueState.pending.length,
  };

  const headlessState = {
    used: 0,
    available: true,
  };

  let cursor = 0;

  const workers = Array.from({ length: Math.min(args.concurrency, Math.max(1, readyIds.length)) }, async () => {
    while (cursor < readyIds.length) {
      const id = readyIds[cursor];
      cursor += 1;

      const index = idToIndex.get(String(id));
      const record = Number.isInteger(index) ? records[index] : null;

      if (!record) {
        queueState.processed_total += 1;
        runStats.processed += 1;
        continue;
      }

      if (!shouldQueueRecord(record, args, blockedStores)) {
        delete queueState.attempts[id];
        delete queueState.cooldown_until[id];
        queueState.processed_total += 1;
        runStats.processed += 1;
        runStats.strategies.skip += 1;
        continue;
      }

      const result = await trueUpRecord(record, args, headlessState);
      runStats.processed += 1;
      queueState.processed_total += 1;
      runStats.strategies[result.strategy] = (runStats.strategies[result.strategy] || 0) + 1;

      if (result.ok) {
        delete queueState.attempts[id];
        delete queueState.cooldown_until[id];

        if (result.changed) {
          runStats.updated += 1;
          queueState.updated_total += 1;
          if (result.priceUpdated) runStats.price_updated += 1;
          if (result.coverUpdated) runStats.cover_updated += 1;
          if (result.artistUpdated) runStats.artist_updated += 1;
        }
      } else {
        const retryScheduled = scheduleRetry(queueState, id, args);
        if (retryScheduled) {
          runStats.retries_scheduled += 1;
        } else {
          runStats.exhausted_failures += 1;
        }
      }

      if (runStats.processed % args.saveEvery === 0) {
        const interimReport = {
          generated_at: nowIso(),
          queue_remaining: queueState.pending.length,
          queue_processed_total: queueState.processed_total,
          queue_updated_total: queueState.updated_total,
          queue_failed_total: queueState.failed_total,
          run: runStats,
        };
        saveProgress(args.recordsPath, records, args.queuePath, queueState, args.reportPath, interimReport);
      }
    }
  });

  await Promise.all(workers);

  runStats.queue_after = queueState.pending.length;
  queueState.last_run_at = nowIso();

  const report = {
    generated_at: nowIso(),
    queue_remaining: queueState.pending.length,
    queue_processed_total: queueState.processed_total,
    queue_updated_total: queueState.updated_total,
    queue_failed_total: queueState.failed_total,
    headless_used: headlessState.used,
    headless_available: headlessState.available,
    run: {
      ...runStats,
      finished_at: nowIso(),
    },
  };

  if (args.refreshSnapshot && runStats.updated > 0) {
    report.snapshot_refresh = runExportSnapshot();
  }

  saveProgress(args.recordsPath, records, args.queuePath, queueState, args.reportPath, report);

  console.log("TRUEUP_WORKER_DONE");
  console.log(
    JSON.stringify(
      {
        processed: runStats.processed,
        updated: runStats.updated,
        price_updated: runStats.price_updated,
        cover_updated: runStats.cover_updated,
        artist_updated: runStats.artist_updated,
        retries_scheduled: runStats.retries_scheduled,
        exhausted_failures: runStats.exhausted_failures,
        queue_remaining: queueState.pending.length,
        headless_used: headlessState.used,
      },
      null,
      2
    )
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.loop) {
    await runOnce(args);
    return;
  }

  for (;;) {
    await runOnce(args);
    await wait(args.intervalMs);
  }
}

main().catch((error) => {
  console.error("TRUEUP_WORKER_FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
