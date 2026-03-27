import { describe, it, expect } from 'vitest'
import { generateSingboxConfig } from '../../src/utils/singbox-config'
import type { Game, DnsConfigOptions } from '../../src/types'

const baseGame: Game = {
  id: 'g1',
  name: 'Test Game',
  processName: ['game.exe'],
  category: 'fps',
  proxyMode: 'process',
  routingRules: []
}

const baseNode: any = {
  type: 'vless',
  tag: 'node-1',
  server: 'example.com',
  server_port: 443,
  uuid: '11111111-1111-1111-1111-111111111111',
  network: 'tcp',
  tls: {
    enabled: true,
    insecure: false
  },
  packet_encoding: 'packetaddr'
}

function buildConfig(options?: DnsConfigOptions, nodeOverride?: Record<string, unknown>): any {
  return JSON.parse(generateSingboxConfig(baseGame, { ...baseNode, ...nodeOverride }, options))
}

describe('generateSingboxConfig session tuning', () => {
  it('keeps legacy defaults without session tuning', () => {
    const cfg = buildConfig({ mode: 'secure' })
    const tun = cfg.inbounds.find((i: any) => i.tag === 'tun-in')
    expect(tun.mtu).toBe(1280)
    expect(tun.address).toEqual(['172.19.0.1/30'])
    expect(tun.inet4_address).toBeUndefined()
    expect(tun.inet6_address).toBeUndefined()
    expect(tun.strict_route).toBe(false)
    expect(tun.endpoint_independent_nat).toBe(true)
    expect(tun.stack).toBe('system')
    const remotePrimary = cfg.dns.servers.find((s: any) => s.tag === 'remote-primary')
    expect(remotePrimary?.strategy).toBe('ipv4_only')
    expect(cfg.dns.final).toBe('remote-primary')
    expect(cfg.route.rules.some((r: any) => r.protocol === 'udp')).toBe(false)

    const nodeOut = cfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut.packet_encoding).toBe('packetaddr')
    expect(nodeOut.domain_strategy).toBeUndefined()
  })

  it('applies stable/aggressive tun mappings and vless xudp override', () => {
    const cfg = buildConfig({
      mode: 'secure',
      sessionTuning: {
        enabled: true,
        profile: 'aggressive',
        udpMode: 'auto',
        tunMtu: 1360,
        tunStack: 'mixed',
        strictRoute: true,
        vlessPacketEncodingOverride: 'xudp',
        highLossHintOnly: true
      }
    })

    const tun = cfg.inbounds.find((i: any) => i.tag === 'tun-in')
    expect(tun.mtu).toBe(1360)
    expect(tun.strict_route).toBe(true)
    expect(tun.endpoint_independent_nat).toBe(true)
    expect(tun.stack).toBe('mixed')

    const nodeOut = cfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut.packet_encoding).toBe('xudp')
  })

  it('injects UDP preference rules by mode', () => {
    const preferUdp = buildConfig({
      mode: 'secure',
      sessionTuning: {
        enabled: true,
        profile: 'stable',
        udpMode: 'prefer_udp',
        tunMtu: 1280,
        tunStack: 'system',
        strictRoute: false,
        vlessPacketEncodingOverride: 'off',
        highLossHintOnly: true
      }
    })
    const udpProxyRule = preferUdp.route.rules.find((r: any) => r.protocol === 'udp')
    expect(udpProxyRule?.outbound).toBe('proxy')

    const preferTcp = buildConfig({
      mode: 'secure',
      sessionTuning: {
        enabled: true,
        profile: 'stable',
        udpMode: 'prefer_tcp',
        tunMtu: 1280,
        tunStack: 'system',
        strictRoute: false,
        vlessPacketEncodingOverride: 'off',
        highLossHintOnly: true
      }
    })
    const udpDirectRule = preferTcp.route.rules.find((r: any) => r.protocol === 'udp')
    expect(udpDirectRule?.outbound).toBe('direct')
  })

  it('parses wildcard and localhost bypass entries into direct rules', () => {
    const cfg = buildConfig({
      mode: 'secure',
      proxyBypassList: 'localhost;192.168.*'
    })

    const ipBypassRule = cfg.route.rules.find((r: any) =>
      Array.isArray(r?.ip_cidr) && r.ip_cidr.includes('192.168.0.0/16') && r.outbound === 'direct'
    )
    expect(ipBypassRule).toBeDefined()

    const localhostRule = cfg.route.rules.find((r: any) =>
      Array.isArray(r?.domain) && r.domain.includes('localhost') && r.outbound === 'direct'
    )
    expect(localhostRule).toBeDefined()
  })

  it('ignores session tuning in system proxy mode', () => {
    const cfg = buildConfig({
      accelNetworkMode: 'system_proxy',
      systemProxy: {
        enabled: true,
        port: 10808
      },
      sessionTuning: {
        enabled: true,
        profile: 'aggressive',
        udpMode: 'prefer_udp',
        tunMtu: 1360,
        tunStack: 'mixed',
        strictRoute: true,
        vlessPacketEncodingOverride: 'xudp',
        highLossHintOnly: true
      }
    })

    const tunInbound = cfg.inbounds.find((i: any) => i.tag === 'tun-in')
    expect(tunInbound).toBeUndefined()
    expect(cfg.route.rules.some((r: any) => r.protocol === 'udp')).toBe(false)

    const nodeOut = cfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut.packet_encoding).toBe('packetaddr')
    expect(nodeOut.domain_strategy).toBeUndefined()
  })

  it('keeps process filtering in system proxy process mode', () => {
    const cfg = buildConfig({
      accelNetworkMode: 'system_proxy',
      systemProxy: {
        enabled: true,
        port: 10808
      }
    })

    const forcedInboundRule = cfg.route.rules.find((r: any) =>
      Array.isArray(r?.inbound) && r.inbound.includes('system-http-in') && r.outbound === 'proxy'
    )
    expect(forcedInboundRule).toBeDefined()
    expect(Array.isArray(forcedInboundRule.process_name)).toBe(true)
    expect(forcedInboundRule.process_name).toContain('game.exe')
  })

  it('adds bootstrap DNS server when configured', () => {
    const cfg = buildConfig({
      mode: 'secure',
      primary: 'https://cloudflare-dns.com/dns-query',
      secondary: 'https://cloudflare-dns.com/dns-query',
      bootstrap: '223.5.5.5'
    })

    const bootstrapServer = cfg.dns.servers.find((s: any) => s.tag === 'bootstrap')
    expect(bootstrapServer).toBeDefined()
    expect(bootstrapServer.address).toBe('223.5.5.5')
    expect(bootstrapServer.strategy).toBe('ipv4_only')
  })

  it('keeps process scope for routing ip rules parsed from comma-separated entries', () => {
    const cfg = JSON.parse(generateSingboxConfig(
      {
        ...baseGame,
        proxyMode: 'routing',
        processName: ['chrome.exe'],
        routingRules: ['1.1.1.1, 8.8.8.8/32']
      },
      baseNode,
      { mode: 'secure' }
    ))

    expect(cfg.route.final).toBe('direct')
    expect(cfg.dns.final).toBe('remote-primary')
    const cidrRule = cfg.route.rules.find((r: any) =>
      Array.isArray(r?.ip_cidr) && r.ip_cidr.includes('1.1.1.1/32') && r.ip_cidr.includes('8.8.8.8/32')
    )
    expect(cidrRule).toBeDefined()
    expect(cidrRule.outbound).toBe('proxy')
    expect(Array.isArray(cidrRule.process_name)).toBe(true)
    expect(cidrRule.process_name).toContain('chrome.exe')
  })

  it('scopes routing global to specified processes', () => {
    const cfg = JSON.parse(generateSingboxConfig(
      {
        ...baseGame,
        proxyMode: 'routing',
        routingRules: ['global'],
        processName: ['msedge.exe']
      },
      baseNode,
      { mode: 'secure' }
    ))

    // With process scope, only msedge goes through proxy; everything else is direct.
    expect(cfg.route.final).toBe('direct')
    expect(cfg.dns.final).toBe('remote-primary')
    expect(cfg.route.rules.some((r: any) =>
      Array.isArray(r?.process_name) && r.process_name.includes('msedge.exe') && r.outbound === 'proxy'
    )).toBe(true)
  })

  it('builds Hysteria2 outbounds with port ranges and obfs', () => {
    const cfg = buildConfig({ mode: 'secure' }, {
      type: 'hysteria2',
      server: 'hy2.example.com',
      server_port: 443,
      server_ports: '443,8443-9443',
      hop_interval: '30s',
      password: 'hy2-pass',
      obfs: 'salamander',
      obfs_password: 'hy2-obfs',
      up_mbps: 50,
      down_mbps: 200,
      network: 'udp',
      tls: {
        enabled: true,
        server_name: 'edge.example.com',
        insecure: false
      }
    })

    const nodeOut = cfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut).toMatchObject({
      type: 'hysteria2',
      server: 'hy2.example.com',
      server_ports: ['443', '8443-9443'],
      hop_interval: '30s',
      password: 'hy2-pass',
      up_mbps: 50,
      down_mbps: 200,
      network: 'udp'
    })
    expect(nodeOut.obfs).toMatchObject({
      type: 'salamander',
      password: 'hy2-obfs'
    })
    expect(nodeOut.tls?.server_name).toBe('edge.example.com')
  })

  it('builds TUIC outbounds with transport toggles', () => {
    const cfg = buildConfig({ mode: 'secure' }, {
      type: 'tuic',
      server: 'tuic.example.com',
      server_port: 443,
      uuid: '22222222-2222-2222-2222-222222222222',
      password: 'tuic-pass',
      congestion_control: 'bbr',
      udp_relay_mode: 'native',
      udp_over_stream: true,
      zero_rtt_handshake: true,
      heartbeat: '10s',
      network: 'udp',
      tls: {
        enabled: true,
        server_name: 'tuic.example.com',
        disable_sni: true,
        insecure: false
      }
    })

    const nodeOut = cfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut).toMatchObject({
      type: 'tuic',
      uuid: '22222222-2222-2222-2222-222222222222',
      password: 'tuic-pass',
      congestion_control: 'bbr',
      udp_relay_mode: 'native',
      udp_over_stream: true,
      zero_rtt_handshake: true,
      heartbeat: '10s',
      network: 'udp'
    })
    expect(nodeOut.tls?.disable_sni).toBe(true)
  })

  it('builds AnyTLS and ShadowTLS outbounds', () => {
    const anyTlsCfg = buildConfig({ mode: 'secure' }, {
      type: 'anytls',
      server: 'anytls.example.com',
      server_port: 443,
      password: 'anytls-pass',
      idle_session_check_interval: '15s',
      idle_session_timeout: '30s',
      min_idle_session: 2,
      alpn: 'h2,http/1.1',
      fingerprint: 'chrome',
      tls: {
        enabled: true,
        server_name: 'anytls.example.com',
        disable_sni: true,
        insecure: false
      }
    })
    const anyTlsOut = anyTlsCfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(anyTlsOut).toMatchObject({
      type: 'anytls',
      password: 'anytls-pass',
      idle_session_check_interval: '15s',
      idle_session_timeout: '30s',
      min_idle_session: 2
    })
    expect(anyTlsOut.tls).toMatchObject({
      enabled: true,
      server_name: 'anytls.example.com',
      disable_sni: true,
      alpn: ['h2', 'http/1.1']
    })
    expect(anyTlsOut.tls?.utls?.fingerprint).toBe('chrome')

    const shadowTlsCfg = buildConfig({ mode: 'secure' }, {
      type: 'shadowtls',
      server: 'shadowtls.example.com',
      server_port: 443,
      version: 3,
      password: 'shadow-pass',
      fingerprint: 'firefox',
      tls: {
        enabled: true,
        server_name: 'shadowtls.example.com',
        insecure: false
      }
    })
    const shadowTlsOut = shadowTlsCfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(shadowTlsOut).toMatchObject({
      type: 'shadowtls',
      version: 3,
      password: 'shadow-pass'
    })
    expect(shadowTlsOut.tls?.server_name).toBe('shadowtls.example.com')
    expect(shadowTlsOut.tls?.utls?.fingerprint).toBe('firefox')
  })
})
