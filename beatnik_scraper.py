#!/usr/bin/env python3
"""
Beatnik Records Scraper
Scrapes vinyl records from https://www.beatnik.co.il/
"""

import requests
from bs4 import BeautifulSoup
import sqlite3
import time

BEATNIK_URL = "https://www.beatnik.co.il/product-category/vinyl/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

def scrape_beatnik():
    """Scrape vinyl records from Beatnik"""
    print("\n[BEATNIK] Starting scrape of Beatnik Records...")
    
    headers = {'User-Agent': USER_AGENT}
    records = []
    
    try:
        response = requests.get(BEATNIK_URL, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find all product containers (WooCommerce standard)
        products = soup.find_all('div', class_='product')
        print(f"[BEATNIK] Found {len(products)} products on page")
        
        for product in products[:10]:  # Limit to 10 for testing
            try:
                # Extract data
                title_elem = product.find('h2', class_='woocommerce-loop-product__title')
                title = title_elem.text.strip() if title_elem else "Unknown"
                
                price_elem = product.find('span', class_='woocommerce-Price-amount')
                price_text = price_elem.text.strip() if price_elem else "0"
                price = float(''.join(filter(lambda x: x.isdigit() or x == '.', price_text)))
                
                link_elem = product.find('a', class_='woocommerce-loop-product__link')
                link = link_elem['href'] if link_elem else ""
                
                image_elem = product.find('img')
                cover_url = image_elem['src'] if image_elem else ""
                
                records.append({
                    'artist': 'Beatnik',
                    'album': title,
                    'year': 2024,
                    'genre': 'Vinyl',
                    'price': price,
                    'cover_url': cover_url,
                    'store_name': 'Beatnik',
                    'product_url': link,
                    'store_url': 'https://www.beatnik.co.il/'
                })
                
            except Exception as e:
                print(f"[BEATNIK] Error parsing product: {e}")
                continue
        
        print(f"[BEATNIK] Successfully extracted {len(records)} records")
        return records
        
    except Exception as e:
        print(f"[BEATNIK] Scrape failed: {e}")
        return []

def save_to_database(records, db_path='vinyl_records.db'):
    """Save records to database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    added = 0
    for record in records:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO records 
                (artist, album, year, genre, price, cover_url, store_name, product_url, store_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record['artist'],
                record['album'],
                record['year'],
                record['genre'],
                record['price'],
                record['cover_url'],
                record['store_name'],
                record['product_url'],
                record['store_url']
            ))
            added += 1
        except Exception as e:
            print(f"[DB] Error inserting record: {e}")
    
    conn.commit()
    conn.close()
    
    return added

if __name__ == '__main__':
    records = scrape_beatnik()
    if records:
        added = save_to_database(records)
        print(f"\n[SUCCESS] Added {added} records from Beatnik")
    else:
        print("\n[FAILED] No records scraped")
