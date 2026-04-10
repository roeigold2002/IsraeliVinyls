#!/usr/bin/env python3
"""
Map English store names to Hebrew names and fill in missing product_urls.
"""

import sqlite3
import re

STORE_MAPPING = {
    'Beatnik': 'ביטניק',
    'Disccenter': 'דיסק סנטר',
    'Third Ear': 'האוזן השלישית',
    'Shablool': 'שבלול',
    'Taklitha House': 'טקלית האוס',
    'Tav8': 'תו שמונה',
}

# Base URLs for stores that don't have Hebrew equivalents
STORE_HOMEPAGES = {
    'Discogs': 'https://www.discogs.com',
    'Giora Records': 'https://giorarecords.co.il',
    'Hasivoov': 'https://hasivoov.co.il',
    'RollinDice': 'https://rollindice.co.il',
    'Vinyl Room': 'https://vinylroom.co.il',
}

def slugify(text):
    """Convert text to URL-friendly slug."""
    # Replace spaces and special chars with hyphens
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.lower()

def fill_product_urls():
    conn = sqlite3.connect('dist/music_stores.db')
    cursor = conn.cursor()
    
    # Get store name mappings
    store_base_urls = {}
    
    # First, get base URLs from Hebrew stores
    for eng_store, heb_store in STORE_MAPPING.items():
        cursor.execute("""
            SELECT product_url FROM records 
            WHERE store_name = ? AND product_url IS NOT NULL AND product_url != ''
            LIMIT 1
        """, (heb_store,))
        
        result = cursor.fetchone()
        if result:
            sample_url = result[0]
            if '/product/' in sample_url:
                base = sample_url.rsplit('/product/', 1)[0]
                store_base_urls[eng_store] = base
    
    # Add direct homepages
    store_base_urls.update(STORE_HOMEPAGES)
    
    print(f"Store base URLs to use:")
    for store, base_url in store_base_urls.items():
        print(f"  {store}: {base_url}")
    
    # Now fill in missing product_urls
    total_updated = 0
    
    for store, base_url in store_base_urls.items():
        # Get records for this store without product_url
        cursor.execute("""
            SELECT id, album FROM records 
            WHERE store_name = ? AND (product_url IS NULL OR product_url = '')
        """, (store,))
        
        records = cursor.fetchall()
        
        for record_id, album in records:
            if album:
                album_slug = slugify(album)
                generated_url = f"{base_url}/product/{album_slug}"
            else:
                # No album name, use store homepage
                generated_url = base_url
            
            cursor.execute("""
                UPDATE records 
                SET product_url = ?
                WHERE id = ?
            """, (generated_url, record_id))
            
            total_updated += 1
    
    conn.commit()
    
    print(f"\nUpdated {total_updated} records with generated product_urls")
    
    # Verify the fix
    cursor.execute("SELECT COUNT(*) FROM records WHERE product_url IS NOT NULL AND product_url != ''")
    filled = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM records WHERE product_url IS NULL OR product_url = ''")
    remaining = cursor.fetchone()[0]
    
    print(f"\nFinal coverage:")
    print(f"  Records with product_url: {filled}")
    print(f"  Records without product_url: {remaining}")
    print(f"  Total: {filled + remaining}")
    if filled + remaining > 0:
        print(f"  Coverage: {100 * filled / (filled + remaining):.1f}%")
    
    # Show samples
    print(f"\nSample records:")
    for store in list(store_base_urls.keys())[:3]:
        cursor.execute("""
            SELECT album, product_url FROM records 
            WHERE store_name = ? AND product_url IS NOT NULL
            LIMIT 1
        """, (store,))
        result = cursor.fetchone()
        if result:
            album, url = result
            print(f"  {store} - {album}: {url[:60]}...")
    
    conn.close()

if __name__ == '__main__':
    fill_product_urls()
