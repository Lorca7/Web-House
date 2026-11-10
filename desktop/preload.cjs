// Narrow bridge between the page and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  config: () => ipcRenderer.invoke('config'),
  begin: (name) => ipcRenderer.invoke('begin', name),
  chunk: (id, data) => ipcRenderer.send('chunk', id, data),
  end: (id, header) => ipcRenderer.invoke('end', id, header),
  power: (on) => ipcRenderer.invoke('power', on),
  reveal: (file) => ipcRenderer.invoke('reveal', file),
  chooseFolder: () => ipcRenderer.invoke('chooseFolder'),
  quit: () => ipcRenderer.invoke('quit'),
});
