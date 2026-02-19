import { Base64 } from 'js-base64'
import type { NodeConfig } from '../types'

export type { NodeConfig }

export function normalizeNodeType(type: string | null | undefined): string {
  const t = String(type ?? '').trim().toLowerCase()
  if (t === 'ss' || t === 'shadowsocks') return 'shadowsocks'
  if (t === 'socks5' || t === 'socks') return 'socks'
  if (t === 'https' || t === 'http') return 'http'
  return t
}

export function parseShareLink(link: string): NodeConfig | null {
  link = link.trim().replace(/[\u200B-\u200D\uFEFF]/g, '')
  if (!link) return null
  link = extractFirstLinkToken(link)
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

  const lower = link.toLowerCase()
  if (lower.startsWith('vmess://')) {
    return parseVMess(link)
  } else if (lower.startsWith('vless://')) {
    return parseVLESS(link)
  } else if (lower.startsWith('ss://')) {
    return parseShadowsocks(link)
  } else if (lower.startsWith('trojan://')) {
    return parseTrojan(link)
  } else if (lower.startsWith('socks://') || lower.startsWith('socks5://') || lower.startsWith('socks5h://')) {
    return parseSocks(link)
  } else if (lower.startsWith('http://') || lower.startsWith('https://')) {
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
    const base64 = link.replace(/^vmess:\/\//i, '')
    const jsonStr = decodeBase64MaybeUrl(base64)
    const config = JSON.parse(jsonStr)
    const tlsType = String(config.tls || '').toLowerCase()
    const isTlsEnabled = tlsType === 'tls' || tlsType === 'reality' || tlsType === '1'
    const fingerprint = config.fp || config.fingerprint || undefined
    const sni = config.sni || config.serverName || config.server_name || config.host
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
      fingerprint,
      tls: {
        enabled: isTlsEnabled,
        server_name: sni || undefined,
        insecure: isTruthy(config.allowInsecure ?? config.insecure),
        utls: {
          enabled: !!fingerprint,
          fingerprint: fingerprint || 'chrome'
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
    const security = String(pickParam(params, ['security', 'tls']) || 'none').toLowerCase()
    const fp = pickParam(params, ['fp', 'fingerprint', 'client-fingerprint']) || undefined
    const network = pickParam(params, ['type', 'network']) || 'tcp'
    const packetEncoding = pickParam(params, ['packetEncoding', 'packet_encoding']) || undefined
    const realityPublicKey = pickParam(params, ['pbk', 'publicKey', 'public_key']) || undefined
    const realityShortId = pickParam(params, ['sid', 'shortId', 'short_id']) || undefined
    const tlsEnabled = security === 'tls' || security === 'reality' || !!realityPublicKey
    const realityEnabled = security === 'reality' || !!realityPublicKey
    return {
      type: 'vless',
      tag: decodeURIComponent(url.hash.slice(1)) || 'VLESS Node',
      server: url.hostname,
      server_port: Number(url.port),
      uuid: url.username,
      network,
      security: realityEnabled ? 'reality' : security,
      path: params.get('path') || undefined,
      host: params.get('host') || undefined,
      service_name: pickParam(params, ['serviceName', 'service_name']) || undefined,
      flow: params.get('flow') || undefined,
      packet_encoding: packetEncoding,
      alpn: params.get('alpn') || undefined,
      fingerprint: fp,
      tls: {
        enabled: tlsEnabled,
        server_name: pickParam(params, ['sni', 'serverName', 'server_name']) || undefined,
        insecure: isTruthy(pickParam(params, ['allowInsecure', 'insecure'])),
        utls: {
          enabled: !!fp,
          fingerprint: fp || 'chrome'
        },
        reality: {
          enabled: realityEnabled,
          public_key: realityPublicKey,
          short_id: realityShortId
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
    const serverPart = decodedMain.slice(at + 1).replace(/\/+$/, '')

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

function decodeBase64MaybeUrl(input: string): string {
  try {
    return Base64.decode(input)
  } catch {
    return decodeBase64Url(input)
  }
}

function parseTrojan(link: string): NodeConfig | null {
  try {
    const url = new URL(link)
    const params = url.searchParams
    const security = String(pickParam(params, ['security', 'tls']) || 'tls').toLowerCase()
    const fp = pickParam(params, ['fp', 'fingerprint', 'client-fingerprint']) || undefined
    return {
      type: 'trojan',
      tag: decodeURIComponent(url.hash.slice(1)) || 'Trojan Node',
      server: url.hostname,
      server_port: Number(url.port),
      password: url.username,
      network: pickParam(params, ['type', 'network']) || 'tcp',
      path: params.get('path') || undefined,
      host: params.get('host') || undefined,
      service_name: pickParam(params, ['serviceName', 'service_name']) || undefined,
      security,
      alpn: params.get('alpn') || undefined,
      fingerprint: fp,
      tls: {
        enabled: security !== 'none',
        server_name: pickParam(params, ['sni', 'serverName', 'server_name']) || undefined,
        insecure: isTruthy(pickParam(params, ['allowInsecure', 'insecure'])),
        utls: {
          enabled: !!fp,
          fingerprint: fp || 'chrome'
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
    const proto = url.protocol.replace(':', '').toLowerCase()
    const type = proto === 'socks5h' ? 'socks' : normalizeNodeType(proto)
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
  params.set('encryption', 'none')
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
  else if (node.tls?.enabled) params.set('security', 'tls')
  if (node.alpn) params.set('alpn', node.alpn)
  if (node.tls?.server_name) params.set('sni', node.tls.server_name)
  if (node.tls?.insecure) params.set('allowInsecure', '1')
  if (node.fingerprint || node.tls?.utls?.fingerprint) {
    params.set('fp', node.fingerprint || node.tls?.utls?.fingerprint || 'chrome')
  }

  const hash = '#' + encodeURIComponent(node.tag)
  return `trojan://${password}@${node.server}:${node.server_port}?${params.toString()}${hash}`
}

function pickParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key)
    if (value != null && String(value).trim() !== '') return value
  }
  return null
}

function extractFirstLinkToken(input: string): string {
  const value = String(input || '').trim()
  if (!value) return ''
  const protocolMatch = value.match(/^([a-z][a-z0-9+.-]*):\/\//i)
  if (!protocolMatch) return value
  return value.split(/\s+/)[0] || value
}

function isTruthy(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
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
