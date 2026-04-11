# ⚡ Asset-Finder Quick Start (10 Minutes)

## TL;DR: Get it Running Fast

### 1. One-Time Setup

```bash
# Go to Asset-Finder
cd E:\Asset-Finder

# Install dependencies (one time only)
pnpm install
```

### 2. Configure Database

```bash
# Get PostgreSQL URL (or use SQLite fallback)
# Option A: Local PostgreSQL
set DATABASE_URL=postgresql://localhost/vinyl_records

# Option B: Docker PostgreSQL (if available)
docker run -d -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15
set DATABASE_URL=postgresql://postgres:password@localhost/vinyl_records
```

### 3. Start Both Servers

**Terminal 1 - API Server:**
```bash
cd E:\Asset-Finder\artifacts\api-server
pnpm dev
# Watches for changes, rebuilds automatically
# Running on port 3001
```

**Terminal 2 - Frontend Server:**
```bash
cd E:\Asset-Finder\artifacts\israeli-vinyl-search
pnpm dev
# Running on port 5173
# Opens in browser automatically
```

### 4. Use It

- Navigate to **http://localhost:5173**
- Search for any artist or album name
- Results from all 19 stores load in real-time
- Click "To Product" to visit store's actual product page

---

## ✨ Key Features (Instantly Available)

✅ **Real-time search** across 19 Israeli vinyl stores  
✅ **Discogs enrichment** - Cover art, year, metadata  
✅ **Smart sorting** - Price (low/high), store, relevance  
✅ **Filter by store** - Search single store or all  
✅ **Stock filter** - "In stock only" toggle  
✅ **Shipping detection** - Background cost calculation  
✅ **Hebrew RTL UI** - Full Hebrew language support  
✅ **Responsive design** - Works on mobile/tablet/desktop  

---

## 🎯 Common Tasks

### Search for a specific artist:
```
Type: "Beatles" → Press Enter or click Search
```

### Filter by single store:
```
Select store dropdown → Choose "Beatnik" or any store
```

### Sort by price:
```
Select "Sort" dropdown → Choose "Low to High" or any option
```

### Create custom query:
```
/api/vinyl/search?q=Pink+Floyd&store=shablool&sort=price_asc
```

### List all stores:
```
GET http://localhost:3001/api/stores
```

---

## 🔧 Minimal Config

Store all configuration in one `.env` file in `E:\Asset-Finder`:

```env
# PostgreSQL database
DATABASE_URL=postgresql://localhost/vinyl_records

# Optional: Discogs API token (for rate limit increase)
DISCOGS_USER_TOKEN=

# Optional: Override specific stores
VINYL_STORE_CONFIG=
```

That's it! Everything else works out-of-the-box.

---

## 🚀 Production Deployment

### One-liner for deployment:

```bash
# Build for production
cd E:\Asset-Finder
pnpm run build

# Export DATABASE_URL and start
set NODE_ENV=production
cd artifacts/api-server && pnpm start
```

Frontend dist files are in:
```
E:\Asset-Finder\artifacts\israeli-vinyl-search\dist\
```

Serve with any web server (nginx, Apache, vercel, netlify, etc.)

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3001 already in use | `netstat -ano \| findstr :3001` then kill process |
| Port 5173 already in use | Kill process or use `pnpm dev --port 5174` |
| Database connection error | Check `DATABASE_URL` is valid PostgreSQL string |
| No results from stores | Check internet connection; stores may be down |
| Slow searches | Some stores respond slowly; normal behavior |
| Discogs not showing | API rate limit hit; try again in 1 minute |

---

## 📱 Access from phone:

```bash
# Get your computer's IP
ipconfig | findstr IPv4

# On phone, navigate to:
# http://<YOUR_IP>:5173
```

---

## ✅ That's It!

You're now running a **real-time Israeli vinyl record search engine** with:
- 19 live stores
- Discogs enrichment
- Modern React UI
- Production-ready backend

**Enjoy! 🎵**

---

Next: Read `ASSET_FINDER_INTEGRATION.md` for advanced configuration.
