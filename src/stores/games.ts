import { defineStore } from 'pinia'
import { ref, computed, toRaw, reactive } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { Game } from '@/types'
import { useNodeStore } from './nodes'
import { generateSingboxConfig } from '@/utils/singbox-config'
import { useSettingsStore } from './settings'

export type { Game }

export function isRoutingOnlyPresetGame(game: Pick<Game, 'name' | 'routingRules'> | null | undefined): boolean {
  if (!game) return false
  const name = String(game.name || '').toLowerCase()
  const rules = Array.isArray(game.routingRules) ? game.routingRules.map(r => String(r).toLowerCase()) : []

  if (rules.includes('bypass_cn')) return true
  if (name.includes('global') || name.includes('加速全部游戏')) return true
  if (name.includes('bypass cn') || name.includes('加速海外游戏')) return true
  return false
}

function normalizeProxyModeForPreset(game: Game): Game {
  if (!isRoutingOnlyPresetGame(game)) return game
  if (game.proxyMode === 'routing') return game
  return { ...game, proxyMode: 'routing' }
}

export const useGameStore = defineStore('games', () => {
  // All games in local library
  const gameLibrary = ref<Game[]>([])
  // Current selected game ID (shared with dashboard)
  const currentGameId = useLocalStorage<string | null>('games-current-id', null)

  const currentGame = computed(() =>
    gameLibrary.value.find(g => g.id === currentGameId.value) || null
  )

  // Running game IDs matched by process names
  const runningGames = ref<string[]>([])
  const accelerationStartedAt = reactive<Record<string, number>>({})

  async function init() {
    try {
      // @ts-ignore
      const games = await window.games.getAll()
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

  async function addGame(game: Game) {
    game = normalizeProxyModeForPreset(game)
    // @ts-ignore
    const updatedGames = await window.games.save(toIpcGame(game))
    syncGames(updatedGames)
  }

  async function updateGame(game: Game) {
    game = normalizeProxyModeForPreset(game)
    // Optimistic local update
    const index = gameLibrary.value.findIndex(g => g.id === game.id)
    if (index !== -1) {
      gameLibrary.value[index] = { ...gameLibrary.value[index], ...game }
    }

    try {
      // @ts-ignore
      const updatedGames = await window.games.save(toIpcGame(game))
      syncGames(updatedGames)
    } catch (e) {
      console.error('Failed to update game:', e)
    }
  }

  async function removeGame(id: string) {
    // @ts-ignore
    const updatedGames = await window.games.delete(id)
    syncGames(updatedGames)
    if (currentGameId.value === id) {
      const firstGame = gameLibrary.value[0]
      currentGameId.value = (gameLibrary.value.length > 0 && firstGame && firstGame.id) ? firstGame.id : null
    }
  }

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
      // @ts-ignore
      window.games.save(toIpcGame({ ...game, lastPlayed: Date.now() }))
    }
  }

  function setGameStatus(id: string, status: 'idle' | 'accelerating') {
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.status = status
    }
    if (status === 'accelerating') {
      if (!accelerationStartedAt[id]) {
        accelerationStartedAt[id] = Date.now()
      }
    } else {
      delete accelerationStartedAt[id]
    }
  }

  function getAccelerationStartedAt(id: string) {
    return accelerationStartedAt[id] || 0
  }

  function updateLatency(id: string, ms: number) {
    const game = gameLibrary.value.find(g => g.id === id)
    if (game) {
      game.latency = ms
    }
  }

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

  async function startGame(id: string) {
    const game = gameLibrary.value.find(g => g.id === id)
    if (!game) return

    const nodeStore = useNodeStore()
    const settingsStore = useSettingsStore()
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
      const config = String(generateSingboxConfig(rawGame, rawNode, {
        mode: settingsStore.dnsMode,
        primary: settingsStore.dnsPrimary,
        secondary: settingsStore.dnsSecondary
      }))
      // @ts-ignore
      await window.singbox.start(config)

      const procs = Array.isArray(rawGame.processName) ? rawGame.processName.map(p => String(p)) : [String(rawGame.processName)]
      // @ts-ignore
      await window.proxyMonitor.start(String(rawGame.id), procs)

      setGameStatus(id, 'accelerating')
    } catch (e) {
      console.error('Failed to start game acceleration:', e)
      throw e
    }
  }

  async function stopGame(id: string) {
    try {
      // @ts-ignore
      await window.singbox.stop()
      // @ts-ignore
      await window.proxyMonitor.stop()

      setGameStatus(id, 'idle')
    } catch (e) {
      console.error('Failed to stop game acceleration:', e)
      throw e
    }
  }

  init()

  return {
    gameLibrary,
    currentGameId,
    currentGame,
    runningGames,
    init,
    setCurrentGame,
    setGameStatus,
    getAccelerationStartedAt,
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
