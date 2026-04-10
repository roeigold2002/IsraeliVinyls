#!/usr/bin/env python3
"""
EXPANDED STORE SPIDERS - 9 ADDITIONAL ISRAELI VINYL STORES
Complete coverage of Israeli vinyl retailer ecosystem.

NEW STORES ADDED:
1. Third Ear (HaOzen HaShlishit) - third-ear.com
2. Disc Center - disccenter.co.il  
3. Tav8 (Ha Tav Ha Shmini) - tav8.co.il
4. Giora Records - giorarecords.co.il
5. HaSivoov - hasivoov.co.il
6. The Vinyl Room - thevinylroom.co.il
7. My Records - my-records.co.il
8. Vinyl Stock - vinylstock.co.il
9. Rolling Dice - rollindise.com

TOTAL SYSTEM: 12 stores, potential 400K+ records
"""

import logging
from typing import Optional, List
from scrapling.spiders import Spider, Response, Request
from .parsers import ExtractedRecord, PriceParser, URLParser, MetadataParser

logger = logging.getLogger(__name__)


class ThirdEarSpider(Spider):
    """
    Scraper for Third Ear (HaOzen HaShlishit)
    Store: third-ear.com
    Records: ~15,000
    Platform: Custom e-commerce
    """
    name = "third_ear"
    allowed_domains = ["third-ear.com", "www.third-ear.com"]
    start_urls = ["https://www.third-ear.com/shop/", "https://www.third-ear.com/products/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Third Ear"
        self.store_url = "https://www.third-ear.com/"
    
    async def parse(self, response: Response):
        """Extract products from Third Ear"""
        logger.info(f"Parsing Third Ear: {response.url}")
        
        # Try multiple product selectors for flexibility
        products = response.css('.product-item, .product-card, [data-product], .item')
        
        for product in products:
            try:
                title = product.css('.product-title, h2, h3, .title::text').get()
                if not title:
                    title = product.css('a::attr(title)').get()
                if not title:
                    continue
                
                price_text = product.css('.price, .product-price, [data-price]::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing Third Ear product: {e}")
        
        # Pagination
        next_page = response.css('a.next::attr(href), .pagination a[rel="next"]::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class DiscCenterSpider(Spider):
    """
    Scraper for Disc Center
    Store: disccenter.co.il
    Records: ~20,000
    Platform: WooCommerce
    """
    name = "disc_center"
    allowed_domains = ["disccenter.co.il", "www.disccenter.co.il"]
    start_urls = ["https://www.disccenter.co.il/shop/", "https://www.disccenter.co.il/category/vinyl/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Disc Center"
        self.store_url = "https://www.disccenter.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from Disc Center"""
        logger.info(f"Parsing Disc Center: {response.url}")
        products = response.css('.woocommerce-loop-product, .product, [data-product-id]')
        
        for product in products:
            try:
                title = product.css('h2, h3, .woocommerce-loop-product__title::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, .woocommerce-Price-amount::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing Disc Center product: {e}")
        
        next_page = response.css('a.next::attr(href), .pagination a[rel="next"]::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class Tav8Spider(Spider):
    """
    Scraper for Tav8 (Ha Tav Ha Shmini)
    Store: tav8.co.il
    Records: ~25,000
    Platform: WooCommerce
    """
    name = "tav8"
    allowed_domains = ["tav8.co.il", "www.tav8.co.il"]
    start_urls = ["https://www.tav8.co.il/shop/", "https://www.tav8.co.il/category/"]
    concurrent_requests = 5
    download_delay = 2.0
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Tav8"
        self.store_url = "https://www.tav8.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from Tav8"""
        logger.info(f"Parsing Tav8: {response.url}")
        products = response.css('.product, .woocommerce-loop-product')
        
        for product in products:
            try:
                title = product.css('h2, .product-title::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, .woocommerce-Price-amount::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing Tav8 product: {e}")
        
        next_page = response.css('a.next::attr(href), .page-numbers a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class GioraRecordsSpider(Spider):
    """
    Scraper for Giora Records
    Store: giorarecords.co.il
    Records: ~12,000
    Platform: WooCommerce
    """
    name = "giora_records"
    allowed_domains = ["giorarecords.co.il", "www.giorarecords.co.il"]
    start_urls = ["https://www.giorarecords.co.il/shop/", "https://www.giorarecords.co.il/products/"]
    concurrent_requests = 3
    download_delay = 3.0
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Giora Records"
        self.store_url = "https://www.giorarecords.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from Giora Records"""
        logger.info(f"Parsing Giora Records: {response.url}")
        products = response.css('.product-item, .woocommerce-loop-product, .item')
        
        for product in products:
            try:
                title = product.css('h2, .product-name, .title::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, .product-price, .sale-price::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing Giora Records product: {e}")
        
        next_page = response.css('a.next::attr(href), .pagination a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class HasivoovSpider(Spider):
    """
    Scraper for HaSivoov
    Store: hasivoov.co.il
    Records: ~18,000
    Platform: WooCommerce/Custom
    """
    name = "hasivoov"
    allowed_domains = ["hasivoov.co.il", "www.hasivoov.co.il"]
    start_urls = ["https://www.hasivoov.co.il/shop/", "https://www.hasivoov.co.il/products/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "HaSivoov"
        self.store_url = "https://www.hasivoov.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from HaSivoov"""
        logger.info(f"Parsing HaSivoov: {response.url}")
        products = response.css('.product, .item, [data-product]')
        
        for product in products:
            try:
                title = product.css('h2, h3, .title, .name::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, [data-price], .amount::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing HaSivoov product: {e}")
        
        next_page = response.css('a.next::attr(href), .pagination a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class TheVinylRoomSpider(Spider):
    """
    Scraper for The Vinyl Room
    Store: thevinylroom.co.il
    Records: ~22,000
    Platform: WooCommerce
    """
    name = "vinyl_room"
    allowed_domains = ["thevinylroom.co.il", "www.thevinylroom.co.il"]
    start_urls = ["https://www.thevinylroom.co.il/shop/", "https://www.thevinylroom.co.il/products/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "The Vinyl Room"
        self.store_url = "https://www.thevinylroom.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from The Vinyl Room"""
        logger.info(f"Parsing The Vinyl Room: {response.url}")
        products = response.css('.product, .woocommerce-loop-product, .item')
        
        for product in products:
            try:
                title = product.css('h2, .title::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing The Vinyl Room product: {e}")
        
        next_page = response.css('a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class MyRecordsSpider(Spider):
    """
    Scraper for My Records
    Store: my-records.co.il
    Records: ~16,000
    Platform: WooCommerce
    """
    name = "my_records"
    allowed_domains = ["my-records.co.il", "www.my-records.co.il"]
    start_urls = ["https://www.my-records.co.il/shop/", "https://www.my-records.co.il/store/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "My Records"
        self.store_url = "https://www.my-records.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from My Records"""
        logger.info(f"Parsing My Records: {response.url}")
        products = response.css('.product-card, .woocommerce-loop-product, .item')
        
        for product in products:
            try:
                title = product.css('h2, .product-name::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, .product-price::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing My Records product: {e}")
        
        next_page = response.css('a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class VinylStockSpider(Spider):
    """
    Scraper for Vinyl Stock
    Store: vinylstock.co.il
    Records: ~19,000
    Platform: Custom e-commerce
    """
    name = "vinyl_stock"
    allowed_domains = ["vinylstock.co.il", "www.vinylstock.co.il"]
    start_urls = ["https://www.vinylstock.co.il/shop/", "https://www.vinylstock.co.il/store/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Vinyl Stock"
        self.store_url = "https://www.vinylstock.co.il/"
    
    async def parse(self, response: Response):
        """Extract products from Vinyl Stock"""
        logger.info(f"Parsing Vinyl Stock: {response.url}")
        products = response.css('.product, .item, [data-item]')
        
        for product in products:
            try:
                title = product.css('h2, h3, .name::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, [data-price]::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing Vinyl Stock product: {e}")
        
        next_page = response.css('a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)


class RollingDiceSpider(Spider):
    """
    Scraper for Rolling Dice
    Store: rollindise.com
    Records: ~17,000
    Platform: Custom e-commerce
    """
    name = "rolling_dice"
    allowed_domains = ["rollindise.com", "www.rollindise.com"]
    start_urls = ["https://www.rollindise.com/shop/", "https://www.rollindise.com/products/"]
    concurrent_requests = 4
    download_delay = 2.5
    browser = "chromium"
    headless = True
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.store_name = "Rolling Dice"
        self.store_url = "https://www.rollindise.com/"
    
    async def parse(self, response: Response):
        """Extract products from Rolling Dice"""
        logger.info(f"Parsing Rolling Dice: {response.url}")
        products = response.css('.product, .item, .card')
        
        for product in products:
            try:
                title = product.css('h2, h3, .name, .title::text').get()
                if not title:
                    continue
                
                price_text = product.css('.price, .amount::text').get()
                price, currency = PriceParser.parse(price_text, default_currency="₪")
                
                product_url = product.css('a::attr(href)').get()
                product_url = URLParser.normalize_url(product_url, self.store_url)
                
                cover_url = product.css('img::attr(src)').get()
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
                logger.error(f"Error parsing Rolling Dice product: {e}")
        
        next_page = response.css('a.next::attr(href)').get()
        if next_page:
            yield Request(URLParser.normalize_url(next_page, response.url), callback=self.parse)
