const archiver = require('archiver');
const fs = require('fs-extra');
const path = require('path');
const { generateAppManifest } = require('./utils');

async function exportBackup(appId, luaContent, manifestPaths, outputDir, depots = []) {
  const filename = `greed_backup_${appId}_${Date.now()}.zip`;
  const outputPath = path.join(outputDir, filename);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const existingManifests = [];
  if (manifestPaths && manifestPaths.length > 0) {
    for (const mp of manifestPaths) {
      if (mp && await fs.pathExists(mp)) {
        existingManifests.push(mp);
      }
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      archive.abort();
      reject(new Error('Archive timed out'));
    }, 30000);
    function done(err, result) {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    }
    output.on('close', () => done(null, outputPath));
    output.on('error', (err) => done(err));
    archive.on('error', (err) => done(err));

    archive.pipe(output);
    archive.append(luaContent, { name: `${appId}.lua` });

    for (const mp of existingManifests) {
      archive.file(mp, { name: path.basename(mp) });
    }

    archive.append(generateAppManifest(appId, depots), { name: `appmanifest_${appId}.acf` });

    archive.finalize();
  });
}

module.exports = { exportBackup };
