import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import {
  getWindowsDriveRoots,
  mapWithConcurrency,
  normalizeDisplayName,
  normalizeFsPath,
  parsePowershellJson,
  pickRelatedExecutables,
  safeReadDir
} from './utils'
import { runCommand } from '../../utils/command'

/**
 * 从 acf 内容中按 key 取值
 */
function parseAcfValue(content: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`"${escaped}"\\s+"([^"]*)"`, 'i'))
  return (match?.[1] || '').replace(/\\\\/g, '\\').trim()
}

/**
 * 从 acf 内容中提取状态位
 */
function parseAppStateFlags(content: string): number {
  const raw = parseAcfValue(content, 'StateFlags')
  const state = Number.parseInt(raw, 10)
  return Number.isFinite(state) ? state : 0
}

/**
 * Steam state bit2 == installed (1 << 2 == 4)
 */
function isInstalledByStateFlags(stateFlags: number): boolean {
  return (stateFlags & (1 << 2)) !== 0
}

/**
 * 从 libraryfolders.vdf 内容解析包含已配正确存储介质的 Steam 本地位置数组
 * - 旧格式: "1" "D:\\SteamLibrary"
 * - 新格式: "1" { "path" "D:\\SteamLibrary" "mounted" "1" ... }
 * @param content VDF 文件明文
 * @returns 去重规范化的可用游戏库目录路径大集
 */
function parseLibraryFoldersVdf(content: string): string[] {
  const roots = new Set<string>()
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const old = line.match(/^\s*"\d+"\s+"([^"]+)"\s*$/)
    if (!old?.[1]) continue
    roots.add(path.normalize(old[1].replace(/\\\\/g, '\\').trim()))
  }

  let sectionDepth = 0
  let hasSection = false
  let sectionPath = ''
  let sectionMounted = ''

  const flushSection = () => {
    if (!sectionPath) return
    if (sectionMounted && sectionMounted !== '1') return
    roots.add(path.normalize(sectionPath))
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (!hasSection) {
      if (/^"\d+"\s*\{$/.test(line)) {
        hasSection = true
        sectionDepth = 1
        sectionPath = ''
        sectionMounted = ''
      }
      continue
    }

    const openCount = (line.match(/\{/g) || []).length
    const closeCount = (line.match(/\}/g) || []).length
    sectionDepth += openCount

    if (sectionDepth === 1) {
      const kv = line.match(/^"([^"]+)"\s+"([^"]*)"$/)
      if (kv?.[1] && kv?.[2] !== undefined) {
        const key = kv[1].toLowerCase()
        const value = kv[2].replace(/\\\\/g, '\\').trim()
        if (key === 'path') sectionPath = value
        if (key === 'mounted') sectionMounted = value
      }
    }

    sectionDepth -= closeCount
    if (sectionDepth <= 0) {
      flushSection()
      hasSection = false
      sectionDepth = 0
    }
  }

  return Array.from(roots)
}

/**
 * 集中读取 Steam 在各盘所有的已加载游戏组件/外挂库根目录
 * @returns 有效存在根路径的集合
 */
async function readSteamLibraryRoots(): Promise<string[]> {
  const drives = await getWindowsDriveRoots()
  const candidateSteamRoots = new Set<string>([
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
  ])

  // 受 SteamTools 启发：优先走配置/注册表；兜底嗅探时限制候选目录，避免全盘抖动。
  await mapWithConcurrency(drives, async (root) => {
    try {
      const topLevelDirs = await safeReadDir(root)
      const dirsToSearch = [root]
      let searched = 0

      for (const d of topLevelDirs) {
        if (searched >= 32) break
        if (!d.isDirectory()) continue
        const lower = d.name.toLowerCase()
        if (['windows', 'programdata', '$recycle.bin', 'system volume information'].includes(lower)) continue
        if (!/(steam|game|games|library)/i.test(d.name)) continue
        searched += 1
        dirsToSearch.push(path.join(root, d.name))
      }

      await mapWithConcurrency(dirsToSearch, async (searchDir) => {
        try {
          const steamAppsPath = path.join(searchDir, 'steamapps')
          if (await fs.pathExists(steamAppsPath)) {
            candidateSteamRoots.add(path.normalize(searchDir))
          }
        } catch {
          // ignore
        }
      }, 6)
    } catch {
      // ignore root scan errors
    }
    return true
  }, 4)

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
      const roots = parsePowershellJson<string>(output)
      for (const root of roots) {
        const p = String(root || '').trim()
        if (p) candidateSteamRoots.add(path.normalize(p))
      }
    }
  } catch {
    // ignore
  }

  const libs = new Set<string>()

  await mapWithConcurrency(Array.from(candidateSteamRoots), async (steamRoot) => {
    libs.add(path.normalize(steamRoot))

    const libraryVdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
    if (!await fs.pathExists(libraryVdf)) return null
    try {
      const content = await fs.readFile(libraryVdf, 'utf8')
      const paths = parseLibraryFoldersVdf(content)
      for (const p of paths) {
        if (p) libs.add(path.normalize(p))
      }
    } catch (e) {
      console.warn('[游戏扫描] 解析 Steam libraryfolders.vdf 失败:', e)
    }
    return null
  }, 6)

  return Array.from(new Set(Array.from(libs).map(p => path.normalize(p).toLowerCase())))
}

