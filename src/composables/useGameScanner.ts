import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { categoryApi, systemApi } from '@/api'
import { useGameStore } from '@/stores/games'
import { useCategoryStore } from '@/stores/categories'
import type { Category, Game, LocalScanGame } from '@/types'
import { PLATFORMS } from '@/constants'

// 将 isScanning 和 scanProgressText 提升到模块级别
const isScanning = ref(false)
const scanProgressText = ref('')

/**
 * 游戏扫描器 Composable
 * 提供扫描本地游戏、自动添加游戏到库以及识别运行中游戏的功能
 */
export function useGameScanner() {
  const { t } = useI18n()
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
    const platformName = PLATFORMS.find((name) => name === source) || source
    return ensureCategoryByName(platformName)
  }

  /**
   * 执行扫描任务
   * 包括：扫描本地游戏库、自动添加新游戏、扫描运行进程、匹配运行状态
   */
  async function scanGames() {
    if (isScanning.value) {
      message.warning(t('games.scan_in_progress') || '正在扫描中，请稍后再试')
      return
    }
    isScanning.value = true
    scanProgressText.value = t('games.scanning_local') || '正在扫描本地游戏，请耐心等待...'

    const handleProgress = (data: { status: string, details?: string }) => {
      if (data.status === 'scanning_platform') {
        scanProgressText.value = `正在扫描游戏平台: ${data.details}`
      } else if (data.status === 'scanning_dir' && data.details) {
        // 防止路径过长导致 UI 不美观，进行截断
        const shortPath = data.details.length > 50 ? '...' + data.details.slice(-50) : data.details
        scanProgressText.value = `正在检索: ${shortPath}`
      }
      // 可以在控制台打印详细日志
      // console.log('[Scan Progress]', data.status, data.details)
    }

    try {
      systemApi.onScanProgress(handleProgress)
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
      systemApi.offScanProgress(handleProgress)
      scanProgressText.value = ''
      setTimeout(() => { isScanning.value = false }, 500)
    }
  }

  /**
   * 自动添加扫描到的本地游戏到库
   * @param localGames 本地扫描到的游戏列表
   * @returns 新增的游戏数量
   */
  async function autoAddGamesFromLibraryScan(localGames: LocalScanGame[]) {
    for (const platform of PLATFORMS) {
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
    scanProgressText,
    scanGames
  }
}
