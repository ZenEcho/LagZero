import { Base64 } from 'js-base64'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { NodeConfig, NodeTlsConfig } from '@/types'
import { normalizeNodeType } from '@shared/utils'

type PlainObject = Record<string, unknown>

interface ParsedLinkLike {
  scheme: string
  auth: string
  username: string
  password: string
  server: string
  portPart: string
  searchParams: URLSearchParams
  hash: string
}

export function parseShareLink(link: string): NodeConfig | null {
  link = link.trim().replace(/[\u200B-\u200D\uFEFF]/g, '')
  if (!link) return null
  link = extractFirstLinkToken(link)
  if (!link) return null

  if (!link.includes('://') && /^[A-Za-z0-9+/=]+$/.test(link)) {
    try {
      const decoded = Base64.decode(link).trim()
      if (decoded.includes('://')) {
        return parseShareLink(decoded)
      }
    } catch {
      // ignore
    }
  }

  const lower = link.toLowerCase()
  if (lower.startsWith('vmess://')) return parseVMess(link)
  if (lower.startsWith('vless://')) return parseVLESS(link)
  if (lower.startsWith('ss://')) return parseShadowsocks(link)
  if (lower.startsWith('trojan://')) return parseTrojan(link)
  if (lower.startsWith('hysteria://') || lower.startsWith('hy://')) return parseHysteria(link)
  if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) return parseHysteria2(link)
  if (lower.startsWith('tuic://')) return parseTuic(link)
  if (lower.startsWith('anytls://')) return parseAnyTls(link)
  if (lower.startsWith('shadowtls://') || lower.startsWith('shadow-tls://')) return parseShadowTls(link)
  if (lower.startsWith('socks://') || lower.startsWith('socks5://') || lower.startsWith('socks5h://')) return parseSocks(link)
  if (lower.startsWith('http://') || lower.startsWith('https://')) return parseHttp(link)
  return null
}

export function parseBatchLinks(content: string): NodeConfig[] {
  content = normalizeBatchContent(content)
  if (!content) return []

  const shareLinkConfigs = parseLineBasedLinks(content)
  if (shareLinkConfigs.length > 0) return shareLinkConfigs

  return parseClashConfig(content)
}

function normalizeBatchContent(content: string): string {
  let normalized = String(content || '').trim()
  if (!normalized) return ''

  if (!normalized.includes('://') && /^[A-Za-z0-9+/=_\-\s]+$/.test(normalized)) {
    try {
      const decoded = decodeBase64MaybeUrl(normalized)
      if (decoded.includes('://') || looksLikeClashConfig(decoded)) {
        normalized = decoded.trim()
      }
    } catch {
      // Ignore and treat as plain text.
    }
  }

  return normalized
}

function parseLineBasedLinks(content: string): NodeConfig[] {
  const lines = content.split(/[\r\n]+/)
  const configs: NodeConfig[] = []

  for (const line of lines) {
    const config = parseShareLink(line)
    if (config) configs.push(config)
  }

  return configs
}

function parseClashConfig(content: string): NodeConfig[] {
  if (!looksLikeClashConfig(content)) return []

  try {
    const parsed = parseYaml(content)
    const root = asObject(parsed)
    const proxies = Array.isArray(root?.proxies) ? root.proxies : []
    return proxies
      .map(proxy => parseClashProxy(proxy))
      .filter((node): node is NodeConfig => !!node)
  } catch (e) {
    console.error('Failed to parse Clash config', e)
    return []
  }
}

function looksLikeClashConfig(content: string): boolean {
  return /(^|\n)\s*proxies\s*:/i.test(String(content || ''))
}

