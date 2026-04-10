#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Universal HTML Parser for Vinyl Stores
Handles multiple HTML structures from different WooCommerce themes
"""

import os
import sqlite3
import re
from pathlib import Path
from bs4 import BeautifulSoup
from datetime import datetime

# Store configurations with different CSS selectors and parsing rules
STORE_CONFIGS = {
    'beatnik_pages': {
        'name': 'Beatnik',
        'product_selector': '.woocommerce-LoopProduct-link',  # Beatnik structure
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'shablool_pages': {
        'name': 'Shablool',
        'product_selector': 'div.product-box a[href*="/product/"]',  # Shablool structure
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'giora_pages': {
        'name': 'Giora',
        'product_selector': '.woocommerce-LoopProduct-link, div.product-box a[href*="/product/"]',
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'taklithouse_pages': {
        'name': 'Taklit House',
        'product_selector': '.woocommerce-LoopProduct-link, div.product-box a[href*="/product/"]',
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'third_ear_pages': {
        'name': 'Third Ear',
        'product_selector': '.woocommerce-LoopProduct-link, div.product-box a[href*="/product/"]',
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'rollindice_pages': {
        'name': 'Rolling Dice',
        'product_selector': '.woocommerce-LoopProduct-link, div.product-box a[href*="/product/"]',
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'hasivoov_pages': {
        'name': 'HaSivoov',
        'product_selector': '.woocommerce-LoopProduct-link, div.product-box a[href*="/product/"]',
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
    'vinylroom_pages': {
        'name': 'The Vinyl Room',
        'product_selector': '.woocommerce-LoopProduct-link, div.product-box a[href*="/product/"]',
        'get_url': lambda elem: elem.get('href', ''),
        'get_title': lambda elem: elem.get_text(strip=True),
    },
}

def extract_artist_album(title):
    """Extract artist and album from product title"""
    title = title.strip()
    
    # Try dash separator
    if ' – ' in title:
        parts = title.split(' – ', 1)
        return parts[0].strip(), parts[1].strip()
    elif ' - ' in title:
        parts = title.split(' - ', 1)
        return parts[0].strip(), parts[1].strip()
    
    return '', title

def extract_year(title):
    """Extract year from product title"""
    match = re.search(r'\b(19|20)\d{2}\b', title)
    return match.group(1) if match else ''

def detect_format(title):
    """Detect format from title (LP, CD, etc.)"""
    title_upper = title.upper()
    
    if '2LP' in title_upper or 'DOUBLE' in title_upper or '2 LP' in title_upper:
        return '2LP'
    elif 'LP' in title_upper or 'VINYL' in title_upper:
        return 'LP'
    elif 'CD' in title_upper:
        return 'CD'
    elif '3LP' in title_upper:
        return '3LP'
    
    return 'LP'  # Default

def detect_condition(title):
    """Detect condition from title"""
    title_upper = title.upper()
    
    if 'NEW' in title_upper or 'SEALED' in title_upper:
        return 'New'
    elif 'USED' in title_upper or 'VINTAGE' in title_upper:
        return 'Used'
    
    return 'New'  # Default

def create_database(db_path='music_stores_new.db'):
    """Create database with schema"""
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Deleted old database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist TEXT,
            album TEXT,
            genre TEXT,
            year TEXT,
            store_name TEXT,
            price TEXT,
            currency TEXT DEFAULT 'ILS',
            format TEXT,
            condition TEXT,
            store_url TEXT,
            product_url TEXT,
            added_date TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create indexes
    cursor.execute('CREATE INDEX idx_artist ON records(artist)')
    cursor.execute('CREATE INDEX idx_store ON records(store_name)')
    cursor.execute('CREATE INDEX idx_album ON records(album)')
    
    conn.commit()
    conn.close()
    print(f"✓ Created new database: {db_path}")

def parse_store_html(store_folder, store_config, db_path):
    """Parse all HTML files from a store"""
    folder_path = Path(store_folder)
    html_files = list(folder_path.glob('*.html'))
    
    print(f"\n============================================================")
    print(f"Parsing: {store_config['name']}")
    print(f"============================================================")
    print(f"Found {len(html_files)} HTML files")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    total_records = 0
    error_count = 0
    
    for idx, html_file in enumerate(html_files):
        try:
            with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
                html_content = f.read()
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Try primary selector first, then fallback to alternative
            selector_parts = store_config['product_selector'].split(',')
            products = []
            
            for selector in selector_parts:
                selector = selector.strip()
                products = soup.select(selector)
                if products:
                    break
            
            for product_elem in products:
                try:
                    # For Shablool, the product element is an `a` tag
                    # For Beatnik, we need to find the parent and extract data
                    if 'a' in str(type(product_elem)).lower() or product_elem.name == 'a':
                        # Direct link element
                        url = store_config['get_url'](product_elem)
                        title = store_config['get_title'](product_elem)
                    else:
                        # Wrapper element, find the link inside
                        link = product_elem.find('a', href=True)
                        if not link:
                            continue
                        url = link.get('href', '')
                        title = link.get_text(strip=True)
                    
                    if not url or not title:
                        continue
                    
                    # Extract data
                    artist, album = extract_artist_album(title)
                    year = extract_year(title)
                    format_type = detect_format(title)
                    condition = detect_condition(title)
                    
                    # Insert into database
                    cursor.execute('''
                        INSERT OR IGNORE INTO records 
                        (artist, album, genre, year, store_name, price, format, condition, store_url, product_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (artist, album, '', year, store_config['name'], '', format_type, condition, store_folder, url))
                    
                    total_records += 1
                
                except Exception as e:
                    error_count += 1
                    continue
        
        except Exception as e:
            error_count += 1
            continue
        
        # Progress checkpoint
        if (idx + 1) % 200 == 0 or (idx + 1) == len(html_files):
            print(f"  Processed: {idx + 1}/{len(html_files)} files, extracted {total_records} records so far...")
    
    conn.commit()
    conn.close()
    
    print(f"  ✓ Extraction complete: {total_records} records ({error_count} parsing errors)")
    return total_records

def get_store_details(db_path):
    """Get store insertion details"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT store_name, COUNT(*) as count FROM records 
        WHERE store_name IS NOT NULL 
        GROUP BY store_name
    ''')
    
    stores = cursor.fetchall()
    conn.close()
    
    return stores

def main():
    project_root = os.getcwd()
    db_path = os.path.join(project_root, 'music_stores_new.db')
    
    # Create database
    create_database(db_path)
    
    # Parse each store
    total_all_records = 0
    for store_folder, config in STORE_CONFIGS.items():
        folder_path = os.path.join(project_root, store_folder)
        if os.path.exists(folder_path):
            records = parse_store_html(folder_path, config, db_path)
            total_all_records += records
    
    # Final report
    print(f"\n============================================================")
    print(f"FINAL REPORT")
    print(f"============================================================")
    stores = get_store_details(db_path)
    for store_name, count in stores:
        print(f"{store_name}: {count} records")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM records')
    total = cursor.fetchone()[0]
    conn.close()
    
    print(f"\nTotal records in database: {total}")

if __name__ == '__main__':
    main()
