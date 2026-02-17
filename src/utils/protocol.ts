import { Base64 } from 'js-base64'

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

export function normalizeNodeType(type: string | null | undefined): string {
  const t = String(type ?? '').trim().toLowerCase()
  if (t === 'ss' || t === 'shadowsocks') return 'shadowsocks'
  if (t === 'socks5' || t === 'socks') return 'socks'
  if (t === 'https' || t === 'http') return 'http'
  return t
}

export function parseShareLink(link: string): NodeConfig | null {
  link = link.trim()
  if (!link) return null

  // Try to decode if it looks like a base64 string (no protocol prefix, no spaces)
  if (!link.includes('://') && /^[A-Za-z0-9+/=]+$/.test(link)) {
    try {
      // This might be a subscription content (multiple links)
      // But parseShareLink is designed for single link. 
      // We will handle bulk import in a separate function or upper layer.
      // However, if it's a single base64 string, it might be a single node (rare for vmess/vless, common for SS)
      // or a subscription response.

      // Let's assume the caller handles bulk splitting if it's a subscription.
      // But if the user pastes a raw base64 string which decodes to "vmess://...", we should handle it.
      const decoded = Base64.decode(link).trim()
      if (decoded.includes('://')) {
        return parseShareLink(decoded)
      }
    } catch (e) {
      // ignore
    }
  }

  if (link.startsWith('vmess://')) {
    return parseVMess(link)
  } else if (link.startsWith('vless://')) {
    return parseVLESS(link)
  } else if (link.startsWith('ss://')) {
    return parseShadowsocks(link)
  } else if (link.startsWith('trojan://')) {
    return parseTrojan(link)
  } else if (link.startsWith('socks://') || link.startsWith('socks5://')) {
    return parseSocks(link)
  } else if (link.startsWith('http://') || link.startsWith('https://')) {
    return parseHttp(link)
  }
  return null
}

export function parseBatchLinks(content: string): NodeConfig[] {
  content = content.trim()
  if (!content) return []

  // Try Base64 decode first if the whole content looks like Base64
  if (!content.includes('://') && /^[A-Za-z0-9+/=\s]+$/.test(content)) {
    try {
      const decoded = Base64.decode(content)
      // If decoding yields readable characters and contains protocols
      if (decoded.includes('://')) {
        content = decoded
      }
    } catch (e) {
      // Not a valid base64 or not subscription content
    }
  }

  const lines = content.split(/[\r\n]+/)
  const configs: NodeConfig[] = []

  for (const line of lines) {
    const config = parseShareLink(line)
    if (config) {
      configs.push(config)
    }
  }

  return configs
}

