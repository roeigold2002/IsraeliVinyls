#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    probes: 1,
    intervalMs: 0,
    timeoutMs: 5000,
    availabilityTargetPercent: 99.5,
    maxFailureRatePercent: 1,
    maxP95LatencyMs: 2500,
    maxErrorBudgetBurnPercent: 100,
    output: "",
    stageName: "synthetic",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    switch (token) {
      case "--base-url":
        args.baseUrl = String(next || "");
        i += 1;
        break;
      case "--probes":
        args.probes = Number.parseInt(String(next || "1"), 10);
        i += 1;
        break;
      case "--interval-ms":
        args.intervalMs = Number.parseInt(String(next || "0"), 10);
        i += 1;
        break;
      case "--timeout-ms":
        args.timeoutMs = Number.parseInt(String(next || "5000"), 10);
        i += 1;
        break;
      case "--availability-target":
        args.availabilityTargetPercent = Number.parseFloat(String(next || "99.5"));
        i += 1;
        break;
      case "--max-failure-rate":
        args.maxFailureRatePercent = Number.parseFloat(String(next || "1"));
        i += 1;
        break;
      case "--max-p95-ms":
        args.maxP95LatencyMs = Number.parseFloat(String(next || "2500"));
        i += 1;
        break;
      case "--max-error-budget-burn":
        args.maxErrorBudgetBurnPercent = Number.parseFloat(String(next || "100"));
        i += 1;
        break;
      case "--output":
        args.output = String(next || "");
        i += 1;
        break;
      case "--stage-name":
        args.stageName = String(next || "synthetic");
        i += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!trimmed) {
    throw new Error("Missing --base-url");
  }
  return trimmed;
}

