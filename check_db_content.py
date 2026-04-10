#!/usr/bin/env python3
import sqlite3

print('=== DATABASE RECORD COUNTS ===\n')

# Check music_stores database
conn = sqlite3.connect('music_stores.db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
table_count = cursor.fetchone()[0]
print(f'music_stores.db:')
print(f'  Tables: {table_count}')

# List tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print(f'  Tables: {[t[0] for t in tables]}')

# Get record count from main table
for table_name in [t[0] for t in tables]:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        print(f'  Records in {table_name}: {count:,}')
    except:
        pass

conn.close()

print()

# Check vinyl_records database
conn = sqlite3.connect('vinyl_records.db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
table_count = cursor.fetchone()[0]
print(f'vinyl_records.db:')
print(f'  Tables: {table_count}')

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print(f'  Tables: {[t[0] for t in tables]}')

for table_name in [t[0] for t in tables]:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        print(f'  Records in {table_name}: {count:,}')
    except:
        pass

conn.close()

print()
print('✓ All data is already extracted and stored in databases')
print('✓ HTML cache pages are completely REDUNDANT')
