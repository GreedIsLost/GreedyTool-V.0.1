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
  const p = os.platform();
  let cmd;
  if (p === 'win32') {
    cmd = 'taskkill /F /IM steam.exe 2>nul';
  } else {
    cmd = 'pkill -x -e steam 2>/dev/null; pkill -x -e steam.sh 2>/dev/null; pkill -x -e "steam-runtime" 2>/dev/null; pkill -f "steam-native" 2>/dev/null';
  }
  return new Promise(r => exec(cmd, () => r()));
}

async function startSteam(steamPath) {
  if (!steamPath) return;
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

function generateAppManifest(appId, depots = []) {
  const buildId = Math.floor(Date.now() / 100);
  let acf = `"AppState"\n{\n`;
  acf += `\t"appid"\t\t"${appId}"\n`;
  acf += `\t"Universe"\t\t"1"\n`;
  acf += `\t"installdir"\t\t"greed_${appId}"\n`;
  acf += `\t"StateFlags"\t\t"4"\n`;
  acf += `\t"buildid"\t\t"${buildId}"\n`;
  acf += `\t"InstalledDepots"\n\t{\n`;
  for (const d of depots) {
    const mid = d.manifestId || Math.floor(Date.now() / 1000);
    acf += `\t\t"${d.depotId}"\n\t\t{\n`;
    acf += `\t\t\t"manifestid"\t\t"${mid}"\n`;
    acf += `\t\t\t"size"\t\t"0"\n`;
    acf += `\t\t}\n`;
  }
  acf += `\t}\n`;
  acf += `\t"UserConfig"\n\t{\n\t}\n`;
  acf += `\t"MountedConfig"\n\t{\n\t}\n`;
  acf += `}`;
  return acf;
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

async function getInstalledGames(steamPath) {
  const steamAppsPath = getSteamAppsPath(steamPath);
  if (!steamAppsPath || !await fs.pathExists(steamAppsPath)) return [];

  const parseAcfName = async (filePath) => {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const m = raw.match(/"name"\t\t"([^"]+)"/);
      return m ? m[1] : null;
    } catch { return null; }
  };

  const libraryFoldersPath = path.join(steamAppsPath, 'libraryfolders.vdf');
  const folders = [steamAppsPath];

  if (await fs.pathExists(libraryFoldersPath)) {
    try {
      const raw = await fs.readFile(libraryFoldersPath, 'utf8');
      const re = /"path"\t\t"([^"]+)"/g;
      let m;
      while ((m = re.exec(raw)) !== null) {
        const libPath = path.join(m[1], 'steamapps');
        if (libPath !== steamAppsPath && await fs.pathExists(libPath)) {
          folders.push(libPath);
        }
      }
    } catch {}
  }

  const games = [];
  const seen = new Set();
  for (const folder of folders) {
    let files;
    try { files = await fs.readdir(folder); } catch { continue; }
    for (const f of files) {
      const match = f.match(/^appmanifest_(\d+)\.acf$/);
      if (match) {
        const appId = parseInt(match[1]);
        if (seen.has(appId)) continue;
        seen.add(appId);
        const acfPath = path.join(folder, f);
        const name = await parseAcfName(acfPath);
        games.push({ appId, name: name || `App ${appId}`, acfPath });
      }
    }
  }
  return games.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
  const installDir = path.join(steamAppsPath, 'common', `greed_${appId}`);
  if (await fs.pathExists(installDir)) {
    await fs.remove(installDir);
  }
  return removed;
}

module.exports = {
  getSteamPath, getSteamAppsPath, getDepotCachePath,
  killSteam, startSteam, generateAppManifest,
  getImportedGames, getInstalledGames, removeGame,
};
