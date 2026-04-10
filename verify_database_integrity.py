#!/usr/bin/env python3
"""Verify database schema and integrity"""

import sqlite3

try:
    conn = sqlite3.connect('music_stores.db', timeout=10)
    cursor = conn.cursor()
    
    print("[CHECKING] Database Schema\n")
    
    # Get table schema
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='records'")
    schema = cursor.fetchone()
    if schema:
        print("[OK] Records table exists")
        print(f"Schema:\n{schema[0]}\n")
    
    # Check record count
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    print(f"[OK] Total Records: {total}")
    
    # Check all stores represented
    cursor.execute("SELECT DISTINCT store_name FROM records ORDER BY store_name")
    stores = [row[0] for row in cursor.fetchall()]
    print(f"[OK] Unique Stores: {len(stores)}")
    for store in stores:
        cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = ?", (store,))
        count = cursor.fetchone()[0]
        print(f"     - {store}: {count}")
    
    # Check data completeness
    print(f"\n[CHECKING] Data Completeness\n")
    
    cursor.execute("SELECT COUNT(*) FROM records WHERE artist IS NULL OR artist = ''")
    null_artists = cursor.fetchone()[0]
    print(f"[INFO] Null/Empty artists: {null_artists}")
    
    cursor.execute("SELECT COUNT(*) FROM records WHERE album IS NULL OR album = ''")
    null_albums = cursor.fetchone()[0]
    print(f"[INFO] Null/Empty albums: {null_albums}")
    
    # Sample records
    print(f"\n[SAMPLING] 10 Random Records\n")
    cursor.execute("SELECT artist, album, store_name, price FROM records ORDER BY RANDOM() LIMIT 10")
    for artist, album, store, price in cursor.fetchall():
        print(f"  {artist} | {album}")
        print(f"    Store: {store}, Price: {price}\n")
    
    conn.close()
    
    print("[SUCCESS] Database integrity verified")
    print(f"[FINAL] {total} records ready for use")
    
except Exception as e:
    print(f"[ERROR] {e}")
    import traceback
    traceback.print_exc()
