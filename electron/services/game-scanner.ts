import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult } from './scanners/types'
import { getWindowsDriveRoots } from './scanners/utils'
import { scanSteamGames } from './scanners/steam'
import { scanMicrosoftGames } from './scanners/microsoft'
import { scanFlatPlatformFolder } from './scanners/flat'

/**
 * 游戏扫描服务
 * 
 * 负责扫描本地已安装的游戏，目前支持 Windows 平台。
 * 聚合了 Steam, Microsoft Store (Xbox), Epic Games, EA App 等多个平台的扫描逻辑。
 */
export class GameScannerService {
  /**
   * 扫描所有支持平台的游戏
   * @returns 扫描到的游戏列表 (去重后)
   */
  async scanLocalGamesFromPlatforms(): Promise<LocalGameScanResult[]> {
    if (process.platform !== 'win32') return []
    const drives = await getWindowsDriveRoots()

    const [steam, microsoft, epic, ea] = await Promise.all([
      scanSteamGames(),
      scanMicrosoftGames(),
      scanFlatPlatformFolder('Epic', Array.from(new Set(
        drives.flatMap(root => [
          path.join(root, 'Epic Games'),
          path.join(root, 'Program Files', 'Epic Games'),
          path.join(root, 'Program Files (x86)', 'Epic Games'),
          path.join(root, 'Games', 'Epic Games'),
          path.join(root, 'Game', 'Epic Games')
        ])
      ))),
      scanFlatPlatformFolder('EA', Array.from(new Set(
        drives.flatMap(root => [
          path.join(root, 'EA Games'),
          path.join(root, 'Electronic Arts'),
          path.join(root, 'Program Files', 'EA Games'),
          path.join(root, 'Program Files', 'Electronic Arts'),
          path.join(root, 'Program Files (x86)', 'EA Games'),
          path.join(root, 'Program Files (x86)', 'Electronic Arts'),
          path.join(root, 'Games', 'EA Games'),
          path.join(root, 'Game', 'EA Games'),
          path.join(root, 'Games', 'Electronic Arts')
        ])
      )))
    ])

    // 去重逻辑：名称和进程名列表都相同的视为同一个游戏
    const dedup = new Map<string, LocalGameScanResult>()
    for (const game of [...steam, ...microsoft, ...epic, ...ea]) {
      const processKey = Array.isArray(game.processName) ? game.processName.sort().join(',').toLowerCase() : ''
      const key = `${game.name.toLowerCase()}|${processKey}`
      if (!dedup.has(key)) dedup.set(key, game)
    }

    return Array.from(dedup.values())
  }

  /**
   * 扫描指定目录下的可执行文件
   * @param dir 目标目录
   * @param maxDepth 最大递归深度 (-1 为无限)
   * @param currentDepth 当前深度 (内部使用)
   * @returns 找到的 .exe 文件名列表
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
      console.error(`Error scanning directory ${dir}:`, err)
    }
    return results
  }
}
