"use strict";
const electron = require("electron");
const ipcListenerMap = /* @__PURE__ */ new Map();
const appLogListenerMap = /* @__PURE__ */ new Map();
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
  scanLocalGames: () => electron.ipcRenderer.invoke("system:scan-local-games"),
  getProcessTree: () => electron.ipcRenderer.invoke("process-tree"),
  ping: (host) => electron.ipcRenderer.invoke("system:ping", host),
  tcpPing: (host, port) => electron.ipcRenderer.invoke("system:tcp-ping", host, port),
  flushDnsCache: () => electron.ipcRenderer.invoke("system:flush-dns-cache"),
  reinstallTunAdapter: (interfaceName) => electron.ipcRenderer.invoke("system:tun-reinstall", interfaceName)
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
electron.contextBridge.exposeInMainWorld("app", {
  getVersion: () => electron.ipcRenderer.invoke("app:get-version"),
  checkUpdate: () => electron.ipcRenderer.invoke("app:check-update"),
  openUrl: (url) => electron.ipcRenderer.invoke("app:open-url", url)
});
electron.contextBridge.exposeInMainWorld("logs", {
  getAll: () => electron.ipcRenderer.invoke("logs:get-all"),
  clear: () => electron.ipcRenderer.invoke("logs:clear"),
  pushFrontend: (entry) => electron.ipcRenderer.invoke("logs:push-frontend", entry),
  onNew: (callback) => {
    const wrapped = (_event, entry) => callback(entry);
    appLogListenerMap.set(callback, wrapped);
    electron.ipcRenderer.on("app-log:new", wrapped);
  },
  offNew: (callback) => {
    const wrapped = appLogListenerMap.get(callback);
    if (!wrapped) return;
    electron.ipcRenderer.removeListener("app-log:new", wrapped);
    appLogListenerMap.delete(callback);
  }
});
