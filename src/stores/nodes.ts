import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { parseShareLink, parseBatchLinks, normalizeNodeType } from '@/utils/protocol'
import type { NodeConfig, CheckMethod, CheckRecordContext } from '@/types'
import { useSettingsStore } from './settings'
import { useGameStore } from './games'
import { nodeApi, systemApi } from '@/api'
import { useLocalStorage } from '@vueuse/core'
import {
  appendLatencyRecord,
  getGameLatencyStats,
  getRecentLatencyRecords,
  initLatencySessionStore
} from '@/utils/latency-session'

export type NodeSubscriptionSchedule = 'startup' | 'daily' | 'monthly'
export const DEFAULT_NODE_GROUP = 'default'

export interface NodeSubscription {
  id: string
  name: string
  url: string
  enabled: boolean
  schedule: NodeSubscriptionSchedule
  lastFetchedAt?: number
  lastFetchStatus?: 'ok' | 'failed'
  lastFetchMessage?: string
}

export const useNodeStore = defineStore('nodes', () => {
  const nodes = ref<NodeConfig[]>([])
  const nodeStats = reactive<Record<string, { latency: number; loss: number }>>({})
  const selectedNodeKeys = ref<string[]>([])
  const searchQuery = useLocalStorage('nodes-search-query', '')
  const activeTypeFilter = useLocalStorage('nodes-filter-type', 'all')
  const activeGroupFilter = useLocalStorage('nodes-filter-group', 'all')
  const activeSortType = useLocalStorage<'default' | 'latency' | 'alphabetical'>('nodes-sort-type', 'default')
  const nodeManualTags = useLocalStorage<Record<string, string>>('nodes-manual-tags', {})
  const nodeSubscriptionGroups = useLocalStorage<Record<string, string>>('nodes-subscription-groups', {})
  const legacyNodeGroups = useLocalStorage<Record<string, string>>('nodes-group-map', {})
  const subscriptions = useLocalStorage<NodeSubscription[]>('nodes-subscriptions', [])
  const startupScheduleChecked = ref(false)
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

  function nodeKeyOf(node: NodeConfig): string {
    return String(node.id || node.tag || '').trim()
  }

  const selectedNodes = computed(() => {
    const keySet = new Set(selectedNodeKeys.value)
    return nodes.value.filter((node) => keySet.has(nodeKeyOf(node)))
  })

  const availableNodeTypes = computed(() => {
    const set = new Set<string>()
    for (const node of nodes.value) {
      const type = String(node.type || '').trim().toLowerCase()
      if (type) set.add(type)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })

  const availableGroups = computed(() => {
    const set = new Set<string>()
    for (const node of nodes.value) {
      const labels = getNodeGroupLabels(node)
      for (const label of labels) {
        if (label) set.add(label)
      }
    }
    set.add(DEFAULT_NODE_GROUP)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })

  const filteredNodes = computed(() => {
    const q = String(searchQuery.value || '').trim().toLowerCase()
    const typeFilter = String(activeTypeFilter.value || 'all')
    const groupFilter = String(activeGroupFilter.value || 'all')
    const sortType = activeSortType.value

    const result = nodes.value.filter((node) => {
      if (typeFilter !== 'all' && normalizeNodeType(node.type) !== typeFilter) return false
      const labels = getNodeGroupLabels(node)
      if (groupFilter !== 'all') {
        if (groupFilter === DEFAULT_NODE_GROUP) {
          if (labels.length !== 0) return false
        } else if (!labels.includes(groupFilter)) {
          return false
        }
      }
      if (!q) return true
      const haystack = [
        node.tag,
        node.server,
        String(node.server_port || ''),
        node.type,
        ...labels
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })

    if (sortType === 'alphabetical') {
      return result.sort((a, b) => {
        const nameA = String(a.tag || a.server || '').toLowerCase()
        const nameB = String(b.tag || b.server || '').toLowerCase()
        return nameA.localeCompare(nameB)
      })
    }

    if (sortType === 'latency') {
      return result.sort((a, b) => {
        const keyA = nodeKeyOf(a)
        const keyB = nodeKeyOf(b)
        const latA = nodeStats[keyA]?.latency ?? 999999
        const latB = nodeStats[keyB]?.latency ?? 999999
        // -1 usually means timeout or error, treat as high latency
        const valA = latA < 0 ? 999999 : latA
        const valB = latB < 0 ? 999999 : latB
        return valA - valB
      })
    }

    // Default (Creation Time / Insertion Order)
    // Assuming nodes.value is already in insertion order
    // If 'default' usually means newest first or oldest first?
    // "Creation time" usually implies we want to see when it was added.
    // Let's keep it as is (insertion order). 
    // If user wants reverse insertion order, I might need another option. 
    // But usually "Creation Time" in UI means "As added".
    return result
  })

  function isNodeSelected(node: NodeConfig): boolean {
    const key = nodeKeyOf(node)
    return !!key && selectedNodeKeys.value.includes(key)
  }

  function pruneSelectedNodeKeys() {
    const available = new Set(nodes.value.map(node => nodeKeyOf(node)).filter(Boolean))
    selectedNodeKeys.value = selectedNodeKeys.value.filter(key => available.has(key))
  }

  function setNodeSelected(node: NodeConfig, selected: boolean) {
    const key = nodeKeyOf(node)
    if (!key) return
    if (selected) {
      if (!selectedNodeKeys.value.includes(key)) {
        selectedNodeKeys.value = [...selectedNodeKeys.value, key]
      }
      return
    }
    selectedNodeKeys.value = selectedNodeKeys.value.filter(item => item !== key)
  }

  function toggleNodeSelected(node: NodeConfig) {
    setNodeSelected(node, !isNodeSelected(node))
  }

  function clearSelectedNodes() {
    selectedNodeKeys.value = []
  }

  function getNodeSubscriptionGroup(node: NodeConfig): string {
    const key = nodeKeyOf(node)
    if (!key) return ''
    return String(nodeSubscriptionGroups.value[key] || '').trim()
  }

  function getNodeManualTag(node: NodeConfig): string {
    const key = nodeKeyOf(node)
    if (!key) return ''
    return String(nodeManualTags.value[key] || '').trim()
  }

  function getNodeGroupLabels(node: NodeConfig): string[] {
    const sub = getNodeSubscriptionGroup(node)
    const tag = getNodeManualTag(node)
    return Array.from(new Set([sub, tag].filter(Boolean)))
  }

  function getNodeGroup(node: NodeConfig): string {
    const labels = getNodeGroupLabels(node)
    return labels[0] || DEFAULT_NODE_GROUP
  }

  function setNodeGroup(node: NodeConfig, group: string) {
    const key = nodeKeyOf(node)
    if (!key) return
    const next = { ...nodeManualTags.value }
    const normalized = String(group || '').trim()
    if (normalized && normalized !== DEFAULT_NODE_GROUP) {
      next[key] = normalized
    } else {
      delete next[key]
    }
    nodeManualTags.value = next
  }

  function setGroupForSelectedNodes(group: string) {
    const normalized = String(group || '').trim()
    for (const node of selectedNodes.value) {
      setNodeGroup(node, normalized)
    }
  }

  function pruneNodeGroups() {
    const available = new Set(nodes.value.map(node => nodeKeyOf(node)).filter(Boolean))
    const nextManual: Record<string, string> = {}
    for (const [key, group] of Object.entries(nodeManualTags.value || {})) {
      const normalized = String(group || '').trim()
      if (available.has(key) && normalized && normalized !== DEFAULT_NODE_GROUP) {
        nextManual[key] = normalized
      }
    }
    nodeManualTags.value = nextManual

    const nextSub: Record<string, string> = {}
    for (const [key, group] of Object.entries(nodeSubscriptionGroups.value || {})) {
      const normalized = String(group || '').trim()
      if (available.has(key) && normalized) {
        nextSub[key] = normalized
      }
    }
    nodeSubscriptionGroups.value = nextSub
  }

  function nodeSignatureOf(node: Partial<NodeConfig>): string {
    return [
      normalizeNodeType(String(node.type || '')),
      String(node.server || '').trim().toLowerCase(),
      String(node.server_port || '').trim(),
      String(node.uuid || '').trim(),
      String(node.password || '').trim(),
      String(node.method || '').trim(),
      String(node.username || '').trim()
    ].join('|')
  }

  function applyGroupFromContent(content: string, group: string) {
    const normalizedGroup = String(group || '').trim() || DEFAULT_NODE_GROUP
    const parsed = parseBatchLinks(content).map(normalizeNode)
    if (!parsed.length) return
    const signatures = new Set(parsed.map(nodeSignatureOf))
    const next = { ...nodeSubscriptionGroups.value }
    for (const node of nodes.value) {
      if (signatures.has(nodeSignatureOf(node))) {
        const key = nodeKeyOf(node)
        if (!key) continue
        if (normalizedGroup === DEFAULT_NODE_GROUP) {
          delete next[key]
        } else {
          next[key] = normalizedGroup
        }
      }
    }
    nodeSubscriptionGroups.value = next
  }

  function sanitizeSubscriptions() {
    const dedup = new Set<string>()
    const next: NodeSubscription[] = []
    for (const row of subscriptions.value || []) {
      const id = String(row.id || '').trim()
      const url = String(row.url || '').trim()
      if (!id || !url || dedup.has(id)) continue
      dedup.add(id)
      next.push({
        id,
        name: String(row.name || '').trim() || 'Subscription',
        url,
        enabled: row.enabled !== false,
        schedule: row.schedule || 'daily',
        lastFetchedAt: row.lastFetchedAt,
        lastFetchStatus: row.lastFetchStatus,
        lastFetchMessage: row.lastFetchMessage
      })
    }
    subscriptions.value = next
  }

  function makeSubscriptionId() {
    return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  function isValidSubscriptionUrl(raw: string): boolean {
    try {
      const url = new URL(raw)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  function addSubscription(payload: {
    name: string
    url: string
    schedule: NodeSubscriptionSchedule
    enabled?: boolean
  }) {
    const name = String(payload.name || '').trim()
    const url = String(payload.url || '').trim()
    if (!name || !url || !isValidSubscriptionUrl(url)) return false
    const item: NodeSubscription = {
      id: makeSubscriptionId(),
      name,
      url,
      enabled: payload.enabled !== false,
      schedule: payload.schedule || 'daily'
    }
    subscriptions.value = [item, ...subscriptions.value]
    sanitizeSubscriptions()
    return true
  }

  async function removeSubscription(id: string, options?: { deleteNodes?: boolean }) {
    const target = subscriptions.value.find((row) => row.id === id)
    const targetName = String(target?.name || '').trim()

    if (options?.deleteNodes && targetName) {
      const ids = nodes.value
        .filter((node) => getNodeSubscriptionGroup(node) === targetName)
        .map((node) => node.id)
        .filter(Boolean) as string[]
      if (ids.length > 0) {
        await removeNodes(ids)
      }
    }

    subscriptions.value = subscriptions.value.filter((row) => row.id !== id)
    if (target?.name) {
      const name = String(target.name).trim()
      const nextMap: Record<string, string> = {}
      for (const [key, group] of Object.entries(nodeSubscriptionGroups.value || {})) {
        if (group !== name) nextMap[key] = group
      }
      nodeSubscriptionGroups.value = nextMap
    }
  }

  function updateSubscription(id: string, patch: Partial<Omit<NodeSubscription, 'id'>>) {
    let oldName = ''
    let newName = ''
    subscriptions.value = subscriptions.value.map((row) => {
      if (row.id !== id) return row
      oldName = String(row.name || '').trim()
      const next = {
        ...row,
        ...patch
      }
      newName = String(next.name || '').trim()
      return next
    })
    // Keep subscription grouping consistent when subscription name changes.
    if (oldName && newName && oldName !== newName) {
      const nextMap: Record<string, string> = {}
      for (const [key, group] of Object.entries(nodeSubscriptionGroups.value || {})) {
        nextMap[key] = group === oldName ? newName : group
      }
      nodeSubscriptionGroups.value = nextMap
    }
    sanitizeSubscriptions()
  }

  function shouldRunSubscription(
    sub: NodeSubscription,
    reason: 'startup' | 'manual',
    now = Date.now()
  ): boolean {
    if (!sub.enabled) return false
    if (reason === 'manual') return true
    if (sub.schedule === 'startup') return true
    if (!sub.lastFetchedAt) return true
    if (sub.schedule === 'daily') {
      return now - sub.lastFetchedAt >= 24 * 60 * 60 * 1000
    }
    if (sub.schedule === 'monthly') {
      const last = new Date(sub.lastFetchedAt)
      const current = new Date(now)
      return last.getFullYear() !== current.getFullYear() || last.getMonth() !== current.getMonth()
    }
    return false
  }

  async function fetchSubscriptionContent(url: string): Promise<string> {
    const response = await fetch(url, { method: 'GET', cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.text()
  }

  async function refreshSubscription(id: string): Promise<{ ok: boolean; count: number; message?: string }> {
    const sub = subscriptions.value.find((row) => row.id === id)
    if (!sub) return { ok: false, count: 0, message: 'subscription-not-found' }

    try {
      const content = await fetchSubscriptionContent(sub.url)
      const count = await addNodes(content)
      applyGroupFromContent(content, sub.name)
      updateSubscription(id, {
        lastFetchedAt: Date.now(),
        lastFetchStatus: count > 0 ? 'ok' : 'failed',
        lastFetchMessage: count > 0 ? '' : 'no-valid-nodes'
      })
      return {
        ok: count > 0,
        count,
        message: count > 0 ? undefined : 'no-valid-nodes'
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'fetch-failed'
      updateSubscription(id, {
        lastFetchedAt: Date.now(),
        lastFetchStatus: 'failed',
        lastFetchMessage: message
      })
      return { ok: false, count: 0, message }
    }
  }

  async function runScheduledSubscriptions(reason: 'startup' | 'manual' = 'startup') {
    if (reason === 'startup' && startupScheduleChecked.value) {
      return []
    }
    if (reason === 'startup') {
      startupScheduleChecked.value = true
    }
    const runs: Array<{ id: string; ok: boolean; count: number; message?: string }> = []
    const now = Date.now()
    const due = subscriptions.value.filter((sub) => shouldRunSubscription(sub, reason, now))
    for (const sub of due) {
      const result = await refreshSubscription(sub.id)
      runs.push({ id: sub.id, ...result })
    }
    return runs
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
      if (Object.keys(nodeManualTags.value || {}).length === 0 && Object.keys(legacyNodeGroups.value || {}).length > 0) {
        nodeManualTags.value = { ...legacyNodeGroups.value }
        legacyNodeGroups.value = {}
      }
      pruneSelectedNodeKeys()
      pruneNodeGroups()
      sanitizeSubscriptions()
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
        pruneSelectedNodeKeys()
        pruneNodeGroups()
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
      pruneSelectedNodeKeys()
      pruneNodeGroups()
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
      pruneSelectedNodeKeys()
      pruneNodeGroups()
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
      if (!removed) return

      await nodeApi.delete(id)
      
      // Update local state
      nodes.value = nodes.value.filter(n => n.id !== id)
      pruneSelectedNodeKeys()
      pruneNodeGroups()

      // If the accelerating game is bound to the removed node, stop acceleration immediately.
      const removedKeys = new Set<string>([
        String(id || '').trim(),
        String(removed?.tag || '').trim()
      ].filter(Boolean))
      if (removedKeys.size === 0) return

      const gameStore = useGameStore()
      const accelerating = gameStore.getAcceleratingGame()
      if (!accelerating?.id || !accelerating.nodeId) return

      const selectedNodeId = String(accelerating.nodeId || '').trim()
      if (!selectedNodeId || !removedKeys.has(selectedNodeId)) return
      
      // Double check if it still exists (in case multiple nodes had same ID/tag which shouldn't happen but safe to check)
      const stillExists = nodes.value.some((n) => n.id === selectedNodeId || n.tag === selectedNodeId)
      if (stillExists) return

      await gameStore.stopGame(accelerating.id)
    } catch (e) {
      console.error('Failed to delete node:', e)
    }
  }

  async function removeNodes(ids: string[]) {
    if (!ids.length) return
    
    // Process one by one for now to ensure proper cleanup and game stopping logic
    // In future this could be optimized to a batch API call if backend supports it
    for (const id of ids) {
      await removeNode(id)
    }
    
    clearSelectedNodes()
  }

  async function updateNode(node: NodeConfig) {
    return saveNode(node)
  }

  // Initial load
  loadNodes()

  return {
    nodes,
    searchQuery,
    activeTypeFilter,
    activeGroupFilter,
    activeSortType,
    filteredNodes,
    availableNodeTypes,
    availableGroups,
    nodeManualTags,
    nodeSubscriptionGroups,
    subscriptions,
    selectedNodeKeys,
    selectedNodes,
    isNodeSelected,
    setNodeSelected,
    toggleNodeSelected,
    clearSelectedNodes,
    getNodeGroup,
    getNodeGroupLabels,
    getNodeManualTag,
    getNodeSubscriptionGroup,
    setNodeGroup,
    setGroupForSelectedNodes,
    addSubscription,
    removeSubscription,
    updateSubscription,
    refreshSubscription,
    runScheduledSubscriptions,
    loadNodes,
    addNode,
    saveNode,
    addNodes,
    removeNode,
    removeNodes,
    updateNode,
    nodeStats,
    checkNode,
    checkAllNodes,
    getNodeLatencyHistory,
    getGameLatencyStatsForSession
  }
})
