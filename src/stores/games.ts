import { defineStore } from 'pinia'
import { ref, computed, toRaw, reactive } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { Game, SessionNetworkTuningOptions, NetworkProfile } from '@/types'
import { useNodeStore } from './nodes'
import { generateSingboxConfig } from '@/utils/singbox-config'
import { useSettingsStore } from './settings'
import { useLocalProxyStore } from './local-proxy'
import { gameApi, singboxApi, proxyMonitorApi, systemApi } from '@/api'

export type { Game }

/**
 * 判断预设游戏是否属于“仅路由模式（routing）”。
 *
 * 命中任一条件即返回 `true`：
 * - `routingRules` 包含 `bypass_cn`
 * - 名称包含 `global` 或“加速全部游戏”
 * - 名称包含 `bypass cn` 或“加速海外游戏”
 */
export function isRoutingOnlyPresetGame(game: Pick<Game, 'name' | 'routingRules'> | null | undefined): boolean {
  if (!game) return false
  const name = String(game.name || '').toLowerCase()
  const rules = Array.isArray(game.routingRules) ? game.routingRules.map(r => String(r).toLowerCase()) : []

  if (rules.includes('bypass_cn')) return true
  if (name.includes('global') || name.includes('加速全部游戏')) return true
  if (name.includes('bypass cn') || name.includes('加速海外游戏')) return true
  return false
}

/**
 * 对预设游戏进行代理模式归一化：
 * 命中“仅路由模式”时，强制 `proxyMode = 'routing'`。
 */
function normalizeProxyModeForPreset(game: Game): Game {
  if (!isRoutingOnlyPresetGame(game)) return game
  if (game.proxyMode === 'routing') return game
  return { ...game, proxyMode: 'routing' }
}

/**
 * 游戏仓库：
 * - 管理游戏库与当前选中项
 * - 管理运行态（加速状态、开始时间、延迟、运行进程匹配）
 * - 与后端 API 同步游戏数据
 * - 负责启动/停止 sing-box 与链式代理监控
 */
