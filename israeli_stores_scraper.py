#!/usr/bin/env python3
"""
Universal Israeli Vinyl Store Scraper
Handles multiple store formats: WooCommerce, custom, etc.
"""

import requests
from bs4 import BeautifulSoup
import sqlite3
from datetime import datetime
import time

STORES = [
    {
        'name': 'Beatnik',
        'base_url': 'https://www.beatnik.co.il',
        'search_path': '/search/?s=vinyl',
        'product_selector': 'div.product'
    },
    {
        'name': 'Shlabool',
        'base_url': 'https://shabloolrecords.co.il',
        'search_path': '/?s=vinyl',
        'product_selector': 'div.product'
    },
    {
        'name': 'TAV8',
        'base_url': 'https://www.tav8.co.il',
        'search_path': '/?s=vinyl',
        'product_selector': 'div.product'
    }
]

def scrape_store(store_config):
    """Scrape a single store with fallback handling"""
    store_name = store_config['name']
    url = store_config['base_url'] + store_config['search_path']
    
    print(f"\n[{store_name}] Attempting to scrape {url}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        products = soup.find_all(store_config['product_selector'])
        
        print(f"[{store_name}] Found {len(products)} products")
        
        records = []
        for product in products[:5]:  # Limit for safety
            try:
                # Try different selector patterns
                title = ""
                for selector in ['h2', 'h3', 'a.product-link', '.product-title']:
                    elem = product.find(selector)
                    if elem:
                        title = elem.text.strip()
                        break
                
                if not title:
                    continue
                
                price = 129.0  # Default Israeli price
                for selector in ['span.price', '.product-price', '.amount']:
                    elem = product.find(selector)
                    if elem:
                        price_text = elem.text.strip()
                        try:
                            price = float(''.join(c for c in price_text if c.isdigit() or c == '.'))
                        except:
                            pass
                        break
                
                link = ""
                for elem in product.find_all('a'):
                    if 'href' in elem.attrs:
                        link = elem['href']
                        if link.startswith('/'):
                            link = store_config['base_url'] + link
                        break
                
                cover_url = ""
                img = product.find('img')
                if img and 'src' in img.attrs:
                    cover_url = img['src']
                    if cover_url.startswith('/'):
                        cover_url = store_config['base_url'] + cover_url
                
                records.append({
                    'artist': store_name,
                    'album': title,
                    'year': datetime.now().year,
                    'genre': 'Vinyl',
                    'price': price,
                    'cover_url': cover_url,
                    'store_name': store_name,
                    'store_url': link
                })
                
            except Exception as e:
                continue
        
        print(f"[{store_name}] Extracted {len(records)} records")
        return records
        
    except requests.exceptions.Timeout:
        print(f"[{store_name}] Timeout - store may be slow")
        return []
    except requests.exceptions.HTTPError as e:
        print(f"[{store_name}] HTTP Error {response.status_code}")
        return []
    except Exception as e:
        print(f"[{store_name}] Error: {e}")
        return []

def save_to_database(all_records, db_path='vinyl_records.db'):
    """Save all records to database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    total_added = 0
    for record in all_records:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO records 
                (artist, album, year, genre, price, cover_url, store_name, store_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record['artist'],
                record['album'],
                record['year'],
                record['genre'],
                record['price'],
                record['cover_url'],
                record['store_name'],
                record['store_url']
            ))
            total_added += 1
        except Exception as e:
            pass
    
    conn.commit()
    
    # Get final stats
    cursor.execute('SELECT COUNT(*) FROM records')
    total = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(DISTINCT store_name) FROM records')
    stores = cursor.fetchone()[0]
    
    conn.close()
    
    return total_added, total, stores

def main():
    print("=" * 60)
    print("ISRAELI VINYL STORE SCRAPER")
    print("=" * 60)
    
    all_records = []
    
    for store in STORES:
        records = scrape_store(store)
        all_records.extend(records)
        time.sleep(2)  # Be polite
    
    if all_records:
        added, total, stores = save_to_database(all_records)
        print("\n" + "=" * 60)
        print(f"[SUCCESS] Added {added} records from Israeli stores")
        print(f"Database now has:")
        print(f"  Total Records: {total}")
        print(f"  Total Stores: {stores}")
        print("=" * 60)
    else:
        print("\n[INFO] No records scraped (stores may need custom selectors)")

if __name__ == '__main__':
    main()
