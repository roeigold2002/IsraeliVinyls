"""
MASTER ORCHESTRATOR - RUN ALL ISRAELI VINYL STORE SCRAPERS
Executes all scrapers in sequence to download ~53,000+ vinyl records
"""

import subprocess
import time
from datetime import datetime
import os

print("=" * 80)
print("ISRAELI VINYL STORES - BATCH PAGE DOWNLOADER")
print("Master Orchestrator Script")
print("=" * 80)
print()

# Configuration: (script_name, store_name, expected_records, enabled)
scrapers = [
    ("scraper_third_ear.py", "third-ear.com", 9376, True),
    ("scraper_beatnik.py", "beatnik.co.il", 14980, True),
    ("scraper_shablool.py", "shabloolrecords.co.il", 4976, True),
    ("scraper_giora.py", "giorarecords.co.il", 4520, True),
    ("scraper_hasivoov.py", "hasivoov.co.il", 1025, True),
    ("scraper_vinylroom.py", "thevinylroom.co.il", 2368, True),
    ("scraper_rollindice.py", "rollindice.com", 684, True),
    ("scraper_taklithouse.py", "taklithouse.com", 0, True),  # Auto-detect
    ("scraper_disccenter.py", "disccenter.co.il", 11293, False),  # Requires Selenium
    ("scraper_tav8.py", "tav8.co.il", 0, False),  # Requires Selenium
    ("scraper_vinylstock.py", "vinylstock.co.il", 0, False),  # Requires Selenium
]

print("SCRAPERS TO EXECUTE:")
print("-" * 80)
total_expected = 0
for i, (script, store, expected, enabled) in enumerate(scrapers, 1):
    status = "ENABLED" if enabled else "REQUIRES SELENIUM"
    print(f"{i:2d}. {store:35} {expected:6,} records  [{status}]")
    if enabled:
        total_expected += expected

print("-" * 80)
print(f"Total expected records (enabled): ~{total_expected:,}")
print()

# Check which scrapers are available
print("CHECKING SCRAPER FILES...")
print("-" * 80)
available = 0
for script, store, _, enabled in scrapers:
    if os.path.exists(script):
        print(f"✓ {script}")
        available += 1
    else:
        print(f"✗ {script} NOT FOUND")

if available == 0:
    print("\nERROR: No scraper files found!")
    exit(1)

print(f"\n{available}/{len(scrapers)} scrapers available")
print()

# Run scrapers
print("=" * 80)
print(f"STARTING DOWNLOADS AT {datetime.now().isoformat()}")
print("=" * 80)
print()

start_time = datetime.now()
successful = 0
failed = 0
skipped = 0

for i, (script, store, expected, enabled) in enumerate(scrapers, 1):
    if not os.path.exists(script):
        print(f"[{i}/{len(scrapers)}] SKIP - {store}")
        print(f"  File not found: {script}")
        skipped += 1
        continue
    
    if not enabled:
        print(f"[{i}/{len(scrapers)}] SKIP - {store}")
        print(f"  Requires Selenium (optional)")
        skipped += 1
        continue
    
    print()
    print("=" * 80)
    print(f"[{i}/{len(scrapers)}] {store} ({expected:,} expected records)")
    print("=" * 80)
    
    try:
        result = subprocess.run(["python", script], check=True, timeout=7200)
        successful += 1
        print()
        print(f"✓ {store} completed successfully")
    except subprocess.TimeoutExpired:
        failed += 1
        print(f"✗ {store} timed out")
    except subprocess.CalledProcessError as e:
        failed += 1
        print(f"✗ {store} failed with error code {e.returncode}")
    except Exception as e:
        failed += 1
        print(f"✗ {store} error: {e}")
    
    # Wait between scrapers to be respectful
    time.sleep(5)

# Summary
end_time = datetime.now()
duration = end_time - start_time

print()
print("=" * 80)
print("BATCH DOWNLOAD COMPLETE")
print("=" * 80)
print(f"Duration:      {duration}")
print(f"Successful:    {successful}/{available}")
print(f"Failed:        {failed}/{available}")
print(f"Skipped:       {skipped}/{len(scrapers)}")
print(f"Started:       {start_time.isoformat()}")
print(f"Completed:     {end_time.isoformat()}")
print()
print("NEXT STEPS:")
print("1. Verify downloaded pages in respective directories")
print("2. Create HTML extraction scripts to parse vinyl records")
print("3. Import extracted data into database")
print("4. Enable Selenium-based scrapers if needed (disccenter, tav8, vinylstock)")
print()
