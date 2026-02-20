import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { categoryApi, systemApi } from '@/api'
import { useGameStore } from '@/stores/games'
import { useCategoryStore } from '@/stores/categories'
import type { Category, Game, LocalScanGame } from '@/types'

const PLATFORM_CATEGORY_NAMES = ['Steam', 'Microsoft', 'Epic', 'EA'] as const

/**
 * 游戏扫描器 Composable
 * 提供扫描本地游戏、自动添加游戏到库以及识别运行中游戏的功能
 */
export function useGameScanner() {
  const { t } = useI18n()
  const isScanning = ref(false)
  const message = useMessage()
  const gameStore = useGameStore()
  const categoryStore = useCategoryStore()

  /**
   * 获取兜底分类 ID
   * 优先查找名为 'other'/'其他' 的分类，若未找到则返回第一个分类或 'other'
   */
  function getFallbackCategoryId() {
    const categories = categoryStore.categories || []
    const preferred = categories.find(c => String(c.id) === 'other')
      || categories.find(c => String(c.name || '').toLowerCase() === 'other')
      || categories.find(c => String(c.name || '').includes('其他'))
      || categories[0]
    return preferred?.id || 'other'
  }

  /**
   * 根据名称确保分类存在
   * 若分类不存在，则自动创建该分类
   * @param name 分类名称
   */
  async function ensureCategoryByName(name: string): Promise<string> {
    const normalizedName = String(name || '').trim()
    if (!normalizedName) return getFallbackCategoryId()

    const existing = (categoryStore.categories || []).find(
      c => String(c.name || '').toLowerCase() === normalizedName.toLowerCase()
    )
    if (existing?.id) return existing.id

    const maxOrder = Math.max(0, ...(categoryStore.categories || []).map(c => Number(c.order || 0)))
    const newCategory: Category = {
      id: '',
      name: normalizedName,
      order: maxOrder + 1
    }
    await categoryStore.addCategory(newCategory)
    await categoryStore.loadCategories()
    return categoryStore.categories.find(c => String(c.name || '').toLowerCase() === normalizedName.toLowerCase())?.id || getFallbackCategoryId()
  }

  /**
   * 确保平台分类存在
   * @param source 游戏来源平台
   */
  async function ensurePlatformCategoryId(source: LocalScanGame['source']): Promise<string> {
    const platformName = PLATFORM_CATEGORY_NAMES.find((name) => name === source) || source
    return ensureCategoryByName(platformName)
  }

  /**
   * 执行扫描任务
   * 包括：扫描本地游戏库、自动添加新游戏、扫描运行进程、匹配运行状态
   */
  async function scanGames() {
    isScanning.value = true
    try {
      const localGames = await systemApi.scanLocalGames()
      const added = await autoAddGamesFromLibraryScan(localGames)
      const processes = await systemApi.scanProcesses()
      const matched = gameStore.matchRunningGames(processes)

      if (added > 0) {
        message.success(t('games.scan_complete_added', { added, matched: matched.length }))
      } else if (matched.length > 0) {
        message.info(t('games.scan_complete_no_added', { matched: matched.length }))
      } else {
        message.info(t('games.scan_complete_none'))
      }
    } catch (error) {
      console.error('Failed to scan games:', error)
      message.error(t('games.scan_failed'))
    } finally {
      setTimeout(() => { isScanning.value = false }, 500)
    }
  }

  /**
   * 自动添加扫描到的本地游戏到库
   * @param localGames 本地扫描到的游戏列表
   * @returns 新增的游戏数量
   */
  async function autoAddGamesFromLibraryScan(localGames: LocalScanGame[]) {
    for (const platform of PLATFORM_CATEGORY_NAMES) {
      const hasPlatformGame = localGames.some(g => g.source === platform)
      if (!hasPlatformGame) continue
      await ensureCategoryByName(platform)
    }

    // 构建现有游戏库的查找键集合，用于快速去重
    const existingGameKeys = new Set(
      gameStore.gameLibrary.flatMap((game: Game) => {
        const targets = Array.isArray(game.processName) ? game.processName : [game.processName]
        return targets.map(name => `${String(game.name).toLowerCase()}|${String(name).toLowerCase()}`)
      })
    )

    const seen = new Set<string>()
    // 过滤有效游戏并排除已存在的游戏
    const candidates = localGames
      .filter(g => !!g.name && Array.isArray(g.processName) && g.processName.length > 0)
      .filter(g => {
        const processKey = [...g.processName].sort().join(',').toLowerCase()
        const key = `${g.name.toLowerCase()}|${processKey}`
        if (seen.has(key)) return false
        seen.add(key)

        return !g.processName.some(name => existingGameKeys.has(`${g.name.toLowerCase()}|${String(name).toLowerCase()}`))
      })

    let added = 0

    for (const item of candidates) {
      const matchedCategoryId = await categoryApi.match(item.name, item.processName)
      const platformCategoryId = await ensurePlatformCategoryId(item.source)
      const mergedCategories = Array.from(new Set(
        [platformCategoryId, matchedCategoryId, getFallbackCategoryId()]
          .map(v => String(v || '').trim())
          .filter(Boolean)
      ))
      const categoryId = mergedCategories[0] || platformCategoryId || getFallbackCategoryId()
      await gameStore.addGame({
        name: item.name,
        processName: item.processName,
        category: categoryId,
        categories: mergedCategories,
        tags: [],
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
