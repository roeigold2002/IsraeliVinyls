#!/usr/bin/env python3
import sqlite3

conn = sqlite3.connect("music_stores.db")
cursor = conn.cursor()

# Get final counts
cursor.execute("SELECT COUNT(*) FROM records")
total = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(DISTINCT artist) FROM records")
artists = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
stores_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(DISTINCT genre) FROM records")
genres = cursor.fetchone()[0]

cursor.execute("SELECT SUM(price), AVG(price) FROM records")
total_value, avg = cursor.fetchone()

cursor.execute("SELECT MIN(year), MAX(year) FROM records WHERE year IS NOT NULL")
year_min, year_max = cursor.fetchone()

cursor.execute("SELECT store_name, COUNT(*) FROM records GROUP BY store_name ORDER BY COUNT(*) DESC")
stores_data = cursor.fetchall()

conn.close()

print("\n" + "="*70)
print("🎉 FINAL VINYL DATABASE SUMMARY - MEGA EXPANSION COMPLETE! 🎉")
print("="*70)
print()
print("📊 DATABASE STATISTICS:")
print(f"  Total Records: {total:,} ✓")
print(f"  Unique Artists: {artists:,} ✓")
print(f"  Stores Integrated: {stores_count} ✓")
print(f"  Genres Represented: {genres} ✓")
print(f"  Year Range: {year_min} - {year_max} ✓")
print(f"  Total Value: ₪{total_value:,.2f}")
print(f"  Average Price: ₪{avg:,.2f}")
print()
print("🏪 Store Distribution:")
for store, count in stores_data:
    pct = (count / total) * 100
    print(f"  {store:15} {count:3} records ({pct:5.1f}%)")
print()
print("="*70)
if total >= 700:
    print(f"🏆 SUCCESS! Database reached {total} records (700+ milestone)!")
else:
    print(f"📈 Database Status: {total} records")
print("="*70)
