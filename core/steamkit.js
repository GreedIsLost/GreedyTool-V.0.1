const axios = require('axios');

const STEAM_API = 'https://api.steampowered.com';
const STORE_API = 'https://store.steampowered.com/api';

async function getDepotInfoFromStoreApi(appId) {
  try {
    const res = await axios.get(`${STORE_API}/appdetails`, {
      params: { appids: appId, cc: 'US', l: 'en' },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = res.data;
    if (data && data[String(appId)] && data[String(appId)].success) {
      const appData = data[String(appId)].data;
      if (appData.depots) {
        const depots = [];
        for (const [depotIdStr, depotInfo] of Object.entries(appData.depots)) {
          const depotId = parseInt(depotIdStr);
          if (isNaN(depotId)) continue;
          depots.push({
            depotId,
            manifestId: depotInfo.manifest ? parseInt(depotInfo.manifest) : null,
          });
        }
        if (depots.length > 0) return depots;
      }
    }
  } catch (err) {
    console.error('Store API depot lookup failed:', err.message);
  }
  return null;
}

async function getDepotInfoFromSteamDb(appId) {
  try {
    const res = await axios.get(
      `https://steamdb.info/app/${appId}/depots/`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      }
    );
    const html = res.data;
    const depots = [];

    const tableRowRegex = /<tr[^>]*?data-depot-id[=:]["'](\d+)["'][^>]*?>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = tableRowRegex.exec(html)) !== null) {
      const depotId = parseInt(trMatch[1]);
      const rowHtml = trMatch[2];
      const manifestMatch = rowHtml.match(/data-manifest-id[=:]["'](\d+)["']/);
      const manifestId = manifestMatch ? parseInt(manifestMatch[1]) : null;
      depots.push({ depotId, manifestId });
    }

    if (depots.length > 0) return depots;

    const depotRegex = /data-depot-id[=:]["'](\d+)["']/g;
    const manifestRegex = /data-manifest-id[=:]["'](\d+)["']/g;
    let m;
    const depotIds = [];
    while ((m = depotRegex.exec(html)) !== null) {
      depotIds.push(parseInt(m[1]));
    }
    const manifestIds = [];
    while ((m = manifestRegex.exec(html)) !== null) {
      manifestIds.push(parseInt(m[1]));
    }
    for (let i = 0; i < depotIds.length; i++) {
      depots.push({
        depotId: depotIds[i],
        manifestId: manifestIds[i] || null,
      });
    }

    if (depots.length > 0) return depots;

    const appIdMatch = html.match(/appid[=:]["']?(\d+)/i);
    const manifestIdMatch = html.match(/manifestid[=:]["']?(\d+)/i);
    if (appIdMatch) {
      return [{
        depotId: appIdMatch[1] ? parseInt(appIdMatch[1]) : parseInt(appId),
        manifestId: manifestIdMatch ? parseInt(manifestIdMatch[1]) : null,
      }];
    }

    const fallbackDepot = html.match(/depot[\/\\](\d+)/);
    const fallbackManifest = html.match(/manifest[\/\\](\d+)/);
    if (fallbackDepot) {
      return [{
        depotId: parseInt(fallbackDepot[1]),
        manifestId: fallbackManifest ? parseInt(fallbackManifest[1]) : null,
      }];
    }

    return null;
  } catch (err) {
    console.error('SteamDB depot lookup failed:', err.message);
    return null;
  }
}

async function getCommonDepotPattern(appId) {
  const patterns = [appId, appId + 1];
  const unique = [...new Set(patterns)];
  return unique.map(depotId => ({
    depotId,
    manifestId: null,
  }));
}

async function getDepotInfo(appId) {
  let depots = await getDepotInfoFromStoreApi(appId);
  if (depots && depots.length > 0) {
    const hasManifestIds = depots.some(d => d.manifestId);
    if (hasManifestIds) return depots;
  }

  depots = await getDepotInfoFromSteamDb(appId);
  if (depots && depots.length > 0) return depots;

  return getCommonDepotPattern(appId);
}

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

module.exports = { getProductInfo, getDepotInfo };
