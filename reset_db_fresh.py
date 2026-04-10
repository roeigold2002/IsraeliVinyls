#!/usr/bin/env python3
import sqlite3
import os

# Remove old database
for f in ['music_stores.db', 'music_stores.db-wal', 'music_stores.db-shm']:
    if os.path.exists(f):
        os.remove(f)
        print(f"Removed {f}")

# Create fresh database
conn = sqlite3.connect('music_stores.db')
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE records (
    id INTEGER PRIMARY KEY,
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
""")

conn.commit()
conn.close()
print("✓ Fresh database created")
