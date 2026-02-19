import type { Game, Category, NodeConfig } from './index'

export interface ElectronAPI {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  pickImage: () => Promise<string>
  pickProcess: () => Promise<string[]>
  pickProcessFolder: (maxDepth?: number) => Promise<string[]>
  on: (channel: string, callback: (...args: any[]) => void) => void
  off: (channel: string, callback: (...args: any[]) => void) => void
}

export interface SingboxAPI {
  start: (config: string) => Promise<void>
  stop: () => Promise<void>
  restart: (config: string) => Promise<void>
}

export interface SystemAPI {
  scanProcesses: () => Promise<string[]>
  scanLocalGames: () => Promise<Array<{
    name: string
    processName: string
    source: 'steam' | 'microsoft' | 'epic' | 'ea'
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
  pushFrontend: (entry: Partial<LogEntry>) => Promise<void>
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
