import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { parseShareLink, parseBatchLinks, normalizeNodeType } from '@/utils/protocol'
import type { NodeConfig, CheckMethod, CheckRecordContext } from '@/types'
import { useSettingsStore } from './settings'
import { useGameStore } from './games'
import { nodeApi, systemApi } from '@/api'
import {
  appendLatencyRecord,
  getGameLatencyStats,
  getRecentLatencyRecords,
  initLatencySessionStore
} from '@/utils/latency-session'

export const useNodeStore = defineStore('nodes', () => {
  const nodes = ref<NodeConfig[]>([])
  const nodeStats = reactive<Record<string, { latency: number; loss: number }>>({})
  const latencySessionReady = initLatencySessionStore().catch((e) => {
    console.error('Failed to init latency session store:', e)
  })

  const settingsStore = useSettingsStore()

  function normalizeNode(node: NodeConfig): NodeConfig {
    const normalizedType = normalizeNodeType(node.type)
    return {
      ...node,
      type: normalizedType || String(node.type || '').trim().toLowerCase()
    }
  }

  function resolveLatency(value: unknown, source: 'ping' | 'tcpPing'): number {
    if (typeof value === 'number') return value
    if (value && typeof value === 'object' && 'latency' in (value as Record<string, unknown>)) {
      const latency = (value as { latency?: unknown }).latency
      if (typeof latency === 'number') return latency
    }
    console.warn(`[NodeStore] Unexpected ${source} result payload:`, value)
    return -1
  }

  async function checkNode(node: NodeConfig, methodOverride?: CheckMethod, context?: CheckRecordContext) {
    if (!node.server) return

    const method = methodOverride || settingsStore.checkMethod
    let result = { latency: -1, loss: 0 }

    try {
      if (method === 'tcp') {
        if (window.system) {
          const response = await systemApi.tcpPing(node.server, node.server_port)
          const latency = resolveLatency(response, 'tcpPing')
          result = { latency, loss: latency === -1 ? 100 : 0 }
        } else {
          // Mock if not available
          result = await mockPing()
        }
      } else {
        // Ping
        if (window.system) {
          const response = await systemApi.ping(node.server)
          const latency = resolveLatency(response, 'ping')
          result = { latency, loss: latency === -1 ? 100 : 0 }
        } else {
          // Mock
          result = await mockPing()
        }
      }
    } catch (e) {
      console.error('Ping failed', e)
      result = { latency: -1, loss: 100 }
    }

    // Update stats
    const key = node.id || node.tag
    if (key) {
      nodeStats[key] = result
      if (context?.recordLatency) {
        void latencySessionReady
          .then(() => appendLatencyRecord({
            nodeKey: key,
            server: node.server,
            port: node.server_port,
            method,
            latency: result.latency,
            loss: result.loss,
            timestamp: Date.now(),
            gameId: context.gameId,
            accelerationSeconds: context.accelerationSeconds,
            sessionLossRate: context.sessionLossRate
          }))
          .catch((e) => {
            console.error('Failed to append latency record:', e)
          })
      }
    }
    return result
  }

  // Mock function for development if backend is not ready
  async function mockPing() {
    return new Promise<{ latency: number; loss: number }>((resolve) => {
      setTimeout(() => {
        const success = Math.random() > 0.1
        resolve({
          latency: success ? Math.floor(Math.random() * 200) + 20 : -1,
          loss: success ? 0 : 100
        })
      }, 500)
    })
  }

  async function checkAllNodes() {
    // Limit concurrency
    const chunks = []
    const chunkSize = 5
    for (let i = 0; i < nodes.value.length; i += chunkSize) {
      chunks.push(nodes.value.slice(i, i + chunkSize))
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(node => checkNode(node)))
    }
  }

  async function getNodeLatencyHistory(nodeKey: string, limit = 240) {
    await latencySessionReady
    return getRecentLatencyRecords(nodeKey, limit)
  }

  async function getGameLatencyStatsForSession(gameId: string) {
    await latencySessionReady
    return getGameLatencyStats(gameId)
  }

  async function loadNodes() {
    try {
      const loaded = await nodeApi.getAll()
      nodes.value = (loaded as NodeConfig[]).map(normalizeNode)
    } catch (e) {
      console.error('Failed to load nodes:', e)
    }
  }

  async function addNode(link: string) {
    const node = parseShareLink(link)
    if (node) {
      try {
        const normalized = normalizeNode(node)
        const saved = await nodeApi.save(normalized)
        nodes.value = (saved as NodeConfig[]).map(normalizeNode)
        return true
      } catch (e) {
        console.error('Failed to save node:', e)
        return false
      }
    }
    return false
  }

  async function saveNode(node: NodeConfig) {
    try {
      const normalized = normalizeNode(node)
      const saved = await nodeApi.save(normalized)
      nodes.value = (saved as NodeConfig[]).map(normalizeNode)
      return true
    } catch (e) {
      console.error('Failed to save node:', e)
      return false
    }
  }

  async function addNodes(content: string): Promise<number> {
    const newNodes = parseBatchLinks(content).map(normalizeNode)
    if (newNodes.length === 0) return 0

    try {
      const imported = await nodeApi.import(newNodes)
      nodes.value = (imported as NodeConfig[]).map(normalizeNode)
      // The import method on backend handles duplicates and returns all nodes
      // We can't easily count how many were added unless backend returns that info
      // But for now we just return parsed count
      return newNodes.length
    } catch (e) {
      console.error('Failed to import nodes:', e)
      return 0
    }
  }

  async function removeNode(id: string) {
    try {
      const removed = nodes.value.find((n) => n.id === id)
      const remain = await nodeApi.delete(id)
      nodes.value = (remain as NodeConfig[]).map(normalizeNode)

      // If the accelerating game is bound to the removed node, stop acceleration immediately.
      const removedKeys = new Set<string>([
        String(id || '').trim(),
        String(removed?.tag || '').trim()
      ].filter(Boolean))
      if (removedKeys.size === 0) return

      const gameStore = useGameStore()
      const accelerating = gameStore.getAcceleratingGame()
      if (!accelerating?.id) return

      const selectedNodeId = String(accelerating.nodeId || '').trim()
      if (!selectedNodeId || !removedKeys.has(selectedNodeId)) return

      const stillExists = nodes.value.some((n) => n.id === selectedNodeId || n.tag === selectedNodeId)
      if (stillExists) return

      await gameStore.stopGame(accelerating.id)
    } catch (e) {
      console.error('Failed to delete node:', e)
    }
  }

  async function updateNode(node: NodeConfig) {
    return saveNode(node)
  }

  // Initial load
  loadNodes()

  return {
    nodes,
    loadNodes,
    addNode,
    saveNode,
    addNodes,
    removeNode,
    updateNode,
    nodeStats,
    checkNode,
    checkAllNodes,
    getNodeLatencyHistory,
    getGameLatencyStatsForSession
  }
})
