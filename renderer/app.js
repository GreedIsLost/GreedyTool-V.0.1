function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

const state = {
  currentView: 'library',
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
  document.querySelectorAll('.nav-bar button[data-page]')
    .forEach(el => el.classList.toggle('active', el.dataset.page === view));
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
  document.querySelectorAll('.nav-bar button[data-page]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.page));
  });
  updateSidebarStatus();

  /* AUTO-UPDATE */
  window.greed.onUpdateEvent('update-checking', () => {
    const badge = $('update-badge');
    if (badge) { badge.textContent = 'Checking...'; badge.classList.remove('hidden'); }
  });

  window.greed.onUpdateEvent('update-available', (data) => {
    const badge = $('update-badge');
    if (badge) {
      badge.textContent = 'v' + data.version + ' — Download';
      badge.classList.remove('hidden');
      badge.onclick = () => window.greed.updateDownload();
    }
    const about = $('about-update');
    if (about) {
      about.textContent = 'Update v' + data.version + ' available — click to download';
      about.onclick = () => window.greed.updateDownload();
    }
  });

  window.greed.onUpdateEvent('update-not-available', () => {
    const badge = $('update-badge');
    if (badge) badge.classList.add('hidden');
  });

  window.greed.onUpdateEvent('update-error', (data) => {
    console.error('Update error:', data.error);
    const badge = $('update-badge');
    if (badge) badge.classList.add('hidden');
  });

  window.greed.onUpdateEvent('update-progress', (data) => {
    const pct = Math.round(data.percent);
    const badge = $('update-badge');
    if (badge) badge.textContent = 'Downloading ' + pct + '%';
    const about = $('about-update');
    if (about) about.textContent = 'Downloading update... ' + pct + '%';
  });

  window.greed.onUpdateEvent('update-downloaded', () => {
    const badge = $('update-badge');
    if (badge) {
      badge.textContent = 'Install & Restart';
      badge.onclick = () => window.greed.updateInstall();
    }
    const about = $('about-update');
    if (about) {
      about.textContent = 'Update ready — click to install & restart';
      about.onclick = () => window.greed.updateInstall();
    }
  });

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
  let _batchRunning = false;
  setupDropZone('drop-zone', (ids) => {
    if (_batchRunning) return;
    if (ids.length === 1) {
      $('quick-appid').value = ids[0];
      quickGo();
    } else {
      $('batch-input').value = ids.join('\n');
      switchView('batch');
      processBatchCall();
    }
  });
  setupDropZone('drop-zone-batch', (ids) => {
    if (_batchRunning) return;
    $('batch-input').value = ids.join('\n');
    processBatchCall();
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
          const result = await window.greed.removeGame(parseInt(b.dataset.id));
          if (result && result.success === false) {
            setStatus(status, 'Remove failed: ' + (result.error || 'unknown error'), 'error');
            return;
          }
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
          <div class="search-result-img">${r.icon ? `<img src="${r.icon.replace(/"/g, '&quot;')}" alt=""/>` : '?'}</div>
          <div class="search-result-info"><div class="search-result-name">${escapeHtml(r.name)}</div><div class="search-result-id">App ID: ${r.appId}</div></div>
          <button class="btn btn-green btn-sm process-search" data-id="${r.appId}" data-name="${escapeHtml(r.name)}">Process</button>`;
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
    function esc(str) { return escapeHtml(String(str ?? '')); }
    const ai = result.appInfo;
    const infoHtml = ai ? `
      <div class="app-info-panel">
        <img src="${ai.headerImage || 'https://cdn.steamstatic.com/steam/apps/' + appId + '/header.jpg'}" alt="" onerror="this.style.display='none'"/>
        <div class="app-info-body">
          <h3>${esc(ai.name)}</h3>
          <div class="app-info-details">
            ${ai.developer ? '<strong>Developer:</strong> ' + esc(ai.developer) + '<br/>' : ''}
            ${ai.publisher ? '<strong>Publisher:</strong> ' + esc(ai.publisher) + '<br/>' : ''}
            ${ai.releaseDate ? '<strong>Release:</strong> ' + esc(ai.releaseDate) + '<br/>' : ''}
            ${ai.genres ? '<strong>Genres:</strong> ' + esc(ai.genres) + '<br/>' : ''}
            ${ai.price ? '<strong>Price:</strong> ' + esc(ai.price) : ''}
            ${ai.metacritic ? ' | <strong>Metacritic:</strong> ' + esc(ai.metacritic) : ''}
          </div>
          ${ai.shortDescription ? '<div class="app-info-desc">' + esc(ai.shortDescription) + '</div>' : ''}
          ${ai.screenshots && ai.screenshots.length > 0 ? '<div class="screenshot-strip">' + ai.screenshots.map(s => `<img src="${s}" data-url="${s.replace(/"/g, '&quot;')}"/>`).join('') + '</div>' : ''}
        </div>
      </div>` : '';
    div.innerHTML = infoHtml + `
      <div class="status-bar success">${esc(result.title)} (${appId}) ready</div>
      <div class="depot-grid">
        ${result.depots.map(d => `<div class="depot-chip"><span class="label">Depot ${d.depotId}</span> <span class="val ${d.downloaded ? (d.cached ? 'cached' : 'ok') : 'no'}">${d.downloaded ? (d.cached ? 'Cached' : '&#10003;') : '&#10007;'}</span></div>`).join('')}
      </div>
      <div class="flex gap-8 mt-8" style="flex-wrap:wrap;">
        <button class="btn btn-primary quick-import" data-id="${appId}">Import to Steam</button>
        <button class="btn btn-secondary quick-export" data-id="${appId}">Export Backup</button>
        <button class="btn btn-secondary quick-decode" data-id="${appId}" ${state.lastManifestPath ? '' : 'disabled'}>Decode Manifest</button>
      </div>`;
    const importBtn = div.querySelector('.quick-import');
    if (importBtn) importBtn.onclick = async () => {
      const r = await window.greed.importToSteam({ appId, luaContent: result.lua, depots: result.depots });
      setStatus($('search-status'), r.success ? 'Imported! Steam restarting.' : 'Failed: ' + r.error, r.success ? 'success' : 'error');
    };
    const exportBtn = div.querySelector('.quick-export');
    if (exportBtn) exportBtn.onclick = async () => {
      const paths = result.depots.filter(d => d.path).map(d => d.path);
      const exp = await window.greed.exportBackup({ appId, luaContent: result.lua, manifestPaths: paths, depots: result.depots });
      if (exp.success) setStatus($('search-status'), 'Backup saved: ' + exp.path, 'success');
      else setStatus($('search-status'), 'Backup failed: ' + (exp.error || 'unknown error'), 'error');
    };
    const decodeBtn = div.querySelector('.quick-decode');
    if (decodeBtn) decodeBtn.onclick = async () => {
      if (state.lastManifestPath) decodeManifestFile(state.lastManifestPath);
    };
    div.querySelectorAll('.screenshot-strip img[data-url]').forEach(img => {
      img.addEventListener('click', () => {
        window.greed.openExternal(img.dataset.url);
      });
    });
  }

  /* BATCH */
  async function processBatchCall() {
    if (_batchRunning) return;
    _batchRunning = true;
    const raw = $('batch-input').value.trim();
    if (!raw) { _batchRunning = false; return; }
    const ids = raw.split(/[\n,]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (ids.length === 0) { _batchRunning = false; return; }
    $('batch-results').innerHTML = '';
    loadingBtn($('batch-go'), true);
    $('batch-count').textContent = 'Processing ' + ids.length + ' app(s)...';
    setStatus($('batch-status'), 'Processing...', 'info');
    $('batch-import-all').disabled = true;
    try {
      const batch = await window.greed.processBatch(ids);
      if (!batch.success) { setStatus($('batch-status'), batch.error, 'error'); loadingBtn($('batch-go'), false); _batchRunning = false; return; }
      state.pendingBatchLua = {};
      let html = '<div class="game-grid">';
      for (const id of ids) {
        const r = batch.results[id];
        if (!r) continue;
        state.pendingBatchLua[id] = { lua: r.lua, depots: r.depots };
        html += `<div class="game-card">
          <div class="game-card-img"><img src="https://cdn.steamstatic.com/steam/apps/${id}/header.jpg" onerror="this.parentElement.textContent='No image'" alt=""/></div>
          <div class="game-card-body"><div class="game-card-title">${escapeHtml(r.title)}</div><div class="game-card-id">App ${id} &bull; ${r.depots.filter(d => d.downloaded).length}/${r.depots.length} depots</div></div>
          <div class="game-card-actions"><button class="btn btn-green btn-sm batch-import-one" data-id="${id}">Import</button><button class="btn btn-secondary btn-sm batch-export-one" data-id="${id}">Export</button></div>
        </div>`;
      }
      html += '</div>';
      $('batch-results').innerHTML = html;
      $('batch-results').querySelectorAll('.batch-import-one').forEach(b => {
        const id = parseInt(b.dataset.id);
        b.addEventListener('click', () => {
          const data = state.pendingBatchLua[id];
          if (data) doImport(id, data.lua, data.depots).catch(err => console.error('import error:', err));
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
    _batchRunning = false;
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
    ['decoder', 'sam', 'idler', 'cache', 'depot', 'build'].forEach(id => {
      const el = $('tooltab-' + id);
      if (el) el.classList.toggle('hidden', id !== btn.dataset.tooltab);
    });
    if (btn.dataset.tooltab === 'cache') refreshCacheStats();
    if (btn.dataset.tooltab === 'sam') refreshSamStatus();
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

  /* SAM */
  let samPath = null;

  async function refreshSamStatus() {
    const statusEl = $('sam-status');
    const launchBtn = $('sam-launch');
    try {
      const result = await window.greed.samDetect();
      if (result.found) {
        samPath = result.path;
        statusEl.textContent = 'SAM found at: ' + result.path;
        launchBtn.disabled = false;
      } else {
        samPath = null;
        statusEl.textContent = 'SAM not found. Download or browse to locate it.';
        launchBtn.disabled = true;
      }
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
    }
  }

  $('sam-launch').addEventListener('click', async () => {
    if (!samPath) return;
    try {
      const r = await window.greed.samLaunch({ exePath: samPath, appId: state.currentDetail ? state.currentDetail.appId : null });
      setStatus($('sam-launch-status'), r.success ? 'SAM launched' : 'Failed: ' + r.error, r.success ? 'success' : 'error');
    } catch (err) {
      setStatus($('sam-launch-status'), 'Error: ' + err.message, 'error');
    }
  });

  $('sam-download').addEventListener('click', async () => {
    try {
      $('sam-download').disabled = true;
      $('sam-download').textContent = 'Downloading...';
      const info = await window.greed.samDownload();
      if (info.success) {
        setStatus($('sam-launch-status'), 'SAM downloaded: ' + info.path, 'success');
        refreshSamStatus();
      } else {
        setStatus($('sam-launch-status'), 'Download failed: ' + (info.error || 'unknown'), 'error');
      }
    } catch (err) {
      setStatus($('sam-launch-status'), 'Error: ' + err.message, 'error');
    } finally {
      $('sam-download').disabled = false;
      $('sam-download').textContent = 'Download SAM';
    }
  });

  $('sam-browse').addEventListener('click', async () => {
    const filePath = await window.greed.pickFile();
    if (filePath) {
      samPath = filePath;
      $('sam-status').textContent = 'SAM set to: ' + filePath;
      $('sam-launch').disabled = false;
    }
  });

  /* IDLER */
  let idlerState = { status: 'disconnected', currentAppIds: [] };

  function updateIdlerUI() {
    const s = idlerState.status;
    $('idler-login-area').classList.toggle('hidden', s === 'connected' || s === 'idling');
    $('idler-guard-area').classList.toggle('hidden', s !== 'guard-needed');
    $('idler-controls').classList.toggle('hidden', s !== 'connected' && s !== 'idling');
    const sd = $('idler-status-display');
    if (!sd) return;
    if (s === 'idling' && idlerState.currentAppIds.length > 0) {
      sd.className = 'status-bar success mt-8';
      const count = idlerState.currentAppIds.length;
      sd.textContent = `Idling ${count} game${count !== 1 ? 's' : ''} - accumulating hours in parallel`;
    } else if (s === 'connected') {
      sd.className = 'status-bar info mt-8';
      sd.textContent = 'Connected to Steam. Ready to idle.';
    } else {
      sd.className = 'status-bar mt-8';
      sd.textContent = 'Status: ' + s;
    }
    $('idler-start-btn').disabled = s !== 'connected';
    $('idler-stop-btn').disabled = s !== 'idling';
    if (idlerState.username) {
      $('idler-user-display').textContent = idlerState.username;
    }
    renderIdlingList();
  }

  function renderIdlingList() {
    const container = $('idler-idling-list');
    if (!container) return;
    if (idlerState.status !== 'idling' || idlerState.currentAppIds.length === 0) {
      container.innerHTML = '';
      return;
    }
    let html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Currently idling:</div>';
    for (const appId of idlerState.currentAppIds) {
      html += `<span class="depot-chip" style="display:inline-block;margin:2px;"><span class="label">App ${appId}</span></span> `;
    }
    container.innerHTML = html;
  }

  window.greed.onIdlerEvent('idler-status', (data) => {
    idlerState.status = data.status;
    updateIdlerUI();
    if (data.status === 'disconnected') {
      $('friends-panel').classList.add('hidden');
    }
  });

  window.greed.onIdlerEvent('idler-logged-in', async () => {
    idlerState.status = 'connected';
    updateIdlerUI();
    const r = await window.greed.friendsStart();
    if (r.success) {
      $('friends-panel').classList.remove('hidden');
    } else {
      console.error('friends start error:', r.error);
    }
  });

  window.greed.onIdlerEvent('idler-guard-needed', (data) => {
    idlerState.status = 'guard-needed';
    $('idler-guard-domain').textContent = data.domain || 'Steam app';
    if (data.lastCodeWrong) {
      setStatus($('idler-connection-status'), 'Wrong guard code, try again', 'error');
    }
    updateIdlerUI();
  });

  window.greed.onIdlerEvent('idler-error', (data) => {
    setStatus($('idler-connection-status'), 'Error: ' + data.error, 'error');
    idlerState.status = 'disconnected';
    updateIdlerUI();
  });

  window.greed.onIdlerEvent('idler-idling', (data) => {
    idlerState.currentAppIds = data.appIds || [];
    idlerState.status = 'idling';
    updateIdlerUI();
  });

  window.greed.onIdlerEvent('idler-stopped', () => {
    idlerState.currentAppIds = [];
    idlerState.status = 'connected';
    updateIdlerUI();
  });

  $('idler-login-btn').addEventListener('click', async () => {
    const username = $('idler-username').value.trim();
    const password = $('idler-password').value.trim();
    if (!username || !password) { setStatus($('idler-connection-status'), 'Enter username and password', 'error'); return; }
    try {
      const r = await window.greed.idlerLogin({ username, password });
      if (r.success) {
        idlerState.username = username;
        $('idler-connection-status').classList.add('hidden');
      } else {
        setStatus($('idler-connection-status'), 'Login failed: ' + r.error, 'error');
      }
    } catch (err) {
      setStatus($('idler-connection-status'), 'Error: ' + err.message, 'error');
    }
  });

  $('idler-guard-btn').addEventListener('click', async () => {
    const code = $('idler-guard-input').value.trim();
    if (!code) return;
    try {
      await window.greed.idlerGuard({ code });
      $('idler-guard-input').value = '';
      setStatus($('idler-connection-status'), 'Guard code submitted', 'info');
    } catch (err) {
      setStatus($('idler-connection-status'), 'Error: ' + err.message, 'error');
    }
  });

  $('idler-start-btn').addEventListener('click', async () => {
    const raw = $('idler-appids').value.trim();
    if (!raw) { setStatus($('idler-connection-status'), 'Enter App IDs (one per line)', 'error'); return; }
    const appIds = raw.split('\n').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (appIds.length === 0) { setStatus($('idler-connection-status'), 'No valid App IDs', 'error'); return; }
    try {
      const r = await window.greed.idlerStart({ appIds });
      if (r.success) {
        setStatus($('idler-connection-status'), `Idling ${appIds.length} game${appIds.length !== 1 ? 's' : ''}`, 'success');
      } else {
        setStatus($('idler-connection-status'), 'Failed: ' + r.error, 'error');
      }
    } catch (err) {
      setStatus($('idler-connection-status'), 'Error: ' + err.message, 'error');
    }
  });

  $('idler-stop-btn').addEventListener('click', async () => {
    try {
      const r = await window.greed.idlerStop();
      if (r.success) {
        setStatus($('idler-connection-status'), 'Idling stopped', 'info');
      }
    } catch (err) {
      setStatus($('idler-connection-status'), 'Error: ' + err.message, 'error');
    }
  });

  $('idler-load-library').addEventListener('click', async () => {
    const list = $('idler-library-list');
    const count = $('idler-library-count');
    if (!list || !count) return;
    try {
      list.innerHTML = '<span class="spinner"></span> Loading...';
      $('idler-game-picker').classList.remove('hidden');
      const result = await window.greed.getInstalledGames();
      if (!result.success) {
        list.innerHTML = '<span class="text-muted">' + result.error + '</span>';
        return;
      }
      if (result.games.length === 0) {
        list.innerHTML = '<span class="text-muted">No installed games found</span>';
        count.textContent = '(0)';
        return;
      }
      count.textContent = `(${result.games.length})`;
      let html = '';
      for (const g of result.games) {
        const name = g.name || 'App ' + g.appId;
        html += `<label style="display:block;padding:2px 4px;cursor:pointer;border-radius:3px;" class="hover-bg"><input type="checkbox" class="idler-game-cb" data-appid="${g.appId}" /> ${escHtml(name)}</label>`;
      }
      list.innerHTML = html;
      list.querySelectorAll('.idler-game-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          const ids = [];
          list.querySelectorAll('.idler-game-cb:checked').forEach(c => ids.push(c.dataset.appid));
          $('idler-appids').value = ids.join('\n');
        });
      });
    } catch (err) {
      list.innerHTML = '<span class="text-muted">Error: ' + err.message + '</span>';
    }
  });

  $('idler-logout-btn').addEventListener('click', async () => {
    try {
      await window.greed.friendsStop();
      $('friends-panel').classList.add('hidden');
      await window.greed.idlerLogout();
      idlerState = { status: 'disconnected', currentAppIds: [] };
      updateIdlerUI();
      setStatus($('idler-connection-status'), 'Logged out', 'info');
    } catch (err) {
      setStatus($('idler-connection-status'), 'Error: ' + err.message, 'error');
    }
  });

  /* FRIENDS */
  function renderFriends(data) {
    const list = $('friends-list');
    const count = $('friends-count');
    if (!list || !count) return;
    const online = (data.friends || []).filter(f => f.state !== 0);
    count.textContent = '(' + online.length + ' online)';
    if (online.length === 0) {
      list.innerHTML = '<div class="text-muted" style="font-size:12px;padding:8px;">No friends online.</div>';
      return;
    }
    let html = '';
    for (const f of online) {
      const stateClass = f.state === 1 ? 'online' : f.state === 2 ? 'busy' : f.state === 3 ? 'away' : f.state === 4 ? 'snooze' : f.state === 5 ? 'trade' : f.state === 6 ? 'play' : '';
      const avatar = f.avatarUrl ? `<img src="${f.avatarUrl}" alt=""/>` : '';
      html += `<div class="friend-item">
        <div class="friend-avatar">${avatar}</div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(f.name)}</div>
          ${f.gameName ? '<div class="friend-game">' + escapeHtml(f.gameName) + '</div>' : ''}
        </div>
        <div class="friend-state ${stateClass}">${escapeHtml(f.stateLabel)}</div>
      </div>`;
    }
    list.innerHTML = html;
    $('friends-status').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
  }

  window.greed.onFriendsEvent('friends-update', renderFriends);

  window.greed.onFriendsEvent('friends-error', (data) => {
    console.error('friends error:', data.error);
    $('friends-status').textContent = 'Error: ' + data.error;
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
  let historyPageEl = null;
  document.querySelector('[data-view="history"]').addEventListener('click', async () => {
    try {
      const historyData = await window.greed.getHistory();
      const main = document.querySelector('.main');
      if (historyPageEl) historyPageEl.remove();
      const div = document.createElement('div');
      historyPageEl = div;
      div.className = 'history-page';
      div.id = 'history-page';
      div.innerHTML = '<div class="page-title">History</div><div class="page-subtitle">Recently processed App IDs</div><div id="history-list">' +
        (historyData.length === 0 ? '<div class="text-muted">No history yet.</div>' : '') + '</div>';
      const list = div.querySelector('#history-list');
      for (const h of historyData) {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = '<span class="app-id">' + h.appId + '</span><span class="app-title">' + h.title.replace(/</g, '&lt;') + '</span><span class="app-date">' + new Date(h.date).toLocaleDateString() + '</span>';
        item.addEventListener('click', () => { $('quick-appid').value = h.appId; switchView('search'); quickGo(); });
        list.appendChild(item);
      }
      main.appendChild(div);
      document.querySelectorAll('.sidebar-item[data-view]').forEach(el => el.classList.remove('active'));
      document.querySelector('[data-view="history"]').classList.add('active');
      Object.keys(pages).forEach(k => pages[k].classList.remove('active'));
    } catch (err) { console.error('history load error:', err); }
  });

  /* DEPOT DOWNLOADER */
  const depotState = {
    manifestPath: null, outputDir: null, depotId: null, entries: [],
    selectedPaths: new Set(), decoded: null,
    fileSelection: new Map(), // path -> { entry, selected }
  };
  const $depot = id => document.getElementById(id);

  $depot('depot-pick-manifest').addEventListener('click', async () => {
    const fp = await window.greed.pickManifestFile();
    if (!fp) return;
    depotState.manifestPath = fp;
    $depot('depot-status').textContent = 'Loading manifest...';
    $depot('depot-info').classList.add('hidden');
    $depot('depot-browser').classList.add('hidden');
    $depot('depot-progress').classList.add('hidden');
    const result = await window.greed.getManifestTree(fp);
    if (!result.success) {
      $depot('depot-status').textContent = 'Error: ' + result.error;
      return;
    }
    depotState.decoded = result;
    depotState.entries = result.entries || [];
    depotState.selectedPaths = new Set();
    depotState.fileSelection = new Map();
    $depot('depot-selected-count').textContent = '0 / ' + result.totalFiles + ' files selected';
    $depot('depot-start-download').disabled = true;
    renderDepotTree();
    const chunkInfo = result.totalChunks ? `, ${result.totalChunks} chunks` : '';
    $depot('depot-status').textContent = `Loaded: ${result.totalFiles} files, ${formatBytes(result.totalSize)}${chunkInfo}`;
    $depot('depot-browser').classList.remove('hidden');
  });

  $depot('depot-pick-output').addEventListener('click', async () => {
    const dir = await window.greed.pickFolder();
    if (dir) {
      depotState.outputDir = dir;
      $depot('depot-info').classList.remove('hidden');
      $depot('depot-info').textContent = 'Output: ' + dir;
    }
  });

  $depot('depot-set-key').addEventListener('click', async () => {
    const depotId = $depot('depot-id').value.trim();
    const keyHex = $depot('depot-key').value.trim();
    if (!depotId || !keyHex) {
      $depot('depot-status').textContent = 'Enter both Depot ID and key hex';
      return;
    }
    await window.greed.depotSetKey({ depotId, keyHex });
    $depot('depot-status').textContent = `Key set for depot ${depotId}`;
  });

  function renderDepotTree() {
    const container = $depot('depot-tree');
    if (!depotState.entries.length) {
      container.innerHTML = '<div class="text-muted">No files in manifest.</div>';
      return;
    }
    container.innerHTML = '<div class="depot-tree-root">' + depotState.entries.map(e => renderDepotEntry(e, 0)).join('') + '</div>';
    container.querySelectorAll('.depot-checkbox').forEach(cb => cb.addEventListener('change', onDepotCheckboxChange));
    container.querySelectorAll('.depot-dir-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.parentElement.nextElementSibling;
        if (sub) {
          sub.classList.toggle('hidden');
          btn.textContent = sub.classList.contains('hidden') ? '▶' : '▼';
        }
      });
    });
  }

  function renderDepotEntry(entry, depth) {
    const pad = depth * 18;
    if (entry.type === 'dir') {
      let h = `<div style="padding-left:${pad}px;white-space:nowrap;">`;
      h += `<span class="depot-dir-toggle" style="cursor:pointer;font-size:10px;user-select:none;">▼</span> `;
      h += `<label style="cursor:pointer;"><input type="checkbox" class="depot-checkbox" data-path="${escHtml(entry.path)}" /> <strong>${escHtml(entry.name)}/</strong></label>`;
      h += `<div class="depot-children">`;
      for (const child of entry.children) h += renderDepotEntry(child, depth + 1);
      h += `</div></div>`;
      return h;
    }
    return `<div style="padding-left:${pad + 18}px;white-space:nowrap;"><label style="cursor:pointer;"><input type="checkbox" class="depot-checkbox" data-path="${escHtml(entry.path)}" /> <span style="color:var(--text-muted);font-size:11px;">${escHtml(entry.name)}</span> <span style="color:var(--text-muted);font-size:10px;">(${formatBytes(entry.size)})</span></label></div>`;
  }

  function onDepotCheckboxChange(e) {
    const cb = e.target;
    const path = cb.dataset.path;
    if (cb.checked) {
      depotState.selectedPaths.add(path);
      cascadeChildren(cb, true);
      cascadeParents(cb);
    } else {
      depotState.selectedPaths.delete(path);
      cascadeChildren(cb, false);
      cascadeParents(cb);
    }
    updateDepotSelectedCount();
  }

  function cascadeChildren(cb, checked) {
    const container = cb.closest('div')?.querySelector('.depot-children');
    if (!container) return;
    container.querySelectorAll('.depot-checkbox').forEach(c => {
      c.checked = checked;
      if (checked) depotState.selectedPaths.add(c.dataset.path);
      else depotState.selectedPaths.delete(c.dataset.path);
    });
  }

  function cascadeParents(cb) {
    let el = cb.closest('.depot-children');
    while (el) {
      const parentDiv = el.previousElementSibling;
      if (!parentDiv) break;
      const parentCb = parentDiv.querySelector('.depot-checkbox');
      if (!parentCb) break;
      const siblingCheckboxes = el.querySelectorAll('.depot-checkbox');
      const allChecked = Array.from(siblingCheckboxes).every(c => c.checked);
      parentCb.checked = allChecked;
      if (allChecked) depotState.selectedPaths.add(parentCb.dataset.path);
      else depotState.selectedPaths.delete(parentCb.dataset.path);
      el = el.parentElement?.closest('.depot-children');
    }
  }

  function updateDepotSelectedCount() {
    const total = depotState.entries.filter(e => e.type === 'file').length;
    const count = depotState.selectedPaths.size;
    $depot('depot-selected-count').textContent = `${count} / ${total} files selected`;
    $depot('depot-start-download').disabled = count === 0 || !depotState.outputDir;
  }

  $depot('depot-select-all').addEventListener('click', () => {
    $depot('depot-tree').querySelectorAll('.depot-checkbox').forEach(cb => {
      cb.checked = true;
      depotState.selectedPaths.add(cb.dataset.path);
    });
    updateDepotSelectedCount();
  });

  $depot('depot-deselect-all').addEventListener('click', () => {
    $depot('depot-tree').querySelectorAll('.depot-checkbox').forEach(cb => {
      cb.checked = false;
      depotState.selectedPaths.delete(cb.dataset.path);
    });
    updateDepotSelectedCount();
  });

  $depot('depot-start-download').addEventListener('click', async () => {
    const depotId = $depot('depot-id').value.trim();
    if (!depotId) { $depot('depot-status').textContent = 'Enter a Depot ID'; return; }
    if (!depotState.outputDir) { $depot('depot-status').textContent = 'Select an output folder first'; return; }

    const selectedFiles = Array.from(depotState.selectedPaths).filter(p => {
      const entry = depotState.entries.find(e => e.path === p);
      return entry && entry.type === 'file';
    });
    if (selectedFiles.length === 0) { $depot('depot-status').textContent = 'No files selected'; return; }

    const key = $depot('depot-key').value.trim() || null;
    $depot('depot-start-download').disabled = true;
    $depot('depot-progress').classList.remove('hidden');
    $depot('depot-progress').textContent = 'Starting download...';
    $depot('depot-progress').className = 'status-bar info';
    $depot('depot-status').textContent = '';

    try {
      const totalSelBytes = selectedFiles.reduce((s, fp) => {
        const e = depotState.entries.find(x => x.path === fp);
        return s + (e ? e.size : 0);
      }, 0);
      $depot('depot-progress').textContent = `Selected ${selectedFiles.length} files (${formatBytes(totalSelBytes)}). Downloading...`;
      $depot('depot-progress').className = 'status-bar info';

      const result = await window.greed.depotDownload({
        manifestPath: depotState.manifestPath,
        depotId,
        selectedPaths: selectedFiles,
        outputDir: depotState.outputDir,
        depotKey: key,
      });
      if (result.success) {
        const ok = result.completedOk || result.completedFiles;
        const msg = result.partial
          ? `Partial: ${ok}/${result.totalFiles} files OK, ${result.missingChunks || 0} chunks missing`
          : `Done: ${ok} file${ok !== 1 ? 's' : ''}, ${formatBytes(result.totalBytes)} written`;
        $depot('depot-progress').textContent = msg;
        $depot('depot-progress').className = 'status-bar success';
        if (result.missingChunks) {
          $depot('depot-status').textContent = `${result.missingChunks} chunks missing from CDN — some files incomplete`;
        }
      } else {
        $depot('depot-progress').textContent = 'Error: ' + (result.error || 'Unknown error');
        $depot('depot-progress').className = 'status-bar error';
      }
    } catch (err) {
      $depot('depot-progress').textContent = 'Error: ' + err.message;
      $depot('depot-progress').className = 'status-bar error';
    }
    $depot('depot-start-download').disabled = false;
  });

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
