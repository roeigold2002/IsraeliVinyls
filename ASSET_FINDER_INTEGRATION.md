# 🎵 Asset-Finder Integration Guide

## Overview

**Asset-Finder** is a modern, real-time Israeli vinyl record search engine built with React + Node.js/Express. It replaces Project V's Flask-based approach with a **production-ready web application** that searches 19 Israeli vinyl stores live and enriches results with Discogs metadata.

### Key Advantages Over Project V

| Feature | Project V | Asset-Finder | Winner |
|---------|-----------|--------------|--------|
| **Architecture** | Flask + Electron + SQLite | React + Express + PostgreSQL | ⭐ Asset-Finder (modern) |
| **Search** | Cached offline database | Real-time live scraping | ⭐ Asset-Finder (live) |
| **Frontend** | Vanilla JS | React + TypeScript | ⭐ Asset-Finder (maintainable) |
| **API** | JSON endpoints | OpenAPI 3.1 + Zod | ⭐ Asset-Finder (documented) |
| **Stores Covered** | 12 stores | 19 stores | ⭐ Asset-Finder (more venues) |
| **Discogs Support** | ✅ Yes | ✅ Yes (enhanced) | ✅ Both equal |
| **Shipping Detection** | Manual | Background queue | ⭐ Asset-Finder (automated) |
| **Deployment** | Desktop (.exe) | Web (Node.js) | 🤝 Different use cases |
| **Offline Mode** | ✅ Yes | ❌ No | ✅ Project V (if needed) |

---

## 📦 What You Get

### Unified Store Registry: 19 Israeli Vinyl Stores

**All stores are real-time searchable across these venues:**

1. **ביטניק** (Beatnik) - Tel Aviv
2. **שבלול תקליטים** (Shablool Records) - Tel Aviv  
3. **בית התקליט** (Taklit House) - Jerusalem
4. **האוזן השלישית** (Third Ear) - Tel Aviv
5. **דיסק סנטר** (Disc Center) - Ramat Gan
6. **תו שמיני** (TAV8) - Netanya
7. **גיורא תקליטים** (Giora Records) - Holon
8. **הסיבוב** (HaSivoov) - Ramat Hasharon
9. **דה ויניל רום** (The Vinyl Room) - Petah Tikva
10. **התקליטים שלי** (My Records) - Haifa
11. **וינילסטוק** (Vinyl Stock) - Ashdod
12. **רולינג דייס** (Rolling Dise) - Tel Aviv
13. **Rock Store 1970** - Nationwide
14. **הוד המחט** (Hod Hamahat) - Multiple locations
15. **Holit Records** - Multiple locations
16. **B-Side Haifa** - Haifa
17. **Vinylia Records** - Tel Aviv
18. **Transistore** - Tel Aviv
19. **H2Shop תקליטים** - Nationwide

---

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Required:
- Node.js 22+ & pnpm
- PostgreSQL 15+ (local or remote)
- Discogs API token (optional, for higher rate limits)
```

### 2. Clone/Copy Asset-Finder

```bash
# Option A: Copy from existing location
cp -r E:\Asset-Finder C:\your-deployment-path\

# Option B: Use as-is from E:\Asset-Finder
cd E:\Asset-Finder
```

### 3. Install Dependencies

```bash
# Use pnpm (required, not npm/yarn)
pnpm install
```

### 4. Configure Environment

```bash
# Create .env file in project root
cat > .env << 'EOF'
# PostgreSQL Database
DATABASE_URL="postgresql://user:password@localhost:5432/vinyl_records"

# Optional: Discogs API token for higher rate limits
DISCOGS_USER_TOKEN="your_discogs_token_here"

# API Server
API_PORT=3001
API_HOST="0.0.0.0"

# Frontend
VITE_API_URL="http://localhost:3001"
EOF
```

### 5. Set Up Database

```bash
# Create PostgreSQL database
psql -c "CREATE DATABASE vinyl_records OWNER your_user;"

# Run migrations (if applicable)
pnpm run db:migrate  # Check if this script exists
```

### 6. Start Development Servers

```bash
# Terminal 1: Start API server
cd E:\Asset-Finder\artifacts\api-server
pnpm run dev

