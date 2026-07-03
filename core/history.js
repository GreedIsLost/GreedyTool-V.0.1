const fs = require('fs-extra');
const path = require('path');

const HISTORY_FILE = 'greed-history.json';

function getStoragePath() {
  let userDataPath;
  try {
    const { app } = require('electron');
    userDataPath = app.getPath('userData');
  } catch {
    userDataPath = path.join(__dirname, '..');
  }
  return path.join(userDataPath, HISTORY_FILE);
}

let cache = null;
let saveQueue = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    const p = getStoragePath();
    if (await fs.pathExists(p)) {
      cache = await fs.readJson(p);
    } else {
      cache = { history: [], steamPath: null };
    }
  } catch (err) {
    console.error('History load error:', err);
    cache = { history: [], steamPath: null };
  }
  return cache;
}

async function save(data) {
  cache = data;
  saveQueue = saveQueue.then(() => fs.writeJson(getStoragePath(), data, { spaces: 2 }));
  await saveQueue;
}

async function addHistory(appId, title) {
  const data = await load();
  data.history = data.history.filter(h => h.appId !== appId);
  data.history.unshift({ appId, title, date: Date.now() });
  if (data.history.length > 50) data.history = data.history.slice(0, 50);
  await save(data);
  return data.history;
}

async function getHistory() {
  const data = await load();
  return data.history || [];
}

async function clearHistory() {
  const data = await load();
  data.history = [];
  await save(data);
}

async function getSteamPath() {
  const data = await load();
  return data.steamPath || null;
}

async function setSteamPath(p) {
  const data = await load();
  data.steamPath = p;
  await save(data);
}

module.exports = { addHistory, getHistory, clearHistory, getSteamPath, setSteamPath, load };
