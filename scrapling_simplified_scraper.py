#!/usr/bin/env python3
"""
Simplified Scrapling-based Multi-Store Vinyl Scraper
Direct scraping with retry logic and database queuing
"""

import sqlite3
import time
from datetime import datetime
from scrapling.fetchers import DynamicFetcher, StealthyFetcher
import json

# Store configurations with better selectors
STORES = [
    {
        "name": "Third Ear",
        "url": "https://www.third-ear.com/",
        "fetcher": "dynamic"
    },
    {
        "name": "Beatnik",
        "url": "https://www.beatnik.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "Shablool",
        "url": "https://shabloolrecords.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "Disk Center",
        "url": "https://www.disccenter.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "Tav8",
        "url": "https://www.tav8.co.il/",
        "fetcher": "stealth"
    },
    {
        "name": "Giora",
        "url": "https://www.giorarecords.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "Taklit House",
        "url": "https://www.taklithouse.com/",
        "fetcher": "dynamic"
    },
    {
        "name": "HaSivoov",
        "url": "https://hasivoov.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "The Vinyl Room",
        "url": "https://thevinylroom.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "My Records",
        "url": "https://www.my-records.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "Vinyl Stock",
        "url": "https://www.vinylstock.co.il/",
        "fetcher": "dynamic"
    },
    {
        "name": "Rolling Dice",
        "url": "https://www.rollindise.com/",
        "fetcher": "stealth"
    }
]

def scrape_store(store_config):
    """Scrape a single store"""
    name = store_config["name"]
    url = store_config["url"]
    fetcher_type = store_config["fetcher"]
    
    print(f"\n🕷️  Scraping {name}...")
    records = []
    
    try:
        # Fetch the page
        if fetcher_type == "dynamic":
            page = DynamicFetcher.fetch(url, headless=True, network_idle=True)
        else:
            page = StealthyFetcher.fetch(url, headless=True)
        
        print(f"   ✓ Fetched page: {len(page.html)} bytes")
        
        # Try multiple product selector strategies
        selectors = [
            '.product', '.item', '.record', '.product-item',
            '[class*="product"]', '[class*="item"]',
            '.woocommerce-loop-product', '.shop-item'
        ]
        
        products = []
        for selector in selectors:
            try:
                products = page.css(selector)
                if len(products) > 5:  # Found reasonable amount
                    print(f"   ✓ Found {len(products)} products with '{selector}'")
                    break
            except:
                continue
        
        if not products:
            print(f"   ⚠️  No products found on {name}")
            return records
        
        # Extract data from products
        for i, product in enumerate(products[:100]):  # Limit to 100 per page for testing
            try:
                # Try to extract text content
                text_content = product.css('::text').getall()
                text = ' '.join([t.strip() for t in text_content if t.strip()])
                
                if len(text) < 5:
                    continue
                
                # Try to get price
                price_text = ''
                price_selectors = ['.price::text', '.cost::text', '[class*="price"]::text']
                for selector in price_selectors:
                    price = product.css(selector).get()
                    if price:
                        price_text = price.strip()
                        break
                
                if not price_text:
                    price_text = "Price N/A"
                
                # Extract title
                title_selectors = ['h2::text', 'h3::text', '.title::text', '.name::text', 'a::text']
                title = ''
                for selector in title_selectors:
                    t = product.css(selector).get()
                    if t and len(t.strip()) > 2:
                        title = t.strip()
                        break
                
                if not title:
                    title = text[:50]  # Use first 50 chars
                
                if title:
                    # Parse artist and album
                    if ' - ' in title:
                        parts = title.split(' - ', 1)
                        artist = parts[0].strip()[:100]
                        album = parts[1].strip()[:100]
                    else:
                        artist = "Various Artists"
                        album = title[:100]
                    
                    records.append({
                        "artist": artist,
                        "album": album,
                        "genre": "Vinyl",
                        "year": None,
                        "store_name": name,
                        "price": price_text[:50],
                        "currency": "ILS",
                        "format": "LP",
                        "condition": "New",
                        "store_url": url,
                        "product_url": url,
                        "added_date": datetime.now().isoformat()
                    })
                    
            except Exception as e:
                continue
        
        print(f"   ✓ Extracted {len(records)} records from {name}")
        return records
    
    except Exception as e:
        print(f"   ❌ Error scraping {name}: {e}")
        return []


def save_to_db(all_records):
    """Save all records to database with retry logic"""
    
    print(f"\n💾 Saving {len(all_records)} records to database...")
    
    # Try to connect with timeout retry
    for attempt in range(5):
        try:
            conn = sqlite3.connect('music_stores.db', timeout=30)
            cursor = conn.cursor()
            
            # Insert records
            inserted = 0
            for record in all_records:
                try:
                    cursor.execute("""
                        INSERT INTO records 
                        (artist, album, genre, year, store_name, price, currency, format, condition, store_url, product_url, added_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        record.get('artist', 'Unknown'),
                        record.get('album', 'Unknown'),
                        record.get('genre', 'Vinyl'),
                        record.get('year'),
                        record.get('store_name'),
                        record.get('price'),
                        record.get('currency', 'ILS'),
                        record.get('format', 'LP'),
                        record.get('condition', 'New'),
                        record.get('store_url'),
                        record.get('product_url'),
                        record.get('added_date')
                    ))
                    inserted += 1
                except Exception as e:
                    print(f"     Error inserting record: {e}")
            
            conn.commit()
            conn.close()
            
            print(f"   ✓ Inserted {inserted} records")
            return inserted
            
        except sqlite3.OperationalError as e:
            if attempt < 4:
                print(f"   ⏳ Database locked, retrying... (attempt {attempt + 1}/5)")
                time.sleep(2 ** attempt)
            else:
                print(f"   ❌ Could not save to database: {e}")
                return 0


def main():
    print("\n" + "="*70)
    print("SCRAPLING: Multi-Store Vinyl Record Scraper")
    print("="*70)
    
    all_records = []
    successful_stores = 0
    
    # Scrape each store
    for store in STORES:
        records = scrape_store(store)
        all_records.extend(records)
        if records:
            successful_stores += 1
        time.sleep(2)  # Be respectful between requests
    
    # Save to database
    if all_records:
        inserted = save_to_db(all_records)
        
        # Get statistics
        try:
            conn = sqlite3.connect('music_stores.db')
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM records")
            total = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
            unique_stores = cursor.fetchone()[0]
            
            cursor.execute("SELECT store_name, COUNT(*) as cnt FROM records GROUP BY store_name ORDER BY cnt DESC")
            store_stats = cursor.fetchall()
            
            conn.close()
            
            print("\n" + "="*70)
            print("SCRAPING COMPLETE")
            print("="*70)
            print(f"\n✅ Scraped {successful_stores}/{len(STORES)} stores")
            print(f"📊 Total records: {total:,}")
            print(f"🏪 Stores with data: {unique_stores}")
            print("\nRecords by store:")
            for store_name, count in store_stats:
                print(f"   • {store_name}: {count}")
            print(f"\n{'='*70}\n")
            
        except Exception as e:
            print(f"Error getting statistics: {e}")
    else:
        print("\n❌ No records were scraped")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️  Scraping interrupted by user")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
