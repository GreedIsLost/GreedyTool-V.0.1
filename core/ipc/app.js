const path = require('path');
const fs = require('fs-extra');
const { decodeManifest, formatManifestSummary } = require('../protobuf');
const { checkForUpdate } = require('../updater');
const history = require('../history');
const { clearCache, getCacheStats } = require('../cache');
const { detectSam, launchSam, downloadSam } = require('../sam');

function register(ipcMain, getMainWindow) {
  ipcMain.handle('decode-manifest', async (_e, filePath) => {
    try {
      const data = await fs.readFile(filePath);
      const decoded = await decodeManifest(data);
      const summary = formatManifestSummary(decoded);
      return { success: true, summary };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('check-update', async () => {
    try {
      const pkg = require('../../package.json');
      return await checkForUpdate(pkg.version);
    } catch (err) {
      console.error('check-update error:', err);
      return { hasUpdate: false, error: err.message };
    }
  });

  ipcMain.handle('open-external', async (_e, url) => {
    const { shell } = require('electron');
    await shell.openExternal(url);
  });

  ipcMain.handle('get-cache-stats', async () => {
    try {
      return await getCacheStats();
    } catch (err) {
      console.error('get-cache-stats error:', err);
      return { manifestCount: 0, sizeBytes: 0 };
    }
  });

  ipcMain.handle('clear-cache', async () => {
    try {
      await clearCache();
      return { success: true };
    } catch (err) {
      console.error('clear-cache error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pick-file', async () => {
    const { dialog } = require('electron');
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('pick-manifest-file', async () => {
    const { dialog } = require('electron');
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Steam Manifests', extensions: ['manifest'] }],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('get-settings', async () => {
    return { steamPath: await history.getSteamPath() };
  });

  ipcMain.handle('save-settings', async (_e, settings) => {
    if (settings.steamPath !== undefined) await history.setSteamPath(settings.steamPath);
    return { success: true };
  });

  ipcMain.handle('pick-folder', async () => {
    const { dialog } = require('electron');
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('sam-detect', async () => {
    try {
      const exePath = await detectSam();
      return { found: !!exePath, path: exePath };
    } catch (err) {
      return { found: false, error: err.message };
    }
  });

  ipcMain.handle('sam-launch', async (_e, { exePath, appId }) => {
    try {
      await launchSam(exePath, appId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sam-download', async () => {
    try {
      return await downloadSam();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
