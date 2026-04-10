"""Fast vinyl record scraper with optimized Selenium usage."""

import requests
from bs4 import BeautifulSoup
import time
import random
import re
import logging
from typing import List, Dict, Optional
from urllib.parse import urljoin
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FastScraperEngine:
    """Fast web scraper with smart Selenium usage."""
    
    # Stores that require Selenium for JavaScript rendering
    SELENIUM_REQUIRED = {
        'ביטניק',  # WooCommerce with AJAX
        'שבלול תקליטים',  # WooCommerce with AJAX  
        'האוזן השלישית',  # WooCommerce
        'בית תקליט',  # Wix
        'הסיבוב',  # WooCommerce
        'דה ויניל רום',  # WooCommerce
        'התקליטים שלי',  # WooCommerce
        'גיורא תקליטים',  # WooCommerce
        'דיסק סנטר',  # Custom
        'התו השמיני',  # Custom
        'רולינג דייס',  # Shopify
        'ויניל סטוק',  # WooCommerce
    }
    
    def __init__(self):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        ]
        
        self.timeout = 8
        self.selenium_driver = None
        self.session = requests.Session()
        
        self.stores = {
            'בית תקליט': {
                'url': 'https://www.taklithouse.com/',
                'catalog_url': 'https://www.taklithouse.com/shop/',
                'platform': 'wix',
                'requires_selenium': False
            },
            'ביטניק': {
                'url': 'https://www.beatnik.co.il/',
                'catalog_url': 'https://www.beatnik.co.il/shop/',
                'platform': 'woocommerce',
                'requires_selenium': False
            },
            'שבלול תקליטים': {
                'url': 'https://shabloolrecords.co.il/',
                'catalog_url': 'https://shabloolrecords.co.il/shop/',
                'platform': 'woocommerce',
                'requires_selenium': False
            },
            'הסיבוב': {
                'url': 'https://hasivoov.co.il/',
                'catalog_url': 'https://hasivoov.co.il/shop/',
                'platform': 'woocommerce',
                'requires_selenium': False
            },
            'דה ויניל רום': {
                'url': 'https://thevinylroom.co.il/',
                'catalog_url': 'https://thevinylroom.co.il/shop/',
                'platform': 'woocommerce',
                'requires_selenium': False
            },
            'התקליטים שלי': {
                'url': 'https://www.my-records.co.il/',
                'catalog_url': 'https://www.my-records.co.il/shop/',
                'platform': 'woocommerce',
                'requires_selenium': False
            },
            'גיורא תקליטים': {
                'url': 'https://www.giorarecords.co.il/',
                'catalog_url': 'https://www.giorarecords.co.il/shop/', 
                'platform': 'woocommerce',
                'requires_selenium': False
            },
            'האוזן השלישית': {
                'url': 'https://www.third-ear.com/',
                'catalog_url': 'https://www.third-ear.com/product-category/vinyl/',
                'platform': 'woocommerce',
                'requires_selenium': True
            },
            'דיסק סנטר': {
                'url': 'https://www.disccenter.co.il/',
                'catalog_url': 'https://www.disccenter.co.il/',
                'platform': 'custom',
                'requires_selenium': False
            },
            'התו השמיני': {
                'url': 'https://www.tav8.co.il/',
                'catalog_url': 'https://www.tav8.co.il/',
                'platform': 'custom',
                'requires_selenium': False
            },
            'רולינג דייס': {
                'url': 'https://www.rollin-dice.co.il/',
                'catalog_url': 'https://www.rollin-dice.co.il/shop/',
                'platform': 'shopify',
                'requires_selenium': False
            },
            'ויניל סטוק': {
                'url': 'https://www.vinylstock.co.il/',
                'catalog_url': 'https://www.vinylstock.co.il/shop/',
                'platform': 'woocommerce',
                'requires_selenium': False
            },
        }
    
    def init_selenium(self):
        """Initialize Selenium driver once."""
        if self.selenium_driver is not None:
            return
        
        try:
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_argument(f'user-agent={self.user_agents[0]}')
            
            service = Service(ChromeDriverManager().install())
            self.selenium_driver = webdriver.Chrome(service=service, options=chrome_options)
            logger.info("Selenium driver initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Selenium: {e}")
    
    def close_selenium(self):
        """Close Selenium driver."""
        if self.selenium_driver:
            try:
                self.selenium_driver.quit()
            except:
                pass
            self.selenium_driver = None
    
    def fetch_with_requests(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch page with requests library."""
        try:
            headers = {
                'User-Agent': random.choice(self.user_agents),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
            }
            
            response = self.session.get(url, headers=headers, timeout=self.timeout)
            response.encoding = 'utf-8'
            
            if response.status_code == 200:
                return BeautifulSoup(response.text, 'html.parser')
            else:
                logger.warning(f"HTTP {response.status_code} for {url}")
                return None
        except Exception as e:
            logger.warning(f"Error fetching {url}: {e}")
            return None
    
    def fetch_with_selenium(self, url: str, wait_time: int = 5) -> Optional[BeautifulSoup]:
        """Fetch page with Selenium."""
        try:
            self.init_selenium()
            self.selenium_driver.get(url)
            
            # Wait for body to load - this gets the initial page render
            WebDriverWait(self.selenium_driver, min(wait_time, 5)).until(
                EC.presence_of_all_elements_located((By.TAG_NAME, "body"))
            )
            
            # Minimal scrolling - just enough to trigger lazy loading
            for _ in range(2):
                self.selenium_driver.execute_script("window.scrollBy(0, 300)")
                time.sleep(0.2)
            
            # Return to top
            self.selenium_driver.execute_script("window.scrollTo(0, 0)")
            
            return BeautifulSoup(self.selenium_driver.page_source, 'html.parser')
        except Exception as e:
            logger.warning(f"Selenium fetch failed for {url}: {e}")
            return None
    
    def extract_price(self, text: str) -> float:
        """Extract price from text."""
        if not text:
            return 0.0
        
        # Remove non-numeric characters except dot
        text = str(text).replace('₪', '').replace(',', '.').strip()
        
        # Find first number sequence
        match = re.search(r'\d+(?:\.\d+)?', text)
        if match:
            try:
                return float(match.group())
            except:
                return 0.0
        
        return 0.0
    
    def parse_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Generic product parser - extracts from HTML/JSON."""
        records = []
        
        # Try multiple HTML selectors first
        product_selectors = [
            'li.product',
            'div.product',
            'article[class*="product"]',
            'div[data-product-id]',
            'div[class*="ProductCard"]',
            '[class*="woocommerce"]',
        ]
        
        products = []
        selector_used = None
        for selector in product_selectors:
            products = soup.select(selector)
            if products:
                selector_used = selector
                break
        
        # If basic HTML selectors didn't work, look for WooCommerce script data
        if not products:
            # Some WooCommerce sites embed product data in script tags or data attributes
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string and ('product' in script.string.lower() or 'item' in script.string.lower()):
                    # Try to extract JSON data
                    try:
                        import json
                        # Look for JSON pattern
                        import re
                        json_pattern = r'\{.*?"name".*?"price".*?\}'
                        matches = re.findall(json_pattern, script.string, re.DOTALL)
                        if matches:
                            # Found potential product data
                            for match in matches[:50]:
                                try:
                                    data = json.loads(match)
                                    if 'name' in data and ('price' in data or 'amount' in data):
                                        artist = data.get('name', 'Unknown')[:100]
                                        album = artist  
                                        price = float(data.get('price', data.get('amount', 0)))
                                        
                                        records.append({
                                            'artist': 'Unknown',
                                            'album': artist,
                                            'price': price,
                                            'cover_url': '',
                                            'store_name': store_name,
                                            'store_url': store_url
                                        })
                                except:
                                    pass
                    except:
                        pass
        else:
            logger.info(f"Found {len(products)} products with selector: {selector_used}")
        
        # Parse HTML products
        for product in products[:300]:
            try:
                # Extract title from link or heading
                title = None
                for elem in product.select('a, h2, h3, h4'):
                    text = elem.get_text(strip=True)
                    if text and len(text) > 3:
                        title = text
                        break
                
                if not title:
                    # Try getting all text and looking for artist - album pattern
                    text = product.get_text()
                    match = re.search(r'(.+?)\s*-\s*(.+?)(?:\n|₪|$)', text)
                    if match:
                        title = f"{match.group(1).strip()} - {match.group(2).strip()}"
                
                if not title:
                    continue
                
                # Clean title
                title = re.sub(r'(Select|Read|View|Quick|Add to cart)', '', title, flags=re.I).strip()
                if len(title) < 2 or len(title) > 500:
                    continue
                
                # Split artist - album
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()[:100]
                    album = parts[1].strip()[:200]
                else:
                    artist = 'Unknown'
                    album = title[:200]
                
                # Extract price - try multiple strategies
                price = 0.0
                
                # 1. Data attributes
                for attr in ['data-price', 'data-regular-price', 'data-amount']:
                    price_val = product.get(attr)
                    if price_val:
                        price = self.extract_price(price_val)
                        if price > 0:
                            break
                
                # 2. Price elements
                if price == 0:
                    for price_elem in product.select('[data-price], .price, .amount, bdi, .woocommerce-Price-amount'):
                        price_text = price_elem.get_text(strip=True)
                        price = self.extract_price(price_text)
                        if price > 0:
                            break
                
                # 3. Text pattern matching
                if price == 0:
                    text_content = product.get_text()
                    price_match = re.search(r'([\d.,]+)\s*₪', text_content)
                    if price_match:
                        price = self.extract_price(price_match.group(0))
                
                # Extract image
                cover_url = ''
                img = product.select_one('img')
                if img:
                    cover_url = img.get('src', '') or img.get('data-src', '')
                    if not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Extract product link
                product_link = store_url
                link = product.select_one('a[href]')
                if link:
                    href = link.get('href', '')
                    if href:
                        product_link = urljoin(store_url, href)
                
                records.append({
                    'artist': artist,
                    'album': album,
                    'price': price,
                    'cover_url': cover_url[:500],
                    'store_name': store_name,
                    'store_url': product_link[:500]
                })
            
            except Exception as e:
                logger.debug(f"Error parsing product in {store_name}: {e}")
                continue
        
        return records
    
    def scrape_pagination(self, base_url: str, store_name: str, use_selenium: bool = False) -> List[Dict]:
        """Scrape multiple pages."""
        all_records = []
        
        for page in range(1, 6):
            try:
                page_url = f"{base_url}?paged={page}" if page > 1 else base_url
                
                if use_selenium:
                    soup = self.fetch_with_selenium(page_url)
                else:
                    soup = self.fetch_with_requests(page_url)
                
                if not soup:
                    break
                
                records = self.parse_products(soup, page_url, store_name)
                if not records:
                    break
                
                all_records.extend(records)
                logger.info(f"{store_name} page {page}: {len(records)} records")
                time.sleep(random.uniform(0.5, 1.5))
            
            except Exception as e:
                logger.warning(f"Error scraping page {page} of {store_name}: {e}")
                break
        
        return all_records
    
    def scrape_store(self, store_name: str, config: Dict) -> List[Dict]:
        """Scrape a single store."""
        try:
            logger.info(f"\nScraping {store_name}...")
            catalog_url = config.get('catalog_url', config['url'])
            
            # Use Selenium for all WooCommerce / complex sites that need JS
            requires_selenium = store_name in self.SELENIUM_REQUIRED or config.get('requires_selenium', False)
            
            records = self.scrape_pagination(catalog_url, store_name, use_selenium=requires_selenium)
            
            logger.info(f"[OK] {store_name}: {len(records)} records")
            return records
        
        except Exception as e:
            logger.error(f"Error scraping {store_name}: {e}")
            return []
    
    def scrape_all_stores(self) -> List[Dict]:
        """Scrape all stores - reuse Selenium driver across stores."""
        all_records = []
        
        logger.info("="*60)
        logger.info("STARTING SCRAPE OF ALL STORES")  
        logger.info("="*60)
        
        try:
            # Initialize driver once at the start if needed
            has_selenium_stores = any(
                store_name in self.SELENIUM_REQUIRED 
                for store_name in self.stores.keys()
            )
            if has_selenium_stores:
                self.init_selenium()
            
            for store_name, config in self.stores.items():
                records = self.scrape_store(store_name, config)
                all_records.extend(records)
                time.sleep(random.uniform(0.5, 1.0))  # Brief pause between stores
        
        finally:
            self.close_selenium()
        
        logger.info("\n" + "="*60)
        logger.info(f"TOTAL SCRAPED: {len(all_records)} records")
        stores_with_data = {}
        for rec in all_records:
            store = rec['store_name']
            stores_with_data[store] = stores_with_data.get(store, 0) + 1
        
        for store, count in sorted(stores_with_data.items(), key=lambda x: -x[1]):
            logger.info(f"  {store}: {count:4d}")
        logger.info("="*60)
        
        return all_records
