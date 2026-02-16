import { contextBridge, ipcRenderer } from 'electron'

const ipcListenerMap = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>()

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
  getProcessTree: () => ipcRenderer.invoke('process-tree'),
  ping: (host: string) => ipcRenderer.invoke('system:ping', host),
  tcpPing: (host: string, port: number) => ipcRenderer.invoke('system:tcp-ping', host, port),
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
