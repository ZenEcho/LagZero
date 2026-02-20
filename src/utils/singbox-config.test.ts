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
    expect(tun.strict_route).toBe(false)
    expect(tun.stack).toBe('system')
    expect(cfg.route.rules.some((r: any) => r.protocol === 'udp')).toBe(false)

    const nodeOut = cfg.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut.packet_encoding).toBe('packetaddr')
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
})
