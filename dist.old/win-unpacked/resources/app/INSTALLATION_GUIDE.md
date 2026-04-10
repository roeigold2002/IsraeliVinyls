# Vinyl Store Desktop Application - Installation Guide

## Quick Start

The Vinyl Store desktop application is ready to install! Choose one of the following installation methods:

### Option 1: PowerShell Installer (Recommended)

1. **Open PowerShell as Administrator:**
   - Right-click on PowerShell in your Start Menu
   - Select "Run as Administrator"

2. **Run the installer:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File Install-VinylStore.ps1
   ```

3. **Follow the installation prompts**

---

### Option 2: Batch File Installer

1. **Right-click on `Install-VinylStore.bat`**
   - Select "Run as Administrator"

2. **Follow the installation prompts**

---

### Option 3: Manual Installation

1. **Create the installation directory:**
   - Windows Explorer → Program Files
   - Create a new folder named "Vinyl Store"

2. **Copy application files:**
   - Copy all files from `dist\win-unpacked\` folder
   - Paste them into `C:\Program Files\Vinyl Store\`

3. **Create shortcuts (optional but recommended):**
   - Right-click on the empty desktop → New → Shortcut
   - Location: `C:\Program Files\Vinyl Store\Vinyl Store.exe`
   - Name: `Vinyl Store`
   - Click Finish

4. **Launch:**
   - Double-click the shortcut or run `C:\Program Files\Vinyl Store\Vinyl Store.exe`

---

## System Requirements

- Windows 10 or later (64-bit)
- 500 MB free disk space
- Modern web browser (Chromium/Electron embedded)
- Python 3.8+ (for backend services)

---

## What Gets Installed

The installer creates:
- **Application files** in `C:\Program Files\Vinyl Store\`
- **Start Menu shortcut** in Start Menu → Vinyl Store
- **Desktop shortcut** (optional)
- **Uninstall option** in Programs and Features
- **Database file** with sample vinyl records

---

## First Launch

When you launch Vinyl Store for the first time:

1. **Wait 2-3 seconds** - Flask backend is starting in the background
2. **Application window appears** with the Vinyl Store interface
3. **Browse the catalog** - Search, filter by genre, sort by price
4. **Full pagination support** - Navigate through all records by pages

---

## Features

✅ **Database Browser**
- 44+ sample vinyl records
- Search by artist, album, or genre
- Filter by music store
- Sort by price

✅ **Full Pagination**
- Customizable page sizes (25-500 records)
- Navigation controls
- Direct page jumping
- Record count display

✅ **Store Information**
- 7 Israeli vinyl retailers
- Store inventory visibility
- Price comparison across stores

✅ **Search & Filtering**
- Real-time search
- Genre filtering
- Store-specific browsing

---

## Uninstallation

### Using Programs and Features (Easiest)
1. Open **Settings** → **Apps** → **Apps & features**
2. Find "Vinyl Store" in the list
3. Click it and select "Uninstall"
4. Confirm the uninstallation

### Using Start Menu
- Go to **Start Menu** → **Vinyl Store** → **Uninstall**

### Manual Uninstall
1. Go to `C:\Program Files\Vinyl Store\`
2. Run `Uninstall.bat` (right-click → Run as Administrator)

---

## Troubleshooting

### Application Won't Start
- **Check for errors:** Look for any error messages in the console
- **Reinstall:** Try uninstalling and reinstalling
- **Windows Requirements:** Ensure you have Windows 10 or later

### Database Not Loading
- **Verify install:** Check that `C:\Program Files\Vinyl Store\` has all files
- **Disk space:** Ensure you have at least 500 MB free
- **Database file:** Verify `dist\music_stores.db` exists in installation folder

### Port Already in Use
- The app uses port 5001 for the backend Flask server
- If another application is using port 5001:
  - Close that application first
  - Or restart your computer

### Administrator Required
- The installer requires Administrator privileges
- Some features may require elevated permissions
- Run as Administrator if you encounter permission errors

---

## Default Database

The installation includes a sample database with:
- **44 vinyl records** from 7 Israeli retailers
- **Complete schema** for artist, album, format, price, and more
- **Ready for expansion** - Add your own records

### Sample Stores Included:
1. ביטניק (Beatnik)
2. Taklit House
3. Tav 8
4. Disc Center
5. HasiVuOv
6. Shablool
7. OLX Marketplace

---

## Technical Details

### Technology Stack
- **Frontend:** Electron (desktop app shell)
- **Backend:** Flask (Python web framework)
- **Database:** SQLite
- **Port:** 5001 (localhost only)

### Files Included
- `Vinyl Store.exe` - Main application executable
- `preload.js` - Electron security bridge
- `main.js` - Electron process manager
- `app.py` - Flask backend
- `dist/music_stores.db` - SQLite database
- Supporting libraries and dependencies

### How It Works
1. Install assistant copies app files to Program Files
2. Shortcuts created in Start Menu and Desktop
3. On launch:
   - Electron main process starts
   - Flask backend initializes in background
   - Database loads from `dist/music_stores.db`
   - Web interface loads at `http://localhost:5001`
   - Electron window displays the interface

---

## Support & Documentation

For more information:
- Check the application's built-in help/documentation
- Review the database schema in the installation folder
- Check `*.md` files included in the installation directory

---

## Update History

### Version 1.0.0 (Release)
- ✅ Full Electron desktop application
- ✅ Flask backend with SQLite database
- ✅ Complete pagination system
- ✅ Search and filtering capabilities
- ✅ Multi-store database integration
- ✅ Windows installer support

---

**Installation Version:** 1.0.0  
**Last Updated:** March 31, 2026  
**Status:** Ready for Production Use

For issues or feedback, please review the logs in the installation directory.

