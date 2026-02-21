import { describe, it, expect } from 'vitest'
import { generateSingboxConfig } from './singbox-config'
import type { Game, DnsConfigOptions } from '@/types'

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

function buildConfig(options?: DnsConfigOptions): any {
  return JSON.parse(generateSingboxConfig(baseGame, baseNode, options))
}

describe('generateSingboxConfig session tuning', () => {
  it('keeps legacy defaults without session tuning', () => {
    const cfg = buildConfig({ mode: 'secure' })
    const tun = cfg.inbounds.find((i: any) => i.tag === 'tun-in')
    expect(tun.mtu).toBe(1280)
    expect(tun.inet6_address).toBeUndefined()
    expect(tun.strict_route).toBe(false)
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
})
