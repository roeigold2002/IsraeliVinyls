"""Multi-level vinyl record scraper - scrapes categories, then records within each category."""

import requests
from bs4 import BeautifulSoup
import time
import random
import re
import logging
from typing import List, Dict, Optional
from urllib.parse import urljoin, urlparse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DeepVinylScraper:
    """Advanced scraper that drills down into categories and pagination."""
    
    def __init__(self):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        ]
        
        self.timeout = 10
        self.selenium_timeout = 15
        self.driver = None
        self.session = requests.Session()
        
        self.stores = {
            'ביטניק': {
                'url': 'https://www.beatnik.co.il/',
                'catalog_url': 'https://www.beatnik.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"]',
                'max_pages_per_category': 20,  # Increased from 10
                'record_selector': 'li.product, div.product',
            },
            'שבלול תקליטים': {
                'url': 'https://shabloolrecords.co.il/',
                'catalog_url': 'https://shabloolrecords.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"], [class*="term"]',
                'max_pages_per_category': 20,
                'record_selector': 'div.product, li.product',
            },
            'הסיבוב': {
                'url': 'https://hasivoov.co.il/',
                'catalog_url': 'https://hasivoov.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"]',
                'max_pages_per_category': 20,
                'record_selector': 'li.product, div.product',
            },
            'דה ויניל רום': {
                'url': 'https://thevinylroom.co.il/',
                'catalog_url': 'https://thevinylroom.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"]',
                'max_pages_per_category': 20,
                'record_selector': 'li.product, div.product',
            },
            'התקליטים שלי': {
                'url': 'https://www.my-records.co.il/',
                'catalog_url': 'https://www.my-records.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"], [data-category]',
                'max_pages_per_category': 20,
                'record_selector': 'li.product, div.product',
            },
            'גיורא תקליטים': {
                'url': 'https://www.giorarecords.co.il/',
                'catalog_url': 'https://www.giorarecords.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"]',
                'max_pages_per_category': 20,
                'record_selector': 'li.product, div.product',
            },
            'האוזן השלישית': {
                'url': 'https://www.third-ear.com/',
                'catalog_url': 'https://www.third-ear.com/product-category/vinyl/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"]',
                'max_pages_per_category': 15,
                'record_selector': 'li.product, div.product, [class*="product"]',
            },
            'ויניל סטוק': {
                'url': 'https://www.vinylstock.co.il/',
                'catalog_url': 'https://www.vinylstock.co.il/shop/',
                'platform': 'woocommerce',
                'category_selector': 'a[href*="/product-category/"]',
                'max_pages_per_category': 20,
                'record_selector': 'li.product, div.product',
            },
            'דיסק סנטר': {
                'url': 'https://www.disccenter.co.il/',
                'catalog_url': 'https://www.disccenter.co.il/',
                'platform': 'custom',
                'category_selector': 'a[href], [class*="category"]',
                'max_pages_per_category': 15,
                'record_selector': 'div[class*="product"], li[class*="product"], tr',
            },
            'התו השמיני': {
                'url': 'https://www.tav8.co.il/',
                'catalog_url': 'https://www.tav8.co.il/',
                'platform': 'custom',
                'category_selector': 'a[href], [class*="nav"]',
                'max_pages_per_category': 15,
                'record_selector': 'div[class*="product"], [class*="item"]',
            },
            'רולינג דייס': {
                'url': 'https://www.rollin-dice.co.il/',
                'catalog_url': 'https://www.rollin-dice.co.il/shop/',
                'platform': 'shopify',
                'category_selector': 'a[href*="/collections/"], [class*="collection"]',
                'max_pages_per_category': 20,
                'record_selector': 'div[data-product-id], [class*="ProductCard"]',
            },
            'בית התקליט': {
                'url': 'https://www.taklithouse.com/',
                'catalog_url': 'https://www.taklithouse.com/shop/',
                'platform': 'wix',
                'category_selector': 'a[href*="/shop"], [class*="category"], [data-nav]',
                'max_pages_per_category': 15,
                'record_selector': '[class*="product"], [class*="item"], [data-product]',
            },
        }
    
    def init_selenium(self):
        """Initialize Selenium driver."""
        if self.driver:
            return
        
        try:
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_argument(f'user-agent={random.choice(self.user_agents)}')
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            logger.info("Selenium initialized")
        except Exception as e:
            logger.error(f"Selenium init failed: {e}")
    
    def close_selenium(self):
        """Close Selenium driver."""
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None
    
    def fetch_page(self, url: str, use_selenium: bool = True) -> Optional[BeautifulSoup]:
        """Fetch page with Selenium or requests."""
        try:
            if use_selenium:
                self.init_selenium()
                self.driver.get(url)
                time.sleep(2)
                # Scroll to load lazy content
                for _ in range(3):
                    self.driver.execute_script("window.scrollBy(0, 500)")
                    time.sleep(0.5)
                html = self.driver.page_source
            else:
                headers = {'User-Agent': random.choice(self.user_agents)}
                response = self.session.get(url, headers=headers, timeout=10)
                response.encoding = 'utf-8'
                html = response.text
            
            return BeautifulSoup(html, 'html.parser')
        except Exception as e:
            logger.warning(f"Fetch failed for {url}: {e}")
            return None
    
    def extract_price(self, text: str) -> float:
        """Extract price from text."""
        if not text:
            return 0.0
        text = str(text).replace('₪', '').replace(',', '.').strip()
        match = re.search(r'\d+(?:\.\d+)?', text)
        if match:
            try:
                return float(match.group())
            except:
                return 0.0
        return 0.0
    
    def parse_record(self, product_element, store_url: str, store_name: str) -> Optional[Dict]:
        """Parse a single product element into a record."""
        try:
            # Title
            title = None
            for elem in product_element.select('a, h2, h3, h4, span'):
                text = elem.get_text(strip=True)
                if text and len(text) > 3 and len(text) < 500:
                    title = text
                    break
            
            if not title:
                return None
            
            # Clean title
            title = re.sub(r'(Add to cart|Select|Read more|View|Quick)', '', title, flags=re.I).strip()
            if len(title) < 2 or len(title) > 500:
                return None
            
            # Split artist - album
            if ' - ' in title:
                parts = title.split(' - ', 1)
                artist = parts[0].strip()[:100]
                album = parts[1].strip()[:200]
            else:
                artist = 'Unknown'
                album = title[:200]
            
            # Price
            price = 0.0
            for price_elem in product_element.select('[data-price], .price, .amount, bdi'):
                price_text = price_elem.get_text(strip=True)
                price = self.extract_price(price_text)
                if price > 0:
                    break
            
            # Image
            cover_url = ''
            img = product_element.select_one('img')
            if img:
                cover_url = img.get('src', '') or img.get('data-src', '')
                if not cover_url.startswith('http'):
                    cover_url = urljoin(store_url, cover_url)
            
            # Link
            product_link = store_url
            link = product_element.select_one('a[href]')
            if link:
                href = link.get('href', '')
                if href:
                    product_link = urljoin(store_url, href)
            
            return {
                'artist': artist,
                'album': album,
                'price': price,
                'cover_url': cover_url[:500],
                'store_name': store_name,
                'store_url': product_link[:500]
            }
        except Exception as e:
            logger.debug(f"Parse error: {e}")
            return None
    
    def scrape_records_from_page(self, soup: BeautifulSoup, store_url: str, store_name: str, 
                                record_selector: str) -> List[Dict]:
        """Extract all records from a single page."""
        records = []
        
        products = soup.select(record_selector)
        logger.info(f"Found {len(products)} products on page")
        
        for product in products[:300]:  # Max 300 per page
            record = self.parse_record(product, store_url, store_name)
            if record:
                records.append(record)
        
        return records
    
    def scrape_category(self, category_url: str, store_name: str, record_selector: str,
                       max_pages: int) -> List[Dict]:
        """Scrape all products from a category (with pagination)."""
        all_records = []
        
        for page in range(1, max_pages + 1):
            # Build pagination URL
            if '?' in category_url:
                page_url = f"{category_url}&paged={page}"
            else:
                page_url = f"{category_url}?paged={page}" if page > 1 else category_url
            
            logger.info(f"Scraping category page {page}: {page_url[:80]}")
            
            soup = self.fetch_page(page_url, use_selenium=True)
            if not soup:
                break
            
            records = self.scrape_records_from_page(soup, page_url, store_name, record_selector)
            if not records:
                break
            
            all_records.extend(records)
            logger.info(f"Got {len(records)} records from category page {page}")
            time.sleep(random.uniform(1, 2))
        
        return all_records
    
    def scrape_store_deep(self, store_name: str, config: Dict) -> List[Dict]:
        """Scrape store by exploring all categories."""
        all_records = []
        
        try:
            logger.info(f"\n{'='*60}")
            logger.info(f"DEEP SCRAPING: {store_name}")
            logger.info(f"{'='*60}")
            
            # First, get list of categories
            logger.info("Step 1: Finding categories...")
            soup = self.fetch_page(config['catalog_url'], use_selenium=True)
            
            if not soup:
                logger.warning(f"Could not fetch catalog for {store_name}")
                return []
            
            # Find category links
            category_links = soup.select(config['category_selector'])
            logger.info(f"Found {len(category_links)} categories")
            
            if not category_links:
                # If no categories found, just scrape the main page
                logger.warning(f"No categories found, scraping main page")
                records = self.scrape_records_from_page(
                    soup, config['catalog_url'], store_name, config['record_selector']
                )
                all_records.extend(records)
            else:
                # Scrape each category
                for idx, cat_link in enumerate(category_links[:30], 1):  # Max 30 categories
                    try:
                        cat_url = cat_link.get('href', '').strip()
                        if not cat_url or 'javascript' in cat_url.lower():
                            continue
                        
                        cat_url = urljoin(config['catalog_url'], cat_url)
                        cat_name = cat_link.get_text(strip=True)
                        
                        logger.info(f"\nCategory {idx}: {cat_name}")
                        
                        # Scrape this category with pagination
                        cat_records = self.scrape_category(
                            cat_url, store_name, config['record_selector'],
                            config['max_pages_per_category']
                        )
                        
                        all_records.extend(cat_records)
                        logger.info(f"Total from {cat_name}: {len(cat_records)} records")
                        
                        time.sleep(random.uniform(1, 2))
                    
                    except Exception as e:
                        logger.warning(f"Error scraping category {idx}: {e}")
                        continue
            
            logger.info(f"\nTotal from {store_name}: {len(all_records)} records")
            return all_records
        
        except Exception as e:
            logger.error(f"Error in store deep scrape: {e}")
            return []
    
    def scrape_all_stores_deep(self) -> List[Dict]:
        """Scrape all stores with deep category drilling."""
        all_records = []
        
        try:
            for store_name, config in self.stores.items():
                records = self.scrape_store_deep(store_name, config)
                all_records.extend(records)
        
        finally:
            self.close_selenium()
        
        logger.info(f"\n{'='*60}")
        logger.info(f"TOTAL RECORDS SCRAPED: {len(all_records)}")
        logger.info(f"{'='*60}")
        
        return all_records


if __name__ == '__main__':
    scraper = DeepVinylScraper()
    records = scraper.scrape_all_stores_deep()
    print(f"\nFinal count: {len(records)} records")
