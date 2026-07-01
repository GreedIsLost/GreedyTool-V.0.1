const os = require('os');
const path = require('path');
const fs = require('fs-extra');

function getSteamPath(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;
  const platform = os.platform();
  const home = os.homedir();
  const candidates = {
    win32: ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\Steam', 'E:\\Steam'],
    linux: [path.join(home, '.steam', 'steam'), path.join(home, '.local', 'share', 'Steam'), '/usr/share/steam'],
    darwin: [path.join(home, 'Library', 'Application Support', 'Steam')],
  };
  const checks = candidates[platform] || [];
  for (const p of checks) {
    if (fs.existsSync(path.join(p, 'steamapps'))) return p;
  }
  return checks[0] || null;
}

function getSteamAppsPath(steamPath) {
  return steamPath ? path.join(steamPath, 'steamapps') : null;
}

function getDepotCachePath(steamPath) {
  return steamPath ? path.join(steamPath, 'depotcache') : null;
}

async function killSteam() {
  const { exec } = require('child_process');
  const cmd = os.platform() === 'win32' ? 'taskkill /F /IM steam.exe' : 'pkill -f "steam" 2>/dev/null; pkill -f "steam.sh" 2>/dev/null';
  return new Promise(r => exec(cmd, () => r()));
}

async function startSteam(steamPath) {
  const { exec } = require('child_process');
  const p = os.platform();
  return new Promise(r => {
    let cmd;
    if (p === 'win32') cmd = `"${path.join(steamPath, 'steam.exe')}" -silent`;
    else if (p === 'darwin') cmd = `open "${path.join(steamPath, 'Steam.app')}" --args -silent`;
    else cmd = `"${path.join(steamPath, 'steam.sh')}" -silent &`;
    exec(cmd, () => r());
  });
}

function generateAppManifest(appId) {
  return `"AppState"\n{\n\t"appid"\t\t"${appId}"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"greed_${appId}"\n\t"SizeOnDisk"\t\t"0"\n\t"StagingSize"\t\t"0"\n}`;
}

async function getImportedGames(steamAppsPath) {
  if (!steamAppsPath || !await fs.pathExists(steamAppsPath)) return [];
  const files = await fs.readdir(steamAppsPath);
  const games = [];
  for (const f of files) {
    const match = f.match(/^appmanifest_(\d+)\.acf$/);
    if (match) {
      const appId = parseInt(match[1]);
      const luaPath = path.join(steamAppsPath, `${appId}.lua`);
      const luaExists = await fs.pathExists(luaPath);
      games.push({
        appId,
        manifestFile: f,
        hasLua: luaExists,
        luaFile: luaExists ? `${appId}.lua` : null,
      });
    }
  }
  return games.sort((a, b) => b.appId - a.appId);
}

async function removeGame(appId, steamAppsPath) {
  let removed = false;
  const manifestPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`);
  if (await fs.pathExists(manifestPath)) {
    await fs.remove(manifestPath);
    removed = true;
  }
  const luaPath = path.join(steamAppsPath, `${appId}.lua`);
  if (await fs.pathExists(luaPath)) {
    await fs.remove(luaPath);
    removed = true;
  }
  return removed;
}

module.exports = {
  getSteamPath, getSteamAppsPath, getDepotCachePath,
  killSteam, startSteam, generateAppManifest,
  getImportedGames, removeGame,
};
