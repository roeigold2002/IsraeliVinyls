"""
Flask Integration Module
Provides REST API endpoints for running spiders and managing scraped data.

Endpoints:
- POST /api/scrape/<spider_name> - Run a spider
- GET /api/scrape/status - Get scrape status
- GET /api/records/count - Get total record count
- POST /api/quality-check - Run data quality pipeline
"""

import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional

from flask import Blueprint, jsonify, request
from .store_spiders import SPIDERS
from .runner import run_spider
from .adapter import DatabaseAdapter
from .data_quality import DataQualityPipeline
from .utils import setup_logging

logger = setup_logging(level=logging.INFO)

# Create blueprint
scraper_bp = Blueprint('scraper', __name__, url_prefix='/api')

# Global state for spider runs
SCRAPE_JOBS = {}
DB_PATH = "music_stores.db"


@scraper_bp.route('/scrape/<spider_name>', methods=['POST'])
def start_scrape(spider_name: str):
    """
    Start a scraping job.
    
    Query parameters:
    - records: Max records to scrape (optional)
    - dev_mode: Use development mode with caching (optional)
    
    Returns:
        Job info with job_id
    """
    if spider_name not in SPIDERS:
        return jsonify({
            "error": f"Unknown spider: {spider_name}",
            "available": list(SPIDERS.keys())
        }), 400
    
    # Get parameters
    max_records = request.args.get('records', type=int)
    dev_mode = request.args.get('dev_mode', 'false').lower() == 'true'
    
    # Generate job ID
    job_id = f"{spider_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Create job record
    job_info = {
        "job_id": job_id,
        "spider": spider_name,
        "status": "running",
        "started": datetime.now().isoformat(),
        "max_records": max_records,
        "dev_mode": dev_mode,
        "result": None,
    }
    
    SCRAPE_JOBS[job_id] = job_info
    
    # Run spider in background thread
    def run_job():
        try:
            logger.info(f"Starting job {job_id}")
            result = run_spider(
                spider_name=spider_name,
                db_path=DB_PATH,
                max_records=max_records,
                dev_mode=dev_mode,
            )
            
            job_info["status"] = "completed"
            job_info["result"] = result
            job_info["completed"] = datetime.now().isoformat()
            
            logger.info(f"Job {job_id} completed: {result}")
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}", exc_info=True)
            job_info["status"] = "failed"
            job_info["error"] = str(e)
            job_info["completed"] = datetime.now().isoformat()
    
    thread = threading.Thread(target=run_job, daemon=True)
    thread.start()
    
    return jsonify(job_info), 202


@scraper_bp.route('/scrape/status/<job_id>', methods=['GET'])
def get_scrape_status(job_id: str):
    """Get status of a scraping job."""
    if job_id not in SCRAPE_JOBS:
        return jsonify({"error": f"Job not found: {job_id}"}), 404
    
    return jsonify(SCRAPE_JOBS[job_id]), 200


@scraper_bp.route('/records/count', methods=['GET'])
def get_record_count():
    """Get total record count in database."""
    try:
        adapter = DatabaseAdapter(DB_PATH)
        total = adapter.get_record_count()
        
        return jsonify({
            "total_records": total,
            "database": DB_PATH,
            "timestamp": datetime.now().isoformat(),
        }), 200
        
    except Exception as e:
        logger.error(f"Count query failed: {e}")
        return jsonify({"error": str(e)}), 500


@scraper_bp.route('/quality-check', methods=['POST'])
def run_quality_check():
    """
    Run data quality pipeline.
    
    JSON body:
    {
        "dedup": true,
        "prices": true,
        "urls": true,
        "metadata": true,
        "limits": {
            "prices": 500,
            "urls": 100,
            "metadata": 500
        }
    }
    """
    try:
        data = request.get_json() or {}
        
        # Extract options
        do_dedup = data.get("dedup", True)
        do_prices = data.get("prices", True)
        do_urls = data.get("urls", True)
        do_metadata = data.get("metadata", True)
        limits = data.get("limits", {})
        
        # Run pipeline
        pipeline = DataQualityPipeline(DB_PATH)
        result = pipeline.run_full_pipeline(
            do_dedup=do_dedup,
            do_price_completion=do_prices,
            do_url_validation=do_urls,
            do_metadata_enrichment=do_metadata,
            limits=limits,
        )
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Quality check failed: {e}")
        return jsonify({"error": str(e)}), 500


@scraper_bp.route('/spiders', methods=['GET'])
def list_spiders():
    """List available spiders."""
    spider_info = {}
    
    for name, SpiderClass in SPIDERS.items():
        try:
            spider = SpiderClass()
            spider_info[name] = {
                "name": spider.name,
                "allowed_domains": spider.allowed_domains,
                "start_urls": spider.start_urls,
                "concurrent_requests": spider.concurrent_requests,
            }
        except:
            pass
    
    return jsonify({
        "available_spiders": list(SPIDERS.keys()),
        "details": spider_info,
    }), 200


def register_scraper_routes(app):
    """Register scraper blueprint with Flask app."""
    app.register_blueprint(scraper_bp)
    logger.info("Scraper API routes registered")
