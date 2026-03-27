import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './scanners/types'
import { dedupeProcessNames, mapWithConcurrency, normalizeFsPath } from './scanners/utils'
import { scanSteamGames } from './scanners/steam'
import { scanMicrosoftGames } from './scanners/microsoft'
import { scanEpicGames } from './scanners/epic'
import { scanEAGames } from './scanners/ea'
import { scanBattleNetGames } from './scanners/battlenet'
import { scanWeGameGames } from './scanners/wegame'
import { scanLocalShortcuts } from './scanners/local'

const GAME_SCAN_SOURCES = ['Steam', 'Microsoft', 'Epic', 'EA', 'BattleNet', 'WeGame', 'Local'] as const
type GameScanSource = typeof GAME_SCAN_SOURCES[number]
const GAME_SCAN_SOURCE_SET = new Set<GameScanSource>(GAME_SCAN_SOURCES)

function isGameScanSource(value: unknown): value is GameScanSource {
  return GAME_SCAN_SOURCE_SET.has(String(value || '') as GameScanSource)
}

/**
 * 游戏扫描服务
 */
export class GameScannerService {
  /**
   * 扫描所有支持平台的游戏
   * @returns 扫描到的游戏列表 (去重后)
   */
  async scanLocalGamesFromPlatforms(
    sourcesOrProgressCallback?: string[] | ScanProgressCallback,
    progressCallback?: ScanProgressCallback
  ): Promise<LocalGameScanResult[]> {
    if (process.platform !== 'win32') return []

    const requestedSources = Array.isArray(sourcesOrProgressCallback)
      ? Array.from(new Set(sourcesOrProgressCallback.filter(isGameScanSource)))
      : []
    const callback = typeof sourcesOrProgressCallback === 'function' ? sourcesOrProgressCallback : progressCallback

    const scanners: Array<{ name: GameScanSource, run: (progressCallback?: ScanProgressCallback) => Promise<LocalGameScanResult[]> }> = [
      { name: 'Steam', run: scanSteamGames },
      { name: 'Microsoft', run: scanMicrosoftGames },
      { name: 'Epic', run: scanEpicGames },
      { name: 'EA', run: scanEAGames },
      { name: 'BattleNet', run: scanBattleNetGames },
      { name: 'WeGame', run: scanWeGameGames },
      { name: 'Local', run: scanLocalShortcuts }
    ]

    const activeScanners = Array.isArray(sourcesOrProgressCallback)
      ? scanners.filter(({ name }) => requestedSources.includes(name))
      : scanners

    console.info(`[GameScan] 开始扫描平台，任务数=${activeScanners.length}${requestedSources.length > 0 ? ` | 来源=${requestedSources.join(',')}` : ''}`)

    if (activeScanners.length === 0) {
      console.info('[GameScan] 未选择任何扫描来源，直接返回空结果')
      return []
    }

    const platformResults = await mapWithConcurrency(activeScanners, async ({ name, run }) => {
      const startedAt = Date.now()
      try {
        console.info(`[GameScan] 平台扫描开始: ${name}`)
        const result = await run(callback)
        const costMs = Date.now() - startedAt
        console.info(`[GameScan] 平台扫描完成: ${name} | 命中=${result.length} | 耗时=${costMs}ms`)
        return result
      } catch (error) {
        const costMs = Date.now() - startedAt
        console.error(`[GameScan] 平台扫描失败: ${name} | 耗时=${costMs}ms`, error)
        return []
      }
    }, 4)

    const allResults = platformResults.flat()
    const rawTotal = allResults.length

    const byInstallDir = new Map<string, LocalGameScanResult>()
    const fallback = new Map<string, LocalGameScanResult>()

    for (const game of allResults) {
      const processNames = dedupeProcessNames(Array.isArray(game.processName) ? game.processName : [])
      const normalized: LocalGameScanResult = {
        ...game,
        processName: processNames
      }

      const installDirKey = normalizeFsPath(normalized.installDir)
      if (installDirKey) {
        const prev = byInstallDir.get(installDirKey)
        if (!prev) {
          byInstallDir.set(installDirKey, normalized)
        } else {
          byInstallDir.set(installDirKey, {
            ...prev,
            name: prev.name.length >= normalized.name.length ? prev.name : normalized.name,
            processName: dedupeProcessNames([...prev.processName, ...normalized.processName]),
          })
        }
        continue
      }

      const processKey = processNames.slice().sort((a, b) => a.localeCompare(b)).join(',').toLowerCase()
      const key = `${normalized.name.toLowerCase()}|${processKey}`
      if (!fallback.has(key)) fallback.set(key, normalized)
    }

    const deduped = [...byInstallDir.values(), ...fallback.values()]
    console.info(`[GameScan] 扫描汇总完成 | 原始=${rawTotal} | 去重后=${deduped.length} | installDir键=${byInstallDir.size} | fallback键=${fallback.size}`)

    return deduped
  }

  /**
   * 扫描指定目录下的可执行文件
   * @param dir 要扫描的起始目录
   * @param maxDepth 最大扫描深度（-1表示无限深度）
   * @param currentDepth 内部递归使用的当前深度，默认从1开始
   * @returns 扫描到的 .exe 文件相对当前调用层的名称或相对子路径名称列表
   */
  async scanDir(dir: string, maxDepth: number, currentDepth: number = 1): Promise<string[]> {
    let results: string[] = []
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true })
      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          if (maxDepth === -1 || currentDepth < maxDepth) {
            const subResults = await this.scanDir(path.join(dir, dirent.name), maxDepth, currentDepth + 1)
            results.push(...subResults)
          }
        } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith('.exe')) {
          results.push(dirent.name)
        }
      }
    } catch (err) {
      console.error(`扫描目录 ${dir} 失败:`, err)
    }
    return results
  }
}
