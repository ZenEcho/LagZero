import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult } from './types'
import { getWindowsDriveRoots, normalizeDisplayName, pickRelatedExecutables, safeReadDir } from './utils'
import { runCommand } from '../../utils/command'

/**
 * 读取 Steam 库文件夹路径
 * 解析 libraryfolders.vdf 文件获取所有库位置
 */
async function readSteamLibraryRoots(): Promise<string[]> {
  const drives = await getWindowsDriveRoots()
  const candidateSteamRoots = Array.from(new Set([
    ...drives.flatMap(root => [
      root,
      path.join(root, 'Program Files (x86)', 'Steam'),
      path.join(root, 'Program Files', 'Steam'),
      path.join(root, 'Steam'),
      path.join(root, 'SteamLibrary'),
      path.join(root, 'Games', 'Steam'),
      path.join(root, 'Games', 'SteamLibrary'),
      path.join(root, 'Game', 'Steam')
    ])
  ]))

  // 尝试从注册表获取真实 Steam 安装目录
  try {
    const { code, output } = await runCommand('powershell', ['-NoProfile', '-Command', '(Get-ItemProperty "HKCU:\\Software\\Valve\\Steam" -ErrorAction SilentlyContinue).SteamPath'], 5000)
    if (code === 0 && output) {
      const p = output.trim()
      if (p) candidateSteamRoots.unshift(path.normalize(p))
    }
  } catch (e) {
    // ignore
  }
  const libs = new Set<string>()

  for (const steamRoot of candidateSteamRoots) {
    const libraryVdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
    if (!await fs.pathExists(libraryVdf)) continue

    libs.add(path.normalize(steamRoot))
    try {
      const content = await fs.readFile(libraryVdf, 'utf8')
      const lines = content.split(/\r?\n/)
      for (const line of lines) {
        const m = line.match(/"path"\s+"([^"]+)"/i)
        if (!m?.[1]) continue
        const p = m[1].replace(/\\\\/g, '\\').trim()
        if (p) libs.add(path.normalize(p))
      }
    } catch (e) {
      console.warn('[GameScan] Failed to parse Steam libraryfolders.vdf:', e)
    }
  }

  return Array.from(libs)
}

/**
 * 扫描 Steam 游戏
 * 遍历所有 Steam 库目录下的 common 文件夹
 */
export async function scanSteamGames(): Promise<LocalGameScanResult[]> {
  const roots = await readSteamLibraryRoots()
  const results: LocalGameScanResult[] = []

  for (const libRoot of roots) {
    const commonDir = path.join(libRoot, 'steamapps', 'common')
    if (!await fs.pathExists(commonDir)) continue

    const games = await safeReadDir(commonDir)
    for (const entry of games) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(commonDir, entry.name)
      const exes = await pickRelatedExecutables(installDir, entry.name)
      if (!exes || exes.length === 0) continue
      results.push({
        name: normalizeDisplayName(entry.name),
        processName: exes.map(e => path.basename(e)),
        source: 'Steam',
        installDir
      })
    }
  }

  return results
}
