/**
 * Singbox 配置生成工具
 * 用于将游戏规则和节点配置转换为 Sing-box 可识别的 JSON 格式
 */

import type { Game, DnsConfigOptions, SingboxConfig } from '@/types'
import type { NodeConfig } from '@/utils/protocol'
import pkg from '../../package.json'

const GEOIP_CN_RULE_SET_TAG = 'geoip-cn'
const LOYALSOLDIER_GEOIP_CN_SRS_URL = 'https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/srs/cn.srs'
const GEOSITE_CN_RULE_SET_TAG = 'geosite-cn'
const SAGERNET_GEOSITE_CN_SRS_URL = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs'

/**
 * 生成 Sing-box 配置文件
 * 
 * @param game 游戏配置对象，包含代理模式和进程信息
 * @param node 节点配置对象，包含服务器地址、协议等
 * @param dnsOptions DNS 配置选项
 * @returns 格式化后的 JSON 字符串
 */
export function generateSingboxConfig(game: Game, node: NodeConfig, dnsOptions?: DnsConfigOptions): string {
  const isRoutingMode = game.proxyMode === 'routing'
  const processes = normalizeProcessNames(Array.isArray(game.processName) ? game.processName : [game.processName])
  const routingRules = Array.isArray(game.routingRules) ? game.routingRules.map(r => String(r).trim()).filter(Boolean) : []
  const hasBypassCn = routingRules.some(r => r.toLowerCase() === 'bypass_cn')
  const hasGlobal = routingRules.some(r => r.toLowerCase() === 'global')
  const routingIpCidrs = normalizeRoutingIpCidrs(routingRules)
  const hasRoutingProcessScope = isRoutingMode && processes.length > 0
  const dnsMode = dnsOptions?.mode || 'secure'
  const dnsPrimary = String(dnsOptions?.primary || 'https://dns.google/dns-query').trim()
  const dnsSecondary = String(dnsOptions?.secondary || 'https://1.1.1.1/dns-query').trim()
  const tunInterfaceName = String(dnsOptions?.tunInterfaceName || pkg.productName).trim() || pkg.productName
  const useSecureDns = dnsMode === 'secure'
  const disableTun = !!dnsOptions?.disableTun
  const localProxyNode = dnsOptions?.localProxyNode
  const localProxyStrictNode = !!dnsOptions?.localProxyStrictNode

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
    inbounds: [],
    /*
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
    */
    outbounds: [
      {
        type: 'selector',
        tag: 'proxy',
        outbounds: localProxyStrictNode ? ['node-out'] : ['node-out', 'direct'],
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
      final: isRoutingMode
        ? ((hasBypassCn || hasGlobal || routingIpCidrs.length === 0) && !hasRoutingProcessScope ? 'proxy' : 'direct')
        : 'direct'
    }
  }

  if (!disableTun) {
    config.inbounds.push({
      type: 'tun',
      tag: 'tun-in',
      interface_name: tunInterfaceName,
      inet4_address: '172.19.0.1/30',
      mtu: 1280,
      auto_route: true,
      strict_route: false,
      stack: 'system',
      sniff: true
    })
  }

  if (dnsOptions?.localProxy?.enabled) {
    const httpPort = dnsOptions.localProxy.port
    const socksPort = httpPort + 1

    // HTTP Proxy
    config.inbounds.push({
      type: 'http',
      tag: 'http-in',
      listen: '127.0.0.1',
      listen_port: httpPort,
      sniff: true,
      set_system_proxy: false
    })

    // SOCKS5 Proxy
    config.inbounds.push({
      type: 'socks',
      tag: 'socks-in',
      listen: '127.0.0.1',
      listen_port: socksPort,
      sniff: true
    })

    const localProxyOutboundTag = localProxyNode ? 'local-proxy' : 'proxy'
    if (localProxyNode) {
      config.outbounds.push({
        type: 'selector',
        tag: 'local-proxy',
        outbounds: ['local-node-out', 'direct'],
        default: 'local-node-out'
      })
      config.outbounds.push(convertNodeToOutbound(localProxyNode, 'local-node-out'))
    }

    // Local mixed proxy inbounds should always tunnel through selected local proxy outbound.
    config.route.rules.push({
      inbound: ['http-in', 'socks-in'],
      outbound: localProxyOutboundTag
    })
  }

  if (useSecureDns) {
    const bootstrapDomains = collectBootstrapDomains(node, localProxyNode)
    if (bootstrapDomains.length > 0) {
      // Avoid DNS bootstrap loop: node server domains must be resolved directly first.
      config.dns.rules.unshift({
        domain: bootstrapDomains,
        server: 'local'
      })
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
    if (hasBypassCn) {
      const privateRule: Record<string, any> = {
        ip_is_private: true,
        outbound: 'direct'
      }
      if (hasRoutingProcessScope) privateRule.process_name = processes
      config.route.rules.push(privateRule)
      ensureRemoteRuleSet(config, {
        tag: GEOIP_CN_RULE_SET_TAG,
        type: 'remote',
        format: 'binary',
        url: LOYALSOLDIER_GEOIP_CN_SRS_URL,
        download_detour: 'proxy'
      })
      ensureRemoteRuleSet(config, {
        tag: GEOSITE_CN_RULE_SET_TAG,
        type: 'remote',
        format: 'binary',
        url: SAGERNET_GEOSITE_CN_SRS_URL,
        download_detour: 'proxy'
      })
      const geoipRule: Record<string, any> = {
        rule_set: [GEOIP_CN_RULE_SET_TAG],
        outbound: 'direct'
      }
      if (hasRoutingProcessScope) geoipRule.process_name = processes
      config.route.rules.push(geoipRule)
      const geositeRule: Record<string, any> = {
        rule_set: [GEOSITE_CN_RULE_SET_TAG],
        outbound: 'direct'
      }
      if (hasRoutingProcessScope) geositeRule.process_name = processes
      config.route.rules.push(geositeRule)
      if (hasRoutingProcessScope) {
        config.route.rules.push({
          process_name: processes,
          outbound: 'proxy'
        })
      }
    } else if (hasGlobal) {
      if (hasRoutingProcessScope) {
        config.route.rules.push({
          process_name: processes,
          outbound: 'proxy'
        })
      }
    } else if (routingIpCidrs.length > 0) {
      const rule: Record<string, any> = {
        ip_cidr: routingIpCidrs,
        outbound: 'proxy'
      }
      if (processes.length > 0) {
        rule.process_name = processes
      }
      config.route.rules.push(rule)
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
function convertNodeToOutbound(node: NodeConfig, tag: string = 'node-out'): any {
  const base = {
    tag,
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
          server_name: resolveTlsServerName(node),
          insecure: !!node.tls?.insecure
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
    server_name: resolveTlsServerName(node),
    insecure: !!node.tls.insecure,
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

function resolveTlsServerName(node: NodeConfig): string | undefined {
  const candidates = [
    node.tls?.server_name,
    node.host,
    node.server
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    if (!isIpLiteral(candidate)) return candidate
  }
  return undefined
}

function isIpLiteral(value: string): boolean {
  const v = String(value ?? '').trim()
  if (!v) return false
  if (v.includes(':')) return true // IPv6 literal
  const parts = v.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function collectBootstrapDomains(...nodes: Array<NodeConfig | undefined>): string[] {
  const set = new Set<string>()
  for (const node of nodes) {
    const domain = String(node?.server || '').trim().toLowerCase()
    if (!domain || isIpLiteral(domain)) continue
    set.add(domain)
  }
  return Array.from(set)
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
    for (const alias of expandProcessAliases(p)) {
      set.add(alias)
      const lower = alias.toLowerCase()
      if (lower !== alias) set.add(lower)
    }
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

function expandProcessAliases(processName: string): string[] {
  const value = String(processName || '').trim()
  if (!value) return []
  const aliases = new Set<string>([value])

  // Tolerate users entering "chrome" instead of "chrome.exe" on Windows.
  if (!value.includes('.') && !value.includes('/') && !value.includes('\\')) {
    aliases.add(`${value}.exe`)
  }

  return Array.from(aliases)
}

function ensureRemoteRuleSet(config: SingboxConfig, ruleSet: Record<string, any>) {
  const route = config.route as any
  if (!Array.isArray(route.rule_set)) {
    route.rule_set = []
  }
  if (route.rule_set.some((item: any) => String(item?.tag || '') === String(ruleSet.tag || ''))) {
    return
  }
  route.rule_set.push(ruleSet)
}

function normalizeRoutingIpCidrs(rules: string[]): string[] {
  const set = new Set<string>()
  for (const raw of rules) {
    const value = String(raw || '').trim()
    if (!value) continue
    const lower = value.toLowerCase()
    if (lower === 'bypass_cn' || lower === 'global') continue

    if (isIpLiteral(value)) {
      set.add(value.includes(':') ? `${value}/128` : `${value}/32`)
      continue
    }
    if (isValidCidr(value)) {
      set.add(value)
    }
  }
  return Array.from(set)
}

function isValidCidr(value: string): boolean {
  const s = String(value || '').trim()
  if (!s.includes('/')) return false
  const [ip, prefix] = s.split('/')
  if (!ip || !prefix || !/^\d+$/.test(prefix)) return false
  const bits = Number(prefix)

  if (ip.includes(':')) {
    return bits >= 0 && bits <= 128
  }

  if (!isIpLiteral(ip)) return false
  return bits >= 0 && bits <= 32
}