export const useGameStore = defineStore('games', () => {
  /** 本地游戏库（内存态）。 */
  const gameLibrary = ref<Game[]>([])
  /** 当前选中的游戏 ID（持久化到 localStorage）。 */
  const currentGameId = useLocalStorage<string | null>('games-current-id', null)

  /** 当前选中的游戏对象；未命中时返回 `null`。 */
  const currentGame = computed(() =>
    gameLibrary.value.find(g => g.id === currentGameId.value) || null
  )

  /** 当前进程匹配到的“正在运行”游戏 ID 列表。 */
  const runningGames = ref<string[]>([])
  /** 每个游戏进入加速状态的时间戳（毫秒）。 */
  const accelerationStartedAt = reactive<Record<string, number>>({})
  /** 当前加速操作状态，避免重复点击导致并发启动/停止。 */
  const operationState = ref<'idle' | 'starting' | 'stopping'>('idle')
  /** 当前正在执行操作的游戏 ID。 */
  const operationGameId = ref<string | null>(null)
  /** 开启系统代理前的系统代理快照，用于停止和回滚恢复。 */
  const systemProxySnapshot = ref<any | null>(null)
  /** 当前会话中，按游戏维度覆盖的网络优化参数。 */
  const gameSessionNetworkTuning = reactive<Record<string, SessionNetworkTuningOptions>>({})

  function toPlainSnapshot(snapshot: any) {
    if (snapshot == null) return null
    try {
      return JSON.parse(JSON.stringify(snapshot))
    } catch {
      return null
    }
  }

  function cloneGlobalSessionNetworkTuning(): SessionNetworkTuningOptions {
    const settingsStore = useSettingsStore()
    const g = settingsStore.sessionNetworkTuning
    return {
      enabled: !!g.enabled,
      profile: g.profile === 'aggressive' ? 'aggressive' : 'stable',
      udpMode: g.udpMode,
      tunMtu: g.tunMtu,
      tunStack: g.tunStack,
      strictRoute: !!g.strictRoute,
      vlessPacketEncodingOverride: g.vlessPacketEncodingOverride,
      highLossHintOnly: g.highLossHintOnly !== false
    }
  }

  function getEffectiveSessionNetworkTuning(gameId?: string): SessionNetworkTuningOptions {
    const id = String(gameId || '').trim()
    if (id && gameSessionNetworkTuning[id]) return gameSessionNetworkTuning[id]!
    return cloneGlobalSessionNetworkTuning()
  }

  function isUsingGlobalSessionNetworkTuning(gameId: string): boolean {
    return !gameSessionNetworkTuning[String(gameId || '').trim()]
  }

  function ensureGameSessionNetworkTuning(gameId: string): SessionNetworkTuningOptions {
    const id = String(gameId || '').trim()
    if (!id) return cloneGlobalSessionNetworkTuning()
    if (!gameSessionNetworkTuning[id]) {
      gameSessionNetworkTuning[id] = cloneGlobalSessionNetworkTuning()
    }
    return gameSessionNetworkTuning[id]!
  }

  function resetGameSessionNetworkTuning(gameId: string): void {
    const id = String(gameId || '').trim()
    if (!id) return
    gameSessionNetworkTuning[id] = cloneGlobalSessionNetworkTuning()
  }

  function applyGameSessionNetworkProfilePreset(
    gameId: string,
    profile: NetworkProfile,
    options?: { isCurrentNodeVless?: boolean }
  ): void {
    const tuning = ensureGameSessionNetworkTuning(gameId)
    const isCurrentNodeVless = !!options?.isCurrentNodeVless
    if (profile === 'aggressive') {
      Object.assign(tuning, {
        enabled: true,
        profile: 'aggressive',
        udpMode: 'prefer_udp',
        tunMtu: 1360,
        tunStack: 'mixed',
        strictRoute: true,
        vlessPacketEncodingOverride: isCurrentNodeVless ? 'xudp' : 'off'
      })
      return
    }
    Object.assign(tuning, {
      enabled: true,
      profile: 'stable',
      udpMode: 'auto',
      tunMtu: 1280,
      tunStack: 'system',
      strictRoute: false,
      vlessPacketEncodingOverride: 'off'
    })
  }

  /** 获取当前加速中的游戏（可排除某个 ID）。 */
  function getAcceleratingGame(excludeId?: string): Game | null {
    return gameLibrary.value.find(g => g.status === 'accelerating' && (!excludeId || g.id !== excludeId)) || null
  }

  /** 将所有游戏状态重置为空闲，并清理加速开始时间。 */
  function resetAllAccelerationStatus() {
    gameLibrary.value.forEach(g => {
      if (g.status === 'accelerating') g.status = 'idle'
      if (g.id) delete accelerationStartedAt[g.id]
    })
  }

  /**
   * 初始化游戏库：
   * - 从后端加载数据
   * - 补齐运行态默认字段
   * - 归一化预设游戏代理模式
   * - 修正当前选中 ID
   */
  async function init() {
    try {
      const games = await gameApi.getAll()
      gameLibrary.value = games.map((g: Game) => normalizeProxyModeForPreset({
        ...g,
        status: 'idle',
        latency: 0
      }))
      const hasCurrentGame = !!currentGameId.value && gameLibrary.value.some(g => g.id === currentGameId.value)
      if (!hasCurrentGame && gameLibrary.value.length > 0) {
        const firstGame = gameLibrary.value[0]
        if (firstGame && firstGame.id) {
          currentGameId.value = firstGame.id
        }
      } else if (!hasCurrentGame) {
        currentGameId.value = null
      }
    } catch (e) {
      console.error('Failed to load games:', e)
    }
  }

  /** 新增游戏并同步本地状态。 */
  async function addGame(game: Game) {
    game = normalizeProxyModeForPreset(game)
    const updatedGames = await gameApi.save(toIpcGame(game))
    syncGames(updatedGames)
  }

  /** 更新游戏（本地乐观更新后再与后端结果对齐）。 */
  async function updateGame(game: Game) {
    game = normalizeProxyModeForPreset(game)
    // Optimistic local update
    const index = gameLibrary.value.findIndex(g => g.id === game.id)
    if (index !== -1) {
      gameLibrary.value[index] = { ...gameLibrary.value[index], ...game }
    }

    try {
      const updatedGames = await gameApi.save(toIpcGame(game))
      syncGames(updatedGames)
    } catch (e) {
      console.error('Failed to update game:', e)
    }
  }

  /** 删除游戏并维护当前选中项回退逻辑。 */
  async function removeGame(id: string) {
    const updatedGames = await gameApi.delete(id)
    syncGames(updatedGames)
    if (currentGameId.value === id) {
      const firstGame = gameLibrary.value[0]
      currentGameId.value = (gameLibrary.value.length > 0 && firstGame && firstGame.id) ? firstGame.id : null
    }
  }

  /**
   * 用远端列表同步本地游戏库，同时保留本地运行态：
   * - `status` / `latency` 尽量复用本地已有值
   * - `nodeId` 远端优先，缺失时回退本地值
   */
  function syncGames(remoteGames: Game[]) {
    gameLibrary.value = remoteGames.map((rg: Game) => {
      const existing = gameLibrary.value.find(lg => lg.id === rg.id)
      return normalizeProxyModeForPreset({
        ...rg,
        status: existing?.status || 'idle',
        latency: existing?.latency || 0,
        nodeId: rg.nodeId || existing?.nodeId
      })
    })
  }

  /**
   * 切换当前游戏。
   * 若已有其他游戏处于加速中，则拒绝切换并返回 `false`。
   */
  function setCurrentGame(id: string) {
    const runningOther = getAcceleratingGame(id)
    if (runningOther) return false

    currentGameId.value = id
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.lastPlayed = Date.now()
      gameApi.save(toIpcGame({ ...game, lastPlayed: Date.now() }))
    }
    return true
  }

  /**
   * 设置游戏加速状态，并保证同一时刻仅一个游戏处于 `accelerating`。
   */
  function setGameStatus(id: string, status: 'idle' | 'accelerating') {
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.status = status
    }
    if (status === 'accelerating') {
      gameLibrary.value.forEach(g => {
        if (g.id !== id && g.status === 'accelerating') {
          g.status = 'idle'
          if (g.id) delete accelerationStartedAt[g.id]
        }
      })
      if (!accelerationStartedAt[id]) {
        accelerationStartedAt[id] = Date.now()
      }
    } else {
      delete accelerationStartedAt[id]
    }
  }

  /** 获取游戏进入加速状态的时间戳；无记录时返回 `0`。 */
  function getAccelerationStartedAt(id: string) {
    return accelerationStartedAt[id] || 0
  }

  /** 更新游戏延迟（毫秒）。 */
  function updateLatency(id: string, ms: number) {
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.latency = ms
    }
  }

  /** 通过进程名匹配正在运行的游戏，返回命中 ID 列表。 */
  function matchRunningGames(processNames: string[]) {
    const matchedIds: string[] = []
    processNames.forEach(pName => {
      const pNameLower = pName.toLowerCase()
      gameLibrary.value.forEach(game => {
        if (!game.id) return
        const targets = Array.isArray(game.processName) ? game.processName : [game.processName]
        if (targets.some(t => t.toLowerCase() === pNameLower)) {
          if (!matchedIds.includes(game.id)) {
            matchedIds.push(game.id)
          }
        }
      })
    })
    runningGames.value = matchedIds
    return matchedIds
  }

  /**
   * 启动游戏加速：
   * - 校验互斥状态与节点配置
   * - 生成并重启 sing-box 配置
   * - 按模式启动/停止进程链式代理监控
   */
  async function startGame(id: string) {
    if (operationState.value !== 'idle') {
      throw new Error(operationState.value === 'starting' ? '正在启动中，请稍候。' : '正在暂停中，请稍候。')
    }

    const game = gameLibrary.value.find(g => g.id === id)
    if (!game) return
    if (game.status === 'accelerating') return

    const runningOther = getAcceleratingGame(id)
    if (runningOther) {
      throw new Error(`Another game is already accelerating: ${runningOther.name}`)
    }

    const nodeStore = useNodeStore()
    const settingsStore = useSettingsStore()
    const localProxyStore = useLocalProxyStore()
    const selectedNodeId = String(game.nodeId || '')
    const node = nodeStore.nodes.find(n => n.id === selectedNodeId || n.tag === selectedNodeId)

    if (!node) {
      const msg = 'Selected node not found. Please reselect a node and try again.'
      console.error(msg, { gameId: id, nodeId: selectedNodeId })
      throw new Error(msg)
    }

    const localProxyNode = settingsStore.localProxyEnabled
      ? nodeStore.nodes.find(n => String(n.id || n.tag) === localProxyStore.activeNodeKey) || undefined
      : undefined

    operationState.value = 'starting'
    operationGameId.value = id
    const useSystemProxy = settingsStore.accelNetworkMode === 'system_proxy'
    const previousSystemProxySnapshot = systemProxySnapshot.value
    let systemProxyPortToUse = settingsStore.systemProxyPort
    try {
      if (useSystemProxy) {
        const reservedPorts = new Set<number>()
        if (settingsStore.localProxyEnabled) {
          reservedPorts.add(settingsStore.localProxyPort)
          reservedPorts.add(settingsStore.localProxyPort + 1)
        }

        let candidate = Math.max(1024, Math.floor(Number(settingsStore.systemProxyPort || 0)))
        if (reservedPorts.has(candidate)) candidate += 2
        let available = await systemApi.findAvailablePort(candidate, 1)
        while (reservedPorts.has(available)) {
          available = await systemApi.findAvailablePort(available + 1, 1)
        }
        if (available !== settingsStore.systemProxyPort) {
          console.info(`[SystemProxy] system proxy port changed ${settingsStore.systemProxyPort} -> ${available}`)
          settingsStore.systemProxyPort = available
        }
        systemProxyPortToUse = available
      }

      const rawGame = toRaw(game) as Game
      const rawNode = toRaw(node) as any
      const config = String(generateSingboxConfig(rawGame, rawNode, {
        mode: settingsStore.dnsMode,
        primary: settingsStore.dnsPrimary,
        secondary: settingsStore.dnsSecondary,
        tunInterfaceName: settingsStore.tunInterfaceName,
        accelNetworkMode: settingsStore.accelNetworkMode,
        sessionTuning: { ...getEffectiveSessionNetworkTuning(rawGame.id) },
        localProxyNode,
        localProxy: {
          enabled: settingsStore.localProxyEnabled,
          port: settingsStore.localProxyPort
        },
        systemProxy: {
          enabled: useSystemProxy,
          port: systemProxyPortToUse
        }
      }))
      await singboxApi.restart(config)

      if (useSystemProxy) {
        const proxyResult = await systemApi.setSystemProxy(systemProxyPortToUse, '<local>')
        if (!proxyResult?.ok) {
          await singboxApi.stop()
          const rollbackResult = await systemApi.clearSystemProxy(proxyResult?.snapshot || previousSystemProxySnapshot || undefined)
          if (!rollbackResult?.ok) {
            console.warn('[SystemProxy] rollback failed after setSystemProxy error:', rollbackResult?.message)
          }
          systemProxySnapshot.value = previousSystemProxySnapshot || null
          throw new Error(String(proxyResult?.message || 'Failed to set system proxy'))
        }
        systemProxySnapshot.value = toPlainSnapshot(proxyResult.snapshot) || toPlainSnapshot(previousSystemProxySnapshot)
      } else {
        const clearResult = await systemApi.clearSystemProxy(systemProxySnapshot.value || undefined)
        if (!clearResult?.ok && !String(clearResult?.message || '').startsWith('Unsupported platform')) {
          console.warn('[SystemProxy] clear before tun mode failed:', clearResult?.message)
        }
        systemProxySnapshot.value = null
      }

      const procs = Array.isArray(rawGame.processName) ? rawGame.processName.map(p => String(p)) : [String(rawGame.processName)]
      const shouldEnableChainProxy = rawGame.proxyMode === 'process' && rawGame.chainProxy !== false
      if (shouldEnableChainProxy) await proxyMonitorApi.start(String(rawGame.id), procs)
      else await proxyMonitorApi.stop()

      setGameStatus(id, 'accelerating')
    } catch (e) {
      if (useSystemProxy) {
        try {
          await singboxApi.stop()
        } catch { }
        try {
          await systemApi.clearSystemProxy(previousSystemProxySnapshot || undefined)
        } catch { }
        systemProxySnapshot.value = toPlainSnapshot(previousSystemProxySnapshot)
      }
      console.error('Failed to start game acceleration:', e)
      throw e
    } finally {
      operationState.value = 'idle'
      operationGameId.value = null
    }
  }

  /**
   * 停止游戏加速：
   * - 停止进程监控
   * - 恢复本地代理或停止 sing-box
   * - 重置全部加速状态
   */
  async function stopGame(_id: string) {
    if (operationState.value !== 'idle') {
      throw new Error(operationState.value === 'starting' ? '正在启动中，请稍候。' : '正在暂停中，请稍候。')
    }

    operationState.value = 'stopping'
    operationGameId.value = _id
    try {
      try {
        const clearResult = await systemApi.clearSystemProxy(systemProxySnapshot.value || undefined)
        if (!clearResult?.ok && !String(clearResult?.message || '').startsWith('Unsupported platform')) {
          console.warn('[SystemProxy] clear on stop failed:', clearResult?.message)
        }
      } finally {
        systemProxySnapshot.value = null
      }
      await proxyMonitorApi.stop()
      const settingsStore = useSettingsStore()
      const localProxyStore = useLocalProxyStore()

      if (settingsStore.localProxyEnabled) {
        await localProxyStore.startLocalProxy('settings')
      } else {
        await singboxApi.stop()
      }

      resetAllAccelerationStatus()
    } catch (e) {
      console.error('Failed to stop game acceleration:', e)
      throw e
    } finally {
      operationState.value = 'idle'
      operationGameId.value = null
    }
  }

  async function applySessionNetworkTuningChange(): Promise<boolean> {
    const active = getAcceleratingGame()
    if (!active?.id) return false
    if (operationState.value !== 'idle') return false

    await stopGame(active.id)
    await startGame(active.id)
    return true
  }

  /** 仓库创建后立即执行一次初始化。 */
  init()

  return {
    gameLibrary,
    currentGameId,
    currentGame,
    runningGames,
    operationState,
    operationGameId,
    init,
    setCurrentGame,
    setGameStatus,
    getAcceleratingGame,
    resetAllAccelerationStatus,
    getAccelerationStartedAt,
    updateLatency,
    matchRunningGames,
    addGame,
    updateGame,
    removeGame,
    startGame,
    stopGame,
    applySessionNetworkTuningChange,
    getEffectiveSessionNetworkTuning,
    isUsingGlobalSessionNetworkTuning,
    ensureGameSessionNetworkTuning,
    resetGameSessionNetworkTuning,
    applyGameSessionNetworkProfilePreset
  }
})

