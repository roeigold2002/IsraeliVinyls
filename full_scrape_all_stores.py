#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Full scraper for all 11 stores - direct execution."""

import sqlite3
import sys
sys.path.insert(0, '.')

from backend.scraper_enhanced import AdvancedScraperEngine
from backend.enhanced_database import EnhancedDatabaseManager
import logging
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initialize database
print("Initializing database...")
db = EnhancedDatabaseManager('vinyl_records.db')

# Initialize scraper
print("Initializing scraper...")
scraper = AdvancedScraperEngine()

all_records = []
store_results = {}

# Scrape each store
for store_name, store_config in scraper.stores.items():
    try:
        # Limit pages for speed (can increase later)
        max_pages = min(5, store_config.get('max_pages', 1))  # Only 5 pages max per store
        store_config['max_pages'] = max_pages
        
        print(f"\n{'='*60}")
        print(f"Scraping: {store_name}")
        print(f"Max pages: {max_pages}")
        print(f"{'='*60}")
        
        records = scraper.scrape_store(store_name, store_config)
        
        for record in records:
            if 'store_name' not in record:
                record['store_name'] = store_name
        
        all_records.extend(records)
        store_results[store_name] = len(records)
        
        print(f"✅ {store_name}: {len(records)} records")
        
        # Small delay between stores
        time.sleep(2)
        
    except Exception as e:
        print(f"❌ Error scraping {store_name}: {e}")
        store_results[store_name] = 0

print(f"\n\n{'='*60}")
print("SCRAPING COMPLETE")
print(f"{'='*60}")
print(f"Total records: {len(all_records)}\n")

for store, count in sorted(store_results.items(), key=lambda x: x[1], reverse=True):
    print(f"  {store:25} - {count:5} records")

if all_records:
    print(f"\nInserting {len(all_records)} records into database...")
    try:
        inserted = db.insert_batch(all_records)
        print(f"✅ Successfully inserted {inserted} records")
    except Exception as e:
        print(f"❌ Error inserting: {e}")
        import traceback
        traceback.print_exc()

# Verify
conn = sqlite3.connect('vinyl_records.db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM records")
count = cursor.fetchone()[0]
print(f"\n{'='*60}")
print(f"Database now contains: {count} records")
print(f"{'='*60}")

if count > 0:
    cursor.execute("SELECT DISTINCT store_name FROM records")
    stores = [row[0] for row in cursor.fetchall()]
    print(f"\nStores with records:")
    for store in sorted(stores):
        cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = ?", (store,))
        s_count = cursor.fetchone()[0]
        print(f"  - {store}: {s_count} records")

cursor.close()
conn.close()

print(f"\nSetup complete! Now run: python app.py")
