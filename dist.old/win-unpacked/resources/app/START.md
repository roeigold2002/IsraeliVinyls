# 🚀 GET STARTED NOW

## Copy & Paste These Commands

### STEP 1: Install Dependencies (First Time Only)
```powershell
pip install -r requirements.txt
```

### STEP 2: Run the App
```powershell
python app.py
```

✅ App will:
- Create `vinyl_records.db` (local database)
- Scrape all 12 Israeli vinyl stores in background (2-3 minutes)
- Open dark-themed desktop window with search/filter UI
- Display records as they load

---

## BUILD STANDALONE .EXE (Optional)

### For Windows Users - Easy Way
Just double-click:
```
build.bat
```

Result: `dist/VinylSearcher.exe` ready to share

---

### For Advanced Users - Manual Build
```powershell
pip install pyinstaller==6.1.0

pyinstaller --onefile --windowed --name "VinylSearcher" --add-data "frontend:frontend" app.py
```

Result: `dist/VinylSearcher.exe` (80-120 MB standalone executable)

---

## 📋 What's Included

| File | Purpose |
|------|---------|
| `app.py` | Main application entry point |
| `backend/database.py` | SQLite database manager |
| `backend/scraper.py` | Web scraper for 12 stores |
| `backend/api.py` | Frontend-Backend bridge |
| `frontend/index.html` | Dark-themed search UI |
| `requirements.txt` | Python dependencies |
| `README.md` | Full documentation |
| `QUICKSTART.md` | Quick reference |
| `BUILD_SUMMARY.md` | Project overview |
| `build.bat` | One-click .exe builder (Windows) |

---

## ✨ Features

✅ Search by artist/album  
✅ Filter by Israeli store  
✅ Sort by price  
✅ Real-time filtering  
✅ Offline-capable (data cached locally)  
✅ Direct links to store pages  
✅ Responsive mobile-friendly UI  
✅ Dark theme perfect for evening browsing  

---

## 12 Supported Israeli Stores

1. האוזן השלישית (Third Ear)
2. ביטניק (Beatnik)
3. שבלול תקליטים (Shlabool)
4. דיסק סנטר (Disc Center)
5. התו השמיני (Tav 8)
6. גיורא תקליטים (Giora)
7. בית התקליט (Taklit House)
8. הסיבוב (HaSivoov)
9. דה ויניל רום (Vinyl Room)
10. התקליטים שלי (My Records)
11. וינילסטוק (Vinyl Stock)
12. רולינג דייס (Rolling Dice)

---

## System Requirements

**To Run App**
- Windows 7 or later
- 100 MB free disk space
- Internet (for first scrape, then optional)

**To Build .exe**
- Windows with Python 3.8+
- pyinstaller installed

**To Use .exe**
- Windows 7 or later
- Just the .exe file - nothing else!

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No records showing | Click "🔄 Refresh Data" button |
| Import error | `pip install -r requirements.txt` |
| Slow scrape | Normal (2-3 min for 12 stores), grab coffee ☕ |
| Frontend errors | Ensure `frontend/index.html` exists |

---

## That's It! 🎵

You're ready to search Israeli vinyl records!

Start with: `python app.py`

For full docs: See `README.md`
