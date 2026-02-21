import { describe, expect, it, vi } from 'vitest'
import {
  parsePowerShellProcessJson,
  parseWmicProcessCsv,
  type ProcessNode
} from '../../electron/services/process'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

function findNodeByPid(nodes: ProcessNode[], pid: number): ProcessNode | null {
  const stack = [...nodes]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    if (node.pid === pid) return node
    if (node.children?.length) {
      stack.push(...node.children)
    }
  }
  return null
}

describe('process tree parser', () => {
  it('parses PowerShell/CIM json array output', () => {
    const json = JSON.stringify([
      {
        ProcessId: 100,
        ParentProcessId: 4,
        Name: 'launcher.exe',
        ExecutablePath: 'C:\\Games\\Launcher\\launcher.exe'
      },
      {
        ProcessId: 200,
        ParentProcessId: 100,
        Name: 'game.exe',
        ExecutablePath: 'C:\\Games\\Launcher\\game.exe'
      },
      {
        ProcessId: 300,
        ParentProcessId: 0,
        Name: 'other.exe',
        ExecutablePath: 'C:\\Tools\\other.exe'
      }
    ])

    const tree = parsePowerShellProcessJson(json)
    const rootPids = tree.map((node) => node.pid).sort((a, b) => a - b)
    expect(rootPids).toEqual([100, 300])

    const launcher = findNodeByPid(tree, 100)
    expect(launcher).not.toBeNull()
    expect(launcher!.children.map((child) => child.pid)).toEqual([200])
  })

  it('parses PowerShell/CIM json single-object output', () => {
    const json = JSON.stringify({
      ProcessId: 501,
      ParentProcessId: 1,
      Name: 'single.exe',
      ExecutablePath: 'C:\\single.exe'
    })

    const tree = parsePowerShellProcessJson(json)
    expect(tree.length).toBe(1)
    expect(tree[0]?.pid).toBe(501)
    expect(tree[0]?.name).toBe('single.exe')
  })

  it('parses WMIC csv output with comma in executable path', () => {
    const csv = [
      'Node,ExecutablePath,Name,ParentProcessId,ProcessId',
      'DESKTOP,C:\\Games\\A,B\\launcher.exe,launcher.exe,4,100',
      'DESKTOP,C:\\Games\\A,B\\game.exe,game.exe,100,200'
    ].join('\r\n')

    const tree = parseWmicProcessCsv(csv)
    const launcher = findNodeByPid(tree, 100)
    const game = findNodeByPid(tree, 200)

    expect(launcher).not.toBeNull()
    expect(game).not.toBeNull()
    expect(launcher?.path).toBe('C:\\Games\\A,B\\launcher.exe')
    expect(game?.path).toBe('C:\\Games\\A,B\\game.exe')
    expect(launcher?.children.some((child) => child.pid === 200)).toBe(true)
  })
})

