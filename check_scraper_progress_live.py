#!/usr/bin/env python3
"""Check scraper progress in real-time"""

import sqlite3
import time

def check_progress():
    try:
        conn = sqlite3.connect('music_stores.db', timeout=5)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM records")
        total = cursor.fetchone()[0]
        
        cursor.execute("SELECT store_name, COUNT(*) FROM records GROUP BY store_name ORDER BY COUNT(*) DESC")
        stores = cursor.fetchall()
        
        print(f"\n📊 Current Database Status:")
        print(f"   Total Records: {total:,}")
        print(f"   Stores Contributing: {len(stores)}")
        
        if stores:
            print(f"\n   Store Breakdown:")
            for store, count in stores:
                print(f"      • {store}: {count}")
        
        conn.close()
        return total
    except Exception as e:
        print(f"Error: {e}")
        return 0

if __name__ == "__main__":
    check_progress()
