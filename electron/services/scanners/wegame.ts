import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { dedupeProcessNames, getWindowsDriveRoots, mapWithConcurrency, normalizeDisplayName, normalizeFsPath, parsePowershellJson, pickRelatedExecutables, safeReadDir } from './utils'
import { runCommand } from '../../utils/command'

/**
 * WeGame 中代表存储集合的主索引父容器
 */
const WEGAME_CONTAINER_DIRS = new Set(['rail_apps', 'common_apps', 'apps', 'games'])
/**
 * WeGame 原生系统级子容器或日志应用存放排除名单
 */
const WEGAME_NON_GAME_DIRS = new Set(['rail_apps', 'common_apps', 'app', 'apps', 'cache', 'logs', 'temp', 'patch'])

/**
 * WeGame 安装主干获取临时结构
 */
type WeGameInstallRow = {
  InstallPath?: string
  InstallDir?: string
  Path?: string
}

/**
 * 读取腾讯原生组件的系统环境与注册表根路径
 * @returns 去重后的 WeGame App 常量库组落脚点
 */
async function getWeGameInstallRootsFromRegistry(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  try {
    const script = [
      "$keys = @(",
      "  'HKLM:\\SOFTWARE\\WOW6432Node\\Tencent\\WeGame',",
      "  'HKLM:\\SOFTWARE\\Tencent\\WeGame',",
      "  'HKCU:\\SOFTWARE\\Tencent\\WeGame'",
      ")",
      "$items = foreach ($k in $keys) {",
      "  if (Test-Path $k) {",
      "    Get-ItemProperty -Path $k -ErrorAction SilentlyContinue |",
      "      Select-Object InstallPath, InstallDir, Path",
      "  }",
      "}",
      "$items | ConvertTo-Json -Compress"
    ].join('; ')

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 7000)
    if (code !== 0 || !output) return []

    const rows = parsePowershellJson<WeGameInstallRow>(output)
    const values = rows.flatMap(row => [row.InstallPath, row.InstallDir, row.Path])
      .map(v => String(v || '').trim())
      .filter(Boolean)

    const roots = new Set<string>()
    for (const val of values) {
      const normalized = path.normalize(val)
      roots.add(normalized)
      roots.add(path.join(normalized, 'apps'))
      roots.add(path.join(normalized, 'WeGameApps'))
    }

    return Array.from(roots)
  } catch {
    return []
  }
}

/**
 * 扫描腾讯 WeGame 游戏
 */
export async function scanWeGameGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'WeGame')
  const dedup = new Map<string, LocalGameScanResult>()

  const [drives, regRoots] = await Promise.all([
    getWindowsDriveRoots(),
    getWeGameInstallRootsFromRegistry()
  ])

  const candidateRoots = Array.from(new Set([
    ...regRoots,
    ...drives.flatMap(root => [
      path.join(root, 'WeGameApps'),
      path.join(root, 'WeGameApp'),
      path.join(root, 'Tencent', 'WeGame', 'apps'),
      path.join(root, 'Program Files', 'Tencent', 'WeGame', 'apps'),
      path.join(root, 'Program Files (x86)', 'Tencent', 'WeGame', 'apps'),
      path.join(root, 'Program Files', 'WeGameApps'),
      path.join(root, 'Program Files (x86)', 'WeGameApps')
    ])
  ]))

  const gamesFromRoots = await mapWithConcurrency(candidateRoots, async (root) => {
    if (!await fs.pathExists(root)) return []
    progressCallback?.('scanning_dir', root)

    const entries = await safeReadDir(root)
    const candidates: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const entryDir = path.join(root, entry.name)
      const entryLower = entry.name.toLowerCase()

      if (WEGAME_CONTAINER_DIRS.has(entryLower)) {
        progressCallback?.('scanning_dir', entryDir)
        const nested = await safeReadDir(entryDir)
        for (const sub of nested) {
          if (!sub.isDirectory()) continue
          const subLower = sub.name.toLowerCase()
          if (WEGAME_NON_GAME_DIRS.has(subLower)) continue
          candidates.push(path.join(entryDir, sub.name))
        }
        continue
      }

      if (!WEGAME_NON_GAME_DIRS.has(entryLower)) {
        candidates.push(entryDir)
      }
    }

    const scanned = await mapWithConcurrency(candidates, async (installDir) => {
      const dirName = path.basename(installDir)
      if (WEGAME_NON_GAME_DIRS.has(dirName.toLowerCase())) return null
      const exes = await pickRelatedExecutables(installDir, dirName, progressCallback)
      if (!exes || exes.length === 0) return null

      return {
        name: normalizeDisplayName(dirName),
        processName: dedupeProcessNames(exes.map(e => path.basename(e))),
        source: 'WeGame' as const,
        installDir
      } as LocalGameScanResult
    }, 6)

    return scanned.filter(v => v !== null) as LocalGameScanResult[]
  }, 4)

  for (const batch of gamesFromRoots) {
    for (const game of batch) {
      const key = normalizeFsPath(game.installDir)
      if (!dedup.has(key)) dedup.set(key, game)
    }
  }

  return Array.from(dedup.values())
}


