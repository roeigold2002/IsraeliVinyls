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
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler

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

def _initialize_scheduler():
    """Initialize background scheduler for automated daily growth."""
    global scheduler, scheduler_state
    
    try:
        if scheduler is not None and scheduler.running:
            return
        
        from scheduler_service import scheduler_service
        
        scheduler = BackgroundScheduler()
        
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
        
        scheduler.start()
        scheduler_state["status"] = "running"
        
        print("[SCHEDULER] ✓ Background scheduler initialized - daily growth at 2 AM")
    
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
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vinyl Store - 10X Better</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #1a1a1a; color: #fff; font-family: Arial, sans-serif; }
            
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
                border-bottom: 3px solid #4CAF50;
                padding: 30px;
                text-align: center;
            }
            
            h1 { color: #4CAF50; font-size: 2.5em; margin-bottom: 10px; }
            .subtitle { color: #aaa; margin-bottom: 20px; }
            
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
            
            .stat { background: #0d0d0d; border-left: 4px solid #4CAF50; padding: 20px; border-radius: 5px; }
            .stat-num { font-size: 2em; color: #4CAF50; font-weight: bold; }
            .stat-label { color: #aaa; font-size: 0.9em; margin-top: 5px; }
            
            .section { background: #1a1a1a; border: 1px solid #333; padding: 20px; margin: 20px 0; border-radius: 5px; }
            h2 { color: #4CAF50; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; margin-bottom: 15px; }
            
            .search-box { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            input, select { padding: 10px; background: #2a2a2a; color: #fff; border: 1px solid #4CAF50; border-radius: 4px; }
            button { padding: 10px 20px; background: #4CAF50; color: #000; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
            button:hover { background: #45a049; }
            
            .records { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-bottom: 30px; }
            
            .card { background: #0d0d0d; border: 1px solid #333; border-radius: 8px; overflow: hidden; transition: 0.3s; cursor: pointer; }
            .card:hover { border-color: #4CAF50; transform: translateY(-5px); }
            
            .card-img { width: 100%; height: 200px; background: #2a2a2a; display: flex; align-items: center; justify-content: center; }
            .card-img img { width: 100%; height: 100%; object-fit: cover; }
            
            .card-info { padding: 15px; }
            .card-artist { color: #4CAF50; font-weight: bold; }
            .card-album { color: #ccc; margin: 5px 0; }
            .card-price { color: #76d776; font-size: 1.1em; font-weight: bold; margin: 10px 0; }
            
            .badge { display: inline-block; padding: 4px 8px; border-radius: 3px; font-size: 0.85em; }
            .badge-discogs { background: #1e40af; }
            .badge-local { background: #065f46; }
            
            .loading { text-align: center; padding: 40px; color: #666; }
            
            .pagination {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 10px;
                margin: 30px 0;
                flex-wrap: wrap;
            }
            
            .pagination button {
                padding: 8px 12px;
                background: #2a2a2a;
                color: #4CAF50;
                border: 1px solid #4CAF50;
                border-radius: 4px;
                cursor: pointer;
                transition: 0.3s;
            }
            
            .pagination button:hover { background: #4CAF50; color: #000; }
            .pagination button:disabled { 
                background: #1a1a1a;
                color: #666;
                border-color: #666;
                cursor: not-allowed;
            }
            
            .pagination button.active {
                background: #4CAF50;
                color: #000;
                font-weight: bold;
            }
            
            .pagination input {
                width: 60px;
                padding: 8px;
                text-align: center;
            }
            
            .page-info {
                color: #aaa;
                font-size: 0.9em;
                min-width: 200px;
                text-align: center;
            }
            
            .per-page-selector {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .per-page-selector label {
                color: #aaa;
                font-size: 0.9em;
            }
            
            .per-page-selector select {
                padding: 6px 10px;
                background: #2a2a2a;
                color: #fff;
                border: 1px solid #4CAF50;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="flex: 1;"></div>
                <div>
                    <h1 style="margin-bottom: 0;">♪ VINYL STORE ♪</h1>
                </div>
                <div style="flex: 1; text-align: right;">
                    <a href="/stores" style="color: #4CAF50; text-decoration: none; font-weight: bold; font-size: 1em;">🏪 Browse Stores</a>
                </div>
            </div>
            <p class="subtitle">10X Better Database: Discogs API + Israeli Retailers</p>
        </div>
        
        <div class="container">
            <div class="stats">
                <div class="stat">
                    <div class="stat-num">""" + f"{total:,}" + """</div>
                    <div class="stat-label">Total Records</div>
                </div>
                <div class="stat">
                    <div class="stat-num">""" + f"{discogs:,}" + """</div>
                    <div class="stat-label">From Discogs API</div>
                </div>
                <div class="stat">
                    <div class="stat-num">""" + f"{total-discogs:,}" + """</div>
                    <div class="stat-label">From Local Stores</div>
                </div>
                <div class="stat">
                    <div class="stat-num">""" + f"{num_stores}" + """</div>
                    <div class="stat-label">Stores</div>
                </div>
            </div>
            
            <div class="section">
                <h2>📊 Database Coverage</h2>
                <div class="stats">
                    <div class="stat">
                        <div class="stat-num">""" + f"{num_genres}" + """</div>
                        <div class="stat-label">Music Genres</div>
                    </div>
                    <div class="stat">
                        <div class="stat-num">170k+</div>
                        <div class="stat-label">Unique Artists</div>
                    </div>
                    <div class="stat">
                        <div class="stat-num">53%</div>
                        <div class="stat-label">Album Covers</div>
                    </div>
                    <div class="stat">
                        <div class="stat-num">13</div>
                        <div class="stat-label">Data Sources</div>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>🔍 Browse & Search Records</h2>
                <div class="search-box">
                    <input type="text" id="search" placeholder="Search artist or album..." onkeypress="if(event.key==='Enter') resetToPage1()">
                    <select id="genre" onchange="resetToPage1()">
                        <option value="">All Genres</option>
                    </select>
                    <select id="store" onchange="resetToPage1()">
                        <option value="">ALL STORES</option>
                        <option value="Discogs">Discogs</option>
                        <option value="beatnik">Beatnik</option>
                        <option value="shablool">Shablool</option>
                        <option value="taklit_house">Taklit House</option>
                        <option value="third_ear">Third Ear</option>
                        <option value="disc_center">Disc Center</option>
                        <option value="tav8">Tav8</option>
                        <option value="giora_records">Giora Records</option>
                        <option value="hasivoov">HaSivoov</option>
                        <option value="vinyl_room">The Vinyl Room</option>
                        <option value="my_records">My Records</option>
                        <option value="vinyl_stock">Vinyl Stock</option>
                        <option value="rolling_dice">Rolling Dice</option>
                    </select>
                    <select id="source" onchange="resetToPage1()">
                        <option value="">All Sources</option>
                        <option value="Discogs">Discogs</option>
                        <option value="local">Local Stores Only</option>
                    </select>
                    <button onclick="resetToPage1()">Search</button>
                </div>
                
                <!-- Results info -->
                <div id="results-info" class="page-info" style="margin-bottom: 20px;"></div>
                
                <!-- Records grid -->
                <div id="results" class="records"></div>
                
                <!-- Top pagination -->
                <div id="pagination-top" class="pagination"></div>
                
                <!-- Records per page selector -->
                <div class="per-page-selector">
                    <label for="per-page">Records per page:</label>
                    <select id="per-page" onchange="handlePerPageChange()">
                        <option value="25">25</option>
                        <option value="50" selected>50</option>
                        <option value="100">100</option>
                        <option value="250">250</option>
                        <option value="500">500</option>
                    </select>
                </div>
                
                <!-- Bottom pagination -->
                <div id="pagination-bottom" class="pagination"></div>
            </div>

            <div class="section">
                <h2>🔗 Full Database API</h2>
                <p style="color: #aaa; margin-bottom: 15px;">Access complete database with detailed endpoints:</p>
                <ul style="list-style: none; padding: 0;">
                    <li style="margin: 10px 0;"><a href="/api/database-info" style="color: #4CAF50;">📈 /api/database-info</a> - Complete database metadata (stores, genres, coverage)</li>
                    <li style="margin: 10px 0;"><a href="/api/stores" style="color: #4CAF50;">🏪 /api/stores</a> - All 13 stores with record counts</li>
                    <li style="margin: 10px 0;"><a href="/api/genres" style="color: #4CAF50;">🎵 /api/genres</a> - All 16 genre categories</li>
                    <li style="margin: 10px 0;"><a href="/api/all-records?page=1&per_page=100" style="color: #4CAF50;">📚 /api/all-records</a> - Full 170k+ records with pagination</li>
                    <li style="margin: 10px 0;"><a href="/api/search?q=Beatles" style="color: #4CAF50;">🔍 /api/search</a> - Search all records with full metadata</li>
                    <li style="margin: 10px 0;"><a href="/api/automation/stats" style="color: #4CAF50;">⚙️ /api/automation/stats</a> - Database growth statistics</li>
                </ul>
            </div>
        </div>
        
        <script>
            let currentPage = 1;
            let perPage = 50;
            let totalResults = 0;
            let totalPages = 1;
            
            async function loadGenres() {
                const res = await fetch('/api/genres');
                const data = await res.json();
                const sel = document.getElementById('genre');
                data.genres.forEach(g => {
                    sel.innerHTML += '<option value="' + g + '">' + g + '</option>';
                });
            }
            
            async function doSearch(pageNum = 1) {
                try {
                currentPage = pageNum;
                const q = document.getElementById('search').value;
                const g = document.getElementById('genre').value;
                const s = document.getElementById('source').value;
                const store = document.getElementById('store').value;
                
                let url = '/api/search?page=' + pageNum + '&per_page=' + perPage;
                if (q) url += '&q=' + encodeURIComponent(q);
                if (g) url += '&genre=' + encodeURIComponent(g);
                if (s) url += '&source=' + encodeURIComponent(s);
                if (store && store !== 'beatnik' && store !== 'shablool' && store !== 'taklit_house' && store !== 'third_ear' && store !== 'disc_center' && store !== 'tav8' && store !== 'giora_records' && store !== 'hasivoov' && store !== 'vinyl_room' && store !== 'my_records' && store !== 'vinyl_stock' && store !== 'rolling_dice') {
                    // Legacy stores
                    url += '&store_filter=' + encodeURIComponent(store);
                } else if (store && store !== 'Discogs') {
                    // New store - convert store ID to proper store name for DB query
                    const storeNames = {
                        'beatnik': 'Beatnik',
                        'shablool': 'Shablool',
                        'taklit_house': 'Taklit House',
                        'third_ear': 'Third Ear',
                        'disc_center': 'Disc Center',
                        'tav8': 'Tav8',
                        'giora_records': 'Giora Records',
                        'hasivoov': 'HaSivoov',
                        'vinyl_room': 'The Vinyl Room',
                        'my_records': 'My Records',
                        'vinyl_stock': 'Vinyl Stock',
                        'rolling_dice': 'Rolling Dice'
                    };
                    if (storeNames[store]) {
                        url += '&store_filter=' + encodeURIComponent(storeNames[store]);
                    }
                }
                
                const res = await fetch(url);
                const data = await res.json();
                
                let recs = data.records || [];
                totalResults = data.total || 0;
                totalPages = data.total_pages || 1;
                
                // Display results info
                const resultsInfo = document.getElementById('results-info');
                if (totalResults > 0) {
                    const start = (currentPage - 1) * perPage + 1;
                    const end = Math.min(currentPage * perPage, totalResults);
                    resultsInfo.innerHTML = `Showing <strong>${start}</strong> to <strong>${end}</strong> of <strong>${totalResults.toLocaleString()}</strong> records`;
                } else {
                    resultsInfo.innerHTML = 'No records found';
                }
                
                // Render cards with data attributes instead of inline onclick
                const html = recs.length ? recs.map(r => `
                    <div class="card" data-url="${(r.product_url||r.store_url||'').replace(/"/g, '&quot;')}" data-store="${(r.store_name||'').replace(/"/g, '&quot;')}" data-album="${(r.album||'').replace(/"/g, '&quot;')}" data-genre="${(r.genre||'').replace(/"/g, '&quot;')}" data-format="${(r.format||'').replace(/"/g, '&quot;')}" data-condition="${(r.condition||'').replace(/"/g, '&quot;')}" data-year="${r.year||'N/A'}" style="cursor: pointer;">
                        <div class="card-img">
                            ${r.cover_url ? '<img src="' + r.cover_url + '" alt="' + r.album + '">' : '<div style="color:#666;">No Image</div>'}
                        </div>
                        <div class="card-info">
                            <div class="card-artist">🎵 ${r.store_name || 'Unknown'}</div>
                            <div class="card-album">${r.album || 'No Title'}</div>
                        </div>
                    </div>
                `) : '<div class="loading">No records found</div>';
                
                document.getElementById('results').innerHTML = html;
                
                // Add event delegation for card clicks
                document.getElementById('results').addEventListener('click', function(e) {
                    const card = e.target.closest('.card');
                    if (card) {
                        const url = card.getAttribute('data-url');
                        const store = card.getAttribute('data-store');
                        const album = card.getAttribute('data-album');
                        const genre = card.getAttribute('data-genre');
                        const format = card.getAttribute('data-format');
                        const condition = card.getAttribute('data-condition');
                        const year = card.getAttribute('data-year');
                        showRecord(url, store, album, genre, format, condition, year);
                    }
                });
                
                // Update pagination
                updatePagination();
                
                // Scroll to top
                window.scrollTo(0, 0);
                } catch (error) {
                    console.error('[SEARCH ERROR]', error);
                    document.getElementById('results').innerHTML = '<div class="error">Search failed: ' + error.message + '</div>';
                }
            }
            
            function showRecord(url, store, album, genre, format, condition, year) {
                if (url && url !== '') {
                    // Open the product URL in a new tab
                    window.open(url, '_blank');
                } else {
                    // Fallback: show details if no URL available
                    const details = `🎵 VINYL RECORD\n━━━━━━━━━━━━━━━━━━━━━━━━\nStore: ${store}\nAlbum: ${album}\nGenre: ${genre || 'N/A'}\nFormat: ${format || 'N/A'}\nCondition: ${condition || 'N/A'}\nYear: ${year || 'N/A'}\n\n[No direct link available]`;
                    alert(details);
                }
            }
            
            function updatePagination() {
                let paginationHTML = '';
                
                // Previous button
                paginationHTML += `<button onclick="doSearch(${Math.max(1, currentPage - 1)})" ${currentPage === 1 ? 'disabled' : ''}>← Previous</button>`;
                
                // Page input
                paginationHTML += `<input type="number" id="page-input" min="1" max="${totalPages}" value="${currentPage}" onchange="goToPage()">`;
                
                // Page info
                paginationHTML += `<span class="page-info">Page ${currentPage} of ${totalPages}</span>`;
                
                // Next button
                paginationHTML += `<button onclick="doSearch(${Math.min(totalPages, currentPage + 1)})" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>`;
                
                document.getElementById('pagination-top').innerHTML = paginationHTML;
                document.getElementById('pagination-bottom').innerHTML = paginationHTML;
            }
            
            function goToPage() {
                const pageNum = parseInt(document.getElementById('page-input').value) || 1;
                if (pageNum >= 1 && pageNum <= totalPages) {
                    doSearch(pageNum);
                }
            }
            
            function resetToPage1() {
                doSearch(1);
            }
            
            function handlePerPageChange() {
                perPage = parseInt(document.getElementById('per-page').value);
                resetToPage1();
            }
            
            loadGenres();
            doSearch(1);  // Load first page on page load
        </script>
    </body>
    </html>
    """)

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
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Build query for filtering
    sql_base = "SELECT store_name, album, artist, genre, format, condition, year, price, product_url, store_url, currency, id FROM records WHERE 1=1"
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
        SELECT artist, album, price, genre FROM records 
        WHERE store_name = ? ORDER BY RANDOM() LIMIT 10
    """, (store_name,))
    
    samples = [{"artist": row[0], "album": row[1], "price": row[2], "genre": row[3]} 
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

