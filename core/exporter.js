const archiver = require('archiver');
const fs = require('fs-extra');
const path = require('path');
const { generateAppManifest } = require('./utils');

async function exportBackup(appId, luaContent, manifestPaths, outputDir) {
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
    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.append(luaContent, { name: `${appId}.lua` });

    for (const mp of existingManifests) {
      archive.file(mp, { name: path.basename(mp) });
    }

    archive.append(generateAppManifest(appId), { name: `appmanifest_${appId}.acf` });

    archive.finalize();
  });
}

module.exports = { exportBackup };
