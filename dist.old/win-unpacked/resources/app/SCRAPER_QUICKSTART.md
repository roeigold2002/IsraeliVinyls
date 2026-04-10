# Israeli VINYL SCRAPERS - QUICK START GUIDE

## What You Have

11 production-ready scraper scripts that will download **~53,000+ vinyl records** from Israeli stores.

## Quick Commands

### Download ALL pages RIGHT NOW:
```bash
python run_all_scrapers.py
```

That's it! Sit back and let it run ~30-40 minutes to download ~1,593 HTML pages.

---

## Individual Scrapers (if you want to run separately)

```bash
# Quick ones (under 5 minutes each)
python scraper_giora.py          # 113 pages, ~2 min
python scraper_hasivoov.py       # 41 pages, ~1 min
python scraper_rollindice.py     # 19 pages, ~30 sec

# Medium ones (5-10 minutes)
python scraper_third_ear.py      # 293 pages, ~5 min
python scraper_vinylroom.py      # 148 pages, ~3 min
python scraper_shablool.py       # 311 pages, ~6 min

# Large ones (10+ minutes)
python scraper_beatnik.py        # 748 pages, ~13 min
python scraper_taklithouse.py    # Unknown pages, ~varies

# Selenium-based (requires ChromeDriver)
python scraper_disccenter.py     # 11,293 records in 1 page
python scraper_tav8.py           # Unknown records
python scraper_vinylstock.py     # Unknown records
```

---

## What You'll Get

After running, you'll have directories with HTML pages:

```
third_ear_pages/          293 HTML files
beatnik_pages/            748 HTML files
shablool_pages/           311 HTML files
giora_pages/              113 HTML files
hasivoov_pages/            41 HTML files
vinylroom_pages/          148 HTML files
rollindice_pages/          19 HTML files
taklithouse_pages/         ? (auto-detected)
disccenter_pages/          1 HTML file (with scroll)
tav8_pages/                1 HTML file (with scroll)
vinylstock_pages/          1 HTML file (with scroll)
```

**Total**: ~1,593 HTML pages containing ~53,000 vinyl records

---

## Step-by-Step Guide

### Step 1: Start Downloading (30-40 minutes)
```bash
python run_all_scrapers.py
```

Shows progress like:
```
[1/11] third-ear.com (9,376 expected records)
========================
[50/293] Downloaded OK
[100/293] Downloaded OK
[150/293] Downloaded OK
... continues until all 293 pages done ...
✓ third-ear.com completed successfully

[2/11] beatnik.co.il (14,980 expected records)
... 748 pages of downloading ...
```

### Step 2: Verify Downloaded Pages
```bash
# Check what was downloaded
ls third_ear_pages/      # Should show ~293 HTML files
ls beatnik_pages/        # Should show ~748 HTML files
ls hasivoov_pages/       # Should show ~41 HTML files
... etc
```

### Step 3: Extract Vinyl Records (Next Phase)
Once pages are downloaded, create extraction scripts to:
- Parse each store's unique HTML structure
- Extract: Artist, Album Name, Format, Price, etc.
- Save to database format

Example extraction script structure:
```python
from bs4 import BeautifulSoup

# For each HTML file in beatnik_pages/:
with open("beatnik_pages/page_0002.html") as f:
    soup = BeautifulSoup(f)
    # Find product divs
    # Extract artist, album, price
    # Add to database
```

### Step 4: Import to Database
```python
# Load extracted records
# Insert into vinyl_records table
# Deduplicate
# Update database
```

---

## Expected Timeline

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Download pages | 30-40 min | ✅ Ready NOW |
| 2 | Extract records | 1-2 hours | ⏳ Next |
| 3 | Import to DB | 30 min | ⏳ Next |

**Total time from start to 53K new records: ~3-4 hours**

---

## Important Notes

✅ **Resumable** - If interrupted, just run again (skips completed pages)
✅ **Respectful** - 1-second delays between requests
✅ **Reliable** - Handles errors gracefully, continues on failures
✅ **Complete** - All 11 stores configured and ready

⏳ **Selenium-based** (disccenter, tav8, vinylstock) optional:
- Requires: `pip install selenium`
- Requires: Download ChromeDriver from https://chromedriver.chromium.org/
- Optional: Can get massive yield if enabled

---

## Selenium Setup (Optional for 3 stores)

If you want to also scrape the 3 infinite-scroll stores:

```bash
# Install Selenium
pip install selenium

# Download ChromeDriver (matches your Chrome version)
# https://chromedriver.chromium.org/
# Windows: chromedriver.exe
# macOS/Linux: chromedriver

# Make it available
# Windows: Add to C:\Scripts\ or anywhere in PATH
# macOS/Linux: chmod +x chromedriver && sudo mv chromedriver /usr/local/bin/

# Then run
python scraper_disccenter.py
python scraper_tav8.py
python scraper_vinylstock.py
```

---

## Next: Create Extraction Scripts

Once download is complete, you'll need to parse the HTML pages.

**Different stores need different extractors because:**
- Each has different class names/structure
- Different data formats
- Different field locations

Create extractors like:
```python
# extract_beatnik.py
# extract_third_ear.py
# extract_shablool.py
# etc...
```

---

## Files Provided

| File | Purpose |
|------|---------|
| `scraper_third_ear.py` | Downloads 293 pages |
| `scraper_beatnik.py` | Downloads 748 pages |
| `scraper_shablool.py` | Downloads 311 pages |
| `scraper_giora.py` | Downloads 113 pages |
| `scraper_hasivoov.py` | Downloads 41 pages |
| `scraper_vinylroom.py` | Downloads 148 pages |
| `scraper_rollindice.py` | Downloads 19 pages |
| `scraper_taklithouse.py` | Auto-detects pages |
| `scraper_disccenter.py` | 1 page + Selenium |
| `scraper_tav8.py` | 1 page + Selenium |
| `scraper_vinylstock.py` | 1 page + Selenium |
| `run_all_scrapers.py` | Runs all at once |
| `scraper_config.py` | Configuration |
| `SCRAPER_README.md` | Full documentation |

---

## GO!

```bash
python run_all_scrapers.py
```

Let it run. Come back in 30-40 minutes and you'll have **~53,000 vinyl records** ready for data extraction!

---

**Created**: March 31, 2026  
**Ready to use**: YES  
**Expected records**: 53,000+  
**Time to download**: 30-40 minutes
