#!/usr/bin/env python3
"""
Scrapling Multi-Store Vinyl Scraper with Pagination
Maximizes record extraction from all 12 Israeli vinyl stores
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import DynamicFetcher, StealthyFetcher
from scrapling.parser import Selector
import re

STORES = [
    {"name": "Giora", "url": "https://www.giorarecords.co.il/", "paginate": True},
    {"name": "Beatnik", "url": "https://www.beatnik.co.il/", "paginate": True},
    {"name": "Shablool", "url": "https://shabloolrecords.co.il/", "paginate": True},
    {"name": "The Vinyl Room", "url": "https://thevinylroom.co.il/", "paginate": True},
    {"name": "Tav8", "url": "https://www.tav8.co.il/", "paginate": True},
    {"name": "Third Ear", "url": "https://www.third-ear.com/", "paginate": True},
    {"name": "Taklit House", "url": "https://www.taklithouse.com/", "paginate": True},
    {"name": "HaSivoov", "url": "https://hasivoov.co.il/", "paginate": True},
    {"name": "Disk Center", "url": "https://www.disccenter.co.il/", "paginate": True},
    {"name": "My Records", "url": "https://www.my-records.co.il/", "paginate": True},
    {"name": "Vinyl Stock", "url": "https://www.vinylstock.co.il/", "paginate": True},
    {"name": "Rolling Dice", "url": "https://www.rollindise.com/", "paginate": True}
]

def extract_artist_album(title):
    """Parse artist and album from product title"""
    if not title or len(title) < 3:
        return "Various Artists", title or "Unknown"
    
    title = title.strip()
    
    # Common separators
    separators = [' - ', ' | ', ' — ', ' • ', ' / ']
    for sep in separators:
        if sep in title:
            parts = title.split(sep, 1)
            artist = parts[0].strip()[:100]
            album = parts[1].strip()[:200]
            if len(artist) > 2 and len(album) > 2:
                return artist, album
    
    # If no separator, use title as album, default artist
    return "Various Artists", title[:200]

def scrape_store_pages(store_name, base_url, max_pages=5):
    """Scrape multiple pages from a store"""
    
    print(f"\n🕷️  Scraping {store_name}...")
    all_records = []
    
    # Try different pagination patterns
    page_patterns = [
        lambda p: f"{base_url}?page={p}",
        lambda p: f"{base_url}page/{p}/",
        lambda p: f"{base_url}products/?page={p}",
        lambda p: f"{base_url}?paged={p}",
    ]
    
    for page_num in range(1, max_pages + 1):
        try:
            # Try first URL pattern
            if page_num == 1:
                url = base_url
            else:
                url = page_patterns[0](page_num)
            
            print(f"   • Fetching page {page_num}: {url[:60]}...")
            
            response = DynamicFetcher.fetch(url, headless=True, network_idle=True, timeout=15)
            
            # Find products
            product_selectors = [
                '.product', '.item', '.record', '.product-item',
                '[class*="product"]', '[class*="item"]',
                '.woocommerce-loop-product', 'li.product',
                'div[class*="card"]', '.product-box'
            ]
            
            products = []
            for selector in product_selectors:
                try:
                    found = response.css(selector)
                    if len(found) > 3:
                        products = found
                        print(f"      Found {len(found)} products")
                        break
                except:
                    pass
            
            if not products:
                print(f"      No products found - reached end of pages")
                break
            
            # Extract data from products
            page_records = []
            for product in products:
                try:
                    # Get title
                    title = ''
                    title_selectors = ['h2::text', 'h3::text', 'h4::text', '.title::text', 'a::text', '.product-title::text']
                    for sel in title_selectors:
                        try:
                            t = product.css(sel).get()
                            if t and len(t.strip()) > 3:
                                title = t.strip()[:200]
                                break
                        except:
                            pass
                    
                    # Get price
                    price = 'N/A'
                    price_selectors = ['.price::text', '.cost::text', '.price-amount::text', '.amount::text', '.woocommerce-Price-amount::text']
                    for sel in price_selectors:
                        try:
                            p = product.css(sel).get()
                            if p:
                                price = p.strip()[:50]
                                break
                        except:
                            pass
                    
                    # Get product URL
                    product_url = ''
                    try:
                        product_url = product.css('a::attr(href)').get() or ''
                    except:
                        pass
                    
                    if title and len(title) > 3:
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
                            'product_url': product_url[:500],
                            'added_date': datetime.now().isoformat()
                        }
                        page_records.append(record)
                
                except:
                    continue
            
            if page_records:
                all_records.extend(page_records)
                print(f"      Extracted {len(page_records)} records from page {page_num}")
            else:
                print(f"      No records extracted from page {page_num}")
            
            time.sleep(0.5)  # Be respectful
            
        except Exception as e:
            print(f"      Error on page {page_num}: {str(e)[:50]}")
            break
    
    print(f"   ✓ Total from {store_name}: {len(all_records)} records")
    return all_records

def save_records(all_records):
    """Save records to database"""
    
    if not all_records:
        print("No records to save")
        return 0
    
    print(f"\n💾 Saving {len(all_records)} records...")
    
    for retry in range(3):
        try:
            conn = sqlite3.connect('music_stores.db', timeout=30)
            cursor = conn.cursor()
            
            saved = 0
            duplicates = 0
            
            for record in all_records:
                try:
                    # Check for duplicates
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
                            record['artist'],
                            record['album'],
                            record['genre'],
                            record['year'],
                            record['store_name'],
                            record['price'],
                            record['currency'],
                            record['format'],
                            record['condition'],
                            record['store_url'],
                            record['product_url'],
                            record['added_date']
                        ))
                        saved += 1
                    else:
                        duplicates += 1
                except:
                    pass
            
            conn.commit()
            conn.close()
            
            print(f"   ✓ Saved {saved} records ({duplicates} duplicates skipped)")
            return saved
            
        except sqlite3.OperationalError:
            if retry < 2:
                print(f"   ⏳ Retrying... ({retry + 1}/3)")
                time.sleep(2 ** retry)
            else:
                print(f"   ❌ Could not save to database")
                return 0

def get_current_stats():
    """Get database statistics"""
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
    print("SCRAPLING: Multi-Page Vinyl Scraper with Pagination")
    print("="*70)
    
    initial_total, _ = get_current_stats()
    print(f"\nStarting with {initial_total:,} records in database")
    
    all_records = []
    
    for store_info in STORES:
        records = scrape_store_pages(store_info['name'], store_info['url'], max_pages=3)
        all_records.extend(records)
        time.sleep(1)  # Be respectful
    
    if all_records:
        saved = save_records(all_records)
        
        # Get final stats
        total, stats = get_current_stats()
        
        print("\n" + "="*70)
        print("PAGINATION SCRAPE COMPLETE")
        print("="*70)
        print(f"\n📊 Database Statistics:")
        print(f"   Before: {initial_total:,} records")
        print(f"   Added: {saved} new records")
        print(f"   Total: {total:,} records")
        
        print(f"\n📈 Records by store:")
        for store, count in stats:
            print(f"   • {store}: {count}")
        
        print(f"\n{'='*70}\n")
    else:
        print("\n❌ No records scraped")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️  Stopped")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
