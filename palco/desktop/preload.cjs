const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('palcoDesktop', {
  saveProject: content => ipcRenderer.invoke('project:save', content),
  openProject: () => ipcRenderer.invoke('project:open'),
  confirmDiscard: () => ipcRenderer.invoke('project:confirm-discard')
});
