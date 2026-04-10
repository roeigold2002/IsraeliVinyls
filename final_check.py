#!/usr/bin/env python3
"""Final database status - no unicode"""

import sqlite3

conn = sqlite3.connect('music_stores.db', timeout=10)
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM records")
total = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
stores = cursor.fetchone()[0]

print(f"FINAL STATUS")
print(f"============")
print(f"Total Records: {total}")
print(f"Stores: {stores}")
print(f"Status: COMPLETE")

conn.close()
