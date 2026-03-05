import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, Platform, ScanProgressCallback } from './types'
import { dedupeProcessNames, mapWithConcurrency, normalizeDisplayName, pickRelatedExecutables, safeReadDir } from './utils'

/**
 * 扁平目录扫描相关配置选项
 */
export type FlatScanOptions = {
  /** 需要跳过的目录名列表 */
  ignoreDirNames?: Set<string>
  /** 如果提供，则执行自定义校验方法通过的才会被扫描 */
  shouldIncludeDir?: (installDir: string, dirName: string) => boolean
  /** 顶级节点检索并发限制 */
  rootConcurrency?: number
  /** 子节点扫描深层并发数 */
  entryConcurrency?: number
}

/**
 * 扫描指定目录下的通用平台游戏 (Epic, EA, Microsoft Store)
 */
export async function scanFlatPlatformFolder(
  source: Platform,
  roots: string[],
  progressCallback?: ScanProgressCallback,
  options?: FlatScanOptions
): Promise<LocalGameScanResult[]> {
  const ignoreDirNames = options?.ignoreDirNames
  const shouldIncludeDir = options?.shouldIncludeDir

  const tasks = await mapWithConcurrency(roots, async (root) => {
    if (!await fs.pathExists(root)) return []
    progressCallback?.('scanning_dir', root)
    const entries = await safeReadDir(root)

    const scannedGames = await mapWithConcurrency(entries, async (entry) => {
      if (!entry.isDirectory()) return null
      const dirName = entry.name
      if (ignoreDirNames?.has(dirName.toLowerCase())) return null
      const installDir = path.join(root, dirName)
      if (shouldIncludeDir && !shouldIncludeDir(installDir, dirName)) return null

      const exes = await pickRelatedExecutables(installDir, dirName, progressCallback)
      if (!exes || exes.length === 0) return null

      return {
        name: normalizeDisplayName(dirName),
        processName: dedupeProcessNames(exes.map(e => path.basename(e))),
        source,
        installDir
      } as LocalGameScanResult
    }, options?.entryConcurrency ?? 6)

    return scannedGames.filter(g => g !== null) as LocalGameScanResult[]
  }, options?.rootConcurrency ?? 4)
  return tasks.flat()
}

