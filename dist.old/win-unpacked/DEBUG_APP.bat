@echo off
REM Debug launcher - keeps window open to show errors
setlocal enabledelayedexpansion

echo [DEBUG] Starting Vinyl Store with error output capture...
echo.

cd /d "e:\Code\Project V\dist\win-unpacked"

REM Capture output to both console and file
echo [DEBUG] Launching Vinyl Store.exe...
".\Vinyl Store.exe" 2>&1 | tee debug_output.log

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] App exited with code: %errorlevel%
    echo.
    echo [DEBUG] Checking Flask server on port 5001...
    netstat -ano | find ":5001"
)

echo.
echo [DEBUG] Press any key to close this window...
pause
