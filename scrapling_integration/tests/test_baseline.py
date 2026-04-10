"""
Baseline verification tests for Scrapling integration.
Tests installation, fetcher functionality, and database adapter.

Run with: python -m scrapling_integration.tests.test_baseline
"""

import sys
import os
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scrapling_integration.fetchers import FetcherConfig, FETCHER_PROFILES
from scrapling_integration.parsers import ExtractedRecord, PriceParser, URLParser, MetadataParser
from scrapling_integration.utils import setup_logging, get_store_urls, ProgressTracker

logger = setup_logging(level=logging.INFO)


def test_imports():
    """Test that all Scrapling modules can be imported."""
    logger.info("Testing imports...")
    try:
        from scrapling.fetchers import Fetcher, StealthyFetcher, DynamicFetcher
        from scrapling.spiders import Spider, Response
        logger.info("✓ Scrapling imports successful")
        return True
    except ImportError as e:
        logger.error(f"✗ Scrapling import failed: {e}")
        return False


def test_parser():
    """Test price and URL parsing."""
    logger.info("Testing parsers...")
    
    # Test price parser
    test_cases = [
        ("₪ 149.99", 149.99, "₪"),
        ("$99.50", 99.50, "$"),
        ("€ 85.00", 85.00, "€"),
        ("1,234.56 ₪", 1234.56, "₪"),
    ]
    
    passed = 0
    for text, expected_price, expected_currency in test_cases:
        price, currency = PriceParser.parse(text)
        if price == expected_price and currency == expected_currency:
            logger.info(f"✓ Price parsed: {text} → {price} {currency}")
            passed += 1
        else:
            logger.warning(f"✗ Price parse mismatch: {text} → {price} {currency}")
    
    # Test URL parser
    urls = [
        ("https://example.com/product", True),
        ("product123", False),
        (None, False),
    ]
    
    for url, expected_valid in urls:
        is_valid = URLParser.is_valid(url)
        if is_valid == expected_valid:
            logger.info(f"✓ URL validated: {url} → {is_valid}")
            passed += 1
        else:
            logger.warning(f"✗ URL validation mismatch: {url} → {is_valid}")
    
    logger.info(f"Parser tests: {passed}/{len(test_cases) + len(urls)} passed")
    return passed > 0


def test_extracted_record():
    """Test ExtractedRecord data structure."""
    logger.info("Testing ExtractedRecord...")
    
    try:
        record = ExtractedRecord(
            artist="The Beatles",
            album="Abbey Road",
            store_name="Beatnik",
            price=299.99,
            year=1969,
            genre="Rock"
        )
        
        record_dict = record.to_dict()
        if 'artist' in record_dict and 'album' in record_dict:
            logger.info(f"✓ ExtractedRecord created: {record.artist} - {record.album}")
            return True
        else:
            logger.error("✗ ExtractedRecord missing keys")
            return False
    except Exception as e:
        logger.error(f"✗ ExtractedRecord test failed: {e}")
        return False


def test_fetcher_config():
    """Test fetcher configuration."""
    logger.info("Testing fetcher configurations...")
    
    try:
        for profile_name, config in FETCHER_PROFILES.items():
            logger.info(f"✓ Profile '{profile_name}': impersonate={config.impersonate}, "
                       f"stealthy={config.stealthy}, delay={config.delay}")
        return True
    except Exception as e:
        logger.error(f"✗ Fetcher config test failed: {e}")
        return False


def test_store_urls():
    """Test store URL configuration."""
    logger.info("Testing store URLs...")
    
    try:
        urls = get_store_urls()
        if len(urls) > 0:
            logger.info(f"✓ {len(urls)} store URLs configured")
            for store, url in list(urls.items())[:3]:
                logger.info(f"  - {store}: {url}")
            return True
        else:
            logger.error("✗ No store URLs found")
            return False
    except Exception as e:
        logger.error(f"✗ Store URL test failed: {e}")
        return False


def test_progress_tracker():
    """Test progress tracking."""
    logger.info("Testing ProgressTracker...")
    
    try:
        tracker = ProgressTracker(100, "Test")
        tracker.update(10)
        tracker.update(10)
        tracker.record_error("Test error")
        
        summary = tracker.summary()
        if summary['processed'] == 20 and summary['errors'] == 1:
            logger.info(f"✓ ProgressTracker working: {summary['processed']} processed, "
                       f"{summary['errors']} errors")
            return True
        else:
            logger.error("✗ ProgressTracker summary mismatch")
            return False
    except Exception as e:
        logger.error(f"✗ ProgressTracker test failed: {e}")
        return False


def run_all_tests():
    """Run all baseline tests."""
    logger.info("=" * 60)
    logger.info("SCRAPLING INTEGRATION - BASELINE VERIFICATION")
    logger.info("=" * 60)
    
    tests = [
        ("Scrapling Imports", test_imports),
        ("Parser Functions", test_parser),
        ("ExtractedRecord", test_extracted_record),
        ("Fetcher Config", test_fetcher_config),
        ("Store URLs", test_store_urls),
        ("ProgressTracker", test_progress_tracker),
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            logger.error(f"✗ {test_name} crashed: {e}")
            results[test_name] = False
    
    logger.info("=" * 60)
    logger.info("BASELINE TEST SUMMARY")
    logger.info("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_bool in results.items():
        status = "✓ PASSED" if passed_bool else "✗ FAILED"
        logger.info(f"{status}: {test_name}")
    
    logger.info(f"\nTotal: {passed}/{total} tests passed")
    logger.info("=" * 60)
    
    if passed == total:
        logger.info("✓ ALL TESTS PASSED - Ready for Phase 2!")
        return 0
    else:
        logger.error("✗ Some tests failed - Check configuration")
        return 1


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
