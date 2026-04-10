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

# Detect if running in Electron
IS_ELECTRON = os.environ.get('ELECTRON_START') == '1' or 'electron' in sys.argv[0].lower() or __name__ == '__main__'

app = Flask(__name__)

# Set database path - try different locations for packaged app
def get_db_path():
    """Get database path, checking multiple locations"""
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "music_stores.db"),
        os.path.join(os.getcwd(), "music_stores.db"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "music_stores.db"),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            print(f"[DB] Found database at: {path}")
            return path
    
    # Return default even if not found (app will use it)
    print(f"[DB] Database not found, using default: {possible_paths[0]}")
    return possible_paths[0]

DB_PATH = get_db_path()

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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    """Main dashboard - serve Google-style search interface"""
    html = '''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>חנות הביניים - חיפוש תקליטים</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        * {
            direction: rtl;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        body {
            background-color: #111827;
            color: #e5e7eb;
        }
        .logo-text {
            font-size: 28px;
            font-weight: 700;
        }
        .logo-music { color: #3b82f6; }
        .search-box {
            background-color: #1f2937;
            border: 1px solid #374151;
            padding: 14px 20px;
            border-radius: 24px;
            font-size: 16px;
            color: white;
            width: 100%;
            transition: all 0.2s;
        }
        .search-box:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .result-item {
            padding: 20px 0;
            border-bottom: 1px solid #374151;
        }
        .result-item:hover {
            background-color: rgba(59, 130, 246, 0.05);
            padding-right: 8px;
        }
        .result-title {
            font-size: 18px;
            font-weight: 500;
            color: #3b82f6;
            margin-bottom: 4px;
            text-decoration: none;
            cursor: pointer;
        }
        .result-title:hover {
            text-decoration: underline;
        }
        .result-url {
            font-size: 13px;
            color: #6b7280;
            margin-bottom: 6px;
            font-family: monospace;
        }
        .result-description {
            font-size: 14px;
            color: #d1d5db;
            line-height: 1.6;
        }
        .result-meta {
            font-size: 12px;
            color: #9ca3af;
            display: flex;
            gap: 16px;
            margin-top: 8px;
            flex-wrap: wrap;
        }
        .meta-badge {
            background-color: #374151;
            padding: 4px 10px;
            border-radius: 4px;
            white-space: nowrap;
        }
        .pagination {
            text-align: center;
            padding: 40px 20px;
            margin-top: 30px;
        }
        .pagination-btn {
            padding: 10px 24px;
            margin: 0 8px;
            background-color: #1f2937;
            border: 1px solid #374151;
            color: #3b82f6;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
            font-weight: 500;
        }
        .pagination-btn:hover:not(:disabled) {
            background-color: #3b82f6;
            color: white;
            border-color: #3b82f6;
        }
        .pagination-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .result-stats {
            color: #6b7280;
            font-size: 13px;
            margin-bottom: 20px;
        }
        .no-results {
            text-align: center;
            padding: 60px 20px;
            color: #6b7280;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #6b7280;
        }
        .loading-spinner {
            display: inline-block;
            border: 3px solid rgba(59, 130, 246, 0.2);
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin-bottom: 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="min-h-screen">
        <header class="py-6 border-b border-gray-700 sticky top-0 bg-gray-900 z-50">
            <div class="max-w-4xl mx-auto px-4">
                <div class="text-center mb-8">
                    <div class="logo-text mb-6">
                        <span class="logo-music">🎵</span>
                        <span>חנות הביניים</span>
                    </div>
                    <p class="text-gray-400 text-sm">חפשו, השוו מחירים ופתחו ישירות לחנות</p>
                </div>
                <div class="search-container max-w-2xl mx-auto">
                    <input type="text" id="searchInput" placeholder="חפשו אומן או אלבום..." class="search-box" autofocus />
                </div>
            </div>
        </header>

        <main class="max-w-4xl mx-auto px-4 py-8">
            <div id="resultStats" class="result-stats hidden"></div>
            <div id="resultsContainer">
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <p>טוען תקליטים...</p>
                </div>
            </div>
            <div id="noResults" class="no-results hidden">
                <p>לא נמצאו תקליטים התואמים לחיפוש</p>
            </div>
            <div id="paginationContainer" class="pagination hidden">
                <button id="prevBtn" class="pagination-btn">← הקודם</button>
                <span id="pageInfo" class="text-gray-400 text-sm mx-4">עמוד 1 מתוך 1</span>
                <button id="nextBtn" class="pagination-btn">הבא →</button>
            </div>
        </main>

        <footer class="border-t border-gray-700 mt-12 py-6 bg-gray-800 text-center">
            <p class="text-gray-500 text-sm">© 2024-2026 חנות הביניים - אגרגטור תקליטי ויניל</p>
        </footer>
    </div>

    <script>
        const STATE = {
            currentPage: 1,
            perPage: 20,
            totalCount: 0,
            totalPages: 1,
            searchQuery: ''
        };

        async function init() {
            document.getElementById('searchInput').addEventListener('input', debounce(() => {
                STATE.currentPage = 1;
                performSearch();
            }, 300));

            document.getElementById('prevBtn').addEventListener('click', () => {
                if (STATE.currentPage > 1) {
                    STATE.currentPage--;
                    performSearch();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });

            document.getElementById('nextBtn').addEventListener('click', () => {
                if (STATE.currentPage < STATE.totalPages) {
                    STATE.currentPage++;
                    performSearch();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });

            await performSearch();
        }

        async function performSearch() {
            const query = document.getElementById('searchInput').value.trim();
            STATE.searchQuery = query;

            try {
                const params = new URLSearchParams({
                    q: query,
                    page: STATE.currentPage,
                    per_page: STATE.perPage
                });

                const response = await fetch(`/api/search?${params}`);
                const data = await response.json();

                STATE.totalCount = data.total;
                STATE.totalPages = data.total_pages;

                displayResults(data.records);
                updatePagination();
            } catch (error) {
                console.error('Search error:', error);
                document.getElementById('resultsContainer').innerHTML = 
                    '<p class="text-red-400">שגיאה בטעינת נתונים</p>';
            }
        }

        function displayResults(records) {
            const container = document.getElementById('resultsContainer');
            const noResults = document.getElementById('noResults');
            const statsDiv = document.getElementById('resultStats');

            if (records.length === 0) {
                container.innerHTML = '';
                noResults.classList.remove('hidden');
                statsDiv.classList.add('hidden');
                return;
            }

            noResults.classList.add('hidden');
            statsDiv.classList.remove('hidden');

            const start = (STATE.currentPage - 1) * STATE.perPage + 1;
            const end = Math.min(STATE.currentPage * STATE.perPage, STATE.totalCount);
            statsDiv.textContent = `מוצג ${start}–${end} מתוך ${STATE.totalCount} תוצאות`;

            container.innerHTML = records.map(record => {
                // Extract price from album field if it ends with ₪ {number}
                let displayPrice = '';
                let displayAlbum = record.album || 'Unknown';
                const priceMatch = displayAlbum.match(/₪\s*([\d,\.]+)/);
                if (priceMatch) {
                    displayPrice = `₪ ${priceMatch[1]}`;
                    // Remove price from album display if desired, or keep it
                }
                
                return `
                <div class="result-item">
                    <a href="${record.store_url || '#'}" target="_blank" rel="noopener" class="result-title">
                        ${escapeHtml(displayAlbum)}
                    </a>
                    <div class="result-url">${record.store_name}</div>
                    <div class="result-description">
                        ${record.artist ? `<strong>אומן:</strong> ${escapeHtml(record.artist)}<br>` : ''}
                        ${displayPrice ? `<strong>מחיר:</strong> ${displayPrice}` : ''}
                    </div>
                    <div class="result-meta">
                        ${record.store_name ? `<span class="meta-badge">🏪 ${escapeHtml(record.store_name)}</span>` : ''}
                        ${record.genre ? `<span class="meta-badge">🎸 ${escapeHtml(record.genre)}</span>` : ''}
                        ${record.year ? `<span class="meta-badge">📅 ${record.year}</span>` : ''}
                        ${record.format ? `<span class="meta-badge">💿 ${escapeHtml(record.format)}</span>` : ''}
                        ${record.condition ? `<span class="meta-badge">✓ ${escapeHtml(record.condition)}</span>` : ''}
                    </div>
                </div>
            `}).join('');
        }

        function updatePagination() {
            const container = document.getElementById('paginationContainer');
            const pageInfo = document.getElementById('pageInfo');

            if (STATE.totalPages > 1) {
                container.classList.remove('hidden');
                pageInfo.textContent = `עמוד ${STATE.currentPage} מתוך ${STATE.totalPages}`;
            } else {
                container.classList.add('hidden');
            }

            document.getElementById('prevBtn').disabled = STATE.currentPage === 1;
            document.getElementById('nextBtn').disabled = STATE.currentPage === STATE.totalPages;
        }

        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }

        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func(...args), wait);
            };
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    </script>
</body>
</html>'''
    return html

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
    page = int(request.args.get('page', 1))
    pp = int(request.args.get('per_page', 50))
    
    if page < 1:
        page = 1
    if pp < 1 or pp > 500:
        pp = 50
    
    offset = (page - 1) * pp
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Build WHERE clause - deduplicate by selecting MIN(id) for each store+artist+album combo
    # First get raw data, then normalize and deduplicate in Python for cleaner logic
    sql = """SELECT 
        store_name, album, artist, genre, format, condition, year, price, product_url, store_url, currency, id 
    FROM records WHERE 1=1"""
    
    count_sql = """SELECT COUNT(*) FROM records WHERE 1=1"""
    params = []
    
    if q:
        sql += " AND (artist LIKE ? OR album LIKE ?)"
        count_sql += " AND (artist LIKE ? OR album LIKE ?)"
        qp = f"%{q}%"
        params.extend([qp, qp])
    
    if g:
        sql += " AND genre LIKE ?"
        count_sql += " AND genre LIKE ?"
        params.append(f"%{g}%")
    
    if s == 'Discogs':
        sql += " AND store_name = 'Discogs'"
        count_sql += " AND store_name = 'Discogs'"
    elif s == 'local':
        sql += " AND store_name != 'Discogs'"
        count_sql += " AND store_name != 'Discogs'"
    
    # Get total count from raw data (before deduplication)
    count_params = params.copy()
    cursor.execute(count_sql, count_params)
    total_raw = cursor.fetchone()[0]
    
    # Get paginated results - fetch more to account for duplicates we'll remove
    # Fetch 3x more records in case many are duplicates
    limit_boost = pp * 3
    sql += " LIMIT ? OFFSET ?"
    params_paginated = params + [limit_boost, offset]
    
    cursor.execute(sql, params_paginated)
    all_records = [dict(row) for row in cursor.fetchall()]
    
    # Python-based deduplication: keep first occurrence of each store+album combo
    def normalize_album(album_str):
        """Normalize album name to find duplicates despite formatting variations"""
        # Remove leading + and Hebrew characters
        normalized = album_str.strip()
        normalized = normalized.lstrip('+').strip()
        # Remove Hebrew text like "המלאי אזל" "הוספה לסל"
        hebrew_chars = 'אבגדהוזחטיכלמנסעפצקרשתןםןףץ'
        while normalized and normalized[0] in hebrew_chars:
            normalized = normalized[1:].strip()
        # Find the position of the last closing parenthesis
        paren_pos = normalized.rfind(')')
        if paren_pos > 0:
            normalized = normalized[:paren_pos+1]
        # Remove currency and prices like " ₪ 160.00"
        normalized = normalized.replace(' ₪', '').replace(' ILS', '')
        parts = normalized.rsplit(' ', 1)
        if parts and parts[-1].replace('.', '').replace(',', '').isdigit():
            normalized = parts[0]
        return normalized.strip()
    
    # Deduplicate while preserving order
    seen = {}  # Key: (store_name, normalized_album), Value: record
    deduped = []
    for record in all_records:
        norm_album = normalize_album(record.get('album', ''))
        key = (record.get('store_name', ''), norm_album)
        if key not in seen:
            seen[key] = record
            deduped.append(record)
    
    # Get desired page of deduped results
    total = len(deduped)
    start_idx = (page - 1) * pp
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
    
    # Data quality metrics
    cursor.execute("SELECT COUNT(*) FROM records WHERE cover_url IS NOT NULL")
    with_covers = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM records WHERE genre IS NOT NULL")
    with_genres = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM records WHERE year IS NOT NULL")
    with_years = cursor.fetchone()[0]
    
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


if __name__ == '__main__':
    print("\n" + "="*80)
    print("VINYL STORE - 10X BETTER DATABASE")
    if IS_ELECTRON:
        print("(ELECTRON APP MODE)")
    print("="*80)
    print("[INFO] Discogs API + Israeli Retail Stores")
    print(f"[INFO] Database: {DB_PATH}")
    print("[SCHEDULER] Initializing background scheduler...")
    
    # Initialize scheduler before running app
    _initialize_scheduler()
    
    print("[INFO] Starting on http://localhost:5001")
    print("="*80 + "\n")
    
    # Always disable reloader to prevent issues with Electron and multiprocessing
    app.run(host='localhost', port=5001, debug=False, use_reloader=False)

