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

- `npm run dev` — Starts API server (port 3001) + Vite dev server (port 5000)
- `npm run ingest:all` — Run all store scrapers (requires Python)
- `npm run export:snapshot` — Export SQLite data to JSON snapshots
- `npm run build` — Export snapshots + TypeScript compile + Vite build
- `npm run synthetic:check -- --base-url <URL>` — Run synthetic API checks and evaluate SLO/failure budget thresholds
- `npm run rollout:staged -- --base-url <URL>` — Execute staged rollout + burn-in hardening cycles using `rollout/rollout-policy.json`

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
- Records are stored as JSON snapshots, loaded into memory on startup (~97K records)
- Genres in `genres.json` may be empty — computed from records at search time

## Deployment

Configured as a static site deployment:
- Build: `npm run build` (exports snapshot + TypeScript + Vite)
- Public dir: `dist`
- Manual staged rollout workflow: `.github/workflows/staged-rollout-burnin.yml`
  - Optional candidate deploy via Netlify (`deploy_candidate=true`)
  - Synthetic checks + rollback criteria enforcement
  - Burn-in hardening cycles with artifacted rollout reports
