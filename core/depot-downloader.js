const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { decodeManifest } = require('./protobuf');

const CDN_URLS = [
  (depotId, shaHex) => `https://cdn.cloudflare.steamstatic.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://cdn.steamstatic.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-1.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-2.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-3.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-4.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-5.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-6.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-7.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
  (depotId, shaHex) => `https://content-8.steampowered.com/depot/${depotId}/chunk/${shaHex}`,
];

const KNOWN_DEPOT_KEYS = {};
const CHUNK_CONCURRENCY = 6;
const REQUEST_TIMEOUT = 30000;

function aes256ecbDecrypt(encrypted, key) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    return encrypted;
  }
}

async function fetchDepotKeyFromSteamDb(depotId) {
  try {
    const res = await axios.get(`https://steamdb.info/depot/${depotId}/`, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const m1 = res.data.match(/DepotKey[^>]*>([^<]+)</);
    if (m1) return m1[1].trim();
    const m2 = res.data.match(/depot_key[=:]["']([a-fA-F0-9]{32,64})["']/);
    if (m2) return m2[1].toLowerCase();
    const m3 = res.data.match(/[^a-fA-F0-9]([a-fA-F0-9]{64})[^a-fA-F0-9]/);
    if (m3) return m3[1].toLowerCase();
  } catch {}
  return null;
}

async function resolveDepotKey(depotId) {
  if (KNOWN_DEPOT_KEYS[depotId]) return KNOWN_DEPOT_KEYS[depotId];
  const key = await fetchDepotKeyFromSteamDb(depotId);
  if (key) KNOWN_DEPOT_KEYS[depotId] = key;
  return key || null;
}

function setDepotKey(depotId, keyHex) {
  KNOWN_DEPOT_KEYS[depotId] = keyHex.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function rawChunkPath(cacheDir, shaHex) {
  return path.join(cacheDir, 'raw', shaHex + '.chunk');
}

function cleanChunkPath(cacheDir, shaHex) {
  return path.join(cacheDir, 'clean', shaHex + '.chunk');
}

async function downloadRawChunk(depotId, shaHex, rawDir) {
  const outPath = rawChunkPath(rawDir, shaHex);
  if (await fs.pathExists(outPath)) return outPath;

  for (const buildUrl of CDN_URLS) {
    const url = buildUrl(depotId, shaHex);
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: REQUEST_TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        validateStatus: s => s === 200,
      });
      await fs.ensureDir(rawDir);
      await fs.writeFile(outPath, Buffer.from(res.data));
      return outPath;
    } catch {}
  }
  return null;
}

async function getProcessedChunk(depotId, shaHex, cacheDir, keyBin, compressedLength, uncompressedLength) {
  const cleanPath = cleanChunkPath(cacheDir, shaHex);
  if (await fs.pathExists(cleanPath)) {
    const data = await fs.readFile(cleanPath);
    return { data, fromCache: true };
  }

  const rawDir = path.join(cacheDir, 'raw');
  const rawPath = await downloadRawChunk(depotId, shaHex, rawDir);
  if (!rawPath) return null;

  let data = await fs.readFile(rawPath);
  if (keyBin) data = aes256ecbDecrypt(data, keyBin);

  const expectedSha = crypto.createHash('sha1').update(data).digest('hex');
  if (expectedSha !== shaHex) {
    await fs.remove(rawPath).catch(() => {});
    return null;
  }

  if (compressedLength && uncompressedLength && compressedLength !== uncompressedLength) {
    try {
      data = zlib.inflateSync(data);
    } catch {
      try { data = zlib.unzipSync(data); } catch {}
    }
  }

  await fs.ensureDir(path.dirname(cleanPath));
  await fs.writeFile(cleanPath, data);
  return { data, fromCache: false };
}

async function downloadChunksBulk(depotId, chunkEntries, cacheDir, depotKey, onChunkProgress) {
  const keyBin = depotKey ? Buffer.from(depotKey.substring(0, 64), 'hex') : null;
  if (keyBin && keyBin.length !== 32) return { ok: [], failed: [] };

  const results = { ok: [], failed: [] };
  const queue = [...chunkEntries];
  let active = 0;
  let nextIdx = 0;

  return new Promise(resolve => {
    function startNext() {
      while (active < CHUNK_CONCURRENCY && nextIdx < queue.length) {
        const job = queue[nextIdx++];
        active++;
        processJob(job);
      }
      if (active === 0) resolve(results);
    }

    async function processJob(entry) {
      try {
        const processed = await getProcessedChunk(depotId, entry.shaHex, cacheDir, keyBin, entry.compressedLength, entry.uncompressedLength);
        if (!processed) {
          results.failed.push(entry);
          active--;
          if (onChunkProgress) onChunkProgress(entry.shaHex, false);
          startNext();
          return;
        }
        results.ok.push({ shaHex: entry.shaHex, data: processed.data, size: processed.data.length });
        active--;
        if (onChunkProgress) onChunkProgress(entry.shaHex, true);
        startNext();
      } catch {
        results.failed.push(entry);
        active--;
        if (onChunkProgress) onChunkProgress(entry.shaHex, false);
        startNext();
      }
    }

    startNext();
  });
}

function buildFileTree(decoded) {
  if (!decoded || decoded.error) return { tree: {}, files: [], totalSize: 0, chunks: [] };

  const chunkMap = new Map();
  for (let i = 0; i < (decoded.chunks || []).length; i++) {
    const c = decoded.chunks[i];
    const shaHex = (c.sha || '').toLowerCase();
    chunkMap.set(i, {
      index: i,
      shaHex,
      compressedLength: c.compressed_length || 0,
      uncompressedLength: c.uncompressed_length || 0,
    });
  }

  const files = (decoded.files || []).map(f => {
    const chunkIndices = f.chunk_offsets || [];
    const fileChunks = chunkIndices.map(idx => chunkMap.get(idx)).filter(Boolean);
    return {
      name: f.filename || 'unknown',
      path: f.filename || 'unknown',
      size: f.size || 0,
      flags: f.flags || 0,
      chunks: fileChunks,
      shaContent: (f.sha_content || '').toLowerCase(),
    };
  });

  const tree = {};
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { _dir: true };
      node = node[parts[i]];
    }
    const fileName = parts[parts.length - 1] || f.path;
    node[fileName] = { _file: f };
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const allChunks = [];
  const seenSha = new Set();
  for (const f of files) {
    for (const c of f.chunks) {
      if (!seenSha.has(c.shaHex)) {
        seenSha.add(c.shaHex);
        allChunks.push(c);
      }
    }
  }

  return { tree, files, totalSize, totalFiles: files.length, totalChunks: allChunks.length, allChunks };
}

