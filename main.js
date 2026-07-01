const { app, BrowserWindow } = require('electron');
const path = require('path');
const history = require('./core/history');

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
    mainWindow.webContents.openDevTools();
  }
  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

app.whenReady().then(async () => {
  createWindow();
  await history.load();

  const { ipcMain } = require('electron');
  require('./core/ipc/steam').register(ipcMain);
  require('./core/ipc/library').register(ipcMain, getMainWindow);
  require('./core/ipc/app').register(ipcMain, getMainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
