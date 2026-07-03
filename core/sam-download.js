const https = require('https');
const { execSync } = require('child_process');

const USER_AGENT = 'GreedyTool/2.0';

async function getLatestReleaseUrl() {
  return new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/gibbed/SteamAchievementManager/releases/latest', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('error', reject);
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

function downloadFile(url, dest, redirects = 5) {
  if (redirects <= 0) throw new Error('Too many redirects');
  const fs = require('fs-extra');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
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
      res.on('error', (err) => {
        file.close();
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
      file.on('finish', () => file.close(err => err ? reject(err) : resolve(dest)));
      file.on('error', (err) => {
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(dest).catch(() => {});
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir, entryName) {
  if (process.platform === 'win32') {
    const { spawnSync } = require('child_process');
    const result = spawnSync('powershell', [
      '-command', `& { Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force }`
    ], { stdio: 'pipe', timeout: 60000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`PowerShell exit code ${result.status}: ${result.stderr?.toString() || 'unknown'}`);
  } else {
    const { spawnSync } = require('child_process');
    const result = spawnSync('unzip', ['-o', '-j', zipPath, entryName, '-d', destDir], {
      stdio: 'pipe', timeout: 60000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`unzip exit code ${result.status}: ${result.stderr?.toString() || 'unknown'}`);
  }
}

module.exports = { getLatestReleaseUrl, downloadFile, extractZip };
