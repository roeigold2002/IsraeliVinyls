#!/usr/bin/env python3
"""
Initialize and prepare database for Scrapling scraping
Enable WAL mode for concurrent access
"""

import sqlite3
import os

print("🔧 Preparing database...")

# Remove WAL files if they exist
for filename in ['music_stores.db-wal', 'music_stores.db-shm']:
    if os.path.exists(filename):
        try:
            os.remove(filename)
            print(f"  ✓ Removed {filename}")
        except:
            pass

# Reset database
try:
    conn = sqlite3.connect('music_stores.db', timeout=10)
    conn.isolation_level = None
    cursor = conn.cursor()
    
    # Enable WAL mode for better concurrent access
    cursor.execute("PRAGMA journal_mode=WAL")
    print("  ✓ Enabled WAL mode")
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys=ON")
    print("  ✓ Enabled foreign keys")
    
    # Clear existing records
    cursor.execute("DELETE FROM records")
    conn.commit()
    print("  ✓ Cleared records")
    
    # Check table structure
    cursor.execute("PRAGMA table_info(records)")
    columns = cursor.fetchall()
    print(f"  ✓ Table structure verified: {len(columns)} columns")
    
    conn.close()
    print("\n✅ Database ready for scraping!\n")
    
except Exception as e:
    print(f"\n❌ Error: {e}\n")
