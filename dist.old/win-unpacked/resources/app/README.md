# Israeli Vinyl Records Aggregator

## Project Status: ✅ PHASE 1 COMPLETE (Discogs Edition)

A standalone Windows desktop application for searching vinyl records. The application comes pre-loaded with **977 vinyl records** from the **Discogs API** (professional global database).

### Quick Facts
- ✅ **Total Records**: 977 professionally-curated vinyl records
- ✅ **Source**: Discogs API (reliable, high-quality)
- ✅ **Format**: Single standalone .exe file OR Python Flask server
- ✅ **Size**: 15.41 MB .exe (includes Python runtime)
- ✅ **Database**: Local SQLite (offline capability)
- ✅ **Features**: Search, filter by genre, sort by price, direct Discogs links

### Future Phase (v2.0)
Israeli retail store integration planned. Current release focuses on reliability with premium Discogs dataset.

---

## 🚀 Quick Start

### RUN THE EXE (Easiest Way)
1. Open the `dist/` folder
2. Double-click **VinylSearcher.exe**
3. Browser opens automatically to the application
4. Start searching vinyl records!

**No installation needed. No Python required.**

---

## 📊 Data Included
cd e:\Code\Project V
```

### Step 2: Create a Virtual Environment (Optional but Recommended)

```bash
python -m venv venv
venv\Scripts\activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

**What gets installed:**
- `pywebview==5.0.2` - Desktop GUI framework
- `requests==2.31.0` - HTTP requests for web scraping
- `beautifulsoup4==4.12.2` - HTML parsing
- `python-dotenv==1.0.0` - Environment configuration

---

## Running the Application

### Development Mode

```bash
python app.py
```

This will:
1. Initialize the local SQLite database
2. Start scraping data from all 12 Israeli vinyl stores
3. Launch the desktop application window
4. Display the records in a modern dark-themed UI

### First Run

⏱️ **Initial scrape may take 2-3 minutes** depending on store responsiveness.

The app will:
- Auto-detect if database is empty
- Run scraper in background (non-blocking UI)
- Cache results locally for future runs
- Show "Loading..." spinner until data is ready

---

## Project Structure

```
Project V/
├── app.py                          # Main entry point
├── requirements.txt                # Python dependencies
├── vinyl_records.db               # SQLite database (created on first run)
├── idea.txt                       # Original project specification
├── README.md                      # This file
│
├── backend/
│   ├── __init__.py
│   ├── database.py               # SQLite database manager
│   ├── scraper.py               # Web scraper engine (all 12 stores)
│   └── api.py                   # PyWebView API bridge
│
└── frontend/
    └── index.html               # HTML/JS/CSS UI (TailwindCSS dark theme)
```

---

## Feature Overview

### Search & Filter
- 🔍 **Search by Artist or Album** - Real-time keyword matching
- 🏪 **Filter by Store** - Choose specific vendor
- 💰 **Sort by Price** - Find best deals
- 📅 **Sort by Date** - Find newest additions

### Store Coverage

The app scrapes from these 12 Israeli vinyl record stores:
1. **האוזן השלישית** (Third Ear) - third-ear.com
2. **ביטניק** (Beatnik) - beatnik.co.il
3. **שבלול תקליטים** (Shlabool Records) - shabloolrecords.co.il
4. **דיסק סנטר** (Disc Center) - disccenter.co.il
5. **התו השמיני** (Tav 8) - tav8.co.il
6. **גיורא תקליטים** (Giora Records) - giorarecords.co.il
7. **בית התקליט** (Taklit House) - taklithouse.com
8. **הסיבוב** (HaSivoov) - hasivoov.co.il
9. **דה ויניל רום** (The Vinyl Room) - thevinylroom.co.il
10. **התקליטים שלי** (My Records) - my-records.co.il
11. **וינילסטוק** (Vinyl Stock) - vinylstock.co.il
12. **רולינג דייס** (Rolling Dice) - rollindise.com

### User Actions
- 🔄 **Refresh Data** - Manually update records from all stores
- 🔗 **View on Store** - Opens store product page in browser
- 💾 **Local Cache** - All data stored locally, no cloud dependency

---

## Building the .exe (PyInstaller)

### Step 1: Install PyInstaller

```bash
pip install pyinstaller==6.1.0
```

### Step 2: Navigate to Project Directory

```bash
cd e:\Code\Project V
```

### Step 3: Run PyInstaller

```bash
pyinstaller --onefile --windowed --name "VinylSearcher" --icon=app.ico --add-data "frontend:frontend" app.py
```

**Explanation of flags:**
- `--onefile` → Create single .exe file (not a folder)
- `--windowed` → No console window (clean desktop app)
- `--name "VinylSearcher"` → Executable name
- `--icon=app.ico` → Custom icon (optional; see below)
- `--add-data "frontend:frontend"` → Include HTML/CSS frontend files
- `app.py` → Entry point script

### Step 4: Locate the .exe

After ~2-5 minutes, your .exe will be at:

```
e:\Code\Project V\dist\VinylSearcher.exe
```

