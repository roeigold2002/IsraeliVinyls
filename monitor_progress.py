#!/usr/bin/env python3
import sqlite3
import time
import sys

print("Monitoring scraper progress...\n")

last_count = 0
for i in range(60):  # Check for up to 60 iterations (5 minutes)
    try:
        conn = sqlite3.connect('music_stores.db', timeout=2)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM records")
        count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
        stores = cursor.fetchone()[0]
        
        if count != last_count:
            print(f"[{time.strftime('%H:%M:%S')}] Records: {count:,} from {stores} stores")
            last_count = count
        
        conn.close()
    except:
        pass
    
    time.sleep(3)

print("\nFinal check...")
try:
    conn = sqlite3.connect('music_stores.db', timeout=5)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
    stores = cursor.fetchone()[0]
    
    cursor.execute("SELECT store_name, COUNT(*) FROM records GROUP BY store_name ORDER BY COUNT(*) DESC")
    store_stats = cursor.fetchall()
    
    print(f"\n✓ Total records: {total:,}")
    print(f"✓ Stores: {stores}")
    print("\nTop stores:")
    for store, count in store_stats[:5]:
        print(f"  - {store}: {count}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
