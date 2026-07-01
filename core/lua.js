function generateLua(appId, title = "Unknown Game", depots = []) {
  let lua = `-- Greed Lua Manifest\n`;
  lua += `-- AppID: ${appId} | Generated: ${new Date().toISOString()}\n\n`;
  lua += `return {\n`;
  lua += `    appid = ${appId},\n`;
  lua += `    name = "${title}",\n`;
  lua += `    depots = {\n`;
  depots.forEach(d => {
    lua += `        [${d.depotId}] = { manifestid = ${d.manifestId} },\n`;
  });
  lua += `    }\n`;
  lua += `}`;
  return lua;
}

module.exports = { generateLua };