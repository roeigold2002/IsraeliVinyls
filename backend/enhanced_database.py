#!/usr/bin/env python3
"""
Enhanced database manager with year extraction, genre support, and pagination
"""
import sqlite3
import logging
import re
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class EnhancedDatabaseManager:
    """Enhanced SQLite database manager with pagination and smart filtering."""
    
    def __init__(self, db_path: str):
        """Initialize database manager."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False, timeout=30.0)
        self.conn.row_factory = sqlite3.Row
        self._init_db()
        self._upgrade_schema()
    
    def _init_db(self):
        """Initialize database tables if they don't exist."""
        cursor = self.conn.cursor()
        
        # Create records table if it doesn't exist - with all columns
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
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        ''')
        
        self.conn.commit()
    
    def _upgrade_schema(self):
        """Add new columns if they don't exist and create indexes (for existing databases)."""
        cursor = self.conn.cursor()
        
        try:
            # Check existing columns
            cursor.execute('PRAGMA table_info(records)')
            columns = {row[1] for row in cursor.fetchall()}
            
            # Add missing columns
            if 'year' not in columns:
                cursor.execute('ALTER TABLE records ADD COLUMN year INTEGER')
                logger.info("Added 'year' column to records table")
            
            if 'genre' not in columns:
                cursor.execute('ALTER TABLE records ADD COLUMN genre TEXT')
                logger.info("Added 'genre' column to records table")
            
            if 'updated_at' not in columns:
                cursor.execute('ALTER TABLE records ADD COLUMN updated_at TIMESTAMP')
                logger.info("Added 'updated_at' column to records table")
            
            if 'scraped_at' not in columns:
                cursor.execute('ALTER TABLE records ADD COLUMN scraped_at TIMESTAMP')
                logger.info("Added 'scraped_at' column to records table")
            
            if 'created_at' not in columns:
                cursor.execute('ALTER TABLE records ADD COLUMN created_at TIMESTAMP')
                logger.info("Added 'created_at' column to records table")
            
            self.conn.commit()
            
            # Now create indexes (columns are guaranteed to exist)
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_artist ON records(artist)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_album ON records(album)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_store_name ON records(store_name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_year ON records(year)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_genre ON records(genre)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_price ON records(price)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_search ON records(artist, album)')
            self.conn.commit()
            
            # Extract years from existing albums - DISABLED during app startup 
            # to avoid database locking issues. Can be run separately if needed.
            # Year extraction is not critical for basic app functionality.
            logger.info("Year extraction disabled during app startup (can cause DB locks)")
            
        except Exception as e:
            logger.error(f"Error upgrading schema: {e}")
    
    def _extract_year_from_album(self, album: str) -> Optional[int]:
        """Extract year from album title using regex."""
        if not album:
            return None
        
        # Look for 4-digit numbers that look like years (1900-2099)
        matches = re.findall(r'\b(19\d{2}|20\d{2})\b', album)
        if matches:
            # Return the last year found (usually the release year, not a compilation)
            try:
                return int(matches[-1])
            except:
                return None
        return None
    
    def _extract_years(self):
        """Extract years from album titles for records that don't have year (optimized)."""
        cursor = self.conn.cursor()
        
        try:
            # Check how many records need year extraction
            cursor.execute('SELECT COUNT(*) FROM records WHERE year IS NULL')
            records_without_year = cursor.fetchone()[0]
            
            if records_without_year == 0:
                logger.info("All records already have year information")
                return
            
            # Only extract for records that need it
            logger.info(f"Extracting years for {records_without_year} records...")
            
            # Use a batch approach with limit to avoid locking
            batch_size = 500
            processed = 0
            
            while processed < records_without_year:
                cursor.execute('SELECT id, album FROM records WHERE year IS NULL ORDER BY id LIMIT ?', (batch_size,))
                records = cursor.fetchall()
                
                if not records:
                    break
                
                updates = []
                for record in records:
                    year = self._extract_year_from_album(record[1])
                    if year:
                        updates.append((year, record[0]))
                
                # Batch update
                if updates:
                    cursor.executemany('UPDATE records SET year = ? WHERE id = ?', updates)
                    self.conn.commit()
                
                processed += len(records)
                logger.info(f"Processed {processed}/{records_without_year} records for year extraction")
            
            logger.info("Year extraction complete")
        except Exception as e:
            logger.error(f"Error extracting years: {e}")
    
    def insert_batch(self, records: List[Dict]) -> int:
        """Insert batch of records."""
        cursor = self.conn.cursor()
        inserted = 0
        
        for record in records:
            try:
                # Extract year from album title
                year = self._extract_year_from_album(record.get('album', ''))
                
                cursor.execute('''
                    INSERT INTO records 
                    (artist, album, year, genre, price, cover_url, store_name, store_url, scraped_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    record.get('artist', ''),
                    record.get('album', ''),
                    year,
                    record.get('genre'),
                    record.get('price'),
                    record.get('cover_url', ''),
                    record.get('store_name', ''),
                    record.get('store_url', ''),
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))
                inserted += 1
            except Exception as e:
                logger.error(f"Error inserting record: {e}")
        
        self.conn.commit()
        return inserted
    
    def search_records(
        self,
        search_term: str = '',
        store: str = '',
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        genre: str = '',
        price_from: Optional[float] = None,
        price_to: Optional[float] = None,
        sort_by: str = 'price',
        sort_order: str = 'ASC',
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List[Dict], int]:
        """
        Search records with pagination.
        Returns (records, total_count)
        """
        cursor = self.conn.cursor()
        
        # Build WHERE clause
        conditions = []
        params = []
        
        if search_term:
            search_term = f"%{search_term}%"
            conditions.append("(artist LIKE ? OR album LIKE ?)")
            params.extend([search_term, search_term])
        
        if store:
            conditions.append("store_name = ?")
            params.append(store)
        
        if year_from is not None:
            conditions.append("year >= ?")
            params.append(year_from)
        
        if year_to is not None:
            conditions.append("year <= ?")
            params.append(year_to)
        
        if genre and genre != '':
            conditions.append("genre = ?")
            params.append(genre)
        
        if price_from is not None:
            conditions.append("price >= ?")
            params.append(price_from)
        
        if price_to is not None:
            conditions.append("price <= ?")
            params.append(price_to)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Get total count
        cursor.execute(f'SELECT COUNT(*) FROM records WHERE {where_clause}', params)
        total_count = cursor.fetchone()[0]
        
        # Validate sort_by
        valid_sort_cols = ['price', 'artist', 'album', 'year', 'store_name']
        if sort_by not in valid_sort_cols:
            sort_by = 'price'
        
        sort_order = 'DESC' if sort_order.upper() == 'DESC' else 'ASC'
        
        # Build and execute query with pagination
        offset = (page - 1) * per_page
        
        query = f"""
            SELECT id, artist, album, year, genre, price, cover_url, store_name, store_url
            FROM records 
            WHERE {where_clause}
            ORDER BY {sort_by} {sort_order}
            LIMIT ? OFFSET ?
        """
        
        cursor.execute(query, params + [per_page, offset])
        records = [dict(row) for row in cursor.fetchall()]
        
        return records, total_count
    
    def get_stores(self) -> List[str]:
        """Get list of all stores."""
        cursor = self.conn.cursor()
        cursor.execute('SELECT DISTINCT store_name FROM records ORDER BY store_name')
        return [row[0] for row in cursor.fetchall()]
    
    def get_years(self) -> List[int]:
        """Get list of all available years."""
        cursor = self.conn.cursor()
        cursor.execute('SELECT DISTINCT year FROM records WHERE year IS NOT NULL ORDER BY year DESC')
        return [row[0] for row in cursor.fetchall()]
    
    def get_genres(self) -> List[str]:
        """Get list of all available genres."""
        cursor = self.conn.cursor()
        cursor.execute('SELECT DISTINCT genre FROM records WHERE genre IS NOT NULL ORDER BY genre')
        return [row[0] for row in cursor.fetchall()]
    
    def get_price_range(self) -> Tuple[float, float]:
        """Get min and max price."""
        cursor = self.conn.cursor()
        cursor.execute('SELECT MIN(price), MAX(price) FROM records WHERE price > 0')
        result = cursor.fetchone()
        return (result[0] or 0, result[1] or 0)
    
    def get_record_count(self) -> int:
        """Get total number of records."""
        cursor = self.conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM records')
        return cursor.fetchone()[0]
    
    def clear_records(self):
        """Clear all records."""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM records')
        self.conn.commit()
    
    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
