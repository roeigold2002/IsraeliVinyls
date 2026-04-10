#!/usr/bin/env python3
import sqlite3
import glob

print("Checking all database files for records table:\n")

for db_file in sorted(glob.glob("*.db")):
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        if not tables:
            print(f"{db_file}: (empty database)")
            conn.close()
            continue
        
        for table in tables:
            table_name = table[0]
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"{db_file}: {table_name} = {count:,} records")
        
        conn.close()
    except Exception as e:
        print(f"{db_file}: ERROR - {e}")

print("\nDone.")
