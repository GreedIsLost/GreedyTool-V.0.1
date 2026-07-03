function formatManifestId(id) {
  const num = Number(id);
  return Number.isInteger(num) ? num.toString() : '0';
}

function escapeLuaString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function generateLua(appId, title = 'Unknown Game', depots = []) {
  const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  let lua = `-- Greed Lua Manifest\n`;
  lua += `-- AppID: ${appId} | Generated: ${timestamp}\n\n`;
  lua += `return {\n`;
  lua += `    appid = ${appId},\n`;
  lua += `    name = "${escapeLuaString(title)}",\n`;
  lua += `    depots = {\n`;
  for (const d of depots) {
    const mid = d.manifestId ? formatManifestId(d.manifestId) : '0';
    lua += `        [${d.depotId}] = { manifestid = ${mid} },\n`;
  }
  lua += `    },\n`;
  lua += `}`;
  return lua;
}

module.exports = { generateLua };
