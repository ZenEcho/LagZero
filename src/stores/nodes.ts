import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { parseShareLink, parseBatchLinks } from '@/utils/protocol'
import { normalizeNodeType } from '@shared/utils'
import type { NodeConfig, CheckMethod, CheckRecordContext } from '@/types'
import { useSettingsStore } from './settings'
import { useGameStore } from './games'
import { nodeApi, systemApi } from '@/api'
import { useLocalStorage } from '@vueuse/core'
import i18n from '@/i18n'
import { nodeKeyOf } from '@shared/utils'
import {
  appendLatencyRecord,
  getGameLatencyStats,
  getRecentLatencyRecords,
  initLatencySessionStore
} from '@/utils/latency-session'

/** 订阅更新计划类型 */
export type NodeSubscriptionSchedule = 'manual' | 'startup' | 'daily' | 'monthly'

/** 默认节点分组名称 */
export const DEFAULT_NODE_GROUP = 'default'

/** 节点导入结果原因 */
type NodeImportResultReason = 'added' | 'no-new-nodes' | 'no-valid-nodes' | 'import-failed'

/** 批量导入节点的结果 */
interface AddNodesResult {
  reason: NodeImportResultReason
  count: number
}

/** 节点排序方式 */
export type NodeSortType =
  | 'default-asc'
  | 'default-desc'
  | 'latency-asc'
  | 'latency-desc'
  | 'alphabetical-asc'
  | 'alphabetical-desc'

/** 旧版排序类型，用于迁移兼容 */
type LegacyNodeSortType = 'default' | 'latency' | 'alphabetical'

/** 订阅源配置 */
export interface NodeSubscription {
  id: string
  name: string
  url: string
  enabled: boolean
  schedule: NodeSubscriptionSchedule
  /** 上次拉取时间戳 */
  lastFetchedAt?: number
  /** 上次拉取状态 */
  lastFetchStatus?: 'ok' | 'failed'
  /** 上次拉取的附加信息/错误消息 */
  lastFetchMessage?: string
}

/**
 * 节点仓库：
 * - 管理节点列表的增删改查
 * - 管理节点延迟检测与统计
 * - 管理节点选中/分组/排序/过滤
 * - 管理订阅源的增删改查与自动刷新
 * - 与后端 API 同步节点数据
 */
