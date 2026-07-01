const axios = require('axios');
const { app } = require('electron');

const REPO = 'kali/GreedyTool';

async function checkForUpdate(currentVersion) {
  try {
    const res = await axios.get(`https://api.github.com/repos/${REPO}/releases/latest`, {
      timeout: 8000,
      headers: { 'User-Agent': 'greed-updater', 'Accept': 'application/vnd.github.v3+json' },
    });
    const latest = res.data.tag_name || res.data.name || '';
    const latestVersion = latest.replace(/^v/, '');
    const hasUpdate = latestVersion !== currentVersion && latestVersion !== '';
    return {
      hasUpdate,
      latestVersion,
      currentVersion,
      url: res.data.html_url,
      body: res.data.body ? res.data.body.split('\n').slice(0, 5).join('\n') : '',
    };
  } catch (err) {
    console.error('Updater check error:', err.message);
    return { hasUpdate: false, latestVersion: '', currentVersion, url: '' };
  }
}

module.exports = { checkForUpdate };
