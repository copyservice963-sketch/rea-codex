const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('palcoDesktop', {
  saveProject: content => ipcRenderer.invoke('project:save', content),
  openProject: () => ipcRenderer.invoke('project:open')
});
