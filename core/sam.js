const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { execSync, exec } = require('child_process');

const SAM_DIR = path.join(__dirname, '..', 'sam');
const EXE_NAME = process.platform === 'win32' ? 'SAM.Picker.exe' : 'SAM.Picker';
const EXE_PATH = path.join(SAM_DIR, EXE_NAME);

function getLocalSamPath() {
  return EXE_PATH;
}

function findCommonPaths() {
  const home = require('os').homedir();
  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'SAM', 'SAM.Picker.exe'),
      path.join(process.env.PROGRAMFILES_X86 || 'C:\\Program Files (x86)', 'SAM', 'SAM.Picker.exe'),
      path.join(home, 'Downloads', 'SAM.Picker.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/SAM.app/Contents/MacOS/SAM.Picker',
      path.join(home, 'Applications', 'SAM.app', 'Contents', 'MacOS', 'SAM.Picker'),
      path.join(home, 'Downloads', 'SAM.Picker'),
    );
  } else {
    candidates.push(
      '/usr/local/bin/sam',
      '/usr/bin/sam',
      path.join(home, '.local', 'bin', 'sam'),
      path.join(home, 'Downloads', 'SAM.Picker'),
    );
  }
  return candidates;
}

async function detectSam() {
  if (await fs.pathExists(EXE_PATH)) return EXE_PATH;
  for (const p of findCommonPaths()) {
    if (await fs.pathExists(p)) return p;
  }
  return null;
}

async function launchSam(exePath, appId) {
  const args = appId ? [String(appId)] : [];
  return new Promise((resolve, reject) => {
    const proc = exec(`"${exePath}" ${args.join(' ')}`, (err) => {
      if (err && err.code !== 0 && err.code !== null) reject(err);
      else resolve();
    });
    proc.unref();
  });
}

async function getLatestReleaseUrl() {
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

async function downloadSam() {
  if (await fs.pathExists(EXE_PATH)) {
    return { success: true, path: EXE_PATH, message: 'Already installed' };
  }

  await fs.ensureDir(SAM_DIR);

  const url = await getLatestReleaseUrl();
  if (!url) {
    return { success: false, error: 'Could not find SAM download URL' };
  }

  const zipPath = path.join(SAM_DIR, 'sam.zip');
  await downloadFile(url, zipPath);

  const entryName = 'SAM.Picker.exe';
  extractZip(zipPath, SAM_DIR, entryName);
  await fs.unlink(zipPath);

  const exeName = process.platform === 'win32' ? 'SAM.Picker.exe' : 'SAM.Picker';
  const exePath = path.join(SAM_DIR, exeName);
  if (await fs.pathExists(exePath)) {
    return { success: true, path: exePath, message: 'Downloaded to project' };
  }

  return { success: false, error: 'Extraction succeeded but executable not found' };
}

module.exports = { detectSam, launchSam, downloadSam, getLocalSamPath };
