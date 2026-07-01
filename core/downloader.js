const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { getCachedManifest, setCachedManifest } = require('./cache');

const CDN_URLS = [
  id => `https://cdn.cloudflare.steamstatic.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://cdn.steamstatic.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://cdn.cloudflare.steamstatic.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest.crc`,
  id => `https://cdn.steamstatic.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest.crc`,
  id => `https://content-1.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-2.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-3.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-4.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-5.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-6.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-7.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
  id => `https://content-8.steampowered.com/depot/${id.depotId}/manifest/${id.manifestId}/manifest`,
];

async function downloadFile(url, outputPath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
    },
  });
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, response.data);
  return outputPath;
}

async function downloadManifest(depotId, manifestId, depotCachePath) {
  const id = { depotId, manifestId };
  const filename = `${depotId}_${manifestId}.manifest`;
  const outputPath = path.join(depotCachePath, filename);

  const cached = await getCachedManifest(depotId, manifestId);
  if (cached.cached) {
    return { success: true, path: outputPath, cached: true };
  }

  for (const buildUrl of CDN_URLS) {
    const url = buildUrl(id);
    try {
      console.log(`Trying: ${url}`);
      const dlPath = await downloadFile(url, outputPath);
      const data = await fs.readFile(dlPath);
      await setCachedManifest(depotId, manifestId, data);
      return { success: true, path: dlPath, cached: false };
    } catch (err) {
      console.error(`Download failed for ${url}:`, err.message);
    }
  }

  if (cached.data) {
    const fallbackPath = path.join(depotCachePath, filename);
    await fs.writeFile(fallbackPath, cached.data);
    return { success: true, path: fallbackPath, cached: true };
  }

  return { success: false, path: null };
}

module.exports = { downloadFile, downloadManifest };
