#!/usr/bin/env python3
"""
Master Vinyl Store Scraper using Scrapling
Scrapes all 12 Israeli vinyl record stores
No existing scripts - using Scrapling only
"""

import sqlite3
import json
from datetime import datetime
from scrapling.spiders import Spider, Request, Response
from scrapling.fetchers import DynamicSession, StealthySession
import asyncio


class VinylStoreScraper(Spider):
    """Master spider for all Israeli vinyl record stores"""
    
    name = "vinyl_stores"
    
    # All 12 Israeli vinyl stores
    stores_config = {
        "third_ear": {
            "name": "Third Ear",
            "url": "https://www.third-ear.com/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "beatnik": {
            "name": "Beatnik",
            "url": "https://www.beatnik.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "shablool": {
            "name": "Shablool",
            "url": "https://shabloolrecords.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "disccenter": {
            "name": "Disk Center",
            "url": "https://www.disccenter.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "tav8": {
            "name": "Tav8",
            "url": "https://www.tav8.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "giora": {
            "name": "Giora",
            "url": "https://www.giorarecords.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "taklithouse": {
            "name": "Taklit House",
            "url": "https://www.taklithouse.com/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "hasivoov": {
            "name": "HaSivoov",
            "url": "https://hasivoov.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "thevinylroom": {
            "name": "The Vinyl Room",
            "url": "https://thevinylroom.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "myrecords": {
            "name": "My Records",
            "url": "https://www.my-records.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "vinylstock": {
            "name": "Vinyl Stock",
            "url": "https://www.vinylstock.co.il/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        },
        "rollindice": {
            "name": "Rolling Dice",
            "url": "https://www.rollindise.com/",
            "product_selector": ".product, .item, .record, [class*='product']",
            "pagination": True
        }
    }
    
    start_urls = [config["url"] for config in stores_config.values()]
    concurrent_requests = 4
    download_delay = 2  # Be respectful
    
    def configure_sessions(self, manager):
        """Configure session types"""
        # Use dynamic sessions for JavaScript-heavy sites
        manager.add("dynamic", 
                   DynamicSession(headless=True, network_idle=True),
                   lazy=True)
        # Use stealth sessions for anti-bot sites
        manager.add("stealth",
                   StealthySession(headless=True),
                   lazy=True)
    
    async def parse(self, response: Response):
        """Parse store pages and extract product data"""
        
        # Determine which store we're scraping
        current_url = response.url
        store_key = None
        store_info = None
        
        for key, config in self.stores_config.items():
            if key in current_url or config["url"]in current_url:
                store_key = key
                store_info = config
                break
        
        if not store_info:
            print(f"⚠️  Could not identify store from URL: {current_url}")
            return
        
        print(f"\n📖 Parsing {store_info['name']}...")
        
        # Find all product elements
        products = response.css(store_info['product_selector'])
        records_found = 0
        
        for product in products:
            try:
                # Extract product information with flexible selectors
                title = (product.css('h2::text, h3::text, .title::text, .name::text, .product-name::text').get() or
                        product.css('a::text').get() or
                        product.css('span::text').get() or '').strip()
                
                price = (product.css('.price::text, .cost::text, [class*="price"]::text').get() or
                        product.css('span::text').getall()[-1] if product.css('span::text').getall() else '').strip()
                
                description = (product.css('.description::text, .details::text, p::text').get() or '').strip()
                product_url = (product.css('a::attr(href)').get() or '').strip()
                
                if title and price:
                    records_found += 1
                    
                    # Parse artist and album from title
                    parts = title.split('-') if '-' in title else [title]
                    artist = parts[0].strip() if len(parts) > 1 else "Unknown"
                    album = parts[1].strip() if len(parts) > 1 else title.strip()
                    
                    yield {
                        "artist": artist,
                        "album": album,
                        "genre": "Vinyl Records",  # Default,can be enhanced
                        "year": None,
                        "store_name": store_info["name"],
                        "price": price,
                        "currency": "ILS",
                        "format": "LP",  # default
                        "condition": "New",  # Default
                        "store_url": store_info["url"],
                        "product_url": product_url if product_url.startswith('http') else store_info["url"] + product_url if product_url else store_info["url"],
                        "added_date": datetime.now().isoformat()
                    }
            
            except Exception as e:
                print(f"   Error parsing product: {e}")
                continue
        
        print(f"   ✓ Found {records_found} records on this page")
        
        # Follow pagination if available
        if store_info.get('pagination'):
            next_page = response.css('a[rel="next"]::attr(href), .next a::attr(href), [class*="next"]::attr(href)').get()
            if next_page:
                next_url = next_page if next_page.startswith('http') else store_info["url"] + next_page
                yield Request(next_url, callback=self.parse)


def scrape_and_save():
    """Run scraper and save results to database"""
    
    print("\n" + "="*70)
    print("SCRAPLING: Multi-Store Vinyl Scraper")
    print("="*70)
    
    # Initialize database
    conn = sqlite3.connect('music_stores.db')
    cursor = conn.cursor()
    
    # Clear existing records to rebuild
    cursor.execute("DELETE FROM records")
    print("\n✓ Cleared existing records")
    
    # Run the spider
    spider = VinylStoreScraper()
    result = spider.start()
    
    # Insert scraped items into database
    inserted = 0
    skipped = 0
    
    print(f"\n📊 Saving {len(result.items)} records to database...")
    
    for item in result.items:
        try:
            cursor.execute("""
                INSERT INTO records 
                (artist, album, genre, year, store_name, price, currency, format, condition, store_url, product_url, added_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item.get('artist'),
                item.get('album'),
                item.get('genre'),
                item.get('year'),
                item.get('store_name'),
                item.get('price'),
                item.get('currency'),
                item.get('format'),
                item.get('condition'),
                item.get('store_url'),
                item.get('product_url'),
                item.get('added_date')
            ))
            inserted += 1
        except Exception as e:
            print(f"   Error inserting record: {e}")
            skipped += 1
    
    conn.commit()
    
    # Get statistics
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
    stores = cursor.fetchone()[0]
    
    cursor.execute("SELECT store_name, COUNT(*) as cnt FROM records GROUP BY store_name ORDER BY cnt DESC")
    store_counts = cursor.fetchall()
    
    conn.close()
    
    # Print summary
    print("\n" + "="*70)
    print("SCRAPING COMPLETE")
    print("="*70)
    print(f"\n✓ Inserted: {inserted} records")
    print(f"✗ Skipped: {skipped} records")
    print(f"📊 Total in DB: {total:,} records")
    print(f"🏪 From {stores} stores:")
    
    for store, count in store_counts:
        print(f"   • {store}: {count} records")
    
    print(f"\n{'='*70}\n")
    
    return total


if __name__ == "__main__":
    try:
        total_records = scrape_and_save()
        print(f"✅ Successfully rebuilt database with {total_records:,} records!")
    except KeyboardInterrupt:
        print("\n⏹️  Scraping paused by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
