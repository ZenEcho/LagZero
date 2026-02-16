"use strict";
const electron = require("electron");
const ipcListenerMap = /* @__PURE__ */ new Map();
electron.contextBridge.exposeInMainWorld("electron", {
  minimize: () => electron.ipcRenderer.invoke("window-minimize"),
  maximize: () => electron.ipcRenderer.invoke("window-maximize"),
  close: () => electron.ipcRenderer.invoke("window-close"),
  pickImage: () => electron.ipcRenderer.invoke("dialog:pick-image"),
  pickProcess: () => electron.ipcRenderer.invoke("dialog:pick-process"),
  pickProcessFolder: (maxDepth) => electron.ipcRenderer.invoke("dialog:pick-process-folder", maxDepth),
  on: (channel, callback) => {
    const wrapped = (_event, ...args) => callback(...args);
    const channelMap = ipcListenerMap.get(channel) || /* @__PURE__ */ new Map();
    channelMap.set(callback, wrapped);
    ipcListenerMap.set(channel, channelMap);
    electron.ipcRenderer.on(channel, wrapped);
  },
  off: (channel, callback) => {
    const channelMap = ipcListenerMap.get(channel);
    const wrapped = channelMap?.get(callback);
    if (!wrapped) return;
    electron.ipcRenderer.removeListener(channel, wrapped);
    channelMap?.delete(callback);
  }
});
electron.contextBridge.exposeInMainWorld("singbox", {
  start: (config) => electron.ipcRenderer.invoke("singbox-start", config),
  stop: () => electron.ipcRenderer.invoke("singbox-stop"),
  restart: (config) => electron.ipcRenderer.invoke("singbox-restart", config)
});
electron.contextBridge.exposeInMainWorld("system", {
  scanProcesses: () => electron.ipcRenderer.invoke("process-scan"),
  getProcessTree: () => electron.ipcRenderer.invoke("process-tree"),
  ping: (host) => electron.ipcRenderer.invoke("system:ping", host),
  tcpPing: (host, port) => electron.ipcRenderer.invoke("system:tcp-ping", host, port)
});
electron.contextBridge.exposeInMainWorld("proxyMonitor", {
  start: (gameId, processNames) => electron.ipcRenderer.invoke("proxy-monitor:start", gameId, processNames),
  stop: () => electron.ipcRenderer.invoke("proxy-monitor:stop")
});
electron.contextBridge.exposeInMainWorld("nodes", {
  getAll: () => electron.ipcRenderer.invoke("nodes:get-all"),
  save: (node) => electron.ipcRenderer.invoke("nodes:save", node),
  delete: (id) => electron.ipcRenderer.invoke("nodes:delete", id),
  import: (nodes) => electron.ipcRenderer.invoke("nodes:import", nodes)
});
electron.contextBridge.exposeInMainWorld("games", {
  getAll: () => electron.ipcRenderer.invoke("games:get-all"),
  save: (game) => electron.ipcRenderer.invoke("games:save", game),
  delete: (id) => electron.ipcRenderer.invoke("games:delete", id)
});
electron.contextBridge.exposeInMainWorld("categories", {
  getAll: () => electron.ipcRenderer.invoke("categories:get-all"),
  save: (category) => electron.ipcRenderer.invoke("categories:save", category),
  delete: (id) => electron.ipcRenderer.invoke("categories:delete", id)
});
