#!/usr/bin/env python3
"""
Israeli Music Store Scrapers - Sound Garden, Musica 2000, and other retailers
Adds local pricing from additional Israeli vinyl retailers
"""

import sys
import os
import sqlite3
import requests
from bs4 import BeautifulSoup
import json
import time
from datetime import datetime
from typing import List, Dict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = "dist/music_stores.db"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


class SoundGardenScraper:
    """Scrape vinyl records from Sound Garden (soundgarden.co.il)."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.db_path = DB_PATH
        self.added = 0
        self.skipped = 0
    
    def _record_exists(self, artist: str, album: str, store: str) -> bool:
        try:
            conn = sqlite3.connect(self.db_path, timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM records 
                WHERE LOWER(artist) = LOWER(?) AND LOWER(album) = LOWER(?) AND store_name = ?
            """, (artist, album, store))
            exists = cursor.fetchone()[0] > 0
            conn.close()
            return exists
        except:
            return False
    
    def _add_record(self, artist: str, album: str, year: int, price: float, url: str, store: str) -> bool:
        try:
            if self._record_exists(artist, album, store):
                return False
            
            conn = sqlite3.connect(self.db_path, timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO records 
                (artist, album, year, genre, price, store_name, store_url, scraped_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, (artist, album, year, "Vinyl", price, store, url))
            conn.commit()
            conn.close()
            return True
        except:
            return False
    
    def scrape(self) -> Dict:
        result = {"added": 0, "skipped": 0, "errors": []}
        
        try:
            print(f"Scraping Sound Garden...")
            # Sound Garden store listing would go here
            # For now, we'll return empty as the store structure varies
            
            result["added"] = self.added
            result["skipped"] = self.skipped
            return result
        except Exception as e:
            result["errors"].append(str(e))
            return result


class Musica2000Scraper:
    """Scrape vinyl records from Musica 2000 (musica2000.co.il)."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.db_path = DB_PATH
        self.added = 0
        self.skipped = 0
    
    def _record_exists(self, artist: str, album: str, store: str) -> bool:
        try:
            conn = sqlite3.connect(self.db_path, timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM records 
                WHERE LOWER(artist) = LOWER(?) AND LOWER(album) = LOWER(?) AND store_name = ?
            """, (artist, album, store))
            exists = cursor.fetchone()[0] > 0
            conn.close()
            return exists
        except:
            return False
    
    def _add_record(self, artist: str, album: str, year: int, price: float, url: str, store: str) -> bool:
        try:
            if self._record_exists(artist, album, store):
                return False
            
            conn = sqlite3.connect(self.db_path, timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO records 
                (artist, album, year, genre, price, store_name, store_url, scraped_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, (artist, album, year, "Vinyl", price, store, url))
            conn.commit()
            conn.close()
            return True
        except:
            return False
    
    def scrape(self) -> Dict:
        result = {"added": 0, "skipped": 0, "errors": []}
        
        try:
            print(f"Scraping Musica 2000...")
            # Musica 2000 store listing would go here
            
            result["added"] = self.added
            result["skipped"] = self.skipped
            return result
        except Exception as e:
            result["errors"].append(str(e))
            return result


def main():
    print(f"\n{'='*70}")
    print(f"ISRAELI STORE SCRAPERS")
    print(f"{'='*70}")
    
    # Sound Garden
    sg = SoundGardenScraper()
    sg_result = sg.scrape()
    print(f"Sound Garden: +{sg_result['added']} records")
    
    # Musica 2000
    m2k = Musica2000Scraper()
    m2k_result = m2k.scrape()
    print(f"Musica 2000: +{m2k_result['added']} records")
    
    total_added = sg_result['added'] + m2k_result['added']
    print(f"\nTotal added from Israeli stores: +{total_added} records")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
