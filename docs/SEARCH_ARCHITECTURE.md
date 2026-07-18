# Search System Architecture

Rebuilt 2026-07. This document explains why the search system was redesigned,
what the current architecture is, and the invariants future changes must keep.

## Why the old system was rebuilt

The previous implementation (a single 3,061-line `netlify/functions/api.cjs`)
had five compounding failures:

1. **Correctness — multi-term queries returned zero results.** After the
   token index selected candidates, a post-filter required the *entire query
   string* to be a substring of a single field
   (`artist.includes(q) || album.includes(q)`). A query like
   `pink floyd animals` (artist + album) matched nothing. Short tokens
   (`AC DC`, two-letter Hebrew words) were dropped from the index entirely
   (`token.length > 2`).

2. **Latency — expensive work on every request and every cold start.** Each
   cold start parsed 48MB + 21MB + 12MB of JSON, ran a heavy regex
   normalization gauntlet over ~168K records, and rebuilt the index. Every
   search request re-deduped the full filtered result set (up to 50K records
   through multiple regex-based normalizers). Browse requests (no query)
   triggered *live store scraping* (up to 12 pages fetched with 3s timeouts,
   plus a jina.ai proxy fallback) inside the request path.

3. **Freshness — the update pipeline was a silent no-op.** The nightly
   refresh only fetched a record if `price <= 0 || !artist`. Since a previous
   run had imputed a fake store-median price into every record
   (`price_source: "imputed"`, then reported as "100% pricing coverage"),
   nothing was ever re-fetched, `checked_at` was never stamped, and the
   deploy step failed nightly on a missing `NETLIFY_AUTH_TOKEN` anyway.
   Production served a 41-day-old snapshot.

4. **Ranking — default order was ingestion order.** Relevance scoring only
   ran when `sort=relevance` was explicitly requested; the UI default was
   `newest`, i.e. scrape order.

5. **Client — a self-DDoS per results page.** Each visible card issued its
   own `/api/record` call (which triggered server-side scraping), a batch
   price fetch, and an iTunes lookup — dozens of function invocations per
   page render, for data the search response should have contained.

## Current architecture

**Principle: do each piece of work once, at the layer where it is cheap.**

```
        BUILD TIME                      COLD START              REQUEST TIME
┌──────────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐
│ scripts/                 │    │ lib/snapshot.cjs    │    │ lib/search.cjs  │
│ build_search_bundle.cjs  │    │                     │    │                 │
│  - overlay fresh values  │    │  JSON.parse bundle  │    │  index lookup   │
│  - normalize text        │───▶│  wrap index in Maps │───▶│  term-wise AND  │
│  - hydrate manual index  │    │  precompute search  │    │  filter + rank  │
│  - drop quarantined      │    │  meta (lowercase,   │    │  LRU page cache │
│  - dedupe listings       │    │  folded fields)     │    │                 │
│  - build inverted index  │    │                     │    │  0 network I/O  │
│  → search_bundle.json    │    │  records.json is    │    │  0 mutation     │
└──────────────────────────┘    │  lazy (detail only) │    └─────────────────┘
                                └─────────────────────┘
```

### Modules (`netlify/functions/`)

| Module | Responsibility |
|---|---|
| `api.cjs` | Routing, CORS, params, response shaping. Nothing else. |
| `lib/text.cjs` | Normalization + tokenization, shared verbatim between build and query time (Hebrew final-letter folding, apostrophe joining, noise stripping). |
| `lib/search.cjs` | Inverted index, candidate retrieval, term-wise verification, filters, relevance scoring, sorting, dedupe, suggestions, LRU cache. |
| `lib/snapshot.cjs` | Bundle loading (fast path), legacy in-memory rebuild (dev fallback), lazy detail catalog. |
| `lib/enrich.cjs` | Live scraping/iTunes/oEmbed for a SINGLE record. Only `/api/record` and `/api/link-health` may import behavior from here. |
| `lib/manual_index.cjs` | Archived-crawl metadata lookup keyed by canonical product URL. |
| `lib/covers.cjs`, `lib/urls.cjs` | Cover-URL validation/scoring; URL canonicalization + outbound-fetch safety. |

### Query semantics

- Tokenizer: lowercase → strip apostrophes/geresh (so `ג'אז` ⇄ `גאז`,
  `don't` ⇄ `dont`) → fold Hebrew finals (`ם→מ` …) → split on
  non-alphanumerics → keep tokens of length ≥ 2.
