#!/usr/bin/env python3
"""
Create a sample vinyl records database for testing the application
"""
import sqlite3
import random

DB_PATH = "vinyl_records.db"

# Sample data
artists = [
    "The Beatles", "The Rolling Stones", "Pink Floyd", "Led Zeppelin",
    "Queen", "David Bowie", "The Who", "Black Sabbath", "Deep Purple",
    "Jimi Hendrix", "Janis Joplin", "The Doors", "Radiohead", "Nirvana",
    "Bob Dylan", "John Lennon", "George Harrison", "Paul McCartney",
    "The Clash", "Sex Pistols", "The Ramones", "Miles Davis", "John Coltrane",
    "Billie Holiday", "Louis Armstrong", "Charlie Parker", "Monk",
    "Bill Evans", "Herbie Hancock", "Chick Corea"
]

albums = {
    "The Beatles": ["Abbey Road", "The White Album", "Sgt. Pepper", "Revolver", "Help!"],
    "The Rolling Stones": ["Sticky Fingers", "Let It Bleed", "Exile", "Some Girls"],
    "Pink Floyd": ["The Wall", "Dark Side of the Moon", "Wish You Were Here", "Meddle"],
    "Led Zeppelin": ["Led Zeppelin IV", "Physical Graffiti", "Houses of the Holy"],
    "Queen": ["A Night at the Opera", "News of the World", "Innuendo", "Sheer Heart Attack"],
}

stores = ["Beatnik", "Shlabool", "TAV8", "Giora", "Disccenter", "HaSivoov", 
          "Fifth Ear", "Taklit House", "HaKirya", "Discogs"]

genres = ["Rock", "Jazz", "Blues", "Electronic", "Hip-Hop", "Soul", "Funk", "Reggae", 
          "Metal", "Pop", "Classical", "World", "Indie", "Folk", "Techno"]

def create_sample_database():
    """Create a sample database with vinyl records"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create records table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            year INTEGER,
            genre TEXT,
            price REAL,
            cover_url TEXT,
            store_name TEXT NOT NULL,
            store_url TEXT,
            scraped_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert sample records
    records_count = 0
    
    # Create a good variety of records
    for artist in artists:
        for store in stores:
            # 2-5 albums per artist per store
            albums_for_artist = albums.get(artist, [f"{artist} Album {i}" for i in range(1, 4)])
            
            for album in albums_for_artist:
                year = random.randint(1950, 2025)
                genre = random.choice(genres)
                price = random.randint(80, 500)
                cover_url = f"https://www.discogs.com/image/{random.randint(1000000, 9999999)}-0.jpg"
                store_url = f"https://example.com/record/{random.randint(1, 100000)}"
                
                try:
                    cursor.execute('''
                        INSERT INTO records 
                        (artist, album, year, genre, price, cover_url, store_name, store_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (artist, album, year, genre, price, cover_url, store_name, store_url))
                    records_count += 1
                except:
                    pass
    
    conn.commit()
    
    # Verify insert
    cursor.execute("SELECT COUNT(*) FROM records")
    count = cursor.fetchone()[0]
    print(f"Created database with {count:,} records")
    
    conn.close()

if __name__ == "__main__":
    create_sample_database()
