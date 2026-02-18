import { contextBridge, ipcRenderer } from 'electron'

const ipcListenerMap = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>()
const appLogListenerMap = new Map<(entry: any) => void, (...args: any[]) => void>()

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  pickImage: () => ipcRenderer.invoke('dialog:pick-image'),
  pickProcess: () => ipcRenderer.invoke('dialog:pick-process'),
  pickProcessFolder: (maxDepth?: number) => ipcRenderer.invoke('dialog:pick-process-folder', maxDepth),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const wrapped = (_event: any, ...args: any[]) => callback(...args)
    const channelMap = ipcListenerMap.get(channel) || new Map()
    channelMap.set(callback, wrapped)
    ipcListenerMap.set(channel, channelMap)
    ipcRenderer.on(channel, wrapped)
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    const channelMap = ipcListenerMap.get(channel)
    const wrapped = channelMap?.get(callback)
    if (!wrapped) return
    ipcRenderer.removeListener(channel, wrapped)
    channelMap?.delete(callback)
  }
})

contextBridge.exposeInMainWorld('singbox', {
  start: (config: string) => ipcRenderer.invoke('singbox-start', config),
  stop: () => ipcRenderer.invoke('singbox-stop'),
  restart: (config: string) => ipcRenderer.invoke('singbox-restart', config),
})

contextBridge.exposeInMainWorld('system', {
  scanProcesses: () => ipcRenderer.invoke('process-scan'),
  scanLocalGames: () => ipcRenderer.invoke('system:scan-local-games'),
  getProcessTree: () => ipcRenderer.invoke('process-tree'),
  ping: (host: string) => ipcRenderer.invoke('system:ping', host),
  tcpPing: (host: string, port: number) => ipcRenderer.invoke('system:tcp-ping', host, port),
  flushDnsCache: () => ipcRenderer.invoke('system:flush-dns-cache'),
  reinstallTunAdapter: (interfaceName?: string) => ipcRenderer.invoke('system:tun-reinstall', interfaceName),
  findAvailablePort: (port: number, count?: number) => ipcRenderer.invoke('system:find-available-port', port, count),
  testHttpProxyConnect: (proxyPort: number, targetHost: string, targetPort?: number, timeoutMs?: number) =>
    ipcRenderer.invoke('system:test-http-proxy-connect', proxyPort, targetHost, targetPort, timeoutMs),
})

contextBridge.exposeInMainWorld('proxyMonitor', {
  start: (gameId: string, processNames: string[]) => ipcRenderer.invoke('proxy-monitor:start', gameId, processNames),
  stop: () => ipcRenderer.invoke('proxy-monitor:stop'),
})

contextBridge.exposeInMainWorld('nodes', {
  getAll: () => ipcRenderer.invoke('nodes:get-all'),
  save: (node: any) => ipcRenderer.invoke('nodes:save', node),
  delete: (id: string) => ipcRenderer.invoke('nodes:delete', id),
  import: (nodes: any[]) => ipcRenderer.invoke('nodes:import', nodes),
})

contextBridge.exposeInMainWorld('games', {
  getAll: () => ipcRenderer.invoke('games:get-all'),
  save: (game: any) => ipcRenderer.invoke('games:save', game),
  delete: (id: string) => ipcRenderer.invoke('games:delete', id),
})

contextBridge.exposeInMainWorld('categories', {
  getAll: () => ipcRenderer.invoke('categories:get-all'),
  save: (category: any) => ipcRenderer.invoke('categories:save', category),
  delete: (id: string) => ipcRenderer.invoke('categories:delete', id),
})

contextBridge.exposeInMainWorld('app', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  openUrl: (url: string) => ipcRenderer.invoke('app:open-url', url),
})

contextBridge.exposeInMainWorld('logs', {
  getAll: () => ipcRenderer.invoke('logs:get-all'),
  clear: () => ipcRenderer.invoke('logs:clear'),
  getFilePath: () => ipcRenderer.invoke('logs:get-file-path'),
  pushFrontend: (entry: any) => ipcRenderer.invoke('logs:push-frontend', entry),
  onNew: (callback: (entry: any) => void) => {
    const wrapped = (_event: any, entry: any) => callback(entry)
    appLogListenerMap.set(callback, wrapped)
    ipcRenderer.on('app-log:new', wrapped)
  },
  offNew: (callback: (entry: any) => void) => {
    const wrapped = appLogListenerMap.get(callback)
    if (!wrapped) return
    ipcRenderer.removeListener('app-log:new', wrapped)
    appLogListenerMap.delete(callback)
  }
})
