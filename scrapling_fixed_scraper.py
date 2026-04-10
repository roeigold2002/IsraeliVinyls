#!/usr/bin/env python3
"""
Fixed Scrapling Multi-Store Vinyl Scraper
Correct API usage for Response objects
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import DynamicFetcher, StealthyFetcher
from scrapling.parser import Selector

STORES = [
    {"name": "Third Ear", "url": "https://www.third-ear.com/"},
    {"name": "Beatnik", "url": "https://www.beatnik.co.il/"},
    {"name": "Shablool", "url": "https://shabloolrecords.co.il/"},
    {"name": "Disk Center", "url": "https://www.disccenter.co.il/"},
    {"name": "Tav8", "url": "https://www.tav8.co.il/"},
    {"name": "Giora", "url": "https://www.giorarecords.co.il/"},
    {"name": "Taklit House", "url": "https://www.taklithouse.com/"},
    {"name": "HaSivoov", "url": "https://hasivoov.co.il/"},
    {"name": "The Vinyl Room", "url": "https://thevinylroom.co.il/"},
    {"name": "My Records", "url": "https://www.my-records.co.il/"},
    {"name": "Vinyl Stock", "url": "https://www.vinylstock.co.il/"},
    {"name": "Rolling Dice", "url": "https://www.rollindise.com/"}
]

def scrape_store(store_name, url):
    """Scrape a single store using Scrapling"""
    
    print(f"\n🕷️  Scraping {store_name}...")
    records = []
    
    try:
        # Fetch the page with Scrapling
        print(f"   • Fetching {url}...")
        response = DynamicFetcher.fetch(url, headless=True, network_idle=True)
        
        # response is now a Selector object
        print(f"   • Fetched successfully")
        
        # Try to find products with multiple selectors
        product_selectors = [
            '.product', '.item', '.record', '.product-item',
            '[class*="product"]', '[class*="item"]',
            '.woocommerce-loop-product', 'a[href*="product"]',
            'div[class*="card"]', 'li[class*="product"]'
        ]
        
        products = []
        for selector in product_selectors:
            try:
                found = response.css(selector)
                if len(found) > 5:
                    print(f"   • Found {len(found)} products")
                    products = found
                    break
            except:
                pass
        
        if not products:
            print(f"   ⚠️  No products found")
            return []
        
        # Extract data from each product
        for i, product in enumerate(products[:50]):  # Limit to first 50
            try:
                # Get all text content
                text_nodes = product.css('::text').getall()
                text_content = ' '.join([t.strip() for t in text_nodes if t.strip()])
                
                # Get title (try multiple selectors)
                title = ''
                title_selectors = ['h2::text', 'h3::text', 'h4::text', '.title::text', 'a::text']
                for sel in title_selectors:
                    try:
                        t = product.css(sel).get()
                        if t and len(t.strip()) > 3:
                            title = t.strip()[:200]
                            break
                    except:
                        pass
                
                if not title and text_content:
                    title = text_content[:100]
                
                # Get price
                price = 'Price N/A'
                price_selectors = ['.price::text', '.cost::text', '.price-amount::text', '.amount::text']
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
                    if product_url and not product_url.startswith('http'):
                        product_url = url.split('//', 1)[1].split('/')[0]
                        product_url = 'https://' + product_url + product_url
                except:
                    pass
                
                if title and len(title) > 3:
                    # Parse artist and album from title
                    if ' - ' in title:
                        parts = title.split(' - ', 1)
                        artist = parts[0].strip()
                        album = parts[1].strip()
                    elif ' | ' in title:
                        parts = title.split(' | ', 1)
                        artist = parts[0].strip()
                        album = parts[1].strip()
                    else:
                        artist = "Various Artists"
                        album = title
                    
                    record = {
                        'artist': artist[:100],
                        'album': album[:200],
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
                    }
                    records.append(record)
                    
            except Exception as e:
                continue
        
        print(f"   ✓ Extracted {len(records)} records")
        return records
    
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return []


def save_records(all_records):
    """Save records to database"""
    
    print(f"\n💾 Saving {len(all_records)} records...")
    
    for retry in range(3):
        try:
            conn = sqlite3.connect('music_stores.db', timeout=30)
            cursor = conn.cursor()
            
            saved = 0
            for record in all_records:
                try:
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
                except:
                    pass
            
            conn.commit()
            conn.close()
            
            print(f"   ✓ Saved {saved} records")
            return saved
            
        except sqlite3.OperationalError:
            if retry < 2:
                print(f"   ⏳ Retrying... ({retry + 1}/3)")
                time.sleep(2 ** retry)
            else:
                print(f"   ❌ Could not save to database")
                return 0


def main():
    print("\n" + "="*70)
    print("SCRAPLING: Fixed Multi-Store Vinyl Scraper")
    print("="*70)
    
    all_records = []
    
    for store_name, url in [(s['name'], s['url']) for s in STORES]:
        records = scrape_store(store_name, url)
        all_records.extend(records)
        time.sleep(2)  # Be respectful
    
    if all_records:
        save_records(all_records)
        
        # Get final stats
        try:
            conn = sqlite3.connect('music_stores.db')
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM records")
            total = cursor.fetchone()[0]
            
            cursor.execute("SELECT store_name, COUNT(*) FROM records GROUP BY store_name ORDER BY COUNT(*) DESC")
            stats = cursor.fetchall()
            
            print("\n" + "="*70)
            print("COMPLETE")
            print("="*70)
            print(f"\n✅ Total records: {total:,}")
            print("\nRecords by store:")
            for store, count in stats:
                print(f"   • {store}: {count}")
            print(f"\n{'='*70}\n")
            
            conn.close()
        except:
            pass
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
