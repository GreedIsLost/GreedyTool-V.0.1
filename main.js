process.on('uncaughtException', (err) => console.error('Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const history = require('./core/history');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Greed',
    backgroundColor: '#1b2838',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('renderer/index.html');
  if (process.env.NODE_ENV === 'development') {
    mainWindow.openDevTools();
  }
  return mainWindow;
}

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => send('update-checking', {}));
autoUpdater.on('update-available', (info) => send('update-available', { version: info.version, url: info.files?.[0]?.url }));
autoUpdater.on('update-not-available', () => send('update-not-available', {}));
autoUpdater.on('error', (err) => send('update-error', { error: err.message }));
autoUpdater.on('download-progress', (p) => send('update-progress', { percent: p.percent, bytesPerSecond: p.bytesPerSecond, total: p.total, transferred: p.transferred }));
autoUpdater.on('update-downloaded', () => send('update-downloaded', {}));

function getMainWindow() {
  return mainWindow;
}

app.whenReady().then(async () => {
  createWindow();
  await history.load();

  require('./core/ipc/steam').register(ipcMain);
  require('./core/ipc/library').register(ipcMain, getMainWindow);
  require('./core/ipc/app').register(ipcMain, getMainWindow);
  require('./core/ipc/idler').register(ipcMain, getMainWindow);

  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdates().catch(() => {});
  }
});

ipcMain.handle('update-check', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update-download', async () => {
  try {
    autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update-install', async () => {
  setImmediate(() => autoUpdater.quitAndInstall());
  return { success: true };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
