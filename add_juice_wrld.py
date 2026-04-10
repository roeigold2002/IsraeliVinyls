#!/usr/bin/env python3
"""Add Juice WRLD vinyl records to the database"""

import sqlite3
from datetime import datetime

conn = sqlite3.connect('music_stores.db')
c = conn.cursor()

juice_wrld_records = [
    ("Juice WRLD", "Legends Never Die", "Hip-Hop", 2020, "Discogs", "30", "USD", "2LP", "Mint", "", "https://www.discogs.com/Juice-WRLD-Legends-Never-Die/master/1654773"),
    ("Juice WRLD", "Goodbye & Good Riddance", "Hip-Hop", 2018, "Discogs", "35", "USD", "LP", "Mint", "", "https://www.discogs.com/Juice-WRLD-Goodbye-Good-Riddance/master/1367023"),
    ("Juice WRLD", "Fighting Demons", "Hip-Hop", 2021, "Discogs", "35", "USD", "2LP", "Mint", "", "https://www.discogs.com/Juice-WRLD-Fighting-Demons/master/1833334"),
    ("Juice WRLD", "Juice WRLD presents Too Soon?", "Hip-Hop", 2020, "Discogs", "25", "USD", "LP", "Very Good", "", "https://www.discogs.com/Juice-WRLD-Juice-WRLD-presents-Too-Soon/master/1659008"),
    ("Juice WRLD", "The Party Never Ends", "Hip-Hop", 2020, "Discogs", "28", "USD", "LP", "Mint", "", "https://www.discogs.com/Juice-WRLD-The-Party-Never-Ends/master/1620539"),
    ("Juice WRLD", "Death Race For Love", "Hip-Hop", 2019, "Discogs", "32", "USD", "LP", "Very Good", "", "https://www.discogs.com/Juice-WRLD-Death-Race-For-Love/master/1439894"),
]

now = datetime.now().isoformat()

c.execute("SELECT COUNT(*) FROM records")
before = c.fetchone()[0]

for record in juice_wrld_records:
    c.execute('''
    INSERT INTO records 
    (artist, album, genre, year, store_name, price, currency, format, condition, store_url, product_url, added_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', record + (now,))

conn.commit()

c.execute("SELECT COUNT(*) FROM records")
after = c.fetchone()[0]

print(f"✓ Added {after - before} Juice WRLD records")
print(f"✓ Total database: {after} records")

conn.close()
