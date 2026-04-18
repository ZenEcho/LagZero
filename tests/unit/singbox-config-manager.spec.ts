import { describe, expect, it, vi } from 'vitest'
import { generateSingboxConfig } from '../../src/utils/singbox-config'
import { syncProcessScopedRules } from '../../electron/services/singbox/config'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '')
  }
}))

describe('syncProcessScopedRules', () => {
  it('updates every process-scoped route and dns rule for chain-proxy children', () => {
    const config = JSON.parse(generateSingboxConfig(
      {
        id: 'game-1',
        name: 'Bypass CN',
        processName: ['launcher.exe'],
        category: 'system',
        proxyMode: 'routing',
        routingRules: ['bypass_cn'],
        chainProxy: true
      },
      {
        id: 'node-1',
        tag: 'Test Node',
        type: 'socks',
        server: '127.0.0.1',
        server_port: 1080
      } as any,
      {
        mode: 'secure'
      }
    ))

    const changed = syncProcessScopedRules(config, ['launcher.exe', 'game.exe', 'anticheat.exe'])

    expect(changed).toBe(true)

    const expected = expect.arrayContaining([
      'launcher.exe',
      'game.exe',
      'anticheat.exe'
    ])

    const routeRules = (config.route?.rules || []).filter((rule: any) => Array.isArray(rule?.process_name))
    expect(routeRules.length).toBeGreaterThan(1)
    routeRules.forEach((rule: any) => {
      expect(rule.process_name).toEqual(expected)
    })

    const dnsRules = (config.dns?.rules || []).filter((rule: any) => Array.isArray(rule?.process_name))
    expect(dnsRules.length).toBeGreaterThan(0)
    dnsRules.forEach((rule: any) => {
      expect(rule.process_name).toEqual(expected)
    })
  })
})
