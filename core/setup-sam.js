const https = require('https');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const SAM_DIR = path.join(__dirname, '..', 'sam');
const EXE_NAME = 'SAM.Picker.exe';
const EXE_PATH = path.join(SAM_DIR, EXE_NAME);

async function getDownloadUrl() {
  return new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/gibbed/SteamAchievementManager/releases/latest', {
      headers: { 'User-Agent': 'GreedyTool/2.0', Accept: 'application/vnd.github+json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const zip = release.assets.find(a => a.name.endsWith('.zip'));
          resolve(zip ? zip.browser_download_url : null);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function downloadFile(url, dest, redirects = 5) {
  if (redirects <= 0) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'GreedyTool/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest).catch(() => {});
        return resolve(downloadFile(res.headers.location, dest, redirects - 1));
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest).catch(() => {});
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir, entryName) {
  if (process.platform === 'win32') {
    execSync(
      `powershell -command "& { Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force }"`,
      { stdio: 'pipe', timeout: 60000 }
    );
  } else {
    execSync(`unzip -o -j "${zipPath}" "${entryName}" -d "${destDir}"`, {
      stdio: 'pipe', timeout: 60000,
    });
  }
}

async function main() {
  if (await fs.pathExists(EXE_PATH)) {
    console.log('SAM.Picker.exe already present, skipping.');
    return;
  }

  await fs.ensureDir(SAM_DIR);

  console.log('Fetching latest SAM release info...');
  const url = await getDownloadUrl();
  if (!url) {
    console.error('Could not find SAM download URL.');
    console.error('Download manually from https://github.com/gibbed/SteamAchievementManager/releases');
    return;
  }

  console.log(`Downloading SAM from ${url}...`);
  const zipPath = path.join(SAM_DIR, 'sam.zip');
  await downloadFile(url, zipPath);

  console.log('Extracting SAM.Picker.exe...');
  extractZip(zipPath, SAM_DIR, EXE_NAME);

  await fs.unlink(zipPath);
  console.log(`SAM installed at ${EXE_PATH}`);
}

main().catch(err => {
  console.error('SAM setup failed:', err.message);
  console.log('Download manually from https://github.com/gibbed/SteamAchievementManager/releases');
});
