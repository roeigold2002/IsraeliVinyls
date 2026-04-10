const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

let mainWindow;
let flaskProcess;
let isShuttingDown = false;

const FLASK_PORT = 5001;
const FLASK_HOST = 'http://localhost:5001';
const isDev = process.env.NODE_ENV === 'development';

// Find Python executable
function findPython() {
  const { execSync } = require('child_process');
  
  // 1. Try to find Python using `where` command
  try {
    const pythonPath = execSync('where python', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n')[0];
    if (pythonPath && fs.existsSync(pythonPath)) {
      console.log(`[Electron] Found Python via 'where': ${pythonPath}`);
      return pythonPath;
    }
  } catch (e) {
    console.log('[Electron] Python not found via where command');
  }

  // 2. Check environment variable
  if (process.env.PYTHON_EXE && fs.existsSync(process.env.PYTHON_EXE)) {
    console.log(`[Electron] Found Python via PYTHON_EXE env: ${process.env.PYTHON_EXE}`);
    return process.env.PYTHON_EXE;
  }

  // 3. Try common Windows Python locations
  const commonPaths = [
    // User's local Python from Windows Store/App
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python313\\python.exe'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python312\\python.exe'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311\\python.exe'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python310\\python.exe'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python39\\python.exe'),
    // System Python
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python39\\python.exe',
  ];

  for (const pythonPath of commonPaths) {
    try {
      if (pythonPath && fs.existsSync(pythonPath)) {
        console.log(`[Electron] Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Continue to next path
    }
  }

  // 4. Lastly, add to PATH and use just 'python'
  console.log('[Electron] Python not found in standard locations, using "python" from PATH');
  // Enhance PATH to include common locations
  process.env.PATH = [
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python313'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python312'),
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311'),
    'C:\\Python313',
    'C:\\Python312',
    'C:\\Python311',
    process.env.PATH
  ].filter(Boolean).join(';');
  
  return 'python';
}

// Wait for Flask server to be ready
function waitForFlaskServer(attempts = 30) {
  return new Promise((resolve, reject) => {
    const checkServer = (attemptsLeft) => {
      if (attemptsLeft === 0) {
        reject(new Error('Flask server failed to start'));
        return;
      }

      const req = http.get(`${FLASK_HOST}/`, (res) => {
        if (res.statusCode === 200) {
          console.log('[Electron] Flask server is ready!');
          resolve();
        } else {
          setTimeout(() => checkServer(attemptsLeft - 1), 500);
        }
      });

      req.on('error', () => {
        setTimeout(() => checkServer(attemptsLeft - 1), 500);
      });
    };

    checkServer(attempts);
  });
}

// Start Flask server
function startFlaskServer() {
  return new Promise((resolve, reject) => {
    try {
      const pythonExecutable = findPython();
      
      const appPath = path.join(__dirname, 'app.py');

      console.log(`[Electron] Starting Flask server from: ${appPath}`);
      console.log(`[Electron] Using Python: ${pythonExecutable}`);
      console.log(`[Electron] Working dir: ${__dirname}`);

      // Enhance environment PATH with Python locations
      const envOptions = {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      };
      
      // Ensure Python paths are in PATH
      const pythonPaths = [
        path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python313'),
        path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python312'),
        path.join(os.homedir(), 'AppData\\Local\\Programs\\Python\\Python311'),
        'C:\\Python313\\Scripts',
        'C:\\Python312\\Scripts',
        'C:\\Python311\\Scripts',
      ];
      envOptions.PATH = pythonPaths.concat([process.env.PATH]).filter(Boolean).join(';');

      flaskProcess = spawn(pythonExecutable, [appPath], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
        shell: false,  // Don't use shell - pass args directly to avoid space-in-path issues
        env: envOptions
      });

      let flaskOutput = '';
      let flaskError = '';

      // Capture stdout
      flaskProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Flask]', output);
        flaskOutput += output;
      });

      // Capture stderr
      flaskProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.log('[Flask Error]', error);
        flaskError += error;
      });

      flaskProcess.on('error', (error) => {
        console.error('[Electron] Failed to start Flask:', error);
        reject(error);
      });

      flaskProcess.on('exit', (code) => {
        if (!isShuttingDown) {
          console.log(`[Electron] Flask process exited with code ${code}`);
        }
      });

      // Wait for server to be ready
      waitForFlaskServer(30)
        .then(() => resolve())
        .catch((error) => {
          console.error('[Electron] Server startup timeout:', error);
          reject(error);
        });

    } catch (error) {
      console.error('[Electron] Error starting Flask:', error);
      reject(error);
    }
  });
}

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // Load the Flask app
  mainWindow.loadURL(FLASK_HOST);

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Handle app ready
app.on('ready', async () => {
  try {
    console.log('[Electron] App starting...');
    console.log('[Electron] App path:', app.getAppPath());

    // Start Flask server first
    await startFlaskServer();

    // Create window
    createWindow();

    // Create menu
    createMenu();

  } catch (error) {
    console.error('[Electron] Startup error:', error);
    app.quit();
  }
});

// Handle window all closed
app.on('window-all-closed', () => {
  app.quit();
});

// Reactivate window on macOS
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            console.log('Vinyl Store v1.0.0');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle app quit
app.on('before-quit', async () => {
  isShuttingDown = true;

  if (flaskProcess) {
    console.log('[Electron] Terminating Flask process...');
    try {
      process.kill(-flaskProcess.pid); // Kill process group
    } catch (e) {
      console.log('[Electron] Error killing Flask:', e.message);
    }
  }
});

// Handle IPC for analytics or other needs
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('app-path', () => {
  return app.getAppPath();
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('[Electron] Uncaught exception:', error);
});
