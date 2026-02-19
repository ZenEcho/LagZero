import { describe, it, expect } from 'vitest'
import { generateSingboxConfig } from '../../src/utils/singbox-config'
import type { Game } from '../../src/types'
import { parseShareLink, type NodeConfig } from '../../src/utils/protocol'

describe('generateSingboxConfig', () => {
  const mockGame: Game = {
    id: 'game-1',
    name: 'Test Game',
    processName: ['game.exe'],
    category: 'fps',
    nodeId: 'node-1',
    proxyMode: 'process'
  }

  const mockNode: NodeConfig = {
    id: 'node-1',
    type: 'vmess',
    tag: 'Test Node',
    server: 'example.com',
    server_port: 443,
    uuid: 'uuid-123',
    security: 'auto',
    network: 'ws',
    path: '/ws',
    tls: {
      enabled: true,
      server_name: 'example.com'
    }
  }

  it('should generate valid JSON config', () => {
    const configStr = generateSingboxConfig(mockGame, mockNode)
    expect(() => JSON.parse(configStr)).not.toThrow()
    const config = JSON.parse(configStr)
    expect(config.log.level).toBe('info')
    expect(config.inbounds[0].type).toBe('tun')
  })

  it('should configure process mode correctly', () => {
    const config = JSON.parse(generateSingboxConfig(mockGame, mockNode))
    // Process mode: default final should be 'direct' (implied by not being 'proxy' or explicit final)
    // Actually in my impl: final: isRoutingMode ? 'proxy' : 'direct'
    expect(config.route.final).toBe('direct')
    
    // Should have rule for game process -> proxy
    const gameRule = config.route.rules.find((r: any) => r.process_name && r.process_name.includes('game.exe'))
    expect(gameRule).toBeDefined()
    expect(gameRule.outbound).toBe('proxy')
  })

  it('should configure routing mode correctly', () => {
    const routingGame = { ...mockGame, proxyMode: 'routing' as const }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))
    
    expect(config.route.final).toBe('direct')

    expect(config.dns.final).toBe('remote-primary')

    const tunInbound = config.inbounds.find((i: any) => i.tag === 'tun-in')
    expect(tunInbound).toBeDefined()
    expect(tunInbound.inet4_address).toBeDefined()
  })

  it('should only proxy configured CIDR rules in routing mode', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      routingRules: ['216.58.220.1/24']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))

    expect(config.route.final).toBe('direct')
    const cidrRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.ip_cidr) && r.ip_cidr.includes('216.58.220.1/24')
    )
    expect(cidrRule).toBeDefined()
    expect(cidrRule.outbound).toBe('proxy')
  })

  it('should only proxy configured CIDR for specified processes in routing mode', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      processName: ['chrome.exe', 'msedge.exe'],
      routingRules: ['216.58.220.1/24']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))

    expect(config.route.final).toBe('direct')
    const cidrRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.ip_cidr) && r.ip_cidr.includes('216.58.220.1/24')
    )
    expect(cidrRule).toBeDefined()
    expect(cidrRule.outbound).toBe('proxy')
    expect(Array.isArray(cidrRule.process_name)).toBe(true)
    expect(cidrRule.process_name).toContain('chrome.exe')
    expect(cidrRule.process_name).toContain('msedge.exe')
  })

  it('should include exe alias for bare process names in routing mode', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      processName: ['chrome'],
      routingRules: ['1.1.1.1']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))
    const cidrRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.ip_cidr) && r.ip_cidr.includes('1.1.1.1/32')
    )
    expect(cidrRule).toBeDefined()
    expect(Array.isArray(cidrRule.process_name)).toBe(true)
    expect(cidrRule.process_name).toContain('chrome')
    expect(cidrRule.process_name).toContain('chrome.exe')
  })

  it('should use remote geoip-cn and geosite-cn rulesets for bypass_cn mode', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      routingRules: ['bypass_cn']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))

    expect(config.route.final).toBe('direct')

    const geoipRuleSet = config.route.rule_set?.find((r: any) => r?.tag === 'geoip-cn')
    expect(geoipRuleSet).toBeDefined()
    expect(geoipRuleSet.type).toBe('remote')
    expect(geoipRuleSet.format).toBe('binary')
    expect(String(geoipRuleSet.url)).toContain('Loyalsoldier/geoip')
    expect(geoipRuleSet.download_detour).toBe('proxy')
    const geositeRuleSet = config.route.rule_set?.find((r: any) => r?.tag === 'geosite-cn')
    expect(geositeRuleSet).toBeDefined()
    expect(geositeRuleSet.type).toBe('remote')
    expect(geositeRuleSet.format).toBe('binary')
    expect(String(geositeRuleSet.url)).toContain('sing-geosite')
    expect(geositeRuleSet.download_detour).toBe('proxy')

    const geoipRouteRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.rule_set) && r.rule_set.includes('geoip-cn')
    )
    expect(geoipRouteRule).toBeDefined()
    expect(geoipRouteRule.outbound).toBe('direct')
    const geositeRouteRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.rule_set) && r.rule_set.includes('geosite-cn')
    )
    expect(geositeRouteRule).toBeDefined()
    expect(geositeRouteRule.outbound).toBe('direct')
  })

  it('should keep bypass_cn scoped to selected processes when process names are provided', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      processName: ['chrome.exe'],
      routingRules: ['bypass_cn']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))

    expect(config.route.final).toBe('direct')
    const geoipDirectRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.rule_set) && r.rule_set.includes('geoip-cn')
    )
    expect(geoipDirectRule).toBeDefined()
    expect(geoipDirectRule.process_name).toContain('chrome.exe')
    const processProxyRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.process_name) && r.process_name.includes('chrome.exe') && r.outbound === 'proxy'
    )
    expect(processProxyRule).toBeDefined()
  })

  it('should scope global routing to selected processes when process names are provided', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      processName: ['chrome.exe'],
      routingRules: ['global']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))

    expect(config.route.final).toBe('direct')
    const processProxyRule = config.route.rules.find((r: any) =>
      Array.isArray(r?.process_name) && r.process_name.includes('chrome.exe') && r.outbound === 'proxy'
    )
    expect(processProxyRule).toBeDefined()
  })

  it('should keep global routing as full proxy when no process names are provided', () => {
    const routingGame = {
      ...mockGame,
      proxyMode: 'routing' as const,
      processName: [],
      routingRules: ['global']
    }
    const config = JSON.parse(generateSingboxConfig(routingGame, mockNode))
    expect(config.route.final).toBe('proxy')
  })

  it('should include node outbound', () => {
    const config = JSON.parse(generateSingboxConfig(mockGame, mockNode))
    const nodeOut = config.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut).toBeDefined()
    expect(nodeOut.type).toBe('vmess')
    expect(nodeOut.server).toBe('example.com')
  })

  it('should not use IP as TLS server_name fallback', () => {
    const ipNode: NodeConfig = {
      ...mockNode,
      server: '1.2.3.4',
      host: undefined,
      tls: {
        enabled: true,
        server_name: ''
      }
    }
    const config = JSON.parse(generateSingboxConfig(mockGame, ipNode))
    const nodeOut = config.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut?.tls?.server_name).toBeUndefined()
  })

  it('should keep domain TLS server_name fallback', () => {
    const domainNode: NodeConfig = {
      ...mockNode,
      server: 'node.example.com',
      host: undefined,
      tls: {
        enabled: true,
        server_name: ''
      }
    }
    const config = JSON.parse(generateSingboxConfig(mockGame, domainNode))
    const nodeOut = config.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut?.tls?.server_name).toBe('node.example.com')
  })

  it('should generate VLESS reality outbound from share link', () => {
    const link = 'vless://13a3abd8-6315-4735-b3a2-39f38a2e4f3d@156.246.93.26:38073?encryption=none&security=reality&flow=xtls-rprx-vision&type=tcp&sni=www.paypal.com&pbk=DrpIgSOtaEHqJywmydYjljWB9FD_1PlFjQIAlbHiOgk&fp=chrome#233boy-reality-156.246.93.26'
    const node = parseShareLink(link)
    expect(node).not.toBeNull()
    const config = JSON.parse(generateSingboxConfig(mockGame, node as NodeConfig))
    const nodeOut = config.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut?.type).toBe('vless')
    expect(nodeOut?.flow).toBe('xtls-rprx-vision')
    expect(nodeOut?.tls?.server_name).toBe('www.paypal.com')
    expect(nodeOut?.tls?.reality?.enabled).toBe(true)
    expect(nodeOut?.tls?.reality?.public_key).toBe('DrpIgSOtaEHqJywmydYjljWB9FD_1PlFjQIAlbHiOgk')
  })

  it('should add bootstrap DNS rule for domain node in secure mode', () => {
    const domainNode: NodeConfig = {
      ...mockNode,
      server: 'm.cnmjin.net',
      tls: {
        enabled: false
      }
    }
    const config = JSON.parse(generateSingboxConfig(mockGame, domainNode, { mode: 'secure' }))
    const bootstrapRule = config.dns.rules.find((r: any) =>
      Array.isArray(r?.domain) && r.domain.includes('m.cnmjin.net')
    )
    expect(bootstrapRule).toBeDefined()
    expect(bootstrapRule.server).toBe('local')
  })
})
