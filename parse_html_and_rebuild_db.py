#!/usr/bin/env python3
"""
Parse manually scraped HTML pages from vinyl stores and create a new comprehensive database.
Handles HTML parsing with multiple fallback strategies for different store formats.
"""

import sqlite3
import os
from pathlib import Path
from bs4 import BeautifulSoup
import json
from datetime import datetime
import re

class VinylRecordParser:
    def __init__(self, db_path='music_stores_new.db'):
        """Initialize parser and create new database"""
        self.db_path = db_path
        self.conn = None
        self.cursor = None
        self.records_by_store = {}
        self.total_records = 0
        self.init_database()
    
    def init_database(self):
        """Create new database with proper schema"""
        # Delete old database if exists
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
            print(f"Deleted old database: {self.db_path}")
        
        # Create new database
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        
        self.cursor.execute('''
            CREATE TABLE records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist TEXT,
                album TEXT,
                genre TEXT,
                year INTEGER,
                store_name TEXT,
                price TEXT,
                currency TEXT,
                format TEXT,
                condition TEXT,
                store_url TEXT,
                product_url TEXT,
                added_date TEXT
            )
        ''')
        
        # Create indexes
        self.cursor.execute('CREATE INDEX idx_artist ON records(artist)')
        self.cursor.execute('CREATE INDEX idx_store ON records(store_name)')
        self.cursor.execute('CREATE INDEX idx_album ON records(album)')
        
        self.conn.commit()
        print(f"Created new database: {self.db_path}")
    
    def parse_store_pages(self, store_name, pages_folder):
        """Parse all HTML pages for a store"""
        print(f"\n{'='*60}")
        print(f"Parsing: {store_name} ({pages_folder})")
        print(f"{'='*60}")
        
        if not os.path.exists(pages_folder):
            print(f"  ✗ Folder not found: {pages_folder}")
            return 0
        
        html_files = list(Path(pages_folder).rglob('*.html'))
        print(f"  Found {len(html_files)} HTML files")
        
        records = []
        errors = 0
        
        for i, html_file in enumerate(html_files):
            try:
                with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
                    html_content = f.read()
                
                # Parse based on store type
                parsed = self.extract_records_from_html(html_content, store_name, str(html_file))
                records.extend(parsed)
                
                if (i + 1) % 100 == 0:
                    print(f"  Processed {i+1}/{len(html_files)} files...")
                    
            except Exception as e:
                errors += 1
        
        print(f"  ✓ Extracted {len(records)} records ({errors} errors)")
        
        # Insert into database
        self.insert_records(records, store_name)
        
        self.records_by_store[store_name] = len(records)
        return len(records)
    
    def extract_records_from_html(self, html_content, store_name, file_path):
        """Extract vinyl record information from HTML"""
        records = []
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Strategy 1: Look for product containers
            products = self._find_products(soup, store_name)
            
            for product in products:
                try:
                    record = self._extract_record_from_element(product, store_name)
                    if record and record.get('album'):  # Only add if we got album info
                        records.append(record)
                except:
                    pass
            
        except Exception as e:
            pass
        
        return records
    
    def _find_products(self, soup, store_name):
        """Find product elements using different strategies"""
        products = []
        
        # Try multiple selectors for different store types
        selectors = [
            'div.product', 'div.product-item', 'article.product',
            'li.product', 'div[class*="product"]', 'div[data-product]',
            'div.item', 'div.record', 'div[class*="record"]',
            'article', 'li[class*="product"]', 'div.col-md-'
        ]
        
        for selector in selectors:
            found = soup.select(selector)
            if found:
                products.extend(found)
                if len(products) > 10:  # Got a reasonable amount
                    break
        
        return products[:500]  # Limit to 500 per page to avoid dupes
    
    def _extract_record_from_element(self, element, store_name):
        """Extract record data from a product element"""
        record = {
            'store_name': store_name,
            'added_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Extract title/name (artist - album)
        title_selectors = ['h2', 'h3', 'h4', '.title', '.name', '.product-title', '[class*="title"]', 'a']
        title = None
        for selector in title_selectors:
            elem = element.select_one(selector)
            if elem:
                title = elem.get_text(strip=True)
                break
        
        if not title:
            return None
        
        # Parse title into artist and album
        if ' - ' in title:
            parts = title.split(' - ', 1)
            record['artist'] = parts[0].strip()
            record['album'] = parts[1].strip()
        else:
            record['album'] = title
        
        # Extract price
        price_selectors = ['.price', '[class*="price"]', 'span.price', '.amount', '[data-price]']
        for selector in price_selectors:
            price_elem = element.select_one(selector)
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                # Try to extract numeric price
                match = re.search(r'[\d.,]+', price_text)
                if match:
                    record['price'] = match.group()
                else:
                    record['price'] = price_text[:50]
                break
        
        # Extract URL
        link = element.select_one('a[href]')
        if link:
            record['product_url'] = link.get('href', '')
        
        # Try to extract format, year, condition from title or other fields
        if record.get('album'):
            album_lower = record['album'].lower()
            
            # Format detection
            if 'vinyl' in album_lower or 'lp' in album_lower:
                record['format'] = 'Vinyl'
            elif 'cd' in album_lower:
                record['format'] = 'CD'
            elif '7"' in album_lower or '12"' in album_lower:
                record['format'] = 'Single'
            
            # Year detection
            year_match = re.search(r'\b(19|20)\d{2}\b', record['album'])
            if year_match:
                record['year'] = int(year_match.group())
        
        # Currency detection based on store
        record['currency'] = '₪' if store_name not in ['Discogs'] else 'USD'
        
        return record
    
    def insert_records(self, records, store_name):
        """Insert records into database with deduplication"""
        if not records:
            return 0
        
        inserted = 0
        duplicates = 0
        
        for record in records:
            # Check for duplicates
            self.cursor.execute(
                'SELECT COUNT(*) FROM records WHERE album = ? AND artist = ? AND store_name = ?',
                (record.get('album'), record.get('artist'), store_name)
            )
            
            if self.cursor.fetchone()[0] == 0:
                self.cursor.execute('''
                    INSERT INTO records 
                    (artist, album, genre, year, store_name, price, currency, format, condition, store_url, product_url, added_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    record.get('artist'),
                    record.get('album'),
                    record.get('genre'),
                    record.get('year'),
                    record.get('store_name'),
                    record.get('price'),
                    record.get('currency'),
                    record.get('format'),
                    record.get('condition'),
                    record.get('store_url'),
                    record.get('product_url'),
                    record.get('added_date')
                ))
                inserted += 1
            else:
                duplicates += 1
        
        self.conn.commit()
        self.total_records += inserted
        
        if duplicates > 0:
            print(f"    Inserted: {inserted}, Duplicates skipped: {duplicates}")
        else:
            print(f"    Inserted: {inserted}")
        
        return inserted
    
    def process_all_stores(self):
        """Process all store folders"""
        stores = [
            ('Beatnik', 'beatnik_pages'),
            ('Shablool', 'shablool_pages'),
            ('Giora', 'giora_pages'),
            ('Taklit House', 'taklithouse_pages'),
            ('Third Ear', 'third_ear_pages'),
            ('Rolling Dice', 'rollindice_pages'),
            ('HaSivoov', 'hasivoov_pages'),
            ('The Vinyl Room', 'vinylroom_pages'),
        ]
        
        for store_name, folder in stores:
            if os.path.exists(folder):
                self.parse_store_pages(store_name, folder)
        
        self.finalize()
    
    def finalize(self):
        """Finalize database and show summary"""
        if self.conn:
            self.conn.close()
        
        print(f"\n{'='*60}")
        print("DATABASE CREATION COMPLETE")
        print(f"{'='*60}")
        
        # Get final stats
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM records')
        total = cursor.fetchone()[0]
        
        cursor.execute('SELECT store_name, COUNT(*) as cnt FROM records GROUP BY store_name ORDER BY cnt DESC')
        by_store = cursor.fetchall()
        
        print(f"\nTotal Records: {total:,}")
        print(f"\nRecords by Store:")
        for store, count in by_store:
            print(f"  {store}: {count:,}")
        
        conn.close()
        print(f"\n✓ New database created: {self.db_path}")


if __name__ == '__main__':
    parser = VinylRecordParser()
    parser.process_all_stores()
