# Israeli Vinyl Store Scrapers - README

## Overview

Collection of Python scripts to automatically download and save HTML pages from Israeli vinyl record stores. This is **Phase 1** of a two-phase process:

- **Phase 1 (this)**: Download and save all HTML pages locally
- **Phase 2 (next)**: Extract vinyl record data from saved HTML files

## Total Expected Records: ~53,000+

| Store | Pages | Items/Page | Total | Status |
|-------|-------|-----------|-------|--------|
| beatnik.co.il | 749 | 20 | 14,980 | ✅ Ready |
| third-ear.com | 293 | 32 | 9,376 | ✅ Ready |
| disccenter.co.il | 1 (scroll) | 11,293 | 11,293 | ⏳ Selenium |
| shabloolrecords.co.il | 311 | 16 | 4,976 | ✅ Ready |
| giorarecords.co.il | 113 | 40 | 4,520 | ✅ Ready |
| thevinylroom.co.il | 148 | 16 | 2,368 | ✅ Ready |
| hasivoov.co.il | 41 | 25 | 1,025 | ✅ Ready |
| rollindice.com | 19 | 36 | 684 | ✅ Ready |
| taklithouse.com | ? (auto) | ? | ? | ✅ Ready |
| tav8.co.il | 1 (scroll) | ? | ? | ⏳ Selenium |
| vinylstock.co.il | 1 (scroll) | ? | ? | ⏳ Selenium |

## Quick Start

### Run all scrapers at once:
```bash
python run_all_scrapers.py
```

### Run individual scraper:
```bash
python scraper_third_ear.py
python scraper_beatnik.py
python scraper_shablool.py
python scraper_giora.py
python scraper_hasivoov.py
python scraper_vinylroom.py
python scraper_rollindice.py
python scraper_taklithouse.py
```

### Run with Selenium (optional):
```bash
# Requires ChromeDriver installation
pip install selenium
# Download ChromeDriver: https://chromedriver.chromium.org/

python scraper_disccenter.py
python scraper_tav8.py
python scraper_vinylstock.py
```

## What Each Script Does

### Paginated Scrapers (Simple)
- **third_ear.py**: 293 pages from third-ear.com
- **beatnik.py**: 748 pages from beatnik.co.il (starts at page 2)
- **shablool.py**: 311 pages from shabloolrecords.co.il
- **giora.py**: 113 pages from giorarecords.co.il
- **hasivoov.py**: 41 pages from hasivoov.co.il
- **vinylroom.py**: 148 pages from thevinylroom.co.il
- **rollindice.py**: 19 pages from rollindice.com

**Features:**
- Respects server with 1-second delays between requests
- Skips already-downloaded pages (resumable)
- Saves HTML pages locally with numbered filenames
- Handles errors gracefully

### Auto-Detecting Scraper
- **taklithouse.py**: Auto-detects last page by checking for empty results

### Selenium-Based Scrapers (Infinite Scroll)
- **disccenter.py**: 11,293 records from single page
- **tav8.py**: Unknown count from single page
- **vinylstock.py**: Unknown count from single page

**Features:**
- Uses Selenium to scroll and load dynamic content
- Waits for JavaScript rendering
- Saves complete page with all loaded items
- Requires ChromeDriver

## Output Directories

Each scraper creates a numbered directory with HTML pages:

```
third_ear_pages/       → page_0001.html, page_0002.html, ...
beatnik_pages/         → page_0002.html, page_0003.html, ...
shablool_pages/        → page_0001.html, page_0002.html, ...
giora_pages/           → page_0001.html, page_0002.html, ...
hasivoov_pages/        → page_0001.html, page_0002.html, ...
vinylroom_pages/       → page_0001.html, page_0002.html, ...
rollindice_pages/      → page_0001.html, page_0002.html, ...
taklithouse_pages/     → page_0001.html, page_0002.html, ...
disccenter_pages/      → disccenter_full.html            (single page with scroll)
tav8_pages/            → tav8_full.html                  (single page with scroll)
vinylstock_pages/      → vinylstock_full.html            (single page with scroll)
```

## Configuration

Edit `scraper_config.py` to:
- Enable/disable specific stores
- Adjust delay between requests (for respectfulness)
- Modify page ranges
- Add new stores

