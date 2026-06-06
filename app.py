#!/usr/bin/env python3
"""
Vinyl Store - 10X Better Database
Combines Discogs API (professional global) + Israeli retail stores
With automated daily growth scheduler

Can run as:
1. Flask web server (python app.py)
2. Electron desktop app (via main.js)
3. Standalone Python (via flask_server.py)
"""

import sys
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None
sys.stderr.reconfigure(encoding='utf-8') if hasattr(sys.stderr, 'reconfigure') else None

from flask import Flask, jsonify, request, render_template_string
import sqlite3
import os
import json
import re
import hashlib
from datetime import datetime
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from apscheduler.schedulers.background import BackgroundScheduler
import requests
from bs4 import BeautifulSoup
from threading import Thread, Lock
import time

# Try importing Flask-CORS for production deployment
try:
    from flask_cors import CORS
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False
    print("[WARNING] Flask-CORS not installed - CORS disabled")

# Import Scrapling integration
try:
    from scrapling_integration.flask_api import register_scraper_routes
    SCRAPLING_AVAILABLE = True
except ImportError:
    SCRAPLING_AVAILABLE = False
    print("[WARNING] Scrapling integration not available")

# Detect if running in Electron
IS_ELECTRON = os.environ.get('ELECTRON_START') == '1' or 'electron' in sys.argv[0].lower() or __name__ == '__main__'

app = Flask(__name__)

# Enable CORS for production deployment
if CORS_AVAILABLE:
    CORS(app, resources={
        r"/api/*": {
            "origins": os.environ.get(
                'CORS_ALLOWED_ORIGINS',
                'https://israeli-vinyls-projectv.netlify.app,http://localhost:5000,http://127.0.0.1:5000,http://localhost:5173,http://127.0.0.1:5173'
            ).split(','),
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })

# Production database configuration (resolved after get_db_path definition)
DB_PATH = None

# ============================================================================
# ALL 12 ISRAELI VINYL STORES REGISTRY
# ============================================================================
VINYL_STORES = {
    "beatnik": {
        "name": "Beatnik",
        "name_hebrew": "ביטניק",
        "url": "https://beatnik.co.il",
        "platforms": ["WooCommerce"],
        "city": "Tel Aviv",
        "description": "Israel's largest independent music store",
        "estimated_records": 30000,
        "genres": ["Rock", "Jazz", "Electronic", "Pop"],
        "color": "#FF6B6B"
    },
    "shablool": {
        "name": "Shablool",
        "name_hebrew": "שבלול",
        "url": "https://shablool.co.il",
        "platforms": ["WooCommerce", "AJAX"],
        "city": "Tel Aviv",
        "description": "Classic Israeli vinyl retailer with extensive catalog",
        "estimated_records": 215000,
        "genres": ["Rock", "Blues", "Jazz", "World", "Classical"],
        "color": "#4ECDC4"
    },
    "taklit_house": {
        "name": "Taklit House",
        "name_hebrew": "בית התקליטים",
        "url": "https://taklitim.com",
        "platforms": ["Wix"],
        "city": "Jerusalem",
        "description": "Jerusalem's vinyl specialist with rare records",
        "estimated_records": 14000,
        "genres": ["Jazz", "Classical", "World", "Rock"],
        "color": "#95E1D3"
    },
    "third_ear": {
        "name": "Third Ear",
        "name_hebrew": "האוזן השלישית",
        "url": "https://third-ear.com",
        "platforms": ["Custom E-commerce"],
        "city": "Tel Aviv",
        "description": "Premium vinyl selection and rare imports",
        "estimated_records": 15000,
        "genres": ["Electronic", "Experimental", "Indie"],
        "color": "#F38181"
    },
    "disc_center": {
        "name": "Disc Center",
        "name_hebrew": "דיסק סנטר",
        "url": "https://disccenter.co.il",
        "platforms": ["WooCommerce"],
        "city": "Ramat Gan",
        "description": "Major CD and vinyl distributor",
        "estimated_records": 20000,
        "genres": ["Rock", "Pop", "Electronic", "Hip-Hop"],
        "color": "#AA96DA"
    },
    "tav8": {
        "name": "Tav8",
        "name_hebrew": "תו שמיני",
        "url": "https://tav8.co.il",
        "platforms": ["WooCommerce"],
        "city": "Netanya",
        "description": "Vinyl and music equipment specialist",
        "estimated_records": 12000,
        "genres": ["Jazz", "Classical", "Blues", "Rock"],
        "color": "#FCBAD3"
    },
    "giora_records": {
        "name": "Giora Records",
        "name_hebrew": "גיורה",
        "url": "https://giorarecords.co.il",
        "platforms": ["Custom E-commerce"],
        "city": "Holon",
        "description": "Independent record store with curated selection",
        "estimated_records": 18000,
        "genres": ["Rock", "Funk", "Soul", "Reggae"],
        "color": "#A8D8EA"
    },
    "hasivoov": {
        "name": "HaSivoov",
        "name_hebrew": "הַסִּיבּוּב",
        "url": "https://hasivoov.co.il",
        "platforms": ["WooCommerce"],
        "city": "Ramat Hasharon",
        "description": "Specialty vinyl turntables and records",
        "estimated_records": 11000,
        "genres": ["Classical", "Jazz", "World"],
        "color": "#AA96DA"
    },
    "vinyl_room": {
        "name": "The Vinyl Room",
        "name_hebrew": "חדר הגרופות",
        "url": "https://thevinylroom.co.il",
        "platforms": ["WooCommerce"],
        "city": "Petah Tikva",
        "description": "Modern vinyl record shop",
        "estimated_records": 16000,
        "genres": ["Rock", "Indie", "Pop"],
        "color": "#FFD93D"
    },
    "my_records": {
        "name": "My Records",
        "name_hebrew": "שלי",
        "url": "https://my-records.co.il",
        "platforms": ["WooCommerce"],
        "city": "Haifa",
        "description": "Northern Israel's vinyl destination",
        "estimated_records": 13000,
        "genres": ["Rock", "Pop", "Electronic"],
        "color": "#6BCB77"
    },
    "vinyl_stock": {
        "name": "Vinyl Stock",
        "name_hebrew": "מלאי תקליטים",
        "url": "https://vinylstock.co.il",
        "platforms": ["WooCommerce"],
        "city": "Ashdod",
        "description": "Southern Israel's vinyl supplier",
        "estimated_records": 14000,
        "genres": ["Rock", "Jazz", "Blues"],
        "color": "#FF6B9D"
    },
    "rolling_dice": {
        "name": "Rolling Dice",
        "name_hebrew": "גלגול קוביות",
        "url": "https://rollindise.com",
        "platforms": ["Custom"],
        "city": "Tel Aviv",
        "description": "Hip vinyl and music collective",
        "estimated_records": 17000,
        "genres": ["Hip-Hop", "Funk", "Soul", "Electronic"],
        "color": "#C06C84"
    }
}

# Store ID mapping (lowercase names for URL routing)
STORE_IDS = list(VINYL_STORES.keys())

# Set database path - try different locations for packaged app
def get_db_path():
    """Get database path, checking multiple locations"""
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "music_stores.db"),  # Check root first
        os.path.join(os.getcwd(), "music_stores.db"),  # Check current directory
        os.path.join(os.path.dirname(__file__), "dist", "music_stores.db"),  # Then check dist
        os.path.join(os.getcwd(), "dist", "music_stores.db"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist", "music_stores.db"),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    # Return default (root directory)
    return possible_paths[0]

env_db = os.environ.get('DATABASE_URL', '').strip()
if env_db.startswith('sqlite://'):
    candidate_db = env_db.replace('sqlite://', '').replace('sqlite://///', '/')
    candidate_dir = os.path.dirname(candidate_db) or '.'
    DB_PATH = candidate_db if os.path.isdir(candidate_dir) else get_db_path()
else:
    DB_PATH = get_db_path()

# Validate database schema on startup
def _validate_db_schema():
    """Validate that database has required schema."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if records table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='records'")
        if not cursor.fetchone():
            print("[WARNING] Table 'records' not found in database. App may not work correctly.")
            conn.close()
            return False
        
        # Check for required columns
        cursor.execute("PRAGMA table_info(records)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        
        required = ['id', 'artist', 'album', 'price', 'store_name']
        missing = [col for col in required if col not in columns]
        
        if missing:
            print(f"[ERROR] Database missing required columns: {missing}")
            print(f"        Database will not work correctly.")
        else:
            print("[OK] Database schema validated successfully")
        
        conn.close()
        return len(missing) == 0
    except Exception as e:
        print(f"[ERROR] Failed to validate database schema: {e}")
        return False

_validate_db_schema()

# Global scheduler instance
scheduler = None
scheduler_state = {
    "last_run": None,
    "last_result": None,
    "last_trueup_run": None,
    "last_trueup_result": None,
    "status": "not_started"
}

# Ensure database has Israeli store records on startup
def _ensure_israeli_records():
    """Ensure database includes Israeli store records."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM records WHERE store_name != 'Discogs'")
        israeli_count = cursor.fetchone()[0]
        conn.close()
        
        if israeli_count == 0:
            # Need to augment - import and run augmentation
            import subprocess
            subprocess.run([sys.executable, 'augment_with_israeli_records.py'], 
                          cwd='.', capture_output=True)
    except:
        pass  # Silent fail - database will work even without augmentation