function parseClashProxy(value: unknown): NodeConfig | null {
  const proxy = asObject(value)
  if (!proxy) return null

  const rawType = readString(proxy, ['type']).toLowerCase()
  const type = normalizeNodeType(rawType)
  const tag = readString(proxy, ['name', 'tag']) || `${String(type || 'proxy').toUpperCase()} Node`
  const server = readString(proxy, ['server'])
  const serverPort = readNumber(proxy, ['port'])

  if (!type || !server || !serverPort) return null

  const network = readClashNetwork(proxy)
  const path = readClashPath(proxy)
  const host = readClashHost(proxy)
  const serviceName = readClashGrpcServiceName(proxy)
  const alpn = readStringList(proxy, ['alpn']).join(',') || undefined
  const fingerprint = readClashClientFingerprint(proxy) || undefined

  switch (type) {
    case 'shadowsocks':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        method: readString(proxy, ['cipher', 'method']) || undefined,
        password: readString(proxy, ['password']) || undefined,
        plugin: readString(proxy, ['plugin']) || undefined,
        plugin_opts: stringifyClashOptions(readObject(proxy, ['plugin-opts', 'plugin_opts'])) || undefined
      }
    case 'vmess':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        uuid: readString(proxy, ['uuid', 'id']) || undefined,
        security: readString(proxy, ['cipher', 'security']) || 'auto',
        network,
        path,
        host,
        service_name: serviceName,
        alpn,
        fingerprint,
        tls: buildClashTls(proxy)
      }
    case 'vless': {
      const tls = buildClashTls(proxy)
      const realityEnabled = !!tls?.reality?.enabled
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        uuid: readString(proxy, ['uuid', 'id']) || undefined,
        network,
        path,
        host,
        service_name: serviceName,
        flow: readString(proxy, ['flow']) || undefined,
        packet_encoding: readString(proxy, ['packet-encoding', 'packet_encoding']) || undefined,
        security: realityEnabled ? 'reality' : tls?.enabled ? 'tls' : 'none',
        alpn,
        fingerprint,
        tls
      }
    }
    case 'trojan':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        password: readString(proxy, ['password']) || undefined,
        network,
        path,
        host,
        service_name: serviceName,
        security: 'tls',
        alpn,
        fingerprint,
        tls: buildClashTls(proxy, { defaultEnabled: true })
      }
    case 'socks':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        username: readString(proxy, ['username']) || undefined,
        password: readString(proxy, ['password']) || undefined
      }
    case 'http':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        username: readString(proxy, ['username']) || undefined,
        password: readString(proxy, ['password']) || undefined,
        tls: buildClashTls(proxy, { defaultEnabled: rawType === 'https' })
      }
    case 'hysteria':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        server_ports: parsePortRanges(readValue(proxy, ['ports', 'server-ports', 'server_ports'])) || undefined,
        hop_interval: parseDurationSeconds(readValue(proxy, ['hop-interval', 'hop_interval'])) || undefined,
        auth: readString(proxy, ['auth-str', 'auth_str', 'auth']) || undefined,
        obfs: readString(proxy, ['obfs']) || undefined,
        up_mbps: parseMbpsValue(readValue(proxy, ['up'])) ?? undefined,
        down_mbps: parseMbpsValue(readValue(proxy, ['down'])) ?? undefined,
        network: normalizeUdpTcpNetwork(readString(proxy, ['protocol', 'network'])) || undefined,
        alpn,
        tls: buildClashTls(proxy, { defaultEnabled: true, fingerprintKeys: ['client-fingerprint', 'client_fingerprint'] })
      }
    case 'hysteria2':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        server_ports: parsePortRanges(readValue(proxy, ['ports', 'server-ports', 'server_ports'])) || undefined,
        hop_interval: parseDurationSeconds(readValue(proxy, ['hop-interval', 'hop_interval'])) || undefined,
        password: readString(proxy, ['password']) || undefined,
        obfs: readString(proxy, ['obfs']) || undefined,
        obfs_password: readString(proxy, ['obfs-password', 'obfs_password']) || undefined,
        up_mbps: parseMbpsValue(readValue(proxy, ['up'])) ?? undefined,
        down_mbps: parseMbpsValue(readValue(proxy, ['down'])) ?? undefined,
        network: normalizeUdpTcpNetwork(readString(proxy, ['network'])) || undefined,
        alpn,
        tls: buildClashTls(proxy, { defaultEnabled: true, fingerprintKeys: ['client-fingerprint', 'client_fingerprint'] })
      }
    case 'tuic':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        uuid: readString(proxy, ['uuid']) || undefined,
        password: readString(proxy, ['password']) || undefined,
        congestion_control: readString(proxy, ['congestion-controller', 'congestion_control']) || undefined,
        udp_relay_mode: readString(proxy, ['udp-relay-mode', 'udp_relay_mode']) || undefined,
        udp_over_stream: readBoolean(proxy, ['udp-over-stream', 'udp_over_stream']) || undefined,
        zero_rtt_handshake: readBoolean(proxy, ['reduce-rtt', 'reduce_rtt', 'zero-rtt-handshake', 'zero_rtt_handshake']) || undefined,
        heartbeat: parseDurationMilliseconds(readValue(proxy, ['heartbeat-interval', 'heartbeat_interval', 'heartbeat'])) || undefined,
        network: normalizeUdpTcpNetwork(readString(proxy, ['network'])) || undefined,
        alpn,
        fingerprint: readClashClientFingerprint(proxy, ['client-fingerprint', 'client_fingerprint']) || undefined,
        tls: buildClashTls(proxy, { defaultEnabled: true, fingerprintKeys: ['client-fingerprint', 'client_fingerprint'] })
      }
    case 'anytls':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        password: readString(proxy, ['password']) || undefined,
        idle_session_check_interval: parseDurationSeconds(readValue(proxy, ['idle-session-check-interval', 'idle_session_check_interval'])) || undefined,
        idle_session_timeout: parseDurationSeconds(readValue(proxy, ['idle-session-timeout', 'idle_session_timeout'])) || undefined,
        min_idle_session: readOptionalNumber(proxy, ['min-idle-session', 'min_idle_session']) ?? undefined,
        alpn,
        fingerprint: readClashClientFingerprint(proxy, ['client-fingerprint', 'client_fingerprint']) || undefined,
        tls: buildClashTls(proxy, { defaultEnabled: true, fingerprintKeys: ['client-fingerprint', 'client_fingerprint'] })
      }
    case 'shadowtls':
      return {
        type,
        tag,
        server,
        server_port: serverPort,
        version: readOptionalNumber(proxy, ['version']) ?? 3,
        password: readString(proxy, ['password']) || undefined,
        alpn,
        fingerprint: readClashClientFingerprint(proxy, ['client-fingerprint', 'client_fingerprint']) || undefined,
        tls: buildClashTls(proxy, { defaultEnabled: true, fingerprintKeys: ['client-fingerprint', 'client_fingerprint'] })
      }
    default:
      return null
  }
}

