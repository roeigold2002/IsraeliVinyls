#!/usr/bin/env python3
"""
Parse manually scraped HTML pages from vinyl stores using correct WooCommerce selectors.
Creates a new comprehensive database with all extracted records.
"""

import sqlite3
import os
from pathlib import Path
from bs4 import BeautifulSoup
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
        print(f"✓ Created new database: {self.db_path}\n")
    
    def parse_store_pages(self, store_name, pages_folder):
        """Parse all HTML pages for a store"""
        print(f"{'='*60}")
        print(f"Parsing: {store_name}")
        print(f"{'='*60}")
        
        if not os.path.exists(pages_folder):
            print(f"✗ Folder not found: {pages_folder}\n")
            return 0
        
        html_files = list(Path(pages_folder).rglob('*.html'))
        print(f"Found {len(html_files)} HTML files")
        
        records = []
        errors = 0
        
        for i, html_file in enumerate(html_files):
            try:
                with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
                    html_content = f.read()
                
                # Parse the HTML file
                parsed = self.extract_records_from_html(html_content, store_name, str(html_file))
                records.extend(parsed)
                
                if (i + 1) % 200 == 0:
                    print(f"  Processed: {i+1}/{len(html_files)} files, extracted {len(records)} records so far...")
                    
            except Exception as e:
                errors += 1
        
        print(f"  ✓ Extraction complete: {len(records)} records ({errors} parsing errors)")
        
        # Insert into database
        inserted = self.insert_records(records, store_name)
        self.records_by_store[store_name] = inserted
        print()
        return inserted
    
    def extract_records_from_html(self, html_content, store_name, file_path):
        """Extract vinyl record information from HTML"""
        records = []
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # WooCommerce product links
            product_links = soup.select('.woocommerce-LoopProduct-link')
            
            for link in product_links:
                try:
                    # Get the product title and URL
                    title = link.get_text(strip=True)
                    url = link.get('href', '')
                    
                    if not title:
                        continue
                    
                    record = {
                        'store_name': store_name,
                        'product_url': url,
                        'added_date': datetime.now().isoformat()
                    }
                    
                    # Parse title into artist and album
                    # Format typically: "Artist – Album (extra info)"
                    title_clean = title.replace('(יד שנייה)', '').replace('(used)', '').strip()
                    
                    if ' – ' in title_clean:
                        parts = title_clean.split(' – ', 1)
                        record['artist'] = parts[0].strip()
                        record['album'] = parts[1].strip()
                    elif ' - ' in title_clean:
                        parts = title_clean.split(' - ', 1)
                        record['artist'] = parts[0].strip()
                        record['album'] = parts[1].strip()
                    else:
                        record['album'] = title_clean
                    
                    # Extract year if present
                    year_match = re.search(r'\b(19|20)\d{2}\b', title)
                    if year_match:
                        record['year'] = int(year_match.group())
                    
                    # Try to detect format
                    title_lower = title.lower()
                    if '2lp' in title_lower or 'double' in title_lower:
                        record['format'] = '2LP'
                    elif 'lp' in title_lower or 'vinyl' in title_lower:
                        record['format'] = 'LP'
                    elif 'cd' in title_lower:
                        record['format'] = 'CD'
                    elif '7"' in title_lower or '12"' in title_lower:
                        record['format'] = 'Single'
                    elif '45' in title_lower:
                        record['format'] = '45'
                    else:
                        record['format'] = 'Vinyl'  # Default for record stores
                    
                    # Check for condition indicators
                    if 'mint' in title_lower:
                        record['condition'] = 'Mint'
                    elif 'near mint' in title_lower or 'nm' in title_lower:
                        record['condition'] = 'Near Mint'
                    elif 'very good' in title_lower or 'vg' in title_lower:
                        record['condition'] = 'Very Good'
                    elif 'good' in title_lower:
                        record['condition'] = 'Good'
                    elif 'fair' in title_lower:
                        record['condition'] = 'Fair'
                    elif 'poor' in title_lower:
                        record['condition'] = 'Poor'
                    elif 'יד שנייה' in title or 'used' in title_lower:
                        record['condition'] = 'Used'
                    
                    # Currency
                    record['currency'] = '₪'
                    
                    # Only add if we have at least artist OR album
                    if record.get('album') or record.get('artist'):
                        records.append(record)
                        
                except Exception as e:
                    pass
            
        except Exception as e:
            pass
        
        return records
    
    def insert_records(self, records, store_name):
        """Insert records into database with deduplication"""
        if not records:
            return 0
        
        inserted = 0
        duplicates = 0
        
        for record in records:
            # Check for duplicates within this store
            self.cursor.execute(
                'SELECT COUNT(*) FROM records WHERE album = ? AND artist = ? AND store_name = ?',
                (record.get('album'), record.get('artist'), store_name)
            )
            
            if self.cursor.fetchone()[0] == 0:
                self.cursor.execute('''
                    INSERT INTO records 
                    (artist, album, genre, year, store_name, price, currency, format, condition,  store_url, product_url, added_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    record.get('artist', ''),
                    record.get('album', ''),
                    record.get('genre', ''),
                    record.get('year'),
                    record.get('store_name'),
                    record.get('price', ''),
                    record.get('currency', ''),
                    record.get('format', ''),
                    record.get('condition', ''),
                    record.get('store_url', ''),
                    record.get('product_url', ''),
                    record.get('added_date', '')
                ))
                inserted += 1
            else:
                duplicates += 1
        
        self.conn.commit()
        self.total_records += inserted
        
        print(f"  Inserted: {inserted} | Skipped duplicates: {duplicates}")
        
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
        
        total_extracted = 0
        for store_name, folder in stores:
            if os.path.exists(folder):
                count = self.parse_store_pages(store_name, folder)
                total_extracted += count
        
        self.finalize()
    
    def finalize(self):
        """Finalize database and show summary"""
        if self.conn:
            self.conn.close()
        
        print(f"{'='*60}")
        print("DATABASE CREATION COMPLETE")
        print(f"{'='*60}\n")
        
        # Get final stats
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM records')
        total = cursor.fetchone()[0]
        
        cursor.execute('SELECT store_name, COUNT(*) as cnt FROM records GROUP BY store_name ORDER BY cnt DESC')
        by_store = cursor.fetchall()
        
        print(f"TOTAL RECORDS: {total:,}\n")
        print("Records by Store:")
        for store, count in by_store:
            print(f"  {store}: {count:,}")
        
        conn.close()
        print(f"\n✓ New database ready: {self.db_path}")


if __name__ == '__main__':
    parser = VinylRecordParser()
    parser.process_all_stores()
