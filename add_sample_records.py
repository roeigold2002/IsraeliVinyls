#!/usr/bin/env python3
"""
Create sample vinyl record data to demonstrate the app's full capability.
Then user can run the proper importers for real data.
"""

import sqlite3
import random

DB_PATH = r"e:\Code\Project V\dist\music_stores.db"
APP_DB_PATH = r"e:\Code\Project V\dist\win-unpacked\resources\app\dist\music_stores.db"

artists = [
    "The Beatles", "Pink Floyd", "Led Zeppelin", "David Bowie", "Queen",
    "The Rolling Stones", "Jimi Hendrix", "Black Sabbath", "Nirvana", "Metallica",
    "Iron Maiden", "The Who", "Radiohead", "Amen Corner", "The Doors",
    "AC/DC", "Guns N Roses", "The Cure", "Depeche Mode",  "New Order"
] * 100  # Repeat to get more variety

albums = [
    "Abbey Road", "The Wall", "IV", "Ziggy Stardust", "Bohemian Rhapsody",
    "Exile on Main Street", "Are You Experienced", "Paranoid", "Nevermind", "Master of Puppets",
    "The Number of the Beast", "The Who Sell Out", "OK Computer", "The Wall", "Doors",
]

stores = ["Beatnik", "Third Ear", "Giora Records", "Hasivoov", "Shablool", 
          "Taklitha House", "RollinDice", "Vinyl Room", "Disccenter", "Tav8"]

genres = ["Rock", "Progressive", "Heavy Metal", "Alternative", "Punk", "Blues", 
          "Psychedelic", "Hard Rock", "New Wave", "Electronic"]

print("Generating sample vinyl records...")
print()

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Add 5000 sample records
for i in range(5000):
    cursor.execute("""
        INSERT OR IGNORE INTO records 
        (artist, album, store_name, price, currency, genre, format)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        random.choice(artists),
        random.choice(albums) + " - Edition " + str(i),
        random.choice(stores),
        random.randint(50, 500),
        "ILS",
        random.choice(genres),
        "Vinyl"
    ))

conn.commit()
conn.close()

# Check result
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM records")
count = cursor.fetchone()[0]
conn.close()

print(f"✓ Database now has: {count:,} records")
print()

# Also sync to app database
import shutil
import os
os.makedirs(os.path.dirname(APP_DB_PATH), exist_ok=True)
shutil.copy2(DB_PATH, APP_DB_PATH)

print(f"✓ Synced to app database")
print()
print("📝 To add REAL data from your scraped pages later, run:")
print("   python import_discogs_html_pages.py")
print("   python extract_israeli_stores.py")
