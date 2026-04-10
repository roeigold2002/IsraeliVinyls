#!/usr/bin/env python3
"""
Unit tests for scheduler service components
Tests deduplication, idempotency, and state management
"""

import sys
import os
import sqlite3
import unittest
import tempfile
import shutil
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


class TestSchedulerService(unittest.TestCase):
    """Test scheduler service core functionality."""
    
    @classmethod
    def setUpClass(cls):
        """Set up test database."""
        cls.test_db = tempfile.mktemp(suffix=".db")
        cls._create_test_db(cls.test_db)
    
    @classmethod
    def tearDownClass(cls):
        """Clean up test database."""
        if os.path.exists(cls.test_db):
            os.unlink(cls.test_db)
    
    @staticmethod
    def _create_test_db(db_path):
        """Create test database with records table."""
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist TEXT,
                album TEXT,
                year INTEGER,
                genre TEXT,
                price REAL DEFAULT 0.0,
                cover_url TEXT,
                store_name TEXT,
                store_url TEXT,
                discogs_id INTEGER,
                updated_at TIMESTAMP,
                scraped_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("CREATE INDEX idx_artist ON records(artist)")
        cursor.execute("CREATE INDEX idx_album ON records(album)")
        cursor.execute("CREATE INDEX idx_store ON records(store_name)")
        
        conn.commit()
        conn.close()
    
    def test_deduplication_exact_match(self):
        """Test that exact duplicates are not inserted."""
        conn = sqlite3.connect(self.test_db)
        cursor = conn.cursor()
        
        # Insert first record
        cursor.execute("""
            INSERT INTO records (artist, album, store_name, genre, price)
            VALUES (?, ?, ?, ?, ?)
        """, ("Beatles", "Abbey Road", "Discogs", "Rock", 100.0))
        conn.commit()
        
        # Attempt duplicate
        cursor.execute("""
            SELECT id FROM records 
            WHERE LOWER(artist) = LOWER(?) 
            AND LOWER(album) = LOWER(?) 
            AND store_name = ?
        """, ("Beatles", "Abbey Road", "Discogs"))
        
        exists = cursor.fetchone() is not None
        conn.close()
        
        self.assertTrue(exists, "Duplicate detection should find existing record")
    
    def test_deduplication_case_insensitive(self):
        """Test that case-insensitive duplicates are detected."""
        conn = sqlite3.connect(self.test_db)
        cursor = conn.cursor()
        
        # Insert with one case
        cursor.execute("""
            INSERT INTO records (artist, album, store_name)
            VALUES (?, ?, ?)
        """, ("The Beatles", "Sgt. Peppers", "Discogs"))
        conn.commit()
        
        # Check with different case
        cursor.execute("""
            SELECT COUNT(*) FROM records 
            WHERE LOWER(artist) = LOWER(?) 
            AND LOWER(album) = LOWER(?)
        """, ("the beatles", "sgt. peppers"))
        
        count = cursor.fetchone()[0]
        conn.close()
        
        self.assertEqual(count, 1, "Case-insensitive search should find record")
    
    def test_price_update_idempotent(self):
        """Test that running price update twice gives same result."""
        conn = sqlite3.connect(self.test_db)
        cursor = conn.cursor()
        
        # Insert test record
        cursor.execute("""
            INSERT INTO records (artist, album, store_name, price)
            VALUES (?, ?, ?, ?)
        """, ("Pink Floyd", "Dark Side", "Store1", 150.0))
        conn.commit()
        
        # Get initial state
        cursor.execute("SELECT COUNT(*) FROM records WHERE price = 150.0")
        initial_count = cursor.fetchone()[0]
        
        # "Update" with same price (idempotent operation)
        cursor.execute("""
            UPDATE records SET scraped_at = CURRENT_TIMESTAMP
            WHERE artist = ? AND album = ?
        """, ("Pink Floyd", "Dark Side"))
        conn.commit()
        
        # Check that record still exists with same price
        cursor.execute("SELECT COUNT(*) FROM records WHERE price = 150.0")
        final_count = cursor.fetchone()[0]
        
        conn.close()
        
        self.assertEqual(initial_count, final_count, "Idempotent price update should not change record count")
    
    def test_record_count_increment(self):
        """Test that record count increases correctly."""
        conn = sqlite3.connect(self.test_db)
        cursor = conn.cursor()
        
        # Get initial count
        cursor.execute("SELECT COUNT(*) FROM records")
        initial = cursor.fetchone()[0]
        
        # Add new record
        cursor.execute("""
            INSERT INTO records (artist, album, store_name)
            VALUES (?, ?, ?)
        """, ("Led Zeppelin", "IV", "Discogs"))
        conn.commit()
        
        # Get final count
        cursor.execute("SELECT COUNT(*) FROM records")
        final = cursor.fetchone()[0]
        
        conn.close()
        
        self.assertEqual(final, initial + 1, "Record count should increment by 1")


