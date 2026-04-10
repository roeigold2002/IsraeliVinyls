#!/usr/bin/env python3
"""Remove records with broken URLs"""
import sqlite3

conn = sqlite3.connect('music_stores.db')
c = conn.cursor()

# Delete all Giora Records since their URLs are dead (404 errors)
c.execute('DELETE FROM records WHERE store_name="Giora Records"')
deleted = c.rowcount

conn.commit()
conn.close()

print(f'✓ Deleted {deleted} broken Giora Records')
print(f'  Remaining records will be from working stores: Beatnik, Shablool, Hasivoov')
