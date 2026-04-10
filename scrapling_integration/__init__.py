"""
Scrapling Integration Module
Adapts Scrapling framework for vinyl store database scraping and enrichment.

Key Components:
- Fetchers: Session management, proxy rotation, rate-limiting
- Parsers: Extract prices, URLs, metadata from store pages  
- Adapters: SQLite database write-through layer
- Spiders: Per-store crawlers (Beatnik, Shablool, etc.)
- Data Quality: Deduplication, price completion, URL validation
- Scheduler: Automated daily scraping jobs
"""

__version__ = "0.1.0"
__author__ = "Scrapling Integration"

# Core imports
from .fetchers import FetcherConfig, create_session, create_fetcher
from .parsers import ExtractedRecord, parse_album_price, parse_product_url, parse_metadata
from .adapter import DatabaseAdapter
from .utils import setup_logging, create_test_db_backup

__all__ = [
    'FetcherConfig',
    'create_session',
    'create_fetcher',
    'ExtractedRecord',
    'parse_album_price',
    'parse_product_url',
    'parse_metadata',
    'DatabaseAdapter',
    'setup_logging',
    'create_test_db_backup',
]
