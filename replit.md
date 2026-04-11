# Vinyl Store (Project V)

A vinyl record search and discovery platform for the Israeli market. Aggregates inventory from 19+ Israeli vinyl stores.

## Tech Stack

- **Frontend**: React 19 + TypeScript, React Router 7, Tailwind CSS 4, Vite 8
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
src/
  components/   # Reusable UI components
  lib/          # API clients, types
  pages/        # Page components (Home, Stats, etc.)
  App.tsx
app.py          # Flask backend (alternative/desktop use)
```

## Development

- `npm run dev` — Start Vite dev server on port 5000
- `npm run ingest:all` — Run all store scrapers (requires Python)
- `npm run export:snapshot` — Export SQLite data to JSON snapshots
- `npm run build` — Export snapshots + TypeScript compile + Vite build

## Deployment

Configured as a static site deployment:
- Build: `npm run build`
- Public dir: `dist`

Note: The build script runs `export_snapshot.py` first. For Replit deployment, the JSON data in `netlify/data/` is used directly (pre-built snapshots).
