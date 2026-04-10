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
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ScraperEngine:
    """Enhanced web scraper for Israeli vinyl record stores with site-specific handlers."""
    
    def __init__(self):
        # User agents for polite scraping
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ]
        
        self.timeout = 15
        self.delay_range = (1, 2)
        self.selenium_timeout = 10
        
        # Store configurations with metadata
        self.stores = {
            'האוזן השלישית': {
                'url': 'https://www.third-ear.com/',
                'catalog_url': 'https://www.third-ear.com/product-category/vinyl/',
                'platform': 'woocommerce_js'  # Requires JavaScript
            },
            'ביטניק': {
                'url': 'https://www.beatnik.co.il/',
                'catalog_url': 'https://www.beatnik.co.il/shop/',
                'platform': 'woocommerce_js'
            },
            'שבלול תקליטים': {
                'url': 'https://shabloolrecords.co.il/',
                'catalog_url': 'https://shabloolrecords.co.il/shop/',
                'platform': 'woocommerce_brotli'
            },
            'דיסק סנטר': {
                'url': 'https://www.disccenter.co.il/',
                'catalog_url': 'https://www.disccenter.co.il/',
                'platform': 'custom_netframework_js'  # Requires JavaScript
            },
            'התו השמיני': {
                'url': 'https://www.tav8.co.il/',
                'catalog_url': 'https://www.tav8.co.il/',
                'platform': 'custom_aspnet'
            },
            'גיורא תקליטים': {
                'url': 'https://www.giorarecords.co.il/',
                'catalog_url': 'https://www.giorarecords.co.il/shop/',
                'platform': 'woocommerce'
            },
            'בית התקליט': {
                'url': 'https://www.taklithouse.com/',
                'catalog_url': 'https://www.taklithouse.com/',
                'platform': 'wix'
            },
            'הסיבוב': {
                'url': 'https://hasivoov.co.il/',
                'catalog_url': 'https://hasivoov.co.il/shop/',
                'platform': 'woocommerce'
            },
            'דה ויניל רום': {
                'url': 'https://thevinylroom.co.il/',
                'catalog_url': 'https://thevinylroom.co.il/shop/',
                'platform': 'woocommerce_js'
            },
            'התקליטים שלי': {
                'url': 'https://www.my-records.co.il/',
                'catalog_url': 'https://www.my-records.co.il/',
                'platform': 'custom_restricted'
            },
            'וינילסטוק': {
                'url': 'https://www.vinylstock.co.il/',
                'catalog_url': 'https://www.vinylstock.co.il/shop/',
                'platform': 'woocommerce_js'
            },
            'רולינג דייס': {
                'url': 'https://www.rollindise.com/',
                'catalog_url': 'https://www.rollindise.com/collections/all',
                'platform': 'shopify'
            },
        }
        
        self.driver = None
    
    def get_random_user_agent(self) -> str:
        """Get a random user agent string."""
        return random.choice(self.user_agents)
    
    def get_random_delay(self) -> float:
        """Get a random delay between min and max."""
        return random.uniform(self.delay_range[0], self.delay_range[1])
    
    def extract_price(self, text: str) -> float:
        """Extract numeric price from text with currency symbol."""
        if not text:
            return 0.0
        cleaned = text.replace('₪', '').replace('$', '').replace(',', '.').strip()
        match = re.search(r'\d+(?:\.\d+)?', cleaned)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return 0.0
        return 0.0
    
    def fetch_page(self, url: str, max_retries: int = 3) -> Optional[BeautifulSoup]:
        """Fetch and parse a webpage with retry logic."""
        for attempt in range(max_retries):
            try:
                headers = {
                    'User-Agent': self.get_random_user_agent(),
                    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip',  # Skip Brotli
                }
                response = requests.get(url, headers=headers, timeout=self.timeout)
                response.encoding = 'utf-8'
                response.raise_for_status()
                return BeautifulSoup(response.content, 'html.parser')
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.warning(f"Retry {attempt + 1}/{max_retries} for {url} after {wait_time}s: {e}")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts: {e}")
                    return None
    
    def fetch_page_with_selenium(self, url: str, wait_selector: str = ".product, li.product, div.product-item") -> Optional[BeautifulSoup]:
        """Fetch page using Selenium to handle JavaScript-rendered content."""
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_argument(f"user-agent={self.get_random_user_agent()}")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            
            logger.info(f"Selenium: Loading {url}")
            driver.get(url)
            
            # Wait for page to load - use multiple possible selectors
            selectors_to_try = [
                ".product",
                "li.product",
                "div.product-item",
                "[class*='product']",
                "a[href*='product']",
                "div[class*='item']",
            ]
            
            page_loaded = False
            for selector in selectors_to_try:
                try:
                    WebDriverWait(driver, 5).until(
                        EC.presence_of_all_elements_located((By.CSS_SELECTOR, selector))
                    )
                    logger.info(f"Selenium: Found products with selector: {selector}")
                    page_loaded = True
                    break
                except:
                    continue
            
            if not page_loaded:
                logger.info(f"Selenium: No specific selector found, waiting for general page load...")
                time.sleep(5)  # Just wait for page
            
            # Scroll to load lazy-loaded images
            try:
                # Multiple scrolls to trigger lazy loading
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.5);")
                time.sleep(1)
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
                driver.execute_script("window.scrollTo(0, 0);")  # Back to top
                time.sleep(1)
            except Exception as e:
                logger.warning(f"Selenium scroll error: {e}")
            
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            driver.quit()
            return soup
            
        except Exception as e:
            logger.error(f"Selenium error for {url}: {e}")
            try:
                driver.quit()
            except:
                pass
            return None
    
    def parse_woocommerce_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse WooCommerce product listings with multiple strategies."""
        records = []
        
        # Strategy 1: Look for product containers
        products = soup.find_all('li', class_=re.compile(r'product', re.I))
        if not products:
            products = soup.find_all('div', class_=re.compile(r'product-item|product-card|woocommerce-loop-product', re.I))
        
        # Strategy 2: If still no products, look for all links that might be products
        if not products:
            all_links = soup.find_all('a', href=True)
            products = [link for link in all_links if re.search(r'product|shop|album|record', link.get('href', ''), re.I)]
        
        for product in products[:150]:  # Increased limit
            try:
                # Try to get title from various places
                title_elem = product.find(['h2', 'h3', 'a'], class_=re.compile(r'title|name', re.I))
                if not title_elem:
                    title_elem = product.find('a', {'class': re.compile(r'product', re.I)})
                if not title_elem:
                    title_elem = product if isinstance(product, type(soup.find('a'))) else product.find('a')
                
                if not title_elem:
                    continue
                
                title = title_elem.get_text(strip=True)
                if not title or len(title) < 3:
                    continue
                
                # Split title into artist - album
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                # Get price - look in product container and parent
                price = 0.0
                price_elem = product.find(['span', 'ins', 'div'], class_=re.compile(r'price', re.I))
                if not price_elem and hasattr(product, 'parent'):
                    price_elem = product.parent.find(['span', 'ins', 'div'], class_=re.compile(r'price', re.I))
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                # Get image
                cover_url = ''
                img_elem = product.find('img')
                if not img_elem and hasattr(product, 'parent'):
                    img_elem = product.parent.find('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Get link
                product_link = store_url
                link_elem = product.find('a', href=True) if hasattr(product, 'find') else product
                if link_elem and link_elem.get('href'):
                    href = link_elem.get('href', '')
                    if href:
                        product_link = urljoin(store_url, href)
                
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
                logger.warning(f"Error parsing product in {store_name}: {e}")
                continue
        
        return records
    
    def parse_shopify_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse Shopify product listings."""
        records = []
        
        products = soup.find_all(['div', 'li'], class_=re.compile(r'product', re.I))
        
        for product in products[:100]:
            try:
                link_elem = product.find('a', {'class': re.compile(r'product-link|product-title', re.I)})
                if not link_elem:
                    link_elem = product.find('a', href=re.compile(r'/products/'))
                
                if not link_elem:
                    continue
                
                title = link_elem.get_text(strip=True)
                if not title:
                    continue
                
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                price = 0.0
                price_elem = product.find(['span', 'div'], class_=re.compile(r'price', re.I))
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                cover_url = ''
                img_elem = product.find('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                product_link = store_url
                if link_elem and link_elem.get('href'):
                    product_link = urljoin(store_url, link_elem.get('href'))
                
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
                logger.warning(f"Error parsing Shopify product in {store_name}: {e}")
                continue
        
        return records
    
    def parse_wix_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse Wix shop product listings."""
        records = []
        
        products = soup.find_all(['div', 'li'], class_=re.compile(r'product|item|card', re.I))
        
        for product in products[:100]:
            try:
                title_elem = product.find(['h2', 'h3', 'span', 'div'], class_=re.compile(r'title|name|product-name', re.I))
                if not title_elem:
                    title_elem = product.find('a')
                
                if not title_elem:
                    continue
                
                title = title_elem.get_text(strip=True)
                if not title:
                    continue
                
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                price = 0.0
                price_elem = product.find(['span', 'div'], class_=re.compile(r'price|cost', re.I))
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                cover_url = ''
                img_elem = product.find('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                product_link = store_url
                link_elem = product.find('a', href=True)
                if link_elem:
                    product_link = urljoin(store_url, link_elem.get('href'))
                
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
                logger.warning(f"Error parsing Wix product in {store_name}: {e}")
                continue
        
        return records
    
    def parse_disccenter(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse DiscCenter-specific products (custom .NET site)."""
        records = []
        
        try:
            # Strategy 1: Look for product containers
            products = soup.find_all(['div', 'tr', 'li'], class_=re.compile(r'product|item|row|record|album', re.I))
            
            # Strategy 2: Look for elements containing price
            if not products or len(products) < 5:
                all_elements = soup.find_all(['div', 'span', 'a', 'td'], string=re.compile(r'₪|תקליט|album|vinyl', re.I))
                products = all_elements[:200]
            
            # Strategy 3: Look for all cells/rows in tables
            if not products or len(products) < 5:
                products = soup.find_all(['td', 'tr'])[50:300]
            
            for product in products:
                try:
                    text = product.get_text(strip=True) if hasattr(product, 'get_text') else ''
                    if len(text) < 5:
                        continue
                    
                    # Look for artist - album pattern (more flexible)
                    lines = [line.strip() for line in text.split('\n') if line.strip()]
                    
                    # Try to find title with dash
                    title = None
                    for line in lines:
                        if ' - ' in line and len(line) > 10:
                            title = line
                            break
                    
                    if not title and text and ' - ' in text:
                        title = text.split(' - ', 1)[0] + ' - ' + text.split(' - ', 1)[1] if len(text.split(' - ', 1)) > 1 else None
                    
                    if not title:
                        continue
                    
                    # Split title
                    if ' - ' in title:
                        parts = title.split(' - ', 1)
                        artist = parts[0].strip()
                        album = parts[1].strip()
                        if len(artist) < 2 or len(album) < 2:
                            continue
                    else:
                        continue
                    
                    # Extract price - look in product and parent
                    price = 0.0
                    product_text = text if isinstance(product, str) else product.get_text()
                    price_match = re.search(r'₪\s*([\d,.]+)', product_text)
                    if price_match:
                        price = self.extract_price(price_match.group(1))
                    else:
                        # Look in parent element
                        if hasattr(product, 'parent') and product.parent:
                            parent_text = product.parent.get_text()
                            price_match = re.search(r'₪\s*([\d,.]+)', parent_text)
                            if price_match:
                                price = self.extract_price(price_match.group(1))
                    
                    # Get image
                    cover_url = ''
                    img_elem = product.find('img') if hasattr(product, 'find') else None
                    if not img_elem and hasattr(product, 'parent'):
                        img_elem = product.parent.find('img')
                    if img_elem:
                        cover_url = img_elem.get('src', '')
                        if cover_url and not cover_url.startswith('http'):
                            cover_url = urljoin(store_url, cover_url)
                    
                    record = {
                        'artist': artist,
                        'album': album,
                        'price': price,
                        'cover_url': cover_url,
                        'store_name': store_name,
                        'store_url': store_url
                    }
                    records.append(record)
                    
                except Exception as e:
                    logger.debug(f"Error parsing DiscCenter product: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Error scraping DiscCenter: {e}")
        
        return records
    
    def parse_tav8(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse Tav8-specific products (custom ASP.NET site)."""
        records = []
        
        try:
            # Tav8 uses custom HTML structure
            products = soup.find_all(['div', 'li', 'tr'], class_=re.compile(r'product|item|album|record', re.I))
            
            if not products:
                products = soup.find_all('a', href=re.compile(r'StoreCategoryId|product|album', re.I))
            
            for product in products[:100]:
                try:
                    text = product.get_text(strip=True)
                    if len(text) < 5:
                        continue
                    
                    # Try to parse artist - album
                    if ' - ' in text:
                        parts = text.split(' - ', 1)
                        artist = parts[0].strip()
                        album = parts[1].strip()
                    else:
                        artist = 'Unknown'
                        album = text
                    
                    price = 0.0
                    price_match = re.search(r'₪\s*([\d,.]+)', text)
                    if price_match:
                        price = self.extract_price(price_match.group(1))
                    
                    cover_url = ''
                    img_elem = product.find('img') or product.find_parent().find('img') if product.find_parent() else None
                    if img_elem:
                        cover_url = img_elem.get('src', '')
                        if cover_url and not cover_url.startswith('http'):
                            cover_url = urljoin(store_url, cover_url)
                    
                    record = {
                        'artist': artist,
                        'album': album,
                        'price': price,
                        'cover_url': cover_url,
                        'store_name': store_name,
                        'store_url': store_url
                    }
                    records.append(record)
                    
                except Exception as e:
                    logger.warning(f"Error parsing Tav8 product: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Error scraping Tav8: {e}")
        
        return records
    
    def parse_my_records(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse My Records specific products."""
        records = []
        
        try:
            # Look for product listings
            products = soup.find_all(['div', 'li', 'tr'], class_=re.compile(r'product|item|record|album', re.I))
            
            for product in products[:100]:
                try:
                    text = product.get_text(strip=True)
                    if len(text) < 5:
                        continue
                    
                    if ' - ' in text:
                        parts = text.split(' - ', 1)
                        artist = parts[0].strip()
                        album = parts[1].strip()
                    else:
                        continue
                    
                    price = 0.0
                    price_match = re.search(r'₪\s*([\d,.]+)', text)
                    if price_match:
                        price = self.extract_price(price_match.group(1))
                    
                    cover_url = ''
                    img_elem = product.find('img')
                    if img_elem:
                        cover_url = img_elem.get('src', '')
                        if cover_url and not cover_url.startswith('http'):
                            cover_url = urljoin(store_url, cover_url)
                    
                    record = {
                        'artist': artist,
                        'album': album,
                        'price': price,
                        'cover_url': cover_url,
                        'store_name': store_name,
                        'store_url': store_url
                    }
                    records.append(record)
                    
                except Exception as e:
                    logger.warning(f"Error parsing My Records product: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Error scraping My Records: {e}")
        
        return records
    
    def scrape_store_by_platform(self, store_name: str, store_config: Dict) -> List[Dict]:
        """Scrape a specific store using appropriate platform parser."""
        records = []
        platform = store_config.get('platform', 'woocommerce')
        catalog_url = store_config.get('catalog_url', store_config['url'])
        fallback_url = store_config['url']
        
        try:
            logger.info(f"Scraping {store_name} ({platform})...")
            
            # Route to appropriate parser based on platform
            if platform == 'woocommerce_js':
                # JavaScript-heavy WooCommerce
                soup = self.fetch_page_with_selenium(catalog_url)
                if not soup:
                    soup = self.fetch_page_with_selenium(fallback_url)
                if soup:
                    records = self.parse_woocommerce_products(soup, catalog_url, store_name)
                    
            elif platform == 'woocommerce_brotli':
                # WooCommerce with Brotli issues
                soup = self.fetch_page(catalog_url)
                if not soup and catalog_url != fallback_url:
                    soup = self.fetch_page(fallback_url)
                if soup:
                    records = self.parse_woocommerce_products(soup, catalog_url or fallback_url, store_name)
                    
            elif platform == 'woocommerce':
                # Standard WooCommerce
                soup = self.fetch_page(catalog_url)
                if not soup and catalog_url != fallback_url:
                    soup = self.fetch_page(fallback_url)
                if soup:
                    records = self.parse_woocommerce_products(soup, catalog_url or fallback_url, store_name)
                    
            elif platform == 'shopify':
                soup = self.fetch_page(catalog_url)
                if soup:
                    records = self.parse_shopify_products(soup, catalog_url, store_name)
                    
            elif platform == 'wix':
                soup = self.fetch_page(fallback_url)
                if soup:
                    records = self.parse_wix_products(soup, fallback_url, store_name)
                    
            elif platform == 'custom_netframework_js':
                # DiscCenter - custom .NET with JavaScript
                soup = self.fetch_page_with_selenium(fallback_url)
                if soup:
                    records = self.parse_disccenter(soup, fallback_url, store_name)
                    
            elif platform == 'custom_netframework':
                # DiscCenter - custom .NET
                soup = self.fetch_page(fallback_url)
                if soup:
                    records = self.parse_disccenter(soup, fallback_url, store_name)
                    
            elif platform == 'custom_aspnet':
                # Tav8 - custom ASP.NET
                soup = self.fetch_page(fallback_url)
                if soup:
                    records = self.parse_tav8(soup, fallback_url, store_name)
                    
            elif platform == 'custom_restricted':
                # My Records
                soup = self.fetch_page(fallback_url)
                if soup:
                    records = self.parse_my_records(soup, fallback_url, store_name)
            
            logger.info(f"Found {len(records)} records from {store_name}")
            return records
            
        except Exception as e:
            logger.error(f"Error scraping {store_name}: {e}", exc_info=True)
            return records
    
    def scrape_all_stores(self) -> List[Dict]:
        """Scrape all configured stores using platform-specific parsers."""
        all_records = []
        
        for store_name, store_config in self.stores.items():
            try:
                records = self.scrape_store_by_platform(store_name, store_config)
                all_records.extend(records)
                
                # Polite delay between stores
                time.sleep(self.get_random_delay())
                
            except Exception as e:
                logger.error(f"Failed to scrape {store_name}: {e}")
                continue
        
        logger.info(f"Scraping complete. Total records: {len(all_records)}")
        return all_records
    
    def scrape_store(self, store_name: str) -> List[Dict]:
        """Scrape a single store by name."""
        if store_name not in self.stores:
            logger.error(f"Store '{store_name}' not found")
            return []
        
        store_config = self.stores[store_name]
        return self.scrape_store_by_platform(store_name, store_config)