✅ **This single file is your complete, standalone application!**

---

## Optional: Adding a Custom Icon

1. Create or find a `.ico` file (e.g., `app.ico`)
2. Place it in the project root: `e:\Code\Project V\app.ico`
3. Include it in the PyInstaller command above:

```bash
pyinstaller --onefile --windowed --name "VinylSearcher" --icon=app.ico --add-data "frontend:frontend" app.py
```

---

## Distribution & Installation

### For End Users:

1. Copy `dist\VinylSearcher.exe` to any Windows PC
2. Double-click to run
3. ✅ No Python installation required
4. ✅ No dependencies to install
5. ✅ No internet connection required after first data load

### File Size:
- Estimated .exe size: **~80-120 MB** (includes Python runtime + all dependencies)
- Database: **~5-20 MB** (grows with more records)

---

## Performance & Troubleshooting

### Issue: App crashes on startup
**Solution**: Ensure `frontend/index.html` exists and Python path is correct.

### Issue: Slow scraping
**Solution**: This is normal. Stores may be slow to respond. Initial scrape takes 2-3 minutes.

### Issue: Some stores return no data
**Possible causes:**
- Store website structure changed (HTML layout different)
- Store blocks scrapers (IP ban or CORS)
- Store uses JavaScript to load products (would need Playwright)

**Solution**: Update the scraper in `backend/scraper.py` with store-specific parsing logic.

### Issue: Database appears empty
**Solution**: Click "Refresh Data" button to manually trigger scrape. Check logs for errors.

### Issue: "Could not import pywebview"
**Solution**: Run `pip install pywebview` in the correct virtual environment.

---

## Advanced Customization

### Changing Scrape Delay

Edit `backend/scraper.py`:

```python
self.delay_range = (2, 5)  # Change to (1, 3) for faster scraping
```

⚠️ **Warning**: Too fast scraping may get IP banned by stores.

### Adding New Stores

Edit `backend/scraper.py` in the `ScraperEngine.__init__()` method:

```python
self.stores = {
    # ... existing stores ...
    'New Store Name': 'https://www.newstore.com/',
}
```

The scraper will auto-detect store structure. You may need to add custom parsing logic if the generic WooCommerce parser fails.

### Changing UI Theme

Edit `frontend/index.html` - Search for `bg-gray-900`, `text-gray-100`, etc. in the TailwindCSS classes.

---

## Architecture & Design Decisions

### Why SQLite?
- ✅ Built into Python, no external database needed
- ✅ Single file (easy to backup/distribute)
- ✅ Portable with .exe
- ✅ Suitable for <100k records

### Why PyWebView?
- ✅ Renders HTML/CSS/JS in native window (not Electron like)
- ✅ Much smaller .exe (~80MB vs 150MB+)
- ✅ Native look & feel
- ✅ Seamless Python ↔ JavaScript bridge

### Why BeautifulSoup + Requests?
- ✅ Lightweight, no Chromium dependency
- ✅ Works for static HTML pages
- ✅ Much smaller final .exe
- ❌ Cannot run JavaScript on stores (would need Playwright)

---

## Future Improvements

1. **Cron Scheduling** - Auto-refresh data hourly/daily
2. **Image Caching** - Download cover images locally
3. **Wishlist Feature** - Save favorite records
4. **Price Alerts** - Notify when price drops
5. **Advanced Filtering** - Genre, year, condition
6. **Export** - Save search results as CSV/PDF
7. **Dark/Light Mode Toggle** - UI preference
8. **Update Checker** - Auto-detect app updates

---

## Deployment Checklist

Before release:
- [ ] Test .exe on clean Windows 10/11 system (no Python installed)
- [ ] Verify initial scrape completes successfully
- [ ] Test search, filter, and sort features
- [ ] Test store links open in browser
- [ ] Test refresh button
- [ ] Check database file creation & persistence
- [ ] Verify error messages are user-friendly
- [ ] Test with slow internet connection
- [ ] Test with offline (should show cached data)

---

## Support & Troubleshooting

### Logs
Application logs are printed to console. Save them for debugging:

```bash
python app.py > app_log.txt 2>&1
```

### Testing Scraper Only
To test scraper without UI:

```python
from backend.scraper import ScraperEngine

scraper = ScraperEngine()
records = scraper.scrape_all_stores()
print(f"Found {len(records)} records")
for record in records[:5]:
    print(record)
```

### Database Inspection
To query database directly:

```python
from backend.database import DatabaseManager

db = DatabaseManager()
records = db.search_records(search_term="Pink Floyd")
for r in records:
    print(f"{r['artist']} - {r['album']} (₪{r['price']})")
```

---

## License & Attribution

This project was built for the Israeli vinyl record market.

Scraping is done ethically:
- ✅ Polite delays between requests (2-5 seconds)
- ✅ User-Agent headers rotated
- ✅ No data stored on external servers
- ✅ Users redirected to original stores for purchase

---

## Contact & Feedback

For issues or feature requests, check logs first and review the troubleshooting section above.

---

**Happy record hunting! 🎵**