# Terminal 2: Start React frontend
cd E:\Asset-Finder\artifacts\israeli-vinyl-search
pnpm run dev
```

Access the app at: **http://localhost:5173** (or port shown by Vite)

---

## 🔧 Configuration

### Store Configuration

All 19 stores are configured in:
```
E:\Asset-Finder\artifacts\api-server\src\services\vinyl\storeConfig.ts
```

To **enable/disable specific stores** or **override store URLs**, set environment variable:

```bash
VINYL_STORE_CONFIG='[
  {"id": "beatnik", "enabled": true, "website": "https://custom-url.com/"},
  {"id": "shablool", "enabled": false}
]'
```

### Discogs Integration

Asset-Finder automatically searches Discogs for metadata enrichment. To enable higher rate limits:

```bash
# Sign up at https://www.discogs.com/ and create a personal access token
DISCOGS_USER_TOKEN="your_token_here"
```

### Search Parameters

The API supports these query parameters:

```
GET /api/vinyl/search
  ?q=<query>                    # Search term (required, min 2 chars)
  &store=<store_id>             # Filter by store (e.g., "beatnik")
  &inStockOnly=<boolean>        # Only in-stock items (default: false)
  &knownShippingOnly=<boolean>  # Only known shipping (default: false)
  &sort=<option>                # Sort: price_asc, price_desc, store, relevance
  &page=<number>                # Pagination offset
  &perPage=<number>             # Results per page (max 100)
```

Example:
```
GET http://localhost:3001/api/vinyl/search?q=Beatles&store=beatnik&inStockOnly=true&sort=price_asc
```

---

## 📊 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/healthz` | GET | Server health check |
| `/api/stores` | GET | List all 19 configured stores |
| `/api/vinyl/search` | GET | Live search across stores (45-sec cache) |
| `/api/shipping/jobs/{jobId}` | GET | Get shipping estimation status |

### Example: List All Stores

```bash
curl http://localhost:3001/api/stores
```

Response:
```json
{
  "stores": [
    {
      "id": "beatnik",
      "name": "ביטניק",
      "website": "https://www.beatnik.co.il/",
      "shipsWithinIsrael": true,
      "enabled": true
    },
    ...
  ]
}
```

---

## 🎨 Customization

### Frontend (React)

All React components in:
```
E:\Asset-Finder\artifacts\israeli-vinyl-search\src\
```

Key files:
- `pages/home.tsx` - Main search interface
- `components/ui/` - Radix UI components
- `vite.config.ts` - Build configuration
- `tailwind.config.ts` - Styling

### Backend (Express)

All server logic in:
```
E:\Asset-Finder\artifacts\api-server\src\
```

Key files:
- `services/vinyl/searchService.ts` - Search orchestration
- `services/vinyl/genericHtmlAdapter.ts` - HTML scraper
- `services/vinyl/discogs.ts` - Discogs enrichment
- `services/vinyl/storeConfig.ts` - Store registry

---

## 🚢 Deployment

### Option 1: Self-Hosted (VPS/dedicated server)

```bash
# Build for production
pnpm run build

# Start API server
cd artifacts/api-server && pnpm start

# Serve frontend (with reverse proxy like Nginx)
cd artifacts/israeli-vinyl-search
pnpm run build
# Copy dist/ to web server
```

### Option 2: Docker (Recommended)

Create `Dockerfile` in project root:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
EXPOSE 3001 5173
CMD ["pnpm", "start"]
```

Run:
```bash
docker build -t vinyl-search .
docker run -p 3001:3001 -p 5173:5173 \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV=production \
  vinyl-search
