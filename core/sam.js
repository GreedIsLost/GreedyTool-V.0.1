const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { getLatestReleaseUrl, downloadFile, extractZip } = require('./sam-download');

const EXE_NAME = 'SAM.Picker.exe';

function getSamDir() {
  if (process.resourcesPath && __dirname.includes('app.asar')) {
    return path.join(process.resourcesPath, 'sam');
  }
  return path.join(__dirname, '..', 'sam');
}

function getLocalSamPath() {
  return path.join(getSamDir(), EXE_NAME);
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
  const local = getLocalSamPath();
  if (await fs.pathExists(local)) return local;
  for (const p of findCommonPaths()) {
    if (await fs.pathExists(p)) return p;
  }
  return null;
}

async function launchSam(exePath, appId) {
  const { spawn } = require('child_process');
  const args = appId ? [String(appId).replace(/[^0-9]/g, '')] : [];
  return new Promise((resolve, reject) => {
    const proc = spawn(exePath, args, { stdio: 'ignore', detached: true });
    proc.on('error', reject);
    proc.on('spawn', () => resolve());
    proc.unref();
  });
}

async function downloadSam() {
  const samDir = getSamDir();
  const exePath = path.join(samDir, EXE_NAME);

  if (await fs.pathExists(exePath)) {
    return { success: true, path: exePath, message: 'Already installed' };
  }

  await fs.ensureDir(samDir);

  const url = await getLatestReleaseUrl();
  if (!url) {
    return { success: false, error: 'Could not find SAM download URL' };
  }

  const zipPath = path.join(samDir, 'sam.zip');
  await downloadFile(url, zipPath);
  extractZip(zipPath, samDir, EXE_NAME);
  await fs.unlink(zipPath);

  if (await fs.pathExists(exePath)) {
    return { success: true, path: exePath, message: 'Downloaded to project' };
  }

  return { success: false, error: 'Extraction succeeded but executable not found' };
}

module.exports = { detectSam, launchSam, downloadSam, getLocalSamPath };
