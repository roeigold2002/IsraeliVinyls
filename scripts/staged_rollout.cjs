#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { runSyntheticChecks } = require("./synthetic_checks.cjs");

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    policy: path.join("rollout", "rollout-policy.json"),
    reportDir: path.join("rollout", "reports"),
    maxCycles: null,
    requiredGreens: null,
    skipQa: false,
    continueOnFailure: false,
    qaCommand: "",
    rollbackCommand: process.env.ROLLOUT_ROLLBACK_COMMAND || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    switch (token) {
      case "--base-url":
        args.baseUrl = String(next || "");
        i += 1;
        break;
      case "--policy":
        args.policy = String(next || args.policy);
        i += 1;
        break;
      case "--report-dir":
        args.reportDir = String(next || args.reportDir);
        i += 1;
        break;
      case "--max-cycles":
        args.maxCycles = Number.parseInt(String(next || "0"), 10);
        i += 1;
        break;
      case "--required-greens":
        args.requiredGreens = Number.parseInt(String(next || "0"), 10);
        i += 1;
        break;
      case "--qa-command":
        args.qaCommand = String(next || "");
        i += 1;
        break;
      case "--rollback-command":
        args.rollbackCommand = String(next || "");
        i += 1;
        break;
      case "--skip-qa":
        args.skipQa = true;
        break;
      case "--continue-on-failure":
        args.continueOnFailure = true;
        break;
      default:
        break;
    }
  }

  return args;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredString(value, flagName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Missing ${flagName}`);
  }
  return normalized.replace(/\/$/, "");
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readJson(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing policy file: ${absolute}`);
  }

  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function runCommand(command, label) {
  console.log(`\n[${label}] ${command}`);

  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  return {
    ok: result.status === 0,
    status: result.status,
  };
}

function runRollback(rollbackCommand, context) {
  if (!rollbackCommand) {
    console.warn("No rollback command configured; manual rollback required.");
    return {
      executed: false,
      ok: false,
      status: null,
    };
  }

  const cmd = rollbackCommand
    .replace(/\{\{stage\}\}/g, context.stage)
    .replace(/\{\{cycle\}\}/g, String(context.cycle));

  const result = runCommand(cmd, "rollback");
  return {
    executed: true,
    ok: result.ok,
    status: result.status,
  };
}

function evaluateRollback(summary, rollbackCriteria) {
  const reasons = [];

  const maxFailureRate = toNumber(rollbackCriteria.max_failure_rate_percent, Infinity);
  const maxP95 = toNumber(rollbackCriteria.max_p95_latency_ms, Infinity);
  const maxFailedProbes = toNumber(rollbackCriteria.max_consecutive_failed_probes, Infinity);

  if (summary.failure_rate_percent > maxFailureRate) {
    reasons.push(`failure_rate ${summary.failure_rate_percent}% > ${maxFailureRate}%`);
  }

  if (summary.p95_latency_ms > maxP95) {
    reasons.push(`p95_latency ${summary.p95_latency_ms}ms > ${maxP95}ms`);
  }

  if (summary.max_consecutive_failed_probes > maxFailedProbes) {
    reasons.push(
      `max_consecutive_failed_probes ${summary.max_consecutive_failed_probes} > ${maxFailedProbes}`,
    );
  }

  return {
    rollbackRequired: reasons.length > 0,
    reasons,
  };
}