/**
 * 将响应式 `Game` 对象转换为适合 IPC 持久化的纯对象。
 *
 * 处理要点：
 * - 去除响应式包装（`toRaw`）
 * - 统一字段类型（字符串/布尔/数组）
 * - 提供安全默认值，避免后端落库时出现脏数据
 */
function toIpcGame(game: Game): Game {
  const raw = toRaw(game) as any

  const processName = Array.isArray(raw.processName)
    ? raw.processName.map((p: any) => String(p))
    : String(raw.processName ?? '')

  const tags = Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t)) : undefined
  const categories = Array.isArray(raw.categories) ? raw.categories.map((c: any) => String(c).trim()).filter(Boolean) : undefined
  const routingRules = Array.isArray(raw.routingRules) ? raw.routingRules.map((r: any) => String(r)) : undefined
  const primaryCategory = categories?.[0] || String(raw.category ?? '')

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    iconUrl: raw.iconUrl != null ? String(raw.iconUrl) : undefined,
    processName,
    category: primaryCategory,
    categories,
    tags,
    profileId: raw.profileId != null ? String(raw.profileId) : undefined,
    lastPlayed: typeof raw.lastPlayed === 'number' ? raw.lastPlayed : undefined,
    status: raw.status === 'accelerating' ? 'accelerating' : 'idle',
    latency: typeof raw.latency === 'number' ? raw.latency : 0,
    nodeId: raw.nodeId != null ? String(raw.nodeId) : undefined,
    proxyMode: raw.proxyMode === 'routing' ? 'routing' : 'process',
    routingRules,
    chainProxy: !!raw.chainProxy
  }
}
