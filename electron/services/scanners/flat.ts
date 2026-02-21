import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, Platform, ScanProgressCallback } from './types'
import { mapWithConcurrency, normalizeDisplayName, pickRelatedExecutables, safeReadDir } from './utils'

/**
 * 扫描指定目录下的通用平台游戏 (Epic, EA, Microsoft Store)
 * 
 * 这种扫描方式主要依赖于目录结构和可执行文件的启发式匹配。
 * 
 * @param source 游戏平台标识
 * @param progressCallback 进度回调
 * @returns 扫描到的游戏列表
 */
export async function scanFlatPlatformFolder(
  source: Platform,
  roots: string[],
  progressCallback?: ScanProgressCallback
): Promise<LocalGameScanResult[]> {
  const results: LocalGameScanResult[] = []

  const tasks = await mapWithConcurrency(roots, async (root) => {
    if (!await fs.pathExists(root)) return []
    progressCallback?.('scanning_dir', root)
    const entries = await safeReadDir(root)

    // 目录中游戏项也并行扫描
    const scannedGames = await mapWithConcurrency(entries, async (entry) => {
      if (!entry.isDirectory()) return null
      const installDir = path.join(root, entry.name)
      const exes = await pickRelatedExecutables(installDir, entry.name, progressCallback)
      if (!exes || exes.length === 0) return null
      return {
        name: normalizeDisplayName(entry.name),
        processName: exes.map(e => path.basename(e)),
        source,
        installDir
      }
    }, 6)
    return scannedGames.filter(g => g !== null) as LocalGameScanResult[]
  }, 4)

  for (const c of tasks) {
    results.push(...c)
  }

  return results
}
