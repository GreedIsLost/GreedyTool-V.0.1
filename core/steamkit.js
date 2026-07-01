const axios = require('axios');

const STEAM_API = 'https://api.steampowered.com';

async function getProductInfo(appId) {
  try {
    const res = await axios.get(
      `${STEAM_API}/ISteamApps/GetAppBetas/v1/`,
      { params: { appid: appId }, timeout: 8000 }
    );
    return res.data;
  } catch (err) {
    console.error('SteamKit getProductInfo error:', err.message);
    return null;
  }
}

async function getDepotInfo(appId) {
  try {
    const res = await axios.get(
      `https://steamdb.info/app/${appId}/depots/`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000,
      }
    );
    const html = res.data;
    const depots = [];
    const depotRegex = /data-depot-id=["'](\d+)["']/g;
    const manifestRegex = /data-manifest-id=["'](\d+)["']/g;
    let m;
    while ((m = depotRegex.exec(html)) !== null) {
      depots.push({ depotId: parseInt(m[1]) });
    }
    let i = 0;
    while ((m = manifestRegex.exec(html)) !== null && i < depots.length) {
      if (depots[i]) depots[i].manifestId = parseInt(m[1]);
      i++;
    }
    if (depots.length > 0) return depots;
    const tableMatch = html.match(/<tr[^>]*data-depot-id=["'](\d+)["'][^>]*>[\s\S]*?<td[^>]*class="[^"]*depot-manifest[^"]*"[^>]*>(\d+)/);
    if (tableMatch) {
      return [{ depotId: parseInt(tableMatch[1]), manifestId: parseInt(tableMatch[2]) }];
    }
    const fallbackDepot = html.match(/depot[\/\\](\d+)/);
    const fallbackManifest = html.match(/manifest[\/\\](\d+)/);
    if (fallbackDepot) {
      return [{
        depotId: parseInt(fallbackDepot[1]),
        manifestId: fallbackManifest ? parseInt(fallbackManifest[1]) : Math.floor(Date.now() / 1000),
      }];
    }
    return null;
  } catch (err) {
    console.error('SteamKit getDepotInfo error:', err.message);
    return null;
  }
}

module.exports = { getProductInfo, getDepotInfo };
