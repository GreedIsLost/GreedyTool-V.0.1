const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { getCachedManifest, setCachedManifest } = require('./cache');

async function downloadFile(url, outputPath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, response.data);
  return outputPath;
}

async function downloadManifest(depotId, manifestId, depotCachePath) {
  const urls = [
    `https://cdn.cloudflare.steamstatic.com/depot/${depotId}/manifest/${manifestId}/manifest.crc`,
    `https://cdn.steamstatic.com/depot/${depotId}/manifest/${manifestId}/manifest.crc`,
  ];

  const filename = `${depotId}_${manifestId}.manifest`;
  const outputPath = path.join(depotCachePath, filename);

  const cached = await getCachedManifest(depotId, manifestId);
  if (cached.cached) {
    return { success: true, path: outputPath, cached: true };
  }

  for (const url of urls) {
    try {
      const dlPath = await downloadFile(url, outputPath);
      const data = await fs.readFile(dlPath);
      await setCachedManifest(depotId, manifestId, data);
      return { success: true, path: dlPath, cached: false };
    } catch (err) {
      console.error(`Download failed for ${url}:`, err.message);
      continue;
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
