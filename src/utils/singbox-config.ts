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

export function generateSingboxConfig(game: Game, node: NodeConfig): string {
  const isRoutingMode = game.proxyMode === 'routing'
  const processes = normalizeProcessNames(Array.isArray(game.processName) ? game.processName : [game.processName])
  const googleDomains = ['google.com', 'youtube.com', 'gstatic.com', 'googleapis.com', 'ytimg.com', 'ggpht.com']
  const googleKeywords = ['google', 'youtube']

  // Basic Config Structure
  const config: SingboxConfig = {
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      servers: [
        // Use encrypted DNS over HTTPS through proxy to reduce DNS poisoning risk.
        { tag: 'google', address: 'https://dns.google/dns-query', detour: 'proxy', strategy: 'ipv4_only' },
        { tag: 'cloudflare', address: 'https://1.1.1.1/dns-query', detour: 'proxy', strategy: 'ipv4_only' },
        { tag: 'local', address: 'local', detour: 'direct', strategy: 'ipv4_only' },
        { tag: 'block', address: 'rcode://success' }
      ],
      rules: isRoutingMode ? [] : [
        { outbound: 'any', server: 'local' }
      ],
      final: isRoutingMode ? 'google' : 'local'
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
  if (isRoutingMode) {
    config.dns.rules.unshift({
      domain_suffix: googleDomains,
      domain_keyword: googleKeywords,
      server: 'google'
    })
  }

  if (processes.length > 0) {
    config.dns.rules.unshift({
      process_name: processes,
      server: 'google'
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
        transport: node.network ? {
          type: node.network,
          path: node.path,
          headers: node.host ? { Host: node.host } : undefined
        } : undefined,
        tls: node.tls?.enabled ? {
          enabled: true,
          server_name: node.tls.server_name || node.host,
          insecure: node.tls.insecure,
          utls: node.tls.utls?.enabled ? {
            enabled: true,
            fingerprint: node.tls.utls.fingerprint
          } : undefined
        } : undefined
      }
    case 'vless':
      return {
        ...base,
        type: 'vless',
        uuid: node.uuid,
        flow: node.flow,
        packet_encoding: node.packet_encoding,
        transport: node.network ? {
          type: node.network,
          path: node.path,
          headers: node.host ? { Host: node.host } : undefined
        } : undefined,
        tls: node.tls?.enabled ? {
          enabled: true,
          server_name: node.tls.server_name || node.host,
          insecure: node.tls.insecure,
          utls: node.tls.utls?.enabled ? {
            enabled: true,
            fingerprint: node.tls.utls.fingerprint
          } : undefined
        } : undefined
      }
    case 'trojan':
      return {
        ...base,
        type: 'trojan',
        password: node.password,
        transport: node.network ? {
          type: node.network,
          path: node.path,
          headers: node.host ? { Host: node.host } : undefined
        } : undefined,
        tls: {
          enabled: true,
          server_name: node.tls?.server_name || node.host || node.server,
          insecure: node.tls?.insecure,
          utls: node.tls?.utls?.enabled ? {
            enabled: true,
            fingerprint: node.tls.utls.fingerprint
          } : undefined
        }
      }
    default:
      // Fallback or Error
      return {
        ...base,
        type: 'socks', // Fallback
      }
  }
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
