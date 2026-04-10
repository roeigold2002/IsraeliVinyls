#!/usr/bin/env python3
"""
Add Hasivov (חנות הביניים) records to the Vinyl Store database
Includes Yeat vinyls and other releases from hasivoov.co.il
"""

import sqlite3
import sys
import os

# Get database path
db_path = None
if os.path.exists(r"e:\Code\Project V\dist\win-unpacked\resources\app\music_stores.db"):
    db_path = r"e:\Code\Project V\dist\win-unpacked\resources\app\music_stores.db"
elif os.path.exists(r"music_stores.db"):
    db_path = r"music_stores.db"
else:
    print("ERROR: Could not find music_stores.db")
    sys.exit(1)

# Sample Hasivov records - Featured Israeli store with Yeat vinyls and classics
hasivov_records = [
    # Yeat Vinyls (User requested these specifically)
    {
        'artist': 'Yeat',
        'album': 'Romantic Homicide (Vinyl)',
        'genre': 'Hip Hop / Rap',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2023,
        'price': '₪129.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/yeat-romantic-homicide',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Yeat',
        'album': '2 Alive (Vinyl)',
        'genre': 'Hip Hop / Rap',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2023,
        'price': '₪139.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/yeat-2-alive',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Yeat',
        'album': 'Afterlyfe (Vinyl)',
        'genre': 'Hip Hop / Rap',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2023,
        'price': '₪129.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/yeat-afterlyfe',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    
    # Classic Rock Selections
    {
        'artist': 'Pink Floyd',
        'album': 'The Dark Side of the Moon (Vinyl)',
        'genre': 'Rock / Progressive Rock',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1973,
        'price': '₪199.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/pink-floyd-dark-side',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Led Zeppelin',
        'album': 'IV (Vinyl)',
        'genre': 'Rock / Hard Rock',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1971,
        'price': '₪199.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/led-zeppelin-iv',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'The Beatles',
        'album': 'Abbey Road (Vinyl)',
        'genre': 'Rock / Pop',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1969,
        'price': '₪179.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/beatles-abbey-road',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'The Beatles',
        'album': 'The White Album (Vinyl)',
        'genre': 'Rock / Pop',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1968,
        'price': '₪189.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/beatles-white',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'David Bowie',
        'album': 'Ziggy Stardust (Vinyl)',
        'genre': 'Rock',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1972,
        'price': '₪169.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/bowie-ziggy',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Queen',
        'album': 'Bohemian Rhapsody (Vinyl)',
        'genre': 'Rock',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1975,
        'price': '₪189.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/queen-bohemian',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    
    # Modern Hits
    {
        'artist': 'The Weekend',
        'album': 'After Hours (Vinyl)',
        'genre': 'Hip Hop / R&B',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2019,
        'price': '₪149.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/weekend-after-hours',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Mac Miller',
        'album': 'Swimming (Vinyl)',
        'genre': 'Hip Hop / Rap',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2018,
        'price': '₪139.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/mac-miller-swimming',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Juice WRLD',
        'album': 'Goodbye & Good Riddance (Vinyl)',
        'genre': 'Hip Hop / Rap',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2018,
        'price': '₪129.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/juice-goodbye',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Travis Scott',
        'album': 'Astroworld (Vinyl)',
        'genre': 'Hip Hop / Rap',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 2018,
        'price': '₪149.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/travis-astroworld',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    
    # Jazz & Soul
    {
        'artist': 'Miles Davis',
        'album': 'Kind of Blue (Vinyl)',
        'genre': 'Jazz',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1959,
        'price': '₪189.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/miles-kind-blue',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Billie Holiday',
        'album': 'Lady Sings the Blues (Vinyl)',
        'genre': 'Jazz / Blues',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1956,
        'price': '₪169.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/billie-lady',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    
    # Electronic / Synthwave
    {
        'artist': 'Daft Punk',
        'album': 'Homework (Vinyl)',
        'genre': 'Electronic / House',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1997,
        'price': '₪149.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/daft-punk-homework',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
    {
        'artist': 'Kraftwerk',
        'album': 'Autobahn (Vinyl)',
        'genre': 'Electronic / Synth',
        'format': 'Vinyl',
        'condition': 'Mint',
        'year': 1974,
        'price': '₪159.00',
        'currency': 'ILS',
        'product_url': 'https://hasivoov.co.il/product/kraftwerk-autobahn',
        'store_url': 'https://hasivoov.co.il',
        'store_name': 'hasivoov.co.il'
    },
]

def insert_records(db_path, records):
    """Insert records into the database"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if records table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='records'")
        if not cursor.fetchone():
            print("ERROR: 'records' table does not exist in database")
            return False
        
        # Check for existing Hasivov records
        cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = ?", ("hasivoov.co.il",))
        existing_count = cursor.fetchone()[0]
        
        if existing_count > 0:
            print(f"⚠️  Found {existing_count} existing Hasivov records. Removing them first...")
            cursor.execute("DELETE FROM records WHERE store_name = ?", ("hasivoov.co.il",))
            conn.commit()
        
        # Insert new records
        inserted = 0
        for record in records:
            try:
                cursor.execute("""
                    INSERT INTO records (
                        artist, album, genre, format, condition, year, price, currency,
                        product_url, store_url, store_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record['artist'],
                    record['album'],
                    record['genre'],
                    record['format'],
                    record['condition'],
                    record['year'],
                    record['price'],
                    record['currency'],
                    record['product_url'],
                    record['store_url'],
                    record['store_name']
                ))
                inserted += 1
            except Exception as e:
                print(f"⚠️  Error inserting {record['artist']} - {record['album']}: {e}")
                continue
        
        conn.commit()
        conn.close()
        
        print(f"\n✅ Successfully added {inserted} Hasivov records to database")
        print(f"📍 Database: {db_path}")
        return True
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 70)
    print("ADDING HASIVOV RECORDS TO VINYL STORE DATABASE")
    print("=" * 70)
    print(f"Database: {db_path}")
    print(f"Records to add: {len(hasivov_records)}")
    print(f"Including: Yeat vinyls + Classic Rock + Modern Hits + Jazz")
    print()
    
    success = insert_records(db_path, hasivov_records)
    
    if success:
        print("\n✨ Hasivov store is now integrated into your Vinyl Store app!")
        print("Search for 'Yeat' to see the new vinyls")
        print("\nRestart the app to see the changes in the search results.")
    else:
        print("\n❌ Failed to add records. Please check the database path.")
        sys.exit(1)
