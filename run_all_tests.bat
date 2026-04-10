@echo off
REM ==============================================================================
REM AUTOMATED QA TEST RUNNER - Israeli Vinyl Records App v2.0
REM ==============================================================================
REM This script runs ALL tests in sequence and saves results to log files
REM
REM Usage: Just double-click this file or run: run_all_tests.bat
REM ==============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ================================================================================
echo  VINYL RECORDS APP - AUTOMATED QA TEST SUITE
echo ================================================================================
echo.
echo Starting automated test sequence...
echo Application: Israeli Vinyl Records Aggregator v2.0
echo Test Date: %date% %time%
echo Working Directory: %cd%
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check if required packages are installed
echo Checking dependencies...
python -c "import requests" >nul 2>&1
if errorlevel 1 (
    echo WARNING: 'requests' package not found. Installing...
    pip install requests
)

python -c "import playwright" >nul 2>&1
if errorlevel 1 (
    echo WARNING: 'playwright' package not found. Installing...
    pip install playwright
    playwright install chromium
)

echo Dependencies check complete.
echo.

REM ==============================================================================
REM CHECK IF APP IS RUNNING
REM ==============================================================================
echo ================================================================================
echo STEP 1: CHECKING IF APP IS RUNNING
echo ================================================================================
echo.
echo The tests require your Flask app to be running.
echo.
echo You have 30 seconds to:
echo   1. Open a new Command Prompt window
echo   2. Run: python app.py
echo   3. Wait for it to say "Starting on http://localhost:PORT"
echo.
echo After you do that, return to this window and press Enter to continue...
echo.
pause

REM ==============================================================================
REM RUN BACKEND TESTS
REM ==============================================================================
echo.
echo ================================================================================
echo STEP 2: RUNNING BACKEND TESTS
echo ================================================================================
echo.
echo This tests: API endpoints, database, pagination, concurrency, error handling
echo Expected time: 2-3 minutes
echo.

python test_backend.py > backend_results.txt 2>&1

if errorlevel 1 (
    color 4F
    echo.
    echo WARNING: Backend tests had errors. Check backend_results.txt
    color 07
) else (
    echo ✓ Backend tests completed. Results saved to: backend_results.txt
)

echo.
echo ================================================================================
echo STEP 3: RUNNING UI TESTS
echo ================================================================================
echo.
echo This tests: Page load, search, pagination, images, responsiveness, performance
echo Expected time: 3-5 minutes
echo NOTE: Chromium browser will open automatically (headless mode)
echo.

python test_ui.py > ui_results.txt 2>&1

if errorlevel 1 (
    color 4F
    echo.
    echo WARNING: UI tests had errors. Check ui_results.txt
    color 07
) else (
    echo ✓ UI tests completed. Results saved to: ui_results.txt
)

REM ==============================================================================
REM DISPLAY RESULTS
REM ==============================================================================
echo.
echo ================================================================================
echo TEST EXECUTION COMPLETE
echo ================================================================================
echo.
echo Results saved to:
echo   • backend_results.txt
echo   • ui_results.txt
echo.
echo Next steps:
echo   1. Open backend_results.txt to review API/database tests
echo   2. Open ui_results.txt to review browser automation tests
echo   3. Look for markers:
echo      ✓ PASS   = Test passed
echo      ✗ FAIL   = Bug found
echo      ⚠ WARN   = Warning/potential issue
echo.
echo Important items to check:
echo   • PAGINATION BUG DETECTED messages (pagination consistency issue)
echo   • Missing REQUIRED COLUMN warnings (schema mismatch)
echo   • HTTP errors (connectivity issues)
echo   • Performance metrics (load time, search time)
echo.
echo Recommended:
echo   1. Keep your app running in the background
echo   2. Copy both .txt files and share them for detailed analysis
echo.
pause
