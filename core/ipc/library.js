const path = require('path');
const fs = require('fs-extra');
const { getSteamPath, getSteamAppsPath, killSteam, startSteam, generateAppManifest, getImportedGames, removeGame } = require('../utils');
const { exportBackup } = require('../exporter');
const history = require('../history');

function register(ipcMain, getMainWindow) {
  ipcMain.handle('import-to-steam', async (_e, { appId, luaContent }) => {
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam not found.' };
      const steamappsPath = getSteamAppsPath(steamPath);
      await fs.ensureDir(steamappsPath);
      await fs.writeFile(path.join(steamappsPath, `${appId}.lua`), luaContent);
      await fs.writeFile(path.join(steamappsPath, `appmanifest_${appId}.acf`), generateAppManifest(appId));
      await killSteam();
      await new Promise(r => setTimeout(r, 2000));
      await startSteam(steamPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-batch', async (_e, items) => {
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam not found.' };
      const steamappsPath = getSteamAppsPath(steamPath);
      await fs.ensureDir(steamappsPath);
      for (const { appId, lua } of items) {
        await fs.writeFile(path.join(steamappsPath, `${appId}.lua`), lua);
        await fs.writeFile(path.join(steamappsPath, `appmanifest_${appId}.acf`), generateAppManifest(appId));
      }
      await killSteam();
      await new Promise(r => setTimeout(r, 2000));
      await startSteam(steamPath);
      return { success: true, count: items.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('verify-import', async (_e, appId) => {
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return { found: false };
      const steamappsPath = getSteamAppsPath(steamPath);
      const manifestExists = await fs.pathExists(path.join(steamappsPath, `appmanifest_${appId}.acf`));
      const luaExists = await fs.pathExists(path.join(steamappsPath, `${appId}.lua`));
      return { found: manifestExists || luaExists, manifestExists, luaExists };
    } catch (err) {
      console.error('verify-import error:', err);
      return { found: false };
    }
  });

  ipcMain.handle('get-imported', async () => {
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return [];
      return await getImportedGames(getSteamAppsPath(steamPath));
    } catch (err) {
      console.error('get-imported error:', err);
      return [];
    }
  });

  ipcMain.handle('remove-game', async (_e, appId) => {
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam not found.' };
      const removed = await removeGame(appId, getSteamAppsPath(steamPath));
      return { success: true, removed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-backup', async (_e, { appId, luaContent, manifestPaths }) => {
    try {
      const { dialog } = require('electron');
      const mainWindow = getMainWindow();
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `greed_backup_${appId}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });
      if (result.canceled) return { success: false, error: 'Cancelled' };
      const outputPath = await exportBackup(appId, luaContent, manifestPaths, path.dirname(result.filePath));
      return { success: true, path: outputPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-history', async () => {
    try {
      return await history.getHistory();
    } catch (err) {
      console.error('get-history error:', err);
      return [];
    }
  });

  ipcMain.handle('clear-history', async () => {
    try {
      await history.clearHistory();
      return { success: true };
    } catch (err) {
      console.error('clear-history error:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
