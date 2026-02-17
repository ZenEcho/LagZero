import type { Game } from '@/types'
import type { NodeConfig } from '@/utils/protocol'

interface SingboxConfig {
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
    auto_detect_interface: boolean
    final?: string
  }
  experimental?: {
    cache_file?: {
      enabled: boolean
    }
  }
}

export interface DnsConfigOptions {
  mode?: 'secure' | 'system'
  primary?: string
  secondary?: string
}

export function generateSingboxConfig(game: Game, node: NodeConfig, dnsOptions?: DnsConfigOptions): string {
  const isRoutingMode = game.proxyMode === 'routing'
  const processes = normalizeProcessNames(Array.isArray(game.processName) ? game.processName : [game.processName])
  const googleDomains = ['google.com', 'youtube.com', 'gstatic.com', 'googleapis.com', 'ytimg.com', 'ggpht.com']
  const googleKeywords = ['google', 'youtube']
  const dnsMode = dnsOptions?.mode || 'secure'
  const dnsPrimary = String(dnsOptions?.primary || 'https://dns.google/dns-query').trim()
  const dnsSecondary = String(dnsOptions?.secondary || 'https://1.1.1.1/dns-query').trim()
  const useSecureDns = dnsMode === 'secure'

  // Basic Config Structure
  const config: SingboxConfig = {
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      servers: [
        ...(useSecureDns ? [
          // Use encrypted DNS through proxy to reduce DNS poisoning risk.
          { tag: 'remote-primary', address: dnsPrimary, detour: 'proxy', strategy: 'ipv4_only' },
          { tag: 'remote-secondary', address: dnsSecondary, detour: 'proxy', strategy: 'ipv4_only' },
        ] : []),
        { tag: 'local', address: 'local', detour: 'direct', strategy: 'ipv4_only' },
        { tag: 'block', address: 'rcode://success' }
      ],
      rules: isRoutingMode ? [] : [
        { outbound: 'any', server: 'local' }
      ],
      final: isRoutingMode && useSecureDns ? 'remote-primary' : 'local'
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'singbox-tun',
        inet4_address: '172.19.0.1/30',
        mtu: 1280,
        auto_route: true,
        strict_route: false, // Set to true if you want to prevent leaks absolutely, but false is safer for compatibility
        stack: 'system', // 'gvisor' or 'system' or 'mixed'
        sniff: true
      }
    ],
    outbounds: [
      {
        type: 'selector',
        tag: 'proxy',
        outbounds: ['node-out', 'direct'],
        default: 'node-out'
      },
      {
        type: 'direct',
        tag: 'direct'
      },
      {
        type: 'block',
        tag: 'block'
      },
      {
        type: 'dns',
        tag: 'dns-out'
      }
    ],
    route: {
      rules: [
        { protocol: 'dns', outbound: 'dns-out' }
      ],
      auto_detect_interface: true,
      final: isRoutingMode ? 'proxy' : 'direct'
    }
  }

  // 1. Convert Node to Outbound
  const nodeOutbound = convertNodeToOutbound(node)
  config.outbounds.push(nodeOutbound)

  // 2. Configure DNS Rules
  // In process mode, avoid global domain DNS detours to prevent affecting other apps.
  if (isRoutingMode && useSecureDns) {
    config.dns.rules.unshift({
      domain_suffix: googleDomains,
      domain_keyword: googleKeywords,
      server: 'remote-primary'
    })
  }

  if (processes.length > 0 && useSecureDns) {
    config.dns.rules.unshift({
      process_name: processes,
      server: 'remote-primary'
    })
  }

  // 3. Configure Route Rules
  if (isRoutingMode) {
    config.route.rules.push({
      domain_suffix: googleDomains,
      domain_keyword: googleKeywords,
      outbound: 'proxy'
    })
  }

  if (isRoutingMode) {
    // Handle "Bypass Mainland China" or "Global" based on routing_rules
    const routingRules = game.routingRules || []

    if (routingRules.includes('bypass_cn')) {
      // Bypass Mainland China Rules
      config.route.rules.push({
        ip_is_private: true,
        outbound: 'direct'
      })
      config.route.rules.push({
        domain_suffix: ['cn'],
        outbound: 'direct'
      })
      config.route.rules.push({
        domain_suffix: [
          'qq.com', 'baidu.com', 'bilibili.com', 'taobao.com', 'tmall.com',
          'jd.com', 'douyin.com', 'douban.com', 'weibo.com', 'zhihu.com',
          'youku.com', 'iqiyi.com', '163.com', 'sina.com.cn', 'alicdn.com'
        ],
        outbound: 'direct'
      })
      // Default final is 'proxy' (set in config.route.final)
    } else {
      // Global Mode (or default routing)
      // Default final is 'proxy'
    }
  } else {
    // Process Mode: Only Game Process -> Proxy, Default -> Direct
    if (processes.length > 0) {
      config.route.rules.push({
        process_name: processes,
        outbound: 'proxy'
      })
    }
  }

  return JSON.stringify(config, null, 2)
}

