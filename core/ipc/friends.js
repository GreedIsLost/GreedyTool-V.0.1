const FriendsWatcher = require('../friends');
const { getIdler } = require('./idler');

function register(ipcMain, getMainWindow) {
  let watcher = null;

  function send(event, data) {
    const w = getMainWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(event, data);
    }
  }

  ipcMain.handle('friends-start', async () => {
    try {
      const idler = getIdler();
      if (!idler) return { success: false, error: 'Idler not initialized' };
      const client = idler.getClient();
      if (!client || !client.steamID) return { success: false, error: 'Not logged in to Steam' };

      if (watcher) watcher.stop();
      watcher = new FriendsWatcher(client);
      watcher.on('update', (list) => send('friends-update', { count: list.length, friends: list }));
      watcher.on('error', (msg) => send('friends-error', { error: msg }));
      watcher.start();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('friends-stop', async () => {
    try {
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('friends-list', async () => {
    try {
      if (!watcher) return { success: false, error: 'Watcher not started' };
      return { success: true, friends: watcher.getFriends() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
