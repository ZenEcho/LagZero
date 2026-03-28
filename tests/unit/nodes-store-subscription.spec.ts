import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  nodeApi: {
    getAll: vi.fn(async () => []),
    save: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    import: vi.fn(async () => [])
  },
  gameApi: {
    getAll: vi.fn(async () => []),
    save: vi.fn(async () => []),
    delete: vi.fn(async () => []),
    deleteMany: vi.fn(async () => [])
  },
  systemApi: {
    fetchUrl: vi.fn(),
    ping: vi.fn(),
    tcpPing: vi.fn(),
    findAvailablePort: vi.fn(),
    setSystemProxy: vi.fn(),
    clearSystemProxy: vi.fn()
  },
  singboxApi: {
    restart: vi.fn(),
    stop: vi.fn()
  },
  proxyMonitorApi: {
    start: vi.fn(),
    stop: vi.fn()
  },
  latencySession: {
    initLatencySessionStore: vi.fn(async () => undefined),
    appendLatencyRecord: vi.fn(async () => undefined),
    getGameLatencyStats: vi.fn(async () => ({ total: 0, lost: 0 })),
    getRecentLatencyRecords: vi.fn(async () => [])
  }
}))

vi.mock('@/api', () => ({
  nodeApi: mocks.nodeApi,
  gameApi: mocks.gameApi,
  systemApi: mocks.systemApi,
  singboxApi: mocks.singboxApi,
  proxyMonitorApi: mocks.proxyMonitorApi
}))

vi.mock('@/utils/latency-session', () => ({
  initLatencySessionStore: mocks.latencySession.initLatencySessionStore,
  appendLatencyRecord: mocks.latencySession.appendLatencyRecord,
  getGameLatencyStats: mocks.latencySession.getGameLatencyStats,
  getRecentLatencyRecords: mocks.latencySession.getRecentLatencyRecords
}))

import { useNodeStore } from '@/stores/nodes'
import { useGameStore } from '@/stores/games'

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useNodeStore subscription removal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    mocks.nodeApi.getAll.mockResolvedValue([])
    mocks.nodeApi.delete.mockResolvedValue(undefined)
    mocks.gameApi.getAll.mockResolvedValue([])
  })

  it('prevents duplicate subscription removals while deleting subscription nodes', async () => {
    const store = useNodeStore()
    await flushPromises()

    store.subscriptions = [{
      id: 'sub-1',
      name: 'Alpha',
      url: 'https://example.com/sub',
      enabled: true,
      schedule: 'daily'
    }]
    store.nodes = [{
      id: 'node-1',
      type: 'shadowsocks',
      tag: 'Alpha Node',
      server: '1.1.1.1',
      server_port: 443
    }]
    store.nodeSubscriptionGroups = {
      'node-1': 'Alpha'
    }

    const results = await Promise.all([
      store.removeSubscription('sub-1', { deleteNodes: true }),
      store.removeSubscription('sub-1', { deleteNodes: true })
    ])

    expect(results).toEqual([true, false])
    expect(mocks.nodeApi.delete).toHaveBeenCalledTimes(1)
    expect(store.subscriptions).toEqual([])
    expect(store.nodes).toEqual([])
    expect(store.nodeSubscriptionGroups).toEqual({})
  })

  it('blocks deleting a node that is currently used by an accelerating game', async () => {
    const store = useNodeStore()
    const gameStore = useGameStore()
    await flushPromises()

    store.nodes = [{
      id: 'node-1',
      type: 'shadowsocks',
      tag: 'Alpha Node',
      server: '1.1.1.1',
      server_port: 443
    }]
    gameStore.gameLibrary = [{
      id: 'game-1',
      name: 'Game One',
      processName: 'game.exe',
      category: 'action',
      nodeId: 'node-1',
      status: 'accelerating',
      latency: 35
    }]

    await expect(store.removeNode('node-1')).rejects.toThrow('正在被游戏')

    expect(mocks.nodeApi.delete).not.toHaveBeenCalled()
    expect(store.nodes).toHaveLength(1)
  })

  it('blocks editing a node that is currently used by an accelerating game', async () => {
    const store = useNodeStore()
    const gameStore = useGameStore()
    await flushPromises()

    store.nodes = [{
      id: 'node-1',
      type: 'shadowsocks',
      tag: 'Alpha Node',
      server: '1.1.1.1',
      server_port: 443
    }]
    gameStore.gameLibrary = [{
      id: 'game-1',
      name: 'Game One',
      processName: 'game.exe',
      category: 'action',
      nodeId: 'node-1',
      status: 'accelerating',
      latency: 35
    }]

    await expect(store.saveNode({
      id: 'node-1',
      type: 'shadowsocks',
      tag: 'Alpha Node Updated',
      server: '1.1.1.1',
      server_port: 443
    })).rejects.toThrow('不可修改或删除')

    expect(mocks.nodeApi.save).not.toHaveBeenCalled()
    expect(store.nodes[0]?.tag).toBe('Alpha Node')
  })

  it('aborts batch deletion before removing any node when one selected node is accelerating', async () => {
    const store = useNodeStore()
    const gameStore = useGameStore()
    await flushPromises()

    store.nodes = [
      {
        id: 'node-1',
        type: 'shadowsocks',
        tag: 'Alpha Node',
        server: '1.1.1.1',
        server_port: 443
      },
      {
        id: 'node-2',
        type: 'trojan',
        tag: 'Beta Node',
        server: '2.2.2.2',
        server_port: 8443
      }
    ]
    gameStore.gameLibrary = [{
      id: 'game-1',
      name: 'Game One',
      processName: 'game.exe',
      category: 'action',
      nodeId: 'node-2',
      status: 'accelerating',
      latency: 35
    }]

    await expect(store.removeNodes(['node-1', 'node-2'])).rejects.toThrow('正在被游戏')

    expect(mocks.nodeApi.delete).not.toHaveBeenCalled()
    expect(store.nodes).toHaveLength(2)
  })
})
