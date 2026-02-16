import { describe, it, expect } from 'vitest'
import { generateSingboxConfig } from '../../src/utils/singbox-config'
import type { Game } from '../../src/types'
import type { NodeConfig } from '../../src/utils/protocol'

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
    
    expect(config.route.final).toBe('proxy')

    expect(config.dns.final).toBe('google')

    const tunInbound = config.inbounds.find((i: any) => i.tag === 'tun-in')
    expect(tunInbound).toBeDefined()
    expect(tunInbound.inet4_address).toBeDefined()
  })

  it('should include node outbound', () => {
    const config = JSON.parse(generateSingboxConfig(mockGame, mockNode))
    const nodeOut = config.outbounds.find((o: any) => o.tag === 'node-out')
    expect(nodeOut).toBeDefined()
    expect(nodeOut.type).toBe('vmess')
    expect(nodeOut.server).toBe('example.com')
  })
})