function buildClashTls(
  proxy: PlainObject,
  options?: { defaultEnabled?: boolean; fingerprintKeys?: string[] }
) {
  const security = readString(proxy, ['security']).toLowerCase()
  const serverName = readString(proxy, ['servername', 'server-name', 'server_name', 'sni']) || undefined
  const insecure = readBoolean(proxy, ['skip-cert-verify', 'skip_cert_verify', 'allow-insecure', 'allow_insecure'])
  const disableSni = readBoolean(proxy, ['disable-sni', 'disable_sni'])
  const fingerprint = readClashClientFingerprint(proxy, options?.fingerprintKeys) || undefined
  const reality = readObject(proxy, ['reality-opts', 'reality_opts', 'reality'])
  const publicKey = readString(reality, ['public-key', 'public_key', 'publicKey', 'pbk']) || undefined
  const shortId = readString(reality, ['short-id', 'short_id', 'shortId', 'sid']) || undefined
  const realityEnabled = security === 'reality' || !!publicKey
  const alpn = readStringList(proxy, ['alpn'])

  const tlsEnabled = realityEnabled
    || !!options?.defaultEnabled
    || readBoolean(proxy, ['tls'])
    || security === 'tls'
    || !!serverName
    || insecure
    || disableSni
    || !!fingerprint
    || alpn.length > 0

  if (!tlsEnabled) return undefined

  return {
    enabled: true,
    server_name: serverName,
    disable_sni: disableSni || undefined,
    insecure,
    utls: fingerprint
      ? {
        enabled: true,
        fingerprint
      }
      : undefined,
    reality: realityEnabled
      ? {
        enabled: true,
        public_key: publicKey,
        short_id: shortId
      }
      : undefined
  }
}

function readClashNetwork(proxy: PlainObject): string | undefined {
  const explicit = readString(proxy, ['network'])
  if (explicit) return explicit
  if (readObject(proxy, ['ws-opts', 'ws_opts'])) return 'ws'
  if (readObject(proxy, ['grpc-opts', 'grpc_opts'])) return 'grpc'
  if (readObject(proxy, ['h2-opts', 'h2_opts'])) return 'h2'
  if (readObject(proxy, ['http-opts', 'http_opts'])) return 'http'
  return 'tcp'
}

function readClashPath(proxy: PlainObject): string | undefined {
  const network = readClashNetwork(proxy)
  if (network === 'ws') {
    return readString(readObject(proxy, ['ws-opts', 'ws_opts']), ['path'])
      || readString(proxy, ['ws-path', 'ws_path', 'path'])
      || undefined
  }
  if (network === 'h2') {
    return readString(readObject(proxy, ['h2-opts', 'h2_opts']), ['path'])
      || readString(proxy, ['path'])
      || undefined
  }
  if (network === 'http') {
    return readString(readObject(proxy, ['http-opts', 'http_opts']), ['path'])
      || readString(proxy, ['path'])
      || undefined
  }
  return readString(proxy, ['path']) || undefined
}

function readClashHost(proxy: PlainObject): string | undefined {
  const network = readClashNetwork(proxy)
  if (network === 'ws') {
    const wsHeaders = readObject(readObject(proxy, ['ws-opts', 'ws_opts']), ['headers'])
    return readString(wsHeaders, ['Host', 'host'])
      || readString(proxy, ['host'])
      || undefined
  }
  if (network === 'h2') {
    const hosts = readStringList(readObject(proxy, ['h2-opts', 'h2_opts']), ['host'])
    return hosts[0] || readString(proxy, ['host']) || undefined
  }
  if (network === 'http') {
    const httpOpts = readObject(proxy, ['http-opts', 'http_opts'])
    const hosts = readStringList(httpOpts, ['host'])
    const headers = readObject(httpOpts, ['headers'])
    return hosts[0] || readString(headers, ['Host', 'host']) || readString(proxy, ['host']) || undefined
  }
  return readString(proxy, ['host']) || undefined
}

function readClashGrpcServiceName(proxy: PlainObject): string | undefined {
  return readString(readObject(proxy, ['grpc-opts', 'grpc_opts']), ['grpc-service-name', 'service-name', 'service_name'])
    || readString(proxy, ['grpc-service-name', 'service-name', 'service_name'])
    || undefined
}

function readClashClientFingerprint(proxy: PlainObject, keys = ['client-fingerprint', 'client_fingerprint', 'fingerprint']) {
  return readString(proxy, keys)
}

function stringifyClashOptions(value: unknown): string {
  const options = asObject(value)
  if (!options) return ''
  return Object.entries(options)
    .flatMap(([key, raw]) => {
      if (raw == null) return []
      if (Array.isArray(raw)) {
        const joined = raw.map(item => String(item).trim()).filter(Boolean).join(',')
        return joined ? [`${key}=${joined}`] : []
      }
      if (typeof raw === 'object') {
        return [`${key}=${JSON.stringify(raw)}`]
      }
      const value = String(raw).trim()
      return value ? [`${key}=${value}`] : []
    })
    .join(';')
}

function asObject(value: unknown): PlainObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as PlainObject
    : null
}

function readObject(source: unknown, keys: string[]): PlainObject | null {
  const object = asObject(source)
  if (!object) return null
  for (const key of keys) {
    const value = object[key]
    const nested = asObject(value)
    if (nested) return nested
  }
  return null
}

function readValue(source: unknown, keys: string[]): unknown {
  const object = asObject(source)
  if (!object) return undefined
  for (const key of keys) {
    if (key in object) return object[key]
  }
  return undefined
}

