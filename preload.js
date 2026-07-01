const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('greed', {
  generateLua: (data) => ipcRenderer.invoke('generate-lua', data),
  downloadWithAppId: (appId) => ipcRenderer.invoke('download-with-appid', appId),
  importToSteam: (data) => ipcRenderer.invoke('import-to-steam', data)
});