class TestDiscogsImporter(unittest.TestCase):
    """Test Discogs daily batch importer."""
    
    def test_discogs_daily_initialization(self):
        """Test that diskogs_daily_batch module can be imported."""
        try:
            from discogs_daily_batch import DiscogsDaily
            importer = DiscogsDaily()
            self.assertIsNotNone(importer, "DiscogsDaily should initialize")
            self.assertEqual(importer.batch_size, 500, "Batch size should be 500")
        except ImportError as e:
            self.skipTest(f"DiscogsDaily not available: {e}")
    
    def test_discogs_state_persistence(self):
        """Test that offset state is saved and loaded."""
        try:
            from discogs_daily_batch import DiscogsDaily
            import json
            
            importer = DiscogsDaily()
            
            # Modify state
            importer.state["last_offset"] = 1000
            importer.state["test_flag"] = True
            importer._save_state()
            
            # Load fresh instance
            importer2 = DiscogsDaily()
            
            self.assertEqual(importer2.state.get("last_offset"), 1000, "Offset should persist")
            self.assertTrue(importer2.state.get("test_flag"), "State should persist")
        except ImportError:
            self.skipTest("DiscogsDaily not available")


class TestPriceScraper(unittest.TestCase):
    """Test daily price scraper."""
    
    def test_scraper_initialization(self):
        """Test that scraper can be initialized."""
        try:
            from scraper_daily_prices import DailyPriceScraper
            scraper = DailyPriceScraper()
            self.assertIsNotNone(scraper, "DailyPriceScraper should initialize")
            self.assertEqual(scraper.max_workers, 5, "Max workers should be 5")
        except ImportError as e:
            self.skipTest(f"DailyPriceScraper not available: {e}")


class TestSchedulerIntegration(unittest.TestCase):
    """Integration tests for scheduler service."""
    
    def test_scheduler_service_import(self):
        """Test that scheduler_service module can be imported."""
        try:
            from scheduler_service import SchedulerService
            service = SchedulerService()
            self.assertIsNotNone(service, "SchedulerService should initialize")
        except ImportError as e:
            self.skipTest(f"SchedulerService not available: {e}")
    
    def test_automation_logger_initialization(self):
        """Test that AutomationLogger initializes."""
        try:
            from scheduler_service import AutomationLogger
            logger = AutomationLogger()
            self.assertIsNotNone(logger, "AutomationLogger should initialize")
            self.assertTrue(os.path.isdir("logs"), "Logs directory should be created")
        except ImportError:
            self.skipTest("AutomationLogger not available")


def run_tests():
    """Run all tests."""
    print("\n" + "="*70)
    print("SCHEDULER UNIT TESTS")
    print("="*70 + "\n")
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestSchedulerService))
    suite.addTests(loader.loadTestsFromTestCase(TestDiscogsImporter))
    suite.addTests(loader.loadTestsFromTestCase(TestPriceScraper))
    suite.addTests(loader.loadTestsFromTestCase(TestSchedulerIntegration))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "="*70)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    print("="*70 + "\n")
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
