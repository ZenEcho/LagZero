import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, Platform } from './types'
import { normalizeDisplayName, pickRelatedExecutables, safeReadDir } from './utils'

/**
 * 扫描指定目录下的通用平台游戏 (Epic, EA, Microsoft Store)
 * 
 * 这种扫描方式主要依赖于目录结构和可执行文件的启发式匹配。
 * 
 * @param source 游戏平台标识
 * @param roots 需要扫描的根目录列表
 * @returns 扫描到的游戏列表
 */
export async function scanFlatPlatformFolder(source: Platform, roots: string[]): Promise<LocalGameScanResult[]> {
  const results: LocalGameScanResult[] = []

  for (const root of roots) {
    if (!await fs.pathExists(root)) continue
    const entries = await safeReadDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(root, entry.name)
      const exes = await pickRelatedExecutables(installDir, entry.name)
      if (!exes || exes.length === 0) continue
      results.push({
        name: normalizeDisplayName(entry.name),
        processName: exes.map(e => path.basename(e)),
        source,
        installDir
      })
    }
  }

  return results
}
