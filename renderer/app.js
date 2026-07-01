document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generate');

  generateBtn.addEventListener('click', async () => {
    const appId = parseInt(document.getElementById('appid').value);
    if (!appId) return alert("Enter App ID");

    const status = document.getElementById('status') || createStatus();
    status.textContent = `Processing ${appId}...`;

    try {
      const result = await window.greed.downloadWithAppId(appId);

      if (result.success) {
        const luaContent = await window.greed.generateLua({
          appId,
          title: `Game ${appId}`,
          depots: [{ depotId: result.depotId || appId + 1, manifestId: result.manifestId || Date.now() }]
        });

        document.getElementById('output').textContent = luaContent;

        
        const blob = new Blob([luaContent], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${appId}.lua`;
        a.click();

        createImportButton(appId, luaContent);

        status.innerHTML = `✅ Lua downloaded! Click Import below.`;
      } else {
        status.textContent = `❌ ${result.error || 'Unknown error'}`;
      }
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    }
  });

  function createStatus() {
    const el = document.createElement('p');
    el.id = 'status';
    document.body.appendChild(el);
    return el;
  }

  function createImportButton(appId, luaContent) {
    const btn = document.createElement('button');
    btn.textContent = "Import to Steam + Restart";
    btn.style.margin = "10px 0";
    btn.style.padding = "10px 20px";
    btn.onclick = () => window.greed.importToSteam({ appId, luaContent });
    document.body.appendChild(btn);
  }
});