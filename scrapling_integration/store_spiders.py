"""
Scrapling Spider implementations for Israeli vinyl stores.

Each spider handles store-specific parsing, pagination, and error recovery.
Uses Scrapling's adaptive parsing to auto-relocate elements on layout changes.
"""

import logging
from typing import Optional, List, Dict, Any
from scrapling.spiders import Spider, Response, Request
from .parsers import ExtractedRecord, PriceParser, URLParser, MetadataParser
from .adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


class BeatnikSpider(Spider):
    """
    Scraper for Beatnik Records (beatnikmusic.com)
    
    Store: WooCommerce-based Israeli vinyl store
    Records: ~30,000
    Challenge: JavaScript rendering required for product pages
    
    Selectors:
    - Products: div.product
    - Title: h2.woocommerce-loop-product__title
    - Price: span.woocommerce-Price-amount
    - Link: a.woocommerce-loop-product__link
    - Image: img (in product container)
    - Pagination: a.next (or next_page link)
    """
    
    name = "beatnik"
    allowed_domains = ["beatnikmusic.com", "www.beatnikmusic.com"]
    start_urls = ["https://www.beatnikmusic.com/product-category/vinyl-records/", "https://www.beatnikmusic.com/shop/"]
    concurrent_requests = 5
    download_delay = 2.0  # Be respectful to store
    browser = "chromium"  # Enable browser rendering
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Beatnik"
        self.store_url = "https://www.beatnikmusic.com/"
        self.db_adapter = None
    
    async def parse(self, response: Response):
        """Extract products from store page."""
        logger.info(f"Parsing {response.url}")
        
        try:
            # Find all product containers (WooCommerce standard)
            products = response.css('.product', adaptive=True)
            
            if not products:
                logger.warning(f"No products found on {response.url}")
                return
            
            logger.info(f"Found {len(products)} products")
            
            for product in products:
                try:
                    # Extract title/album
                    title = product.css('h2.woocommerce-loop-product__title::text', adaptive=True).get()
                    if not title:
                        title = product.css('a::attr(title)', adaptive=True).get()
                    if not title:
                        continue
                    
                    # Extract price
                    price_text = product.css('span.woocommerce-Price-amount::text', adaptive=True).get()
                    if not price_text:
                        price_text = product.css('.price::text', adaptive=True).get()
                    
                    price, currency = PriceParser.parse(price_text, default_currency="₪")
                    
                    # Extract product URL
                    product_url = product.css('a.woocommerce-loop-product__link::attr(href)', adaptive=True).get()
                    if not product_url:
                        product_url = product.css('a::attr(href)', adaptive=True).get()
                    
                    product_url = URLParser.normalize_url(product_url, self.store_url)
                    
                    # Extract cover image
                    cover_url = product.css('img::attr(src)').get()
                    
                    # Parse metadata
                    metadata = MetadataParser.parse_metadata(title)
                    
                    # Create record
                    record = ExtractedRecord(
                        artist=self.store_name,  # For Beatnik, use store name as artist
                        album=title.strip(),
                        store_name=self.store_name,
                        product_url=product_url,
                        store_url=self.store_url,
                        price=price,
                        price_currency=currency,
                        cover_url=cover_url,
                        year=metadata.get('year'),
                        genre=metadata.get('genre'),
                        format="Vinyl",
                        condition=metadata.get('condition'),
                    )
                    
                    yield record.to_dict()
                    
                except Exception as e:
                    logger.error(f"Error parsing product: {e}")
                    continue
            
            # Handle pagination
            next_page = response.css('a.next::attr(href)', adaptive=True).get()
            if next_page:
                next_url = URLParser.normalize_url(next_page, response.url)
                logger.info(f"Following to next page: {next_url}")
                yield Request(next_url, callback=self.parse)
                
        except Exception as e:
            logger.error(f"Parse error on {response.url}: {e}")


