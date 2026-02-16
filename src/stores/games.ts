import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { Game } from '@/types'
import { useNodeStore } from './nodes'
import { generateSingboxConfig } from '@/utils/singbox-config'

export type { Game }

export function isRoutingOnlyPresetGame(game: Pick<Game, 'name' | 'routingRules'> | null | undefined): boolean {
  if (!game) return false
  const name = String(game.name || '').toLowerCase()
  const rules = Array.isArray(game.routingRules) ? game.routingRules.map(r => String(r).toLowerCase()) : []

  if (rules.includes('bypass_cn')) return true
  if (name.includes('global') || name.includes('全局加速')) return true
  if (name.includes('bypass cn') || name.includes('绕过大陆')) return true
  return false
}

function normalizeProxyModeForPreset(game: Game): Game {
  if (!isRoutingOnlyPresetGame(game)) return game
  if (game.proxyMode === 'routing') return game
  return { ...game, proxyMode: 'routing' }
}

export const useGameStore = defineStore('games', () => {
  // 游戏特征库
  const gameLibrary = ref<Game[]>([])

  // 当前选中的游戏 (Dashboard 展示)
  const currentGameId = ref<string | null>(null)

  const currentGame = computed(() => 
    gameLibrary.value.find(g => g.id === currentGameId.value) || null
  )

  // 扫描到的运行中游戏
  const runningGames = ref<string[]>([])

  // 初始化加载
  async function init() {
    try {
      // @ts-ignore
      const games = await window.games.getAll()
      gameLibrary.value = games.map((g: Game) => normalizeProxyModeForPreset({
        ...g,
        status: 'idle',
        latency: 0
      }))
      // 默认选中第一个
      if (!currentGameId.value && gameLibrary.value.length > 0) {
        const firstGame = gameLibrary.value[0]
        if (firstGame) {
          currentGameId.value = firstGame.id
        }
      }
    } catch (e) {
      console.error('Failed to load games:', e)
    }
  }

  // 添加游戏
  async function addGame(game: Game) {
    game = normalizeProxyModeForPreset(game)
    // @ts-ignore
    const updatedGames = await window.games.save(toIpcGame(game))
    // 更新本地状态
    syncGames(updatedGames)
  }

  // 更新游戏
  async function updateGame(game: Game) {
    game = normalizeProxyModeForPreset(game)
    // 乐观更新：立即更新本地状态
    const index = gameLibrary.value.findIndex(g => g.id === game.id)
    if (index !== -1) {
      gameLibrary.value[index] = { ...gameLibrary.value[index], ...game }
    }

    try {
      // @ts-ignore
      const updatedGames = await window.games.save(toIpcGame(game))
      syncGames(updatedGames)
    } catch (e) {
      console.error('更新游戏失败：', e)
      // 如果失败，可能需要回滚（这里暂不实现复杂回滚，依赖 syncGames 下次同步）
    }
  }

  // 删除游戏
  async function removeGame(id: string) {
    // @ts-ignore
    const updatedGames = await window.games.delete(id)
    syncGames(updatedGames)
    if (currentGameId.value === id) {
      const firstGame = gameLibrary.value[0]
      currentGameId.value = (gameLibrary.value.length > 0 && firstGame) ? firstGame.id : null
    }
  }

  // 同步状态（保留运行状态）
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

  function setCurrentGame(id: string) {
    currentGameId.value = id
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.lastPlayed = Date.now()
      // 可选：更新 lastPlayed 到后端
      // @ts-ignore
      window.games.save(toIpcGame({ ...game, lastPlayed: Date.now() }))
    }
  }

  function setGameStatus(id: string, status: 'idle' | 'accelerating') {
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.status = status
    }
  }

  function updateLatency(id: string, ms: number) {
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.latency = ms
    }
  }

  // 根据扫描到的进程名匹配游戏
  function matchRunningGames(processNames: string[]) {
    const matchedIds: string[] = []
    processNames.forEach(pName => {
      const pNameLower = pName.toLowerCase()
      gameLibrary.value.forEach(game => {
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

  // 启动加速
  async function startGame(id: string) {
    const game = gameLibrary.value.find(g => g.id === id)
    if (!game) return

    const nodeStore = useNodeStore()
    const selectedNodeId = String(game.nodeId || '')
    const node = nodeStore.nodes.find(n => n.id === selectedNodeId || n.tag === selectedNodeId)
    
    if (!node) {
      const msg = 'Selected node not found. Please reselect a node and try again.'
      console.error(msg, { gameId: id, nodeId: selectedNodeId })
      throw new Error(msg)
    }

    try {
      const rawGame = toRaw(game) as Game
      const rawNode = toRaw(node) as any
      const config = String(generateSingboxConfig(rawGame, rawNode))
      // @ts-ignore
      await window.singbox.start(config)
      
      const procs = Array.isArray(rawGame.processName) ? rawGame.processName.map(p => String(p)) : [String(rawGame.processName)]
      // @ts-ignore
      await window.proxyMonitor.start(String(rawGame.id), procs)

      setGameStatus(id, 'accelerating')
    } catch (e) {
      console.error('启动加速失败：', e)
      throw e
    }
  }

  // 停止加速
  async function stopGame(id: string) {
    try {
      // @ts-ignore
      await window.singbox.stop()
      // @ts-ignore
      await window.proxyMonitor.stop()
      
      setGameStatus(id, 'idle')
    } catch (e) {
      console.error('停止加速失败：', e)
      throw e
    }
  }

  // 初始化调用
  init()

  return {
    gameLibrary,
    currentGameId,
    currentGame,
    runningGames,
    init,
    setCurrentGame,
    setGameStatus,
    updateLatency,
    matchRunningGames,
    addGame,
    updateGame,
    removeGame,
    startGame,
    stopGame
  }
})

function toIpcGame(game: Game): Game {
  const raw = toRaw(game) as any

  const processName = Array.isArray(raw.processName)
    ? raw.processName.map((p: any) => String(p))
    : String(raw.processName ?? '')

  const tags = Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t)) : undefined
  const routingRules = Array.isArray(raw.routingRules) ? raw.routingRules.map((r: any) => String(r)) : undefined

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    iconUrl: raw.iconUrl != null ? String(raw.iconUrl) : undefined,
    processName,
    category: String(raw.category ?? ''),
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
