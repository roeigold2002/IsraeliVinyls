@echo off
REM Vinyl Store - Windows Installer Script
REM This script installs the Vinyl Store desktop application to the user's system

setlocal enabledelayedexpansion
cls

echo ====================================================
echo             Vinyl Store - Installer
echo                  Version 1.0.0
echo ====================================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This installer requires Administrator privileges.
    echo Please run this installer as Administrator.
    echo.
    echo To do this:
    echo 1. Right-click on this script
    echo 2. Select "Run as Administrator"
    pause
    exit /b 1
)

REM Define installation paths
set "INSTALL_PATH=%ProgramFiles%\Vinyl Store"
set "SOURCE_PATH=%~dp0"
set "SOURCE_APP=%SOURCE_PATH%dist\win-unpacked"

echo Installation Path: %INSTALL_PATH%
echo Source Path: %SOURCE_APP%
echo.

REM Check if source files exist
if not exist "%SOURCE_APP%\Vinyl Store.exe" (
    echo ERROR: Source application files not found at:
    echo %SOURCE_APP%\Vinyl Store.exe
    echo.
    echo Please ensure you're running this installer from the project directory.
    pause
    exit /b 1
)

echo Checking system requirements...
REM Check Windows version (should be Windows 10 or later)
for /f "tokens=*" %%A in ('wmic os get version ^| findstr /v "Version"') do set "WIN_VERSION=%%A"
echo Windows Version: %WIN_VERSION%
echo.

REM Create installation directory
echo Creating installation directory...
if not exist "%INSTALL_PATH%" (
    mkdir "%INSTALL_PATH%"
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create installation directory.
        echo Make sure you have write permissions to %ProgramFiles%
        pause
        exit /b 1
    )
)

REM Copy application files
echo Copying application files...
echo Please wait, this may take a minute...
xcopy "%SOURCE_APP%" "%INSTALL_PATH%" /Y /E /I /Q
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy application files.
    pause
    exit /b 1
)

REM Create Start Menu shortcuts
echo Creating shortcuts...
set "STARTUP_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

if not exist "%STARTUP_MENU%\Vinyl Store" (
    mkdir "%STARTUP_MENU%\Vinyl Store"
)

REM Create application shortcut using PowerShell (more reliable than vbs)
powershell -NoProfile -Command ^
    "$WshShell = New-Object -ComObject WScript.Shell; " ^
    "$Shortcut = $WshShell.CreateShortcut('%STARTUP_MENU%\Vinyl Store\Vinyl Store.lnk'); " ^
    "$Shortcut.TargetPath = '%INSTALL_PATH%\Vinyl Store.exe'; " ^
    "$Shortcut.WorkingDirectory = '%INSTALL_PATH%'; " ^
    "$Shortcut.IconLocation = '%INSTALL_PATH%\Vinyl Store.exe'; " ^
    "$Shortcut.Save()"

REM Create Desktop shortcut
if exist "%USERPROFILE%\Desktop" (
    powershell -NoProfile -Command ^
        "$WshShell = New-Object -ComObject WScript.Shell; " ^
        "$Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\Vinyl Store.lnk'); " ^
        "$Shortcut.TargetPath = '%INSTALL_PATH%\Vinyl Store.exe'; " ^
        "$Shortcut.WorkingDirectory = '%INSTALL_PATH%'; " ^
        "$Shortcut.IconLocation = '%INSTALL_PATH%\Vinyl Store.exe'; " ^
        "$Shortcut.Save()"
)

REM Create Uninstall script
echo Creating uninstaller...
(
    echo @echo off
    echo echo Uninstalling Vinyl Store...
    echo timeout /t 2 /nobreak
    echo taskkill /f /im "Vinyl Store.exe" 2^>nul
    echo rmdir /s /q "%INSTALL_PATH%"
    echo del "%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\Vinyl Store\Vinyl Store.lnk"
    echo rmdir "%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\Vinyl Store"
    echo del "%%USERPROFILE%%\Desktop\Vinyl Store.lnk" 2^>nul
    echo echo Vinyl Store has been uninstalled.
    echo pause
) > "%INSTALL_PATH%\Uninstall.bat"

REM Create uninstall shortcut in Start Menu
powershell -NoProfile -Command ^
    "$WshShell = New-Object -ComObject WScript.Shell; " ^
    "$Shortcut = $WshShell.CreateShortcut('%STARTUP_MENU%\Vinyl Store\Uninstall.lnk'); " ^
    "$Shortcut.TargetPath = '%INSTALL_PATH%\Uninstall.bat'; " ^
    "$Shortcut.WorkingDirectory = '%INSTALL_PATH%'; " ^
    "$Shortcut.Save()"

REM Add to registry for Programs and Features
echo Adding to Programs and Features...
reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vinyl Store" /v "DisplayName" /d "Vinyl Store" /f >nul
reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vinyl Store" /v "DisplayVersion" /d "1.0.0" /f >nul
reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vinyl Store" /v "InstallLocation" /d "%INSTALL_PATH%" /f >nul
reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vinyl Store" /v "UninstallString" /d "%INSTALL_PATH%\Uninstall.bat" /f >nul
reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vinyl Store" /v "Publisher" /d "Vinyl Store Inc." /f >nul

echo.
echo ====================================================
echo Installation Complete!
echo ====================================================
echo.
echo Vinyl Store has been successfully installed to:
echo %INSTALL_PATH%
echo.
echo You can launch the application by:
echo - Clicking the "Vinyl Store" shortcut on your desktop
echo - Or finding "Vinyl Store" in your Start Menu
echo.
echo To uninstall, run:
echo %INSTALL_PATH%\Uninstall.bat
echo.
echo Installation Directory (for manual access):
echo %INSTALL_PATH%
echo.
pause

REM Launch the application
start "" "%INSTALL_PATH%\Vinyl Store.exe"
