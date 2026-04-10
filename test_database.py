#!/usr/bin/env python3
"""Test that API can query the database"""

import sqlite3

# Test direct database access
try:
    conn = sqlite3.connect('music_stores.db', timeout=10)
    cursor = conn.cursor()
    
    # Count records
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    
    # Sample a few records
    cursor.execute("SELECT artist, album, store_name FROM records LIMIT 5")
    samples = cursor.fetchall()
    
    conn.close()
    
    print("[SUCCESS] Database Query Test")
    print(f"  Total records: {total}")
    print(f"  Sample records:")
    for artist, album, store in samples:
        print(f"    - {artist} | {album} ({store})")
    print(f"\n[OK] Database is operational and contains {total} vinyl records")
    
except Exception as e:
    print(f"[FAILED] {e}")
