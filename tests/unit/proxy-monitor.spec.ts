import { describe, expect, it, vi } from 'vitest'
import { findChainProxyChildren, ProxyMonitorService } from '../../electron/services/proxy-monitor'
import type { ProcessNode } from '../../electron/services/process'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

function makeProcessTree(): ProcessNode[] {
  return [
    {
      path: 'C:\\Games\\launcher.exe',
      name: 'launcher.exe',
      ppid: 4,
      pid: 100,
      children: [
        {
          path: 'C:\\Games\\game.exe',
          name: 'game.exe',
          ppid: 100,
          pid: 200,
          children: [
            {
              path: 'C:\\Games\\anticheat.exe',
              name: 'anticheat.exe',
              ppid: 200,
              pid: 201,
              children: []
            }
          ]
        }
      ]
    },
    {
      path: 'C:\\Tools\\unrelated.exe',
      name: 'unrelated.exe',
      ppid: 4,
      pid: 300,
      children: []
    }
  ]
}

describe('findChainProxyChildren', () => {
  it('collects descendants of monitored process recursively', () => {
    const monitored = new Set<string>(['launcher.exe'])
    const names = findChainProxyChildren(makeProcessTree(), monitored)

    expect(names).toEqual(expect.arrayContaining(['game.exe', 'anticheat.exe']))
    expect(names).not.toContain('unrelated.exe')
  })
})

describe('ProxyMonitorService chain proxy behavior', () => {
  it('updates singbox process names when child processes appear', async () => {
    const send = vi.fn()
    const win = {
      webContents: {
        send
      }
    } as any

    const processService = {
      getProcessTree: vi.fn(async () => makeProcessTree())
    } as any

    const singboxService = {
      updateProcessNames: vi.fn(async () => undefined)
    } as any

    const service = new ProxyMonitorService(win, processService, singboxService)
    service.startMonitoring('game-1', ['launcher.exe'])

    await (service as any).checkChainProxy()

    expect(singboxService.updateProcessNames).toHaveBeenCalledTimes(2)
    const latestArgs = singboxService.updateProcessNames.mock.calls.at(-1)?.[0] as string[]
    expect(latestArgs).toEqual(expect.arrayContaining(['launcher.exe', 'game.exe', 'anticheat.exe']))
    expect(send).toHaveBeenCalledWith('proxy-monitor:detected', expect.arrayContaining(['game.exe', 'anticheat.exe']))

    service.stopMonitoring()
  })
})

