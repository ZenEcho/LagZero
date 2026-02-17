/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  logs: {
    getAll: () => Promise<Array<{
      id: string
      timestamp: number
      level: 'debug' | 'info' | 'warn' | 'error'
      category: 'frontend' | 'backend' | 'core'
      source: string
      message: string
      detail?: string
    }>>
    clear: () => Promise<void>
    pushFrontend: (entry: {
      level?: 'debug' | 'info' | 'warn' | 'error'
      source?: string
      message?: string
      detail?: string
    }) => Promise<void>
    onNew: (callback: (entry: {
      id: string
      timestamp: number
      level: 'debug' | 'info' | 'warn' | 'error'
      category: 'frontend' | 'backend' | 'core'
      source: string
      message: string
      detail?: string
    }) => void) => void
    offNew: (callback: (entry: {
      id: string
      timestamp: number
      level: 'debug' | 'info' | 'warn' | 'error'
      category: 'frontend' | 'backend' | 'core'
      source: string
      message: string
      detail?: string
    }) => void) => void
  }
  electron: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    pickImage: () => Promise<string>
    pickProcess: () => Promise<string[]>
    pickProcessFolder: (maxDepth?: number) => Promise<string[]>
    on: (channel: string, callback: (...args: any[]) => void) => void
    off: (channel: string, callback: (...args: any[]) => void) => void
  }
  singbox: {
    start: (config: string) => Promise<void>
    stop: () => Promise<void>
    restart: (config: string) => Promise<void>
  }
  system: {
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
  }
  proxyMonitor: {
    start: (gameId: string, processNames: string[]) => Promise<void>
    stop: () => Promise<void>
  }
  nodes: {
    getAll: () => Promise<any[]>
    save: (node: any) => Promise<any[]>
    delete: (id: string) => Promise<any[]>
    import: (nodes: any[]) => Promise<any[]>
  }
  games: {
    getAll: () => Promise<any[]>
    save: (game: any) => Promise<any[]>
    delete: (id: string) => Promise<any[]>
  }
  categories: {
    getAll: () => Promise<any[]>
    save: (category: any) => Promise<any[]>
    delete: (id: string) => Promise<any[]>
  }
  app: {
    getVersion: () => Promise<string>
    checkUpdate: () => Promise<{ updateAvailable: boolean; version?: string; releaseDate?: string; releaseNotes?: string; error?: string }>
    openUrl: (url: string) => Promise<void>
  }
}