function convertNodeToOutbound(node: NodeConfig): any {
  const base = {
    tag: 'node-out',
    server: node.server,
    server_port: node.server_port
  }
  const transport = buildTransport(node)
  const tls = buildTls(node)

  switch (node.type) {
    case 'ss':
    case 'shadowsocks':
      return {
        ...base,
        type: 'shadowsocks',
        method: node.method,
        password: node.password,
        plugin: node.plugin,
        plugin_opts: node.plugin_opts
      }
    case 'vmess':
      return {
        ...base,
        type: 'vmess',
        uuid: node.uuid,
        security: node.security || 'auto',
        alter_id: 0,
        transport,
        tls
      }
    case 'vless':
      return {
        ...base,
        type: 'vless',
        uuid: node.uuid,
        flow: node.flow,
        packet_encoding: node.packet_encoding,
        transport,
        tls
      }
    case 'trojan':
      return {
        ...base,
        type: 'trojan',
        password: node.password,
        transport,
        tls: tls || {
          enabled: true,
          server_name: node.tls?.server_name || node.host || node.server,
          insecure: node.tls?.insecure
        }
      }
    case 'socks':
      return {
        ...base,
        type: 'socks',
        username: node.username || undefined,
        password: node.password || undefined
      }
    case 'http':
      return {
        ...base,
        type: 'http',
        username: node.username || undefined,
        password: node.password || undefined,
        tls
      }
    default:
      // Fallback or Error
      return {
        ...base,
        type: 'socks', // Fallback
      }
  }
}

function buildTransport(node: NodeConfig): any {
  const network = String(node.network || 'tcp').trim().toLowerCase()
  if (!network || network === 'tcp') return undefined

  if (network === 'ws') {
    return {
      type: 'ws',
      path: node.path || '/',
      headers: node.host ? { Host: node.host } : undefined
    }
  }

  if (network === 'grpc') {
    return {
      type: 'grpc',
      service_name: node.service_name || ''
    }
  }

  return {
    type: network,
    path: node.path,
    headers: node.host ? { Host: node.host } : undefined
  }
}

function buildTls(node: NodeConfig): any {
  if (!node.tls?.enabled) return undefined

  const alpn = (node.alpn || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

  const fingerprint = node.fingerprint || node.tls.utls?.fingerprint

  const tls: any = {
    enabled: true,
    server_name: node.tls.server_name || node.host || node.server,
    insecure: node.tls.insecure,
    alpn: alpn.length > 0 ? alpn : undefined,
    utls: fingerprint ? {
      enabled: true,
      fingerprint
    } : undefined
  }

  if (node.tls.reality?.enabled) {
    tls.reality = {
      enabled: true,
      public_key: node.tls.reality.public_key,
      short_id: node.tls.reality.short_id
    }
  }

  return tls
}

function normalizeProcessNames(processes: string[]): string[] {
  const items = processes
    .map(p => String(p ?? '').trim())
    .filter(Boolean)

  const set = new Set<string>()
  items.forEach(p => {
    set.add(p)
    const lower = p.toLowerCase()
    if (lower !== p) set.add(lower)
  })

  return Array.from(set)
}
