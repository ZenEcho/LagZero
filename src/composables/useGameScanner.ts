import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { systemApi } from '@/api'
import { useGameStore } from '@/stores/games'
import type { Game, LocalScanGame } from '@/types'

export function useGameScanner() {
  const isScanning = ref(false)
  const message = useMessage()
  const gameStore = useGameStore()
  // 临时使用 useCategoryStore 来获取默认分类，或者硬编码 'other'
  // 为了解耦，这里简单硬编码，或者要求外部传入 fallbackCategoryId
  const fallbackCategoryId = 'other' 

  async function scanGames() {
    isScanning.value = true
    try {
      const localGames = await systemApi.scanLocalGames()
      const added = await autoAddGamesFromLibraryScan(localGames)
      const processes = await systemApi.scanProcesses()
      const matched = gameStore.matchRunningGames(processes)

      if (added > 0) {
        message.success(`扫描完成：新增 ${added} 个游戏，当前运行匹配 ${matched.length} 个。`)
      } else if (matched.length > 0) {
        message.info(`扫描完成：未新增游戏，当前运行匹配 ${matched.length} 个。`)
      } else {
        message.info('扫描完成：未发现可新增的本地游戏。')
      }
    } catch (error) {
      console.error('Failed to scan games:', error)
      message.error('扫描失败，请重试。')
    } finally {
      setTimeout(() => { isScanning.value = false }, 500)
    }
  }

  async function autoAddGamesFromLibraryScan(localGames: LocalScanGame[]) {
    const existingGameKeys = new Set(
      gameStore.gameLibrary.flatMap((game: Game) => {
        const targets = Array.isArray(game.processName) ? game.processName : [game.processName]
        return targets.map(name => `${String(game.name).toLowerCase()}|${String(name).toLowerCase()}`)
      })
    )

    const seen = new Set<string>()
    const candidates = localGames
      .filter(g => !!g.name && !!g.processName)
      .filter(g => {
        const key = `${g.name.toLowerCase()}|${g.processName.toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return !existingGameKeys.has(key)
      })

    let added = 0

    for (const item of candidates) {
      await gameStore.addGame({
        name: item.name,
        processName: [item.processName],
        category: fallbackCategoryId,
        status: 'idle',
        latency: 0,
        proxyMode: 'process',
        chainProxy: true
      })
      added += 1
    }

    return added
  }

  return {
    isScanning,
    scanGames
  }
}
