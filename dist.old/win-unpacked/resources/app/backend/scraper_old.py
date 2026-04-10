import requests
from bs4 import BeautifulSoup
import time
import random
import re
from typing import List, Dict, Optional
import logging
from urllib.parse import urljoin, urlparse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ScraperEngine:
    """Web scraper for Israeli vinyl record stores."""
    
    def __init__(self):
        # User agents for polite scraping
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ]
        
        self.timeout = 10
        self.delay_range = (1.5, 3)  # Seconds between requests
        
        # Store configurations with metadata
        self.stores = {
            'האוזן השלישית': {
                'url': 'https://www.third-ear.com/',
                'catalog_url': 'https://www.third-ear.com/product-category/vinyl/',
                'platform': 'woocommerce'
            },
            'ביטניק': {
                'url': 'https://www.beatnik.co.il/',
                'catalog_url': 'https://www.beatnik.co.il/shop/',
                'platform': 'woocommerce'
            },
            'שבלול תקליטים': {
                'url': 'https://shabloolrecords.co.il/',
                'catalog_url': 'https://shabloolrecords.co.il/shop/',
                'platform': 'woocommerce'
            },
            'דיסק סנטר': {
                'url': 'https://www.disccenter.co.il/',
                'catalog_url': 'https://www.disccenter.co.il/',
                'platform': 'custom'
            },
            'התו השמיני': {
                'url': 'https://www.tav8.co.il/',
                'catalog_url': 'https://www.tav8.co.il/',
                'platform': 'custom'
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
                'platform': 'woocommerce'
            },
            'התקליטים שלי': {
                'url': 'https://www.my-records.co.il/',
                'catalog_url': 'https://www.my-records.co.il/',
                'platform': 'custom'
            },
            'וינילסטוק': {
                'url': 'https://www.vinylstock.co.il/',
                'catalog_url': 'https://www.vinylstock.co.il/shop/',
                'platform': 'woocommerce'
            },
            'רולינג דייס': {
                'url': 'https://www.rollindise.com/',
                'catalog_url': 'https://www.rollindise.com/collections/all',
                'platform': 'shopify'
            },
        }
    
    def get_random_user_agent(self) -> str:
        """Get a random user agent string."""
        return random.choice(self.user_agents)
    
    def get_random_delay(self) -> float:
        """Get a random delay between min and max."""
        return random.uniform(self.delay_range[0], self.delay_range[1])
    
    def fetch_page(self, url: str, use_session=False) -> Optional[BeautifulSoup]:
        """Fetch and parse a webpage."""
        try:
            headers = {
                'User-Agent': self.get_random_user_agent(),
                'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
            }
            response = requests.get(url, headers=headers, timeout=self.timeout)
            response.encoding = 'utf-8'
            response.raise_for_status()
            return BeautifulSoup(response.content, 'html.parser')
        except requests.RequestException as e:
            logger.error(f"Error fetching {url}: {e}")
            return None
    
    def extract_price(self, text: str) -> float:
        """Extract numeric price from text with currency symbol."""
        if not text:
            return 0.0
        # Remove common currency symbols and spaces
        cleaned = text.replace('₪', '').replace('$', '').strip()
        # Handle both comma and dot as decimal separator
        cleaned = cleaned.replace(',', '.')
        # Extract first number found
        match = re.search(r'\d+(?:\.\d+)?', cleaned)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return 0.0
        return 0.0
    
    def parse_woocommerce_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse WooCommerce product listings."""
        records = []
        
        # Find all product containers
        products = soup.find_all('li', class_=re.compile(r'product', re.I))
        if not products:
            products = soup.find_all('div', class_=re.compile(r'product-item|product-card|woocommerce-loop-product', re.I))
        
        for product in products:
            try:
                # Get product title
                title_elem = product.find(['h2', 'h3', 'a'], class_=re.compile(r'title|name', re.I))
                if not title_elem:
                    title_elem = product.find('a', {'class': re.compile(r'product', re.I)})
                
                if not title_elem:
                    continue
                
                title = title_elem.get_text(strip=True)
                if not title:
                    continue
                
                # Split title into artist - album
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                # Get product price
                price = 0.0
                price_elem = product.find(['span', 'ins', 'div'], class_=re.compile(r'price', re.I))
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                # Get cover image
                cover_url = ''
                img_elem = product.find('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Get product link
                product_link = store_url
                link_elem = product.find('a', href=True)
                if link_elem:
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
                logger.warning(f"Error parsing WooCommerce product in {store_name}: {e}")
                continue
        
        return records
    
    def parse_shopify_products(self, soup: BeautifulSoup, store_url: str, store_name: str) -> List[Dict]:
        """Parse Shopify product listings."""
        records = []
        
        # Shopify typically uses 'product-item' or 'product' classes
        products = soup.find_all(['div', 'li'], class_=re.compile(r'product', re.I))
        
        for product in products:
            try:
                # Get product title/link
                link_elem = product.find('a', {'class': re.compile(r'product-link|product-title', re.I)})
                if not link_elem:
                    link_elem = product.find('a', href=re.compile(r'/products/'))
                
                if not link_elem:
                    continue
                
                title = link_elem.get_text(strip=True)
                if not title:
                    continue
                
                # Split title into artist - album
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                # Get price
                price = 0.0
                price_elem = product.find(['span', 'div'], class_=re.compile(r'price', re.I))
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                # Get image
                cover_url = ''
                img_elem = product.find('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Get product URL
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
        
        # Wix typically uses data attributes
        products = soup.find_all(['div', 'li'], class_=re.compile(r'product|item', re.I))
        
        for product in products:
            try:
                # Get title
                title_elem = product.find(['h2', 'h3', 'span'], class_=re.compile(r'title|name', re.I))
                if not title_elem:
                    title_elem = product.find('a')
                
                if not title_elem:
                    continue
                
                title = title_elem.get_text(strip=True)
                if not title:
                    continue
                
                # Split title
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    album = parts[1].strip()
                else:
                    artist = 'Unknown'
                    album = title
                
                # Get price
                price = 0.0
                price_elem = product.find(['span', 'div'], class_=re.compile(r'price|cost', re.I))
                if price_elem:
                    price = self.extract_price(price_elem.get_text(strip=True))
                
                # Get image
                cover_url = ''
                img_elem = product.find('img')
                if img_elem:
                    cover_url = img_elem.get('src', '') or img_elem.get('data-src', '')
                    if cover_url and not cover_url.startswith('http'):
                        cover_url = urljoin(store_url, cover_url)
                
                # Get link
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
    
    def scrape_store_by_platform(self, store_name: str, store_config: Dict) -> List[Dict]:
        """Scrape a specific store using appropriate platform parser."""
        records = []
        catalog_url = store_config.get('catalog_url', store_config['url'])
        fallback_url = store_config['url']  # Homepage as fallback
        platform = store_config.get('platform', 'woocommerce')
        
        try:
            # Try catalog URL first
            soup = self.fetch_page(catalog_url)
            
            # If catalog URL fails, fallback to homepage
            if not soup and catalog_url != fallback_url:
                logger.warning(f"Catalog URL failed for {store_name}, trying homepage...")
                soup = self.fetch_page(fallback_url)
                catalog_url = fallback_url  # Update URL for parsing
            
            if not soup:
                logger.warning(f"Could not fetch any page for {store_name}")
                return records
            
            # Parse based on platform
            if platform == 'woocommerce':
                records = self.parse_woocommerce_products(soup, catalog_url, store_name)
            elif platform == 'shopify':
                records = self.parse_shopify_products(soup, catalog_url, store_name)
            elif platform == 'wix':
                records = self.parse_wix_products(soup, catalog_url, store_name)
            elif platform == 'custom':
                # Try generic parsing for custom platforms
                records = self.parse_woocommerce_products(soup, catalog_url, store_name)
            
            logger.info(f"Found {len(records)} records from {store_name} ({platform})")
            
        except Exception as e:
            logger.error(f"Error scraping {store_name}: {e}")
        
        return records
    
    def scrape_all_stores(self) -> List[Dict]:
        """Scrape all configured stores using platform-specific parsers."""
        all_records = []
        
        for store_name, store_config in self.stores.items():
            logger.info(f"Scraping {store_name}...")
            
            try:
                records = self.scrape_store_by_platform(store_name, store_config)
                all_records.extend(records)
                logger.info(f"Found {len(records)} records from {store_name}")
                
                # Polite delay between requests
                time.sleep(self.get_random_delay())
                
            except Exception as e:
                logger.error(f"Failed to scrape {store_name}: {e}")
                continue
        
        logger.info(f"Scraping complete. Total records: {len(all_records)}")
        return all_records
    
    def scrape_store(self, store_name: str) -> List[Dict]:
        """Scrape a single store by name."""
        if store_name not in self.stores:
            logger.error(f"Store '{store_name}' not found in configured stores")
            return []
        
        store_config = self.stores[store_name]
        logger.info(f"Scraping {store_name}...")
        
        return self.scrape_store_by_platform(store_name, store_config)
