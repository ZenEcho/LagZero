import type { Game, Category, NodeConfig, Platform } from './index'

export interface ElectronAPI {
  getWindowCloseAction: () => Promise<'ask' | 'minimize' | 'quit'>
  setWindowCloseAction: (action: 'ask' | 'minimize' | 'quit') => Promise<'ask' | 'minimize' | 'quit'>
  submitWindowCloseDecision: (payload: { action: 'minimize' | 'quit' | 'cancel', remember?: boolean }) => Promise<boolean>
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  pickImage: () => Promise<string | null>
  pickProcess: () => Promise<string[] | null>
  pickProcessFolder: (maxDepth?: number) => Promise<string[] | null>
  openDevTools: () => Promise<void>
  on: (channel: string, callback: (...args: any[]) => void) => void
  off: (channel: string, callback: (...args: any[]) => void) => void
  traySyncState: (state: any) => void
  trayGetState: () => Promise<any>
  trayActionToggle: () => void
  trayShowMain: () => Promise<void>
  trayQuit: () => Promise<void>
}

export interface SingboxAPI {
  start: (config: string) => Promise<void>
  stop: () => Promise<void>
  restart: (config: string) => Promise<void>
  ensureCoreInstalled: () => Promise<void>
  getInstallInfo: () => Promise<{
    exists: boolean
    installDir: string
    binaryPath: string
  }>
}

export interface SystemAPI {
  scanProcesses: () => Promise<string[]>
  scanLocalGames: () => Promise<Array<{
    name: string
    processName: string[]
    source: Platform
    installDir: string
  }>>
  getProcessTree: () => Promise<any>
  ping: (host: string) => Promise<number>
  tcpPing: (host: string, port: number) => Promise<number>
  flushDnsCache: () => Promise<{ ok: boolean, code: number, output: string, message: string }>
  reinstallTunAdapter: (interfaceName?: string) => Promise<{ ok: boolean, code: number, output: string, message: string }>
  findAvailablePort: (port: number, count?: number) => Promise<number>
  testHttpProxyConnect: (
    proxyPort: number,
    targetHost: string,
    targetPort?: number,
    timeoutMs?: number
  ) => Promise<{ ok: boolean; statusLine: string; error?: string }>
  setSystemProxy: (port: number, bypass?: string) => Promise<{ ok: boolean; message: string; snapshot?: any }>
  clearSystemProxy: (snapshot?: any) => Promise<{ ok: boolean; message: string }>
  getSystemProxyState: () => Promise<{ ok: boolean; message: string; state?: any }>
  fetchUrl: (url: string, timeoutMs?: number) => Promise<{
    ok: boolean
    status: number
    statusText: string
    body: string
    finalUrl?: string
    error?: string
  }>
  onScanProgress: (callback: (data: { status: string, details?: string }) => void) => void
  offScanProgress: (callback: (data: { status: string, details?: string }) => void) => void
}

export interface ProxyMonitorAPI {
  start: (gameId: string, processNames: string[]) => Promise<void>
  stop: () => Promise<void>
}

export interface NodesAPI {
  getAll: () => Promise<NodeConfig[]>
  save: (node: NodeConfig) => Promise<NodeConfig[]>
  delete: (id: string) => Promise<NodeConfig[]>
  import: (nodes: NodeConfig[]) => Promise<NodeConfig[]>
}

export interface GamesAPI {
  getAll: () => Promise<Game[]>
  save: (game: Game) => Promise<Game[]>
  delete: (id: string) => Promise<Game[]>
}

export interface CategoriesAPI {
  getAll: () => Promise<Category[]>
  save: (category: Category) => Promise<Category[]>
  delete: (id: string) => Promise<Category[]>
  match: (name: string, processes: string | string[]) => Promise<string | null>
}

export interface AppAPI {
  getVersion: () => Promise<string>
  checkUpdate: () => Promise<{
    updateAvailable: boolean
    version?: string
    releaseNotes?: string
    releaseDate?: string
    error?: string
  }>
  openUrl: (url: string) => Promise<void>
  openDir: (dir: string) => Promise<void>
  restart: () => Promise<boolean>
  reset: () => Promise<boolean>
}

export interface LogEntry {
  id: string
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error'
  category: 'frontend' | 'backend' | 'core'
  source: string
  message: string
  detail?: string
}

export interface LogsAPI {
  getAll: () => Promise<LogEntry[]>
  clear: () => Promise<void>
  getFilePath: () => Promise<string>
  getDirPath: () => Promise<string>
  pushFrontend: (entry: Partial<LogEntry>) => Promise<void>
  pushFrontendBatch: (entries: Partial<LogEntry>[]) => Promise<void>
  onNew: (callback: (entry: LogEntry) => void) => void
  offNew: (callback: (entry: LogEntry) => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    singbox: SingboxAPI
    system: SystemAPI
    proxyMonitor: ProxyMonitorAPI
    nodes: NodesAPI
    games: GamesAPI
    categories: CategoriesAPI
    app: AppAPI
    logs: LogsAPI
  }
}
