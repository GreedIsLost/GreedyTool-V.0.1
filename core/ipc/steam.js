const { generateLua } = require('../lua');
const { processAppId, processBatch } = require('../manifest');
const { getAppDetails, searchGame } = require('../steamapi');
const history = require('../history');

function isValidAppId(id) {
  return Number.isInteger(id) && id > 0 && id < 2147483647;
}

function register(ipcMain) {
  ipcMain.handle('generate-lua', (_e, data) => {
    if (!data || typeof data !== 'object') return { success: false, error: 'Invalid data' };
    if (!isValidAppId(data.appId)) return { success: false, error: 'Invalid appId' };
    if (typeof data.title !== 'string') return { success: false, error: 'Invalid title' };
    try {
      return { success: true, lua: generateLua(data.appId, data.title, data.depots || []) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('process-app', async (_e, appId) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid appId' };
    try {
      const steamPath = await history.getSteamPath() || require('../utils').getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam not found. Set path in Settings.' };
      const depots = await processAppId(appId, steamPath);
      const appInfo = await getAppDetails(appId);
      const gameTitle = appInfo ? appInfo.name : `Game ${appId}`;
      await history.addHistory(appId, gameTitle);
      const lua = generateLua(appId, gameTitle, depots);
      return { success: true, depots, lua, title: gameTitle, appInfo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('process-batch', async (_e, appIds) => {
    if (!Array.isArray(appIds) || appIds.length === 0) return { success: false, error: 'No App IDs' };
    for (const id of appIds) {
      if (!isValidAppId(id)) return { success: false, error: `Invalid appId: ${id}` };
    }
    try {
      const steamPath = await history.getSteamPath() || require('../utils').getSteamPath();
      if (!steamPath) return { success: false, error: 'Steam not found.' };
      const all = await processBatch(appIds, steamPath);
      const results = {};
      const detailPromises = appIds.map(async (id) => {
        const depots = all[id] || [];
        const appInfo = await getAppDetails(id);
        const title = appInfo ? appInfo.name : `Game ${id}`;
        await history.addHistory(id, title);
        results[id] = { depots, lua: generateLua(id, title, depots), title, appInfo };
      });
      await Promise.allSettled(detailPromises);
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('search-game', async (_e, query) => {
    if (typeof query !== 'string' || !query.trim()) return { success: false, error: 'Invalid query' };
    try {
      const data = await searchGame(query);
      const items = (data && data.items) || [];
      return {
        success: true,
        results: items.slice(0, 15).map(i => ({
          appId: i.id,
          name: i.name,
          icon: i.steam_app_type === 'game'
            ? `https://cdn.steamstatic.com/steam/apps/${i.id}/header.jpg`
            : null,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-app-details', async (_e, appId) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid appId' };
    try {
      const info = await getAppDetails(appId);
      return { success: true, info };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
