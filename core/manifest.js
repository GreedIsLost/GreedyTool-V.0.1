const { getDepotCachePath } = require('./utils');
const { getDepotInfo } = require('./steamkit');
const { downloadManifest } = require('./downloader');
const { getCached, setCache } = require('./cache');

async function processAppId(appId, steamPath) {
  const cacheKey = `depots_${appId}.json`;
  let depots = await getCached(cacheKey);

  if (!depots) {
    depots = await getDepotInfo(appId);
    if (depots && depots.length > 0) await setCache(cacheKey, depots);
  }

  if (!depots || depots.length === 0) {
    depots = [{ depotId: appId, manifestId: Math.floor(Date.now() / 1000) }];
  }

  const depotCachePath = getDepotCachePath(steamPath);
  const results = [];
  for (const depot of depots) {
    const dl = await downloadManifest(depot.depotId, depot.manifestId, depotCachePath);
    results.push({
      depotId: depot.depotId,
      manifestId: depot.manifestId,
      downloaded: dl.success,
      path: dl.path,
      cached: dl.cached || false,
    });
  }
  return results;
}

async function processBatch(appIds, steamPath, concurrency = 3) {
  const results = {};
  const queue = [...appIds];
  async function worker() {
    while (queue.length > 0) {
      const appId = queue.shift();
      try {
        results[appId] = await processAppId(appId, steamPath);
      } catch (err) {
        console.error(`processBatch error for ${appId}:`, err);
        results[appId] = [];
      }
    }
  }
  const workers = Array(Math.min(concurrency, appIds.length)).fill().map(() => worker());
  await Promise.allSettled(workers);
  return results;
}

module.exports = { processAppId, processBatch };
