#!/usr/bin/env python3
"""
Advanced Resilient Scrapling Scraper with Adaptive Selectors
Handles varied HTML structures from 12 Israeli vinyl stores
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import StealthyFetcher
import re

STORES = [
    {"name": "Giora", "url": "https://www.giorarecords.co.il/"},
    {"name": "Beatnik", "url": "https://www.beatnik.co.il/"},
    {"name": "Shablool", "url": "https://shabloolrecords.co.il/"},
    {"name": "The Vinyl Room", "url": "https://thevinylroom.co.il/"},
    {"name": "Tav8", "url": "https://www.tav8.co.il/"},
    {"name": "Third Ear", "url": "https://www.third-ear.com/"},
    {"name": "Taklit House", "url": "https://www.taklithouse.com/"},
    {"name": "HaSivoov", "url": "https://hasivoov.co.il/"},
    {"name": "Disk Center", "url": "https://www.disccenter.co.il/"},
    {"name": "My Records", "url": "https://www.my-records.co.il/"},
    {"name": "Vinyl Stock", "url": "https://www.vinylstock.co.il/"},
    {"name": "Rolling Dice", "url": "https://www.rollindise.com/"}
]

def extract_artist_album(title):
    """Parse artist and album from product title"""
    if not title or len(title) < 3:
        return "Various Artists", title or "Unknown"
    
    title = title.strip()
    separators = [' - ', ' | ', ' — ', ' • ', ' / ', ' / ', '‐ ', ' – ']
    
    for sep in separators:
        if sep in title:
            parts = title.split(sep, 1)
            artist = parts[0].strip()[:100]
            album = parts[1].strip()[:200]
            if len(artist) > 2 and len(album) > 2:
                return artist, album
    
    return "Various Artists", title[:200]

def try_get_text(selector, methods):
    """Try multiple methods to extract text from selector"""
    if not selector:
        return None
    
    for method_str in methods:
        try:
            if '::' in method_str:
                result = selector.css(method_str).get()
            else:
                result = getattr(selector, method_str, lambda: None)()
            
            if result and isinstance(result, str):
                text = result.strip()
                if len(text) > 2:
                    return text[:200]
        except:
            pass
    
    try:
        # Fallback: get all text
        text_nodes = selector.css('::text').getall()
        text = ' '.join([t.strip() for t in text_nodes if t.strip()])
        if len(text) > 2:
            return text[:200]
    except:
        pass
    
    return None

def scrape_store_adaptive(store_name, base_url, max_pages=10):
    """Adaptively scrape store with multiple selector strategies"""
    
    print(f"\n🕷️  {store_name}...")
    all_records = []
    
    for page_num in range(1, max_pages + 1):
        try:
            url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
            
            print(f"   📄 Page {page_num}...", end=" ")
            response = StealthyFetcher.fetch(url, impersonate='chrome')
            
            # Multiple selector strategies for finding products
            product_selectors = [
                '.product', '.item', '.record', '.product-item', '.product-box',
                '[class*="product"]:not(style)', '[class*="item"]:not(style)',
                '.woocommerce-loop-product', 'li.product', 'article.product',
                '.card', 'div[class*="tile"]', '.listing-item'
            ]
            
            products = []
            for selector in product_selectors:
                try:
                    found = response.css(selector)
                    if len(found) > 3:
                        products = found
                        break
                except:
                    pass
            
            if not products or len(products) < 3:
                print("✗ No products")
                break
            
            print(f"✓ {len(products)} items", end=" | ")
            
            # Extract from products with multiple fallback strategies
            page_records = []
            for product in products:
                try:
                    # Strategy 1: Direct title extraction
                    title = try_get_text(product, [
                        'h2::text', 'h3::text', 'h4::text', 'h5::text',
                        '.title::text', 'a::text', '.product-title::text',
                        '.product-name::text', '.name::text',
                        'text_content'
                    ])
                    
                    # Strategy 2: Get from link text
                    if not title or len(title) < 4:
                        try:
                            title = product.css('a').css('::text').get()
                            if title:
                                title = title.strip()[:200]
                        except:
                            pass
                    
                    # Strategy 3: Get from alt text or data attributes
                    if not title or len(title) < 4:
                        try:
                            title = product.css('img::attr(alt)').get()
                            if title:
                                title = title.strip()[:200]
                        except:
                            pass
                    
                    # Strategy 4: Last resort - get all text
                    if not title or len(title) < 4:
                        try:
                            text_nodes = product.css('::text').getall()
                            texts = [t.strip() for t in text_nodes if len(t.strip()) > 3]
                            if texts:
                                title = texts[0][:200]
                        except:
                            pass
                    
                    if not title or len(title) < 3:
                        continue
                    
                    # Price extraction
                    price = 'N/A'
                    price_methods = [
                        '.price::text', '.cost::text', '.amount::text',
                        '.woocommerce-Price-amount::text', '.product-price::text',
                        '[class*="price"]::text', 'span[class*="price"]::text'
                    ]
                    
                    for method in price_methods:
                        try:
                            p = product.css(method).get()
                            if p and len(p.strip()) > 0:
                                price = p.strip()[:50]
                                break
                        except:
                            pass
                    
                    # Product URL
                    product_url = ''
                    try:
                        product_url = product.css('a::attr(href)').get() or ''
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
                        'product_url': product_url[:500],
                        'added_date': datetime.now().isoformat()
                    }
                    page_records.append(record)
                
                except:
                    pass
            
            extracted = len(page_records)
            print(f"{extracted} extracted")
            
            if extracted > 0:
                all_records.extend(page_records)
            else:
                # If nothing extracted, try more pages (might be caching issue)
                if page_num > 2:
                    break
            
            time.sleep(0.2)
            
        except Exception as e:
            print(f"Error: {str(e)[:40]}")
            break
    
    return all_records

def save_records(all_records):
    """Save records with duplicate avoidance"""
    
    if not all_records:
        return 0
    
    print(f"   💾 Saving {len(all_records)} records...", end=" ")
    
    try:
        conn = sqlite3.connect('music_stores.db', timeout=30)
        cursor = conn.cursor()
        
        saved = 0
        duplicates = 0
        
        for record in all_records:
            try:
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
                        record['artist'], record['album'], record['genre'],
                        record['year'], record['store_name'], record['price'],
                        record['currency'], record['format'], record['condition'],
                        record['store_url'], record['product_url'], record['added_date']
                    ))
                    saved += 1
                else:
                    duplicates += 1
            except:
                pass
        
        conn.commit()
        conn.close()
        
        print(f"✓ {saved} new ({duplicates} dupes)")
        return saved
        
    except Exception as e:
        print(f"Failed: {e}")
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
    print("SCRAPLING: Advanced Adaptive Multi-Store Scraper")
    print("="*70)
    
    initial, _ = get_stats()
    print(f"\nStarting: {initial:,} records\n")
    
    total_extracted = 0
    total_saved = 0
    
    for store_info in STORES:
        records = scrape_store_adaptive(store_info['name'], store_info['url'], max_pages=15)
        total_extracted += len(records)
        saved = save_records(records)
        total_saved += saved
        time.sleep(0.3)
    
    final, stats = get_stats()
    
    print("\n" + "="*70)
    print("COMPLETE")
    print("="*70)
    print(f"\n📊 Results:")
    print(f"   Before: {initial:,}")
    print(f"   Extracted: {total_extracted:,}")
    print(f"   New: {total_saved:,}")
    print(f"   Final: {final:,}")
    
    if total_saved > 100:
        print(f"\n📈 Progress: {final:,} total records ({(final/200000)*100:.1f}% of 200K goal)")
    
    print(f"\n{'='*70}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️  Stopped")
    except Exception as e:
        print(f"\n❌ {e}")
