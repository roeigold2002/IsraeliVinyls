import sqlite3
conn = sqlite3.connect('dist/music_stores.db')
cursor = conn.cursor()
cursor.execute("DELETE FROM records WHERE store_name != 'Discogs'")
conn.commit()
conn.close()
print("Database reset to Discogs only")
