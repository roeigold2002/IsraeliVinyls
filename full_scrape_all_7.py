"""Full scrape of all 7 Israeli vinyl stores - maximum pages."""

from backend.scraper_enhanced import AdvancedScraperEngine
from backend.enhanced_database import EnhancedDatabaseManager
import logging

logging.basicConfig(level=logging.WARNING)

scraper = AdvancedScraperEngine()
db = EnhancedDatabaseManager('vinyl_records.db')

# All 7 working stores with full page pagination
stores_list = [
    'ביטניק',
    'שבלול תקליטים',  
    'האוזן השלישית',
    'גיורא תקליטים',
    'הסיבוב',
    'דה ויניל רום',
    'התו השמיני'
]

print("FULL SCRAPE: All 7 Israeli Vinyl Stores")
print("="*60)

total_records = 0

for store_name in stores_list:
    if store_name not in scraper.stores:
        print(f"SKIP {store_name}: Not in stores config")
        continue
    
    config = scraper.stores[store_name]
    max_p = config.get('max_pages', 50)
    print(f"SCRAPING {store_name} (up to {max_p} pages)...", end=" ", flush=True)
    
    try:
        records = scraper.scrape_store(store_name, config)
        print(f"OK {len(records)} records")
        
        # Insert into database
        for record in records:
            db.insert_record(
                artist=record['artist'],
                album=record['album'],
                price=record['price'],
                cover_url=record['cover_url'],
                store_name=record['store_name'],
                store_url=record['store_url']
            )
        
        total_records += len(records)
        
    except Exception as e:
        print(f"ERROR: {str(e)[:50]}")

print("\n" + "="*60)
print(f"DONE: {total_records:,} records total in database")

# Show stats
stats = db.get_stats()
print(f"Database stats:")
print(f"   Total records: {stats['total_records']:,}")
print(f"   Stores: {', '.join(stats['stores'])}")
