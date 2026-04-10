"""
Database adapter for writing Scrapling results to SQLite3.
Handles record insertion, deduplication, and schema validation.
"""

import sqlite3
import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from .parsers import ExtractedRecord

logger = logging.getLogger(__name__)


class DatabaseAdapter:
    """Adapter for SQLite3 database operations."""
    
    def __init__(self, db_path: str, timeout: float = 10.0):
        """
        Initialize database adapter.
        
        Args:
            db_path: Path to SQLite database
            timeout: Connection timeout in seconds
        """
        self.db_path = db_path
        self.timeout = timeout
        self._validate_schema()
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection with timeout."""
        conn = sqlite3.connect(self.db_path, timeout=self.timeout)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for concurrent access
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=10000')  # 10 second timeout
        return conn
    
    def _validate_schema(self) -> bool:
        """Validate database schema at startup."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Check if records table exists
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='records'
            """)
            
            if not cursor.fetchone():
                logger.warning("Records table not found. Database may be uninitialized.")
                conn.close()
                return False
            
            # Check required columns
            cursor.execute("PRAGMA table_info(records)")
            columns = {row[1] for row in cursor.fetchall()}
            
            required_cols = {'id', 'artist', 'album', 'store_name', 'product_url', 'cover_url'}
            if not required_cols.issubset(columns):
                missing = required_cols - columns
                logger.error(f"Missing required columns: {missing}")
                conn.close()
                return False
            
            logger.info("Schema validation successful")
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Schema validation failed: {e}")
            return False
    
    def record_exists(self, artist: str, album: str, store_name: str) -> bool:
        """Check if record already exists (deduplication)."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT id FROM records 
                WHERE artist = ? AND album = ? AND store_name = ?
                LIMIT 1
            """, (artist, album, store_name))
            
            exists = cursor.fetchone() is not None
            conn.close()
            return exists
            
        except Exception as e:
            logger.error(f"Dedup check failed: {e}")
            return False
    
    def insert_record(self, record: ExtractedRecord, skip_duplicates: bool = True) -> Optional[int]:
        """
        Insert a scraped record into database.
        
        Args:
            record: ExtractedRecord to insert
            skip_duplicates: Skip if artist+album+store exists
            
        Returns:
            Inserted record ID or None if failed
        """
        try:
            if skip_duplicates and self.record_exists(record.artist, record.album, record.store_name):
                logger.debug(f"Duplicate skipped: {record.artist} - {record.album} ({record.store_name})")
                return None
            
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Try Flask schema first (product_url, format, condition, etc.)
            try:
                cursor.execute("""
                    INSERT INTO records 
                    (artist, album, store_name, product_url, price, 
                     year, genre, format, condition, added_date, currency)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record.artist,
                    record.album,
                    record.store_name,
                    record.product_url,
                    record.price,
                    record.year,
                    record.genre,
                    record.format,
                    record.condition,
                    record.scraped_at,
                    record.price_currency,
                ))
            except Exception:
                # Fallback to old schema (store_url, cover_url, etc.)
                cursor.execute("""
                    INSERT INTO records 
                    (artist, album, store_name, store_url, price, 
                     cover_url, year, genre, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record.artist,
                    record.album,
                    record.store_name,
                    record.store_url,
                    record.price,
                    record.cover_url,
                    record.year,
                    record.genre,
                    record.updated_at,
                ))
            
            conn.commit()
            record_id = cursor.lastrowid
            
            logger.info(f"Record inserted (ID {record_id}): {record.artist} - {record.album}")
            conn.close()
            return record_id
            
        except Exception as e:
            logger.error(f"Insert failed: {e}")
            return None
    
    def insert_records_batch(
        self,
        records: List[ExtractedRecord],
        skip_duplicates: bool = True,
        batch_size: int = 100
    ) -> Tuple[int, int]:
        """
        Insert multiple records in batches.
        
        Args:
            records: List of ExtractedRecord objects
            skip_duplicates: Skip duplicates
            batch_size: Number of records per transaction
            
        Returns:
            Tuple of (inserted_count, skipped_count)
        """
        inserted = 0
        skipped = 0
        
        try:
            for i in range(0, len(records), batch_size):
                batch = records[i:i+batch_size]
                
                conn = self._get_connection()
                cursor = conn.cursor()
                
                for record in batch:
                    try:
                        if skip_duplicates and self.record_exists(
                            record.artist,
                            record.album,
                            record.store_name
                        ):
                            skipped += 1
                            continue
                        
                        # Try Flask schema first
                        try:
                            cursor.execute("""
                                INSERT INTO records 
                                (artist, album, store_name, product_url, price, 
                                 year, genre, format, condition, added_date, currency)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                record.artist, record.album, record.store_name,
                                record.product_url, record.price, record.year,
                                record.genre, record.format, record.condition,
                                record.scraped_at, record.price_currency,
                            ))
                        except Exception:
                            # Fallback to old schema
                            cursor.execute("""
                                INSERT INTO records 
                                (artist, album, store_name, store_url, price, 
                                 cover_url, year, genre, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                record.artist, record.album, record.store_name,
                                record.store_url, record.price, record.cover_url,
                                record.year, record.genre, record.updated_at,
                            ))
                        
                        inserted += 1
                    except Exception as e:
                        logger.error(f"Batch insert error: {e}")
                        skipped += 1
                
                conn.commit()
                conn.close()
                logger.info(f"Batch committed: {inserted} inserted, {skipped} skipped")
            
            logger.info(f"Batch insert complete: {inserted} total inserted, {skipped} skipped")
            return inserted, skipped
            
        except Exception as e:
            logger.error(f"Batch insert failed: {e}")
            return inserted, skipped
    
    def get_record_count(self, store_name: Optional[str] = None) -> int:
        """Get total record count, optionally filtered by store."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            if store_name:
                cursor.execute("SELECT COUNT(*) as count FROM records WHERE store_name = ?", (store_name,))
            else:
                cursor.execute("SELECT COUNT(*) as count FROM records")
            
            count = cursor.fetchone()['count']
            conn.close()
            return count
            
        except Exception as e:
            logger.error(f"Count query failed: {e}")
            return 0
    
    def get_missing_prices(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get records with missing prices for completion pipeline."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT id, artist, album, store_name, product_url 
                FROM records 
                WHERE price IS NULL 
                ORDER BY id DESC 
                LIMIT ?
            """, (limit,))
            
            records = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return records
            
        except Exception as e:
            logger.error(f"Query for missing prices failed: {e}")
            return []
    
    def update_price(self, record_id: int, price: float, currency: str = "₪") -> bool:
        """Update price for a record."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE records 
                SET price = ?, updated_at = ?
                WHERE id = ?
            """, (price, datetime.now(), record_id))
            
            conn.commit()
            conn.close()
            
            if cursor.rowcount > 0:
                logger.info(f"Price updated for record {record_id}: {price} {currency}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Price update failed: {e}")
            return False
    
    def find_duplicates(self, similarity_threshold: float = 0.95) -> List[Tuple[int, int]]:
        """
        Find potential duplicate records (same artist+album from same store).
        
        Returns:
            List of (record_id1, record_id2) tuples
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Find records with same artist, album, and store
            cursor.execute("""
                SELECT r1.id, r2.id
                FROM records r1
                JOIN records r2 ON 
                    r1.artist = r2.artist AND 
                    r1.album = r2.album AND 
                    r1.store_name = r2.store_name AND
                    r1.id < r2.id
            """)
            
            duplicates = cursor.fetchall()
            conn.close()
            return duplicates
            
        except Exception as e:
            logger.error(f"Duplicate search failed: {e}")
            return []
    
    def delete_record(self, record_id: int) -> bool:
        """Delete a record by ID."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute("DELETE FROM records WHERE id = ?", (record_id,))
            conn.commit()
            conn.close()
            
            if cursor.rowcount > 0:
                logger.info(f"Record {record_id} deleted")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return False
