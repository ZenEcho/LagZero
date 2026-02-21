/**
 * Singbox 配置生成工具
 * 用于将游戏规则和节点配置转换为 Sing-box 可识别的 JSON 格式
 * 
 * 核心功能：
 * 1. 路由模式与进程模式的配置生成
 * 2. 多协议节点转换 (Shadowsocks, VMess, VLESS, Trojan 等)
 * 3. DNS 策略管理 (防污染、分流)
 * 4. 虚拟网卡 (TUN) 与系统代理配置
 * 5. 网络调优参数处理
 */

import type { Game, DnsConfigOptions, SingboxConfig, SessionNetworkTuningOptions, VlessPacketEncodingOverride } from '@/types'
import type { NodeConfig } from '@/utils/protocol'
import pkg from '../../package.json'
import {
  DEFAULT_DNS_PRIMARY,
  DEFAULT_DNS_SECONDARY,
  GEOIP_CN_RULE_SET_TAG,
  LOYALSOLDIER_GEOIP_CN_SRS_URL,
  GEOSITE_CN_RULE_SET_TAG,
  SAGERNET_GEOSITE_CN_SRS_URL,
  DNS_ADDRESS_STRATEGY,
} from '@/constants'

/**
 * 生成 Sing-box 配置文件
 * 这是整个配置生成的核心入口函数。
 * 
 * @param game 游戏配置对象，包含代理模式（路由/进程）和需要代理的进程列表
 * @param node 节点配置对象，包含服务器地址、端口、协议类型及认证信息
 * @param dnsOptions DNS 及高级网络配置选项，包括 DNS 服务器、TUN 配置、本地代理等
 * @returns 格式化后的 JSON 字符串，可直接写入 config.json 供 Sing-box 使用
 */
