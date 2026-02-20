/**
 * Electron 预加载脚本
 * 
 * 使用 ContextBridge 将主进程 API 安全地暴露给渲染进程。
 * 定义了 electron, singbox, system, proxyMonitor, nodes, games, categories, app, logs 等全局对象。
 * 
 * 注意：
 * 1. 所有暴露的 API 必须通过 ipcRenderer.invoke 或 ipcRenderer.on/send 通信
 * 2. 避免直接暴露 ipcRenderer 对象，防止安全风险
 */
import { contextBridge, ipcRenderer } from 'electron'

const ipcListenerMap = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>()
const appLogListenerMap = new Map<(entry: any) => void, (...args: any[]) => void>()

// 基础 Electron 功能
contextBridge.exposeInMainWorld('electron', {
  /** 最小化窗口 */
  minimize: () => ipcRenderer.invoke('window-minimize'),
  /** 最大化/还原窗口 */
  maximize: () => ipcRenderer.invoke('window-maximize'),
  /** 关闭窗口 */
  close: () => ipcRenderer.invoke('window-close'),
  /** 选择图片文件 */
  pickImage: () => ipcRenderer.invoke('dialog:pick-image'),
  /** 选择可执行文件 (.exe) */
  pickProcess: () => ipcRenderer.invoke('dialog:pick-process'),
  /** 选择并扫描文件夹中的可执行文件 */
  pickProcessFolder: (maxDepth?: number) => ipcRenderer.invoke('dialog:pick-process-folder', maxDepth),
  
  /** 
   * 注册 IPC 事件监听器 
   * @param channel 频道名称
   * @param callback 回调函数
   */
  on: (channel: string, callback: (...args: any[]) => void) => {
    const wrapped = (_event: any, ...args: any[]) => callback(...args)
    const channelMap = ipcListenerMap.get(channel) || new Map()
    channelMap.set(callback, wrapped)
    ipcListenerMap.set(channel, channelMap)
    ipcRenderer.on(channel, wrapped)
  },
  
  /**
   * 移除 IPC 事件监听器
   * @param channel 频道名称
   * @param callback 原回调函数引用
   */
  off: (channel: string, callback: (...args: any[]) => void) => {
    const channelMap = ipcListenerMap.get(channel)
    const wrapped = channelMap?.get(callback)
    if (!wrapped) return
    ipcRenderer.removeListener(channel, wrapped)
    channelMap?.delete(callback)
  }
})

// Sing-box 内核控制
contextBridge.exposeInMainWorld('singbox', {
  /** 启动内核 */
  start: (config: string) => ipcRenderer.invoke('singbox-start', config),
  /** 停止内核 */
  stop: () => ipcRenderer.invoke('singbox-stop'),
  /** 重启内核 */
  restart: (config: string) => ipcRenderer.invoke('singbox-restart', config),
})

// 系统底层功能
contextBridge.exposeInMainWorld('system', {
  /** 扫描系统进程 */
  scanProcesses: () => ipcRenderer.invoke('process-scan'),
  /** 扫描本地已安装的游戏 (Steam/Xbox/Epic/EA) */
  scanLocalGames: () => ipcRenderer.invoke('system:scan-local-games'),
  /** 获取进程树 */
  getProcessTree: () => ipcRenderer.invoke('process-tree'),
  /** ICMP Ping 测试 */
  ping: (host: string) => ipcRenderer.invoke('system:ping', host),
  /** TCP Ping 测试 */
  tcpPing: (host: string, port: number) => ipcRenderer.invoke('system:tcp-ping', host, port),
  /** 刷新 DNS 缓存 */
  flushDnsCache: () => ipcRenderer.invoke('system:flush-dns-cache'),
  /** 重置 TUN 虚拟网卡 */
  reinstallTunAdapter: (interfaceName?: string) => ipcRenderer.invoke('system:tun-reinstall', interfaceName),
  /** 查找可用端口 */
  findAvailablePort: (port: number, count?: number) => ipcRenderer.invoke('system:find-available-port', port, count),
  /** 测试 HTTP 代理连通性 */
  testHttpProxyConnect: (proxyPort: number, targetHost: string, targetPort?: number, timeoutMs?: number) =>
    ipcRenderer.invoke('system:test-http-proxy-connect', proxyPort, targetHost, targetPort, timeoutMs),
  /** 设置系统代理 */
  setSystemProxy: (port: number, bypass?: string) => ipcRenderer.invoke('system:set-system-proxy', port, bypass),
  /** 清除系统代理 */
  clearSystemProxy: (snapshot?: any) => ipcRenderer.invoke('system:clear-system-proxy', snapshot),
  /** 获取当前系统代理状态 */
  getSystemProxyState: () => ipcRenderer.invoke('system:get-system-proxy-state'),
})

// 进程代理监控
contextBridge.exposeInMainWorld('proxyMonitor', {
  /** 开始监控指定游戏进程启动 */
  start: (gameId: string, processNames: string[]) => ipcRenderer.invoke('proxy-monitor:start', gameId, processNames),
  /** 停止监控 */
  stop: () => ipcRenderer.invoke('proxy-monitor:stop'),
})

// 节点管理
contextBridge.exposeInMainWorld('nodes', {
  getAll: () => ipcRenderer.invoke('nodes:get-all'),
  save: (node: any) => ipcRenderer.invoke('nodes:save', node),
  delete: (id: string) => ipcRenderer.invoke('nodes:delete', id),
  import: (nodes: any[]) => ipcRenderer.invoke('nodes:import', nodes),
})

// 游戏管理
contextBridge.exposeInMainWorld('games', {
  getAll: () => ipcRenderer.invoke('games:get-all'),
  save: (game: any) => ipcRenderer.invoke('games:save', game),
  delete: (id: string) => ipcRenderer.invoke('games:delete', id),
})

// 分类管理
contextBridge.exposeInMainWorld('categories', {
  getAll: () => ipcRenderer.invoke('categories:get-all'),
  save: (category: any) => ipcRenderer.invoke('categories:save', category),
  delete: (id: string) => ipcRenderer.invoke('categories:delete', id),
  match: (name: string, processes: string | string[]) => ipcRenderer.invoke('categories:match', name, processes),
})

// 应用元数据与更新
contextBridge.exposeInMainWorld('app', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  openUrl: (url: string) => ipcRenderer.invoke('app:open-url', url),
})

// 日志系统
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
