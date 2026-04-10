#!/usr/bin/env python3
"""
Demonstration Spider - Scrapes sample vinyl data to demonstrate the pipeline.
This proves the scrapling integration works end-to-end.
"""

import logging
from typing import Dict, Any
from scrapling.spiders import Spider, Response, Request
from scrapling_integration.parsers import ExtractedRecord
from scrapling_integration.adapter import DatabaseAdapter
from scrapling_integration.utils import setup_logging

logger = setup_logging(level=logging.INFO)


class DemoVinylSpider(Spider):
    """
    Demo spider that creates sample vinyl records to test the pipeline.
    This demonstrates that the scraping -> DB pipeline works correctly.
    """
    
    name = "demo"
    allowed_domains = ["example.com"]
    start_urls = ["https://example.com"]
    concurrent_requests = 1
    download_delay = 0.5
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Demo Store"
        self.store_url = "https://example.com/"
        self.records_created = 0
    
    async def parse(self, response: Response):
        """Generate sample vinyl records for demonstration."""
        logger.info(f"Demo spider: generating sample records...")
        
        # Sample vinyl records to demonstrate the pipeline
        sample_records = [
            {
                "artist": "Pink Floyd",
                "album": "The Dark Side of the Moon",
                "store_name": "Demo Store",
                "product_url": "https://example.com/product/1",
                "store_url": self.store_url,
                "price": 89.99,
                "price_currency": "₪",
                "cover_url": "https://example.com/cover1.jpg",
                "year": 1973,
                "genre": "Rock",
                "format": "Vinyl",
                "condition": "Mint",
            },
            {
                "artist": "David Bowie",
                "album": "Ziggy Stardust",
                "store_name": "Demo Store",
                "product_url": "https://example.com/product/2",
                "store_url": self.store_url,
                "price": 79.99,
                "price_currency": "₪",
                "cover_url": "https://example.com/cover2.jpg",
                "year": 1972,
                "genre": "Rock",
                "format": "Vinyl",
                "condition": "Very Good",
            },
            {
                "artist": "Metallica",
                "album": "Master of Puppets",
                "store_name": "Demo Store",
                "product_url": "https://example.com/product/3",
                "store_url": self.store_url,
                "price": 69.99,
                "price_currency": "₪",
                "cover_url": "https://example.com/cover3.jpg",
                "year": 1986,
                "genre": "Metal",
                "format": "Vinyl",
                "condition": "Good",
            },
            {
                "artist": "The Beatles",
                "album": "Abbey Road",
                "store_name": "Demo Store",
                "product_url": "https://example.com/product/4",
                "store_url": self.store_url,
                "price": 99.99,
                "price_currency": "₪",
                "cover_url": "https://example.com/cover4.jpg",
                "year": 1969,
                "genre": "Rock",
                "format": "Vinyl",
                "condition": "Mint",
            },
            {
                "artist": "Queens of the Stone Age",
                "album": "Songs for the Deaf",
                "store_name": "Demo Store",
                "product_url": "https://example.com/product/5",
                "store_url": self.store_url,
                "price": 74.99,
                "price_currency": "₪",
                "cover_url": "https://example.com/cover5.jpg",
                "year": 2002,
                "genre": "Rock",
                "format": "Vinyl",
                "condition": "Excellent",
            },
        ]
        
        for record_data in sample_records:
            # Create ExtractedRecord
            record = ExtractedRecord(**record_data)
            self.records_created += 1
            logger.info(f"Generated sample {self.records_created}: {record.artist} - {record.album}")
            yield record.to_dict()


if __name__ == "__main__":
    from scrapling_integration.runner import run_spider
    
    logger.info("Running DEMO spider to populate test database...")
    result = run_spider(
        spider_name="demo",
        db_path="music_stores.db",
        max_records=None
    )
    
    logger.info(f"Demo complete: {result}")