function readString(source: unknown, keys: string[]): string {
  const object = asObject(source)
  if (!object) return ''
  for (const key of keys) {
    const value = object[key]
    if (value == null) continue
    const normalized = String(value).trim()
    if (normalized) return normalized
  }
  return ''
}

function readNumber(source: unknown, keys: string[]): number {
  const object = asObject(source)
  if (!object) return 0
  for (const key of keys) {
    const value = object[key]
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return 0
}

function readOptionalNumber(source: unknown, keys: string[]): number | undefined {
  const object = asObject(source)
  if (!object) return undefined
  for (const key of keys) {
    const value = object[key]
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return undefined
}

function readBoolean(source: unknown, keys: string[]): boolean {
  const object = asObject(source)
  if (!object) return false
  for (const key of keys) {
    const value = object[key]
    if (typeof value === 'boolean') return value
    const normalized = String(value ?? '').trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  }
  return false
}

function readStringList(source: unknown, keys: string[]): string[] {
  const object = asObject(source)
  if (!object) return []
  for (const key of keys) {
    const value = object[key]
    if (Array.isArray(value)) {
      const list = value.map(item => String(item).trim()).filter(Boolean)
      if (list.length > 0) return list
    }
    if (typeof value === 'string') {
      const list = value.split(',').map(item => item.trim()).filter(Boolean)
      if (list.length > 0) return list
    }
  }
  return []
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
  } catch {
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
  } catch {
    return null
  }
}

function parseHysteria(link: string): NodeConfig | null {
  const parsed = parseLinkLike(link)
  if (!parsed) return null

  const ports = parsePortListAndPrimary(parsed.portPart)
  if (!ports.server_port) return null

  const params = parsed.searchParams
  return {
    type: 'hysteria',
    tag: parsed.hash || 'Hysteria Node',
    server: parsed.server,
    server_port: ports.server_port,
    server_ports: ports.server_ports,
    auth: pickParam(params, ['auth']) || undefined,
    up_mbps: parseMbpsValue(pickParam(params, ['upmbps'])) ?? undefined,
    down_mbps: parseMbpsValue(pickParam(params, ['downmbps'])) ?? undefined,
    network: normalizeUdpTcpNetwork(pickParam(params, ['protocol'])) || undefined,
    obfs: pickParam(params, ['obfsParam']) || undefined,
    alpn: pickParam(params, ['alpn']) || undefined,
    tls: buildLinkTls({
      enabled: true,
      serverName: pickParam(params, ['peer']) || undefined,
      insecure: isTruthy(pickParam(params, ['insecure']))
    })
  }
}

function parseHysteria2(link: string): NodeConfig | null {
  const parsed = parseLinkLike(link)
  if (!parsed) return null

  const ports = parsePortListAndPrimary(parsed.portPart)
  if (!ports.server_port) return null

  const params = parsed.searchParams
  return {
    type: 'hysteria2',
    tag: parsed.hash || 'Hysteria2 Node',
    server: parsed.server,
    server_port: ports.server_port,
    server_ports: ports.server_ports,
    password: parsed.auth || undefined,
    obfs: pickParam(params, ['obfs']) || undefined,
    obfs_password: pickParam(params, ['obfs-password', 'obfs_password']) || undefined,
    alpn: pickParam(params, ['alpn']) || undefined,
    tls: buildLinkTls({
      enabled: true,
      serverName: pickParam(params, ['sni']) || undefined,
      insecure: isTruthy(pickParam(params, ['insecure']))
    })
  }
}

function parseTuic(link: string): NodeConfig | null {
  const parsed = parseLinkLike(link)
  if (!parsed) return null
  const port = Number(parsed.portPart)
  if (!Number.isFinite(port) || port <= 0) return null

  const params = parsed.searchParams
  const embeddedAuth = parseEmbeddedAuthPair(parsed)
  const uuid = embeddedAuth?.username || parsed.username || pickParam(params, ['uuid'])
  const password = embeddedAuth?.password || parsed.password || pickParam(params, ['password'])
  if (!uuid || !password) return null

  const fp = pickParam(params, ['fp', 'fingerprint', 'client-fingerprint']) || undefined
  return {
    type: 'tuic',
    tag: parsed.hash || 'TUIC Node',
    server: parsed.server,
    server_port: port,
    uuid,
    password,
    congestion_control: pickParam(params, ['congestion_control', 'congestion-controller']) || undefined,
    udp_relay_mode: pickParam(params, ['udp_relay_mode', 'udp-relay-mode']) || undefined,
    udp_over_stream: isTruthy(pickParam(params, ['udp_over_stream', 'udp-over-stream'])) || undefined,
    zero_rtt_handshake: isTruthy(pickParam(params, ['zero_rtt_handshake', 'zero-rtt-handshake', 'reduce-rtt'])) || undefined,
    heartbeat: parseDurationMilliseconds(pickParam(params, ['heartbeat', 'heartbeat-interval', 'heartbeat_interval'])) || undefined,
    network: normalizeUdpTcpNetwork(pickParam(params, ['network'])) || undefined,
    alpn: pickParam(params, ['alpn']) || undefined,
    fingerprint: fp,
    tls: buildLinkTls({
      enabled: true,
      serverName: pickParam(params, ['sni', 'serverName', 'server_name']) || undefined,
      disableSni: isTruthy(pickParam(params, ['disable-sni', 'disable_sni'])),
      insecure: isTruthy(pickParam(params, ['allowInsecure', 'insecure'])),
      fingerprint: fp
    })
  }
}

function parseAnyTls(link: string): NodeConfig | null {
  const parsed = parseLinkLike(link)
  if (!parsed) return null
  const port = Number(parsed.portPart)
  if (!Number.isFinite(port) || port <= 0) return null

  const params = parsed.searchParams
  const password = parsed.auth || pickParam(params, ['password']) || undefined
  if (!password) return null

  const fp = pickParam(params, ['fp', 'fingerprint', 'client-fingerprint']) || undefined
  return {
    type: 'anytls',
    tag: parsed.hash || 'AnyTLS Node',
    server: parsed.server,
    server_port: port,
    password,
    idle_session_check_interval: parseDurationSeconds(pickParam(params, ['idle-session-check-interval', 'idle_session_check_interval'])) || undefined,
    idle_session_timeout: parseDurationSeconds(pickParam(params, ['idle-session-timeout', 'idle_session_timeout'])) || undefined,
    min_idle_session: parseOptionalInteger(pickParam(params, ['min-idle-session', 'min_idle_session'])),
    alpn: pickParam(params, ['alpn']) || undefined,
    fingerprint: fp,
    tls: buildLinkTls({
      enabled: true,
      serverName: pickParam(params, ['sni', 'serverName', 'server_name']) || undefined,
      disableSni: isTruthy(pickParam(params, ['disable-sni', 'disable_sni'])),
      insecure: isTruthy(pickParam(params, ['allowInsecure', 'insecure'])),
      fingerprint: fp
    })
  }
}

function parseShadowTls(link: string): NodeConfig | null {
  const parsed = parseLinkLike(link)
  if (!parsed) return null
  const port = Number(parsed.portPart)
  if (!Number.isFinite(port) || port <= 0) return null

  const params = parsed.searchParams
  const fp = pickParam(params, ['fp', 'fingerprint', 'client-fingerprint']) || undefined
  const version = parseOptionalInteger(pickParam(params, ['version'])) ?? 3
  return {
    type: 'shadowtls',
    tag: parsed.hash || 'ShadowTLS Node',
    server: parsed.server,
    server_port: port,
    version,
    password: parsed.auth || pickParam(params, ['password']) || undefined,
    alpn: pickParam(params, ['alpn']) || undefined,
    fingerprint: fp,
    tls: buildLinkTls({
      enabled: true,
      serverName: pickParam(params, ['sni', 'serverName', 'server_name', 'peer']) || undefined,
      disableSni: isTruthy(pickParam(params, ['disable-sni', 'disable_sni'])),
      insecure: isTruthy(pickParam(params, ['allowInsecure', 'insecure'])),
      fingerprint: fp
    })
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
  } catch {
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
  } catch {
    return null
  }
}

export function generateBatchLinks(nodes: NodeConfig[]): string {
  if (nodes.length === 0) return ''

  const links = nodes.map(generateShareLink)
  if (links.every(Boolean)) {
    return Base64.encode((links as string[]).join('\n'))
  }

  return generateClashConfig(nodes)
}

export function generateShareLink(node: NodeConfig): string | null {
  switch (normalizeNodeType(node.type)) {
    case 'vmess': return generateVMess(node)
    case 'vless': return generateVLESS(node)
    case 'shadowsocks':
    case 'ss': return generateShadowsocks(node)
    case 'trojan': return generateTrojan(node)
    case 'hysteria': return generateHysteria(node)
    case 'hysteria2': return generateHysteria2(node)
    case 'tuic': return generateTuic(node)
    case 'socks': return generateSocks(node)
    case 'http': return generateHttp(node)
    default: return null
  }
}

function generateClashConfig(nodes: NodeConfig[]): string {
  const proxies = nodes
    .map(generateClashProxy)
    .filter((node): node is PlainObject => !!node)
  return stringifyYaml({ proxies })
}

function generateClashProxy(node: NodeConfig): PlainObject | null {
  const type = normalizeNodeType(node.type)
  const tls = normalizeTls(node)
  const fingerprint = node.fingerprint || tls.utls?.fingerprint
  const base: PlainObject = {
    name: node.tag,
    type,
    server: node.server,
    port: node.server_port
  }

  if (node.server_ports) base.ports = node.server_ports
  if (node.hop_interval) base['hop-interval'] = node.hop_interval
  if (tls.server_name) base.sni = tls.server_name
  if (tls.insecure) base['skip-cert-verify'] = true
  if (tls.disable_sni) base['disable-sni'] = true
  if (node.alpn) base.alpn = node.alpn.split(',').map(item => item.trim()).filter(Boolean)
  if (fingerprint) base['client-fingerprint'] = fingerprint

  switch (type) {
    case 'shadowsocks': {
      const pluginOpts = parseKeyValueOptions(node.plugin_opts)
      return {
        ...base,
        type: 'ss',
        cipher: node.method || 'aes-256-gcm',
        password: node.password || '',
        ...(node.plugin ? { plugin: node.plugin } : {}),
        ...(pluginOpts ? { 'plugin-opts': pluginOpts } : {})
      }
    }
    case 'vmess': {
      const proxy: PlainObject = {
        ...base,
        uuid: node.uuid || '',
        cipher: node.security || 'auto',
        network: node.network || 'tcp'
      }
      applyClashTransport(proxy, node)
      return proxy
    }
    case 'vless': {
      const proxy: PlainObject = {
        ...base,
        uuid: node.uuid || '',
        flow: node.flow || undefined,
        'packet-encoding': node.packet_encoding || undefined
      }
      if (node.security === 'reality') proxy.security = 'reality'
      else if (tls.enabled) proxy.tls = true
      applyClashTransport(proxy, node)
      if (node.tls?.reality?.enabled) {
        proxy['reality-opts'] = {
          'public-key': node.tls.reality.public_key,
          'short-id': node.tls.reality.short_id
        }
      }
      return proxy
    }
    case 'trojan': {
      const proxy: PlainObject = {
        ...base,
        password: node.password || ''
      }
      applyClashTransport(proxy, node)
      return proxy
    }
    case 'socks':
      return {
        ...base,
        username: node.username || undefined,
        password: node.password || undefined
      }
    case 'http':
      return {
        ...base,
        ...(tls.enabled ? { tls: true } : {}),
        username: node.username || undefined,
        password: node.password || undefined
      }
    case 'hysteria':
      return {
        ...base,
        'auth-str': node.auth || undefined,
        obfs: node.obfs || undefined,
        protocol: node.network || undefined,
        up: toMbpsString(node.up_mbps),
        down: toMbpsString(node.down_mbps)
      }
    case 'hysteria2':
      return {
        ...base,
        password: node.password || '',
        obfs: node.obfs || undefined,
        'obfs-password': node.obfs_password || undefined,
        ...(node.network ? { network: node.network } : {}),
        ...(node.up_mbps ? { up: toMbpsString(node.up_mbps) } : {}),
        ...(node.down_mbps ? { down: toMbpsString(node.down_mbps) } : {})
      }
    case 'tuic': {
      const proxy: PlainObject = {
        ...base,
        uuid: node.uuid || '',
        password: node.password || ''
      }
      if (node.congestion_control) proxy['congestion-controller'] = node.congestion_control
      if (node.udp_relay_mode) proxy['udp-relay-mode'] = node.udp_relay_mode
      if (node.udp_over_stream != null) proxy['udp-over-stream'] = !!node.udp_over_stream
      if (node.zero_rtt_handshake != null) proxy['reduce-rtt'] = !!node.zero_rtt_handshake
      const heartbeatMs = parseDurationToMilliseconds(node.heartbeat)
      if (heartbeatMs != null) proxy['heartbeat-interval'] = heartbeatMs
      return proxy
    }
    case 'anytls':
      return {
        ...base,
        password: node.password || '',
        'idle-session-check-interval': node.idle_session_check_interval || undefined,
        'idle-session-timeout': node.idle_session_timeout || undefined,
        'min-idle-session': node.min_idle_session ?? undefined
      }
    case 'shadowtls':
      return {
        ...base,
        version: node.version || 3,
        password: node.password || undefined
      }
    default:
      return null
  }
}

function generateVMess(node: NodeConfig): string {
  const config = {
    v: '2',
    ps: node.tag,
    add: node.server,
    port: node.server_port,
    id: node.uuid,
    aid: 0,
    scy: node.security || 'auto',
    net: node.network || 'tcp',
    type: 'none',
    host: node.host || '',
    path: node.network === 'grpc' ? (node.service_name || '') : (node.path || ''),
    tls: node.tls?.enabled ? 'tls' : '',
    sni: node.tls?.server_name || '',
    alpn: node.alpn || '',
    fp: node.fingerprint || node.tls?.utls?.fingerprint || '',
    allowInsecure: node.tls?.insecure ? '1' : '0'
  }
  return 'vmess://' + Base64.encode(JSON.stringify(config))
}

function generateVLESS(node: NodeConfig): string {
  const uuid = node.uuid || ''
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

  return `vless://${uuid}@${node.server}:${node.server_port}?${params.toString()}#${encodeURIComponent(node.tag)}`
}

function generateShadowsocks(node: NodeConfig): string {
  const method = node.method || 'chacha20-ietf-poly1305'
  const password = node.password || ''
  const userInfo = Base64.encode(`${method}:${password}`)
  let link = `ss://${userInfo}@${node.server}:${node.server_port}`

  if (node.plugin) {
    let pluginStr = node.plugin
    if (node.plugin_opts) pluginStr += ';' + node.plugin_opts
    link += `/?plugin=${encodeURIComponent(pluginStr)}`
  }

  return link + '#' + encodeURIComponent(node.tag)
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

  return `trojan://${password}@${node.server}:${node.server_port}?${params.toString()}#${encodeURIComponent(node.tag)}`
}

function generateHysteria(node: NodeConfig): string {
  const params = new URLSearchParams()
  if (node.auth) params.set('auth', node.auth)
  if (node.network) params.set('protocol', node.network)
  if (node.tls?.server_name) params.set('peer', node.tls.server_name)
  if (node.tls?.insecure) params.set('insecure', '1')
  if (node.up_mbps) params.set('upmbps', String(node.up_mbps))
  if (node.down_mbps) params.set('downmbps', String(node.down_mbps))
  if (node.alpn) params.set('alpn', node.alpn)
  if (node.obfs) {
    params.set('obfs', 'xplus')
    params.set('obfsParam', node.obfs)
  }

  return `hysteria://${formatAuthority(node)}?${params.toString()}#${encodeURIComponent(node.tag)}`
}

function generateHysteria2(node: NodeConfig): string {
  const params = new URLSearchParams()
  if (node.obfs) params.set('obfs', node.obfs)
  if (node.obfs_password) params.set('obfs-password', node.obfs_password)
  if (node.tls?.server_name) params.set('sni', node.tls.server_name)
  if (node.tls?.insecure) params.set('insecure', '1')
  if (node.alpn) params.set('alpn', node.alpn)
  const auth = node.password ? `${encodeURIComponent(node.password)}@` : ''
  return `hysteria2://${auth}${formatAuthority(node)}/?${params.toString()}#${encodeURIComponent(node.tag)}`
}

function generateTuic(node: NodeConfig): string {
  const params = new URLSearchParams()
  if (node.congestion_control) params.set('congestion_control', node.congestion_control)
  if (node.udp_relay_mode) params.set('udp_relay_mode', node.udp_relay_mode)
  if (node.udp_over_stream) params.set('udp_over_stream', '1')
  if (node.zero_rtt_handshake) params.set('zero_rtt_handshake', '1')
  if (node.heartbeat) params.set('heartbeat', node.heartbeat)
  if (node.network) params.set('network', node.network)
  if (node.alpn) params.set('alpn', node.alpn)
  if (node.tls?.server_name) params.set('sni', node.tls.server_name)
  if (node.tls?.disable_sni) params.set('disable-sni', '1')
  if (node.tls?.insecure) params.set('allowInsecure', '1')
  if (node.fingerprint || node.tls?.utls?.fingerprint) {
    params.set('fp', node.fingerprint || node.tls?.utls?.fingerprint || 'chrome')
  }

  const uuid = encodeURIComponent(node.uuid || '')
  const password = encodeURIComponent(node.password || '')
  return `tuic://${uuid}:${password}@${formatAuthority(node)}?${params.toString()}#${encodeURIComponent(node.tag)}`
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

function parseLinkLike(link: string): ParsedLinkLike | null {
  const match = String(link || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(?:\/[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/i)
  if (!match) return null

  const scheme = String(match[1] || '').toLowerCase()
  const authority = String(match[2] || '')
  const query = String(match[3] || '')
  const hash = decodeURIComponentSafe(String(match[4] || ''))

  const at = authority.lastIndexOf('@')
  const rawAuth = at >= 0 ? authority.slice(0, at) : ''
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority

  const { host, portPart } = splitHostPort(hostPort)
  if (!host) return null

  const auth = decodeURIComponentSafe(rawAuth)
  const authSep = rawAuth.indexOf(':')
  const username = authSep >= 0 ? decodeURIComponentSafe(rawAuth.slice(0, authSep)) : auth
  const password = authSep >= 0 ? decodeURIComponentSafe(rawAuth.slice(authSep + 1)) : ''

  return {
    scheme,
    auth,
    username,
    password,
    server: decodeURIComponentSafe(host),
    portPart: decodeURIComponentSafe(portPart),
    searchParams: new URLSearchParams(query),
    hash
  }
}

function splitHostPort(value: string): { host: string; portPart: string } {
  const raw = String(value || '').trim()
  if (!raw) return { host: '', portPart: '' }
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']')
    if (end < 0) return { host: '', portPart: '' }
    return {
      host: raw.slice(1, end),
      portPart: raw.slice(end + 1).replace(/^:/, '')
    }
  }
  const lastColon = raw.lastIndexOf(':')
  if (lastColon <= 0) return { host: raw, portPart: '' }
  return {
    host: raw.slice(0, lastColon),
    portPart: raw.slice(lastColon + 1)
  }
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parsePortListAndPrimary(portPart: string): { server_port: number; server_ports?: string } {
  const raw = String(portPart || '').trim()
  if (!raw) return { server_port: 0 }
  const firstToken = raw.split(',')[0]?.trim() || ''
  const firstPort = Number((firstToken.split('-')[0] || '').trim())
  return {
    server_port: Number.isFinite(firstPort) && firstPort > 0 ? firstPort : 0,
    server_ports: raw.includes(',') || raw.includes('-') ? raw : undefined
  }
}

function normalizeUdpTcpNetwork(value: unknown): string | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'udp') return 'udp'
  if (normalized === 'tcp' || normalized === 'faketcp' || normalized === 'wechat-video') return 'tcp'
  return undefined
}

function parsePortRanges(value: unknown): string | undefined {
  if (value == null) return undefined
  if (Array.isArray(value)) {
    const joined = value.map(item => String(item).trim()).filter(Boolean).join(',')
    return joined || undefined
  }
  const normalized = String(value).trim()
  return normalized || undefined
}

function parseMbpsValue(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)

  const text = String(value).trim()
  if (!text) return undefined
  const plain = Number(text)
  if (Number.isFinite(plain)) return Math.round(plain)

  const match = text.match(/^([\d.]+)\s*([kKmMgGtT]?)([bB])ps$/)
  if (!match) return undefined

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined

  const prefix = String(match[2] || '').toLowerCase()
  const kind = String(match[3] || 'b')
  const multipliers: Record<string, number> = {
    '': 1,
    k: 1e3,
    m: 1e6,
    g: 1e9,
    t: 1e12
  }
  const unitBits = multipliers[prefix] || 1
  const bitsPerSecond = amount * unitBits * (kind === 'B' ? 8 : 1)
  return Math.round(bitsPerSecond / 1e6)
}

