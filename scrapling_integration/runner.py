"""
Spider runner script - Execute Scrapling spiders with database integration.
Handles spider execution, error recovery, and result persistence.

Usage:
    python scrapling_integration/runner.py beatnik
    python scrapling_integration/runner.py shablool --records 1000
    python scrapling_integration/runner.py taklit_house --dev-mode
"""

import asyncio
import logging
import sys
from argparse import ArgumentParser
from pathlib import Path
from typing import Optional

from .store_spiders import BeatnikSpider, ShabloolSpider, TaklitHouseSpider
from .expanded_spiders import (
    ThirdEarSpider, DiscCenterSpider, Tav8Spider, GioraRecordsSpider,
    HasivoovSpider, TheVinylRoomSpider, MyRecordsSpider, VinylStockSpider,
    RollingDiceSpider
)
from .adapter import DatabaseAdapter
from .utils import setup_logging, ProgressTracker, save_scrape_metrics

logger = setup_logging(level=logging.INFO)

# Spider registry - ALL 12 Israeli vinyl stores
SPIDERS = {
    # Original 3 stores
    'beatnik': BeatnikSpider,
    'shablool': ShabloolSpider,
    'taklit_house': TaklitHouseSpider,
    # 9 Additional stores
    'third_ear': ThirdEarSpider,
    'disc_center': DiscCenterSpider,
    'tav8': Tav8Spider,
    'giora_records': GioraRecordsSpider,
    'hasivoov': HasivoovSpider,
    'vinyl_room': TheVinylRoomSpider,
    'my_records': MyRecordsSpider,
    'vinyl_stock': VinylStockSpider,
    'rolling_dice': RollingDiceSpider,
}

DB_PATH = "music_stores.db"
TEST_DB_PATH = "test_db/music_stores_test.db"


def run_spider(
    spider_name: str,
    db_path: str = DB_PATH,
    max_records: Optional[int] = None,
    dev_mode: bool = False,
    crawldir: Optional[str] = None,
) -> dict:
    """
    Run a scraper spider and save results to database.
    
    Args:
        spider_name: Name of spider to run (beatnik, shablool, etc.)
        db_path: Database path to write results
        max_records: Stop after N records (for testing)
        dev_mode: Use development mode with response caching
        crawldir: Directory for pause/resume checkpoints
        
    Returns:
        Dictionary with execution stats
    """
    if spider_name not in SPIDERS:
        logger.error(f"Unknown spider: {spider_name}")
        logger.info(f"Available spiders: {list(SPIDERS.keys())}")
        return {"success": False, "error": f"Unknown spider: {spider_name}"}
    
    Spider = SPIDERS[spider_name]
    
    logger.info("=" * 70)
    logger.info(f"SCRAPLING SPIDER RUNNER: {spider_name.upper()}")
    logger.info("=" * 70)
    logger.info(f"Database: {db_path}")
    logger.info(f"Dev Mode: {dev_mode}")
    if max_records:
        logger.info(f"Max Records: {max_records}")
    if crawldir:
        logger.info(f"Crawl Dir: {crawldir} (Pause/Resume)")
    
    try:
        # Initialize spider with no custom kwargs (Scrapling Spider doesn't accept custom ones)
        # Dev mode and crawldir are handled by Scrapling's internal configuration
        spider = Spider()
        
        # Run spider
        logger.info(f"\nStarting spider: {spider_name}...")
        result = spider.start()
        
        items = result.items
        logger.info(f"Spider completed. Items yielded: {len(items)}")
        
        # Database adapter
        adapter = DatabaseAdapter(db_path)
        
        # Prepare records for insertion
        records_to_insert = []
        for item in items:
            # Convert dict back to ExtractedRecord for consistency
            # Skip if max_records reached
            if max_records and len(records_to_insert) >= max_records:
                logger.info(f"Reached max records limit: {max_records}")
                break
            
            records_to_insert.append(item)
        
        logger.info(f"\nInserting {len(records_to_insert)} records into database...")
        
        # Batch insert
        inserted, skipped = adapter.insert_records_batch(
            records_to_insert,
            skip_duplicates=True,
            batch_size=100
        )
        
        logger.info(f"Database update complete:")
        logger.info(f"  - Inserted: {inserted}")
        logger.info(f"  - Skipped (duplicates): {skipped}")
        
        total_records = adapter.get_record_count(spider.store_name if hasattr(spider, 'store_name') else None)
        logger.info(f"  - Total records in store: {total_records:,}")
        
        metrics = {
            "spider": spider_name,
            "success": True,
            "items_yielded": len(items),
            "records_inserted": inserted,
            "records_skipped": skipped,
            "database_path": db_path,
            "dev_mode": dev_mode,
        }
        
        # Save metrics
        save_scrape_metrics(metrics, f"scrape_metrics_{spider_name}.json")
        
        logger.info("=" * 70)
        logger.info("SPIDER EXECUTION COMPLETE")
        logger.info("=" * 70)
        
        return metrics
        
    except Exception as e:
        logger.error(f"Spider execution failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "spider": spider_name,
        }


def main():
    """Command-line interface for spider runner."""
    parser = ArgumentParser(description="Run Scrapling spiders for vinyl stores")
    
    parser.add_argument(
        "spider",
        choices=list(SPIDERS.keys()),
        help="Spider to run"
    )
    
    parser.add_argument(
        "--db",
        default=TEST_DB_PATH,
        help=f"Database path (default: {TEST_DB_PATH})"
    )
    
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Use production database (default: test DB for safety)"
    )
    
    parser.add_argument(
        "--records",
        type=int,
        help="Maximum records to scrape (for testing)"
    )
    
    parser.add_argument(
        "--dev-mode",
        action="store_true",
        help="Use development mode with response caching"
    )
    
    parser.add_argument(
        "--resume",
        help="Resume from checkpoint directory"
    )
    
    args = parser.parse_args()
    
    # Determine database
    db_path = DB_PATH if args.prod else TEST_DB_PATH
    if args.db:
        db_path = args.db
    
    # Run spider
    metrics = run_spider(
        spider_name=args.spider,
        db_path=db_path,
        max_records=args.records,
        dev_mode=args.dev_mode,
        crawldir=args.resume,
    )
    
    # Exit with appropriate code
    sys.exit(0 if metrics.get("success", False) else 1)


if __name__ == "__main__":
    main()