export const useNodeStore = defineStore('nodes', () => {
  /** 全部节点列表（内存态）。 */
  const nodes = ref<NodeConfig[]>([])
  /** 每个节点的延迟/丢包统计（key 为 node.id 或 node.tag）。 */
  const nodeStats = reactive<Record<string, { latency: number; loss: number }>>({})
  /** 当前被勾选的节点 key 列表。 */
  const selectedNodeKeys = ref<string[]>([])
  /** 搜索关键词（持久化）。 */
  const searchQuery = useLocalStorage('nodes-search-query', '')
  /** 当前类型过滤器（持久化）。 */
  const activeTypeFilter = useLocalStorage('nodes-filter-type', 'all')
  /** 当前分组过滤器（持久化）。 */
  const activeGroupFilter = useLocalStorage('nodes-filter-group', 'all')
  /** 当前排序方式（持久化）。 */
  const activeSortType = useLocalStorage<NodeSortType | LegacyNodeSortType>('nodes-sort-type', 'default-asc')
  /** 手动设置的节点分组标签（持久化）。 */
  const nodeManualTags = useLocalStorage<Record<string, string>>('nodes-manual-tags', {})
  /** 由订阅自动分配的节点分组（持久化）。 */
  const nodeSubscriptionGroups = useLocalStorage<Record<string, string>>('nodes-subscription-groups', {})
  /** 旧版分组数据，仅用于迁移（持久化）。 */
  const legacyNodeGroups = useLocalStorage<Record<string, string>>('nodes-group-map', {})
  /** 订阅源列表（持久化）。 */
  const subscriptions = useLocalStorage<NodeSubscription[]>('nodes-subscriptions', [])
  /** 启动时的定时订阅是否已检查过。 */
  const startupScheduleChecked = ref(false)
  /** 正在删除中的订阅 ID 集合，用于防止并发删除。 */
  const removingSubscriptionIds = new Set<string>()
  /** 延迟会话 IndexedDB 初始化 Promise。 */
  const latencySessionReady = initLatencySessionStore().catch((e) => {
    console.error('初始化延迟会话存储失败:', e)
  })

  const settingsStore = useSettingsStore()

  /**
   * 将排序类型标准化为当前版本支持的枚举值。
   * 兼容旧版持久化的简写值（如 'default'、'latency'）。
   */
  function normalizeSortType(sortType: NodeSortType | LegacyNodeSortType | string): NodeSortType {
    switch (sortType) {
      case 'default':
      case 'default-asc':
        return 'default-asc'
      case 'default-desc':
        return 'default-desc'
      case 'latency':
      case 'latency-asc':
        return 'latency-asc'
      case 'latency-desc':
        return 'latency-desc'
      case 'alphabetical':
      case 'alphabetical-asc':
        return 'alphabetical-asc'
      case 'alphabetical-desc':
        return 'alphabetical-desc'
      default:
        return 'default-asc'
    }
  }

  // 迁移旧版持久化的排序值
  activeSortType.value = normalizeSortType(activeSortType.value)

  /** 标准化订阅更新计划类型，无效值默认为 'daily'。 */
  function normalizeSubscriptionSchedule(schedule: unknown): NodeSubscriptionSchedule {
    const normalized = String(schedule || '').trim()
    switch (normalized) {
      case 'manual':
      case 'startup':
      case 'daily':
      case 'monthly':
        return normalized as NodeSubscriptionSchedule
      default:
        return 'daily'
    }
  }

  /** 标准化节点配置：统一协议类型名称。 */
  function normalizeNode(node: NodeConfig): NodeConfig {
    const normalizedType = normalizeNodeType(node.type)
    return {
      ...node,
      type: normalizedType || String(node.type || '').trim().toLowerCase()
    }
  }

  /** 从检测结果中提取延迟值（兼容多种返回格式）。 */
  function resolveLatency(value: unknown, source: 'ping' | 'tcpPing'): number {
    if (typeof value === 'number') return value
    if (value && typeof value === 'object' && 'latency' in (value as Record<string, unknown>)) {
      const latency = (value as { latency?: unknown }).latency
      if (typeof latency === 'number') return latency
    }
    console.warn(`[NodeStore] 意外的 ${source} 结果载荷:`, value)
    return -1
  }



  /** 当前被勾选的节点对象列表（派生自 selectedNodeKeys）。 */
  const selectedNodes = computed(() => {
    const keySet = new Set(selectedNodeKeys.value)
    return nodes.value.filter((node) => keySet.has(nodeKeyOf(node)))
  })

  /** 所有节点中出现过的协议类型（去重、排序后）。 */
  const availableNodeTypes = computed(() => {
    const set = new Set<string>()
    for (const node of nodes.value) {
      const type = String(node.type || '').trim().toLowerCase()
      if (type) set.add(type)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })

  /** 所有节点中出现过的分组名称（去重、排序后，始终包含默认分组）。 */
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

  /** 经过搜索/类型/分组过滤和排序后的节点列表。 */
  const filteredNodes = computed(() => {
    const q = String(searchQuery.value || '').trim().toLowerCase()
    const typeFilter = String(activeTypeFilter.value || 'all')
    const groupFilter = String(activeGroupFilter.value || 'all')
    const sortType = normalizeSortType(activeSortType.value)

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

    if (sortType === 'alphabetical-asc' || sortType === 'alphabetical-desc') {
      return result.sort((a, b) => {
        const nameA = String(a.tag || a.server || '').toLowerCase()
        const nameB = String(b.tag || b.server || '').toLowerCase()
        const diff = nameA.localeCompare(nameB)
        return sortType === 'alphabetical-desc' ? -diff : diff
      })
    }

    if (sortType === 'latency-asc' || sortType === 'latency-desc') {
      return result.sort((a, b) => {
        const keyA = nodeKeyOf(a)
        const keyB = nodeKeyOf(b)
        const latA = nodeStats[keyA]?.latency ?? 999999
        const latB = nodeStats[keyB]?.latency ?? 999999
        // -1 usually means timeout or error, treat as high latency
        const valA = latA < 0 ? 999999 : latA
        const valB = latB < 0 ? 999999 : latB
        const diff = valA - valB
        return sortType === 'latency-desc' ? -diff : diff
      })
    }

    // Default (Creation Time / Insertion Order)
    // 'default-asc': insertion order (old -> new)
    // 'default-desc': reverse insertion order (new -> old)
    return sortType === 'default-desc' ? result.slice().reverse() : result
  })

  /** 判断节点是否处于选中状态。 */
  function isNodeSelected(node: NodeConfig): boolean {
    const key = nodeKeyOf(node)
    return !!key && selectedNodeKeys.value.includes(key)
  }

  /** 清理已失效的选中节点 key（节点被删除后调用）。 */
  function pruneSelectedNodeKeys() {
    const available = new Set(nodes.value.map(node => nodeKeyOf(node)).filter(Boolean))
    selectedNodeKeys.value = selectedNodeKeys.value.filter(key => available.has(key))
  }

  /** 设置节点的选中/取消选中状态。 */
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

  /** 切换节点选中状态。 */
  function toggleNodeSelected(node: NodeConfig) {
    setNodeSelected(node, !isNodeSelected(node))
  }

  /** 清空所有节点选中状态。 */
  function clearSelectedNodes() {
    selectedNodeKeys.value = []
  }

  /** 获取节点的订阅来源分组名称。 */
  function getNodeSubscriptionGroup(node: NodeConfig): string {
    const key = nodeKeyOf(node)
    if (!key) return ''
    return String(nodeSubscriptionGroups.value[key] || '').trim()
  }

  /** 获取节点的手动分组标签。 */
  function getNodeManualTag(node: NodeConfig): string {
    const key = nodeKeyOf(node)
    if (!key) return ''
    return String(nodeManualTags.value[key] || '').trim()
  }

  /** 获取节点的所有分组标签（订阅分组 + 手动标签，去重）。 */
  function getNodeGroupLabels(node: NodeConfig): string[] {
    const sub = getNodeSubscriptionGroup(node)
    const tag = getNodeManualTag(node)
    return Array.from(new Set([sub, tag].filter(Boolean)))
  }

  /** 获取节点的主分组名称（优先取第一个标签，无则返回默认分组）。 */
  function getNodeGroup(node: NodeConfig): string {
    const labels = getNodeGroupLabels(node)
    return labels[0] || DEFAULT_NODE_GROUP
  }

  /** 设置节点的手动分组；加速中的节点禁止修改。 */
  function setNodeGroup(node: NodeConfig, group: string) {
    const blockedReason = getNodeMutationBlockedReason(node)
    if (blockedReason) {
      throw new Error(blockedReason)
    }

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

  /** 批量设置已选中节点的分组。 */
  function setGroupForSelectedNodes(group: string) {
    const blockedNode = getBlockedSelectedNode(selectedNodes.value)
    if (blockedNode) {
      throw new Error(getNodeMutationBlockedReason(blockedNode))
    }

    const normalized = String(group || '').trim()
    for (const node of selectedNodes.value) {
      setNodeGroup(node, normalized)
    }
  }

  /**
   * 获取节点不可变更的原因。
   * 当某游戏正在使用该节点加速时，返回提示文本；否则返回空字符串。
   */
  function getNodeMutationBlockedReason(node: NodeConfig): string {
    const accelerating = useGameStore().getAcceleratingGame()
    const acceleratingNodeId = String(accelerating?.nodeId || '').trim()
    if (!accelerating?.id || !acceleratingNodeId) return ''

    const identifiers = new Set<string>([
      String(node.id || '').trim(),
      String(node.tag || '').trim(),
      String(nodeKeyOf(node) || '').trim()
    ].filter(Boolean))

    if (!identifiers.has(acceleratingNodeId)) return ''

    const nodeName = String(node.tag || node.server || '').trim() || i18n.global.t('nodes.unnamed_node')
    const gameName = String(accelerating.name || '').trim() || i18n.global.t('games.current_game')
    return i18n.global.t('nodes.mutation_blocked_accelerating', {
      name: nodeName,
      game: gameName
    })
  }

  /** 判断节点是否因加速中而被锁定、不可变更。 */
  function isNodeMutationBlocked(node: NodeConfig): boolean {
    return !!getNodeMutationBlockedReason(node)
  }

  /** 标准化节点 ID 列表：去空、去重、转字符串。 */
  function normalizeNodeIds(ids: string[]): string[] {
    return Array.from(new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ))
  }

  /** 根据 ID 查找节点。 */
  function findNodeById(id: string): NodeConfig | undefined {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return undefined
    return nodes.value.find((node) => String(node.id || '').trim() === normalizedId)
  }

  /** 在一组 ID 中找到第一个被锁定的节点；无则返回 null。 */
  function getBlockedNodeByIds(ids: string[]): NodeConfig | null {
    for (const id of normalizeNodeIds(ids)) {
      const node = findNodeById(id)
      if (node && isNodeMutationBlocked(node)) {
        return node
      }
    }
    return null
  }

  /** 在一组节点中找到第一个被锁定的节点；无则返回 null。 */
  function getBlockedSelectedNode(targets: NodeConfig[]): NodeConfig | null {
    for (const node of targets) {
      if (isNodeMutationBlocked(node)) {
        return node
      }
    }
    return null
  }

  /** 清理已失效的节点分组映射（节点被删除后调用）。 */
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

  /**
   * 生成节点签名字符串，用于订阅去重。
   * 基于协议类型、服务器、端口、认证等核心字段拼接。
   */
  function nodeSignatureOf(node: Partial<NodeConfig>): string {
    return [
      normalizeNodeType(String(node.type || '')),
      String(node.server || '').trim().toLowerCase(),
      String(node.server_port || '').trim(),
      String(node.server_ports || '').trim(),
      String(node.uuid || '').trim(),
      String(node.password || '').trim(),
      String(node.auth || '').trim(),
      String(node.method || '').trim(),
      String(node.obfs || '').trim(),
      String(node.obfs_password || '').trim(),
      String(node.version || '').trim(),
      String(node.username || '').trim()
    ].join('|')
  }

  /** 根据导入内容的签名匹配已有节点，为其分配订阅分组。 */
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

  /** 清理订阅列表：去重、标准化字段。 */
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
        schedule: normalizeSubscriptionSchedule(row.schedule),
        lastFetchedAt: row.lastFetchedAt,
        lastFetchStatus: row.lastFetchStatus,
        lastFetchMessage: row.lastFetchMessage
      })
    }
    subscriptions.value = next
  }

  /** 生成唯一的订阅 ID。 */
  function makeSubscriptionId() {
    return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** 校验订阅 URL 是否为合法的 HTTP/HTTPS 地址。 */
  function isValidSubscriptionUrl(raw: string): boolean {
    try {
      const url = new URL(raw)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  /** 新增订阅源。 */
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
      schedule: normalizeSubscriptionSchedule(payload.schedule)
    }
    subscriptions.value = [item, ...subscriptions.value]
    sanitizeSubscriptions()
    return true
  }

  /** 新增或更新订阅源（按 URL 去重：已存在则更新，否则新建）。 */
  function upsertSubscription(payload: {
    name: string
    url: string
    schedule: NodeSubscriptionSchedule
    enabled?: boolean
  }): { ok: boolean; id?: string; created?: boolean } {
    const name = String(payload.name || '').trim()
    const url = String(payload.url || '').trim()
    if (!name || !url || !isValidSubscriptionUrl(url)) return { ok: false }

    const existing = subscriptions.value.find((row) => String(row.url || '').trim() === url)
    if (existing) {
      updateSubscription(existing.id, {
        name,
        url,
        enabled: payload.enabled !== false,
        schedule: normalizeSubscriptionSchedule(payload.schedule)
      })
      return { ok: true, id: existing.id, created: false }
    }

    const item: NodeSubscription = {
      id: makeSubscriptionId(),
      name,
      url,
      enabled: payload.enabled !== false,
      schedule: normalizeSubscriptionSchedule(payload.schedule)
    }
    subscriptions.value = [item, ...subscriptions.value]
    sanitizeSubscriptions()
    return { ok: true, id: item.id, created: true }
  }

  /** 删除订阅源；可选同时删除其关联的所有节点。 */
  async function removeSubscription(id: string, options?: { deleteNodes?: boolean }): Promise<boolean> {
    const normalizedId = String(id || '').trim()
    if (!normalizedId || removingSubscriptionIds.has(normalizedId)) return false

    const target = subscriptions.value.find((row) => row.id === normalizedId)
    if (!target) return false

    removingSubscriptionIds.add(normalizedId)
    try {
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

      subscriptions.value = subscriptions.value.filter((row) => row.id !== normalizedId)
      if (target?.name) {
        const name = String(target.name).trim()
        const nextMap: Record<string, string> = {}
        for (const [key, group] of Object.entries(nodeSubscriptionGroups.value || {})) {
          if (group !== name) nextMap[key] = group
        }
        nodeSubscriptionGroups.value = nextMap
      }
      return true
    } finally {
      removingSubscriptionIds.delete(normalizedId)
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
    if (sub.schedule === 'manual') return false
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
    if (window.system) {
      const response = await systemApi.fetchUrl(url, 20000)
      if (!response.ok) {
        if (response.status > 0) {
          throw new Error(`HTTP ${response.status}`)
        }
        throw new Error(response.error || 'fetch-failed')
      }
      return response.body
    }

    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    })
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
      const imported = await addNodesDetailed(content, { deduplicate: true })
      applyGroupFromContent(content, sub.name)
      const isOk = imported.reason === 'added' || imported.reason === 'no-new-nodes'
      updateSubscription(id, {
        lastFetchedAt: Date.now(),
        lastFetchStatus: isOk ? 'ok' : 'failed',
        lastFetchMessage: imported.reason === 'added' ? '' : imported.reason
      })
      return {
        ok: isOk,
        count: imported.count,
        message: imported.reason === 'added' ? undefined : imported.reason
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
      console.error('Ping 失败', e)
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
            console.error('追加延迟记录失败:', e)
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
      console.error('加载节点失败:', e)
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
        console.error('保存节点失败:', e)
        return false
      }
    }
    return false
  }

  async function saveNode(node: NodeConfig) {
    const normalized = normalizeNode(node)
    const existing = normalized.id ? findNodeById(normalized.id) : undefined
    const blockedReason = existing ? getNodeMutationBlockedReason(existing) : ''
    if (blockedReason) {
      throw new Error(blockedReason)
    }

    try {
      const saved = await nodeApi.save(normalized)
      nodes.value = (saved as NodeConfig[]).map(normalizeNode)
      pruneSelectedNodeKeys()
      pruneNodeGroups()
      return true
    } catch (e) {
      console.error('保存节点失败:', e)
      throw e
    }
  }

  async function addNodes(content: string): Promise<number> {
    const result = await addNodesDetailed(content)
    return result.count
  }

  async function addNodesDetailed(
    content: string,
    options?: { deduplicate?: boolean }
  ): Promise<AddNodesResult> {
    const parsedNodes = parseBatchLinks(content).map(normalizeNode)
    if (parsedNodes.length === 0) {
      return { reason: 'no-valid-nodes', count: 0 }
    }

    let newNodes = parsedNodes

    // 仅在订阅刷新等场景下启用去重，手动导入允许重复节点
    if (options?.deduplicate) {
      const existingSignatures = new Set(nodes.value.map(nodeSignatureOf))
      const seenInBatch = new Set<string>()
      newNodes = parsedNodes.filter((node) => {
        const signature = nodeSignatureOf(node)
        if (!signature || existingSignatures.has(signature) || seenInBatch.has(signature)) {
          return false
        }
        seenInBatch.add(signature)
        return true
      })
      if (newNodes.length === 0) {
        return { reason: 'no-new-nodes', count: 0 }
      }
    }

    try {
      const imported = await nodeApi.import(newNodes)
      nodes.value = (imported as NodeConfig[]).map(normalizeNode)
      pruneSelectedNodeKeys()
      pruneNodeGroups()
      return { reason: 'added', count: newNodes.length }
    } catch (e) {
      console.error('导入节点失败:', e)
      return { reason: 'import-failed', count: 0 }
    }
  }

  async function removeNode(id: string) {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return false

    const removed = findNodeById(normalizedId)
    if (!removed) return false

    const blockedReason = getNodeMutationBlockedReason(removed)
    if (blockedReason) {
      throw new Error(blockedReason)
    }

    try {
      await nodeApi.delete(normalizedId)

      // Update local state
      nodes.value = nodes.value.filter((n) => String(n.id || '').trim() !== normalizedId)
      pruneSelectedNodeKeys()
      pruneNodeGroups()
      return true
    } catch (e) {
      console.error('删除节点失败:', e)
      throw e
    }
  }

  async function removeNodes(ids: string[]) {
    const normalizedIds = normalizeNodeIds(ids)
    if (!normalizedIds.length) return false

    const blockedNode = getBlockedNodeByIds(normalizedIds)
    if (blockedNode) {
      throw new Error(getNodeMutationBlockedReason(blockedNode))
    }

    // Pre-validate first to avoid partially deleting a batch, then remove sequentially.
    // In future this could be optimized to a batch API call if backend supports it.
    for (const id of normalizedIds) {
      await removeNode(id)
    }

    clearSelectedNodes()
    return true
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
    getNodeMutationBlockedReason,
    isNodeMutationBlocked,
    addSubscription,
    upsertSubscription,
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
