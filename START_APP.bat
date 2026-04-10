@echo off
REM Vinyl Record Store App - Start Script
REM This script starts the Flask app on localhost:5000

cd /d "%~dp0"
echo Starting Vinyl Record Store App...
echo.
python.exe -m flask run --host localhost --port 5000
pause
