import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { getWindowsDriveRoots, normalizeDisplayName, normalizeFsPath, pickRelatedExecutables, safeReadDir } from './utils'
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

  // 主动嗅探宽泛的 steamapps 目录（搜索驱动器下的前两级目录）
  // 专门对付脱离注册表的绿色版/遗留库
  for (const root of drives) {
    try {
      const topLevelDirs = await safeReadDir(root)
      const dirsToSearch = [root]

      for (const d of topLevelDirs) {
        if (d.isDirectory() && !['Windows', 'ProgramData', '$Recycle.Bin', 'System Volume Information'].includes(d.name)) {
          dirsToSearch.push(path.join(root, d.name))
        }
      }

      await Promise.all(dirsToSearch.map(async (searchDir) => {
        try {
          const steamAppsPath = path.join(searchDir, 'steamapps')
          if (await fs.pathExists(steamAppsPath)) {
            candidateSteamRoots.push(searchDir)
          }
        } catch { }
      }))
    } catch (e) {
      // ignore root scan errors
    }
  }

  // 尝试从注册表获取真实 Steam 安装目录
  try {
    const script = [
      '$items = @(',
      '(Get-ItemProperty "HKCU:\\Software\\Valve\\Steam" -ErrorAction SilentlyContinue).SteamPath,',
      '(Get-ItemProperty "HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam" -ErrorAction SilentlyContinue).InstallPath,',
      '(Get-ItemProperty "HKLM:\\SOFTWARE\\Valve\\Steam" -ErrorAction SilentlyContinue).InstallPath',
      ') | Where-Object { $_ }',
      '$items | ConvertTo-Json -Compress'
    ].join('; ')
    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 6000)
    if (code === 0 && output) {
      const text = output.trim()
      const roots = text.startsWith('[') ? (JSON.parse(text) as string[]) : [text.replace(/^"|"$/g, '')]
      for (const root of roots) {
        const p = String(root || '').trim()
        if (p) candidateSteamRoots.unshift(path.normalize(p))
      }
    }
  } catch (e) {
    // ignore
  }
  const libs = new Set<string>()

  for (const steamRoot of candidateSteamRoots) {
    libs.add(path.normalize(steamRoot))

    const libraryVdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
    if (!await fs.pathExists(libraryVdf)) continue
    try {
      const content = await fs.readFile(libraryVdf, 'utf8')
      const lines = content.split(/\r?\n/)
      for (const line of lines) {
        // 新版格式: "path" "D:\\SteamLibrary"
        const m = line.match(/"path"\s+"([^"]+)"/i)
        if (m?.[1]) {
          const p = m[1].replace(/\\\\/g, '\\').trim()
          if (p) libs.add(path.normalize(p))
          continue
        }

        // 旧版格式: "1" "D:\\SteamLibrary"
        const old = line.match(/^\s*"\d+"\s+"([^"]+)"\s*$/)
        if (old?.[1]) {
          const p = old[1].replace(/\\\\/g, '\\').trim()
          if (p) libs.add(path.normalize(p))
        }
      }
    } catch (e) {
      console.warn('[游戏扫描] 解析 Steam libraryfolders.vdf 失败:', e)
    }
  }

  return Array.from(new Set(Array.from(libs).map(p => path.normalize(p).toLowerCase())))
}

function parseAcfValue(content: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`"${escaped}"\\s+"([^"]*)"`, 'i'))
  return (match?.[1] || '').replace(/\\\\/g, '\\').trim()
}

async function scanSteamFromManifests(
  libRoot: string,
  progressCallback?: ScanProgressCallback
): Promise<LocalGameScanResult[]> {
  const results: LocalGameScanResult[] = []
  const steamAppsDir = path.join(libRoot, 'steamapps')
  if (!await fs.pathExists(steamAppsDir)) return results

  progressCallback?.('scanning_dir', steamAppsDir)

  const entries = await safeReadDir(steamAppsDir)
  const manifestFiles = entries.filter(entry => entry.isFile() && /^appmanifest_\d+\.acf$/i.test(entry.name))

  const manifestTasks = manifestFiles.map(async (manifest) => {
    const manifestPath = path.join(steamAppsDir, manifest.name)
    try {
      const content = await fs.readFile(manifestPath, 'utf8')
      const appName = parseAcfValue(content, 'name')
      const installFolder = parseAcfValue(content, 'installdir')
      if (!installFolder) return null

      const installDir = path.join(steamAppsDir, 'common', installFolder)
      if (!await fs.pathExists(installDir)) return null

      const displayName = normalizeDisplayName(appName || installFolder)
      const exes = await pickRelatedExecutables(installDir, displayName, progressCallback)
      if (!exes || exes.length === 0) return null

      return {
        name: displayName,
        processName: exes.map(e => path.basename(e)),
        source: 'Steam',
        installDir
      } as LocalGameScanResult
    } catch {
      return null
    }
  })

  const manifestResults = await Promise.all(manifestTasks)
  for (const res of manifestResults) {
    if (res !== null) results.push(res)
  }

  return results
}

/**
 * 扫描 Steam 游戏
 * 优先使用 appmanifest 解析，兜底扫描 common 目录
 */
export async function scanSteamGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'Steam')
  const roots = await readSteamLibraryRoots()
  const results: LocalGameScanResult[] = []
  const dedup = new Map<string, LocalGameScanResult>()

  for (const libRoot of roots) {
    const manifestResults = await scanSteamFromManifests(libRoot, progressCallback)
    for (const game of manifestResults) {
      dedup.set(normalizeFsPath(game.installDir), game)
    }

    const commonDir = path.join(libRoot, 'steamapps', 'common')
    if (!await fs.pathExists(commonDir)) continue

    const games = await safeReadDir(commonDir)
    progressCallback?.('scanning_dir', commonDir)
    const scanGamesTasks = games.map(async (entry) => {
      if (!entry.isDirectory()) return null
      const installDir = path.join(commonDir, entry.name)
      if (dedup.has(normalizeFsPath(installDir))) return null
      const exes = await pickRelatedExecutables(installDir, entry.name, progressCallback)
      if (!exes || exes.length === 0) return null
      return {
        name: normalizeDisplayName(entry.name),
        processName: exes.map(e => path.basename(e)),
        installDir,
        source: 'Steam' as const
      }
    })

    const gamesResults = await Promise.all(scanGamesTasks)
    for (const res of gamesResults) {
      if (res !== null) dedup.set(normalizeFsPath(res.installDir), res)
    }
  }

  results.push(...dedup.values())
  return results
}
