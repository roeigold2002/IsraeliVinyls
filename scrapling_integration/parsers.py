"""
Data extraction and parsing utilities for vinyl store records.
Handles price extraction, URL parsing, metadata normalization, and Hebrew text cleanup.
"""

import re
import logging
from typing import Optional, Tuple, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class ExtractedRecord:
    """Standardized vinyl record data structure."""
    artist: str
    album: str
    store_name: str
    store_url: Optional[str] = None
    product_url: Optional[str] = None
    price: Optional[float] = None
    price_currency: str = "₪"
    cover_url: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    format: Optional[str] = "Vinyl"
    condition: Optional[str] = None
    scraped_at: datetime = None
    created_at: datetime = None
    updated_at: datetime = None
    
    def __post_init__(self):
        """Set timestamps if not provided."""
        now = datetime.now()
        if self.scraped_at is None:
            self.scraped_at = now
        if self.created_at is None:
            self.created_at = now
        if self.updated_at is None:
            self.updated_at = now
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for DB insertion."""
        return asdict(self)


class PriceParser:
    """Extract and normalize prices from various formats."""
    
    # Regex patterns for common price formats
    PATTERNS = {
        'isbn': r'₪\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',  # ₪1,234.56
        'us': r'\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',  # $1,234.56
        'euro': r'€\s*(\d+(?:,\d{3})*(?:\.\d{2})?)',  # €1,234.56
        'generic': r'(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:₪|\$|€)',
        'no_currency': r'(\d+(?:\.\d{2})?)',  # Plain number
    }
    
    @staticmethod
    def parse(text: str, default_currency: str = "₪") -> Tuple[Optional[float], str]:
        """
        Extract price from text.
        
        Args:
            text: Text containing price
            default_currency: Currency symbol if not found in text
            
        Returns:
            Tuple of (price_float, currency_symbol)
        """
        if not text or not isinstance(text, str):
            return None, default_currency
        
        text = text.strip()
        
        # Try each pattern in order
        for pattern_name, pattern in PriceParser.PATTERNS.items():
            match = re.search(pattern, text)
            if match:
                try:
                    price_str = match.group(1).replace(',', '').replace('₪', '').strip()
                    price = float(price_str)
                    
                    # Detect currency
                    currency = default_currency
                    if '₪' in text:
                        currency = '₪'
                    elif '$' in text:
                        currency = '$'
                    elif '€' in text:
                        currency = '€'
                    
                    return price, currency
                except (ValueError, IndexError):
                    continue
        
        logger.debug(f"Could not parse price from: {text}")
        return None, default_currency


class URLParser:
    """Extract and normalize product URLs."""
    
    @staticmethod
    def normalize_url(url: Optional[str], base_url: Optional[str] = None) -> Optional[str]:
        """
        Normalize product URL.
        
        Args:
            url: URL to normalize
            base_url: Base URL for relative URLs
            
        Returns:
            Normalized absolute URL or None
        """
        if not url or not isinstance(url, str):
            return None
        
        url = url.strip()
        
        if not url:
            return None
        
        # Handle relative URLs
        if url.startswith('/'):
            if base_url:
                # Extract base domain
                from urllib.parse import urljoin
                return urljoin(base_url, url)
            return None
        
        # Ensure protocol
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        return url
    
    @staticmethod
    def is_valid(url: Optional[str]) -> bool:
        """Check if URL is valid and contains expected patterns."""
        if not url or not isinstance(url, str):
            return False
        
        return url.startswith(('http://', 'https://')) and len(url) > 10


class MetadataParser:
    """Extract and normalize metadata (year, genre, format, condition)."""
    
    HEBREW_CLEANUP_PATTERNS = [
        (r'\bבמלאי\b', ''),  # "in stock"
        (r'\bבהנחה\b', ''),  # "on sale"
        (r'\bחדש\b', 'New'),  # "new"
        (r'\bכמו חדש\b', 'Like New'),  # "like new"
        (r'\bטוב מאוד\b', 'Very Good'),  # "very good"
        (r'\bטוב\b', 'Good'),  # "good"
        (r'\bסביר\b', 'Fair'),  # "fair"
        (r'\bנתוך\b', 'Poor'),  # "poor/worn"
    ]
    
    GENRE_KEYWORDS = {
        'rock': r'rock|alternative|indie|metal|punk|hard\s*rock',
        'jazz': r'jazz|bebop|fusion',
        'classical': r'classical|symphony|orchestra|baroque|romantic|contemporary',
        'pop': r'pop|pop-rock|bubblegum',
        'hip-hop': r'hip[- ]?hop|rap|r&b',
        'electronic': r'electronic|techno|house|ambient|dubstep|trance',
        'folk': r'folk|country|bluegrass|americana',
        'reggae': r'reggae|roots|dancehall',
        'blues': r'blues|soul',
        'world': r'world|latin|african|asian|indian',
    }
    
    @staticmethod
    def parse_year(text: Optional[str]) -> Optional[int]:
        """Extract year from text."""
        if not text or not isinstance(text, str):
            return None
        
        match = re.search(r'(19|20)\d{2}', text)
        if match:
            try:
                year = int(match.group(0))
                if 1900 <= year <= datetime.now().year:
                    return year
            except ValueError:
                pass
        
        return None
    
    @staticmethod
    def parse_genre(text: Optional[str]) -> Optional[str]:
        """Infer genre from text or metadata."""
        if not text or not isinstance(text, str):
            return None
        
        text_lower = text.lower()
        
        for genre, pattern in MetadataParser.GENRE_KEYWORDS.items():
            if re.search(pattern, text_lower):
                return genre
        
        return None
    
    @staticmethod
    def parse_condition(text: Optional[str]) -> Optional[str]:
        """Extract vinyl condition from text."""
        if not text or not isinstance(text, str):
            return None
        
        conditions = ['New', 'Like New', 'Very Good', 'Good', 'Fair', 'Poor']
        text_lower = text.lower()
        
        for condition in conditions:
            if condition.lower() in text_lower:
                return condition
        
        return None
    
    @staticmethod
    def cleanup_hebrew_text(text: Optional[str]) -> Optional[str]:
        """Remove Hebrew metadata and cleanup text."""
        if not text or not isinstance(text, str):
            return text
        
        for pattern, replacement in MetadataParser.HEBREW_CLEANUP_PATTERNS:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
        # Remove multiple spaces
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text if text else None


def parse_album_price(text: str, default_currency: str = "₪") -> Tuple[Optional[float], str]:
    """Convenience function to parse price."""
    return PriceParser.parse(text, default_currency)


def parse_product_url(url: Optional[str], base_url: Optional[str] = None) -> Optional[str]:
    """Convenience function to parse URL."""
    return URLParser.normalize_url(url, base_url)


def parse_metadata(
    text: Optional[str],
    extract_year: bool = True,
    extract_genre: bool = True,
    extract_condition: bool = True,
    cleanup_hebrew: bool = True
) -> Dict[str, Any]:
    """
    Extract all metadata from text.
    
    Returns:
        Dictionary with 'year', 'genre', 'condition' keys
    """
    result = {}
    
    if cleanup_hebrew:
        text = MetadataParser.cleanup_hebrew_text(text)
    
    if extract_year:
        result['year'] = MetadataParser.parse_year(text)
    
    if extract_genre:
        result['genre'] = MetadataParser.parse_genre(text)
    
    if extract_condition:
        result['condition'] = MetadataParser.parse_condition(text)
    
    return result
