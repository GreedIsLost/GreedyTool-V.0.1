const fs = require('fs-extra');
const path = require('path');
const { getLatestReleaseUrl, downloadFile, extractZip } = require('./sam-download');

const SAM_DIR = path.join(__dirname, '..', 'sam');
const EXE_NAME = 'SAM.Picker.exe';
const EXE_PATH = path.join(SAM_DIR, EXE_NAME);

async function main() {
  if (await fs.pathExists(EXE_PATH)) {
    console.log('SAM.Picker.exe already present, skipping.');
    return;
  }

  await fs.ensureDir(SAM_DIR);

  console.log('Fetching latest SAM release info...');
  const url = await getLatestReleaseUrl();
  if (!url) {
    console.error('Could not find SAM download URL.');
    console.error('Download manually from https://github.com/gibbed/SteamAchievementManager/releases');
    return;
  }

  console.log('Downloading SAM...');
  const zipPath = path.join(SAM_DIR, 'sam.zip');
  await downloadFile(url, zipPath);

  console.log('Extracting SAM.Picker.exe...');
  extractZip(zipPath, SAM_DIR, EXE_NAME);

  await fs.unlink(zipPath);
  console.log('SAM installed at ' + EXE_PATH);
}

main().catch(err => {
  console.error('SAM setup failed:', err.message);
  console.log('Download manually from https://github.com/gibbed/SteamAchievementManager/releases');
});