_ensure_israeli_records()

# Discogs Cover Cache for Album Cover Fetching
DISCOGS_COVER_CACHE = {}
DISCOGS_CACHE_LOCK = Lock()
DISCOGS_REQUESTS_LOCK = Lock()  # Rate limiting for Discogs API (1 req per second max)
LAST_DISCOGS_REQUEST = {"time": 0}

def get_discogs_cover(artist, album):
    """
    Fetch album cover URL from Discogs API.
    Returns cached result if available, or None if not found.
    Includes rate limiting to respect Discogs API limits.
    """
    cache_key = f"{artist}|{album}".lower()
    
    # Check cache first
    with DISCOGS_CACHE_LOCK:
        if cache_key in DISCOGS_COVER_CACHE:
            return DISCOGS_COVER_CACHE[cache_key]
    
    try:
        # Rate limiting: max 1 request per second
        with DISCOGS_REQUESTS_LOCK:
            time_since_last = time.time() - LAST_DISCOGS_REQUEST["time"]
            if time_since_last < 1.1:
                time.sleep(1.1 - time_since_last)
            
            # Query Discogs API
            search_url = f"https://api.discogs.com/database/search?artist={artist}&release_title={album}&type=release"
            headers = {"User-Agent": "VinylStore/1.0"}
            
            response = requests.get(search_url, headers=headers, timeout=5)
            LAST_DISCOGS_REQUEST["time"] = time.time()
            
            if response.status_code == 200:
                data = response.json()
                if data.get("results") and len(data["results"]) > 0:
                    first_result = data["results"][0]
                    cover_url = first_result.get("cover_image", "")
                    
                    # Cache the result (even if empty, to avoid repeated failed requests)
                    with DISCOGS_CACHE_LOCK:
                        DISCOGS_COVER_CACHE[cache_key] = cover_url if cover_url else None
                    
                    return cover_url if cover_url else None
            
            # Cache negative result
            with DISCOGS_CACHE_LOCK:
                DISCOGS_COVER_CACHE[cache_key] = None
            
            return None
    except Exception as e:
        # Silently fail for network/API errors
        return None

def enrich_records_with_covers(records):
    """
    Enrich records with cover URLs from Discogs if missing.
    Does this asynchronously in background to not slow down search.
    """
    def fetch_missing_covers():
        """Background task to fetch missing covers"""
        for record in records:
            if not record.get("cover_url"):
                artist = record.get("artist", "")
                album = record.get("album", "")
                if artist and album:
                    cover = get_discogs_cover(artist, album)
                    if cover:
                        record["cover_url"] = cover
                        # Update database with fetched cover
                        try:
                            conn = get_db()
                            cursor = conn.cursor()
                            cursor.execute("UPDATE records SET cover_url = ? WHERE id = ?", (cover, record.get("id")))
                            conn.commit()
                            conn.close()
                        except:
                            pass  # Silently fail on DB update errors
    
    # Run in background thread to not block search results
    Thread(target=fetch_missing_covers, daemon=True).start()
    return records


# Asset-Finder style live store scraping
LIVE_STORE_CONFIGS = [
    {
        "id": "beatnik",
        "name": "ביטניק",
        "website": "https://www.beatnik.co.il/",
        "search_paths": [
            "/product/?s={query}",
            "/shop/?s={query}",
            "/?s={query}&post_type=product",
            "/search?q={query}",
        ],
    },
    {
        "id": "tav8",
        "name": "תו 8",
        "website": "https://www.tav8.co.il/",
        "search_paths": ["/?search={query}", "/search?q={query}", "/?s={query}"],
    },
    {
        "id": "the-vinyl-room",
        "name": "The Vinyl Room",
        "website": "https://thevinylroom.co.il/",
        "search_paths": ["/?search={query}", "/search?q={query}", "/?s={query}"],
    },
    {
        "id": "rockstore-1970",
        "name": "Rock Store 1970",
        "website": "https://rockstore1970.co.il/",
        "search_paths": ["/?search={query}", "/search?q={query}", "/?s={query}"],
    },
    {
        "id": "hod-hamahat",
        "name": "הוד המחט",
        "website": "https://hodhamahat.com/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "holit-records",
        "name": "Holit Records",
        "website": "https://holit-records.co.il/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "taklit-house",
        "name": "Taklit House",
        "website": "https://www.taklithouse.com/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "b-side-haifa",
        "name": "B-Side Haifa",
        "website": "https://www.bsidehaifa.co.il/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "vinyl-stock",
        "name": "Vinyl Stock",
        "website": "https://www.vinylstock.co.il/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "vinylia-records",
        "name": "Vinylia Records",
        "website": "https://vinyliarecords.co.il/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "transistore",
        "name": "Transistore",
        "website": "https://transistore.co.il/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "rollin-dise",
        "name": "Rollin Dise",
        "website": "https://www.rollindise.com/",
        "search_paths": ["/search?q={query}", "/?s={query}", "/?s={query}&post_type=product"],
    },
    {
        "id": "h2shop-records",
        "name": "H2Shop תקליטים",
        "website": "https://h2shop.co.il/",
        "search_paths": [
            "/product-category/%D7%AA%D7%A7%D7%9C%D7%99%D7%98%D7%99%D7%9D/?s={query}",
            "/?s={query}&post_type=product",
            "/search?q={query}",
        ],
    },
]


def _live_normalize_text(value):
    return re.sub(r"[^\w\u0590-\u05FF]+", " ", (value or "").lower()).strip()


def _live_query_matches(text, normalized_query):
    tokens = [t for t in normalized_query.split(" ") if len(t) > 1]
    if not tokens:
        return False
    ntext = _live_normalize_text(text)
    return any(t in ntext for t in tokens)


def _live_parse_price(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"(\d+(?:[.,]\d{1,2})?)", str(value).replace(",", ""))
    return float(match.group(1)) if match else None


def _live_first_string(value):
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, list):
        for item in value:
            found = _live_first_string(item)
            if found:
                return found
    if isinstance(value, dict):
        return _live_first_string(value.get("url")) or _live_first_string(value.get("@id"))
    return None


def _live_extract_jsonld_products(soup):
    products = []

    def collect(node):
        if isinstance(node, list):
            for item in node:
                collect(item)
            return
        if not isinstance(node, dict):
            return

        node_type = node.get("@type")
        type_values = node_type if isinstance(node_type, list) else [node_type]
        if any(str(tv).lower() == "product" for tv in type_values if tv is not None):
            products.append(node)

        collect(node.get("@graph"))
        collect(node.get("itemListElement"))

    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    for script in scripts:
        raw = (script.string or script.text or "").strip()
        if not raw:
            continue
        try:
            collect(json.loads(raw))
        except Exception:
            continue

    return products


def _live_looks_like_product_link(url):
    path = (urlparse(url).path or "").lower()
    return any(keyword in path for keyword in ["product", "shop", "item", "album", "record"])


def _live_extract_products_from_html(html, page_url, normalized_query, store):
    soup = BeautifulSoup(html, "html.parser")
    results = []

    og_image_tag = soup.find("meta", attrs={"property": "og:image"}) or soup.find(
        "meta", attrs={"name": "og:image"}
    )
    og_image = og_image_tag.get("content") if og_image_tag else None

    for product in _live_extract_jsonld_products(soup):
        title = _live_first_string(product.get("name"))
        if not title or not _live_query_matches(title, normalized_query):
            continue

        offers = product.get("offers")
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if not isinstance(offers, dict):
            offers = {}

        product_url = urljoin(page_url, _live_first_string(product.get("url")) or page_url)
        image = _live_first_string(product.get("image")) or og_image
        image = urljoin(page_url, image) if image else None

        item_id = hashlib.sha256(f"{store['id']}:{product_url}".encode("utf-8")).hexdigest()[:24]
        results.append(
            {
                "id": item_id,
                "store_name": store["name"],
                "album": title,
                "artist": None,
                "genre": None,
                "format": None,
                "condition": None,
                "year": None,
                "price": _live_parse_price(offers.get("price")),
                "product_url": product_url,
                "store_url": store["website"],
                "currency": "ILS",
                "cover_url": image,
            }
        )

    if results:
        return results

    title_tag = soup.find("title")
    title = title_tag.get_text(" ", strip=True) if title_tag else None
    if title and _live_query_matches(title, normalized_query) and _live_looks_like_product_link(page_url):
        item_id = hashlib.sha256(f"{store['id']}:{page_url}".encode("utf-8")).hexdigest()[:24]
        results.append(
            {
                "id": item_id,
                "store_name": store["name"],
                "album": title,
                "artist": None,
                "genre": None,
                "format": None,
                "condition": None,
                "year": None,
                "price": _live_parse_price(soup.get_text(" ", strip=True)),
                "product_url": page_url,
                "store_url": store["website"],
                "currency": "ILS",
                "cover_url": og_image,
            }
        )

    return results