```

### Option 3: Vercel/Netlify (Frontend only)

Frontend can be deployed to Vercel/Netlify. API requires Node.js hosting (Heroku, Render, Railway, etc.).

---

## 🔍 How It Works

### Search Flow

1. **User Enters Query** (min 2 characters)
   ↓
2. **Discogs Search** (first, for metadata enrichment)
   ↓
3. **Parallel Store Search** (all 19 stores simultaneously)
   - Uses `genericHtmlAdapter.ts` for live scraping
   - Tries Shopify API first, falls back to HTML parsing
   - Isolated errors (one store failure doesn't block others)
   ↓
4. **Result Merging** (deduplicate, rank by relevance)
   ↓
5. **Shipping Estimation** (background job queue)
   - Asynchronous extraction of shipping costs
   - Polled by frontend until complete
   ↓
6. **Display Results** (45-second cache for same query)
   - Discogs metadata carousel
   - Live store results grid
   - Source verification section

### Caching Strategy

- **Search Results**: 45 seconds (prevents API spam)
- **Shipping Jobs**: In-memory tracking + background extraction
- **Store Configs**: Runtime (reloadable via env var)

---

## 📈 Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **Search Response Time** | 8-15 seconds | Depends on store response times |
| **Concurrent Requests** | 19 (parallel) | One per store |
| **Request Timeout** | 10 seconds per store | Prevents hanging |
| **Cache TTL** | 45 seconds | Per unique query |
| **Max Results** | 100 per page | Pagination supported |
| **Shipping Extraction** | Background | Non-blocking |

---

## 🐛 Troubleshooting

### "No results found" for all stores

**Cause**: Stores are blocking automated requests or have changed HTML structure

**Solution**:
1. Check store website manually (is it accessible?)
2. Review browser console for JavaScript errors
3. Check API logs: `tail -f logs/api.log`
4. Verify store URLs in `storeConfig.ts` are current

### High latency / slow searches

**Cause**: Some stores respond slowly; search waits for all to complete

**Solution**:
1. Reduce `timeout` in `genericHtmlAdapter.ts` (currently 10s)
2. Disable slow stores temporarily in `storeConfig.ts`
3. Increase server resources (CPU/RAM)

### Shipping costs not calculating

**Cause**: Background job queue stuck or store shipping detection failed

**Solution**:
1. Check API logs for shipping job errors
2. Restart API server
3. Some stores may not expose shipping info

### "Database connection failed"

**Cause**: PostgreSQL not running or connection string wrong

**Solution**:
```bash
# Test connection
psql "$DATABASE_URL"

# Verify env var is set
echo $DATABASE_URL

# Check PostgreSQL is running
ps aux | grep postgres
```

---

## 📚 Additional Resources

- **Asset-Finder GitHub**: E:\Asset-Finder (or clone from remote)
- **API Documentation**: OpenAPI spec at `/api/docs` (if enabled)
- **Discogs API**: https://www.discogs.com/developers
- **Store Scraping**: TypeScript at `artifacts/api-server/src/services/vinyl/`

---

## 🤝 Migration from Project V

### Why Switch?

✅ **Real-Time**: Live store data vs cached database  
✅ **Modern Stack**: React/TypeScript vs Vanilla JS  
✅ **More Stores**: 19 vs 12 Israeli retailers  
✅ **Better UX**: Professional component library (Radix UI)  
✅ **Maintainable**: Clean TypeScript architecture  
✅ **APIsFirst**: Documented REST/OpenAPI endpoints  

### What You Lose

❌ **Offline Mode**: Asset-Finder requires internet  
❌ **Desktop App**: Web-only (can wrap in Electron if needed)  
❌ **Pre-loaded Data**: No SQLite fallback  

### Both Work Together

Project V's Flask app can **coexist** with Asset-Finder:
- Keep Project V for offline/cached database queries
- Use Asset-Finder for real-time live searches
- Could even federate searches across both

---

## ✅ Verification Checklist

- [ ] Node.js 22+ installed (`node --version`)
- [ ] pnpm installed (`pnpm --version`)
- [ ] PostgreSQL running and accessible
- [ ] `.env` file created with `DATABASE_URL`
- [ ] All dependencies installed (`pnpm install`)
- [ ] API server starts without errors (`cd artifacts/api-server && pnpm dev`)
- [ ] Frontend loads at http://localhost:5173
- [ ] Search returns results from at least 5 stores
- [ ] Discogs enrichment appears (cover art, year, etc.)
- [ ] Pagination works (results per page selector)

---

## 📞 Support

For issues:
1. Check API logs: `artifacts/api-server/logs/`
2. Check browser console: F12 → Console tab
3. Review this guide's troubleshooting section
4. Check storeConfig.ts for store-specific issues

---

**Last Updated**: April 2026  
**Asset-Finder Version**: Latest  
**Status**: Production-Ready ✅
