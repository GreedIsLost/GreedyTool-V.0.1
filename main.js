const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "Greed",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('renderer/index.html');
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


ipcMain.handle('generate-lua', async (event, data) => {
  const { generateLua } = require('./core/lua');
  return generateLua(data.appId, data.title, data.depots || []);
});

ipcMain.handle('download-with-appid', async (event, appId) => {
  const { downloadWithAppId } = require('./core/manifest');
  return await downloadWithAppId(appId);
});

ipcMain.handle('import-to-steam', async (event, { appId, luaContent }) => {
  try {
    const steamPath = 'C:\\Program Files (x86)\\Steam';
    const steamappsPath = path.join(steamPath, 'steamapps');

    
    fs.writeFileSync(path.join(steamappsPath, `${appId}.lua`), luaContent);

    
    const vdf = `"AppState"
{
	"appid"		"${appId}"
	"StateFlags"		"4"
	"installdir"		"greed_${appId}"
	"SizeOnDisk"		"0"
	"StagingSize"		"0"
}`;
    fs.writeFileSync(path.join(steamappsPath, `appmanifest_${appId}.acf`), vdf);

    
    exec('taskkill /F /IM steam.exe', () => {
      setTimeout(() => {
        exec(`"${steamPath}\\steam.exe" -silent`);
      }, 3000);
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});