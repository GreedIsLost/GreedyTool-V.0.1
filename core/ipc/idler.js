const SteamIdler = require('../idler');
const { getInstalledGames } = require('../utils');
const history = require('../history');

let idler;

function register(ipcMain, getMainWindow) {
  idler = new SteamIdler();

  function send(event, data) {
    const w = getMainWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(event, data);
    }
  }

  idler.on('status', (status) => send('idler-status', { status }));
  idler.on('loggedIn', () => send('idler-logged-in', {}));
  idler.on('guard-needed', (domain, lastCodeWrong) => send('idler-guard-needed', { domain, lastCodeWrong }));
  idler.on('error', (msg) => send('idler-error', { error: msg }));
  idler.on('idling-started', (appIds) => send('idler-idling', { appIds }));
  idler.on('idling-stopped', () => send('idler-stopped', {}));

  ipcMain.handle('idler-login', async (_e, { username, password }) => {
    if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
      return { success: false, error: 'Invalid credentials' };
    }
    try {
      idler.login(username, password);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-guard', async (_e, { code }) => {
    if (typeof code !== 'string' || !code) return { success: false, error: 'Invalid code' };
    try {
      idler.submitGuard(code);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-start', async (_e, { appIds }) => {
    if (!Array.isArray(appIds) || appIds.length === 0) return { success: false, error: 'No App IDs provided' };
    for (const id of appIds) {
      if (!Number.isInteger(id) || id <= 0) return { success: false, error: `Invalid App ID: ${id}` };
    }
    try {
      idler.startIdle(appIds);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-stop', async () => {
    try {
      idler.stopIdle();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-status', async () => {
    try {
      return { success: true, state: idler.getState() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-logout', async () => {
    try {
      idler.logout();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-installed-games', async () => {
    try {
      const steamPath = await history.getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam path not set' };
      const games = await getInstalledGames(steamPath);
      return { success: true, games };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = { register, getIdler: () => idler };
