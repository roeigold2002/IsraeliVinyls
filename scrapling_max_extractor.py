#!/usr/bin/env python3
"""
SCRAPLING: Maximum Records Extractor
Uses only StealthyFetcher - no browser overhead
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import StealthyFetcher
import threading

STORES = [
    ("Giora", "https://www.giorarecords.co.il/", 150),
    ("Beatnik", "https://www.beatnik.co.il/", 150),
    ("Shablool", "https://shabloolrecords.co.il/", 150),
    ("The Vinyl Room", "https://thevinylroom.co.il/", 120),
    ("My Records", "https://www.my-records.co.il/", 150),
    ("Tav8", "https://www.tav8.co.il/", 100),
    ("Third Ear", "https://www.third-ear.com/", 100),
    ("Taklit House", "https://www.taklithouse.com/", 80),
    ("HaSivoov", "https://hasivoov.co.il/", 100),
    ("Disk Center", "https://www.disccenter.co.il/", 120),
    ("Vinyl Stock", "https://www.vinylstock.co.il/", 120),
    ("Rolling Dice", "https://www.rollindise.com/", 120),
]

db_lock = threading.Lock()

def parse_product(title, store_name, price, product_url, base_url):
    """Create product record"""
    if not title or len(title) < 3:
        return None
    
    title = title.strip()[:200]
    
    # Parse artist and album
    seps = [' - ', ' | ', ' -- ', ' — ', ' • ']
    for sep in seps:
        if sep in title:
            parts = title.split(sep, 1)
            if len(parts[0].strip()) > 2 and len(parts[1].strip()) > 2:
                return {
                    'artist': parts[0].strip()[:100],
                    'album': parts[1].strip()[:200],
                    'genre': 'Vinyl',
                    'year': None,
                    'store_name': store_name,
                    'price': price[:50] if price else 'N/A',
                    'currency': 'ILS',
                    'format': 'LP',
                    'condition': 'New',
                    'store_url': base_url,
                    'product_url': product_url[:500] if product_url else '',
                    'added_date': datetime.now().isoformat()
                }
    
    return {
        'artist': 'Various Artists',
        'album': title,
        'genre': 'Vinyl',
        'year': None,
        'store_name': store_name,
        'price': price[:50] if price else 'N/A',
        'currency': 'ILS',
        'format': 'LP',
        'condition': 'New',
        'store_url': base_url,
        'product_url': product_url[:500] if product_url else '',
        'added_date': datetime.now().isoformat()
    }

def scrape_page_simple(url, store_name, base_url):
    """Fetch and parse single page"""
    try:
        response = StealthyFetcher.fetch(url, impersonate='chrome', timeout=15)
        records = []
        
        # Find products
        products = []
        for selector in ['.product', '.item', '[class*="product"]', 'li.product', '.card']:
            try:
                found = response.css(selector)
                if len(found) > 3:
                    products = found
                    break
            except:
                pass
        
        if not products:
            return []
        
        for prod in products:
            try:
                title = None
                for sel in ['h2::text', 'h3::text', 'a::text', '.title::text']:
                    try:
                        t = prod.css(sel).get()
                        if t:
                            title = t.strip()
                            if len(title) > 3:
                                break
                    except:
                        pass
                
                if not title or len(title) < 3:
                    continue
                
                price = 'N/A'
                try:
                    p = prod.css('.price::text').get()
                    if p:
                        price = p.strip()
                except:
                    pass
                
                product_url = ''
                try:
                    product_url = prod.css('a::attr(href)').get() or ''
                except:
                    pass
                
                record = parse_product(title, store_name, price, product_url, base_url)
                if record:
                    records.append(record)
            except:
                pass
        
        return records
    except:
        return []

def scrape_store_max(store_name, base_url, max_pages):
    """Scrape store exhaustively"""
    print(f"[{store_name}] Starting...", flush=True)
    
    all_records = []
    consecutive_empty = 0
    
    for page in range(1, max_pages + 1):
        try:
            url = base_url if page == 1 else f"{base_url}?page={page}"
            
            page_records = scrape_page_simple(url, store_name, base_url)
            
            if page_records:
                all_records.extend(page_records)
                print(f"[{store_name}] Page {page}: {len(page_records)} items", flush=True)
                consecutive_empty = 0
            else:
                if page > 3:
                    print(f"[{store_name}] Page {page}: No items (stopping)", flush=True)
                    break
                consecutive_empty += 1
            
            time.sleep(0.05)
            
        except Exception as e:
            print(f"[{store_name}] Page {page}: Error", flush=True)
            consecutive_empty += 1
            if consecutive_empty > 2:
                break
    
    print(f"[{store_name}] Total: {len(all_records)} records\n", flush=True)
    return all_records

def save_all(records):
    """Save batch to database"""
    if not records:
        return 0
    
    with db_lock:
        try:
            conn = sqlite3.connect('music_stores.db', timeout=30)
            cursor = conn.cursor()
            
            saved = 0
            for r in records:
                try:
                    cursor.execute("SELECT id FROM records WHERE artist=? AND album=? AND store_name=?",
                                 (r['artist'], r['album'], r['store_name']))
                    if not cursor.fetchone():
                        cursor.execute("""INSERT INTO records 
                            (artist, album, genre, year, store_name, price, currency, format, condition, store_url, product_url, added_date)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (r['artist'], r['album'], r['genre'], r['year'], r['store_name'], r['price'],
                             r['currency'], r['format'], r['condition'], r['store_url'], r['product_url'], r['added_date']))
                        saved += 1
                except:
                    pass
            
            conn.commit()
            conn.close()
            return saved
        except:
            return 0

def get_stats():
    """Get database stats"""
    try:
        conn = sqlite3.connect('music_stores.db', timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM records")
        total = cursor.fetchone()[0]
        cursor.execute("SELECT store_name, COUNT(*) as cnt FROM records GROUP BY store_name ORDER BY cnt DESC")
        stores = cursor.fetchall()
        conn.close()
        return total, stores
    except:
        return 0, []

def main():
    print("\n" + "="*70)
    print("SCRAPLING: Maximum Records Extractor (StealthyFetcher Only)")
    print("="*70 + "\n")
    
    initial, _ = get_stats()
    print(f"[START] Database: {initial:,} records\n")
    
    total_extracted = 0
    total_saved = 0
    
    for store_name, base_url, max_pages in STORES:
        records = scrape_store_max(store_name, base_url, max_pages)
        total_extracted += len(records)
        saved = save_all(records)
        total_saved += saved
        time.sleep(0.2)
    
    final, stats = get_stats()
    
    print("\n" + "="*70)
    print("COMPLETE")
    print("="*70)
    print(f"\n[SUMMARY]")
    print(f"   Before:    {initial:,} records")
    print(f"   Extracted: {total_extracted:,}")
    print(f"   Saved:     {total_saved:,}")
    print(f"   After:     {final:,} records")
    print(f"   Progress:  {(final/200000)*100:.2f}% of 200K goal")
    
    print(f"\n[TOP STORES]")
    for store, count in stats[:8]:
        pct = (count/final)*100 if final > 0 else 0
        print(f"   {store}: {count:,} ({pct:.1f}%)")
    
    print(f"\n{'='*70}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[STOPPED] Interrupted")
    except Exception as e:
        print(f"\n[ERROR] {e}")
