import sqlite3

conn = sqlite3.connect('dist/music_stores.db')
c = conn.cursor()

# Count total beatnik records
c.execute("SELECT COUNT(*) FROM records WHERE store_name = 'ביטניק'")
beatnik_count = c.fetchone()[0]

# Count total records
c.execute("SELECT COUNT(*) FROM records")
total_count = c.fetchone()[0]

print(f"VERIFICATION RESULTS:")
print(f"Total Beatnik Records: {beatnik_count}")
print(f"Total Records in DB:  {total_count}")

conn.close()
