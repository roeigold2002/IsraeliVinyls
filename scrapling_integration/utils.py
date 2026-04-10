"""
Utility functions for Scrapling integration.
Includes logging setup, database backup, and helper functions.
"""

import os
import shutil
import logging
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

# Configure logging format
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(
    log_dir: str = "logs",
    log_file: str = "scrapling.log",
    level: int = logging.INFO
) -> logging.Logger:
    """
    Set up logging for Scrapling integration.
    
    Args:
        log_dir: Directory for log files
        log_file: Log file name
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        
    Returns:
        Configured logger
    """
    # Create log directory if it doesn't exist
    os.makedirs(log_dir, exist_ok=True)
    
    log_path = os.path.join(log_dir, log_file)
    
    # Create logger
    logger = logging.getLogger("scrapling_integration")
    logger.setLevel(level)
    
    # File handler
    file_handler = logging.FileHandler(log_path)
    file_handler.setLevel(level)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))
    
    # Add handlers
    if logger.hasHandlers():
        logger.handlers.clear()
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    logger.info(f"Logging initialized: {log_path}")
    return logger


def create_test_db_backup(db_path: str, backup_dir: str = "backups") -> Optional[str]:
    """
    Create a backup copy of the database for testing.
    
    Args:
        db_path: Path to original database
        backup_dir: Directory to store backup
        
    Returns:
        Path to backup file or None if failed
    """
    try:
        if not os.path.exists(db_path):
            logging.error(f"Database not found: {db_path}")
            return None
        
        os.makedirs(backup_dir, exist_ok=True)
        
        # Create timestamped backup
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"music_stores_backup_{timestamp}.db"
        backup_path = os.path.join(backup_dir, backup_name)
        
        shutil.copy2(db_path, backup_path)
        
        logging.info(f"Database backup created: {backup_path}")
        return backup_path
        
    except Exception as e:
        logging.error(f"Backup creation failed: {e}")
        return None


def create_test_db_copy(db_path: str, test_db_path: str) -> bool:
    """
    Create a test database copy to avoid modifying production DB.
    
    Args:
        db_path: Source database
        test_db_path: Target test database
        
    Returns:
        True if successful
    """
    try:
        if not os.path.exists(db_path):
            logging.error(f"Source database not found: {db_path}")
            return False
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(test_db_path), exist_ok=True)
        
        shutil.copy2(db_path, test_db_path)
        logging.info(f"Test database created: {test_db_path}")
        return True
        
    except Exception as e:
        logging.error(f"Test database creation failed: {e}")
        return False


def save_scrape_metrics(
    metrics: dict,
    output_file: str = "scrape_metrics.json"
):
    """
    Save scrape metrics to JSON file for analysis.
    
    Args:
        metrics: Dictionary of metrics (records, errors, duration, etc.)
        output_file: Path to output file
    """
    try:
        metrics['timestamp'] = datetime.now().isoformat()
        
        with open(output_file, 'w') as f:
            json.dump(metrics, f, indent=2)
        
        logging.info(f"Metrics saved: {output_file}")
    except Exception as e:
        logging.error(f"Metrics save failed: {e}")


def load_store_config(config_path: str) -> dict:
    """
    Load store configuration from JSON file.
    
    Args:
        config_path: Path to config file
        
    Returns:
        Configuration dictionary
    """
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        logging.info(f"Config loaded: {config_path}")
        return config
    except Exception as e:
        logging.error(f"Config load failed: {e}")
        return {}


def get_store_urls() -> dict:
    """
    Get mapping of store names to their URLs.
    Used for baseline testing.
    
    Returns:
        Dictionary of {store_name: url}
    """
    return {
        "beatnik": "https://beatnikmusic.com/",
        "shablool": "https://www.shablool.co.il/",
        "taklit_house": "https://www.taklitim.biz/",
        "third_ear": "https://thirdear.co.il/",
        "giora": "https://www.giora-records.co.il/",
        "tav8": "https://tav8-music.co.il/",
        "hasivoov": "https://hasivoov.co.il/",
        "roll_indice": "https://www.rollindice.com/",
        "discogs": "https://www.discogs.com/",
    }


class ProgressTracker:
    """Track progress of long-running scrape operations."""
    
    def __init__(self, total_items: int, name: str = "Scrape"):
        self.total = total_items
        self.current = 0
        self.name = name
        self.errors = 0
        self.start_time = datetime.now()
    
    def update(self, count: int = 1):
        """Update progress."""
        self.current += count
        progress = (self.current / self.total * 100) if self.total > 0 else 0
        elapsed = (datetime.now() - self.start_time).total_seconds()
        rate = self.current / elapsed if elapsed > 0 else 0
        
        logging.info(
            f"{self.name}: {self.current}/{self.total} "
            f"({progress:.1f}%) | Rate: {rate:.1f} items/sec"
        )
    
    def record_error(self, error: str):
        """Record an error."""
        self.errors += 1
        logging.warning(f"{self.name} Error: {error}")
    
    def summary(self) -> dict:
        """Get progress summary."""
        elapsed = (datetime.now() - self.start_time).total_seconds()
        return {
            "name": self.name,
            "total_items": self.total,
            "processed": self.current,
            "errors": self.errors,
            "elapsed_seconds": elapsed,
            "rate_items_per_sec": self.current / elapsed if elapsed > 0 else 0,
            "completion_percent": (self.current / self.total * 100) if self.total > 0 else 0,
        }
