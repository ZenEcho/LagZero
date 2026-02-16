export interface Game {
  id: string
  name: string
  iconUrl?: string
  processName: string | string[]
  category: string
  tags?: string[]
  profileId?: string
  lastPlayed?: number
  status?: 'idle' | 'accelerating'
  latency?: number
  nodeId?: string
  proxyMode?: 'process' | 'routing'
  routingRules?: string[]
  chainProxy?: boolean
}

export interface Category {
  id: string
  name: string
  parentId?: string
  rules?: string[]
  order?: number
}

export interface ConfigProfile {
  id: string
  name: string
  description?: string
  rules: {
    type: 'process' | 'domain' | 'ip'
    value: string[]
    outbound: 'proxy' | 'direct' | 'block'
  }[]
  chainProxy: boolean
}

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  path?: string
  children?: ProcessInfo[]
}

declare global {
  interface ElectronAPI {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    pickImage: () => Promise<string | null>
    pickProcess: () => Promise<string[] | null>
    pickProcessFolder: (maxDepth?: number) => Promise<string[] | null>
    on: (channel: string, callback: (...args: any[]) => void) => void
    off: (channel: string, callback: (...args: any[]) => void) => void
  }

  interface SingBoxAPI {
    start: (config: string) => Promise<void>
    stop: () => Promise<void>
    restart: (config: string) => Promise<void>
  }

  interface GamesAPI {
    getAll: () => Promise<Game[]>
    save: (game: Game) => Promise<Game[]>
    delete: (id: string) => Promise<Game[]>
  }

  interface CategoriesAPI {
    getAll: () => Promise<Category[]>
    save: (category: Category) => Promise<Category[]>
    delete: (id: string) => Promise<Category[]>
  }

  interface ProfilesAPI {
    getAll: () => Promise<ConfigProfile[]>
    save: (profile: ConfigProfile) => Promise<ConfigProfile[]>
    delete: (id: string) => Promise<ConfigProfile[]>
  }

  interface SystemAPI {
    scanProcesses: () => Promise<string[]>
    getProcessTree: () => Promise<ProcessInfo[]>
    ping: (host: string) => Promise<{ latency: number; loss: number }>
    tcpPing: (host: string, port: number) => Promise<{ latency: number; loss: number }>
  }

  interface ProxyMonitorAPI {
    start: (gameId: string, processNames: string[]) => Promise<void>
    stop: () => Promise<void>
  }

  interface NodesAPI {
    getAll: () => Promise<any[]>
    save: (node: any) => Promise<any[]>
    delete: (id: string) => Promise<any[]>
    import: (nodes: any[]) => Promise<any[]>
  }

  interface Window {
    electron: ElectronAPI
    singbox: SingBoxAPI
    games: GamesAPI
    categories: CategoriesAPI
    profiles: ProfilesAPI
    system: SystemAPI
    proxyMonitor: ProxyMonitorAPI
    nodes: NodesAPI
  }
}

export { }
