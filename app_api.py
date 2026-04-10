#!/usr/bin/env python3
"""
Desktop App API - Backend for vinyl record search
Handles database queries and data formatting
"""

import logging
from typing import Dict, List, Tuple
from backend.enhanced_database import EnhancedDatabaseManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VinylRecordAPI:
    """API for vinyl record search and filtering"""
    
    def __init__(self, db_path: str = 'vinyl_records.db'):
        """Initialize the API with database connection"""
        self.db = EnhancedDatabaseManager(db_path)
        logger.info(f"API initialized with database: {db_path}")
    
    def search_records(self, query: str = '', store: str = '', 
                      sort_by: str = 'artist', page: int = 1, 
                      per_page: int = 24) -> Dict:
        """
        Search vinyl records with filtering and pagination
        
        Args:
            query: Search term (artist or album)
            store: Filter by store name
            sort_by: Sort field (artist, album, price, store)
            page: Page number (1-indexed)
            per_page: Records per page
            
        Returns:
            Dict with records, total count, and pagination info
        """
        cursor = self.db.conn.cursor()
        
        try:
            # Build WHERE clause
            where_clauses = []
            params = []
            
            if query:
                where_clauses.append(
                    "(LOWER(artist) LIKE ? OR LOWER(album) LIKE ?)"
                )
                search_term = f"%{query.lower()}%"
                params.extend([search_term, search_term])
            
            if store:
                where_clauses.append("store_name = ?")
                params.append(store)
            
            where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
            
            # Get total count
            count_query = f"SELECT COUNT(*) FROM records{where_sql}"
            total_count = cursor.execute(count_query, params).fetchone()[0]
            
            # Build ORDER BY clause
            order_map = {
                'artist': 'artist ASC',
                'album': 'album ASC', 
                'price': 'price ASC, artist ASC',
                'store': 'store_name ASC, artist ASC',
                'newest': 'created_at DESC'
            }
            order_by = order_map.get(sort_by, 'artist ASC')
            
            # Calculate offset
            offset = (page - 1) * per_page
            
            # Execute query with pagination
            records_query = f"""
                SELECT id, artist, album, year, genre, price, cover_url, 
                       store_name, store_url
                FROM records
                {where_sql}
                ORDER BY {order_by}
                LIMIT ? OFFSET ?
            """
            params.extend([per_page, offset])
            
            cursor.execute(records_query, params)
            records = cursor.fetchall()
            
            # Format records
            formatted_records = []
            for record in records:
                formatted_records.append({
                    'id': record[0],
                    'artist': record[1],
                    'album': record[2],
                    'year': record[3],
                    'genre': record[4],
                    'price': record[5],
                    'cover_url': record[6],
                    'store': record[7],
                    'store_url': record[8]
                })
            
            total_pages = (total_count + per_page - 1) // per_page
            
            return {
                'success': True,
                'records': formatted_records,
                'total': total_count,
                'page': page,
                'total_pages': total_pages,
                'per_page': per_page
            }
            
        except Exception as e:
            logger.error(f"Search error: {e}")
            return {
                'success': False,
                'error': str(e),
                'records': [],
                'total': 0,
                'page': page,
                'total_pages': 0
            }
    
    def get_stores(self) -> Dict:
        """Get list of all stores in database"""
        try:
            cursor = self.db.conn.cursor()
            cursor.execute(
                "SELECT DISTINCT store_name FROM records ORDER BY store_name"
            )
            stores = [row[0] for row in cursor.fetchall()]
            
            # Add record counts per store
            store_info = {}
            for store in stores:
                count = cursor.execute(
                    "SELECT COUNT(*) FROM records WHERE store_name = ?",
                    (store,)
                ).fetchone()[0]
                store_info[store] = count
            
            return {
                'success': True,
                'stores': store_info
            }
        except Exception as e:
            logger.error(f"Get stores error: {e}")
            return {'success': False, 'error': str(e), 'stores': {}}
    
    def get_stats(self) -> Dict:
        """Get database statistics"""
        try:
            cursor = self.db.conn.cursor()
            
            total = cursor.execute(
                "SELECT COUNT(*) FROM records"
            ).fetchone()[0]
            
            stores = cursor.execute(
                "SELECT COUNT(DISTINCT store_name) FROM records"
            ).fetchone()[0]
            
            avg_price = cursor.execute(
                "SELECT AVG(price) FROM records WHERE price > 0"
            ).fetchone()[0]
            
            min_price = cursor.execute(
                "SELECT MIN(price) FROM records WHERE price > 0"
            ).fetchone()[0]
            
            max_price = cursor.execute(
                "SELECT MAX(price) FROM records WHERE price > 0"
            ).fetchone()[0]
            
            return {
                'success': True,
                'total_records': total,
                'total_stores': stores,
                'avg_price': round(avg_price, 2) if avg_price else 0,
                'min_price': round(min_price, 2) if min_price else 0,
                'max_price': round(max_price, 2) if max_price else 0
            }
        except Exception as e:
            logger.error(f"Get stats error: {e}")
            return {'success': False, 'error': str(e)}


# Global API instance
api = VinylRecordAPI()