function parseDurationSeconds(value: unknown): string | undefined {
  return normalizeDurationValue(value, 's')
}

function parseDurationMilliseconds(value: unknown): string | undefined {
  return normalizeDurationValue(value, 'ms')
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.trunc(numeric)
}

function parseEmbeddedAuthPair(parsed: Pick<ParsedLinkLike, 'auth' | 'username' | 'password'>): {
  username: string
  password: string
} | null {
  if (parsed.password) return null
  const decodedAuth = String(parsed.auth || '').trim()
  if (!decodedAuth) return null
  const colon = decodedAuth.indexOf(':')
  if (colon <= 0) return null

  const username = decodedAuth.slice(0, colon).trim()
  const password = decodedAuth.slice(colon + 1).trim()
  if (!username || !password) return null

  return {
    username,
    password
  }
}

function normalizeDurationValue(value: unknown, defaultUnit: 's' | 'ms'): string | undefined {
  if (value == null || value === '') return undefined
  const text = String(value).trim()
  if (!text) return undefined
  if (/[a-z]/i.test(text)) return text
  const numeric = Number(text)
  if (!Number.isFinite(numeric)) return undefined
  return `${numeric}${defaultUnit}`
}

function buildLinkTls(input: {
  enabled: boolean
  serverName?: string
  disableSni?: boolean
  insecure?: boolean
  fingerprint?: string
}): NodeTlsConfig {
  return {
    enabled: input.enabled,
    server_name: input.serverName || undefined,
    disable_sni: input.disableSni || undefined,
    insecure: !!input.insecure,
    utls: input.fingerprint
      ? {
        enabled: true,
        fingerprint: input.fingerprint
      }
      : undefined
  }
}