/**
 * 解析 appmanifest_*.acf 并顺带拉取 common 中相关已装组件数据组装标准模型
 * @param libRoot Steam 组件库存储核心位置
 * @param progressCallback 回调
 * @returns 游戏匹配集合和统计分析量
 */
async function scanSteamFromManifests(
  libRoot: string,
  progressCallback?: ScanProgressCallback
): Promise<{ games: LocalGameScanResult[], manifestCount: number }> {
  const steamAppsDir = path.join(libRoot, 'steamapps')
  if (!await fs.pathExists(steamAppsDir)) return { games: [], manifestCount: 0 }

  progressCallback?.('scanning_dir', steamAppsDir)

  const entries = await safeReadDir(steamAppsDir)
  const manifestFiles = entries.filter(entry => entry.isFile() && /^appmanifest_\d+\.acf$/i.test(entry.name))
  const manifestCount = manifestFiles.length

  const manifestResults = await mapWithConcurrency(manifestFiles, async (manifest) => {
    const manifestPath = path.join(steamAppsDir, manifest.name)
    try {
      const content = await fs.readFile(manifestPath, 'utf8')
      if (!content.replace(/\0/g, '').trim()) return null

      const stateFlags = parseAppStateFlags(content)
      if (stateFlags !== 0 && !isInstalledByStateFlags(stateFlags)) return null

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
        processName: Array.from(new Set(exes.map(e => path.basename(e)))),
        source: 'Steam',
        installDir
      } as LocalGameScanResult
    } catch {
      return null
    }
  }, 8)

  return {
    games: manifestResults.filter((res): res is LocalGameScanResult => res !== null),
    manifestCount
  }
}

/**
 * 扫描 Steam 游戏
 * 优先使用 appmanifest 解析，兜底扫描 common 目录
 */
export async function scanSteamGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'Steam')
  const roots = await readSteamLibraryRoots()
  const dedup = new Map<string, LocalGameScanResult>()

  for (const libRoot of roots) {
    const { games: manifestResults, manifestCount } = await scanSteamFromManifests(libRoot, progressCallback)
    for (const game of manifestResults) {
      dedup.set(normalizeFsPath(game.installDir), game)
    }

    // 受 SteamTools 的“基于清单扫描”策略启发：
    // 已能读取到 manifest 时，避免再全量深扫 common 目录导致 I/O 放大。
    if (manifestCount > 0) continue

    const commonDir = path.join(libRoot, 'steamapps', 'common')
    if (!await fs.pathExists(commonDir)) continue

    const games = await safeReadDir(commonDir)
    progressCallback?.('scanning_dir', commonDir)
    const gamesResults = await mapWithConcurrency(games, async (entry) => {
      if (!entry.isDirectory()) return null
      const installDir = path.join(commonDir, entry.name)
      if (dedup.has(normalizeFsPath(installDir))) return null
      const exes = await pickRelatedExecutables(installDir, entry.name, progressCallback)
      if (!exes || exes.length === 0) return null

      return {
        name: normalizeDisplayName(entry.name),
        processName: Array.from(new Set(exes.map(e => path.basename(e)))),
        installDir,
        source: 'Steam' as const
      }
    }, 6)

    for (const res of gamesResults) {
      if (res !== null) dedup.set(normalizeFsPath(res.installDir), res)
    }
  }

  return Array.from(dedup.values())
}