def _live_search_single_store(store, query, normalized_query):
    headers = {
        "user-agent": "Mozilla/5.0 (compatible; IsraeliVinylSearch/1.0; +https://replit.com)",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    }

    found = []
    seen = set()

    for path in store["search_paths"]:
        search_url = urljoin(store["website"], path.replace("{query}", requests.utils.quote(query)))
        try:
            response = requests.get(search_url, headers=headers, timeout=7)
            if response.status_code >= 400:
                continue
            html = response.text
        except Exception:
            continue

        for item in _live_extract_products_from_html(html, search_url, normalized_query, store):
            key = (item.get("product_url") or "").split("?")[0].split("#")[0]
            if key and key not in seen:
                seen.add(key)
                found.append(item)

        soup = BeautifulSoup(html, "html.parser")
        links = []
        for anchor in soup.find_all("a", href=True):
            href = urljoin(search_url, anchor["href"])
            text = anchor.get_text(" ", strip=True)
            if _live_looks_like_product_link(href) and _live_query_matches(f"{text} {href}", normalized_query):
                links.append(href)

        for href in links[:6]:
            try:
                product_page = requests.get(href, headers=headers, timeout=6)
                if product_page.status_code >= 400:
                    continue
                for item in _live_extract_products_from_html(product_page.text, href, normalized_query, store):
                    key = (item.get("product_url") or "").split("?")[0].split("#")[0]
                    if key and key not in seen:
                        seen.add(key)
                        found.append(item)
            except Exception:
                continue

    return found[:8]


def _search_live_stores(query, store_filter=""):
    normalized_query = _live_normalize_text(query)
    normalized_filter = _live_normalize_text((store_filter or "").replace("_", "-").replace(" ", "-"))

    stores = []
    for store in LIVE_STORE_CONFIGS:
        if not normalized_filter:
            stores.append(store)
            continue

        sid = _live_normalize_text(store["id"].replace("-", " "))
        sname = _live_normalize_text(store["name"])
        if normalized_filter in sid or sid in normalized_filter or normalized_filter in sname or sname in normalized_filter:
            stores.append(store)

    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(_live_search_single_store, store, query, normalized_query) for store in stores]
        for future in as_completed(futures):
            try:
                results.extend(future.result())
            except Exception:
                continue

    deduped = []
    seen = set()
    for item in results:
        key = (item.get("product_url") or "").split("?")[0].split("#")[0]
        if key and key not in seen:
            seen.add(key)
            deduped.append(item)

    deduped.sort(key=lambda rec: (rec.get("price") is None, rec.get("price") or 0))
    return deduped

def _initialize_scheduler():
    """Initialize background scheduler for automated daily growth."""
    global scheduler, scheduler_state
    
    try:
        if scheduler is not None and scheduler.running:
            return
        
        from scheduler_service import scheduler_service
        
        scheduler = BackgroundScheduler()
        trueup_interval_minutes = max(5, int(os.environ.get("TRUEUP_INTERVAL_MINUTES", "30")))
        
        # Schedule daily task at 2 AM
        scheduler.add_job(
            func=_run_scheduled_growth,
            trigger="cron",
            hour=2,
            minute=0,
            id="daily_growth_job",
            name="Daily Database Growth",
            replace_existing=True
        )

        scheduler.add_job(
            func=_run_incremental_trueup,
            trigger="interval",
            minutes=trueup_interval_minutes,
            id="incremental_trueup_job",
            name="Incremental Data True-Up",
            replace_existing=True
        )
        
        scheduler.start()
        scheduler_state["status"] = "running"
        
        print(
            f"[SCHEDULER] ✓ Background scheduler initialized - daily growth at 2 AM, true-up every {trueup_interval_minutes}m"
        )
    
    except ImportError:
        print("[SCHEDULER] ⚠️  scheduler_service module not found - background scheduling disabled")
        scheduler_state["status"] = "error"
    except Exception as e:
        print(f"[SCHEDULER] ✗ Failed to initialize: {str(e)}")
        scheduler_state["status"] = "error"

def _run_scheduled_growth():
    """Wrapper for scheduled job execution."""
    global scheduler_state
    
    try:
        from scheduler_service import scheduler_service
        
        result = scheduler_service.daily_automated_growth()
        scheduler_state["last_run"] = datetime.now().isoformat()
        scheduler_state["last_result"] = result
        scheduler_state["status"] = "running"
        
        print("[SCHEDULER] ✓ Daily growth job completed")
    
    except Exception as e:
        scheduler_state["status"] = "error"
        scheduler_state["last_error"] = str(e)
        print(f"[SCHEDULER] ✗ Job failed: {str(e)}")


def _run_incremental_trueup():
    """Run incremental data true-up in the background."""
    global scheduler_state

    try:
        from scheduler_service import scheduler_service

        result = scheduler_service.incremental_data_trueup()
        scheduler_state["last_trueup_run"] = datetime.now().isoformat()
        scheduler_state["last_trueup_result"] = result
        scheduler_state["status"] = "running"

        print("[SCHEDULER] ✓ Incremental true-up job completed")

    except Exception as e:
        scheduler_state["status"] = "error"
        scheduler_state["last_error"] = str(e)
        print(f"[SCHEDULER] ✗ True-up job failed: {str(e)}")


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10.0)  # Timeout for concurrent access
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for better concurrency
    try:
        conn.execute('PRAGMA journal_mode=WAL')
    except:
        pass  # Silently fail if WAL not supported
    return conn

