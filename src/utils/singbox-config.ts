/**
 * Singbox 配置生成工具
 * 用于将游戏规则和节点配置转换为 Sing-box 可识别的 JSON 格式
 */

import type { Game } from '@/types'
import type { NodeConfig } from '@/utils/protocol'
import pkg from '../../package.json'

/**
 * Singbox 核心配置结构接口
 */
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

/**
 * DNS 配置选项
 */
export interface DnsConfigOptions {
  mode?: 'secure' | 'system'   // DNS 模式：安全模式 (DoH/DoT) 或 系统解析
  primary?: string            // 主 DNS 服务器地址
  secondary?: string          // 备用 DNS 服务器地址
}

/**
 * 生成 Sing-box 配置文件
 * 
 * @param game 游戏配置对象，包含代理模式和进程信息
 * @param node 节点配置对象，包含服务器地址、协议等
 * @param dnsOptions DNS 配置选项
 * @returns 格式化后的 JSON 字符串
 */
export function generateSingboxConfig(game: Game, node: NodeConfig, dnsOptions?: DnsConfigOptions & { tunInterfaceName?: string }): string {
  const isRoutingMode = game.proxyMode === 'routing'
  const processes = normalizeProcessNames(Array.isArray(game.processName) ? game.processName : [game.processName])
  const dnsMode = dnsOptions?.mode || 'secure'
  const dnsPrimary = String(dnsOptions?.primary || 'https://dns.google/dns-query').trim()
  const dnsSecondary = String(dnsOptions?.secondary || 'https://1.1.1.1/dns-query').trim()
  const tunInterfaceName = String(dnsOptions?.tunInterfaceName || pkg.productName).trim() || pkg.productName
  const useSecureDns = dnsMode === 'secure'

  // 基础配置结构
  const config: SingboxConfig = {
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      servers: [
        ...(useSecureDns ? [
          // 在安全模式下，通过代理使用加密 DNS 以减少 DNS 污染风险
          { tag: 'remote-primary', address: dnsPrimary, detour: 'proxy', strategy: 'ipv4_only' },
          { tag: 'remote-secondary', address: dnsSecondary, detour: 'proxy', strategy: 'ipv4_only' },
        ] : []),
        { tag: 'local', address: 'local', detour: 'direct', strategy: 'ipv4_only' },
        { tag: 'block', address: 'rcode://success' }
      ],
      rules: useSecureDns ? [] : [
        { outbound: 'any', server: 'local' }
      ],
      final: useSecureDns ? 'remote-primary' : 'local'
    },
    inbounds: [
      {
        type: 'tun', // 虚拟网卡类型
        tag: 'tun-in', // 虚拟网卡标签
        interface_name: tunInterfaceName, // 虚拟网卡名称
        inet4_address: '172.19.0.1/30', // 虚拟网卡 IP 地址
        mtu: 1280, // 1280 是 Sing-box 推荐的 MTU 值
        auto_route: true, // 自动路由
        strict_route: false, // 设置为 true 可以绝对防止泄漏，但 false 兼容性更好
        stack: 'system', // 可选 'gvisor', 'system' 或 'mixed'
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

  // 1. 将节点配置转换为 Outbound 格式并添加到配置中
  const nodeOutbound = convertNodeToOutbound(node)
  config.outbounds.push(nodeOutbound)

  // 2. 配置 DNS 规则：如果开启了安全 DNS 且定义了进程，则强制该进程使用远端 DNS
  if (processes.length > 0 && useSecureDns) {
    config.dns.rules.unshift({
      process_name: processes,
      server: 'remote-primary'
    })
  }

  // 3. 配置路由规则
  if (isRoutingMode) {
    // 路由模式：处理“绕过中国大陆”或“全局代理”
    const routingRules = game.routingRules || []

    if (routingRules.includes('bypass_cn')) {
      // 绕过中国大陆规则
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
      // 默认出口在 config.route.final 中已设置为 'proxy'
    } else {
      // 全局模式（或默认路由）
      // 默认出口为 'proxy'
    }

  } else {
    // 进程模式：仅指定的游戏进程走代理，其余默认直连
    if (processes.length > 0) {
      config.route.rules.push({
        process_name: processes,
        outbound: 'proxy'
      })
    }
  }

  return JSON.stringify(config, null, 2)
}

/**
 * 将通用的 NodeConfig 转换为 Sing-box 的 Outbound 结构
 * 
 * @param node 原始节点配置
 * @returns Sing-box outbound 对象
 */
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
      // 默认回退到 socks
      return {
        ...base,
        type: 'socks',
      }
  }
}

/**
 * 构建传输层配置（WebSocket, gRPC 等）
 */
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

/**
 * 构建 TLS 配置
 */
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

  // 处理 Reality 配置
  if (node.tls.reality?.enabled) {
    tls.reality = {
      enabled: true,
      public_key: node.tls.reality.public_key,
      short_id: node.tls.reality.short_id
    }
  }

  return tls
}

/**
 * 标准化进程名称列表
 * 去除路径只保留文件名，并添加小写版本以提高兼容性
 */
function normalizeProcessNames(processes: string[]): string[] {
  const items = processes
    .map(p => toProcessBaseName(String(p ?? '').trim()))
    .filter(Boolean)

  const set = new Set<string>()
  items.forEach(p => {
    set.add(p)
    const lower = p.toLowerCase()
    if (lower !== p) set.add(lower)
  })

  return Array.from(set)
}

/**
 * 获取进程的基础文件名（去除路径和 Windows 的反斜杠）
 */
function toProcessBaseName(processName: string): string {
  const value = String(processName || '').trim()
  if (!value) return ''
  const normalized = value.replace(/\\/g, '/')
  const base = normalized.split('/').pop() || normalized
  return base.trim()
}
