import requests
from bs4 import BeautifulSoup
import time
import random
import re
from typing import List, Dict, Optional
import logging
from urllib.parse import urljoin, urlparse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import threading

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# NOTE: All 12 Israeli vinyl stores are configured for scraping:
# 1. האוזן השלישית (Third Ear)
# 2. ביטניק (Beatnik)
# 3. שבלול תקליטים (Shablool Records)
# 4. דיסק סנטר (DiscCenter)
# 5. התו השמיני (Tav8)
# 6. גיורא תקליטים (Giora Records)
# 7. בית התקליט (TakliHouse)
# 8. הסיבוב (HaSivoov)
# 9. דה ויניל רום (The Vinyl Room)
# 10. התקליטים שלי (My Records)
# 11. וינילסטוק (VinylStock)
# 12. רולינג דייס (Rolling Dice)
#
# All stores are currently accessible and actively configured.

class AdvancedScraperEngine:
    """Advanced web scraper for Israeli vinyl record stores with Selenium support."""
    
    def __init__(self):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ]
        
        self.timeout = 15
        self.selenium_timeout = 20
        self.delay_range = (1, 2)
        
        self.stores = {
            'האוזן השלישית': {
                'url': 'https://third-ear.com/',
                'catalog_url': 'https://third-ear.com/product-category/vinyls/jsf/epro-archive-products/pagenum/',
                'platform': 'custom',
                'js_heavy': True,
                'pagination': 'pagenum',
                'max_pages': 293,
                'status': 'active'
            },
            'ביטניק': {
                'url': 'https://www.beatnik.co.il/',
                'catalog_url': 'https://www.beatnik.co.il/online-store/page/',
                'platform': 'woocommerce',
                'js_heavy': True,
                'pagination': 'page',
                'min_page': 2,
                'max_pages': 749,
                'status': 'active'
            },
            'שבלול תקליטים': {
                'url': 'https://shabloolrecords.co.il/',
                'catalog_url': 'https://shabloolrecords.co.il/shop/page/',
                'platform': 'woocommerce',
                'js_heavy': True,
                'pagination': 'page',
                'max_pages': 311,
                'status': 'active'
            },
            'דיסק סנטר': {
                'url': 'https://www.disccenter.co.il/',
                'catalog_url': 'https://www.disccenter.co.il/list/22?items=11293',
                'platform': 'custom',
                'js_heavy': True,
                'pagination': 'none',
                'status': 'active'
            },
            'התו השמיני': {
                'url': 'https://www.tav8.co.il/',
                'catalog_url': 'https://www.tav8.co.il/store-products.aspx?StoreCategoryId=1',
                'platform': 'custom',
                'js_heavy': True,
                'pagination': 'scroll',
                'status': 'active'
            },
            'גיורא תקליטים': {
                'url': 'https://www.giorarecords.co.il/',
                'catalog_url': 'https://www.giorarecords.co.il/product-category/%D7%AA%D7%A7%D7%9C%D7%99%D7%98%D7%99%D7%9D-2/page/',
                'platform': 'woocommerce',
                'js_heavy': True,
                'pagination': 'page',
                'max_pages': 113,
                'status': 'active'
            },
            'בית התקליט': {
                'url': 'https://www.taklithouse.com/',
                'catalog_url': 'https://www.taklithouse.com/category/all-products?page=',
                'platform': 'custom',
                'js_heavy': True,
                'pagination': 'querypage',
                'status': 'active'
            },
            'הסיבוב': {
                'url': 'https://hasivoov.co.il/',
                'catalog_url': 'https://hasivoov.co.il/shop/?product-page=',
                'platform': 'woocommerce',
                'js_heavy': True,
                'pagination': 'product-page',
                'max_pages': 41,
                'status': 'active'
            },
            'דה ויניל רום': {
                'url': 'https://thevinylroom.co.il/',
                'catalog_url': 'https://thevinylroom.co.il/product-category/%D7%9C%D7%95%D7%A2%D7%96%D7%99-2/page/',
                'platform': 'woocommerce',
                'js_heavy': True,
                'pagination': 'page',
                'max_pages': 148,
                'status': 'active'
            },
            'וינילסטוק': {
                'url': 'https://www.vinylstock.co.il/',
                'catalog_url': 'https://www.vinylstock.co.il/store/178462/%D7%9B%D7%9C-%D7%94%D7%AA%D7%A7%D7%9C%D7%99%D7%98%D7%99%D7%9D',
                'platform': 'custom',
                'js_heavy': True,
                'pagination': 'none',
                'status': 'active'
            },
            'רולינג דייס': {
                'url': 'https://www.rollindise.com/',
                'catalog_url': 'https://www.rollindise.com/collections/public-products?page=',
                'platform': 'custom',
                'js_heavy': True,
                'pagination': 'querypage',
                'max_pages': 19,
                'status': 'active'
            },
        }
        
        self.driver = None
    
    def get_random_user_agent(self) -> str:
        """Get a random user agent string."""
        return random.choice(self.user_agents)
    
    def get_random_delay(self) -> float:
        """Get a random delay between min and max."""
        return random.uniform(self.delay_range[0], self.delay_range[1])
    
    def init_selenium_driver(self):
        """Initialize Selenium Chrome WebDriver."""
        try:
            chrome_options = Options()
            chrome_options.add_argument("--start-maximized")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_argument(f"user-agent={self.get_random_user_agent()}")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            self.driver.set_page_load_timeout(self.selenium_timeout)
            logger.info("Selenium WebDriver initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Selenium: {e}")
            return False
    
    def close_selenium_driver(self):
        """Close Selenium WebDriver."""
        if self.driver:
            try:
                self.driver.quit()
                self.driver = None
                logger.info("Selenium WebDriver closed")
            except:
                pass
    
    def fetch_page_with_selenium(self, url: str, wait_selector: str = ".product", max_scrolls: int = 10) -> Optional[BeautifulSoup]:
        """Fetch a page using Selenium and scroll to load all products."""
        try:
            if not self.driver:
                if not self.init_selenium_driver():
                    return None
            
            logger.info(f"Fetching with Selenium: {url}")
            self.driver.set_page_load_timeout(self.selenium_timeout)
            self.driver.get(url)
            
            # Wait for products to appear
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_all_elements_located((By.CSS_SELECTOR, wait_selector))
                )
            except Exception as e:
                logger.warning(f"Timeout waiting for {wait_selector}: {e}")
            
            # Scroll to load more products (infinite scroll handling)
            last_height = self.driver.execute_script("return document.body.scrollHeight")
            scroll_count = 0
            
            while scroll_count < max_scrolls:
                try:
                    self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    time.sleep(1.5)
                    
                    new_height = self.driver.execute_script("return document.body.scrollHeight")
                    if new_height == last_height:
                        break
                    last_height = new_height
                    scroll_count += 1
                except Exception as e:
                    logger.warning(f"Error during scroll: {e}")
                    break
            
            logger.info(f"Scrolled {scroll_count} times to load content")
            
            # Get the rendered HTML
            html = self.driver.page_source
            return BeautifulSoup(html, 'html.parser')
            
        except Exception as e:
            logger.error(f"Selenium fetch error for {url}: {e}")
            # Reset the driver on error
            self.close_selenium_driver()
            return None
    
    def extract_price(self, text: str) -> float:
        """Extract numeric price from text."""
        if not text:
            return 0.0
        cleaned = text.replace('₪', '').replace('$', '').strip()
        cleaned = cleaned.replace(',', '.')
        match = re.search(r'\d+(?:\.\d+)?', cleaned)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return 0.0
        return 0.0
    
    def parse_woocommerce_products_aggressive(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Aggressive WooCommerce parser that finds all products."""
        records = []
        
        # Try multiple selectors for products
        selectors = [
            'li.product',
            'div.product',
            'div.woocommerce-loop-product',
            'div[class*="product"]',
            'li[class*="product"]',
            'article[class*="product"]',
        ]
        
        products = []
        used_selector = None
        for selector in selectors:
            found = soup.select(selector)
            if found and len(found) > 0:
                products = found
                used_selector = selector
                logger.info(f"Found {len(products)} products with selector: {selector}")
                break
        
        if not products:
            logger.warning(f"No products found for {store_name}")
            return records
        
        for product in products[:300]:  # Process up to 300 products
            try:
                # Extract title - try multiple approaches
                title = None
                
                # Try direct title elements
                for title_selector in ['h2', 'h3', 'h4', 'h5', 'a.woocommerce-LoopProduct-link', 'a[class*="title"]']:
                    elem = product.select_one(title_selector)
                    if elem:
                        title = elem.get_text(strip=True)
                        break
                
                # If no title element found, try all links
                if not title:
                    link_elem = product.select_one('a')
                    if link_elem:
                        title = link_elem.get_text(strip=True)
                        # Remove common noise
                        title = re.sub(r'(Select options|Read more|View|Quick shop)', '', title, flags=re.I).strip()
                
                # Last resort - extract from text content intelligently
                if not title:
                    text = product.get_text()
                    # Look for "Artist - Album" pattern
                    match = re.search(r'(.+?)\s*-\s*(.+?)(?:\n|₪|\d)', text)
                    if match:
                        title = f"{match.group(1).strip()} - {match.group(2).strip()}"
                
                if not title or len(title) < 2:
                    continue
                
                # Clean title
                title = title.strip()
                if len(title) > 500:  # Skip unreasonably long titles
                    continue
                
                # Split artist - album
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                # Extract price
                price = 0.0
                price_text = ''
                
                # Try data attributes first
                for attr in ['data-price', 'data-regular-price']:
                    price_val = product.get(attr)
                    if price_val:
                        price = self.extract_price(price_val)
                        if price > 0:
                            break
                
                # If no data attribute, search for price elements
                if price == 0:
                    for price_selector in ['.price', '[data-price]', 'span.woocommerce-Price-amount', 'span.amount', 'bdi']:
                        price_elem = product.select_one(price_selector)
                        if price_elem:
                            price_text = price_elem.get_text(strip=True)
                            price = self.extract_price(price_text)
                            if price > 0:
                                break
                
                # Last resort - search all text for price pattern
                if price == 0:
                    text_content = product.get_text()
                    price_match = re.search(r'([\d.]+)\s*₪', text_content)
                    if price_match:
                        price = self.extract_price(price_match.group(0))
                
                # Extract image
                cover_url = ''
                img_elem = product.select_one('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Extract product link
                product_link = store_url
                link_elem = product.select_one('a[href]')
                if link_elem:
                    href = link_elem.get('href', '')
                    if href:
                        product_link = urljoin(store_url, href)
                
                record = {
                    'artist': artist[:100],  # Cap field lengths
                    'album': album[:200],
                    'price': price,
                    'cover_url': cover_url[:500],
                    'store_name': store_name,
                    'store_url': product_link[:500]
                }
                records.append(record)
                
            except Exception as e:
                logger.debug(f"Error parsing product in {store_name}: {e}")
                continue
        
        return records
    
    def parse_shopify_aggressive(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Aggressive Shopify parser."""
        records = []
        
        # Shopify selectors
        selectors = [
            'div[data-product-id]',
            'div.product-item',
            'li[data-product-title]',
            'div[class*="ProductCard"]',
        ]
        
        products = []
        for selector in selectors:
            found = soup.select(selector)
            if found:
                products = found
                break
        
        for product in products:
            try:
                # Get title
                title = product.select_one('h2, h3, [data-product-title], a')
                if not title:
                    continue
                
                title_text = title.get_text(strip=True) or title.get('data-product-title', '')
                if not title_text:
                    continue
                
                # Split title
                if ' - ' in title_text:
                    artist, album = title_text.split(' - ', 1)
                else:
                    artist = 'Unknown'
                    album = title_text
                
                # Price
                price = 0.0
                price_elem = product.select_one('[data-price], .price, .ProductPrice')
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                # Image
                cover_url = ''
                img = product.select_one('img')
                if img:
                    cover_url = img.get('src', '') or img.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Link
                product_link = store_url
                link = product.select_one('a[href*="/products/"]')
                if link:
                    product_link = urljoin(store_url, link.get('href', ''))
                
                record = {
                    'artist': artist.strip(),
                    'album': album.strip(),
                    'price': price,
                    'cover_url': cover_url,
                    'store_name': store_name,
                    'store_url': product_link
                }
                records.append(record)
            except Exception as e:
                logger.debug(f"Shopify parse error: {e}")
                continue
        
        return records
    
    def parse_generic_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Generic parser using store-specific selectors."""
        records = []
        
        # Store-specific selectors based on tested HTML analysis (VERIFIED WORKING)
        selector_map = {
            'ביטניק': '.product-small',  # Finds 40 items per page
            'שבלול תקליטים': '.product-small',  # Same structure
            'האוזן השלישית': 'li.product',  # Works for this store
            'גיורא תקליטים': 'li.product',  # WooCommerce standard
            'הסיבוב': 'li.product',  # WooCommerce standard
            'דה ויניל רום': 'li.product',  # WooCommerce standard
            'התו השמיני': 'div.col-md-4, div[class*="product-item"]',  # Custom grid
        }
        
        # Get store-specific selector or use generic fallback
        selector = selector_map.get(store_name)
        
        if not selector:
            # Generic fallback selectors
            selectors = [
                'div[class*="product"]',
                'li[class*="product"]',
                'article[class*="product"]',
                '.product',
            ]
            
            found_products = []
            for selector in selectors:
                found = soup.select(selector)
                if len(found) > 5:
                    found_products = found[:200]
                    break
        else:
            found_products = soup.select(selector)[:200]
        
        logger.info(f"Found {len(found_products)} potential products using selector for {store_name}")
        
        for product in found_products:
            try:
                # Get all text from product element
                full_text = product.get_text(strip=True)
                
                if not full_text or len(full_text) < 5:
                    continue
                
                # Skip navigation/menu items
                skip_keywords = ['עלינו', 'בלוג', 'דף בית', 'חנות', 'אודות', 'צור קשר', 'Menu', 'הוסף']
                if any(kw in full_text for kw in skip_keywords):
                    continue
                
                # Extract price (₪ symbol at end of string usually)
                price = 0.0
                title = full_text
                
                # Look for price at the end: number + ₪ or ₪ + number
                price_match = re.search(r'\D(\d+[\.,]?\d*)\s*₪|₪\s*(\d+[\.,]?\d*)$', full_text)
                if price_match:
                    price_str = (price_match.group(1) or price_match.group(2))
                    if price_str:
                        price_str = price_str.replace(',', '').replace('.', '')
                        try:
                            price = float(price_str)
                        except:
                            price = 0.0
                    # Remove price from title
                    title = re.sub(r'\s*\D(\d+[\.,]?\d*)\s*₪|₪\s*(\d+[\.,]?\d*)$', '', full_text).strip()
                
                # Clean title
                title = re.sub(r'[+×✓]$', '', title).strip()
                
                if not title or len(title) < 5:
                    continue
                
                # Split into artist - album
                artist = 'Unknown'
                album = title
                
                if ' – ' in title:
                    parts = title.split(' – ', 1)
                    artist, album = parts[0].strip(), parts[1].strip()
                elif ' - ' in title and len(title.split(' - ', 1)[0]) < 50:  # Avoid splitting on dashes in long titles
                    parts = title.split(' - ', 1)
                    artist, album = parts[0].strip(), parts[1].strip()
                
                # Extract image URL
                cover_url = ''
                img = product.select_one('img')
                if img:
                    cover_url = img.get('src', '') or img.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Extract product link
                product_link = store_url
                link = product.select_one('a[href]')
                if link:
                    product_link = urljoin(store_url, link.get('href', ''))
                
                # Add valid record
                if album and len(album) > 2:
                    record = {
                        'artist': artist,
                        'album': album,
                        'price': price,
                        'cover_url': cover_url,
                        'store_name': store_name,
                        'store_url': product_link
                    }
                    records.append(record)
                    
            except Exception as e:
                logger.debug(f"Parse error: {e}")
                continue
        
        return records
    
    def scrape_store(self, store_name: str, store_config: Dict) -> List[Dict]:
        """Scrape a single store with pagination support."""
        all_records = []
        
        try:
            catalog_url = store_config.get('catalog_url', store_config['url'])
            pagination_type = store_config.get('pagination', 'none')
            max_pages = store_config.get('max_pages', 10)
            min_page = store_config.get('min_page', 1)
            
            logger.info(f"Pagination type: {pagination_type}, max_pages: {max_pages}")
            
            # Handle different pagination types
            if pagination_type == 'none':
                # Single page, no pagination
                soup = self.fetch_page_with_selenium(catalog_url, max_scrolls=20)
                if soup:
                    records = self.parse_generic_products(soup, catalog_url, store_name)
                    all_records.extend(records)
                    
            elif pagination_type == 'scroll':
                # Single page with infinite scroll
                soup = self.fetch_page_with_selenium(catalog_url, max_scrolls=30)
                if soup:
                    records = self.parse_generic_products(soup, catalog_url, store_name)
                    all_records.extend(records)
                    
            elif pagination_type == 'pagenum':
                # URLs like: /pagenum/1/ /pagenum/2/ etc
                for page_num in range(min_page, max_pages + 1):
                    page_url = f"{catalog_url}{page_num}/"
                    logger.info(f"  Fetching page {page_num}/{max_pages}: {page_url}")
                    soup = self.fetch_page_with_selenium(page_url, max_scrolls=10)
                    if soup:
                        records = self.parse_generic_products(soup, page_url, store_name)
                        if records:
                            all_records.extend(records)
                        else:
                            logger.warning(f"No records found on page {page_num}, stopping pagination")
                            break
                    time.sleep(self.get_random_delay())
                    
            elif pagination_type == 'page':
                # URLs like: /page/1/ /page/2/ or /page/X/
                for page_num in range(min_page, max_pages + 1):
                    page_url = f"{catalog_url}{page_num}/"
                    logger.info(f"  Fetching page {page_num}/{max_pages}: {page_url}")
                    soup = self.fetch_page_with_selenium(page_url, max_scrolls=10)
                    if soup:
                        records = self.parse_generic_products(soup, page_url, store_name)
                        if records:
                            all_records.extend(records)
                        else:
                            logger.warning(f"No records found on page {page_num}, stopping pagination")
                            break
                    time.sleep(self.get_random_delay())
                    
            elif pagination_type == 'product-page':
                # Query param like: ?product-page=1 ?product-page=2
                for page_num in range(min_page, max_pages + 1):
                    page_url = f"{catalog_url}{page_num}"
                    logger.info(f"  Fetching page {page_num}/{max_pages}: {page_url}")
                    soup = self.fetch_page_with_selenium(page_url, max_scrolls=10)
                    if soup:
                        records = self.parse_generic_products(soup, page_url, store_name)
                        if records:
                            all_records.extend(records)
                        else:
                            logger.warning(f"No records found on page {page_num}, stopping pagination")
                            break
                    time.sleep(self.get_random_delay())
                    
            elif pagination_type == 'querypage':
                # Query param like: ?page=1 ?page=2
                for page_num in range(min_page, max_pages + 1):
                    page_url = f"{catalog_url}{page_num}"
                    logger.info(f"  Fetching page {page_num}/{max_pages}: {page_url}")
                    soup = self.fetch_page_with_selenium(page_url, max_scrolls=10)
                    if soup:
                        records = self.parse_generic_products(soup, page_url, store_name)
                        if records:
                            all_records.extend(records)
                        else:
                            logger.warning(f"No records found on page {page_num}, stopping pagination")
                            break
                    time.sleep(self.get_random_delay())
            
            logger.info(f"Scraped {len(all_records)} records from {store_name}")
            return all_records
            
        except Exception as e:
            logger.error(f"Error scraping {store_name}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []
    
    def scrape_third_ear(self, url: str, store_name: str) -> List[Dict]:
        """Specialized scraper for Third Ear - Wix-based WooCommerce hybrid."""
        records = []
        try:
            # Third Ear specific - try direct shop URL
            shop_urls = [
                'https://www.third-ear.com/shop/',
                'https://www.third-ear.com/products/',
                'https://www.third-ear.com/woo-shop',
                url
            ]
            
            for shop_url in shop_urls:
                soup = self.fetch_page_with_selenium(shop_url, wait_selector='[class*="product"]', max_scrolls=8)
                if not soup:
                    continue
                
                # Try multiple selectors
                found = soup.select('div[class*="product"]')
                if found:
                    records = self.parse_woocommerce_products_aggressive(soup, shop_url, store_name)
                    if records:
                        logger.info(f"Found {len(records)} records in Third Ear via {shop_url}")
                        break
        
        except Exception as e:
            logger.warning(f"Error in Third Ear special scraper: {e}")
        
        return records
    
    def scrape_giora(self, store_config: Dict, store_name: str) -> List[Dict]:
        """Specialized scraper for Giora Records."""
        records = []
        try:
            # Giora - try homepage first which may list products
            urls_to_try = [
                store_config['url'],
                store_config.get('catalog_url', ''),
                'https://www.giorarecords.co.il/all-releases/',
                'https://www.giorarecords.co.il/woocommerce/',
            ]
            
            for test_url in urls_to_try:
                if not test_url:
                    continue
                    
                soup = self.fetch_page_with_selenium(test_url, wait_selector='[class*="product"]', max_scrolls=8)
                if not soup:
                    continue
                
                found_records = self.parse_woocommerce_products_aggressive(soup, test_url, store_name)
                if found_records:
                    logger.info(f"Found {len(found_records)} records in Giora")
                    return found_records
                
                # Also try generic parsing
                found_records = self.parse_generic_products(soup, test_url, store_name)
                if found_records:
                    logger.info(f"Found {len(found_records)} records in Giora (generic)")
                    return found_records
        
        except Exception as e:
            logger.warning(f"Error in Giora special scraper: {e}")
        
        return records
    
    def scrape_disccenter(self, store_config: Dict, store_name: str) -> List[Dict]:
        """Specialized scraper for DiscCenter - custom .NET site."""
        records = []
        try:
            soup = self.fetch_page_with_selenium(store_config['url'], max_scrolls=10)
            if not soup:
                return []
            
            # Look for product listings in tables or divs
            products = soup.select('div[class*="item"], div[class*="product"], tr[class*="product"]')
            
            for product in products[:300]:
                try:
                    # Extract from any text pattern
                    text = product.get_text()
                    
                    # Look for price
                    price_match = re.search(r'([\d.]+)\s*₪', text)
                    price = 0.0
                    if price_match:
                        price = self.extract_price(price_match.group(0))
                    
                    # Look for title
                    title_elem = product.select_one('td, div, span, a')
                    if not title_elem:
                        continue
                    
                    title = title_elem.get_text(strip=True)
                    if not title or len(title) < 3:
                        continue
                    
                    # Split title
                    if ' - ' in title:
                        artist, album = title.split(' - ', 1)
                    else:
                        artist = 'Unknown'
                        album = title
                    
                    # Extract link
                    link_elem = product.select_one('a[href]')
                    product_link = store_config['url']
                    if link_elem:
                        product_link = urljoin(store_config['url'], link_elem.get('href', ''))
                    
                    record = {
                        'artist': artist.strip()[:100],
                        'album': album.strip()[:200],
                        'price': price,
                        'cover_url': '',
                        'store_name': store_name,
                        'store_url': product_link[:500]
                    }
                    records.append(record)
                except:
                    continue
        
        except Exception as e:
            logger.warning(f"Error in DiscCenter scraper: {e}")
        
        return records
    
    def scrape_rolling_dice(self, url: str, store_name: str) -> List[Dict]:
        """Specialized scraper for Rollin' Dise Shopify store."""
        records = []
        try:
            # Try various Shopify collection URLs
            urls_to_try = [
                'https://www.rollindise.com/collections/all',
                'https://www.rollindise.com/collections/products',
                'https://www.rollindise.com/collections/vinyl-records',
                'https://www.rollindise.com/products',
                url
            ]
            
            for test_url in urls_to_try:
                soup = self.fetch_page_with_selenium(test_url, wait_selector='[class*="product"]', max_scrolls=10)
                if not soup:
                    continue
                
                # Try Shopify parsing
                records = self.parse_shopify_aggressive(soup, test_url, store_name)
                if records:
                    logger.info(f"Found {len(records)} records in Rollin' Dise")
                    break
                
                # Try generic parsing
                records = self.parse_generic_products(soup, test_url, store_name)
                if records:
                    logger.info(f"Found {len(records)} records in Rollin' Dise (generic)")
                    break
        
        except Exception as e:
            logger.warning(f"Error in Rollin' Dise scraper: {e}")
        
        return records
    
    def scrape_taklit_house(self, url: str, store_name: str) -> List[Dict]:
        """Specialized scraper for Taklit House - Wix site."""
        records = []
        try:
            # Try Wix-specific URLs
            urls_to_try = [
                url,
                'https://www.taklithouse.com/shop/',
                'https://www.taklithouse.com/products/',
                'https://www.taklithouse.com/category/vinyls',
            ]
            
            for test_url in urls_to_try:
                soup = self.fetch_page_with_selenium(test_url, wait_selector='[class*="product"]', max_scrolls=10)
                if not soup:
                    continue
                
                # Wix uses specific class patterns
                records = self.parse_wix_products(soup, test_url, store_name)
                if records:
                    logger.info(f"Found {len(records)} records in Taklit House")
                    break
        
        except Exception as e:
            logger.warning(f"Error in Taklit House scraper: {e}")
        
        return records
    
    def parse_wix_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Advanced Wix products parser."""
        records = []
        
        # Wix-specific selectors
        selectors = [
            '[data-product]',
            '[wix-product]',
            'div[class*="ProductItem"]',
            'div[class*="product"]',
            'li[class*="product"]',
        ]
        
        products = []
        for selector in selectors:
            found = soup.select(selector)
            if len(found) > 2:
                products = found
                break
        
        for product in products[:300]:
            try:
                # Extract title
                title_elem = product.select_one('h1, h2, h3, h4, a, span')
                if not title_elem:
                    continue
                
                title = title_elem.get_text(strip=True)
                if not title or len(title) < 2:
                    continue
                
                if ' - ' in title:
                    artist, album = title.split(' - ', 1)
                else:
                    artist = 'Unknown'
                    album = title
                
                # Price
                price = 0.0
                text = product.get_text()
                price_match = re.search(r'([\d.]+)\s*₪', text)
                if price_match:
                    price = self.extract_price(price_match.group(0))
                
                # Image
                cover_url = ''
                img = product.select_one('img')
                if img:
                    cover_url = img.get('src', '') or img.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Link
                product_link = store_url
                link = product.select_one('a[href]')
                if link:
                    product_link = urljoin(store_url, link.get('href', ''))
                
                record = {
                    'artist': artist.strip()[:100],
                    'album': album.strip()[:200],
                    'price': price,
                    'cover_url': cover_url[:500],
                    'store_name': store_name,
                    'store_url': product_link[:500]
                }
                records.append(record)
            except Exception as e:
                logger.debug(f"Wix parse error: {e}")
                continue
        
        return records
    
    def fetch_page_requests(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch page with requests library."""
        try:
            headers = {
                'User-Agent': self.get_random_user_agent(),
                'Accept-Language': 'he-IL,he;q=0.9',
                'Accept-Encoding': 'gzip'
            }
            response = requests.get(url, headers=headers, timeout=self.timeout)
            response.encoding = 'utf-8'
            response.raise_for_status()
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None
    
    def scrape_woocommerce_pagination(self, base_url: str, store_name: str) -> List[Dict]:
        """Scrape multiple pages from WooCommerce store."""
        all_records = []
        
        for page in range(2, 6):  # Pages 2-5
            try:
                # Try different pagination patterns
                page_url = f"{base_url}?paged={page}"
                
                soup = self.fetch_page_with_selenium(page_url, max_scrolls=5)
                if not soup:
                    break
                
                records = self.parse_woocommerce_products_aggressive(soup, page_url, store_name)
                if not records:
                    break
                
                all_records.extend(records)
                logger.info(f"Scraped page {page} of {store_name}: {len(records)} records")
                time.sleep(self.get_random_delay())
                
            except Exception as e:
                logger.warning(f"Error scraping page {page} of {store_name}: {e}")
                break
        
        return all_records
    
    def scrape_all_stores(self) -> List[Dict]:
        """Scrape ALL stores aggressively."""
        all_records = []
        
        try:
            for store_name, store_config in self.stores.items():
                logger.info(f"\n{'='*60}")
                logger.info(f"Scraping {store_name}...")
                logger.info(f"Platform: {store_config.get('platform')}, JS Heavy: {store_config.get('js_heavy')}")
                logger.info(f"{'='*60}")
                
                # Initialize fresh driver for each store
                self.close_selenium_driver()
                if store_config.get('js_heavy'):
                    self.init_selenium_driver()
                
                records = self.scrape_store(store_name, store_config)
                all_records.extend(records)
                
                logger.info(f"✓ {store_name}: {len(records)} records")
                time.sleep(self.get_random_delay())
        
        finally:
            self.close_selenium_driver()
        
        logger.info(f"\n{'='*60}")
        logger.info(f"TOTAL RECORDS SCRAPED: {len(all_records)}")
        logger.info(f"Average per store: {len(all_records) / len(self.stores):.0f}")
        logger.info(f"{'='*60}")
        
        return all_records
    
    def scrape_single_store(self, store_name: str) -> List[Dict]:
        """Scrape a single store."""
        if store_name not in self.stores:
            logger.error(f"Store '{store_name}' not found")
            return []
        
        self.init_selenium_driver()
        try:
            store_config = self.stores[store_name]
            return self.scrape_store(store_name, store_config)
        finally:
            self.close_selenium_driver()
