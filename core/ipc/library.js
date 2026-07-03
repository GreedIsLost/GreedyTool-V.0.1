const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { getSteamPath, getSteamAppsPath, killSteam, startSteam, generateAppManifest, getImportedGames, removeGame } = require('../utils');
const { exportBackup } = require('../exporter');
const history = require('../history');

let steamBusy = false;
let steamQueue = [];

async function execSteamOp(fn) {
  if (steamBusy) {
    return new Promise((resolve, reject) => {
      steamQueue.push({ resolve, reject });
    });
  }
  steamBusy = true;
  try {
    return await fn();
  } finally {
    if (steamQueue.length > 0) {
      const next = steamQueue.shift();
      next.resolve(execSteamOp(next.fn));
    } else {
      steamBusy = false;
    }
  }
}

async function waitKill() {
  const cmd = process.platform === 'win32'
    ? 'tasklist /FI "IMAGENAME eq steam.exe" 2>nul | find /I "steam.exe" >nul'
    : 'pgrep -x steam >/dev/null 2>&1';
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const { stdout } = await new Promise((resolve) => {
        exec(cmd, (err) => resolve({ stdout: err ? '' : 'running' }));
      });
      if (!stdout.trim()) return;
    } catch { return; }
  }
}

function isValidAppId(id) {
  return Number.isInteger(id) && id > 0 && id < 2147483647;
}

function register(ipcMain, getMainWindow) {
  ipcMain.handle('import-to-steam', async (_e, { appId, luaContent, depots }) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid appId' };
    if (typeof luaContent !== 'string') return { success: false, error: 'Invalid luaContent' };
    return execSteamOp(async () => {
      try {
        const steamPath = await history.getSteamPath() || getSteamPath();
        if (!steamPath) return { success: false, error: 'Steam not found.' };
        const steamappsPath = getSteamAppsPath(steamPath);
        await fs.ensureDir(steamappsPath);
        await fs.writeFile(path.join(steamappsPath, `${appId}.lua`), luaContent);
        await fs.writeFile(path.join(steamappsPath, `appmanifest_${appId}.acf`), generateAppManifest(appId, depots || []));
        await killSteam();
        await waitKill();
        await startSteam(steamPath);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  });

  ipcMain.handle('import-batch', async (_e, items) => {
    if (!Array.isArray(items)) return { success: false, error: 'Invalid items' };
    for (const item of items) {
      if (!isValidAppId(item.appId)) return { success: false, error: `Invalid appId: ${item.appId}` };
      if (typeof item.lua !== 'string') return { success: false, error: 'Invalid lua content' };
    }
    return execSteamOp(async () => {
      try {
        const steamPath = await history.getSteamPath() || getSteamPath();
        if (!steamPath) return { success: false, error: 'Steam not found.' };
        const steamappsPath = getSteamAppsPath(steamPath);
        await fs.ensureDir(steamappsPath);
        for (const { appId, lua, depots } of items) {
          await fs.writeFile(path.join(steamappsPath, `${appId}.lua`), lua);
          await fs.writeFile(path.join(steamappsPath, `appmanifest_${appId}.acf`), generateAppManifest(appId, depots || []));
        }
        await killSteam();
        await waitKill();
        await startSteam(steamPath);
        return { success: true, count: items.length };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  });

  ipcMain.handle('verify-import', async (_e, appId) => {
    if (!isValidAppId(appId)) return { found: false };
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return { found: false };
      const steamappsPath = getSteamAppsPath(steamPath);
      const manifestExists = await fs.pathExists(path.join(steamappsPath, `appmanifest_${appId}.acf`));
      const luaExists = await fs.pathExists(path.join(steamappsPath, `${appId}.lua`));
      return { found: manifestExists || luaExists, manifestExists, luaExists };
    } catch (err) {
      return { found: false };
    }
  });

  ipcMain.handle('get-imported', async () => {
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return [];
      return await getImportedGames(getSteamAppsPath(steamPath));
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('remove-game', async (_e, appId) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid appId' };
    try {
      const steamPath = await history.getSteamPath() || getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam not found.' };
      const removed = await removeGame(appId, getSteamAppsPath(steamPath));
      return { success: true, removed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-backup', async (_e, { appId, luaContent, manifestPaths, depots }) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid appId' };
    try {
      const { dialog } = require('electron');
      const mainWindow = getMainWindow();
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `greed_backup_${appId}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });
      if (result.canceled) return { success: false, error: 'Cancelled' };
      const outputPath = await exportBackup(appId, luaContent, manifestPaths, path.dirname(result.filePath), depots);
      return { success: true, path: outputPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-history', async () => {
    try {
      return await history.getHistory();
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('clear-history', async () => {
    try {
      await history.clearHistory();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
