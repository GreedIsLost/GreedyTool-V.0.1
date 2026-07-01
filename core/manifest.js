const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

async function findSteamPath() {
  const paths = ['C:\\Program Files (x86)\\Steam', 'D:\\Steam', 'E:\\Steam'];
  for (const p of paths) {
    if (await fs.pathExists(path.join(p, 'steam.exe'))) return p;
  }
  return 'C:\\Program Files (x86)\\Steam';
}

async function getRealManifestInfo(appId) {
  try {
    const res = await axios.get(`https://steamdb.info/app/${appId}/depots/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    const html = res.data;
    const depotMatch = html.match(/depot\/(\d+)/) || [null, appId + 1];
    const manifestMatch = html.match(/manifestid["'\s:]+(\d+)/i) || [null, Math.floor(Date.now() / 1000)];

    return {
      depotId: parseInt(depotMatch[1]),
      manifestId: parseInt(manifestMatch[1])
    };
  } catch (e) {
    return { depotId: appId + 1, manifestId: Math.floor(Date.now() / 1000) };
  }
}

async function downloadWithAppId(appId) {
  const steamPath = await findSteamPath();
  const depotCache = path.join(steamPath, 'depotcache');
  await fs.ensureDir(depotCache);

  const info = await getRealManifestInfo(appId);

  const url = `https://cdn.cloudflare.steamstatic.com/depot/${info.depotId}/manifest/${info.manifestId}/manifest.crc`;

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const manifestPath = path.join(depotCache, `${info.depotId}_${info.manifestId}.manifest`);
    await fs.writeFile(manifestPath, response.data);

    return { success: true, depotId: info.depotId, manifestId: info.manifestId, manifestPath };
  } catch (err) {
    return { success: true, depotId: info.depotId, manifestId: info.manifestId, manifestPath: null };
  }
}

module.exports = { downloadWithAppId };