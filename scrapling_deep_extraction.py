#!/usr/bin/env python3
"""
SCRAPLING: Deep Pagination Extractor
Aggressive extraction targeting all available pages and AJAX endpoints
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import StealthyFetcher
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

STORES = [
    ("Giora", "https://www.giorarecords.co.il/", 100),
    ("Beatnik", "https://www.beatnik.co.il/", 100),
    ("Shablool", "https://shabloolrecords.co.il/", 100),
    ("The Vinyl Room", "https://thevinylroom.co.il/", 80),
    ("Tav8", "https://www.tav8.co.il/", 60),
    ("Third Ear", "https://www.third-ear.com/", 60),
    ("Taklit House", "https://www.taklithouse.com/", 40),
    ("HaSivoov", "https://hasivoov.co.il/", 60),
    ("Disk Center", "https://www.disccenter.co.il/", 80),
    ("My Records", "https://www.my-records.co.il/", 100),
    ("Vinyl Stock", "https://www.vinylstock.co.il/", 80),
    ("Rolling Dice", "https://www.rollindise.com/", 80),
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
            parts = title.split(sep, 1)
            artist = parts[0].strip()[:100]
            album = parts[1].strip()[:200]
            if len(artist) > 2 and len(album) > 2:
                return artist, album
    
    return "Various Artists", title[:200]

def fetch_page(url):
    """Fetch single page with error handling"""
    try:
        response = StealthyFetcher.fetch(url, impersonate='chrome', timeout=20)
        return response
    except:
        return None

def extract_products_from_page(response, store_name, base_url):
    """Extract all product information from a page"""
    if not response:
        return []
    
    records = []
    
    # Try multiple product selector strategies
    product_selectors = [
        '.product', '.item', '.record', '.woocommerce-loop-product',
        '[class*="product"]', '[class*="item"]', 'li.product',
        '.card', 'div[class*="tile"]', 'article[class*="product"]',
        '.product-box', '.listing-item', '[data-product-id]'
    ]
    
    products = []
    for selector in product_selectors:
        try:
            candidates = response.css(selector)
            if len(candidates) > 5:
                products = candidates
                break
        except:
            pass
    
    if not products:
        return []
    
    for product in products:
        try:
            # Extract title - try multiple methods
            title = None
            
            # Method 1: Direct tag selectors
            for tag_sel in ['h2::text', 'h3::text', 'h4::text', 'h5::text', 'h6::text']:
                try:
                    t = product.css(tag_sel).get()
                    if t and len(t.strip()) > 3:
                        title = t.strip()[:200]
                        break
                except:
                    pass
            
            # Method 2: Class-based selectors
            if not title:
                for class_sel in ['.title::text', '.product-title::text', '.product-name::text', '.name::text']:
                    try:
                        t = product.css(class_sel).get()
                        if t and len(t.strip()) > 3:
                            title = t.strip()[:200]
                            break
                    except:
                        pass
            
            # Method 3: Link text
            if not title or len(title) < 4:
                try:
                    t = product.css('a::text').get()
                    if t and len(t.strip()) > 3:
                        title = t.strip()[:200]
                except:
                    pass
            
            # Method 4: Image alt attribute
            if not title or len(title) < 4:
                try:
                    t = product.css('img::attr(alt)').get()
                    if t and len(t.strip()) > 3:
                        title = t.strip()[:200]
                except:
                    pass
            
            # Method 5: Data attributes
            if not title or len(title) < 4:
                try:
                    t = product.css('[data-title]::attr(data-title)').get()
                    if t and len(t.strip()) > 3:
                        title = t.strip()[:200]
                except:
                    pass
            
            # Method 6: All text concatenated
            if not title or len(title) < 4:
                try:
                    texts = product.css('::text').getall()
                    joined = ' '.join([t.strip() for t in texts if len(t.strip()) > 0])
                    if len(joined) > 3:
                        title = joined[:200]
                except:
                    pass
            
            if not title or len(title) < 3:
                continue
            
            # Extract price
            price = 'N/A'
            for price_sel in ['.price::text', '.cost::text', '.amount::text', '.woocommerce-Price-amount::text', '.product-price::text', '[class*="price"]::text']:
                try:
                    p = product.css(price_sel).get()
                    if p and len(p.strip()) > 0:
                        price = p.strip()[:50]
                        break
                except:
                    pass
            
            # Extract product URL
            product_url = ''
            try:
                links = product.css('a::attr(href)').getall()
                if links:
                    product_url = links[0][:500]
            except:
                pass
            
            artist, album = extract_artist_album(title)
            
            record = {
                'artist': artist,
                'album': album,
                'genre': 'Vinyl',
                'year': None,
                'store_name': store_name,
                'price': price,
                'currency': 'ILS',
                'format': 'LP',
                'condition': 'New',
                'store_url': base_url,
                'product_url': product_url,
                'added_date': datetime.now().isoformat()
            }
            records.append(record)
        except:
            continue
    
    return records

def scrape_store_deep(store_name, base_url, max_pages):
    """Deep scrape store with aggressive pagination"""
    print(f"\n[STORE] {store_name}...", flush=True)
    
    all_records = []
    empty_consecutive = 0
    
    for page_num in range(1, max_pages + 1):
        try:
            # Try multiple URL patterns
            urls_to_try = [
                base_url if page_num == 1 else f"{base_url}?page={page_num}",
                f"{base_url}page/{page_num}/",
                f"{base_url}products/?page={page_num}",
                f"{base_url}?paged={page_num}",
            ]
            
            response = None
            for url in urls_to_try:
                response = fetch_page(url)
                if response:
                    break
            
            if not response:
                empty_consecutive += 1
                if empty_consecutive > 2:
                    print(f"   Page {page_num}: ✗ Failed to fetch after 3 tries", flush=True)
                    break
                continue
            
            # Extract products from this page
            page_records = extract_products_from_page(response, store_name, base_url)
            
            if page_records:
                all_records.extend(page_records)
                print(f"   Page {page_num}: ✓ {len(page_records)} items", flush=True)
                empty_consecutive = 0
            else:
                empty_consecutive += 1
                if empty_consecutive > 1:
                    print(f"   Page {page_num}: ✗ No products found - ending pagination", flush=True)
                    break
                print(f"   Page {page_num}: - No extract (continuing...)", flush=True)
            
            time.sleep(0.1)
            
        except Exception as e:
            print(f"   Page {page_num}: ✗ Error: {str(e)[:40]}", flush=True)
            empty_consecutive += 1
            if empty_consecutive > 2:
                break
    
    print(f"   {'='*50}", flush=True)
    print(f"   Total from {store_name}: {len(all_records)} records", flush=True)
    print(f"   {'='*50}", flush=True)
    
    return all_records

def save_records_batch(records):
    """Save records to database with deduplication"""
    if not records:
        return 0
    
    with db_lock:
        try:
            conn = sqlite3.connect('music_stores.db', timeout=30)
            cursor = conn.cursor()
            
            saved = 0
            duplicates = 0
            
            for record in records:
                try:
                    # Check for duplicate
                    cursor.execute("""
                        SELECT id FROM records 
                        WHERE artist = ? AND album = ? AND store_name = ?
                    """, (record['artist'], record['album'], record['store_name']))
                    
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO records 
                            (artist, album, genre, year, store_name, price, currency, format, condition, store_url, product_url, added_date)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            record['artist'], record['album'], record['genre'], record['year'],
                            record['store_name'], record['price'], record['currency'], record['format'],
                            record['condition'], record['store_url'], record['product_url'], record['added_date']
                        ))
                        saved += 1
                    else:
                        duplicates += 1
                except:
                    pass
            
            conn.commit()
            conn.close()
            
            return saved
        except:
            return 0

def get_final_stats():
    """Get final database stats"""
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
    print("SCRAPLING: Deep Pagination Extractor (Aggressive)")
    print("="*70)
    
    initial_total, _ = get_final_stats()
    print(f"\n[START] Starting with: {initial_total:,} records\n")
    
    total_extracted = 0
    total_saved = 0
    
    # Process each store sequentially with timeouts
    for store_name, base_url, max_pages in STORES:
        try:
            records = scrape_store_deep(store_name, base_url, max_pages)
            total_extracted += len(records)
            saved = save_records_batch(records)
            total_saved += saved
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"Error with {store_name}: {e}")
        
        time.sleep(0.5)
    
    final_total, final_stats = get_final_stats()
    
    print("\n" + "="*70)
    print("FINAL RESULTS")
    print("="*70)
    print(f"\n[STATS] Statistics:")
    print(f"   Before:    {initial_total:,} records")
    print(f"   Extracted: {total_extracted:,} new")
    print(f"   Inserted:  {total_saved:,} unique")
    print(f"   After:     {final_total:,} records")
    print(f"\n[PROGRESS] {final_total:,} / 200,000 ({(final_total/200000)*100:.2f}%)")
    
    print(f"\n[STORES] Top Stores:")
    for store, count in final_stats[:8]:
        print(f"   {store}: {count:,}")
    
    print(f"\n{'='*70}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n[STOPPED] Scraper stopped by user")
    except Exception as e:
        print(f"\n\n[ERROR] Fatal error: {e}")
        import traceback
        traceback.print_exc()
