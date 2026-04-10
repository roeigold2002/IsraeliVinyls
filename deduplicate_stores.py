#!/usr/bin/env python3
"""
Consolidate duplicate store names in the database
Maps all variations to canonical store names
"""
import sqlite3

# Mapping of all variations to canonical store names
STORE_MAPPING = {
    # TAV8
    'tav8.co.il': 'TAV8',
    
    # Disccenter
    'disccenter.co.il': 'Disccenter',
    
    # Taklithouse
    'taklithouse.com': 'Taklithouse',
    
    # Third Ear
    'third_ear': 'Third Ear',
    'third-ear.com': 'Third Ear',
    
    # Beatnik
    'beatnik': 'Beatnik',
    'beatnik.co.il': 'Beatnik',
    
    # Shlabool Records
    'shlabool_records': 'Shlabool Records',
    'shabloolrecords.co.il': 'Shlabool Records',
    
    # Giora Records
    'giora_records': 'Giora Records',
    'giorarecords.co.il': 'Giora Records',
    
    # HaSivoov
    'hasivoov': 'HaSivoov',
    'hasivoov.co.il': 'HaSivoov',
    
    # The Vinyl Room
    'the_vinyl_room': 'The Vinyl Room',
    'thevinylroom.co.il': 'The Vinyl Room',
    
    # My Records
    # (if exists, map variations)
    
    # Vinyl Stock
    'vinyl_stock': 'Vinyl Stock',
    'vinylstock.co.il': 'Vinyl Stock',
    
    # Rolling Dice
    'rolling_dice': 'Rolling Dice',
    'rollindise.com': 'Rolling Dice',
}

def normalize_stores():
    """Normalize all store names in the database."""
    db_path = 'dist/music_stores.db'
    conn = sqlite3.connect(db_path, timeout=30)
    cursor = conn.cursor()
    
    print("Consolidating duplicate store names...")
    print(f"Total mappings to apply: {len(STORE_MAPPING)}\n")
    
    # Apply each mapping
    for old_name, canonical_name in STORE_MAPPING.items():
        cursor.execute('SELECT COUNT(*) FROM records WHERE store_name = ?', (old_name,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            cursor.execute('UPDATE records SET store_name = ? WHERE store_name = ?', 
                         (canonical_name, old_name))
            conn.commit()
            print(f"✓ {old_name:25} → {canonical_name:20} ({count:5} records)")
        else:
            print(f"  {old_name:25} → (not found in DB)")
    
    # Show final result
    print("\n" + "="*60)
    cursor.execute('SELECT DISTINCT store_name FROM records ORDER BY store_name')
    final_stores = [row[0] for row in cursor.fetchall()]
    print(f"\nFinal store count: {len(final_stores)}")
    print("\nCanonical stores:")
    for i, store in enumerate(final_stores, 1):
        cursor.execute('SELECT COUNT(*) FROM records WHERE store_name = ?', (store,))
        count = cursor.fetchone()[0]
        print(f"  {i:2}. {store:20} ({count:5} records)")
    
    conn.close()
    print("\n✓ Store consolidation complete!")

if __name__ == '__main__':
    normalize_stores()
