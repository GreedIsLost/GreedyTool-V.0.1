const path = require('path');
const fs = require('fs-extra');
const { decodeManifest, formatManifestSummary } = require('../protobuf');

const history = require('../history');
const { clearCache, getCacheStats } = require('../cache');
const { detectSam, launchSam, downloadSam } = require('../sam');
const { getManifestFileTree, downloadSelectedFiles, setDepotKey } = require('../depot-downloader');

function isAbsolutePath(p) {
  return typeof p === 'string' && (p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p));
}

function isSafeFilePath(p) {
  return typeof p === 'string' && !p.includes('..') && isAbsolutePath(p);
}

function register(ipcMain, getMainWindow) {
  ipcMain.handle('decode-manifest', async (_e, filePath) => {
    if (!isSafeFilePath(filePath)) return { success: false, error: 'Invalid file path' };
    try {
      const data = await fs.readFile(filePath);
      const decoded = await decodeManifest(data);
      const summary = formatManifestSummary(decoded);
      return { success: true, summary };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-external', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { success: false, error: 'Only http/https URLs allowed' };
    try {
      const { shell } = require('electron');
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-cache-stats', async () => {
    try {
      return await getCacheStats();
    } catch (err) {
      return { manifestCount: 0, sizeBytes: 0 };
    }
  });

  ipcMain.handle('clear-cache', async () => {
    try {
      await clearCache();
      return { success: true };
    } catch (err) {
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
    try {
      return { steamPath: await history.getSteamPath() };
    } catch (err) {
      return { steamPath: null };
    }
  });

  ipcMain.handle('save-settings', async (_e, settings) => {
    if (!settings || typeof settings !== 'object') return { success: false, error: 'Invalid settings' };
    try {
      if (typeof settings.steamPath === 'string') await history.setSteamPath(settings.steamPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
    if (typeof exePath !== 'string' || !isSafeFilePath(exePath)) return { success: false, error: 'Invalid exe path' };
    if (appId !== undefined && appId !== null && (!Number.isInteger(appId) || appId <= 0)) return { success: false, error: 'Invalid appId' };
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

  ipcMain.handle('get-manifest-tree', async (_e, filePath) => {
    if (!isSafeFilePath(filePath)) return { success: false, error: 'Invalid file path' };
    try {
      return await getManifestFileTree(filePath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('depot-set-key', async (_e, { depotId, keyHex }) => {
    if (typeof depotId !== 'string' || !depotId) return { success: false, error: 'Invalid depotId' };
    if (typeof keyHex !== 'string' || !keyHex) return { success: false, error: 'Invalid key' };
    try {
      setDepotKey(depotId, keyHex);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('depot-download', async (_e, { manifestPath, depotId, selectedPaths, outputDir, depotKey }) => {
    if (!isSafeFilePath(manifestPath)) return { success: false, error: 'Invalid manifest path' };
    if (typeof depotId !== 'string' || !depotId) return { success: false, error: 'Invalid depotId' };
    if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) return { success: false, error: 'No files selected' };
    if (!isSafeFilePath(outputDir)) return { success: false, error: 'Invalid output path' };
    for (const p of selectedPaths) {
      if (typeof p !== 'string' || p.includes('..')) return { success: false, error: 'Invalid path in selection' };
    }
    try {
      const result = await downloadSelectedFiles(manifestPath, depotId, selectedPaths, outputDir, depotKey || null, null);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
