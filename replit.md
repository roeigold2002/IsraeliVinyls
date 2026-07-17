# Vinyl Store (Project V)

A vinyl record search and discovery platform for the Israeli market. Aggregates inventory from 19+ Israeli vinyl stores with 97,000+ records.

## Tech Stack

- **Frontend**: React 19 + TypeScript, React Router 7, Tailwind CSS 4, Vite 8
- **API**: Local Express-style HTTP server (`server/api.cjs`) wrapping the Netlify function handler
- **Data**: JSON snapshots in `netlify/data/` (production), SQLite `music_stores.db` (local/dev)
- **Scraping**: Python 3 + BeautifulSoup4 (scripts/ directory)
- **Package Manager**: npm

## Project Structure

```
netlify/
  data/         # JSON snapshots (records, stores, genres) - production data source
  functions/    # Node.js serverless API (api.cjs) for Netlify
scripts/
  ingest/       # Python scrapers for each store
  ingest_all_stores.py
  export_snapshot.py  # Converts SQLite → JSON snapshots
server/
  api.cjs       # Local dev API server (wraps netlify function, port 3001)
src/
  components/   # RecordCard, RecordGrid, SearchBar, Layout, Pagination
  lib/          # API clients, types, cover hydration, wishlist
  pages/        # SearchPage (homepage + search), RecordPage, StoresPage, WishlistPage
  index.css     # Tailwind + custom theme (dark vinyl aesthetic)
  App.tsx
index.html
vite.config.ts  # Dev server on port 5000, proxies /api/* to localhost:3001
```

## Development

- `npm run dev` — Starts API server (port 3001) + Vite dev server (port 5000) via `scripts/dev.cjs` (cross-platform)
- `npm run ingest:all` — Run all store scrapers (requires Python)
- `npm run export:snapshot` — Export SQLite data to JSON snapshots + rebuild search bundle
- `npm run bundle:search` — Rebuild `netlify/data/search_bundle.json` only
- `npm run index:manual-html` — Build `netlify/data/manual_enrichment_index.json` from archived HTML pages
- `npm run verify:manual-index` — Validate generated manual enrichment index coverage
- `npm run manual-index:refresh` — Build + verify manual enrichment index in one command
- `npm run trueup:run` — Run one incremental background true-up cycle (queue-based)
- `npm run trueup:loop` — Run continuous true-up cycles in daemon mode
- `npm run trueup:rebuild-queue` — Rebuild true-up queue from current records
- `npm run build` — Export snapshots + TypeScript compile + Vite build
- `npm run preflight:netlify` — Production deployment pre-flight checks
- `npm run deploy:netlify:preview` — Netlify preview deploy (CLI)
- `npm run deploy:netlify:prod` — Netlify production deploy (CLI)
- `npm run synthetic:check -- --base-url <URL>` — Run synthetic API checks and evaluate SLO/failure budget thresholds
- `npm run rollout:staged -- --base-url <URL>` — Execute staged rollout + burn-in hardening cycles using `rollout/rollout-policy.json`

## Netlify Production

- Site name: israeli-vinyls-projectv
- Production URL: https://israeli-vinyls-projectv.netlify.app
- Config source: netlify.toml

Required Netlify settings are already captured in `.env.example` and netlify.toml defaults:

- `VITE_API_BASE_URL=https://israeli-vinyls-projectv.netlify.app`
- `CORS_ALLOWED_ORIGINS=https://israeli-vinyls-projectv.netlify.app`
- `PRODUCTION_SITE_URL=https://israeli-vinyls-projectv.netlify.app`
- `NODE_VERSION=20`

Routing behavior:

- `/api/*` rewrites to `/.netlify/functions/api/:splat`
- `/*` rewrites to `/index.html` with `200` for SPA client-side routes

Release checklist:

1. Run `npm run preflight:netlify` locally or in CI.
2. Push to the connected Git branch (Netlify auto-build) OR run `npm run deploy:netlify:prod`.
3. Verify `/api/health`, `/api/snapshot-meta`, and a deep link route (e.g. `/record/<id>`).

## Rollout and Burn-In (Phase 6)

- Policy: `rollout/rollout-policy.json`
  - Defines staged probes (`canary`, `ramp-25`, `burn-in`)
  - Defines SLO targets and failure budget burn thresholds
  - Defines rollback criteria and hardening cycle requirements
- Synthetic checks script: `scripts/synthetic_checks.cjs`
  - Health/search/metadata/link-guard API probes
  - Computes availability, failure rate, p95 latency, and error budget burn