function parseVMess(link: string): NodeConfig | null {
  try {
    const base64 = link.replace('vmess://', '')
    const jsonStr = Base64.decode(base64)
    const config = JSON.parse(jsonStr)
    return {
      type: 'vmess',
      tag: config.ps || 'VMess Node',
      server: config.add,
      server_port: Number(config.port),
      uuid: config.id,
      security: config.scy || 'auto',
      network: config.net || 'tcp',
      path: config.path,
      host: config.host,
      service_name: config.net === 'grpc' ? (config.path || config.serviceName || '') : (config.serviceName || ''),
      alpn: config.alpn || undefined,
      fingerprint: config.fp || undefined,
      tls: {
        enabled: config.tls === 'tls',
        server_name: config.sni || config.host,
        insecure: String(config.allowInsecure || '0') === '1',
        utls: {
          enabled: !!config.fp,
          fingerprint: config.fp || 'chrome'
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse VMess', e)
    return null
  }
}

function parseVLESS(link: string): NodeConfig | null {
  try {
    const url = new URL(link)
    const params = url.searchParams
    return {
      type: 'vless',
      tag: decodeURIComponent(url.hash.slice(1)) || 'VLESS Node',
      server: url.hostname,
      server_port: Number(url.port),
      uuid: url.username,
      network: params.get('type') || 'tcp',
      security: params.get('security') || 'none',
      path: params.get('path') || undefined,
      host: params.get('host') || undefined,
      service_name: params.get('serviceName') || undefined,
      flow: params.get('flow') || undefined,
      packet_encoding: params.get('packetEncoding') || undefined,
      alpn: params.get('alpn') || undefined,
      fingerprint: params.get('fp') || undefined,
      tls: {
        enabled: params.get('security') === 'tls' || params.get('security') === 'reality',
        server_name: params.get('sni') || undefined,
        insecure: params.get('allowInsecure') === '1',
        utls: {
          enabled: !!params.get('fp'),
          fingerprint: params.get('fp') || 'chrome'
        },
        reality: {
          enabled: params.get('security') === 'reality',
          public_key: params.get('pbk') || undefined,
          short_id: params.get('sid') || undefined
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse VLESS', e)
    return null
  }
}

function parseShadowsocks(link: string): NodeConfig | null {
  try {
    const raw = link.replace(/^ss:\/\//, '')
    const hashPos = raw.indexOf('#')
    const withoutHash = hashPos >= 0 ? raw.slice(0, hashPos) : raw
    const hash = hashPos >= 0 ? raw.slice(hashPos + 1) : ''
    const tag = hash ? decodeURIComponent(hash) : 'Shadowsocks Node'

    const qPos = withoutHash.indexOf('?')
    const mainPart = qPos >= 0 ? withoutHash.slice(0, qPos) : withoutHash
    const query = qPos >= 0 ? withoutHash.slice(qPos + 1) : ''
    let decodedMain = mainPart

    // SIP002 allows `ss://base64(method:password@host:port)` and URL-safe base64.
    if (!decodedMain.includes('@')) {
      decodedMain = decodeBase64Url(decodedMain)
    } else {
      const [encodedUserInfo = '', hostPort = ''] = decodedMain.split('@', 2)
      if (encodedUserInfo && !encodedUserInfo.includes(':')) {
        decodedMain = `${decodeBase64Url(encodedUserInfo)}@${hostPort}`
      }
    }

    const at = decodedMain.lastIndexOf('@')
    if (at <= 0) return null
    const userPart = decodedMain.slice(0, at)
    const serverPart = decodedMain.slice(at + 1)

    const colon = userPart.indexOf(':')
    if (colon <= 0) return null

    const method = decodeURIComponent(userPart.slice(0, colon))
    const password = decodeURIComponent(userPart.slice(colon + 1))

    const serverColon = serverPart.lastIndexOf(':')
    if (serverColon <= 0) return null
    const server = decodeURIComponent(serverPart.slice(0, serverColon))
    const serverPort = Number(serverPart.slice(serverColon + 1))
    if (!Number.isFinite(serverPort) || serverPort <= 0) return null

    const params = new URLSearchParams(query)
    const pluginValue = params.get('plugin') || ''
    const [pluginNameRaw = '', ...pluginOptsRaw] = pluginValue.split(';')
    const pluginName = pluginNameRaw ? decodeURIComponent(pluginNameRaw) : undefined
    const pluginOpts = pluginOptsRaw.length > 0
      ? pluginOptsRaw.map(v => decodeURIComponent(v)).join(';')
      : undefined

    return {
      type: 'shadowsocks',
      tag: tag || 'Shadowsocks Node',
      server,
      server_port: serverPort,
      method,
      password,
      plugin: pluginName,
      plugin_opts: pluginOpts
    }
  } catch (e) {
    return null
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  return Base64.decode(padded)
}

function parseTrojan(link: string): NodeConfig | null {
  try {
    const url = new URL(link)
    const params = url.searchParams
    return {
      type: 'trojan',
      tag: decodeURIComponent(url.hash.slice(1)) || 'Trojan Node',
      server: url.hostname,
      server_port: Number(url.port),
      password: url.username,
      network: params.get('type') || 'tcp',
      path: params.get('path') || undefined,
      host: params.get('host') || undefined,
      service_name: params.get('serviceName') || undefined,
      security: params.get('security') || 'tls',
      alpn: params.get('alpn') || undefined,
      fingerprint: params.get('fp') || undefined,
      tls: {
        enabled: params.get('security') !== 'none',
        server_name: params.get('sni') || undefined,
        insecure: params.get('allowInsecure') === '1',
        utls: {
          enabled: !!params.get('fp'),
          fingerprint: params.get('fp') || 'chrome'
        }
      }
    }
  } catch (e) {
    return null
  }
}

function parseSocks(link: string): NodeConfig | null {
  try {
    const url = new URL(link)
    const type = normalizeNodeType(url.protocol.replace(':', ''))
    const port = Number(url.port)
    if (!Number.isFinite(port) || port <= 0) return null
    return {
      type,
      tag: decodeURIComponent(url.hash.slice(1)) || 'SOCKS Node',
      server: url.hostname,
      server_port: port,
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || '')
    }
  } catch (e) {
    return null
  }
}

function parseHttp(link: string): NodeConfig | null {
  try {
    const url = new URL(link)
    const port = Number(url.port)
    if (!Number.isFinite(port) || port <= 0) return null
    return {
      type: 'http',
      tag: decodeURIComponent(url.hash.slice(1)) || 'HTTP Node',
      server: url.hostname,
      server_port: port,
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || '')
    }
  } catch (e) {
    return null
  }
}

export function generateBatchLinks(nodes: NodeConfig[]): string {
  const links = nodes.map(generateShareLink).filter(Boolean) as string[]
  return Base64.encode(links.join('\n'))
}

export function generateShareLink(node: NodeConfig): string | null {
  switch (normalizeNodeType(node.type)) {
    case 'vmess': return generateVMess(node)
    case 'vless': return generateVLESS(node)
    case 'shadowsocks':
    case 'ss': return generateShadowsocks(node)
    case 'trojan': return generateTrojan(node)
    case 'socks': return generateSocks(node)
    case 'http': return generateHttp(node)
    default: return null
  }
}

function generateVMess(node: NodeConfig): string {
  const config = {
    v: "2",
    ps: node.tag,
    add: node.server,
    port: node.server_port,
    id: node.uuid,
    aid: 0,
    scy: node.security || "auto",
    net: node.network || "tcp",
    type: "none",
    host: node.host || "",
    path: (node.network === 'grpc' ? (node.service_name || '') : (node.path || "")),
    tls: node.tls?.enabled ? "tls" : "",
    sni: node.tls?.server_name || "",
    alpn: node.alpn || "",
    fp: node.fingerprint || node.tls?.utls?.fingerprint || "",
    allowInsecure: node.tls?.insecure ? "1" : "0"
  }
  return 'vmess://' + Base64.encode(JSON.stringify(config))
}

function generateVLESS(node: NodeConfig): string {
  const uuid = node.uuid || ''
  // VLESS format: vless://uuid@host:port?params#tag
  const params = new URLSearchParams()

  if (node.network) params.set('type', node.network)
  if (node.security) params.set('security', node.security)
  if (node.flow) params.set('flow', node.flow)
  if (node.path) params.set('path', node.path)
  if (node.host) params.set('host', node.host)
  if (node.service_name) params.set('serviceName', node.service_name)
  if (node.packet_encoding) params.set('packetEncoding', node.packet_encoding)
  if (node.alpn) params.set('alpn', node.alpn)

  if (node.tls?.enabled) {
    if (!node.security || node.security === 'none') {
      // If tls is enabled but security not set, assume tls unless explicit
      if (node.security !== 'reality') params.set('security', 'tls')
    }
    if (node.tls.server_name) params.set('sni', node.tls.server_name)
    if (node.tls.insecure) params.set('allowInsecure', '1')
    if (node.tls.utls?.enabled && node.tls.utls.fingerprint) {
      params.set('fp', node.tls.utls.fingerprint)
    }
    if (node.fingerprint) params.set('fp', node.fingerprint)
    if (node.tls.reality?.enabled) {
      params.set('security', 'reality')
      if (node.tls.reality.public_key) params.set('pbk', node.tls.reality.public_key)
      if (node.tls.reality.short_id) params.set('sid', node.tls.reality.short_id)
    }
  }

  const hash = '#' + encodeURIComponent(node.tag)
  return `vless://${uuid}@${node.server}:${node.server_port}?${params.toString()}${hash}`
}

function generateShadowsocks(node: NodeConfig): string {
  const method = node.method || 'chacha20-ietf-poly1305'
  const password = node.password || ''

  // SS URI SIP002: ss://userinfo@host:port?plugin=...#tag
  // userinfo = base64(method:password)
  const userInfo = Base64.encode(`${method}:${password}`)
  let link = `ss://${userInfo}@${node.server}:${node.server_port}`

  if (node.plugin) {
    let pluginStr = node.plugin
    if (node.plugin_opts) {
      pluginStr += ';' + node.plugin_opts
    }
    link += `/?plugin=${encodeURIComponent(pluginStr)}`
  }

  link += '#' + encodeURIComponent(node.tag)
  return link
}

function generateTrojan(node: NodeConfig): string {
  const password = node.password || ''
  const params = new URLSearchParams()

  if (node.network) params.set('type', node.network)
  if (node.path) params.set('path', node.path)
  if (node.host) params.set('host', node.host)
  if (node.service_name) params.set('serviceName', node.service_name)
  if (node.security) params.set('security', node.security)
  if (node.alpn) params.set('alpn', node.alpn)
  if (node.tls?.server_name) params.set('sni', node.tls.server_name)
  if (node.tls?.insecure) params.set('allowInsecure', '1')
  if (node.fingerprint || node.tls?.utls?.fingerprint) {
    params.set('fp', node.fingerprint || node.tls?.utls?.fingerprint || 'chrome')
  }

  const hash = '#' + encodeURIComponent(node.tag)
  return `trojan://${password}@${node.server}:${node.server_port}?${params.toString()}${hash}`
}

function generateSocks(node: NodeConfig): string {
  const username = encodeURIComponent(node.username || '')
  const password = encodeURIComponent(node.password || '')
  const auth = username ? `${username}${password ? `:${password}` : ''}@` : ''
  const hash = '#' + encodeURIComponent(node.tag)
  return `socks://${auth}${node.server}:${node.server_port}${hash}`
}

function generateHttp(node: NodeConfig): string {
  const username = encodeURIComponent(node.username || '')
  const password = encodeURIComponent(node.password || '')
  const auth = username ? `${username}${password ? `:${password}` : ''}@` : ''
  const hash = '#' + encodeURIComponent(node.tag)
  return `http://${auth}${node.server}:${node.server_port}${hash}`
}
