#!/usr/bin/env python3
"""
SCRAPLING: Ultra-Fast Concurrent Vinyl Scraper
Parallel scraping of all 12 Israeli stores with aggressive pagination
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import StealthyFetcher
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

STORES = [
    "Giora|https://www.giorarecords.co.il/",
    "Beatnik|https://www.beatnik.co.il/",
    "Shablool|https://shabloolrecords.co.il/",
    "The Vinyl Room|https://thevinylroom.co.il/",
    "Tav8|https://www.tav8.co.il/",
    "Third Ear|https://www.third-ear.com/",
    "Taklit House|https://www.taklithouse.com/",
    "HaSivoov|https://hasivoov.co.il/",
    "Disk Center|https://www.disccenter.co.il/",
    "My Records|https://www.my-records.co.il/",
    "Vinyl Stock|https://www.vinylstock.co.il/",
    "Rolling Dice|https://www.rollindise.com/"
]

db_lock = threading.Lock()

def extract_artist_album(title):
    """Parse artist and album"""
    if not title or len(title) < 3:
        return "Various Artists", title or "Unknown"
    title = title.strip()
    seps = [' - ', ' | ', ' — ', ' • ', '‐ ', ' – ']
    for sep in seps:
        if sep in title:
            p = title.split(sep, 1)
            a, b = p[0].strip()[:100], p[1].strip()[:200]
            if len(a) > 2 and len(b) > 2:
                return a, b
    return "Various Artists", title[:200]

def scrape_page(store_name, url, page_num):
    """Scrape single page"""
    try:
        fetch_url = url if page_num == 1 else f"{url}?page={page_num}"
        response = StealthyFetcher.fetch(fetch_url, impersonate='chrome')
        
        products = []
        selectors = ['.product', '.item', '.record', '[class*="product"]', 'li.product', '.card']
        for sel in selectors:
            try:
                found = response.css(sel)
                if len(found) > 3:
                    products = found
                    break
            except:
                pass
        
        if not products:
            return []
        
        records = []
        for prod in products:
            try:
                title = None
                for sel in ['h2::text', 'h3::text', 'a::text', '.title::text']:
                    try:
                        t = prod.css(sel).get()
                        if t and len(t.strip()) > 3:
                            title = t.strip()[:200]
                            break
                    except:
                        pass
                
                if not title:
                    try:
                        texts = prod.css('::text').getall()
                        title = ' '.join([t.strip() for t in texts if len(t.strip()) > 3])[:200]
                    except:
                        pass
                
                if title and len(title) > 3:
                    artist, album = extract_artist_album(title)
                    price = 'N/A'
                    try:
                        for sel in ['.price::text', '.cost::text', '.amount::text']:
                            p = prod.css(sel).get()
                            if p:
                                price = p.strip()[:50]
                                break
                    except:
                        pass
                    
                    product_url = ''
                    try:
                        product_url = prod.css('a::attr(href)').get() or ''
                    except:
                        pass
                    
                    records.append({
                        'artist': artist,
                        'album': album,
                        'genre': 'Vinyl',
                        'year': None,
                        'store_name': store_name,
                        'price': price,
                        'currency': 'ILS',
                        'format': 'LP',
                        'condition': 'New',
                        'store_url': url,
                        'product_url': product_url[:500],
                        'added_date': datetime.now().isoformat()
                    })
            except:
                continue
        
        return records
    except:
        return []

def scrape_store_concurrent(store_name, base_url, max_pages=30):
    """Scrape store with concurrent page fetching"""
    print(f"   {store_name}...", end=" ", flush=True)
    
    all_records = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = []
        for page in range(1, max_pages + 1):
            future = executor.submit(scrape_page, store_name, base_url, page)
            futures.append((page, future))
        
        for page, future in futures:
            try:
                records = future.result(timeout=20)
                if records:
                    all_records.extend(records)
                elif page > 1:
                    break
            except:
                if page > 1:
                    break
    
    print(f"✓ {len(all_records)}")
    return all_records

def save_batch(records):
    """Thread-safe batch insert"""
    if not records:
        return 0
    
    with db_lock:
        try:
            conn = sqlite3.connect('music_stores.db', timeout=30)
            cursor = conn.cursor()
            
            saved = 0
            for r in records:
                try:
                    cursor.execute("""SELECT id FROM records WHERE artist=? AND album=? AND store_name=?""",
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
        cursor.execute("SELECT store_name, COUNT(*) FROM records GROUP BY store_name ORDER BY COUNT(*) DESC")
        stores = cursor.fetchall()
        conn.close()
        return total, stores
    except:
        return 0, []

def main():
    print("\n" + "="*70)
    print("SCRAPLING: Ultra-Fast Concurrent Scraper")
    print("="*70)
    
    initial, _ = get_stats()
    print(f"\nStarting: {initial:,} records\n")
    
    total_saved = 0
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {}
        for store_data in STORES:
            name, url = store_data.split('|')
            future = executor.submit(scrape_store_concurrent, name, url, max_pages=50)
            futures[future] = name
        
        for future in as_completed(futures):
            try:
                records = future.result(timeout=300)
                saved = save_batch(records)
                total_saved += saved
            except:
                pass
    
    final, stats = get_stats()
    
    print("\n" + "="*70)
    print("COMPLETE")
    print("="*70)
    print(f"\nResults:")
    print(f"   Before: {initial:,}")
    print(f"   Added: {total_saved:,}")
    print(f"   After: {final:,}")
    print(f"   Progress: {(final/200000)*100:.1f}% of 200K goal\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️  Stopped")
    except Exception as e:
        print(f"\n❌ {e}")

