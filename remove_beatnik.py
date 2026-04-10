#!/usr/bin/env python3
import sqlite3

conn = sqlite3.connect('music_stores.db')
c = conn.cursor()

# Check current state
c.execute("SELECT COUNT(*) FROM records WHERE store_name = 'Beatnik'")
before = c.fetchone()[0]

print(f"Removing {before} Beatnik records...")

# Delete Beatnik records
c.execute("DELETE FROM records WHERE store_name = 'Beatnik'")

conn.commit()

# Verify
c.execute("SELECT COUNT(*) FROM records WHERE store_name = 'Beatnik'")
after = c.fetchone()[0]

c.execute("SELECT COUNT(*) FROM records")
total = c.fetchone()[0]

print(f"✓ Deleted {before} Beatnik records")
print(f"✓ Remaining: {total} records")

conn.close()
