'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Must be set before requiring any app module, because db.js reads it at
// module-load time. Points to the OS writable app-data folder so the index
// and email files are never stored inside the read-only app bundle.
process.env.TAKEOUT_DATA_DIR = path.join(app.getPath('userData'), 'data');

const { startServer } = require('../src/server');

let mainWindow = null;
let serverPort = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Takeout Viewer',
    // Uncomment and add a 512x512 PNG to electron/icon.png to set a custom icon:
    // icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // stays hidden until the page is fully loaded (no white flash)
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open all <a target="_blank"> links and window.open() calls in the system
  // browser rather than opening a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    serverPort = await startServer();
    await createWindow();
  } catch (err) {
    console.error('[Electron] Failed to start:', err);
    app.quit();
  }
});

// macOS: clicking the dock icon when no windows are open re-creates the window.
// The server is already running so we just open a new window.
app.on('activate', async () => {
  if (mainWindow === null && serverPort !== null) {
    await createWindow();
  }
});

// Quit the app when all windows are closed, except on macOS where it's
// conventional for apps to stay running until the user explicitly quits.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
