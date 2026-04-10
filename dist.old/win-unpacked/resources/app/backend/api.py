import webbrowser
from typing import List, Dict, Optional
from backend.database import DatabaseManager
from backend.scraper import ScraperEngine
import threading
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BackendAPI:
    """API bridge between pywebview frontend and Python backend."""
    
    def __init__(self, db_manager: DatabaseManager, scraper: ScraperEngine):
        self.db = db_manager
        self.scraper = scraper
        self.is_scraping = False
        self.scrape_status = {
            'status': 'idle',
            'progress': 0,
            'total_records': 0,
            'message': ''
        }
    
    def get_records(self, search_term: str = "", store: str = "", 
                   sort_by: str = "price", sort_order: str = "ASC") -> Dict:
        """
        Get records with optional filtering and sorting.
        Returns JSON-serializable dict with records and metadata.
        """
        try:
            records = self.db.search_records(
                search_term=search_term,
                store=store,
                sort_by=sort_by,
                sort_order=sort_order
            )
            
            stores = self.db.get_stores()
            
            return {
                'success': True,
                'records': records,
                'stores': stores,
                'total_count': len(records),
                'error': None
            }
        except Exception as e:
            logger.error(f"Error getting records: {e}")
            return {
                'success': False,
                'records': [],
                'stores': [],
                'total_count': 0,
                'error': str(e)
            }
    
    def refresh_data(self) -> Dict:
        """
        Trigger a refresh of all vinyl record data from stores.
        Runs in background thread to avoid blocking UI.
        """
        if self.is_scraping:
            return {
                'success': False,
                'message': 'Scraping already in progress',
                'status': 'in_progress'
            }
        
        def scrape_background():
            try:
                self.is_scraping = True
                self.scrape_status['status'] = 'scraping'
                self.scrape_status['message'] = 'Starting scrape...'
                self.scrape_status['progress'] = 0
                
                # Clear old records
                self.db.clear_records()
                self.scrape_status['message'] = 'Cleared old data'
                
                # Scrape all stores
                records = self.scraper.scrape_all_stores()
                
                # Insert into database
                if records:
                    self.scrape_status['message'] = f'Inserting {len(records)} records...'
                    inserted = self.db.insert_batch(records)
                    self.scrape_status['total_records'] = inserted
                    self.scrape_status['message'] = f'Successfully scraped {inserted} records'
                    self.scrape_status['progress'] = 100
                else:
                    self.scrape_status['message'] = 'No records found'
                
                self.scrape_status['status'] = 'complete'
                
            except Exception as e:
                logger.error(f"Scraping error: {e}")
                self.scrape_status['status'] = 'error'
                self.scrape_status['message'] = f'Scraping failed: {str(e)}'
            finally:
                self.is_scraping = False
        
        # Start scraping in background thread
        thread = threading.Thread(target=scrape_background, daemon=True)
        thread.start()
        
        return {
            'success': True,
            'message': 'Scraping started in background',
            'status': 'started'
        }
    
    def get_scrape_status(self) -> Dict:
        """Get current scraping status."""
        return self.scrape_status
    
    def open_store_link(self, url: str) -> Dict:
        """Open a store link in the default browser."""
        try:
            webbrowser.open(url)
            return {'success': True, 'message': 'Opening store link'}
        except Exception as e:
            logger.error(f"Error opening link: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_stats(self) -> Dict:
        """Get database statistics."""
        try:
            total = self.db.get_record_count()
            stores = self.db.get_stores()
            
            return {
                'success': True,
                'total_records': total,
                'total_stores': len(stores),
                'stores': stores
            }
        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            return {
                'success': False,
                'error': str(e)
            }
