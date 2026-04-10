#!/usr/bin/env python3
"""
Automated Database Growth Scheduler Service
Orchestrates daily imports from Discogs API and Israeli store scrapers
Maintains audit logs and tracks metrics for monitoring
"""

import sys
import sqlite3
import os
import json
from datetime import datetime, timedelta
from pathlib import Path

# Ensure UTF-8 encoding
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = "dist/music_stores.db"
LOG_DIR = "logs"
METRICS_FILE = ".automation_state.json"

# Create logs directory if it doesn't exist
Path(LOG_DIR).mkdir(exist_ok=True)


class AutomationLogger:
    """Centralized logging for all automation tasks."""
    
    def __init__(self):
        self.log_file = os.path.join(LOG_DIR, "automation.log")
        self.metrics = self._load_metrics()
    
    def log(self, message, level="INFO"):
        """Write timestamped log entry."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}"
        
        # Write to file
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
        
        # Also print to console
        print(log_entry)
    
    def _load_metrics(self):
        """Load last run metrics from state file."""
        if os.path.exists(METRICS_FILE):
            try:
                with open(METRICS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def save_metrics(self, metrics):
        """Save metrics to state file for dashboard display."""
        with open(METRICS_FILE, "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2, ensure_ascii=False)


class SchedulerService:
    """Core orchestrator for automated database growth."""
    
    def __init__(self):
        self.logger = AutomationLogger()
        self.db_path = DB_PATH
        self.run_timestamp = datetime.now()
    
    def get_db_connection(self):
        """Get SQLite database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def get_record_count(self):
        """Get current record count from database."""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM records")
            count = cursor.fetchone()[0]
            conn.close()
            return count
        except Exception as e:
            self.logger.log(f"Error getting record count: {e}", "ERROR")
            return 0
    
    def check_for_duplicates(self):
        """Check if table has duplicates by (artist, album, store_name)."""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT artist, album, store_name, COUNT(*) as cnt 
                FROM records 
                GROUP BY artist, album, store_name 
                HAVING COUNT(*) > 1
                LIMIT 5
            """)
            duplicates = cursor.fetchall()
            conn.close()
            return len(duplicates)
        except Exception as e:
            self.logger.log(f"Error checking duplicates: {e}", "ERROR")
            return 0
    
    def get_store_breakdown(self):
        """Get record count by store."""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT store_name, COUNT(*) as cnt 
                FROM records 
                GROUP BY store_name 
                ORDER BY cnt DESC
            """)
            stores = {row[0]: row[1] for row in cursor.fetchall()}
            conn.close()
            return stores
        except Exception as e:
            self.logger.log(f"Error getting store breakdown: {e}", "ERROR")
            return {}
    
    def daily_automated_growth(self):
        """
        Main orchestrator method - runs daily automated growth job.
        Coordinates Discogs import + store price scraping + deduplication.
        
        Returns:
            dict: Metrics with keys: new_records, updated_prices, errors, start_time, end_time
        """
        self.run_timestamp = datetime.now()
        metrics = {
            "start_time": self.run_timestamp.isoformat(),
            "status": "in-progress",
            "discogs_new": 0,
            "discogs_skipped": 0,
            "discogs_errors": [],
            "musicbrainz_new": 0,
            "musicbrainz_skipped": 0,
            "musicbrainz_errors": [],
            "prices_updated": 0,
            "prices_errors": [],
            "duplicates_detected": 0,
            "total_records_before": 0,
            "total_records_after": 0,
            "stores_breakdown": {}
        }
        
        try:
            self.logger.log("=" * 60, "INFO")
            self.logger.log("STARTING daily_automated_growth job", "INFO")
            self.logger.log("=" * 60, "INFO")
            
            # Get baseline
            metrics["total_records_before"] = self.get_record_count()
            self.logger.log(f"Database baseline: {metrics['total_records_before']} records", "INFO")
            
            # Phase 1: Discogs import
            self.logger.log("Phase 1: Starting Discogs import...", "INFO")
            discogs_result = self._run_discogs_import()
            metrics["discogs_new"] = discogs_result.get("new", 0)
            metrics["discogs_skipped"] = discogs_result.get("skipped", 0)
            metrics["discogs_errors"] = discogs_result.get("errors", [])
            self.logger.log(f"Discogs complete: +{metrics['discogs_new']} new, {metrics['discogs_skipped']} skipped", "INFO")
            
            # Phase 1.5: MusicBrainz import (on Mondays)
            if datetime.now().weekday() == 0:  # Monday
                self.logger.log("Phase 1.5: Starting MusicBrainz import...", "INFO")
                mb_result = self._run_musicbrainz_import()
                metrics["musicbrainz_new"] = mb_result.get("new", 0)
                metrics["musicbrainz_skipped"] = mb_result.get("skipped", 0)
                metrics["musicbrainz_errors"] = mb_result.get("errors", [])
                self.logger.log(f"MusicBrainz complete: +{metrics['musicbrainz_new']} new, {metrics['musicbrainz_skipped']} skipped", "INFO")
            
            # Phase 2: Store price updates
            self.logger.log("Phase 2: Starting store price updates...", "INFO")
            prices_result = self._run_price_updates()
            metrics["prices_updated"] = prices_result.get("updated", 0)
            metrics["prices_errors"] = prices_result.get("errors", [])
            self.logger.log(f"Price updates complete: {metrics['prices_updated']} updated", "INFO")
            
            # Phase 3: Check for issues
            self.logger.log("Phase 3: Running data quality checks...", "INFO")
            metrics["duplicates_detected"] = self.check_for_duplicates()
            if metrics["duplicates_detected"] > 0:
                self.logger.log(f"⚠️  Warning: {metrics['duplicates_detected']} duplicate groups detected", "WARNING")
            
            # Get final stats
            metrics["total_records_after"] = self.get_record_count()
            metrics["stores_breakdown"] = self.get_store_breakdown()
            
            # Summary
            total_new = metrics["discogs_new"] + metrics["musicbrainz_new"] + metrics["prices_updated"]
            metrics["status"] = "success"
            metrics["end_time"] = datetime.now().isoformat()
            
            self.logger.log("=" * 60, "INFO")
            self.logger.log(f"COMPLETED daily_automated_growth - SUCCESS", "INFO")
            self.logger.log(f"  Records: {metrics['total_records_before']} → {metrics['total_records_after']} (Δ {total_new})", "INFO")
            self.logger.log(f"  Discogs: +{metrics['discogs_new']} new | {metrics['discogs_skipped']} skipped", "INFO")
            self.logger.log(f"  MusicBrainz: +{metrics['musicbrainz_new']} new | {metrics['musicbrainz_skipped']} skipped", "INFO")
            self.logger.log(f"  Prices: {metrics['prices_updated']} updated", "INFO")
            self.logger.log(f"  Duration: {(datetime.fromisoformat(metrics['end_time']) - self.run_timestamp).total_seconds():.0f}s", "INFO")
            self.logger.log("=" * 60, "INFO")
            
            # Save metrics for dashboard
            self.logger.save_metrics(metrics)
            
            return metrics
        
        except Exception as e:
            metrics["status"] = "failed"
            metrics["end_time"] = datetime.now().isoformat()
            metrics["error"] = str(e)
            
            self.logger.log("=" * 60, "ERROR")
            self.logger.log(f"FAILED daily_automated_growth - {str(e)}", "ERROR")
            self.logger.log("=" * 60, "ERROR")
            
            self.logger.save_metrics(metrics)
            return metrics
    
    def _run_discogs_import(self):
        """
        Run Discogs import (placeholder for integration with discogs_daily_batch.py).
        Returns dict with keys: new, skipped, errors
        """
        result = {"new": 0, "skipped": 0, "errors": []}
        
        try:
            # Try to import from discogs_daily_batch if it exists
            try:
                from discogs_daily_batch import DiscogsDaily
                importer = DiscogsDaily()
                batch_result = importer.run_daily_batch()
                result["new"] = batch_result.get("new_records", 0)
                result["skipped"] = batch_result.get("skipped", 0)
                result["errors"] = batch_result.get("errors", [])
                self.logger.log(f"  ✓ Discogs batch import succeeded", "INFO")
            except ImportError:
                self.logger.log("  ⚠️  discogs_daily_batch.py not found - skipping Discogs import", "WARNING")
            except Exception as e:
                self.logger.log(f"  ✗ Discogs import error: {str(e)}", "ERROR")
                result["errors"].append(str(e))
        
        except Exception as e:
            result["errors"].append(str(e))
            self.logger.log(f"  Exception in _run_discogs_import: {str(e)}", "ERROR")
        
        return result
    
    def _run_price_updates(self):
        """
        Run price update scraper (placeholder for integration with scraper_daily_prices.py).
        Returns dict with keys: updated, errors
        """
        result = {"updated": 0, "errors": []}
        
        try:
            # Try to import from scraper_daily_prices if it exists
            try:
                from scraper_daily_prices import DailyPriceScraper
                scraper = DailyPriceScraper()
                scrape_result = scraper.run_daily_scrape()
                result["updated"] = scrape_result.get("updated_count", 0)
                result["errors"] = scrape_result.get("errors", [])
                self.logger.log(f"  ✓ Price scraper succeeded", "INFO")
            except ImportError:
                self.logger.log("  ⚠️  scraper_daily_prices.py not found - skipping price updates", "WARNING")
            except Exception as e:
                self.logger.log(f"  ✗ Price scraper error: {str(e)}", "ERROR")
                result["errors"].append(str(e))
        
        except Exception as e:
            result["errors"].append(str(e))
            self.logger.log(f"  Exception in _run_price_updates: {str(e)}", "ERROR")
        
        return result
    
    def _run_musicbrainz_import(self):
        """
        Run MusicBrainz import (integration with musicbrainz_aggressive.py).
        Returns dict with keys: new, skipped, errors
        """
        result = {"new": 0, "skipped": 0, "errors": []}
        
        try:
            try:
                from musicbrainz_aggressive import AggressiveMBImporter
                importer = AggressiveMBImporter()
                mb_result = importer.run_aggressive_import()
                result["new"] = mb_result.get("added", 0)
                result["skipped"] = mb_result.get("skipped", 0)
                result["errors"] = mb_result.get("errors", [])
                self.logger.log(f"  ✓ MusicBrainz import succeeded", "INFO")
            except ImportError:
                self.logger.log("  ⚠️  musicbrainz_aggressive.py not found - skipping MusicBrainz import", "WARNING")
            except Exception as e:
                self.logger.log(f"  ✗ MusicBrainz import error: {str(e)}", "ERROR")
                result["errors"].append(str(e))
        
        except Exception as e:
            result["errors"].append(str(e))
            self.logger.log(f"  Exception in _run_musicbrainz_import: {str(e)}", "ERROR")
        
        return result


# Export the service instance
scheduler_service = SchedulerService()


if __name__ == "__main__":
    # Test run
    service = SchedulerService()
    result = service.daily_automated_growth()
    print("\n" + json.dumps(result, indent=2, ensure_ascii=False))