function flattenTree(tree, prefix = '') {
  const results = [];
  const keys = Object.keys(tree).sort((a, b) => {
    const aDir = tree[a]._dir;
    const bDir = tree[b]._dir;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const node = tree[key];
    if (node._dir) {
      results.push({ type: 'dir', name: key, path: prefix + key, children: flattenTree(node, prefix + key + '/') });
    } else if (node._file) {
      const f = node._file;
      results.push({
        type: 'file', name: key, path: f.path, size: f.size, flags: f.flags,
        chunks: f.chunks, shaContent: f.shaContent,
      });
    }
  }
  return results;
}

async function getManifestFileTree(filePath) {
  try {
    const data = await fs.readFile(filePath);
    const decoded = await decodeManifest(data);
    const { tree, files, totalSize, totalFiles, totalChunks } = buildFileTree(decoded);
    const entries = flattenTree(tree);
    return { success: true, totalSize, totalFiles, totalChunks, entries };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function downloadSelectedFiles(manifestPath, depotId, selectedPaths, outputDir, depotKey, onProgress) {
  const data = await fs.readFile(manifestPath);
  const decoded = await decodeManifest(data);
  if (decoded.error) return { success: false, error: decoded.error };

  const { files, allChunks } = buildFileTree(decoded);
  const filesToDownload = files.filter(f => selectedPaths.some(sp => f.path === sp || f.path.startsWith(sp + '/')));
  if (filesToDownload.length === 0) return { success: false, error: 'No matching files found' };

  if (!depotKey) depotKey = await resolveDepotKey(depotId);

  const chunkDir = path.join(outputDir, '.greed-chunks-' + crypto.randomUUID().slice(0, 8));

  const neededChunks = [];
  const neededShaSet = new Set();
  for (const f of filesToDownload) {
    for (const c of f.chunks) {
      if (!neededShaSet.has(c.shaHex)) {
        neededShaSet.add(c.shaHex);
        neededChunks.push(c);
      }
    }
  }

  const totalFiles = filesToDownload.length;
  if (onProgress) onProgress({ type: 'meta', totalFiles, totalChunks: neededChunks.length, totalBytes: filesToDownload.reduce((s, f) => s + f.size, 0) });

  const dlResult = await downloadChunksBulk(depotId, neededChunks, chunkDir, depotKey, (shaHex, ok) => {
    if (onProgress) onProgress({ type: 'chunk', shaHex, ok });
  });

  const chunkDataMap = new Map();
  for (const ok of dlResult.ok) chunkDataMap.set(ok.shaHex, ok.data);

  let completedFiles = 0;
  let totalWritten = 0;
  let partialFiles = [];

  for (const file of filesToDownload) {
    const fileOutPath = path.join(outputDir, file.path);
    await fs.ensureDir(path.dirname(fileOutPath));

    if (file.chunks.length === 0) {
      await fs.writeFile(fileOutPath, Buffer.alloc(0));
      completedFiles++;
      if (onProgress) onProgress({ type: 'file', file: file.path, completed: completedFiles, total: totalFiles, bytes: 0, ok: true });
      continue;
    }

    const pieces = [];
    let fileOk = true;
    for (const c of file.chunks) {
      const chunkData = chunkDataMap.get(c.shaHex);
      if (chunkData) {
        pieces.push(chunkData);
      } else {
        fileOk = false;
        break;
      }
    }

    if (fileOk) {
      const fileData = Buffer.concat(pieces);
      const trimmed = fileData.slice(0, Math.min(file.size, fileData.length));
      await fs.writeFile(fileOutPath, trimmed);
      totalWritten += trimmed.length;
      completedFiles++;
      if (onProgress) onProgress({ type: 'file', file: file.path, completed: completedFiles, total: totalFiles, bytes: trimmed.length, ok: true });
    } else {
      partialFiles.push(file.path);
      completedFiles++;
      if (onProgress) onProgress({ type: 'file', file: file.path, completed: completedFiles, total: totalFiles, bytes: 0, ok: false });
    }
  }

  await fs.remove(chunkDir).catch(() => {});

  const completedOk = completedFiles - partialFiles.length;

  if (partialFiles.length > 0) {
    return {
      success: true, partial: true,
      totalFiles, completedFiles, completedOk, totalBytes: totalWritten,
      failedChunks: dlResult.failed.map(c => c.shaHex),
      missingChunks: dlResult.failed.length,
      message: `Downloaded ${completedOk}/${totalFiles} files (${partialFiles.length} incomplete). ${dlResult.failed.length} chunks missing.`,
    };
  }

  return { success: true, totalFiles, completedFiles, completedOk, totalBytes: totalWritten };
}

module.exports = { getManifestFileTree, downloadSelectedFiles, resolveDepotKey, setDepotKey };
