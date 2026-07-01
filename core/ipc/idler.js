const SteamIdler = require('../idler');

function register(ipcMain, getMainWindow) {
  const idler = new SteamIdler();

  function send(event, data) {
    const w = getMainWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(event, data);
    }
  }

  idler.on('status', (status) => send('idler-status', { status }));
  idler.on('loggedIn', () => send('idler-logged-in', {}));
  idler.on('guard-needed', (domain) => send('idler-guard-needed', { domain }));
  idler.on('error', (msg) => send('idler-error', { error: msg }));
  idler.on('idling-started', (appId) => send('idler-idling', { appId }));
  idler.on('idling-stopped', () => send('idler-stopped', {}));

  ipcMain.handle('idler-login', async (_e, { username, password }) => {
    try {
      idler.login(username, password);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-guard', async (_e, { code }) => {
    try {
      idler.submitGuard(code);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('idler-start', async (_e, { appId }) => {
    try {
      idler.startIdle(appId);
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
    return { success: true, state: idler.getState() };
  });

  ipcMain.handle('idler-logout', async () => {
    try {
      idler.logout();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
