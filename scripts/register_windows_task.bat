@echo off
REM Windows Task Scheduler Registration Script
REM Registers "VinylDB_DailyGrowth" task to run daily at 2 AM
REM 
REM INSTRUCTIONS:
REM 1. Open Command Prompt as Administrator
REM 2. Navigate to project directory
REM 3. Run: scripts\register_windows_task.bat
REM

echo.
echo ============================================================================
echo Windows Task Scheduler - VinylDB Daily Growth Registration
echo ============================================================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script must be run as Administrator
    echo        Please open Command Prompt as Administrator and try again
    pause
    exit /b 1
)

REM Get Python path
for /f "tokens=*" %%i in ('where python ^| findstr python') do set PYTHON=%%i

if "%PYTHON%"=="" (
    echo [ERROR] Python not found in PATH
    echo        Please install Python or add it to your PATH
    pause
    exit /b 1
)

echo [OK] Python found: %PYTHON%

REM Get project directory
set PROJECT_DIR=%~dp0..
echo [OK] Project directory: %PROJECT_DIR%

REM Full path to the import script
set SCRIPT_PATH=%PROJECT_DIR%\scripts\run_daily_import.py

if not exist "%SCRIPT_PATH%" (
    echo [ERROR] Script not found: %SCRIPT_PATH%
    pause
    exit /b 1
)

echo [OK] Script found: %SCRIPT_PATH%

REM Delete existing task if present
echo.
echo [STEP 1/3] Removing existing task (if any)...
schtasks /delete /tn "VinylDB\DailyGrowth" /f >nul 2>&1
echo [OK] Previous task removed or none existed

REM Create task folder
echo.
echo [STEP 2/3] Creating task folder...
schtasks /create /f /tn "VinylDB\DailyGrowth" /rl highest ^
    /tr "cmd.exe /c \"%PYTHON%\" \"%SCRIPT_PATH%\" >> logs\task_scheduler.log 2>>&1" ^
    /sc daily /st 02:00:00 /z >nul 2>&1

if %errorLevel% neq 0 (
    echo [ERROR] Failed to create task
    echo.
    echo Alternative: Create task manually in Task Scheduler
    echo  - Task name: VinylDB\DailyGrowth
    echo  - Trigger: Daily at 2:00 AM
    echo  - Action: "%PYTHON%" "%SCRIPT_PATH%"
    echo  - Run with highest privileges: Yes
    pause
    exit /b 1
)

echo [OK] Task created successfully

REM Enable task
echo.
echo [STEP 3/3] Enabling task...
schtasks /change /tn "VinylDB\DailyGrowth" /enable >nul 2>&1

echo [OK] Task enabled

REM Verify task
echo.
echo [VERIFICATION] Checking task registration...
schtasks /query /tn "VinylDB\DailyGrowth" /v /fo list

echo.
echo ============================================================================
echo SUCCESS! Task registered
echo ============================================================================
echo.
echo Task Details:
echo  - Name: VinylDB\DailyGrowth
echo  - Trigger: Every day at 2:00 AM
echo  - Script: %SCRIPT_PATH%
echo  - Logs: %PROJECT_DIR%\logs\task_scheduler.log
echo.
echo To view in Task Scheduler:
echo  1. Open Task Scheduler (taskmgr or "Task Scheduler" in Start)
echo  2. Navigate to Task Scheduler Library > VinylDB
echo  3. Double-click "DailyGrowth" to view/edit settings
echo.
echo To run manually:
echo  1. Right-click task in Task Scheduler
echo  2. Select "Run"
echo  3. Or: schtasks /run /tn "VinylDB\DailyGrowth"
echo.
echo To remove task:
echo  schtasks /delete /tn "VinylDB\DailyGrowth" /f
echo.

pause
