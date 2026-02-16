import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { parseShareLink, parseBatchLinks, normalizeNodeType } from '@/utils/protocol'
import type { NodeConfig } from '@/utils/protocol'
import { useSettingsStore } from './settings'

type CheckMethod = 'ping' | 'tcp' | 'http'

export const useNodeStore = defineStore('nodes', () => {
  const nodes = ref<NodeConfig[]>([])
  const nodeStats = reactive<Record<string, { latency: number; loss: number }>>({})

  const settingsStore = useSettingsStore()

  function normalizeNode(node: NodeConfig): NodeConfig {
    const normalizedType = normalizeNodeType(node.type)
    return {
      ...node,
      type: normalizedType || String(node.type || '').trim().toLowerCase()
    }
  }

  async function checkNode(node: NodeConfig, methodOverride?: CheckMethod) {
    if (!node.server) return

    const method = methodOverride || settingsStore.checkMethod
    let result = { latency: -1, loss: 0 }

    try {
      if (method === 'tcp') {
        // @ts-ignore
        if (window.system?.tcpPing) {
          // @ts-ignore
          result = await window.system.tcpPing(node.server, node.server_port)
        } else {
          // Mock if not available
          result = await mockPing()
        }
      } else {
        // Ping
        // @ts-ignore
        if (window.system?.ping) {
          // @ts-ignore
          result = await window.system.ping(node.server)
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

  async function loadNodes() {
    try {
      // @ts-ignore
      const loaded = await window.nodes.getAll()
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
        // @ts-ignore
        const saved = await window.nodes.save(normalized)
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
      // @ts-ignore
      const saved = await window.nodes.save(normalized)
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
      // @ts-ignore
      const imported = await window.nodes.import(newNodes)
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
      // @ts-ignore
      const remain = await window.nodes.delete(id)
      nodes.value = (remain as NodeConfig[]).map(normalizeNode)
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
    checkAllNodes
  }
})
