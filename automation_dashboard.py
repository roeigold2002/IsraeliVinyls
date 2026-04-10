#!/usr/bin/env python3
"""
Automation Monitoring Dashboard
HTML templates for displaying automation metrics and logs
"""

def get_dashboard_html():
    """Return HTML for automation monitoring dashboard."""
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Automation Dashboard - Vinyl Store</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                background: #1a1a1a; 
                color: #fff; 
                font-family: 'Courier New', monospace;
                padding: 20px;
            }
            
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
                border-bottom: 3px solid #4CAF50;
                padding: 30px;
                text-align: center;
                margin-bottom: 30px;
                border-radius: 5px;
            }
            
            h1 { color: #4CAF50; font-size: 2.5em; margin-bottom: 10px; }
            .subtitle { color: #aaa; margin-bottom: 10px; }
            
            .container { max-width: 1000px; margin: 0 auto; }
            
            .status-bar {
                display: flex;
                gap: 20px;
                margin-bottom: 30px;
                flex-wrap: wrap;
            }
            
            .status-card {
                background: #0d0d0d;
                border: 2px solid #333;
                border-radius: 5px;
                padding: 20px;
                flex: 1;
                min-width: 200px;
            }
            
            .status-card.success {
                border-color: #4CAF50;
            }
            
            .status-card.warning {
                border-color: #ff9800;
            }
            
            .status-card.error {
                border-color: #f44336;
            }
            
            .status-label {
                color: #aaa;
                font-size: 0.9em;
                margin-bottom: 10px;
                text-transform: uppercase;
            }
            
            .status-value {
                font-size: 1.5em;
                font-weight: bold;
                color: #4CAF50;
            }
            
            .status-card.error .status-value {
                color: #f44336;
            }
            
            .status-card.warning .status-value {
                color: #ff9800;
            }
            
            .section {
                background: #0d0d0d;
                border: 1px solid #333;
                border-radius: 5px;
                padding: 20px;
                margin-bottom: 20px;
            }
            
            h2 {
                color: #4CAF50;
                border-bottom: 2px solid #4CAF50;
                padding-bottom: 10px;
                margin-bottom: 15px;
                font-size: 1.3em;
            }
            
            .metric-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .metric {
                background: #1a1a1a;
                border-left: 4px solid #4CAF50;
                padding: 15px;
                border-radius: 3px;
            }
            
            .metric-label {
                color: #aaa;
                font-size: 0.85em;
                margin-bottom: 8px;
            }
            
            .metric-value {
                font-size: 1.5em;
                color: #4CAF50;
                font-weight: bold;
            }
            
            .log-viewer {
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 3px;
                padding: 15px;
                max-height: 400px;
                overflow-y: auto;
                font-size: 0.9em;
            }
            
            .log-line {
                padding: 5px 0;
                border-bottom: 1px solid #222;
            }
            
            .log-line.info { color: #87ceeb; }
            .log-line.success { color: #4CAF50; }
            .log-line.warning { color: #ff9800; }
            .log-line.error { color: #f44336; }
            
            .refresh-button {
                background: #4CAF50;
                color: #000;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                font-weight: bold;
                cursor: pointer;
                font-family: Arial, sans-serif;
            }
            
            .refresh-button:hover {
                background: #45a049;
            }
            
            .refresh-button:active {
                transform: scale(0.98);
            }
            
            .timestamp {
                color: #666;
                font-size: 0.85em;
            }
            
            .loading {
                text-align: center;
                padding: 20px;
                color: #666;
            }
            
            .spinner {
                display: inline-block;
                border: 4px solid #333;
                border-top: 4px solid #4CAF50;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin-right: 10px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔄 AUTOMATION DASHBOARD</h1>
            <p class="subtitle">Vinyl Store - Database Growth Monitor</p>
        </div>
        
        <div class="container">
            <!-- Status Overview -->
            <div class="status-bar" id="statusBar">
                <div class="loading"><span class="spinner"></span>Loading...</div>
            </div>
            
            <!-- Metrics Summary -->
            <div class="section">
                <h2>Database Metrics</h2>
                <div class="metric-grid" id="metricsGrid">
                    <div class="loading"><span class="spinner"></span>Loading metrics...</div>
                </div>
            </div>
            
            <!-- Last Run Details -->
            <div class="section">
                <h2>Last Automation Run</h2>
                <div id="lastRunDetails">
                    <div class="loading"><span class="spinner"></span>Loading run details...</div>
                </div>
            </div>
            
            <!-- Recent Logs -->
            <div class="section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; flex: 1;">Recent Logs</h2>
                    <button class="refresh-button" onclick="refreshDashboard()">🔄 Refresh</button>
                </div>
                <div class="log-viewer" id="logsViewer">
                    <div class="loading"><span class="spinner"></span>Loading logs...</div>
                </div>
            </div>
        </div>
        
        <script>
            async function loadStats() {
                try {
                    const res = await fetch('/api/automation/stats');
                    const data = await res.json();
                    
                    // Status bar
                    const statusBar = document.getElementById('statusBar');
                    statusBar.innerHTML = `
                        <div class="status-card ${data.scheduler_status === 'running' ? 'success' : 'error'}">
                            <div class="status-label">Scheduler Status</div>
                            <div class="status-value">${data.scheduler_status.toUpperCase()}</div>
                        </div>
                        <div class="status-card">
                            <div class="status-label">Last Run</div>
                            <div class="status-value" style="font-size: 0.9em;">
                                ${data.last_run ? new Date(data.last_run).toLocaleString() : 'Never'}
                            </div>
                        </div>
                        <div class="status-card success">
                            <div class="status-label">Total Records</div>
                            <div class="status-value">${data.total_records.toLocaleString()}</div>
                        </div>
                    `;
                    
                    // Metrics grid
                    const metricsGrid = document.getElementById('metricsGrid');
                    metricsGrid.innerHTML = `
                        <div class="metric">
                            <div class="metric-label">Total Records</div>
                            <div class="metric-value">${data.total_records.toLocaleString()}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Discogs Records</div>
                            <div class="metric-value">${data.discogs_records.toLocaleString()}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Local Store Records</div>
                            <div class="metric-value">${data.local_records.toLocaleString()}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Last Run Added</div>
                            <div class="metric-value">${data.last_run_stats.records_added}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Discogs New</div>
                            <div class="metric-value">${data.last_run_stats.discogs_new}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Prices Updated</div>
                            <div class="metric-value">${data.last_run_stats.prices_updated}</div>
                        </div>
                    `;
                } catch (e) {
                    console.error('Failed to load stats:', e);
                    document.getElementById('statusBar').innerHTML = '<div class="status-card error"><div class="status-label">Error</div><div class="status-value">Failed to Load</div></div>';
                }
            }
            
            async function loadLastRun() {
                try {
                    const res = await fetch('/api/automation/last-run');
                    if (res.status === 404) {
                        document.getElementById('lastRunDetails').innerHTML = '<div style="color: #999; padding: 20px; text-align: center;">No automation runs yet</div>';
                        return;
                    }
                    
                    const data = await res.json();
                    
                    let html = `
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                    `;
                    
                    const fields = [
                        ['Status', data.status],
                        ['Start Time', data.start_time ? new Date(data.start_time).toLocaleString() : 'N/A'],
                        ['End Time', data.end_time ? new Date(data.end_time).toLocaleString() : 'N/A'],
                        ['Records Before', data.total_records_before || 0],
                        ['Records After', data.total_records_after || 0],
                        ['Discogs New', data.discogs_new || 0],
                        ['Discogs Skipped', data.discogs_skipped || 0],
                        ['Prices Updated', data.prices_updated || 0],
                        ['Discogs Errors', data.discogs_errors ? data.discogs_errors.length : 0],
                        ['Price Errors', data.prices_errors ? data.prices_errors.length : 0],
                        ['Duplicates Detected', data.duplicates_detected || 0],
                    ];
                    
                    fields.forEach(([label, value]) => {
                        let color = '#4CAF50';
                        if (label.includes('Error') && value > 0) color = '#f44336';
                        if (label === 'Status' && value === 'failed') color = '#f44336';
                        
                        html += `
                            <div style="padding: 10px; background: #1a1a1a; border-radius: 3px;">
                                <div style="color: #aaa; font-size: 0.85em; margin-bottom: 5px;">${label}</div>
                                <div style="color: ${color}; font-weight: bold; font-size: 1.1em;">${value}</div>
                            </div>
                        `;
                    });
                    
                    html += '</div>';
                    document.getElementById('lastRunDetails').innerHTML = html;
                } catch (e) {
                    console.error('Failed to load last run:', e);
                }
            }
            
            async function loadLogs() {
                try {
                    const res = await fetch('/api/automation/logs');
                    const data = await res.json();
                    
                    const logLines = (data.logs || []).slice(-50);  // Last 50 lines
                    if (logLines.length === 0) {
                        document.getElementById('logsViewer').innerHTML = '<div style="color: #999; padding: 20px; text-align: center;">No logs yet</div>';
                        return;
                    }
                    
                    const html = logLines.map(line => {
                        let cssClass = 'info';
                        if (line.includes('[ERROR]')) cssClass = 'error';
                        else if (line.includes('[SUCCESS]')) cssClass = 'success';
                        else if (line.includes('[WARNING]')) cssClass = 'warning';
                        
                        return `<div class="log-line ${cssClass}">${line}</div>`;
                    }).join('');
                    
                    document.getElementById('logsViewer').innerHTML = html;
                } catch (e) {
                    console.error('Failed to load logs:', e);
                    document.getElementById('logsViewer').innerHTML = '<div style="color: #999; padding: 20px;">Logs endpoint not available</div>';
                }
            }
            
            function refreshDashboard() {
                loadStats();
                loadLastRun();
                loadLogs();
            }
            
            // Initial load
            refreshDashboard();
            
            // Auto-refresh every 30 seconds
            setInterval(refreshDashboard, 30000);
        </script>
    </body>
    </html>
    '''


def get_logs_html():
    """Return HTML for logs viewer."""
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Automation Logs - Vinyl Store</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #1a1a1a; color: #fff; font-family: 'Courier New', monospace; padding: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            h1 { color: #4CAF50; margin-bottom: 20px; }
            .logs { background: #0d0d0d; border: 1px solid #333; border-radius: 5px; padding: 15px; max-height: 600px; overflow-y: auto; }
            .log-line { padding: 5px 0; border-bottom: 1px solid #222; }
            .log-info { color: #87ceeb; }
            .log-success { color: #4CAF50; }
            .log-warning { color: #ff9800; }
            .log-error { color: #f44336; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📋 Automation Logs</h1>
            <div class="logs" id="logs"></div>
        </div>
        <script>
            async function loadLogs() {
                const res = await fetch('/api/automation/logs');
                const data = await res.json();
                
                const html = (data.logs || []).map(line => {
                    let cssClass = 'log-info';
                    if (line.includes('[ERROR]')) cssClass = 'log-error';
                    else if (line.includes('[SUCCESS]')) cssClass = 'log-success';
                    else if (line.includes('[WARNING]')) cssClass = 'log-warning';
                    
                    return `<div class="log-line ${cssClass}">${line}</div>`;
                }).join('');
                
                document.getElementById('logs').innerHTML = html || '<div style="color: #999;">No logs available</div>';
            }
            
            loadLogs();
            setInterval(loadLogs, 10000);
        </script>
    </body>
    </html>
    '''