@app.route('/')
def index():
    """Main dashboard"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = 'Discogs'")
    discogs = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT store_name) FROM records")
    num_stores = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT genre) FROM records WHERE genre IS NOT NULL")
    num_genres = cursor.fetchone()[0]
    
    conn.close()
    
    return render_template_string("""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vinyl Atlas</title>
        <style>
            :root {
                --bg-0: #09141b;
                --bg-1: #10242b;
                --bg-2: #17343d;
                --glass: rgba(255, 255, 255, 0.08);
                --glass-strong: rgba(255, 255, 255, 0.14);
                --text-main: #f4f8fb;
                --text-muted: #bed3dd;
                --accent: #f4a261;
                --accent-2: #2a9d8f;
                --ok: #8bc34a;
                --danger: #ef5350;
                --line: rgba(255, 255, 255, 0.18);
                --shadow: 0 16px 40px rgba(3, 11, 16, 0.45);
                --radius-lg: 18px;
                --radius-md: 12px;
                --radius-sm: 8px;
            }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                min-height: 100vh;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                color: var(--text-main);
                background:
                    radial-gradient(circle at 85% 12%, rgba(244, 162, 97, 0.28), transparent 42%),
                    radial-gradient(circle at 12% 88%, rgba(42, 157, 143, 0.25), transparent 48%),
                    linear-gradient(135deg, var(--bg-0) 0%, var(--bg-1) 45%, var(--bg-2) 100%);
                padding: 24px;
            }

            .shell {
                max-width: 1320px;
                margin: 0 auto;
                display: grid;
                gap: 20px;
            }

            .glass {
                background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
                border: 1px solid var(--line);
                border-radius: var(--radius-lg);
                box-shadow: var(--shadow);
                backdrop-filter: blur(14px);
            }

            .hero {
                padding: 24px;
            }

            .hero-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }

            .title {
                font-size: clamp(1.8rem, 4.2vw, 2.8rem);
                letter-spacing: 0.02em;
                font-weight: 800;
            }

            .subtitle {
                color: var(--text-muted);
                margin-top: 8px;
                font-size: 0.98rem;
            }

            .quick-link {
                color: #fff;
                text-decoration: none;
                font-weight: 700;
                font-size: 0.95rem;
                border: 1px solid var(--line);
                border-radius: 999px;
                padding: 10px 14px;
                background: rgba(0, 0, 0, 0.14);
            }

            .quick-link:hover {
                border-color: var(--accent);
                color: var(--accent);
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 12px;
                margin-top: 16px;
            }

            .stat-card {
                border: 1px solid var(--line);
                border-radius: var(--radius-md);
                padding: 14px;
                background: rgba(0, 0, 0, 0.18);
            }

            .stat-number {
                font-size: 1.45rem;
                font-weight: 800;
                color: var(--accent);
            }

            .stat-label {
                margin-top: 6px;
                color: var(--text-muted);
                font-size: 0.86rem;
            }

            .search-layout {
                display: grid;
                grid-template-columns: 320px 1fr;
                gap: 20px;
                align-items: start;
            }

            .filters {
                padding: 18px;
            }

            .filters h2,
            .results-panel h2 {
                font-size: 1.05rem;
                margin-bottom: 14px;
                color: #fff;
            }

            .field {
                margin-bottom: 12px;
            }

            .field label {
                display: block;
                margin-bottom: 6px;
                font-size: 0.82rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-muted);
            }

            .input,
            .select,
            .page-select {
                width: 100%;
                border: 1px solid var(--line);
                color: var(--text-main);
                background: rgba(8, 20, 26, 0.78);
                border-radius: var(--radius-sm);
                padding: 11px 12px;
                font-size: 0.96rem;
            }

            .input:focus,
            .select:focus,
            .page-select:focus {
                outline: none;
                border-color: var(--accent);
                box-shadow: 0 0 0 3px rgba(244, 162, 97, 0.22);
            }

            .btn-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }

            .btn {
                border: 1px solid var(--line);
                border-radius: 999px;
                padding: 10px 14px;
                cursor: pointer;
                font-weight: 700;
                transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
            }

            .btn:hover {
                transform: translateY(-1px);
            }

            .btn-primary {
                background: linear-gradient(135deg, var(--accent), #e76f51);
                color: #1b0a04;
                border-color: transparent;
            }

            .btn-secondary {
                background: rgba(0, 0, 0, 0.14);
                color: var(--text-main);
            }

            .chip-row {
                margin-top: 14px;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                min-height: 28px;
            }

            .chip {
                font-size: 0.76rem;
                border-radius: 999px;
                padding: 5px 10px;
                border: 1px solid rgba(255, 255, 255, 0.24);
                background: rgba(255, 255, 255, 0.08);
                color: #ecf7ff;
            }

            .results-panel {
                padding: 18px;
            }

            .results-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
                margin-bottom: 12px;
            }

            .results-info {
                color: var(--text-muted);
                font-size: 0.92rem;
            }

            .status {
                color: var(--text-muted);
                font-size: 0.86rem;
                min-height: 22px;
            }

            .status.error {
                color: var(--danger);
            }

            .records {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 14px;
                margin-top: 12px;
            }

            .record-card {
                border: 1px solid var(--line);
                border-radius: var(--radius-md);
                background: rgba(1, 11, 18, 0.62);
                overflow: hidden;
                transition: transform 0.18s ease, border-color 0.18s ease;
                cursor: pointer;
            }

            .record-card:hover {
                transform: translateY(-2px);
                border-color: rgba(244, 162, 97, 0.55);
            }

            .record-cover {
                width: 100%;
                aspect-ratio: 1 / 1;
                background: linear-gradient(135deg, rgba(42, 157, 143, 0.24), rgba(244, 162, 97, 0.24));
                display: flex;
                align-items: center;
                justify-content: center;
                color: #f0f8ff;
                font-size: 0.9rem;
                padding: 8px;
                text-align: center;
            }

            .record-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .record-body {
                padding: 12px;
            }

            .record-store {
                color: #ffd4ad;
                font-size: 0.78rem;
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
            }

            .record-title {
                font-size: 1rem;
                font-weight: 700;
                line-height: 1.3;
                min-height: 42px;
            }

            .record-artist {
                margin-top: 6px;
                color: var(--text-muted);
                font-size: 0.88rem;
                min-height: 20px;
            }

            .record-price {
                margin-top: 8px;
                font-weight: 800;
                color: var(--ok);
                font-size: 0.96rem;
            }

            .meta-row {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 10px;
            }

            .meta {
                font-size: 0.72rem;
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 999px;
                padding: 3px 8px;
                color: #deedf5;
                background: rgba(255, 255, 255, 0.07);
            }

            .empty {
                text-align: center;
                border: 1px dashed var(--line);
                border-radius: var(--radius-md);
                padding: 28px 16px;
                color: var(--text-muted);
            }

            .loading {
                text-align: center;
                padding: 26px 12px;
                color: var(--text-muted);
            }

            .pulse {
                display: inline-block;
                width: 10px;
                height: 10px;
                margin-right: 8px;
                border-radius: 50%;
                background: var(--accent-2);
                animation: pulse 1.1s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 0.25; transform: scale(0.9); }
                50% { opacity: 1; transform: scale(1.15); }
            }

            .pager {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 16px;
            }

            .pager-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .pager-btn {
                border-radius: 999px;
                padding: 8px 12px;
                border: 1px solid var(--line);
                background: rgba(0, 0, 0, 0.2);
                color: var(--text-main);
                cursor: pointer;
            }

            .pager-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }

            .api-links {
                padding: 18px;
            }

            .api-links ul {
                list-style: none;
                display: grid;
                gap: 8px;
            }

            .api-links a {
                color: #ffd8b5;
                text-decoration: none;
            }

            .api-links a:hover {
                color: var(--accent);
            }

            @media (max-width: 980px) {
                body {
                    padding: 14px;
                }
                .search-layout {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    </head>
    <body>
        <div class="shell">
            <section class="hero glass">
                <div class="hero-top">
                    <div>
                        <h1 class="title">Vinyl Atlas</h1>
                        <p class="subtitle">Modern search for Discogs, local catalogs, and live store scraping.</p>
                    </div>
                    <a class="quick-link" href="/stores">Browse Stores</a>
                </div>
                <div class="stats-grid">
                    <article class="stat-card">
                        <div class="stat-number">{{ total }}</div>
                        <div class="stat-label">Total records indexed</div>
                    </article>
                    <article class="stat-card">
                        <div class="stat-number">{{ discogs }}</div>
                        <div class="stat-label">Discogs records</div>
                    </article>
                    <article class="stat-card">
                        <div class="stat-number">{{ local_count }}</div>
                        <div class="stat-label">Local store records</div>
                    </article>
                    <article class="stat-card">
                        <div class="stat-number">{{ num_stores }}</div>
                        <div class="stat-label">Unique stores</div>
                    </article>
                    <article class="stat-card">
                        <div class="stat-number">{{ num_genres }}</div>
                        <div class="stat-label">Genres</div>
                    </article>
                </div>
            </section>

            <section class="search-layout">
                <aside class="filters glass">
                    <h2>Filters</h2>
                    <div class="field">
                        <label for="search">Search</label>
                        <input class="input" type="text" id="search" placeholder="Artist or album">
                    </div>
                    <div class="field">
                        <label for="genre">Genre</label>
                        <select class="select" id="genre">
                            <option value="">All genres</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="store">Store</label>
                        <select class="select" id="store">
                            <option value="">All stores</option>
                            <option value="Discogs">Discogs</option>
                            <option value="Beatnik">Beatnik</option>
                            <option value="Shablool">Shablool</option>
                            <option value="Taklit House">Taklit House</option>
                            <option value="Third Ear">Third Ear</option>
                            <option value="Disc Center">Disc Center</option>
                            <option value="Tav8">Tav8</option>
                            <option value="Giora Records">Giora Records</option>
                            <option value="HaSivoov">HaSivoov</option>
                            <option value="The Vinyl Room">The Vinyl Room</option>
                            <option value="My Records">My Records</option>
                            <option value="Vinyl Stock">Vinyl Stock</option>
                            <option value="Rolling Dise">Rolling Dise</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="source">Source</label>
                        <select class="select" id="source">
                            <option value="">All sources</option>
                            <option value="Discogs">Discogs only</option>
                            <option value="local">Local stores only</option>
                            <option value="live">Live store scrape</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="per-page">Per page</label>
                        <select class="page-select" id="per-page">
                            <option value="25">25</option>
                            <option value="50" selected>50</option>
                            <option value="100">100</option>
                            <option value="250">250</option>
                            <option value="500">500</option>
                        </select>
                    </div>
                    <div class="btn-row">
                        <button class="btn btn-primary" id="search-btn" type="button">Search</button>
                        <button class="btn btn-secondary" id="clear-btn" type="button">Clear</button>
                    </div>
                    <div id="active-filters" class="chip-row"></div>
                </aside>

                <div class="results-panel glass">
                    <div class="results-head">
                        <h2>Results</h2>
                        <div id="results-info" class="results-info">Ready</div>
                    </div>
                    <div id="status" class="status"></div>
                    <div id="results" class="records"></div>
                    <div class="pager">
                        <div class="pager-controls">
                            <button class="pager-btn" id="prev-btn" type="button">Previous</button>
                            <button class="pager-btn" id="next-btn" type="button">Next</button>
                            <span id="page-label" class="results-info">Page 1 of 1</span>
                        </div>
                        <div class="pager-controls">
                            <label for="page-input" class="results-info">Jump:</label>
                            <input class="page-select" style="width:90px" type="number" id="page-input" min="1" value="1">
                            <button class="pager-btn" id="jump-btn" type="button">Go</button>
                        </div>
                    </div>
                </div>
            </section>

            <section class="api-links glass">
                <h2>API Endpoints</h2>
                <ul>
                    <li><a href="/api/database-info">/api/database-info</a></li>
                    <li><a href="/api/stores">/api/stores</a></li>
                    <li><a href="/api/genres">/api/genres</a></li>
                    <li><a href="/api/all-records?page=1&per_page=100">/api/all-records?page=1&per_page=100</a></li>
                    <li><a href="/api/search?q=Beatles">/api/search?q=Beatles</a></li>
                    <li><a href="/api/automation/stats">/api/automation/stats</a></li>
                </ul>
            </section>
        </div>

        <script>
            const SEARCH_STATE = {
                q: "",
                genre: "",
                storeFilter: "",
                source: "",
                page: 1,
                perPage: 50,
                total: 0,
                totalPages: 1
            };

            const DYNAMIC_STORE_SET = new Set();

            function escapeHtml(text) {
                return String(text || "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/\"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            }

            function bindUi() {
                document.getElementById("search-btn").addEventListener("click", () => runSearch(1));
                document.getElementById("clear-btn").addEventListener("click", resetFilters);
                document.getElementById("prev-btn").addEventListener("click", () => {
                    if (SEARCH_STATE.page > 1) runSearch(SEARCH_STATE.page - 1);
                });
                document.getElementById("next-btn").addEventListener("click", () => {
                    if (SEARCH_STATE.page < SEARCH_STATE.totalPages) runSearch(SEARCH_STATE.page + 1);
                });
                document.getElementById("jump-btn").addEventListener("click", jumpToPage);
                document.getElementById("search").addEventListener("keydown", (event) => {
                    if (event.key === "Enter") runSearch(1);
                });
                document.getElementById("per-page").addEventListener("change", () => {
                    SEARCH_STATE.perPage = parseInt(document.getElementById("per-page").value, 10) || 50;
                    runSearch(1);
                });
                document.getElementById("results").addEventListener("click", (event) => {
                    const card = event.target.closest(".record-card");
                    if (!card) return;
                    const url = card.getAttribute("data-url") || "";
                    if (url) {
                        window.open(url, "_blank");
                    }
                });
            }

            async function loadGenres() {
                try {
                    const res = await fetch("/api/genres");
                    const data = await res.json();
                    const genreSelect = document.getElementById("genre");
                    (data.genres || []).forEach((genre) => {
                        genreSelect.insertAdjacentHTML("beforeend", '<option value="' + escapeHtml(genre) + '">' + escapeHtml(genre) + '</option>');
                    });
                } catch (error) {
                    console.error("Failed loading genres", error);
                }
            }

            async function loadStores() {
                try {
                    const res = await fetch("/api/stores");
                    const data = await res.json();
                    const stores = Array.isArray(data) ? data : (data.stores || []);
                    const select = document.getElementById("store");
                    stores.forEach((item) => {
                        const name = item.store_name || item.name || "";
                        if (!name || DYNAMIC_STORE_SET.has(name)) return;
                        if ([...select.options].some(opt => opt.value === name)) {
                            DYNAMIC_STORE_SET.add(name);
                            return;
                        }
                        DYNAMIC_STORE_SET.add(name);
                        select.insertAdjacentHTML("beforeend", '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>');
                    });
                } catch (error) {
                    console.error("Failed loading stores", error);
                }
            }

            function syncStateFromInputs(page) {
                SEARCH_STATE.q = document.getElementById("search").value.trim();
                SEARCH_STATE.genre = document.getElementById("genre").value;
                SEARCH_STATE.storeFilter = document.getElementById("store").value;
                SEARCH_STATE.source = document.getElementById("source").value;
                SEARCH_STATE.page = page;
                SEARCH_STATE.perPage = parseInt(document.getElementById("per-page").value, 10) || 50;
            }

            function renderActiveFilters() {
                const chips = [];
                if (SEARCH_STATE.q) chips.push("Query: " + SEARCH_STATE.q);
                if (SEARCH_STATE.genre) chips.push("Genre: " + SEARCH_STATE.genre);
                if (SEARCH_STATE.storeFilter) chips.push("Store: " + SEARCH_STATE.storeFilter);
                if (SEARCH_STATE.source) chips.push("Source: " + SEARCH_STATE.source);
                const container = document.getElementById("active-filters");
                container.innerHTML = chips.length
                    ? chips.map(chip => '<span class="chip">' + escapeHtml(chip) + '</span>').join("")
                    : '<span class="chip">No active filters</span>';
            }

            function setStatus(text, isError = false) {
                const node = document.getElementById("status");
                node.textContent = text || "";
                node.classList.toggle("error", !!isError);
            }

            function setLoading() {
                const results = document.getElementById("results");
                results.innerHTML = '<div class="loading"><span class="pulse"></span>Loading records...</div>';
            }

            function buildQueryString() {
                const params = new URLSearchParams();
                params.set("page", String(SEARCH_STATE.page));
                params.set("per_page", String(SEARCH_STATE.perPage));
                if (SEARCH_STATE.q) params.set("q", SEARCH_STATE.q);
                if (SEARCH_STATE.genre) params.set("genre", SEARCH_STATE.genre);
                if (SEARCH_STATE.source) params.set("source", SEARCH_STATE.source);
                if (SEARCH_STATE.storeFilter) params.set("store_filter", SEARCH_STATE.storeFilter);
                return params.toString();
            }

            function renderRecords(records) {
                const target = document.getElementById("results");
                if (!records.length) {
                    target.innerHTML = '<div class="empty">No records found for this filter combination.</div>';
                    return;
                }

                target.innerHTML = records.map((record) => {
                    const coverHtml = record.cover_url
                        ? '<img src="' + escapeHtml(record.cover_url) + '" alt="cover">'
                        : '<div>No cover available</div>';
                    const album = escapeHtml(record.album || "Untitled");
                    const artist = escapeHtml(record.artist || "Unknown artist");
                    const store = escapeHtml(record.store_name || "Unknown store");
                    const url = escapeHtml(record.product_url || record.store_url || "");

                    let price = "Price not listed";
                    if (record.price !== null && record.price !== undefined && record.price !== "") {
                        const symbol = record.currency === "ILS" || !record.currency ? "ILS" : escapeHtml(record.currency);
                        price = symbol + " " + Number(record.price).toLocaleString();
                    }

                    const meta = [];
                    if (record.genre) meta.push('<span class="meta">' + escapeHtml(record.genre) + '</span>');
                    if (record.format) meta.push('<span class="meta">' + escapeHtml(record.format) + '</span>');
                    if (record.condition) meta.push('<span class="meta">' + escapeHtml(record.condition) + '</span>');
                    if (record.year) meta.push('<span class="meta">' + escapeHtml(record.year) + '</span>');

                    return (
                        '<article class="record-card" data-url="' + url + '">' +
                            '<div class="record-cover">' + coverHtml + '</div>' +
                            '<div class="record-body">' +
                                '<div class="record-store">' + store + '</div>' +
                                '<div class="record-title">' + album + '</div>' +
                                '<div class="record-artist">' + artist + '</div>' +
                                '<div class="record-price">' + escapeHtml(price) + '</div>' +
                                '<div class="meta-row">' + meta.join("") + '</div>' +
                            '</div>' +
                        '</article>'
                    );
                }).join("");
            }

            function updatePaginationUi() {
                const pageLabel = document.getElementById("page-label");
                pageLabel.textContent = "Page " + SEARCH_STATE.page + " of " + SEARCH_STATE.totalPages;
                document.getElementById("prev-btn").disabled = SEARCH_STATE.page <= 1;
                document.getElementById("next-btn").disabled = SEARCH_STATE.page >= SEARCH_STATE.totalPages;
                document.getElementById("page-input").max = SEARCH_STATE.totalPages || 1;
                document.getElementById("page-input").value = SEARCH_STATE.page;
            }

            function updateResultsInfo() {
                const info = document.getElementById("results-info");
                if (!SEARCH_STATE.total) {
                    info.textContent = "0 records";
                    return;
                }
                const start = (SEARCH_STATE.page - 1) * SEARCH_STATE.perPage + 1;
                const end = Math.min(SEARCH_STATE.page * SEARCH_STATE.perPage, SEARCH_STATE.total);
                info.textContent = "Showing " + start.toLocaleString() + "-" + end.toLocaleString() + " of " + SEARCH_STATE.total.toLocaleString() + " records";
            }

            async function runSearch(page) {
                syncStateFromInputs(page);
                renderActiveFilters();
                setLoading();
                setStatus("", false);

                if (SEARCH_STATE.source === "live" && SEARCH_STATE.q.length < 2) {
                    SEARCH_STATE.total = 0;
                    SEARCH_STATE.totalPages = 1;
                    renderRecords([]);
                    updatePaginationUi();
                    updateResultsInfo();
                    setStatus("Live scrape requires at least 2 characters in the search field.", true);
                    return;
                }

                try {
                    const response = await fetch("/api/search?" + buildQueryString());
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || "Search request failed");
                    }

                    const records = data.records || [];
                    SEARCH_STATE.total = Number(data.total || 0);
                    SEARCH_STATE.totalPages = Math.max(1, Number(data.total_pages || 1));

                    renderRecords(records);
                    updateResultsInfo();
                    updatePaginationUi();

                    const sourceName = data.source ? String(data.source) : (SEARCH_STATE.source || "mixed");
                    const baseStatus = records.length + " records loaded from " + sourceName + " source.";
                    if (data.message) {
                        setStatus(baseStatus + " " + data.message, false);
                    } else {
                        setStatus(baseStatus, false);
                    }
                } catch (error) {
                    SEARCH_STATE.total = 0;
                    SEARCH_STATE.totalPages = 1;
                    renderRecords([]);
                    updateResultsInfo();
                    updatePaginationUi();
                    setStatus("Search failed: " + error.message, true);
                }
            }

            function jumpToPage() {
                const wanted = parseInt(document.getElementById("page-input").value, 10);
                if (!wanted || wanted < 1 || wanted > SEARCH_STATE.totalPages) return;
                runSearch(wanted);
            }

            function resetFilters() {
                document.getElementById("search").value = "";
                document.getElementById("genre").value = "";
                document.getElementById("store").value = "";
                document.getElementById("source").value = "";
                document.getElementById("per-page").value = "50";
                SEARCH_STATE.perPage = 50;
                runSearch(1);
            }

            async function init() {
                bindUi();
                await Promise.all([loadGenres(), loadStores()]);
                renderActiveFilters();
                runSearch(1);
            }

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", init);
            } else {
                init();
            }
        </script>
    </body>
    </html>
    """, total=f"{total:,}", discogs=f"{discogs:,}", local_count=f"{total-discogs:,}", num_stores=num_stores, num_genres=num_genres)

@app.route('/api/genres')
def api_genres():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT genre FROM records WHERE genre IS NOT NULL ORDER BY genre")
    genres = [row[0] for row in cursor.fetchall()]
    conn.close()
    return jsonify({"genres": genres})

@app.route('/api/search')
def api_search():
    q = request.args.get('q', '').strip()
    g = request.args.get('genre', '').strip()
    s = request.args.get('source', '').strip()
    store_filter = request.args.get('store_filter', '').strip()
    
    # Validate and convert page/per_page with error handling
    try:
        page = int(request.args.get('page', 1))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid page parameter. Must be an integer.", "page": request.args.get('page')}), 400
    
    try:
        pp = int(request.args.get('per_page', 50))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid per_page parameter. Must be an integer.", "per_page": request.args.get('per_page')}), 400
    
    if page < 1:
        page = 1
    if pp < 1 or pp > 500:
        pp = 50

    if s == 'live':
        if len(q) < 2:
            return jsonify({
                "records": [],
                "total": 0,
                "page": page,
                "per_page": pp,
                "total_pages": 0,
                "has_next": False,
                "has_prev": False,
                "source": "live",
                "message": "Type at least 2 characters for live store scraping"
            })

        live_records = _search_live_stores(q, store_filter)
        total = len(live_records)
        offset = (page - 1) * pp
        records = live_records[offset:offset + pp]
        total_pages = (total + pp - 1) // pp if total else 0

        return jsonify({
            "records": records,
            "total": total,
            "page": page,
            "per_page": pp,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
            "source": "live"
        })
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Build query for filtering
    sql_base = "SELECT store_name, album, artist, genre, format, condition, year, price, product_url, store_url, currency, id, cover_url FROM records WHERE 1=1"
    count_sql = "SELECT COUNT(*) FROM records WHERE 1=1"
    params = []
    
    if q:
        sql_base += " AND (artist LIKE ? COLLATE NOCASE OR album LIKE ? COLLATE NOCASE)"
        count_sql += " AND (artist LIKE ? COLLATE NOCASE OR album LIKE ? COLLATE NOCASE)"
        qp = f"%{q}%"
        params.extend([qp, qp])
    
    if g:
        sql_base += " AND genre LIKE ? COLLATE NOCASE"
        count_sql += " AND genre LIKE ? COLLATE NOCASE"
        params.append(f"%{g}%")
    
    # Handle store filtering
    if store_filter:
        sql_base += " AND store_name = ?"
        count_sql += " AND store_name = ?"
        params.append(store_filter)
    elif s == 'Discogs':
        sql_base += " AND store_name = 'Discogs'"
        count_sql += " AND store_name = 'Discogs'"
    elif s == 'local':
        sql_base += " AND store_name != 'Discogs'"
        count_sql += " AND store_name != 'Discogs'"
    
    # FIX: Get ALL matching records FIRST, then deduplicate, THEN paginate
    # This prevents pagination from breaking
    cursor.execute(sql_base, params)
    all_records = [dict(row) for row in cursor.fetchall()]
    
    # Python-based deduplication: keep first occurrence of each store+album combo
    def normalize_album(album_str):
        """Normalize album name to find duplicates despite formatting variations"""
        normalized = album_str.strip()
        normalized = normalized.lstrip('+').strip()
        # Remove Hebrew text
        hebrew_chars = 'אבגדהוזחטיכלמנסעפצקרשתןםןףץ'
        while normalized and normalized[0] in hebrew_chars:
            normalized = normalized[1:].strip()
        paren_pos = normalized.rfind(')')
        if paren_pos > 0:
            normalized = normalized[:paren_pos+1]
        normalized = normalized.replace(' ₪', '').replace(' ILS', '')
        parts = normalized.rsplit(' ', 1)
        if parts and parts[-1].replace('.', '').replace(',', '').isdigit():
            normalized = parts[0]
        return normalized.strip()
    
    # Deduplicate BEFORE pagination
    seen = {}
    deduped = []
    for record in all_records:
        norm_album = normalize_album(record.get('album', ''))
        key = (record.get('store_name', ''), norm_album)
        if key not in seen:
            seen[key] = record
            deduped.append(record)
    
    # NOW apply pagination to deduplicated results
    total = len(deduped)
    offset = (page - 1) * pp
    start_idx = offset
    end_idx = start_idx + pp
    records = deduped[start_idx:end_idx]
    
    conn.close()
    
    # Enrich with Discogs covers if missing (runs in background)
    records = enrich_records_with_covers(records)
    
    total_pages = (total + pp - 1) // pp
    
    return jsonify({
        "records": records,
        "total": total,
        "page": page,
        "per_page": pp,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1
    })

@app.route('/api/automation/status')
def api_automation_status():
    """Get current scheduler status."""
    global scheduler_state
    return jsonify({
        "scheduler_status": scheduler_state["status"],
        "last_run": scheduler_state["last_run"],
        "has_result": scheduler_state["last_result"] is not None
    })

@app.route('/api/automation/last-run')
def api_automation_last_run():
    """Get last run results and metrics."""
    global scheduler_state
    
    if scheduler_state["last_result"] is None:
        return jsonify({"error": "No automation runs yet"}), 404
    
    return jsonify(scheduler_state["last_result"])

@app.route('/api/automation/stats')
def api_automation_stats():
    """Get automation statistics for dashboard."""
    global scheduler_state
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM records")
    total_records = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM records WHERE store_name = 'Discogs'")
    discogs_records = cursor.fetchone()[0]
    conn.close()
    
    last_result = scheduler_state["last_result"] or {}
    
    return jsonify({
        "total_records": total_records,
        "discogs_records": discogs_records,
        "local_records": total_records - discogs_records,
        "last_run": scheduler_state["last_run"],
        "scheduler_status": scheduler_state["status"],
        "last_run_stats": {
            "records_added": last_result.get("discogs_new", 0) + last_result.get("prices_updated", 0),
            "discogs_new": last_result.get("discogs_new", 0),
            "prices_updated": last_result.get("prices_updated", 0)
        }
    })

@app.route('/api/automation/logs')
def api_automation_logs():
    """Get recent automation logs."""
    log_file = "logs/automation.log"
    logs = []
    
    try:
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                logs = [line.strip() for line in lines[-100:]]  # Last 100 lines
    except:
        logs = ["Unable to read logs"]
    
    return jsonify({"logs": logs})

@app.route('/automation')
def automation_dashboard():
    """Render automation monitoring dashboard."""
    from automation_dashboard import get_dashboard_html
    return render_template_string(get_dashboard_html())

@app.route('/automation/logs')
def automation_logs_page():
    """Render automation logs viewer."""
    from automation_dashboard import get_logs_html
    return render_template_string(get_logs_html())

@app.route('/api/database-info')
def api_database_info():
    """Get complete database metadata - all stores, genres, and stats."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Total counts
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    
    # By store
    cursor.execute("""
        SELECT store_name, COUNT(*) as count FROM records 
        GROUP BY store_name ORDER BY count DESC
    """)
    stores = {row[0]: row[1] for row in cursor.fetchall()}
    
    # By genre
    cursor.execute("""
        SELECT genre, COUNT(*) as count FROM records 
        WHERE genre IS NOT NULL GROUP BY genre ORDER BY count DESC
    """)
    genres = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Data quality metrics (defensive - handle missing columns)
    try:
        cursor.execute("SELECT COUNT(*) FROM records WHERE cover_url IS NOT NULL")
        with_covers = cursor.fetchone()[0]
    except Exception:
        with_covers = 0
    
    try:
        cursor.execute("SELECT COUNT(*) FROM records WHERE genre IS NOT NULL")
        with_genres = cursor.fetchone()[0]
    except Exception:
        with_genres = 0
    
    try:
        cursor.execute("SELECT COUNT(*) FROM records WHERE year IS NOT NULL")
        with_years = cursor.fetchone()[0]
    except Exception:
        with_years = 0
    
    conn.close()
    
    return jsonify({
        "total_records": total,
        "stores": stores,
        "store_count": len(stores),
        "genres": genres,
        "genre_count": len(genres),
        "data_quality": {
            "records_with_cover": with_covers,
            "coverage_percent_covers": round(100 * with_covers / total, 1) if total > 0 else 0,
            "records_with_genre": with_genres,
            "coverage_percent_genres": round(100 * with_genres / total, 1) if total > 0 else 0,
            "records_with_year": with_years,
            "coverage_percent_years": round(100 * with_years / total, 1) if total > 0 else 0
        }
    })

@app.route('/api/stores')
def api_stores():
    """Get list of all stores with record counts."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT store_name, COUNT(*) as count, COUNT(DISTINCT artist) as artists, COUNT(DISTINCT genre) as genres
        FROM records GROUP BY store_name ORDER BY count DESC
    """)
    
    stores = []
    for row in cursor.fetchall():
        stores.append({
            "name": row[0],
            "record_count": row[1],
            "unique_artists": row[2],
            "genres_represented": row[3]
        })
    
    conn.close()
    return jsonify({"stores": stores})

