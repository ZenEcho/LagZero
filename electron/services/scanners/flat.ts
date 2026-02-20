import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult } from './types'
import { normalizeDisplayName, pickBestExecutable, safeReadDir } from './utils'

/**
 * 扫描指定目录下的通用平台游戏 (Epic, EA, Microsoft Store)
 * 
 * 这种扫描方式主要依赖于目录结构和可执行文件的启发式匹配。
 * 
 * @param source 游戏平台标识
 * @param roots 需要扫描的根目录列表
 * @returns 扫描到的游戏列表
 */
export async function scanFlatPlatformFolder(source: 'epic' | 'ea' | 'microsoft', roots: string[]): Promise<LocalGameScanResult[]> {
  const results: LocalGameScanResult[] = []

  for (const root of roots) {
    if (!await fs.pathExists(root)) continue
    const entries = await safeReadDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(root, entry.name)
      const exe = await pickBestExecutable(installDir, entry.name)
      if (!exe) continue
      results.push({
        name: normalizeDisplayName(entry.name),
        processName: path.basename(exe),
        source,
        installDir
      })
    }
  }

  return results
}
