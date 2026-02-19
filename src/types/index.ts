export interface Game {
    id?: string
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
    icon?: string
    order?: number
}

export interface NodeConfig {
  id?: string // Added ID for management
  type: string
  tag: string
  server: string
  server_port: number
  uuid?: string
  password?: string
  method?: string
  plugin?: string
  plugin_opts?: string
  network?: string
  security?: string
  path?: string
  host?: string
  service_name?: string
  alpn?: string
  fingerprint?: string
  tls?: {
    enabled: boolean
    server_name?: string
    insecure?: boolean
    utls?: {
      enabled: boolean
      fingerprint: string
    }
    reality?: {
      enabled: boolean
      public_key?: string
      short_id?: string
    }
  }
  flow?: string
  packet_encoding?: string
  username?: string
}

// Settings Types
export type CheckMethod = 'ping' | 'tcp' | 'http'
export type DnsMode = 'secure' | 'system'

// Theme Types
export type Theme = 'light' | 'dark' | 'auto'
export type ThemeColor = 'green' | 'blue' | 'purple' | 'orange' | 'red'

// Singbox Config Types
export interface DnsConfigOptions {
  mode?: 'secure' | 'system'   // DNS 模式：安全模式 (DoH/DoT) 或 系统解析
  primary?: string            // 主 DNS 服务器地址
  secondary?: string          // 备用 DNS 服务器地址
  tunInterfaceName?: string
  disableTun?: boolean
  localProxyNode?: NodeConfig
  localProxyStrictNode?: boolean
  localProxy?: {
    enabled: boolean
    port: number
  }
}

// Latency Session Types
export interface LatencyRecord {
  id?: number
  nodeKey: string
  server: string
  port: number
  method: 'ping' | 'tcp' | 'http'
  latency: number
  loss: number
  timestamp: number
  gameId?: string
  accelerationSeconds?: number
  sessionLossRate?: number
}

// Singbox Internal Config
export interface SingboxConfig {
  log: {
    level: string
    timestamp: boolean
  }
  dns: {
    servers: any[]
    rules: any[]
    final?: string
  }
  inbounds: any[]
  outbounds: any[]
  route: {
    rules: any[]
    rule_set?: any[]
    auto_detect_interface: boolean
    final?: string
  }
  experimental?: {
    cache_file?: {
      enabled: boolean
    }
  }
}

// System/Scanner Types
export type LocalScanGame = {
  name: string
  processName: string
  source: 'steam' | 'microsoft' | 'epic' | 'ea'
  installDir: string
}

// Node Check Context
export interface CheckRecordContext {
  recordLatency?: boolean
  gameId?: string
  accelerationSeconds?: number
  sessionLossRate?: number
}

// Logger Types
export type FrontendLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type FrontendLogPayload = {
  level: FrontendLogLevel
  source: string
  message: string
  detail?: string
}
