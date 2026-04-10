import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Optional

class DatabaseManager:
    """Manages SQLite database for vinyl records."""
    
    def __init__(self, db_path: str = "vinyl_records.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create records table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                price REAL NOT NULL,
                cover_url TEXT,
                store_name TEXT NOT NULL,
                store_url TEXT NOT NULL,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for faster searches
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_artist ON records(artist)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_album ON records(album)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_store ON records(store_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_price ON records(price)")
        
        conn.commit()
        conn.close()
    
    def insert_record(self, artist: str, album: str, price: float, 
                     cover_url: str, store_name: str, store_url: str) -> int:
        """Insert a single vinyl record."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO records (artist, album, price, cover_url, store_name, store_url)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (artist, album, price, cover_url, store_name, store_url))
            
            record_id = cursor.lastrowid
            conn.commit()
            return record_id
        except Exception as e:
            print(f"Error inserting record: {e}")
            return -1
        finally:
            conn.close()
    
    def insert_batch(self, records: List[Dict]) -> int:
        """Insert multiple records at once."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        count = 0
        try:
            for record in records:
                cursor.execute("""
                    INSERT INTO records (artist, album, price, cover_url, store_name, store_url)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    record['artist'],
                    record['album'],
                    record['price'],
                    record['cover_url'],
                    record['store_name'],
                    record['store_url']
                ))
                count += 1
            
            conn.commit()
        except Exception as e:
            print(f"Error during batch insert: {e}")
            conn.rollback()
        finally:
            conn.close()
        
        return count
    
    def get_all_records(self) -> List[Dict]:
        """Retrieve all records."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT * FROM records ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()
    
    def search_records(self, search_term: str = "", store: str = "", 
                      sort_by: str = "price", sort_order: str = "ASC") -> List[Dict]:
        """
        Search records with filters.
        
        Args:
            search_term: Search in artist or album name
            store: Filter by store name
            sort_by: Sort by 'price', 'artist', 'album', or 'created_at'
            sort_order: 'ASC' or 'DESC'
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            query = "SELECT * FROM records WHERE 1=1"
            params = []
            
            # Search filter
            if search_term:
                search_term = f"%{search_term.lower()}%"
                query += " AND (LOWER(artist) LIKE ? OR LOWER(album) LIKE ?)"
                params.extend([search_term, search_term])
            
            # Store filter
            if store:
                query += " AND store_name = ?"
                params.append(store)
            
            # Sorting
            valid_sorts = ['price', 'artist', 'album', 'created_at']
            if sort_by not in valid_sorts:
                sort_by = 'price'
            
            valid_orders = ['ASC', 'DESC']
            if sort_order.upper() not in valid_orders:
                sort_order = 'ASC'
            
            query += f" ORDER BY {sort_by} {sort_order.upper()}"
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()
    
    def get_stores(self) -> List[str]:
        """Get list of unique store names."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT DISTINCT store_name FROM records ORDER BY store_name")
            rows = cursor.fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()
    
    def clear_records(self):
        """Clear all records (for refresh)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("DELETE FROM records")
            conn.commit()
        finally:
            conn.close()
    
    def get_record_count(self) -> int:
        """Get total number of records."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT COUNT(*) FROM records")
            return cursor.fetchone()[0]
        finally:
            conn.close()