function normalizeTls(node: NodeConfig): NodeTlsConfig {
  return {
    enabled: !!node.tls?.enabled,
    server_name: node.tls?.server_name || undefined,
    disable_sni: node.tls?.disable_sni || undefined,
    insecure: !!node.tls?.insecure,
    utls: node.fingerprint || node.tls?.utls?.fingerprint
      ? {
        enabled: true,
        fingerprint: node.fingerprint || node.tls?.utls?.fingerprint || 'chrome'
      }
      : undefined,
    reality: node.tls?.reality
  }
}

function applyClashTransport(proxy: PlainObject, node: NodeConfig) {
  const network = String(node.network || 'tcp').trim().toLowerCase()
  if (!network || network === 'tcp') return

  proxy.network = network
  if (network === 'ws') {
    proxy['ws-opts'] = {
      path: node.path || '/',
      headers: node.host ? { Host: node.host } : undefined
    }
    return
  }
  if (network === 'grpc') {
    proxy['grpc-opts'] = {
      'grpc-service-name': node.service_name || ''
    }
    return
  }
  if (network === 'h2' && node.path) {
    proxy['h2-opts'] = { path: node.path }
    return
  }
  if (node.path) proxy.path = node.path
  if (node.host) proxy.host = node.host
  if (node.service_name) proxy['service-name'] = node.service_name
}

