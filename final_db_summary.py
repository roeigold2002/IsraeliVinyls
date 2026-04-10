import sqlite3

conn = sqlite3.connect('dist/music_stores.db')
c = conn.cursor()

print("\n" + "="*70)
print("DATABASE SUMMARY - All Israeli Stores")
print("="*70)

# Total records
c.execute("SELECT COUNT(*) FROM records")
total = c.fetchone()[0]
print(f"\nTotal Records in Database: {total:,}")

# Records by store
print("\nRecords by Store:")
print("-" * 70)
c.execute("""
    SELECT store_name, COUNT(*) as count 
    FROM records 
    WHERE store_name NOT IN ('Discogs', 'MusicBrainz')
    GROUP BY store_name 
    ORDER BY count DESC
""")

for store, count in c.fetchall():
    print(f"  {store:25} {count:>8,} records")

# Total from Israeli stores
c.execute("""
    SELECT COUNT(*) FROM records 
    WHERE store_name NOT IN ('Discogs', 'MusicBrainz')
""")
israeli_total = c.fetchone()[0]
print("-" * 70)
print(f"Total Israeli Stores:      {israeli_total:>8,} records")

# Sample records
print("\n" + "="*70)
print("Sample Records from ביטניק:")
print("="*70)
c.execute("""
    SELECT artist, album, price 
    FROM records 
    WHERE store_name = 'ביטניק' 
    LIMIT 5
""")
for artist, album, price in c.fetchall():
    print(f"  {artist:25} | {album:35} | ₪{price:.0f}")

conn.close()
print("\n")