@app.route('/api/store/<store_name>')
def api_store_details(store_name):
    """Get detailed info about a specific store."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Store stats
    cursor.execute("""
        SELECT COUNT(*), COUNT(DISTINCT artist), COUNT(DISTINCT genre), 
               MIN(price), MAX(price), AVG(price)
        FROM records WHERE store_name = ?
    """, (store_name,))
    
    stats = cursor.fetchone()
    if not stats or stats[0] == 0:
        conn.close()
        return jsonify({"error": "Store not found"}), 404
    
    total, artists, genres, min_price, max_price, avg_price = stats
    
    # Sample records
    cursor.execute("""
        SELECT artist, album, price, genre, cover_url FROM records 
        WHERE store_name = ? ORDER BY RANDOM() LIMIT 10
    """, (store_name,))
    
    samples = [{"artist": row[0], "album": row[1], "price": row[2], "genre": row[3], "cover_url": row[4]} 
               for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        "store_name": store_name,
        "total_records": total,
        "unique_artists": artists,
        "genres": genres,
        "price_range": {
            "min": round(min_price, 2) if min_price else None,
            "max": round(max_price, 2) if max_price else None,
            "average": round(avg_price, 2) if avg_price else None
        },
        "sample_records": samples
    })

@app.route('/api/all-records')
def api_all_records():
    """Get ALL records in database with optional pagination."""
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 100))
    
    if per_page > 500:
        per_page = 500  # Safety limit
    
    offset = (page - 1) * per_page
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Get total count
    cursor.execute("SELECT COUNT(*) FROM records")
    total = cursor.fetchone()[0]
    
    # Get records with offset
    cursor.execute("""
        SELECT * FROM records LIMIT ? OFFSET ?
    """, (per_page, offset))
    
    records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({
        "total_records": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
        "records": records
    })


@app.route('/stores')
def browse_stores():
    """Browse all 12 Israeli vinyl stores."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get record counts per store
    cursor.execute("""
        SELECT store_name, COUNT(*) as record_count, COUNT(DISTINCT genre) as genres, 
               COUNT(DISTINCT artist) as artists, MIN(price) as min_price, MAX(price) as max_price
        FROM records GROUP BY store_name ORDER BY store_name
    """)
    
    store_stats = {}
    for row in cursor.fetchall():
        store_stats[row[0]] = {
            'record_count': row[1],
            'genres': row[2],
            'artists': row[3],
            'min_price': row[4],
            'max_price': row[5]
        }
    
    conn.close()
    
    # Build store directory with both predefined stores and any that exist in DB
    stores_display = []
    for store_id, store_info in VINYL_STORES.items():
        stats = store_stats.get(store_info['name'], {
            'record_count': 0,
            'genres': 0,
            'artists': 0,
            'min_price': None,
            'max_price': None
        })
        stores_display.append({
            'id': store_id,
            **store_info,
            **stats
        })
    
    # Add any stores in DB that aren't in VINYL_STORES registry
    for store_name, stats in store_stats.items():
        if store_name not in [s['name'] for s in stores_display]:
            stores_display.append({
                'id': store_name.lower().replace(' ', '_'),
                'name': store_name,
                'name_hebrew': store_name,
                'url': '#',
                'city': 'Unknown',
                'description': f'{store_name} vinyl records',
                'estimated_records': stats['record_count'],
                'genres': stats['genres'],
                'artists': stats['artists'],
                'min_price': stats['min_price'],
                'max_price': stats['max_price'],
                'record_count': stats['record_count'],
                'color': '#999999'
            })
    
    return render_template_string("""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Browse Israeli Vinyl Stores</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #1a1a1a; color: #fff; font-family: Arial, sans-serif; }
            
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
                border-bottom: 3px solid #4CAF50;
                padding: 30px;
                text-align: center;
                margin-bottom: 30px;
            }
            
            h1 { color: #4CAF50; font-size: 2.5em; margin-bottom: 10px; }
            .subtitle { color: #aaa; margin-bottom: 20px; }
            
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            
            .stores-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .store-card {
                background: #0d0d0d;
                border-left: 5px solid;
                border-radius: 8px;
                padding: 20px;
                transition: 0.3s;
                cursor: pointer;
                text-decoration: none;
                color: #fff;
                display: flex;
                flex-direction: column;
            }
            
            .store-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 5px 20px rgba(76, 175, 80, 0.3);
            }
            
            .store-name { font-size: 1.4em; font-weight: bold; margin-bottom: 5px; color: #4CAF50; }
            .store-hebrew { font-size: 0.9em; color: #aaa; margin-bottom: 10px; }
            .store-city { color: #888; font-size: 0.9em; margin-bottom: 10px; }
            .store-desc { color: #ccc; font-size: 0.9em; margin-bottom: 15px; flex-grow: 1; }
            
            .store-stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 15px;
                border-top: 1px solid #333;
                padding-top: 15px;
            }
            
            .stat {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            
            .stat-label { color: #888; font-size: 0.8em; }
            .stat-value { color: #4CAF50; font-weight: bold; font-size: 1.1em; }
            
            .store-url {
                display: inline-block;
                padding: 8px 12px;
                background: #4CAF50;
                color: #000;
                border-radius: 4px;
                text-decoration: none;
                font-size: 0.9em;
                font-weight: bold;
                transition: 0.3s;
            }
            
            .store-url:hover {
                background: #45a049;
            }
            
            .back-to-app {
                text-align: center;
                margin-top: 30px;
            }
            
            .back-to-app a {
                display: inline-block;
                padding: 12px 24px;
                background: #4CAF50;
                color: #000;
                border-radius: 4px;
                text-decoration: none;
                font-weight: bold;
                transition: 0.3s;
            }
            
            .back-to-app a:hover {
                background: #45a049;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🏪 ISRAELI VINYL STORES</h1>
            <p class="subtitle">Browse our complete network of 12 vinyl retailers</p>
        </div>
        
        <div class="container">
            <div class="stores-grid">
    """ + "".join([f"""
                <a href="/store/{store['id']}" class="store-card" style="border-color: {store.get('color', '#4CAF50')};">
                    <div class="store-name">{store['name']}</div>
                    <div class="store-hebrew">{store.get('name_hebrew', store['name'])}</div>
                    <div class="store-city">📍 {store.get('city', 'Israel')}</div>
                    <div class="store-desc">{store.get('description', 'Vinyl records')}</div>
                    <div class="store-stats">
                        <div class="stat">
                            <div class="stat-label">Records</div>
                            <div class="stat-value">{store.get('record_count', store.get('estimated_records', 0)):,}</div>
                        </div>
                        <div class="stat">
                            <div class="stat-label">Genres</div>
                            <div class="stat-value">{store.get('genres', len(store.get('genres', [])))}</div>
                        </div>
                    </div>
                    <a href="{store['url']}" class="store-url" target="_blank" onclick="event.stopPropagation();">🔗 Visit Store</a>
                </a>
    """ for store in stores_display]) + """
            </div>
            
            <div class="back-to-app">
                <a href="/">← Back to Search</a>
            </div>
        </div>
    </body>
    </html>
    """, stores=stores_display)