- Staged orchestrator: `scripts/staged_rollout.cjs`
  - Runs `qa:gate` per cycle (unless `--skip-qa`)
  - Executes each stage's synthetic checks
  - Triggers rollback command when rollback criteria are breached
  - Requires consecutive green cycles before promotion-ready state

Example:

```bash
npm run rollout:staged -- --base-url https://candidate.example.com --max-cycles 3 --required-greens 2
```

## Key Features

- **Homepage**: Hero section + featured records + cheapest records sections
- **Search**: Full-text search with filters (store, genre, format, price range, year, in-stock)
- **Record Detail**: Cover art, price, store info, price comparison across stores, similar records
- **Stores Page**: All 19 stores with stats, sorting by record count / price
- **Wishlist**: Save and manage favorite records with total value tracking
- **Cover Hydration**: Smart async cover image fetching from product pages
- **Shimmer Loading**: Skeleton loading states for all content

## Architecture Notes

- The Vite dev server proxies `/api/*` to the local API server (port 3001)
- The local API server (`server/api.cjs`) reuses the Netlify function handler
- **Search architecture: see `docs/SEARCH_ARCHITECTURE.md`** (rebuilt 2026-07)
  - `scripts/build_search_bundle.cjs` precomputes `netlify/data/search_bundle.json`
    at build time: normalization, manual-index hydration, quarantine filtering,
    dedupe, and the inverted index
  - `netlify/functions/api.cjs` is a thin router; engine code lives in
    `netlify/functions/lib/` (text, search, snapshot, enrich, covers, urls,
    manual_index)
  - `/api/search` and `/api/suggest` are pure in-memory (no network I/O, no
    snapshot mutation); queries default to relevance ranking
  - Live enrichment (scraping/iTunes) happens only on `/api/record`
  - The detail catalog (`records.json`) loads lazily — never on the search path
- Search UI supports configurable page size (24/50/100) and robust page navigation controls
- Search result cards render straight from the search response; the only
  client-side fallback is a cached iTunes cover lookup for records without covers
- Background true-up is queue-driven (`scripts/trueup_worker.cjs`) with retries, proxy fallback, and optional headless fallback
- Genres in `genres.json` may be empty — computed from records at build time

## Manual HTML Archive Index

- Source archive root defaults to `E:\Code\DB\IsraeliVinyls-main`
- Override archive location with `MANUAL_HTML_ROOT=<path>` when needed
- Output files:
  - `netlify/data/manual_enrichment_index.json`
  - `netlify/data/manual_enrichment_report.json`
- API fallback behavior:
  - Applies manual index lookup first for cover/price/in-stock metadata on snapshot records
  - Uses live fetch only when manual data is missing/incomplete
  - `GET /api/record?id=<id>&refresh=1` forces a live refresh for that record when needed

## Background Data True-Up

- Worker script: `scripts/trueup_worker.cjs`
- Queue state: `netlify/data/trueup_queue.json`
- Latest report: `netlify/data/trueup_report.json`

The worker:

- Incrementally processes a persisted queue of stale/suspect records
- Uses delayed exponential retries per record
- Tries direct fetch, then proxy templates, then optional Playwright headless fallback
- Applies conservative updates only when live data improves record quality
- Writes `price_source` / `cover_source` provenance for future targeting

Useful env vars:

- `TRUEUP_BATCH_SIZE`, `TRUEUP_CONCURRENCY`, `TRUEUP_TIMEOUT_MS`, `TRUEUP_RETRIES`
- `TRUEUP_MAX_ATTEMPTS`, `TRUEUP_RETRY_BASE_MS`
- `TRUEUP_PROXY_TEMPLATES` (supports `{url}` and `{url_raw}` placeholders)
- `TRUEUP_USE_HEADLESS`, `TRUEUP_MAX_HEADLESS`
- `TRUEUP_AUDIT_ALL_PRICES`, `TRUEUP_FORCE_PRICE_REFRESH`, `TRUEUP_REFRESH_SNAPSHOT`

Scheduler integration:

- `scheduler_service.py` exposes `incremental_data_trueup()`
- `app.py` schedules incremental true-up on a recurring interval (`TRUEUP_INTERVAL_MINUTES`, default 30)

## Deployment

Configured as a static site deployment:
- Build: `npm run build` (exports snapshot + TypeScript + Vite)
- Public dir: `dist`
- Manual staged rollout workflow: `.github/workflows/staged-rollout-burnin.yml`
  - Optional candidate deploy via Netlify (`deploy_candidate=true`)
  - Synthetic checks + rollback criteria enforcement
  - Burn-in hardening cycles with artifacted rollout reports