function calcErrorBudgetBurnPercent(failureRatePercent, availabilityTargetPercent) {
  const allowedFailureRate = Math.max(0, 100 - availabilityTargetPercent);
  if (allowedFailureRate <= 0) {
    return failureRatePercent <= 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return (failureRatePercent / allowedFailureRate) * 100;
}

function buildChecks() {
  return [
    {
      name: "health",
      path: "/api/health",
      expectedStatus: 200,
      validate: (payload) => {
        if (!payload || payload.ok !== true) {
          throw new Error("health response must include ok=true");
        }
        if (toNumber(payload.records, -1) < 0) {
          throw new Error("health response missing records count");
        }
      },
    },
    {
      name: "search",
      path: "/api/search?q=rock&per_page=5",
      expectedStatus: 200,
      validate: (payload) => {
        if (!payload || !Array.isArray(payload.records)) {
          throw new Error("search response must include records array");
        }
        if (typeof payload.total !== "number") {
          throw new Error("search response missing total");
        }
        if (payload.records.length > 5) {
          throw new Error("search response exceeds per_page");
        }
      },
    },
    {
      name: "snapshot-meta",
      path: "/api/snapshot-meta",
      expectedStatus: 200,
      validate: (payload) => {
        if (!payload || typeof payload !== "object") {
          throw new Error("snapshot-meta must return object");
        }
        for (const field of ["pricing_integrity", "connectivity", "asset_integrity"]) {
          if (!Object.prototype.hasOwnProperty.call(payload, field)) {
            throw new Error(`snapshot-meta missing ${field}`);
          }
        }
      },
    },
    {
      name: "link-health-guard",
      path: "/api/link-health?url=http://localhost/internal",
      expectedStatus: 400,
      validate: (payload) => {
        if (!payload || typeof payload.error !== "string") {
          throw new Error("link-health guard must return error string");
        }
      },
    },
  ];
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });

    const text = await res.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_error) {
      throw new Error("Response is not valid JSON");
    }

    return {
      status: res.status,
      payload,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runSingleCheck(baseUrl, check, timeoutMs, probeIndex) {
  const url = `${baseUrl}${check.path}`;
  const startedAt = performance.now();

  try {
    const { status, payload } = await fetchJson(url, timeoutMs);
    if (status !== check.expectedStatus) {
      throw new Error(`Expected HTTP ${check.expectedStatus}, got ${status}`);
    }

    check.validate(payload);

    return {
      probe: probeIndex,
      check: check.name,
      url,
      pass: true,
      status,
      latency_ms: Number((performance.now() - startedAt).toFixed(1)),
      error: null,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      probe: probeIndex,
      check: check.name,
      url,
      pass: false,
      status: null,
      latency_ms: Number((performance.now() - startedAt).toFixed(1)),
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

async function runSyntheticChecks(options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const checks = buildChecks();

  const probes = Math.max(1, toNumber(options.probes, 1));
  const intervalMs = Math.max(0, toNumber(options.intervalMs, 0));
  const timeoutMs = Math.max(1000, toNumber(options.timeoutMs, 5000));

  let failedProbeStreak = 0;
  let maxConsecutiveFailedProbes = 0;
  const probeSummaries = [];
  const checkResults = [];

  for (let probe = 1; probe <= probes; probe += 1) {
    const probeResults = [];
    for (const check of checks) {
      const result = await runSingleCheck(baseUrl, check, timeoutMs, probe);
      checkResults.push(result);
      probeResults.push(result);
    }

    const probePass = probeResults.every((result) => result.pass);
    if (probePass) {
      failedProbeStreak = 0;
    } else {
      failedProbeStreak += 1;
      maxConsecutiveFailedProbes = Math.max(maxConsecutiveFailedProbes, failedProbeStreak);
    }

    probeSummaries.push({
      probe,
      pass: probePass,
      failed_checks: probeResults.filter((result) => !result.pass).map((result) => result.check),
    });

    if (probe < probes && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }

  const totalChecks = checkResults.length;
  const passedChecks = checkResults.filter((result) => result.pass).length;
  const failedChecks = totalChecks - passedChecks;
  const failureRatePercent = totalChecks > 0 ? (failedChecks / totalChecks) * 100 : 100;
  const availabilityPercent = 100 - failureRatePercent;

  const latencyValues = checkResults.map((result) => result.latency_ms);
  const p95LatencyMs = percentile(latencyValues, 95);

  const availabilityTargetPercent = toNumber(options.availabilityTargetPercent, 99.5);
  const maxFailureRatePercent = toNumber(options.maxFailureRatePercent, 1);
  const maxP95LatencyMs = toNumber(options.maxP95LatencyMs, 2500);
  const maxErrorBudgetBurnPercent = toNumber(options.maxErrorBudgetBurnPercent, 100);

  const errorBudgetBurnPercent = calcErrorBudgetBurnPercent(failureRatePercent, availabilityTargetPercent);

  const thresholdFailures = [];
  if (failureRatePercent > maxFailureRatePercent) {
    thresholdFailures.push(`failure_rate ${failureRatePercent.toFixed(2)}% > ${maxFailureRatePercent.toFixed(2)}%`);
  }
  if (p95LatencyMs > maxP95LatencyMs) {
    thresholdFailures.push(`p95_latency ${p95LatencyMs.toFixed(1)}ms > ${maxP95LatencyMs.toFixed(1)}ms`);
  }
  if (errorBudgetBurnPercent > maxErrorBudgetBurnPercent) {
    thresholdFailures.push(
      `error_budget_burn ${errorBudgetBurnPercent.toFixed(1)}% > ${maxErrorBudgetBurnPercent.toFixed(1)}%`,
    );
  }

  const summary = {
    stage_name: String(options.stageName || "synthetic"),
    target_base_url: baseUrl,
    generated_at: new Date().toISOString(),
    probes,
    checks_per_probe: checks.length,
    total_checks: totalChecks,
    passed_checks: passedChecks,
    failed_checks: failedChecks,
    availability_percent: Number(availabilityPercent.toFixed(3)),
    failure_rate_percent: Number(failureRatePercent.toFixed(3)),
    p95_latency_ms: Number(p95LatencyMs.toFixed(1)),
    availability_target_percent: availabilityTargetPercent,
    error_budget_burn_percent: Number(errorBudgetBurnPercent.toFixed(2)),
    max_failure_rate_percent: maxFailureRatePercent,
    max_p95_latency_ms: maxP95LatencyMs,
    max_error_budget_burn_percent: maxErrorBudgetBurnPercent,
    probe_summaries: probeSummaries,
    max_consecutive_failed_probes: maxConsecutiveFailedProbes,
    failed_checks_detail: checkResults.filter((result) => !result.pass),
    slo_pass: thresholdFailures.length === 0,
    threshold_failures: thresholdFailures,
  };

  if (options.output) {
    const outputPath = path.resolve(String(options.output));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await runSyntheticChecks(args);

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.slo_pass) {
    process.exit(1);
  }
}

module.exports = {
  runSyntheticChecks,
  percentile,
  calcErrorBudgetBurnPercent,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
