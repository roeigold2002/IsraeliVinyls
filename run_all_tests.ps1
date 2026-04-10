#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated QA Test Runner for Israeli Vinyl Records App v2.0
    
.DESCRIPTION
    Runs all tests (backend and UI) and saves results to log files.
    
.EXAMPLE
    .\run_all_tests.ps1
    
.NOTES
    Requires Python 3.7+ and Flask app running on localhost:5000 or 5001
#>

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " VINYL RECORDS APP - AUTOMATED QA TEST SUITE" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting automated test sequence..." -ForegroundColor White
Write-Host "Application: Israeli Vinyl Records Aggregator v2.0" -ForegroundColor Gray
Write-Host "Test Date: $(Get-Date)" -ForegroundColor Gray
Write-Host "Working Directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

# Check Python installation
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python 3.7+ from https://www.python.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check dependencies
Write-Host "Checking dependencies..." -ForegroundColor Yellow
$packages = @("requests", "playwright")

foreach ($pkg in $packages) {
    try {
        python -c "import $pkg" 2>&1 | Out-Null
        Write-Host "✓ $pkg installed" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Installing $pkg..." -ForegroundColor Yellow
        pip install $pkg | Out-Null
        Write-Host "✓ $pkg installed" -ForegroundColor Green
    }
}

# Special case for playwright browsers
try {
    python -c "from playwright.async_api import async_playwright" 2>&1 | Out-Null
    Write-Host "✓ Playwright configured" -ForegroundColor Green
} catch {
    Write-Host "⚠ Installing Playwright browsers..." -ForegroundColor Yellow
    playwright install chromium | Out-Null
    Write-Host "✓ Playwright browsers installed" -ForegroundColor Green
}

Write-Host ""

# Check if app is running
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "STEP 1: APP READINESS CHECK" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tests require your Flask app to be running." -ForegroundColor White
Write-Host ""
Write-Host "You have 30 seconds to:" -ForegroundColor Yellow
Write-Host "  1. Open a new PowerShell window" -ForegroundColor Gray
Write-Host "  2. Run: python app.py" -ForegroundColor Gray
Write-Host "  3. Wait for: 'Starting on http://localhost:PORT'" -ForegroundColor Gray
Write-Host ""
Write-Host "After you do that, press Enter to continue..." -ForegroundColor Yellow
Write-Host ""
Read-Host "(Press Enter)"

Write-Host ""

# Run backend tests
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "STEP 2: RUNNING BACKEND TESTS" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing: API endpoints, database, pagination, concurrency, error handling" -ForegroundColor Gray
Write-Host "Expected time: 2-3 minutes" -ForegroundColor Gray
Write-Host ""

Write-Host "⏳ Running backend tests..." -ForegroundColor Yellow

$backendStart = Get-Date
python test_backend.py | Tee-Object -FilePath "backend_results.txt"
$backendEnd = Get-Date
$backendDuration = $backendEnd - $backendStart

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Backend tests completed in $($backendDuration.TotalSeconds) seconds" -ForegroundColor Green
    Write-Host "  Results saved to: backend_results.txt" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "⚠ Backend tests had warnings/errors" -ForegroundColor Yellow
    Write-Host "  Check backend_results.txt for details" -ForegroundColor Gray
}

Write-Host ""

# Run UI tests
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "STEP 3: RUNNING UI TESTS" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing: Page load, search, pagination, images, responsiveness, performance" -ForegroundColor Gray
Write-Host "Expected time: 3-5 minutes" -ForegroundColor Gray
Write-Host "NOTE: Chromium browser will open automatically (headless mode)" -ForegroundColor Gray
Write-Host ""

Write-Host "⏳ Running UI tests..." -ForegroundColor Yellow

$uiStart = Get-Date
python test_ui.py | Tee-Object -FilePath "ui_results.txt"
$uiEnd = Get-Date
$uiDuration = $uiEnd - $uiStart

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ UI tests completed in $($uiDuration.TotalSeconds) seconds" -ForegroundColor Green
    Write-Host "  Results saved to: ui_results.txt" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "⚠ UI tests had warnings/errors" -ForegroundColor Yellow
    Write-Host "  Check ui_results.txt for details" -ForegroundColor Gray
}

Write-Host ""

# Summary
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "TEST EXECUTION COMPLETE" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Results saved to:" -ForegroundColor White
Write-Host "  • backend_results.txt" -ForegroundColor Gray
Write-Host "  • ui_results.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "Total test time: $($($backendEnd - $backendStart).TotalSeconds + $($uiEnd - $uiStart).TotalSeconds) seconds" -ForegroundColor Green
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review backend_results.txt - API and database tests" -ForegroundColor Gray
Write-Host "  2. Review ui_results.txt - browser automation tests" -ForegroundColor Gray
Write-Host ""

Write-Host "What to look for:" -ForegroundColor Yellow
Write-Host "  ✓ PASS   = Test passed successfully" -ForegroundColor Green
Write-Host "  ✗ FAIL   = Bug found - needs fixing" -ForegroundColor Red
Write-Host "  ⚠ WARN   = Warning - may indicate issue" -ForegroundColor Yellow
Write-Host ""

Write-Host "Critical issues:" -ForegroundColor Yellow
Write-Host "  • 'PAGINATION BUG DETECTED' - deduplication issue" -ForegroundColor Gray
Write-Host "  • 'Missing REQUIRED COLUMN' - schema mismatch" -ForegroundColor Gray
Write-Host "  • HTTP errors - connectivity/port issues" -ForegroundColor Gray
Write-Host "  • Performance metrics - response times" -ForegroundColor Gray
Write-Host ""

Write-Host "Recommended:" -ForegroundColor Yellow
Write-Host "  1. Keep your app running in background" -ForegroundColor Gray
Write-Host "  2. Share both .txt files for detailed analysis" -ForegroundColor Gray
Write-Host ""

Write-Host "Press Enter to finish..." -ForegroundColor Yellow
Read-Host
