# QUICK START GUIDE - Israeli Vinyl Records Aggregator

## 🚀 Five-Minute Setup

### 1. Install Python Dependencies

Open PowerShell/Command Prompt in the project folder and run:

```bash
pip install -r requirements.txt
```

**Expected output**: All packages installed successfully

### 2. Run the Application (Development Mode)

```bash
python app.py
```

**What happens:**
- SQLite database is created (if not exists)
- Background thread starts scraping all 12 Israeli vinyl stores
- Desktop window opens with dark-themed UI
- Initial scrape takes 2-3 minutes (first time only)

**Once scrape completes:**
- ✅ Search bar is active
- ✅ 100+ vinyl records loaded into your local database
- ✅ Click store links to purchase
- ✅ Use "Refresh Data" button to update anytime

---

## 📦 Building the Standalone .exe

### Prerequisites

```bash
pip install pyinstaller==6.1.0
```

### Build Command (Windows)

Navigate to your project folder and run:

```bash
pyinstaller --onefile --windowed --name "VinylSearcher" --add-data "frontend:frontend" app.py
```

### Output

After 2-5 minutes, your standalone .exe will be created at:

```
dist/VinylSearcher.exe
```

### What To Do With The .exe

1. **Copy it to any Windows PC** (no Python needed)
2. **Double-click to run** - Done!
3. **First window launch** takes ~30 seconds (decompressing runtime)
4. **Database persists** with all records

### .exe Location & Distribution

```
Project V/
├── dist/
│   └── VinylSearcher.exe  ← Your final product!
│
└── [source files...]
```

You can now share `dist/VinylSearcher.exe` with users. They need nothing else.

---

## 📊 Project Structure (After Build)

```
Project V/
├── app.py                  # Entry point
├── requirements.txt        # Dependencies
├── README.md              # Full documentation
├── QUICKSTART.md          # This file
│
├── backend/
│   ├── __init__.py
│   ├── database.py        # SQLite manager
│   ├── scraper.py         # Web scraper (12 stores)
│   └── api.py             # PyWebView API
│
├── frontend/
│   └── index.html         # Dark-themed UI
│
├── vinyl_records.db       # Local database (created on first run)
│
└── dist/
    └── VinylSearcher.exe  # Standalone executable
```

---

## ✨ Features

- 🔍 Search by artist or album name
- 🏪 Filter by Israeli vinyl store
- 💰 Sort by price (find deals)
- 📅 Sort by newest additions
- 🔄 Refresh data button (manual update)
- 🔗 Direct links to store pages
- 💾 All data stored locally (no cloud, no tracking)
- 🌙 Dark theme UI optimized for evening browsing

---

## 🎵 Supported Stores (12 Israeli Vinyl Retailers)

1. האוזן השלישית (Third Ear)
2. ביטניק (Beatnik)
3. שבלול תקליטים (Shlabool Records)
4. דיסק סנטר (Disc Center)
5. התו השמיני (Tav 8)
6. גיורא תקליטים (Giora Records)
7. בית התקליט (Taklit House)
8. הסיבוב (HaSivoov)
9. דה ויניל רום (The Vinyl Room)
10. התקליטים שלי (My Records)
11. וינילסטוק (Vinyl Stock)
12. רולינג דייס (Rolling Dice)

---

## ⚡ Performance Notes

### Initial Scrape (First Run)
- **Time**: 2-3 minutes to scrape all 12 stores
- **Records**: 100-500 vinyl albums (depends on store inventory)
- **Size**: Database ~5-20 MB

### Subsequent Runs
- **Load Time**: <1 second (loads from local cache)
- **Manual Refresh**: 2-3 minutes (updates all stores)

### .exe Size
- **Standalone exe**: 80-120 MB (includes Python runtime)
- **No dependencies**: Works on any Windows 7+ system

---

## 🔧 Troubleshooting

### Problem: "ImportError: No module named pywebview"

**Solution:**
```bash
pip install pywebview
```

### Problem: "No HTML file found"

**Solution:** Ensure `frontend/` folder exists with `index.html` inside:
```
Project V/
└── frontend/
    └── index.html
```

### Problem: Database is empty after running app

**Solution:** Click the "🔄 Refresh Data" button in the UI. Initial scrape may timeout on slow connections. Check if stores are responding.

### Problem: Some stores return no data

**Possible causes:**
- Store uses JavaScript (need Playwright, not BeautifulSoup)
- Store blocks scrapers (temporary ban)
- Store HTML structure changed

**Workaround:** These stores may need custom parsing logic in `backend/scraper.py`

### Problem: .exe is large (120 MB)

**Explanation:** PyInstaller bundles entire Python runtime + all dependencies. This is normal for .exe builds.

**To reduce size:** Use UPX compression (advanced) or Nuitka compilation.

---

## 📝 Development Tips

### Run in Debug Mode
```bash
# Modify app.py line: pywebview.start(debug=True, gui='winforms')
python app.py
```

### Direct Database Query
```python
from backend.database import DatabaseManager

db = DatabaseManager()
records = db.search_records(search_term="Pink Floyd")
for r in records:
    print(f"{r['artist']} - {r['album']}: ₪{r['price']}")
```

### Test Scraper Alone
```python
from backend.scraper import ScraperEngine

scraper = ScraperEngine()
records = scraper.scrape_store("שבלול תקליטים")
print(f"Found {len(records)} records")
```

---

## 🎯 Next Steps

1. **First Time Users**: Run `python app.py` and wait for initial scrape
2. **Customization**: Edit `frontend/index.html` to change colors/theme
3. **Distribution**: Build .exe with `pyinstaller` command above
4. **Deployment**: Share `dist/VinylSearcher.exe` with users

---

## 📞 Support

For detailed documentation, see **README.md** in the project root.

For code issues, check the error logs:
```bash
python app.py > app_log.txt 2>&1
```

---

**Happy record hunting! 🎵 Enjoy browsing Israeli vinyl stores!**
