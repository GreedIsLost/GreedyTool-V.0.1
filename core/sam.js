const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

function findCommonPaths() {
  const platform = process.platform;
  const home = require('os').homedir();
  const candidates = [];

  if (platform === 'win32') {
    candidates.push(
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'SAM', 'SAM.Picker.exe'),
      path.join(process.env.PROGRAMFILES_X86 || 'C:\\Program Files (x86)', 'SAM', 'SAM.Picker.exe'),
      path.join(home, 'Downloads', 'SAM.Picker.exe'),
    );
  } else if (platform === 'darwin') {
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

async function downloadSam() {
  return {
    url: 'https://github.com/gibbed/SteamAchievementManager/releases/latest',
  };
}

module.exports = { detectSam, launchSam, downloadSam };
