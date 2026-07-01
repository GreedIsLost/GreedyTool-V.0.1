const fs = require('fs-extra');
const path = require('path');

const CACHE_DIR = 'greed-cache';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

function getCacheDir() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), CACHE_DIR);
}

async function ensureCacheDir() {
  const dir = getCacheDir();
  await fs.ensureDir(dir);
  await fs.ensureDir(path.join(dir, 'manifests'));
  await fs.ensureDir(path.join(dir, 'depots'));
  return dir;
}

function cacheKey(prefix, id) {
  return prefix + '_' + id + '.json';
}

async function getCached(key) {
  try {
    const dir = getCacheDir();
    const filePath = path.join(dir, key);
    if (!await fs.pathExists(filePath)) return null;
    const stat = await fs.stat(filePath);
    if (Date.now() - stat.mtimeMs > CACHE_MAX_AGE) {
      await fs.remove(filePath).catch(() => {});
      return null;
    }
    return await fs.readJson(filePath);
  } catch (err) {
    console.error('Cache getCached error:', err);
    return null;
  }
}

async function setCache(key, data) {
  try {
    const dir = getCacheDir();
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, key), data);
  } catch (err) {
    console.error('Cache setCache error:', err);
  }
}

async function getCachedManifest(depotId, manifestId) {
  const dir = getCacheDir();
  const filePath = path.join(dir, 'manifests', `${depotId}_${manifestId}.manifest`);
  try {
    if (await fs.pathExists(filePath)) {
      const data = await fs.readFile(filePath);
      return { cached: true, data, path: filePath };
    }
  } catch (err) {
    console.error('Cache getCachedManifest error:', err);
  }
  return { cached: false, data: null, path: null };
}

async function setCachedManifest(depotId, manifestId, buffer) {
  try {
    const dir = getCacheDir();
    const sub = path.join(dir, 'manifests');
    await fs.ensureDir(sub);
    const filePath = path.join(sub, `${depotId}_${manifestId}.manifest`);
    await fs.writeFile(filePath, buffer);
  } catch (err) {
    console.error('Cache setCachedManifest error:', err);
  }
}

async function clearCache() {
  const dir = getCacheDir();
  await fs.remove(dir).catch(err => console.error('Cache clear error:', err));
  await ensureCacheDir();
}

async function getCacheStats() {
  const dir = getCacheDir();
  const manifestDir = path.join(dir, 'manifests');
  let manifestCount = 0;
  let size = 0;
  try {
    if (await fs.pathExists(manifestDir)) {
      const files = await fs.readdir(manifestDir);
      manifestCount = files.length;
      for (const f of files) {
        const stat = await fs.stat(path.join(manifestDir, f));
        size += stat.size;
      }
    }
  } catch (err) {
    console.error('Cache getCacheStats error:', err);
  }
  return { manifestCount, sizeBytes: size };
}

module.exports = {
  getCached, setCache, getCachedManifest, setCachedManifest,
  clearCache, getCacheStats, ensureCacheDir,
};