async function runStage({
  baseUrl,
  stage,
  cycle,
  policy,
  cycleReportDir,
}) {
  const stageName = String(stage.name || `stage-${cycle}`);
  const stageOutput = path.join(cycleReportDir, `${stageName}.json`);

  const summary = await runSyntheticChecks({
    baseUrl,
    stageName,
    probes: Math.max(1, toNumber(stage.probes, 1)),
    intervalMs: Math.max(0, toNumber(stage.interval_ms, 0)),
    timeoutMs: Math.max(1000, toNumber(stage.request_timeout_ms, 5000)),
    availabilityTargetPercent: toNumber(policy.slo.availability_target_percent, 99.5),
    maxFailureRatePercent: toNumber(policy.slo.max_failure_rate_percent, 1),
    maxP95LatencyMs: toNumber(policy.slo.max_p95_latency_ms, 2500),
    maxErrorBudgetBurnPercent: toNumber(policy.slo.max_error_budget_burn_percent, 100),
    output: stageOutput,
  });

  const rollbackEval = evaluateRollback(summary, policy.rollback_criteria || {});

  return {
    stage: stageName,
    summary,
    output: stageOutput,
    pass: summary.slo_pass && !rollbackEval.rollbackRequired,
    rollback_required: rollbackEval.rollbackRequired,
    rollback_reasons: rollbackEval.reasons,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = requiredString(args.baseUrl, "--base-url");
  const policy = readJson(args.policy);

  const stages = Array.isArray(policy.stages) ? policy.stages : [];
  if (stages.length === 0) {
    throw new Error("Policy must define at least one rollout stage.");
  }

  const hardening = policy.hardening || {};
  const qaCommand = args.qaCommand || hardening.qa_command || "npm run qa:gate";
  const maxCycles = Math.max(1, args.maxCycles || toNumber(hardening.max_cycles, 1));
  const requiredGreens = Math.max(
    1,
    args.requiredGreens || toNumber(hardening.required_consecutive_green_cycles, 1),
  );
  const continueOnFailure = args.continueOnFailure || Boolean(hardening.continue_on_failure);

  const reportRoot = path.resolve(args.reportDir, nowStamp());
  fs.mkdirSync(reportRoot, { recursive: true });

  let consecutiveGreens = 0;
  let overallSuccess = false;
  const cycleReports = [];

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    console.log(`\n=== Burn-in Cycle ${cycle}/${maxCycles} ===`);
    const cycleReportDir = path.join(reportRoot, `cycle-${cycle}`);
    fs.mkdirSync(cycleReportDir, { recursive: true });

    const cycleReport = {
      cycle,
      started_at: new Date().toISOString(),
      qa_gate: {
        skipped: Boolean(args.skipQa),
        pass: true,
      },
      stage_results: [],
      pass: false,
      failure_reason: null,
      rollback: null,
    };

    if (!args.skipQa) {
      const qaResult = runCommand(qaCommand, `qa-gate cycle ${cycle}`);
      cycleReport.qa_gate = {
        skipped: false,
        command: qaCommand,
        pass: qaResult.ok,
        status: qaResult.status,
      };

      if (!qaResult.ok) {
        cycleReport.pass = false;
        cycleReport.failure_reason = "qa_gate_failed";
        cycleReport.finished_at = new Date().toISOString();
        cycleReports.push(cycleReport);

        if (!continueOnFailure) {
          break;
        }

        consecutiveGreens = 0;
        continue;
      }
    }

    let cyclePass = true;

    for (const stage of stages) {
      const stageResult = await runStage({
        baseUrl,
        stage,
        cycle,
        policy,
        cycleReportDir,
      });

      cycleReport.stage_results.push(stageResult);

      if (!stageResult.pass) {
        cyclePass = false;
        cycleReport.failure_reason = `stage_failed:${stageResult.stage}`;

        if (stageResult.rollback_required) {
          cycleReport.rollback = runRollback(args.rollbackCommand, {
            stage: stageResult.stage,
            cycle,
          });
        }

        break;
      }
    }

    cycleReport.pass = cyclePass;
    cycleReport.finished_at = new Date().toISOString();
    cycleReports.push(cycleReport);

    if (cyclePass) {
      consecutiveGreens += 1;
      console.log(
        `Cycle ${cycle} passed. Consecutive green cycles: ${consecutiveGreens}/${requiredGreens}`,
      );

      if (consecutiveGreens >= requiredGreens) {
        overallSuccess = true;
        break;
      }
    } else {
      consecutiveGreens = 0;
      if (!continueOnFailure) {
        break;
      }
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    target_base_url: baseUrl,
    policy_file: path.resolve(args.policy),
    report_root: reportRoot,
    max_cycles: maxCycles,
    required_consecutive_green_cycles: requiredGreens,
    achieved_consecutive_green_cycles: consecutiveGreens,
    overall_pass: overallSuccess,
    cycle_reports: cycleReports,
  };

  const summaryPath = path.join(reportRoot, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const latestDir = path.resolve(args.reportDir);
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(path.join(latestDir, "latest-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`\nStaged rollout summary written to: ${summaryPath}`);
  console.log(JSON.stringify({ overall_pass: overallSuccess, report: summaryPath }, null, 2));

  if (!overallSuccess) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