```python
STORES = {
    "beatnik": {
        "name": "beatnik.co.il",
        "pages": (2, 749),
        "enabled": True,  # Set to False to skip
        ...
    }
}
```

## Resuming Interrupted Downloads

If a scraper is interrupted:
1. The script automatically skips already-downloaded pages
2. Simply run the same script again to continue from where it left off
3. No data loss or re-downloading of existing pages

Example:
```bash
# First run - interrupted at page 150
python scraper_beatnik.py
^C  # Interrupted

# Second run - automatically skips pages 2-149, continues from 150
python scraper_beatnik.py
```

## Tips

### For Large Downloads (700+ pages)
- Run during off-peak hours to be respectful
- Run one scraper at a time to avoid overwhelming servers
- Watch the progress with regular outputs every 50-100 pages

### To Increase Speed (at your own risk)
Edit scraper file and change:
```python
DELAY_BETWEEN_REQUESTS = 0.5  # Default is 1 second
```

**Note**: Smaller delays may trigger rate-limiting or IP bans. Not recommended.

### To Disable Specific Stores
Edit `run_all_scrapers.py` and set `enabled=False`:
```python
("scraper_beatnik.py", "beatnik.co.il", 14980, False),  # Won't run
```

## Next Phase: Data Extraction

Once all pages are downloaded, you'll need extraction scripts to:
1. Parse HTML pages
2. Extract artist, album, price, format data
3. Import into database

Each store's HTML structure is different, so custom extractors are needed.

**Create extractors like:**
```bash
extract_third_ear.py
extract_beatnik.py
extract_shablool.py
... etc
```

## Troubleshooting

### "Connection timeout" errors
- Server may be temporarily down
- Rerun the script - it will skip completed pages and retry failed ones
- Some errors are expected and are handled gracefully

### Selenium-based scrapers fail
```bash
pip install selenium
# Download ChromeDriver for your OS: https://chromedriver.chromium.org/
# Place chromedriver.exe in a folder in your PATH
```

### Script stops unexpectedly
- Check internet connection
- Review last error message in console
- Rerun to resume - already-downloaded pages are skipped

### Very slow on beatnik (749 pages)
- That's normal - 749 pages × 1 second delay = 12+ minutes
- It's being respectful to their server
- Leave it running in background

## Statistics

### Data Volume
- **Pages to download**: ~1,593
- **Expected records**: ~53,000+
- **Estimated HTML size**: 2-5 GB
- **Download time**: 30 minutes - 2 hours (depending on server speed)

### Timing (approximate)
- Third-ear: 5 minutes (293 pages)
- Beatnik: 13 minutes (748 pages)
- Shablool: 6 minutes (311 pages)
- Giora: 2 minutes (113 pages)
- Hasivoov: 1 minute (41 pages)
- Vinylroom: 3 minutes (148 pages)
- Rollindice: 30 seconds (19 pages)
- Taklithouse: varies (auto-detect)

**Total (without Selenium): ~30-40 minutes**

## Files Created

```
scraper_third_ear.py      - Third-ear.com scraper
scraper_beatnik.py        - Beatnik.co.il scraper
scraper_shablool.py       - Shabloolrecords scraper
scraper_giora.py          - Giorarecords scraper
scraper_hasivoov.py       - Hasivoov.co.il scraper
scraper_vinylroom.py      - Vinyl room scraper
scraper_rollindice.py     - Rollindice scraper
scraper_taklithouse.py    - Taklithouse auto-detect scraper
scraper_disccenter.py     - Disccenter Selenium scraper
scraper_tav8.py           - Tav8 Selenium scraper
scraper_vinylstock.py     - Vinylstock Selenium scraper
run_all_scrapers.py       - Master orchestrator
scraper_config.py         - Configuration file
SCRAPER_README.md         - This file
```

## Next Steps

1. ✅ Run `python run_all_scrapers.py` to download all pages
2. ⏳ Create extraction scripts for each store's HTML
3. ⏳ Parse vinyl records and prices from HTML
4. ⏳ Import extracted data into database (50K+ new records!)

---

**Status**: Ready to use  
**Created**: March 31, 2026  
**Total expected records**: ~53,000+  
**Estimated download time**: 30-40 minutes
