#!/usr/bin/env python3
import sqlite3
import os

print('=== DETAILED DATABASE ANALYSIS ===\n')

# Check music_stores database with more detail
conn = sqlite3.connect('music_stores.db')
cursor = conn.cursor()

print('music_stores.db:')
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='records'")
schema = cursor.fetchone()
if schema:
    print(f'  Schema: {schema[0]}\n')

cursor.execute("SELECT COUNT(*) FROM records")
count = cursor.fetchone()[0]
print(f'  Total records: {count:,}')

cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
stores = cursor.fetchone()[0]
print(f'  Unique stores: {stores}')

cursor.execute("SELECT store_name, COUNT(*) as cnt FROM records GROUP BY store_name ORDER BY cnt DESC")
results = cursor.fetchall()
print(f'\n  Records by store:')
for store, cnt in results:
    print(f'    {store}: {cnt:,}')

# Check if there are backup tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
all_tables = cursor.fetchall()
print(f'\n  All tables: {[t[0] for t in all_tables]}')

conn.close()

print('\n')

# Check vinyl_records database
conn = sqlite3.connect('vinyl_records.db')
cursor = conn.cursor()

print('vinyl_records.db:')
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='records'")
schema = cursor.fetchone()
if schema:
    print(f'  Schema: {schema[0]}\n')

cursor.execute("SELECT COUNT(*) FROM records")
count = cursor.fetchone()[0]
print(f'  Total records: {count:,}')

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
all_tables = cursor.fetchall()
print(f'  All tables: {[t[0] for t in all_tables]}')

conn.close()

print('\n=== FILE SIZES ===')
music_size = os.path.getsize('music_stores.db') / 1024
vinyl_size = os.path.getsize('vinyl_records.db') / 1024
print(f'music_stores.db: {music_size:.2f} KB')
print(f'vinyl_records.db: {vinyl_size:.2f} KB')