@app.route('/store/<store_id>')
def store_detail(store_id):
    """View details for a specific store."""
    # Get store info from registry or DB
    store_info = VINYL_STORES.get(store_id)
    
    if not store_info:
        return "Store not found", 404
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Get stats for this store
    cursor.execute("""
        SELECT COUNT(*), COUNT(DISTINCT artist), COUNT(DISTINCT genre),
               MIN(price), MAX(price), AVG(price)
        FROM records WHERE store_name = ?
    """, (store_info['name'],))
    
    stats = cursor.fetchone()
    record_count, unique_artists, unique_genres, min_price, max_price, avg_price = stats
    
    # Get top genres for this store
    cursor.execute("""
        SELECT genre, COUNT(*) as count FROM records 
        WHERE store_name = ? AND genre IS NOT NULL
        GROUP BY genre ORDER BY count DESC LIMIT 5
    """, (store_info['name'],))
    
    top_genres = [(row[0], row[1]) for row in cursor.fetchall()]
    
    # Get recent records from this store
    cursor.execute("""
        SELECT * FROM records WHERE store_name = ? ORDER BY id DESC LIMIT 10
    """, (store_info['name'],))
    
    recent_records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # Enrich with Discogs covers if missing
    recent_records = enrich_records_with_covers(recent_records)
    
    return render_template_string("""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{{ store_name }} - Vinyl Store</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #1a1a1a; color: #fff; font-family: Arial, sans-serif; }
            
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
                border-bottom: 5px solid;
                padding: 40px;
                text-align: center;
            }
            
            h1 { color: #4CAF50; font-size: 2.5em; margin-bottom: 5px; }
            .store-hebrew { font-size: 1.2em; color: #aaa; margin-bottom: 15px; }
            .store-meta { color: #888; font-size: 0.95em; }
            
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            
            .section {
                background: #0d0d0d;
                border: 1px solid #333;
                padding: 20px;
                margin: 20px 0;
                border-radius: 5px;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin: 20px 0;
            }
            
            .stat { background: #1a1a1a; border-left: 4px solid #4CAF50; padding: 15px; border-radius: 4px; }
            .stat-num { font-size: 1.8em; color: #4CAF50; font-weight: bold; }
            .stat-label { color: #aaa; font-size: 0.9em; margin-top: 5px; }
            
            .genres-list { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
            .genre-badge { 
                background: #4CAF50; 
                color: #000; 
                padding: 8px 12px; 
                border-radius: 20px; 
                font-size: 0.9em;
                font-weight: bold;
            }
            
            .records-showcase {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 15px;
                margin: 20px 0;
            }
            
            .record-item {
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 10px;
                overflow: hidden;
            }
            
            .record-title { font-weight: bold; color: #4CAF50; margin-bottom: 5px; }
            .record-artist { color: #aaa; font-size: 0.9em; margin-bottom: 5px; }
            .record-genre { color: #888; font-size: 0.8em; }
            
            .info-box { background: #1a1a1a; padding: 15px; border-left: 4px solid #4CAF50; margin: 15px 0; }
            
            .button {
                display: inline-block;
                padding: 12px 24px;
                background: #4CAF50;
                color: #000;
                border-radius: 4px;
                text-decoration: none;
                font-weight: bold;
                transition: 0.3s;
            }
            
            .button:hover { background: #45a049; }
            
            .navigation { margin: 20px 0; }
            .navigation a { margin-right: 10px; }
            
            h2 { border-bottom: 2px solid #4CAF50; padding-bottom: 10px; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <div class="header" style="border-color: {{ store_color }};">
            <h1>🏪 {{ store_name }}</h1>
            <div class="store-hebrew">{{ store_hebrew }}</div>
            <div class="store-meta">📍 {{ store_city }} • {{ store_platform }}</div>
        </div>
        
        <div class="container">
            <div class="navigation">
                <a href="/" class="button">← Back to Search</a>
                <a href="/stores" class="button">🏪 All Stores</a>
                <a href="{{ store_url }}" target="_blank" class="button">🔗 Visit Store Website</a>
            </div>
            
            <div class="section">
                <h2>📊 Store Statistics</h2>
                <div class="stats-grid">
                    <div class="stat">
                        <div class="stat-num">{{ record_count }}</div>
                        <div class="stat-label">Records in Database</div>
                    </div>
                    <div class="stat">
                        <div class="stat-num">{{ unique_artists }}</div>
                        <div class="stat-label">Unique Artists</div>
                    </div>
                    <div class="stat">
                        <div class="stat-num">{{ unique_genres }}</div>
                        <div class="stat-label">Genres</div>
                    </div>
                    <div class="stat">
                        <div class="stat-num">{{ avg_price|round(2) }}₪</div>
                        <div class="stat-label">Average Price</div>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h2>🎵 Top Genres</h2>
                <div class="genres-list">
    """ + "".join([f'<span class="genre-badge">{genre} ({count})</span>' for genre, count in top_genres]) + f"""
                </div>
            </div>
            
            <div class="section">
                <h2>🎶 Recent Additions</h2>
                <div class="records-showcase">
    """ + "".join([f"""
                    <div class="record-item">
                        <div style="width: 100%; height: 180px; background: #2a2a2a; border-radius: 3px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; overflow: hidden;">
                            {('<img src="' + record.get('cover_url', '') + '" style="width: 100%; height: 100%; object-fit: cover; border-radius: 3px;" alt="' + record.get('album', '') + '">') if record.get('cover_url') else '<div style="color: #666; font-size: 12px;">No Cover</div>'}
                        </div>
                        <div class="record-title">{record.get('album', 'Unknown')}</div>
                        <div class="record-artist">{record.get('artist', 'Unknown Artist')}</div>
                        <div class="record-genre">{record.get('genre', 'Unknown Genre')}</div>
                    </div>
    """ for record in recent_records[:6]]) + """
                </div>
            </div>
            
            <div class="section">
                <h2>🔍 Browse Store Records</h2>
                <p style="margin-bottom: 15px; color: #aaa;">Search within """ + store_info['name'] + """'s collection:</p>
                <form action="/" method="get" style="display: flex; gap: 10px;">
                    <input type="text" name="q" placeholder="Search artist or album..." style="flex: 1; padding: 10px; background: #2a2a2a; color: #fff; border: 1px solid #4CAF50; border-radius: 4px;">
                    <select name="store" style="padding: 10px; background: #2a2a2a; color: #fff; border: 1px solid #4CAF50; border-radius: 4px;">
                        <option value="">&mdash; Select Store &mdash;</option>
                        <option value="{store_id}" selected>{store_info['name']}</option>
                    </select>
                    <button type="submit" style="padding: 10px 20px; background: #4CAF50; color: #000; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Search</button>
                </form>
            </div>
        </div>
    </body>
    </html>
    """, 
    store_name=store_info['name'],
    store_hebrew=store_info.get('name_hebrew', store_info['name']),
    store_city=store_info.get('city', 'Israel'),
    store_platform=', '.join(store_info.get('platforms', [])),
    store_color=store_info.get('color', '#4CAF50'),
    store_url=store_info['url'],
    store_id=store_id,
    record_count=record_count or 0,
    unique_artists=unique_artists or 0,
    unique_genres=unique_genres or 0,
    min_price=min_price,
    max_price=max_price,
    avg_price=avg_price or 0,
    top_genres=top_genres,
    recent_records=recent_records)


if __name__ == '__main__':
    print("\n" + "="*80)
    print("VINYL STORE - 10X BETTER DATABASE")
    if IS_ELECTRON:
        print("(ELECTRON APP MODE)")
    print("="*80)
    print("[INFO] Discogs API + Israeli Retail Stores")
    print(f"[INFO] Database: {DB_PATH}")
    print("[SCHEDULER] Initializing background scheduler...")
    
    # Register Scrapling integration if available
    if SCRAPLING_AVAILABLE:
        print("[SCRAPLING] Registering scraper API routes...")
        register_scraper_routes(app)
        print("[SCRAPLING] Endpoints available:")
        print("  - POST /api/scrape/<spider_name>")
        print("  - GET /api/scrape/status/<job_id>")
        print("  - GET /api/records/count")
        print("  - POST /api/quality-check")
        print("  - GET /api/spiders")
    
    # Initialize scheduler before running app
    _initialize_scheduler()
    
    print("[INFO] Starting on http://localhost:5000")
    print("="*80 + "\n")
    
    # Always disable reloader to prevent issues with Electron and multiprocessing
    app.run(host='localhost', port=5000, debug=False, use_reloader=False)