export function generateSingboxConfig(game: Game, node: NodeConfig, dnsOptions?: DnsConfigOptions): string {
  // ---------------------------------------------------------------------------
  // 1. 配置上下文解析与预处理
  // ---------------------------------------------------------------------------
  
  // 判断是否为路由模式 (Routing Mode)
  // 路由模式：基于规则分流，通常配合 TUN 模式使用
  // 进程模式：仅代理指定进程的流量
  const isRoutingMode = game.proxyMode === 'routing'
  
  // 标准化进程名称：去除路径、转小写、添加 .exe 后缀等
  const processes = normalizeProcessNames(Array.isArray(game.processName) ? game.processName : [game.processName])
  
  // 加速网络模式：默认为 TUN 模式，也可选系统代理模式
  const accelNetworkMode = dnsOptions?.accelNetworkMode || 'tun'
  
  // 解析路由规则，判断是否包含特殊规则 (bypass_cn, global)
  const routingRules = tokenizeRoutingRules(game.routingRules) // 解析路由规则字符串为数组
  const hasBypassCn = routingRules.some(r => r.toLowerCase() === 'bypass_cn') // 是否包含 bypass_cn 规则
  const hasGlobal = routingRules.some(r => r.toLowerCase() === 'global') // 是否包含全局路由规则
  const routingIpCidrs = normalizeRoutingIpCidrs(routingRules) // 标准化路由规则中的 IP CIDR 格式
  
  // 判断是否为"类全局"路由：包含 bypass_cn、global 或没有指定具体 CIDR 规则
  const isGlobalLikeRouting = hasBypassCn || hasGlobal || routingIpCidrs.length === 0
  
  // 是否指定了进程
  const hasProcessScope = processes.length > 0
  
  // 路由模式下的进程限定逻辑：
  // 如果在路由模式下指定了进程，则所有路由规则（包括 global/bypass_cn）仅对这些进程生效
  // 其他进程将直接直连，不走代理
  const hasRoutingProcessScope = isRoutingMode && hasProcessScope
  
  // DNS 配置解析
  const dnsMode = dnsOptions?.mode || 'secure'
  const dnsPrimary = String(dnsOptions?.primary || DEFAULT_DNS_PRIMARY).trim()
  const dnsSecondary = String(dnsOptions?.secondary || DEFAULT_DNS_SECONDARY).trim()
  const dnsBootstrap = String(dnsOptions?.bootstrap || '').trim()
  const proxyBypassList = String(dnsOptions?.proxyBypassList || '').trim()
  const tunInterfaceName = String(dnsOptions?.tunInterfaceName || pkg.productName).trim() || pkg.productName
  const useSecureDns = dnsMode === 'secure'
  
  // 判断是否禁用 TUN：
  // 1. 用户显式禁用
  // 2. 加速模式选择了 system_proxy
  const disableTun = !!dnsOptions?.disableTun || accelNetworkMode === 'system_proxy'
  
  // DNS 地址策略：
  // Windows TUN + direct IPv6 经常会导致 "An invalid argument was supplied" 错误
  // 因此在 TUN 模式下，强制 DNS 返回 IPv4 地址以提高连接稳定性
  const dnsAddressStrategy = disableTun ? DNS_ADDRESS_STRATEGY : 'ipv4_only'
  
  // 决定是否默认使用远端 DNS：
  // 在以下场景下，为了防止 DNS 污染，必须将远端加密 DNS 设为默认：
  // 1. 路由模式无进程限定（全局代理）：所有流量都走代理，DNS 也应走代理
  // 2. TUN 模式 + 有进程限制：
  //    Windows DNS 查询通常由 svchost.exe 发出，单纯的 process_name 规则无法匹配到游戏进程
  //    因此必须让所有 DNS 默认走远端，否则游戏域名的解析可能会被污染
  const useRemoteDnsAsDefault = useSecureDns && (
    (isRoutingMode && !hasRoutingProcessScope) ||
    (hasProcessScope && !disableTun)
  )
  
  // 本地代理配置（用于让其他设备连接）
  const localProxyNode = dnsOptions?.localProxyNode
  const localProxyStrictNode = !!dnsOptions?.localProxyStrictNode
  
  // 网络微调参数解析
  const sessionTuning = resolveSessionTuning(
    disableTun
      ? { ...dnsOptions?.sessionTuning, enabled: false } as SessionNetworkTuningOptions
      : dnsOptions?.sessionTuning
  )

  // ---------------------------------------------------------------------------
  // 2. 构建基础配置结构 (Log, DNS, Inbounds, Outbounds, Route)
  // ---------------------------------------------------------------------------
  const config: SingboxConfig = {
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      servers: [
        // 远端加密 DNS 服务器配置
        ...(useSecureDns ? [
          // 在安全模式下，通过代理使用加密 DNS 以减少 DNS 污染风险
          { tag: 'remote-primary', address: dnsPrimary, detour: 'proxy', strategy: dnsAddressStrategy },
          { tag: 'remote-secondary', address: dnsSecondary, detour: 'proxy', strategy: dnsAddressStrategy },
          // Bootstrap DNS：用于解析远端 DNS 服务器本身的域名（如果它是域名格式）
          ...(dnsBootstrap ? [{ tag: 'bootstrap', address: dnsBootstrap, detour: 'direct', strategy: dnsAddressStrategy }] : []),
        ] : []),
        // 本地 DNS 服务器（通常是系统默认 DNS）
        { tag: 'local', address: 'local', detour: 'direct', strategy: dnsAddressStrategy },
        // 阻断 DNS（用于屏蔽广告等，目前未使用）
        { tag: 'block', address: 'rcode://success' }
      ],
      // DNS 路由规则
      rules: useSecureDns ? [] : [
        // 非安全模式下，所有 DNS 查询直接走本地
        { outbound: 'any', server: 'local' }
      ],
      // 默认 DNS 服务器策略
      final: useRemoteDnsAsDefault ? 'remote-primary' : 'local'
    },
    inbounds: [], // 后续动态添加
    outbounds: [
      // 代理出口选择器
      {
        type: 'selector',
        tag: 'proxy',
        // 如果开启了 strict 模式，则不允许直连回退
        outbounds: localProxyStrictNode ? ['node-out'] : ['node-out', 'direct'],
        default: 'node-out'
      },
      // 直连出口
      {
        type: 'direct',
        tag: 'direct'
      },
      // 阻断出口
      {
        type: 'block',
        tag: 'block'
      },
      // DNS 出口（用于劫持 DNS 流量）
      {
        type: 'dns',
        tag: 'dns-out'
      }
    ],
    route: {
      rules: [
        // 所有的 DNS 流量都转发给 DNS 模块处理
        { protocol: 'dns', outbound: 'dns-out' }
      ],
      auto_detect_interface: true,
      // 最终兜底规则：
      // 路由模式下，如果是全局类路由且没有进程限制，则默认走代理；否则默认直连
      final: isRoutingMode
        ? (isGlobalLikeRouting && !hasRoutingProcessScope ? 'proxy' : 'direct')
        : 'direct'
    }
  }

  // ---------------------------------------------------------------------------
  // 3. 配置 Inbounds (入站)
  // ---------------------------------------------------------------------------

  // 3.1 TUN Inbound 配置
  if (!disableTun) {
    config.inbounds.push({
      type: 'tun',
      tag: 'tun-in',
      interface_name: tunInterfaceName,
      inet4_address: '172.19.0.1/30',
      // 关键说明：不配置 inet6_address
      // Windows TUN + direct IPv6 会报 "An invalid argument was supplied"，
      // 导致所有走 direct 出站的 IPv6 连接全部失败。
      // 去掉 IPv6 后 TUN 只捕获 IPv4 流量，IPv6 走系统原生网络栈，避免断网。
      mtu: sessionTuning.tunMtu,
      auto_route: true,
      strict_route: sessionTuning.strictRoute,
      stack: sessionTuning.tunStack,
      sniff: true // 开启流量嗅探，用于域名解析
    })
  }

  // 3.2 本地代理 (Local Proxy) 配置
  // 允许用户开启一个本地 HTTP/Socks5 端口，供其他程序或局域网设备使用
  if (dnsOptions?.localProxy?.enabled) {
    const httpPort = dnsOptions.localProxy.port
    const socksPort = httpPort + 1

    // HTTP Proxy Inbound
    config.inbounds.push({
      type: 'http',
      tag: 'http-in',
      listen: '127.0.0.1',
      listen_port: httpPort,
      sniff: true,
      set_system_proxy: false
    })

    // SOCKS5 Proxy Inbound
    config.inbounds.push({
      type: 'socks',
      tag: 'socks-in',
      listen: '127.0.0.1',
      listen_port: socksPort,
      sniff: true
    })

    // 配置本地代理的流量出口
    const localProxyOutboundTag = localProxyNode ? 'local-proxy' : 'proxy'
    
    // 如果指定了独立的本地代理节点
    if (localProxyNode) {
      config.outbounds.push({
        type: 'selector',
        tag: 'local-proxy',
        outbounds: ['local-node-out', 'direct'],
        default: 'local-node-out'
      })
      config.outbounds.push(convertNodeToOutbound(localProxyNode, 'local-node-out'))
    }

    // 路由规则：本地代理入站的流量 -> 指定出口
    config.route.rules.push({
      inbound: ['http-in', 'socks-in'],
      outbound: localProxyOutboundTag
    })
  }

  // 3.3 系统代理 (System Proxy) 配置
  // 当不使用 TUN 模式时，使用 HTTP 代理作为系统代理
  if (dnsOptions?.systemProxy?.enabled) {
    const httpPort = dnsOptions.systemProxy.port

    config.inbounds.push({
      type: 'http',
      tag: 'system-http-in',
      listen: '127.0.0.1',
      listen_port: httpPort,
      sniff: true,
      set_system_proxy: false // 注意：这里仅开启端口，系统代理的设置由外部程序控制
    })

    // 路由逻辑处理：
    // 非路由模式（即进程模式）下，系统代理入站的流量也需要遵循进程规则
    // 只有匹配了 process_name 的流量才走代理
    if (!isRoutingMode) {
      config.route.rules.push({
        inbound: ['system-http-in'],
        process_name: processes,
        outbound: 'proxy'
      })
    }
  }

  // ---------------------------------------------------------------------------
  // 4. 配置路由规则 (Routing Rules)
  // ---------------------------------------------------------------------------

  // 4.1 自定义直连/分流规则
  const customBypassRules = buildCustomBypassDirectRules(proxyBypassList)
  if (customBypassRules.length > 0) {
    config.route.rules.push(...customBypassRules)
  }

  // 4.2 UDP 偏好规则
  const udpRule = buildUdpPreferenceRule(sessionTuning, !disableTun)
  if (udpRule) {
    config.route.rules.push(udpRule)
  }

  // 4.3 DNS Bootstrap 规则
  if (useSecureDns) {
    const bootstrapDomains = collectBootstrapDomains(
      node,
      localProxyNode,
      extractDnsAddressHostname(dnsPrimary),
      extractDnsAddressHostname(dnsSecondary)
    )
    if (bootstrapDomains.length > 0) {
      // 防止 DNS 循环依赖：节点服务器域名必须通过本地/Bootstrap DNS 解析
      config.dns.rules.unshift({
        domain: bootstrapDomains,
        server: dnsBootstrap ? 'bootstrap' : 'local'
      })
    }
  }

  // 4.4 添加主节点 Outbound
  const nodeOutbound = convertNodeToOutbound(node, 'node-out', sessionTuning.vlessPacketEncodingOverride)
  config.outbounds.push(nodeOutbound)

  // 4.5 进程级 DNS 规则
  // 如果开启了安全 DNS 且定义了进程，则强制该进程的 DNS 查询使用远端 DNS
  if (hasProcessScope && useSecureDns && (!isRoutingMode || hasRoutingProcessScope)) {
    config.dns.rules.unshift({
      process_name: processes,
      server: 'remote-primary'
    })
  }

  // 4.6 核心路由逻辑
  if (isRoutingMode) {
    // === 路由模式 ===
    
    if (hasBypassCn) {
      // -- 绕过大陆模式 (Bypass CN) --
      
      // 私有 IP 直连
      const privateRule: Record<string, any> = {
        ip_is_private: true,
        outbound: 'direct'
      }
      if (hasRoutingProcessScope) {
        privateRule.process_name = processes
      }
      config.route.rules.push(privateRule)
      
      // 下载并配置 CN IP 规则集
      ensureRemoteRuleSet(config, {
        tag: GEOIP_CN_RULE_SET_TAG,
        type: 'remote',
        format: 'binary',
        url: LOYALSOLDIER_GEOIP_CN_SRS_URL,
        download_detour: 'proxy' // 规则集下载走代理
      })
      
      // 下载并配置 CN 域名规则集
      ensureRemoteRuleSet(config, {
        tag: GEOSITE_CN_RULE_SET_TAG,
        type: 'remote',
        format: 'binary',
        url: SAGERNET_GEOSITE_CN_SRS_URL,
        download_detour: 'proxy'
      })
      
      // CN IP 直连规则
      const geoipRule: Record<string, any> = {
        rule_set: [GEOIP_CN_RULE_SET_TAG],
        outbound: 'direct'
      }
      if (hasRoutingProcessScope) {
        geoipRule.process_name = processes
      }
      config.route.rules.push(geoipRule)
      
      // CN 域名直连规则
      const geositeRule: Record<string, any> = {
        rule_set: [GEOSITE_CN_RULE_SET_TAG],
        outbound: 'direct'
      }
      if (hasRoutingProcessScope) {
        geositeRule.process_name = processes
      }
      config.route.rules.push(geositeRule)
      
      // 如果有进程限制，则剩下的流量中，只有该进程走代理
      // (全局 final 默认为 direct)
      if (hasRoutingProcessScope) {
        config.route.rules.push({
          process_name: processes,
          outbound: 'proxy'
        })
      }
      // 如果没有进程限制，final 默认为 proxy (在 2. 构建基础配置结构 中设置)
      
    } else if (hasGlobal) {
      // -- 全局模式 (Global) --
      
      if (hasRoutingProcessScope) {
        // 仅指定进程走代理
        config.route.rules.push({
          process_name: processes,
          outbound: 'proxy'
        })
      }
      // 如果没有进程限制，final 默认为 proxy
      
    } else if (routingIpCidrs.length > 0) {
      // -- 指定 IP CIDR 代理模式 --
      
      const rule: Record<string, any> = {
        ip_cidr: routingIpCidrs,
        outbound: 'proxy'
      }
      if (hasRoutingProcessScope) {
        rule.process_name = processes
      }
      config.route.rules.push(rule)
    }
  } else {
    // === 进程模式 ===
    // 仅指定的游戏进程走代理，其余默认直连
    if (hasProcessScope) {
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
 * 支持 Shadowsocks, VMess, VLESS, Trojan, Socks, HTTP 等协议
 * 
 * @param node 原始节点配置对象
 * @param tag Outbound 的标签，默认为 'node-out'
 * @param vlessPacketEncodingOverride VLESS 协议的包编码覆盖设置 (xudp/off)
 * @returns Sing-box outbound 配置对象
 */
function convertNodeToOutbound(
  node: NodeConfig,
  tag: string = 'node-out',
  vlessPacketEncodingOverride: VlessPacketEncodingOverride = 'off'
): any {
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
        // VLESS XUDP 支持
        packet_encoding: vlessPacketEncodingOverride === 'xudp' ? 'xudp' : node.packet_encoding,
        transport,
        tls
      }
    case 'trojan':
      return {
        ...base,
        type: 'trojan',
        password: node.password,
        transport,
        // Trojan 必须开启 TLS
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
 * 构建传输层配置 (Transport)
 * 处理 WebSocket, gRPC, HTTP 等传输方式
 * 
 * @param node 节点配置
 * @returns Sing-box transport 配置对象或 undefined
 */
function buildTransport(node: NodeConfig): any {
  const network = String(node.network || 'tcp').trim().toLowerCase()
  // TCP 是默认传输方式，无需特殊配置
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

  // 其他传输方式直接透传
  return {
    type: network,
    path: node.path,
    headers: node.host ? { Host: node.host } : undefined
  }
}

/**
 * 构建 TLS 配置
 * 处理标准 TLS、Reality、uTLS 指纹等
 * 
 * @param node 节点配置
 * @returns Sing-box tls 配置对象或 undefined
 */
function buildTls(node: NodeConfig): any {
  if (!node.tls?.enabled) return undefined

  // ALPN (Application-Layer Protocol Negotiation) 配置
  const alpn = (node.alpn || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

  // uTLS 指纹配置
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

  // 处理 Reality 配置 (新一代抗封锁协议)
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
 * 解析 TLS Server Name (SNI)
 * 优先顺序：node.tls.server_name > node.host > node.server
 * 且必须不是 IP 地址
 */
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

/**
 * 判断字符串是否为 IP 地址 (IPv4 或 IPv6)
 */
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

/**
 * 收集需要 Bootstrap 解析的域名
 * 包括节点服务器域名、本地代理节点域名等
 * 这些域名需要通过本地 DNS 解析，以避免循环依赖
 */
function collectBootstrapDomains(...targets: Array<NodeConfig | string | undefined>): string[] {
  const set = new Set<string>()
  for (const target of targets) {
    const domain = typeof target === 'string'
      ? String(target || '').trim().toLowerCase()
      : String(target?.server || '').trim().toLowerCase()
    if (!domain || isIpLiteral(domain)) continue
    set.add(domain)
  }
  return Array.from(set)
}

/**
 * 从 DNS 地址中提取主机名
 * 例如：https://dns.google/dns-query -> dns.google
 */
function extractDnsAddressHostname(address: string): string {
  const raw = String(address || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw)
    const host = String(url.hostname || '').trim().toLowerCase()
    return host && !isIpLiteral(host) ? host : ''
  } catch {
    const hostOnly = raw.replace(/^\[|\]$/g, '').trim().toLowerCase()
    return hostOnly && !isIpLiteral(hostOnly) ? hostOnly : ''
  }
}

/**
 * 标准化进程名称列表
 * 去除路径只保留文件名，并添加小写版本以提高兼容性
 * 例如: ["C:\\Program Files\\Game\\game.exe"] -> ["game.exe", "game"]
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

/**
 * 扩展进程名别名
 * 例如输入 "chrome"，自动扩展为 ["chrome", "chrome.exe"]
 */
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

/**
 * 确保配置中包含指定的远程规则集 (Rule Set)
 * 避免重复添加
 */
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

/**
 * 标准化路由 IP CIDR 列表
 * 过滤掉特殊关键字，确保格式正确
 */
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

/**
 * 将路由规则字符串分割为数组
 * 支持换行、逗号、分号分隔
 */
function tokenizeRoutingRules(rules: unknown): string[] {
  if (!Array.isArray(rules)) return []
  return rules
    .flatMap((item) => String(item ?? '').split(/[\r\n,;，；]+/g))
    .map(v => String(v || '').trim())
    .filter(Boolean)
}

/**
 * 构建自定义分流/直连规则
 * 解析用户输入的 Bypass 列表，生成 Sing-box 路由规则对象
 */
function buildCustomBypassDirectRules(raw: string): Array<Record<string, any>> {
  const entries = parseBypassEntries(raw)
  if (entries.length === 0) return []

  const ipCidrs = new Set<string>()
  const domains = new Set<string>()
  const domainSuffixes = new Set<string>()
  let hasPrivateRange = false

  for (const token of entries) {
    const lower = token.toLowerCase()
    if (lower === '<local>') continue
    if (lower === 'localhost') {
      domains.add('localhost')
      continue
    }
    if (lower === 'local') {
      domainSuffixes.add('local')
      continue
    }
    if (lower === 'lan') {
      domainSuffixes.add('lan')
      continue
    }

    const wildcardCidr = wildcardIpv4ToCidr(token)
    if (wildcardCidr) {
      ipCidrs.add(wildcardCidr)
      continue
    }
    if (isIpLiteral(token)) {
      ipCidrs.add(token.includes(':') ? `${token}/128` : `${token}/32`)
      continue
    }
    if (isValidCidr(token)) {
      ipCidrs.add(token)
      continue
    }
    if (lower === 'private' || lower === 'private-ip' || lower === 'private_ip') {
      hasPrivateRange = true
      continue
    }
    // *.example.com -> domain_suffix
    if (/^\*\.[a-z0-9.-]+$/i.test(token)) {
      domainSuffixes.add(token.slice(2).toLowerCase())
      continue
    }
    // example.com -> domain
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(token)) {
      domains.add(token.toLowerCase())
      continue
    }
  }

  const rules: Array<Record<string, any>> = []
  if (hasPrivateRange) {
    rules.push({ ip_is_private: true, outbound: 'direct' })
  }
  if (ipCidrs.size > 0) {
    rules.push({ ip_cidr: Array.from(ipCidrs), outbound: 'direct' })
  }
  if (domains.size > 0) {
    rules.push({ domain: Array.from(domains), outbound: 'direct' })
  }
  if (domainSuffixes.size > 0) {
    rules.push({ domain_suffix: Array.from(domainSuffixes), outbound: 'direct' })
  }
  return rules
}

/**
 * 解析 Bypass 条目字符串
 */
function parseBypassEntries(raw: string): string[] {
  return String(raw || '')
    .split(/[\r\n,;]+/g)
    .map(v => String(v).trim())
    .filter(Boolean)
}

/**
 * 将通配符 IP (如 192.168.*.*) 转换为 CIDR 格式
 */
function wildcardIpv4ToCidr(raw: string): string | null {
  const token = String(raw || '').trim()
  if (!token.includes('*')) return null
  const parts = token.split('.')
  if (parts.length < 2 || parts.length > 4) return null
  let wildcardFrom = -1
  const normalized = [0, 0, 0, 0]
  const fullParts = [...parts]
  while (fullParts.length < 4) fullParts.push('*')
  for (let i = 0; i < 4; i += 1) {
    const p = String(fullParts[i] || '').trim()
    if (p === '*') {
      if (wildcardFrom === -1) wildcardFrom = i
      normalized[i] = 0
      continue
    }
    if (wildcardFrom !== -1) return null
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n < 0 || n > 255) return null
    normalized[i] = n
  }
  if (wildcardFrom < 0) return null
  const prefix = wildcardFrom * 8
  return `${normalized.join('.')}/${prefix}`
}

/**
 * 验证 CIDR 格式是否有效 (e.g. 192.168.1.0/24)
 */
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

/**
 * 解析和规范化网络调优参数 (SessionNetworkTuning)
 * 处理 MTU、栈类型、UDP 模式等
 */
function resolveSessionTuning(tuning?: SessionNetworkTuningOptions): SessionNetworkTuningOptions {
  if (!tuning?.enabled) {
    return {
      enabled: false,
      profile: 'stable',
      udpMode: 'auto',
      tunMtu: 1280,
      tunStack: 'system',
      strictRoute: false,
      vlessPacketEncodingOverride: 'off',
      highLossHintOnly: true
    }
  }

  const tunMtu = normalizeMtu(tuning.tunMtu)
  return {
    enabled: true,
    profile: tuning.profile === 'aggressive' ? 'aggressive' : 'stable',
    udpMode: tuning.udpMode === 'prefer_udp' || tuning.udpMode === 'prefer_tcp' ? tuning.udpMode : 'auto',
    tunMtu,
    tunStack: tuning.tunStack === 'mixed' ? 'mixed' : 'system',
    strictRoute: !!tuning.strictRoute,
    vlessPacketEncodingOverride: tuning.vlessPacketEncodingOverride === 'xudp' ? 'xudp' : 'off',
    highLossHintOnly: tuning.highLossHintOnly !== false
  }
}

/**
 * 规范化 MTU 值，确保在合理范围内 (1200-1500)
 */
function normalizeMtu(value: number): number {
  const fallback = 1280
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1500, Math.max(1200, Math.floor(n)))
}

/**
 * 构建 UDP 流量偏好规则
 * 根据 tuning.udpMode 决定 UDP 流量是优先走代理还是直连
 */
function buildUdpPreferenceRule(
  tuning: SessionNetworkTuningOptions,
  hasTunInbound: boolean
): Record<string, any> | null {
  if (!tuning.enabled || tuning.udpMode === 'auto') return null

  const rule: Record<string, any> = {
    protocol: 'udp',
    outbound: tuning.udpMode === 'prefer_udp' ? 'proxy' : 'direct'
  }
  // 如果开启了 TUN，则限定该规则只对 TUN 入站流量生效
  if (hasTunInbound) {
    rule.inbound = ['tun-in']
  }
  return rule
}