class ShabloolSpider(Spider):
    """
    Scraper for Shablool Taklitim (shablool.co.il)
    
    Store: WooCommerce with AJAX + Brotli compression
    Records: ~215,000 (largest Israeli store)
    Challenge: Heavy JavaScript, infinite scroll or AJAX pagination
    
    Selectors:
    - Products: .product (WooCommerce)
    - Title: .woocommerce-loop-product__title / h2
    - Price: .woocommerce-Price-amount / .price
    - Link: a.woocommerce-loop-product__link
    - Pagination: next-page link or AJAX trigger
    """
    
    name = "shablool"
    allowed_domains = ["shablool.co.il", "www.shablool.co.il"]
    start_urls = ["https://www.shablool.co.il/shop/", "https://www.shablool.co.il/products/"]
    concurrent_requests = 3  # Be conservative with high-traffic store
    download_delay = 3.0
    browser = "chromium"  # Enable browser rendering
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Shablool"
        self.store_url = "https://www.shablool.co.il/"
        self.page_count = 0
    
    async def parse(self, response: Response):
        """Extract products from Shablool pages."""
        logger.info(f"Parsing Shablool page {self.page_count}: {response.url}")
        self.page_count += 1
        
        try:
            # Find products
            products = response.css('.product', adaptive=True)
            
            if not products:
                logger.warning(f"No products found on page {self.page_count}")
                return
            
            logger.info(f"Page {self.page_count}: Found {len(products)} products")
            
            for product in products:
                try:
                    # Title
                    title = product.css('.woocommerce-loop-product__title::text', adaptive=True).get()
                    if not title:
                        title = product.css('h2::text', adaptive=True).get()
                    if not title:
                        title = product.css('a::attr(title)', adaptive=True).get()
                    
                    if not title:
                        continue
                    
                    # Price (Shablool sometimes uses different selectors)
                    price_text = product.css('.woocommerce-Price-amount::text', adaptive=True).get()
                    if not price_text:
                        price_text = product.css('.price::text', adaptive=True).get()
                    if not price_text:
                        price_text = product.css('span.amount::text', adaptive=True).get()
                    
                    price, currency = PriceParser.parse(price_text, default_currency="₪")
                    
                    # URL
                    product_url = product.css('.woocommerce-loop-product__link::attr(href)', adaptive=True).get()
                    if not product_url:
                        product_url = product.css('a::attr(href)', adaptive=True).get()
                    
                    product_url = URLParser.normalize_url(product_url, self.store_url)
                    
                    # Cover
                    cover_url = product.css('img::attr(src)').get()
                    
                    # Metadata
                    metadata = MetadataParser.parse_metadata(title)
                    
                    record = ExtractedRecord(
                        artist=self.store_name,
                        album=title.strip(),
                        store_name=self.store_name,
                        product_url=product_url,
                        store_url=self.store_url,
                        price=price,
                        price_currency=currency,
                        cover_url=cover_url,
                        year=metadata.get('year'),
                        genre=metadata.get('genre'),
                        format="Vinyl",
                        condition=metadata.get('condition'),
                    )
                    
                    yield record.to_dict()
                    
                except Exception as e:
                    logger.error(f"Shablool product parse error: {e}")
                    continue
            
            # Pagination
            next_page = response.css('a.next::attr(href)', adaptive=True).get()
            if not next_page:
                next_page = response.css('a[rel=next]::attr(href)', adaptive=True).get()
            
            if next_page:
                next_url = URLParser.normalize_url(next_page, response.url)
                logger.info(f"Following to page {self.page_count + 1}: {next_url}")
                yield Request(next_url, callback=self.parse)
            else:
                logger.info(f"No more pages found (last page: {self.page_count})")
                
        except Exception as e:
            logger.error(f"Parse error on page {self.page_count}: {e}")


class TaklitHouseSpider(Spider):
    """
    Scraper for Taklit House (taklitim.biz)
    
    Store: Wix-based store
    Records: ~14,000
    Challenge: Wix platform uses custom DOM structure
    
    Selectors:
    - Products: .product-item / .product-cell
    - Title: .product-title / h3
    - Price: .product-price
    - Link: a[data-product-url] or .product-link
    """
    
    name = "taklit_house"
    allowed_domains = ["taklitim.biz", "www.taklitim.biz"]
    start_urls = ["https://www.taklitim.biz/shop/", "https://www.taklitim.biz/store/"]
    concurrent_requests = 4
    download_delay = 2.0
    browser = "chromium"  # Enable browser rendering
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Taklit House"
        self.store_url = "https://www.taklitim.biz/"
    
    async def parse(self, response: Response):
        """Extract products from Taklit House."""
        logger.info(f"Parsing Taklit House: {response.url}")
        
        try:
            # Find products (Wix uses different selectors)
            products = response.css('.product-item, .product-cell, [class*="product"]', adaptive=True)
            
            if not products:
                logger.warning("No products found on page")
                return
            
            logger.info(f"Found {len(products)} products")
            
            for product in products:
                try:
                    # Title
                    title = product.css('.product-title::text, h3::text', adaptive=True).get()
                    if not title:
                        title = product.css('a::attr(title)', adaptive=True).get()
                    
                    if not title:
                        continue
                    
                    # Price
                    price_text = product.css('.product-price::text, .price::text', adaptive=True).get()
                    price, currency = PriceParser.parse(price_text, default_currency="₪")
                    
                    # URL
                    product_url = product.css('a::attr(href)', adaptive=True).get()
                    product_url = URLParser.normalize_url(product_url, self.store_url)
                    
                    # Cover
                    cover_url = product.css('img::attr(src)').get()
                    
                    # Metadata
                    metadata = MetadataParser.parse_metadata(title)
                    
                    record = ExtractedRecord(
                        artist=self.store_name,
                        album=title.strip(),
                        store_name=self.store_name,
                        product_url=product_url,
                        store_url=self.store_url,
                        price=price,
                        price_currency=currency,
                        cover_url=cover_url,
                        year=metadata.get('year'),
                        genre=metadata.get('genre'),
                        format="Vinyl",
                        condition=metadata.get('condition'),
                    )
                    
                    yield record.to_dict()
                    
                except Exception as e:
                    logger.error(f"Taklit House product error: {e}")
                    continue
            
            # Pagination
            next_page = response.css('a[rel="next"]::attr(href), .next-page::attr(href)', adaptive=True).get()
            if next_page:
                next_url = URLParser.normalize_url(next_page, response.url)
                yield Request(next_url, callback=self.parse)
                
        except Exception as e:
            logger.error(f"Parse error: {e}")