- Retrieval: exact posting list per term; bounded prefix expansion when a
  term has no exact posting (supports typeahead).
- Verification: **every term must appear in the combined artist+album
  text** — terms may span fields.
- Ranking: when a query is present and no explicit sort is requested, results
  are relevance-ranked (exact/prefix matches on album and artist dominate,
  full-term coverage next, cover/price/stock as small tiebreakers). Explicit
  sorts always win.
- Repeat queries and page navigation hit an LRU cache of the full sorted
  result list (~200 entries), so pagination costs one array slice.

### Data freshness

- `scripts/remediate_prices.cjs` (nightly, GitHub Actions + optional local
  Task Scheduler) re-fetches a record when it is **missing data OR stale**
  (`checked_at` older than `--refresh-days`, failures retried on a shorter
  3-day backoff via `fetch_ok=false`), and always stamps `checked_at`.
- Price imputation is **opt-in** (`--impute`) and always marked
  `price_source="imputed"`; imputed prices are re-verified on every run.
- `scripts/build_search_bundle.cjs` overlays the freshest per-record values
  from `records.json` onto the search subset before indexing, so search
  results always reflect the latest verified data even when the SQLite
  export doesn't run (CI has no DB).
- The bundle records provenance (`price_provenance`: live / manual / imputed
  / unknown) and exposes it via `/api/snapshot-meta` → `search_bundle`.
- Live refresh at request time exists ONLY on `/api/record` (single record,
  the page where a user is about to click "buy").

### Real-time layer (metasearch tiers)

Search is a hybrid: the cached index is the instant floor, live data layers
on top progressively (the Kayak/Skyscanner pattern). Per-query synchronous
scraping of 20 stores would blow both the sub-second latency budget and the
stores' goodwill — so freshness is delivered in three tiers:

| Tier | What | Where | Latency |
|---|---|---|---|
| 1. Instant | bundle-indexed cached results | `/api/search` | <1ms warm |
| 2. Revalidation | live price/stock re-fetch for the visible page (≤12 records, concurrency 6) | `/api/live-refresh?ids=…` | ~2-4s, patched in place |
| 3. Federation | the query fanned out to every store's own search endpoint; fresh finds the catalog lacks stream in below results | `/api/live-search?q=…` (also `source=live`) | ~5-7s budgeted, 10-min TTL cache |

Key modules:
- `lib/live_stores.cjs` — adapter registry. **Adding a store to live search
  = one entry** (base URL + search paths + adapter type). `adapter: "none"`
  stores (SPAs/custom platforms) still get tier-2 revalidation via their
  product pages.
- `lib/live_search.cjs` — generic WooCommerce card parser (entity-decoded
  price extraction, `<ins>` sale-price priority, container-class stock),
  federation runner with a hard time budget (Netlify sync functions cap at
  ~10s), per-store status reporting (`ok/blocked/no_results/skipped_budget`),
  and bounded TTL caches (10 min) so repeat queries never re-hit stores.
- Client: `src/lib/liveSearch.ts` + SearchPage — fire-after-render; cached
  results are never blocked on live data; live federation records get
  `live-*` ids and open the store page directly.

Politeness: fetches honor per-store timeouts, results are TTL-cached, the
Cloudflare-challenge detector backs off (`blocked` status), and stores whose
robots/platform don't support it are `adapter: "none"`.

### Invariants (do not break these)

1. `/api/search` and `/api/suggest` perform no network I/O and mutate no
   shared state.
2. Index tokens and query tokens must come from the same functions in
   `lib/text.cjs`.
3. All record normalization happens at build time (bundle) or once at load
   time (legacy fallback) — never per request.
4. `search_bundle.json` is a derived artifact: regenerate it with
   `npm run bundle:search` after any change to `records.json`,
   `search_records.json`, the manual index, or `lib/text.cjs` heuristics.
   (`npm run export:snapshot` and the nightly workflow do this
   automatically.)

## Operational notes

- **Netlify deploy secrets**: the nightly workflow requires
  `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` repo secrets. If they are
  missing the data still refreshes and commits, but the run is marked failed
  with an explicit error so the gap is visible.
- Cold start: ~0.4s (bundle parse). Warm search: <1ms server-side.
- The detail catalog (`records.json`) parses lazily on the first
  detail/batch request (~0.4s), never on the search path.
