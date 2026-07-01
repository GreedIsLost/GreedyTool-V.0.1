function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

const state = {
  currentView: 'library',
  searchResults: [],
  batchResults: {},
  currentDetail: null,
  pendingBatchLua: {},
  lastManifestPath: null,
};

const $ = id => document.getElementById(id);

const pages = {
  library: $('page-library'), search: $('page-search'),
  batch: $('page-batch'), tools: $('page-tools'), settings: $('page-settings'),
};

function setStatus(el, msg, type = 'info') {
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-bar ' + type;
  el.classList.remove('hidden');
}

function hideStatus(el) { if (el) el.classList.add('hidden'); }

function loadingBtn(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
  } else if (btn._origText) {
    btn.innerHTML = btn._origText;
  }
}

function switchView(view) {
  state.currentView = view;
  Object.keys(pages).forEach(k => pages[k].classList.toggle('active', k === view));
  document.querySelectorAll('.sidebar-item[data-view]')
    .forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'library') refreshLibrary();
  if (view === 'search') $('search-input')?.focus();
  if (view === 'tools') refreshCacheStats();
}

function updateDecodeLastBtn() {
  const btn = $('manifest-decode-last');
  if (!btn) return;
  btn.classList.toggle('hidden', !state.lastManifestPath);
}

function updateSidebarStatus() {
  window.greed.getSettings()
    .then(s => { $('sidebar-status').textContent = s.steamPath ? 'Steam: ' + s.steamPath : 'Steam: auto-detect'; })
    .catch(err => { console.error('sidebar status error:', err); $('sidebar-status').textContent = 'Steam: unknown'; });
}