function parseKeyValueOptions(value: string | undefined): PlainObject | undefined {
  const raw = String(value || '').trim()
  if (!raw) return undefined

  const result: PlainObject = {}
  for (const chunk of raw.split(';')) {
    const piece = chunk.trim()
    if (!piece) continue
    const eq = piece.indexOf('=')
    if (eq < 0) {
      result[piece] = true
      continue
    }
    const key = piece.slice(0, eq).trim()
    const val = piece.slice(eq + 1).trim()
    if (!key) continue
    result[key] = val
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function parseDurationToMilliseconds(value: string | undefined): number | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)

  const match = raw.match(/^([\d.]+)\s*(ms|s|m|h)$/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  switch (match[2]) {
    case 'ms': return Math.round(amount)
    case 's': return Math.round(amount * 1000)
    case 'm': return Math.round(amount * 60 * 1000)
    case 'h': return Math.round(amount * 60 * 60 * 1000)
    default: return null
  }
}

function formatAuthority(node: NodeConfig): string {
  const host = formatHostForAuthority(node.server)
  const portPart = String(node.server_ports || '').trim() || String(node.server_port || '').trim()
  return portPart ? `${host}:${portPart}` : host
}

function formatHostForAuthority(host: string): string {
  const value = String(host || '').trim()
  if (!value) return value
  if (value.includes(':') && !value.startsWith('[')) return `[${value}]`
  return value
}

function toMbpsString(value: number | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return `${Math.round(value)} Mbps`
}

function generateSocks(node: NodeConfig): string {
  const username = encodeURIComponent(node.username || '')
  const password = encodeURIComponent(node.password || '')
  const auth = username ? `${username}${password ? `:${password}` : ''}@` : ''
  return `socks://${auth}${node.server}:${node.server_port}#${encodeURIComponent(node.tag)}`
}

function generateHttp(node: NodeConfig): string {
  const username = encodeURIComponent(node.username || '')
  const password = encodeURIComponent(node.password || '')
  const auth = username ? `${username}${password ? `:${password}` : ''}@` : ''
  return `http://${auth}${node.server}:${node.server_port}#${encodeURIComponent(node.tag)}`
}
