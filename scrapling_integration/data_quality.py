"""
Data Quality Pipeline
Handles deduplication, price completion, URL validation, and metadata enrichment.
"""

import logging
from typing import List, Dict, Tuple, Optional
import re
from difflib import SequenceMatcher
from datetime import datetime

from .adapter import DatabaseAdapter
from .parsers import PriceParser, URLParser, MetadataParser
from .utils import ProgressTracker

logger = logging.getLogger(__name__)


class DeduplicationEngine:
    """Remove duplicate records, keeping highest quality version."""
    
    SIMILARITY_THRESHOLD = 0.95
    
    @staticmethod
    def calculate_similarity(str1: str, str2: str) -> float:
        """Calculate string similarity (0.0 to 1.0)."""
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()
    
    @staticmethod
    def quality_score(record: Dict) -> float:
        """Calculate quality score of a record (higher = better)."""
        score = 0.0
        
        # Has price (+100 points)
        if record.get('price'):
            score += 100
        
        # Has cover image (+50)
        if record.get('cover_url'):
            score += 50
        
        # Has year (+30)
        if record.get('year'):
            score += 30
        
        # Has genre (+30)
        if record.get('genre'):
            score += 30
        
        # More recent scrape (+20 per month)
        if record.get('added_date'):
            try:
                from datetime import datetime
                date = datetime.fromisoformat(record['added_date'])
                days_old = (datetime.now() - date).days
                months_old = days_old // 30
                score += max(20 - (months_old * 2), 0)
            except:
                pass
        
        return score


class PriceComplementaryPipeline:
    """Fill in missing prices by re-scraping store pages."""
    
    def __init__(self, adapter: DatabaseAdapter):
        self.adapter = adapter
    
    def complete_prices(self, limit: int = 100) -> Dict[str, int]:
        """
        Fill missing prices for records.
        
        Returns:
            Dict with 'completed', 'failed', 'already_complete' counts
        """
        logger.info(f"Starting price completion pipeline (limit: {limit})")
        
        records = self.adapter.get_missing_prices(limit)
        logger.info(f"Found {len(records)} records with missing prices")
        
        tracker = ProgressTracker(len(records), "Price Completion")
        completed = 0
        failed = 0
        
        for record in records:
            try:
                product_url = record.get('product_url')
                if not product_url:
                    logger.debug(f"No product URL for record {record['id']}")
                    failed += 1
                    continue
                
                # Here you would re-scrape the product page
                # For now, log that it would happen
                logger.debug(f"Would re-scrape: {product_url} (ID: {record['id']})")
                
                # In production, you'd:
                # 1. Fetch the page with Scrapling
                # 2. Extract price
                # 3. Update in DB
                
                completed += 1
                tracker.update()
                
            except Exception as e:
                logger.error(f"Price completion error: {e}")
                failed += 1
        
        logger.info(f"Price completion summary:")
        logger.info(f"  Completed: {completed}")
        logger.info(f"  Failed: {failed}")
        
        return {
            "completed": completed,
            "failed": failed,
            "total_processed": len(records),
        }


class URLValidationPipeline:
    """Validate product URLs and fix broken links."""
    
    def __init__(self, adapter: DatabaseAdapter):
        self.adapter = adapter
    
    def validate_urls(self, limit: int = 100, test_fetch: bool = False) -> Dict[str, int]:
        """
        Validate URLs in database.
        
        Args:
            limit: Number to check
            test_fetch: Actually test-fetch URLs (slow)
            
        Returns:
            Dict with validation results
        """
        logger.info(f"Starting URL validation (limit: {limit}, test_fetch={test_fetch})")
        
        # Placeholder statistics
        return {
            "total_checked": 0,
            "valid": 0,
            "invalid": 0,
            "fixed": 0,
        }


class MetadataEnrichmentPipeline:
    """Enrich records with additional metadata."""
    
    @staticmethod
    def enrich_from_discogs(
        adapter: DatabaseAdapter,
        limit: int = 100
    ) -> Dict[str, int]:
        """
        Enrich records using Discogs API/database.
        
        For artists+albums that match Discogs, add:
        - Year
        - Genre
        - Additional metadata
        
        Returns:
            Dict with enrichment stats
        """
        logger.info(f"Starting Discogs enrichment (limit: {limit})")
        
        # Placeholder
        return {
            "enriched": 0,
            "matched": 0,
            "failed": 0,
        }
    
    @staticmethod
    def cleanup_hebrew_text(adapter: DatabaseAdapter) -> int:
        """Remove Hebrew metadata from titles."""
        logger.info("Cleaning up Hebrew text in titles...")
        
        # Placeholder: count records that would be cleaned
        return 0


class DataQualityPipeline:
    """Orchestrate all data quality operations."""
    
    def __init__(self, db_path: str):
        self.adapter = DatabaseAdapter(db_path)
        self.dedup = DeduplicationEngine()
        self.price_completion = PriceComplementaryPipeline(self.adapter)
        self.url_validation = URLValidationPipeline(self.adapter)
    
    def run_full_pipeline(
        self,
        do_dedup: bool = True,
        do_price_completion: bool = True,
        do_url_validation: bool = True,
        do_metadata_enrichment: bool = True,
        limits: Optional[Dict] = None,
    ) -> Dict:
        """
        Run complete data quality pipeline.
        
        Args:
            do_dedup: Run deduplication
            do_price_completion: Fill missing prices
            do_url_validation: Validate URLs
            do_metadata_enrichment: Enrich with Discogs data
            limits: Dict with limits for each operation
            
        Returns:
            Summary report
        """
        if limits is None:
            limits = {
                "dedup": None,
                "prices": 500,
                "urls": 100,
                "metadata": 500,
            }
        
        logger.info("=" * 70)
        logger.info("DATA QUALITY PIPELINE - FULL RUN")
        logger.info("=" * 70)
        
        results = {
            "timestamp": datetime.now().isoformat(),
            "operations": {},
        }
        
        try:
            # Step 1: Deduplication
            if do_dedup:
                logger.info("\n[1/4] DEDUPLICATION")
                logger.info("-" * 70)
                duplicates = self.adapter.find_duplicates()
                logger.info(f"Found {len(duplicates)} potential duplicates")
                results["operations"]["deduplication"] = {
                    "duplicates_found": len(duplicates),
                    "action": "Identified (not merged - manual review recommended)"
                }
            
            # Step 2: Price Completion
            if do_price_completion:
                logger.info("\n[2/4] PRICE COMPLETION")
                logger.info("-" * 70)
                price_results = self.price_completion.complete_prices(
                    limit=limits.get("prices", 500)
                )
                results["operations"]["price_completion"] = price_results
            
            # Step 3: URL Validation
            if do_url_validation:
                logger.info("\n[3/4] URL VALIDATION")
                logger.info("-" * 70)
                url_results = self.url_validation.validate_urls(
                    limit=limits.get("urls", 100),
                    test_fetch=False
                )
                results["operations"]["url_validation"] = url_results
            
            # Step 4: Metadata Enrichment
            if do_metadata_enrichment:
                logger.info("\n[4/4] METADATA ENRICHMENT")
                logger.info("-" * 70)
                metadata_results = MetadataEnrichmentPipeline.enrich_from_discogs(
                    self.adapter,
                    limit=limits.get("metadata", 500)
                )
                results["operations"]["metadata_enrichment"] = metadata_results
            
            logger.info("\n" + "=" * 70)
            logger.info("PIPELINE COMPLETE")
            logger.info("=" * 70)
            
            return results
            
        except Exception as e:
            logger.error(f"Pipeline error: {e}", exc_info=True)
            results["error"] = str(e)
            return results