document.addEventListener('DOMContentLoaded', () => {
  /* NAVIGATION */
  document.querySelectorAll('.sidebar-item[data-view]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });
  document.querySelectorAll('.header-nav button[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.header-nav button[data-page]').forEach(b => b.classList.remove('active'));
      el.classList.add('active');
      switchView(el.dataset.page);
    });
  });
  updateSidebarStatus();

  /* UPDATE CHECK */
  (async () => {
    try {
      const update = await window.greed.checkUpdate();
      const badge = $('update-badge');
      if (update.hasUpdate) {
        badge.classList.remove('hidden');
        badge.textContent = 'v' + update.latestVersion + ' available';
        badge.onclick = () => { if (update.url) window.greed.openExternal(update.url); };
      }
      const aboutUpdate = $('about-update');
      if (update.hasUpdate) {
        aboutUpdate.textContent = 'Update v' + update.latestVersion + ' available';
        aboutUpdate.onclick = () => { if (update.url) window.greed.openExternal(update.url); };
      }
    } catch (err) { console.error('update check error:', err); }
  })();

  /* DRAG & DROP */
  function setupDropZone(zoneId, callback) {
    const zone = $(zoneId);
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const text = e.dataTransfer.getData('text');
      if (text) {
        const ids = text.split(/[\n,;\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (ids.length > 0) callback(ids);
      }
    });
  }
  setupDropZone('drop-zone', (ids) => {
    if (ids.length === 1) {
      $('quick-appid').value = ids[0];
      quickGo();
    } else {
      $('batch-input').value = ids.join('\n');
      switchView('batch');
      processBatch();
    }
  });
  setupDropZone('drop-zone-batch', (ids) => {
    $('batch-input').value = ids.join('\n');
    processBatch();
  });

  /* LIBRARY */
  async function refreshLibrary() {
    const grid = $('library-grid');
    const empty = $('library-empty');
    const status = $('library-status');
    try {
      const games = await window.greed.getImported();
      grid.innerHTML = '';
      if (games.length === 0) { empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');
      for (const g of games) {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
          <div class="game-card-img"><img src="https://cdn.steamstatic.com/steam/apps/${g.appId}/header.jpg" onerror="this.parentElement.textContent='No image'" alt=""/></div>
          <div class="game-card-body"><div class="game-card-title">App ${g.appId}</div><div class="game-card-id">${g.hasLua ? 'Lua + manifest' : 'Manifest only'}</div></div>
          <div class="game-card-actions">
            <button class="btn btn-danger btn-sm remove-game" data-id="${g.appId}">Remove</button>
            <button class="btn btn-secondary btn-sm detail-game" data-id="${g.appId}">Details</button>
          </div>`;
        grid.appendChild(card);
      }
      grid.querySelectorAll('.remove-game').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm(`Remove App ${b.dataset.id} from Steam?`)) return;
          await window.greed.removeGame(parseInt(b.dataset.id));
          setStatus(status, 'Game removed. Restart Steam.', 'success');
          refreshLibrary();
        });
      });
      grid.querySelectorAll('.detail-game').forEach(b => {
        b.addEventListener('click', () => showDetail(parseInt(b.dataset.id)));
      });
      hideStatus(status);
    } catch (err) { setStatus(status, 'Error: ' + err.message, 'error'); }
  }
  refreshLibrary();

  /* DETAIL OVERLAY */
  async function showDetail(appId) {
    const overlay = $('detail-overlay');
    if (!overlay) return;
    const title = overlay.querySelector('h2');
    const content = $('detail-content');
    overlay.classList.remove('hidden');
    if (title) title.textContent = 'App ' + appId;
    if (content) {
      try {
        const verify = await window.greed.verifyImport(appId);
        content.innerHTML = `
          <div style="margin-bottom:12px;">
            <div style="background:var(--bg-secondary);padding:10px;border-radius:4px;margin-bottom:8px;">
              <div class="text-muted">Status</div>
              <div style="font-size:15px;font-weight:600;color:${verify.found ? 'var(--accent-green)' : 'var(--danger)'};">${verify.found ? 'Imported' : 'Not found'}</div>
            </div>
            <div class="flex gap-8 flex-wrap">
              <div style="background:var(--bg-secondary);padding:10px;border-radius:4px;flex:1;min-width:100px;">
                <div class="text-muted">App Manifest</div>
                <div style="color:${verify.manifestExists ? 'var(--accent-green)' : 'var(--danger)'};">${verify.manifestExists ? 'Present' : 'Missing'}</div>
              </div>
              <div style="background:var(--bg-secondary);padding:10px;border-radius:4px;flex:1;min-width:100px;">
                <div class="text-muted">Lua File</div>
                <div style="color:${verify.luaExists ? 'var(--accent-green)' : 'var(--danger)'};">${verify.luaExists ? 'Present' : 'Missing'}</div>
              </div>
            </div>
          </div>
          <div class="flex gap-8"><button class="btn btn-danger detail-remove" data-id="${appId}">Remove from Steam</button><button class="btn btn-secondary detail-close-btn">Close</button></div>`;
        content.querySelector('.detail-remove').onclick = async () => {
          await window.greed.removeGame(appId);
          overlay.classList.add('hidden');
          refreshLibrary();
        };
        content.querySelector('.detail-close-btn').onclick = () => overlay.classList.add('hidden');
      } catch (err) { console.error('detail load error:', err); content.innerHTML = '<div class="text-muted">Failed to load</div>'; }
    }
  }

  /* DETAIL OVERLAY CLOSE */
  const detailOverlay = $('detail-overlay');
  if (detailOverlay) {
    const closeBtn = detailOverlay.querySelector('#detail-close');
    if (closeBtn) closeBtn.onclick = () => detailOverlay.classList.add('hidden');
    detailOverlay.onclick = (e) => { if (e.target === detailOverlay) detailOverlay.classList.add('hidden'); };
  }

  /* SEARCH */
  async function doSearch() {
    const query = $('search-input').value.trim();
    if (!query) return;
    const results = $('search-results');
    const status = $('search-status');
    results.innerHTML = '';
    loadingBtn($('search-btn'), true);
    setStatus(status, 'Searching...', 'info');
    try {
      const data = await window.greed.searchGame(query);
      if (!data.success || data.results.length === 0) {
        setStatus(status, 'No games found.', 'info');
        loadingBtn($('search-btn'), false);
        return;
      }
      hideStatus(status);
      for (const r of data.results) {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.innerHTML = `
          <div class="search-result-img">${r.icon ? '<img src="' + r.icon + '" alt=""/>' : '?'}</div>
          <div class="search-result-info"><div class="search-result-name">${r.name}</div><div class="search-result-id">App ID: ${r.appId}</div></div>
          <button class="btn btn-green btn-sm process-search" data-id="${r.appId}" data-name="${r.name}">Process</button>`;
        results.appendChild(div);
      }
      results.querySelectorAll('.process-search').forEach(b => {
        b.addEventListener('click', async () => {
          const appId = parseInt(b.dataset.id);
          b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
          try {
            const result = await window.greed.processApp(appId);
            if (result.success) {
              state.currentDetail = { appId, lua: result.lua, depots: result.depots, title: result.title };
              showQuickResult(appId, result);
              b.textContent = 'Done!'; b.className = 'btn btn-primary btn-sm';
            } else { b.textContent = 'Failed'; b.className = 'btn btn-danger btn-sm'; }
          } catch { b.textContent = 'Error'; b.className = 'btn btn-danger btn-sm'; }
        });
      });
    } catch (err) { console.error('search error:', err); setStatus(status, 'Search failed: ' + err.message, 'error'); }
    loadingBtn($('search-btn'), false);
  }
  $('search-btn').addEventListener('click', doSearch);
  $('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  /* QUICK APP ID */
  async function quickGo() {
    const raw = $('quick-appid').value.trim();
    if (!raw) return;
    const appId = parseInt(raw);
    if (isNaN(appId)) return;
    loadingBtn($('quick-go'), true);
    $('quick-result').innerHTML = '';
    try {
      const result = await window.greed.processApp(appId);
      if (result.success) {
        state.currentDetail = { appId, lua: result.lua, depots: result.depots, title: result.title };
        showQuickResult(appId, result);
      } else {
        $('quick-result').innerHTML = '<div class="status-bar error">' + result.error + '</div>';
      }
    } catch (err) { console.error('quickGo error:', err); $('quick-result').innerHTML = '<div class="status-bar error">' + err.message + '</div>'; }
    loadingBtn($('quick-go'), false);
  }
  $('quick-go').addEventListener('click', quickGo);
  $('quick-appid').addEventListener('keydown', e => { if (e.key === 'Enter') quickGo(); });

  function showQuickResult(appId, result) {
    const div = $('quick-result');
    state.lastManifestPath = result.depots && result.depots.length > 0 ? result.depots[0].path : null;
    updateDecodeLastBtn();
    const infoHtml = result.appInfo ? `
      <div class="app-info-panel">
        <img src="${result.appInfo.headerImage || 'https://cdn.steamstatic.com/steam/apps/' + appId + '/header.jpg'}" alt="" onerror="this.style.display='none'"/>
        <div class="app-info-body">
          <h3>${result.appInfo.name}</h3>
          <div class="app-info-details">
            ${result.appInfo.developer ? '<strong>Developer:</strong> ' + result.appInfo.developer + '<br/>' : ''}
            ${result.appInfo.publisher ? '<strong>Publisher:</strong> ' + result.appInfo.publisher + '<br/>' : ''}
            ${result.appInfo.releaseDate ? '<strong>Release:</strong> ' + result.appInfo.releaseDate + '<br/>' : ''}
            ${result.appInfo.genres ? '<strong>Genres:</strong> ' + result.appInfo.genres + '<br/>' : ''}
            ${result.appInfo.price ? '<strong>Price:</strong> ' + result.appInfo.price : ''}
            ${result.appInfo.metacritic ? ' | <strong>Metacritic:</strong> ' + result.appInfo.metacritic : ''}
          </div>
          ${result.appInfo.shortDescription ? '<div class="app-info-desc">' + result.appInfo.shortDescription + '</div>' : ''}
          ${result.appInfo.screenshots && result.appInfo.screenshots.length > 0 ? '<div class="screenshot-strip">' + result.appInfo.screenshots.map(s => '<img src="' + s + '" onclick="window.open(\'' + s + '\')"/>').join('') + '</div>' : ''}
        </div>
      </div>` : '';
    div.innerHTML = infoHtml + `
      <div class="status-bar success">${result.title} (${appId}) ready</div>
      <div class="depot-grid">
        ${result.depots.map(d => `<div class="depot-chip"><span class="label">Depot ${d.depotId}</span> <span class="val ${d.downloaded ? (d.cached ? 'cached' : 'ok') : 'no'}">${d.downloaded ? (d.cached ? 'Cached' : '&#10003;') : '&#10007;'}</span></div>`).join('')}
      </div>
      <div class="flex gap-8 mt-8" style="flex-wrap:wrap;">
        <button class="btn btn-primary quick-import" data-id="${appId}">Import to Steam</button>
        <button class="btn btn-secondary quick-export" data-id="${appId}">Export Backup</button>
        <button class="btn btn-secondary quick-decode" data-id="${appId}" ${state.lastManifestPath ? '' : 'disabled'}>Decode Manifest</button>
      </div>`;
    div.querySelector('.quick-import').onclick = async () => {
      const r = await window.greed.importToSteam({ appId, luaContent: result.lua, depots: result.depots });
      setStatus($('search-status'), r.success ? 'Imported! Steam restarting.' : 'Failed: ' + r.error, r.success ? 'success' : 'error');
    };
    div.querySelector('.quick-export').onclick = async () => {
      const paths = result.depots.filter(d => d.path).map(d => d.path);
      const exp = await window.greed.exportBackup({ appId, luaContent: result.lua, manifestPaths: paths });
      if (exp.success) setStatus($('search-status'), 'Backup saved: ' + exp.path, 'success');
    };
    div.querySelector('.quick-decode').onclick = async () => {
      if (state.lastManifestPath) decodeManifestFile(state.lastManifestPath);
    };
  }

  /* BATCH */
  async function processBatchCall() {
    const raw = $('batch-input').value.trim();
    if (!raw) return;
    const ids = raw.split(/[\n,]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (ids.length === 0) return;
    $('batch-results').innerHTML = '';
    loadingBtn($('batch-go'), true);
    $('batch-count').textContent = 'Processing ' + ids.length + ' app(s)...';
    setStatus($('batch-status'), 'Processing...', 'info');
    try {
      const batch = await window.greed.processBatch(ids);
      if (!batch.success) { setStatus($('batch-status'), batch.error, 'error'); loadingBtn($('batch-go'), false); return; }
      state.pendingBatchLua = {};
      let html = '<div class="game-grid">';
      for (const id of ids) {
        const r = batch.results[id];
        if (!r) continue;
        state.pendingBatchLua[id] = { lua: r.lua, depots: r.depots };
        html += `<div class="game-card">
          <div class="game-card-img"><img src="https://cdn.steamstatic.com/steam/apps/${id}/header.jpg" onerror="this.parentElement.textContent='No image'" alt=""/></div>
          <div class="game-card-body"><div class="game-card-title">${r.title}</div><div class="game-card-id">App ${id} &bull; ${r.depots.filter(d => d.downloaded).length}/${r.depots.length} depots</div></div>
          <div class="game-card-actions"><button class="btn btn-green btn-sm batch-import-one" data-id="${id}">Import</button><button class="btn btn-secondary btn-sm batch-export-one" data-id="${id}">Export</button></div>
        </div>`;
      }
      html += '</div>';
      $('batch-results').innerHTML = html;
      $('batch-results').querySelectorAll('.batch-import-one').forEach(b => {
        const id = b.dataset.id;
        b.addEventListener('click', () => {
          const data = state.pendingBatchLua[id];
          if (data) doImport(parseInt(id), data.lua, data.depots);
        });
      });
      $('batch-results').querySelectorAll('.batch-export-one').forEach(b => {
        b.addEventListener('click', async () => {
          const id = parseInt(b.dataset.id);
          const data = state.pendingBatchLua[id];
          if (data) await window.greed.exportBackup({ appId: id, luaContent: data.lua, manifestPaths: [] });
        });
      });
      $('batch-import-all').disabled = false;
      setStatus($('batch-status'), ids.length + ' app(s) processed.', 'success');
      $('batch-count').textContent = ids.length + ' app(s) ready';
    } catch (err) { console.error('batch error:', err); setStatus($('batch-status'), 'Error: ' + err.message, 'error'); }
    loadingBtn($('batch-go'), false);
  }
  $('batch-go').addEventListener('click', processBatchCall);
  $('batch-import-all').addEventListener('click', async () => {
    const items = Object.entries(state.pendingBatchLua).map(([id, data]) => ({ appId: parseInt(id), lua: data.lua, depots: data.depots }));
    if (items.length === 0) return;
    loadingBtn($('batch-import-all'), true);
    const r = await window.greed.importBatch(items);
    setStatus($('batch-status'), r.success ? r.count + ' game(s) imported! Steam restarting.' : r.error, r.success ? 'success' : 'error');
    loadingBtn($('batch-import-all'), false);
  });

  /* IMPORT */
  async function doImport(appId, lua, depots) {
    const r = await window.greed.importToSteam({ appId, luaContent: lua, depots: depots || [] });
    setStatus($('search-status'), r.success ? 'Imported! Steam restarting.' : 'Failed: ' + r.error, r.success ? 'success' : 'error');
  }

  /* TOOLS - TABS */
  $('tools-tabs').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.tooltab) return;
    $('tools-tabs').querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['decoder', 'cache', 'build'].forEach(id => {
      const el = $('tooltab-' + id);
      if (el) el.classList.toggle('hidden', id !== btn.dataset.tooltab);
    });
    if (btn.dataset.tooltab === 'cache') refreshCacheStats();
  });

  /* MANIFEST DECODER */
  async function decodeManifestFile(filePath) {
    const output = $('manifest-output');
    output.innerHTML = '<span class="spinner"></span> Decoding...';
    try {
      const result = await window.greed.decodeManifest(filePath);
      if (!result.success) { output.innerHTML = '<div class="status-bar error">' + result.error + '</div>'; return; }
      const s = result.summary;
      if (s.error) { output.innerHTML = '<div class="status-bar error">' + s.error + '</div>'; return; }
      let html = `<div class="status-bar success">${s.totalFiles} files, ${formatBytes(s.totalSize)}, ${s.directories} directories</div>`;
      if (s.files.length > 0) {
        const shown = s.files.slice(0, 100);
        html += `<table class="manifest-table"><tr><th>File</th><th>Size</th></tr>`;
        for (const f of shown) {
          html += `<tr><td>${f.name}</td><td>${formatBytes(f.size)}</td></tr>`;
        }
        html += `</table>`;
        if (s.files.length > 100) html += `<div class="text-muted mt-8">...and ${s.files.length - 100} more files</div>`;
      }
      output.innerHTML = html;
    } catch (err) { output.innerHTML = '<div class="status-bar error">' + err.message + '</div>'; }
  }
  $('manifest-pick').addEventListener('click', async () => {
    const filePath = await window.greed.pickManifestFile();
    if (filePath) { state.lastManifestPath = filePath; decodeManifestFile(filePath); updateDecodeLastBtn(); }
  });
  $('manifest-decode-last').addEventListener('click', () => {
    if (state.lastManifestPath) decodeManifestFile(state.lastManifestPath);
  });

  /* CACHE */
  async function refreshCacheStats() {
    const stats = $('cache-stats');
    if (!stats) return;
    stats.textContent = 'Loading...';
    try {
      const s = await window.greed.getCacheStats();
      stats.textContent = s.manifestCount + ' cached manifest(s), ' + formatBytes(s.sizeBytes);
    } catch (err) { console.error('cache stats error:', err); stats.textContent = 'Could not load cache stats'; }
  }
  $('cache-clear').addEventListener('click', async () => {
    if (!confirm('Clear all cached data?')) return;
    await window.greed.clearCache();
    setStatus($('cache-status'), 'Cache cleared.', 'success');
    refreshCacheStats();
  });

  /* BUILD BUTTONS */
  function runBuild(target) {
    setStatus($('cache-status'), 'Build started for ' + target + '. Check terminal output.', 'info');
    window.greed.openExternal('https://github.com/GreedIsLost/GreedyTool-V.0.1#readme');
  }
  $('build-linux').addEventListener('click', () => runBuild('Linux'));
  $('build-win').addEventListener('click', () => runBuild('Windows'));
  $('build-mac').addEventListener('click', () => runBuild('macOS'));

  /* SETTINGS */
  (async () => {
    try {
      const settings = await window.greed.getSettings();
      if (settings.steamPath) $('settings-steam-path').value = settings.steamPath;
    } catch (err) { console.error('settings load error:', err); }
  })();
  $('settings-browse').addEventListener('click', async () => {
    const folder = await window.greed.pickFolder();
    if (folder) $('settings-steam-path').value = folder;
  });
  $('settings-save').addEventListener('click', async () => {
    const val = $('settings-steam-path').value.trim();
    try {
      await window.greed.saveSettings({ steamPath: val || null });
      $('settings-status').textContent = 'Saved!';
      updateSidebarStatus();
      setTimeout(() => { $('settings-status').textContent = ''; }, 2000);
    } catch (err) { $('settings-status').textContent = 'Error: ' + err.message; }
  });
  $('settings-clear-history').addEventListener('click', async () => {
    if (!confirm('Clear all history?')) return;
    await window.greed.clearHistory();
    alert('History cleared.');
  });

  /* HISTORY */
  document.querySelector('[data-view="history"]').addEventListener('click', async () => {
    try {
      const historyData = await window.greed.getHistory();
      const main = document.querySelector('.main');
      const oldPage = main.querySelector('.history-page');
      if (oldPage) oldPage.remove();
      const div = document.createElement('div');
      div.className = 'history-page';
      div.innerHTML = '<div class="page-title">History</div><div class="page-subtitle">Recently processed App IDs</div><div id="history-list">' +
        (historyData.length === 0 ? '<div class="text-muted">No history yet.</div>' : '') + '</div>';
      const list = div.querySelector('#history-list');
      for (const h of historyData) {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = '<span class="app-id">' + h.appId + '</span><span class="app-title">' + h.title + '</span><span class="app-date">' + new Date(h.date).toLocaleDateString() + '</span>';
        item.addEventListener('click', () => { $('quick-appid').value = h.appId; switchView('search'); quickGo(); });
        list.appendChild(item);
      }
      main.appendChild(div);
      document.querySelectorAll('.sidebar-item[data-view]').forEach(el => el.classList.remove('active'));
      document.querySelector('[data-view="history"]').classList.add('active');
      Object.keys(pages).forEach(k => pages[k].classList.remove('active'));
    } catch (err) { console.error('history load error:', err); }
  });
});
