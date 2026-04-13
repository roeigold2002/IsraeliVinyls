# Phase 6: Staged Rollout and Burn-In Hardening Loop

This phase adds deployment-time safety checks and sustained burn-in validation on top of `qa:gate`.

## What is included

- **Synthetic checks with SLO/failure-budget evaluation**
  - Script: `scripts/synthetic_checks.cjs`
  - Command: `npm run synthetic:check -- --base-url <URL>`
- **Staged rollout orchestration + rollback criteria**
  - Script: `scripts/staged_rollout.cjs`
  - Policy: `rollout/rollout-policy.json`
  - Command: `npm run rollout:staged -- --base-url <URL>`
- **Manual CI workflow for release burn-in**
  - Workflow: `.github/workflows/staged-rollout-burnin.yml`

## Rollout policy

`rollout/rollout-policy.json` defines:

- SLO targets
  - availability target
  - max p95 latency
  - max failure rate
  - max error-budget burn percent
- rollback criteria
  - max failure rate
  - max p95 latency
  - max consecutive failed probes
- stages
  - `canary`
  - `ramp-25`
  - `burn-in`
- hardening loop controls
  - qa command per cycle
  - max cycles
  - required consecutive green cycles

## Synthetic checks coverage

Each probe validates:

- `GET /api/health`
- `GET /api/search?q=rock&per_page=5`
- `GET /api/snapshot-meta`
- `GET /api/link-health?url=http://localhost/internal` (guard behavior)

Metrics emitted:

- availability percent
- failure rate percent
- p95 latency ms
- error budget burn percent
- max consecutive failed probes

## Burn-in hardening loop behavior

For each cycle:

1. Run release gate (`qa:gate`) unless `--skip-qa` is set.
2. Run synthetic checks for each rollout stage.
3. Evaluate rollback criteria.
4. Require consecutive green cycles before pass.

By default, failures stop the loop immediately (`continue_on_failure=false` in policy).

## Local validation examples

Run synthetic checks against local API:

```bash
npm run synthetic:check -- --base-url http://127.0.0.1:3001 --probes 2 --interval-ms 250
```

Run a short staged local validation:

```bash
npm run rollout:staged -- --base-url http://127.0.0.1:3001 --skip-qa --max-cycles 1 --required-greens 1
```

## CI usage

Trigger `.github/workflows/staged-rollout-burnin.yml` with one of:

- `deploy_candidate=true` (build/deploy candidate via Netlify)
- `deploy_candidate=false` and provide `candidate_url`

Optional inputs:

- `rollback_command`
- `max_cycles`
- `required_greens`
- `continue_on_failure`

Rollout reports are uploaded as workflow artifacts and written under `rollout/reports/`.
