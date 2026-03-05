import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { dedupeProcessNames, getWindowsDriveRoots, mapWithConcurrency, normalizeDisplayName, normalizeFsPath, parsePowershellJson, pickRelatedExecutables, safeReadDir } from './utils'
import { runCommand } from '../../utils/command'

/**
 * 战网安装提示项结构
 */
type RegistryHint = {
  DisplayName?: string
  InstallLocation?: string
}

const BNET_LAUNCHER_DIR_KEYWORDS = ['battle.net', 'agent', 'launcher', 'updater', 'blizzard browser']
const BNET_NAME_HINTS = [
  'world of warcraft',
  'warcraft',
  'overwatch',
  'diablo',
  'starcraft',
  'hearthstone',
  'heroes of the storm',
  'call of duty'
]
const BNET_FALLBACK_SKIP_DIR_NAMES = new Set([
  'common files',
  'modifiableswindowsapps',
  'windowsapps',
  'windows nt',
  'internet explorer',
  'package cache'
])
const BNET_FALLBACK_DIR_CHECK_CONCURRENCY = 12

/**
 * 判断指定名称或安装目录是否为战网启动器本身
 * @param name 游戏名称（或上层文件夹名）
 * @param installDir 安装目录路径
 * @returns 判断结果
 */
function isBattleNetLauncher(name: string, installDir: string) {
  const lowerName = String(name || '').toLowerCase()
  const lowerDir = String(installDir || '').toLowerCase()
  return BNET_LAUNCHER_DIR_KEYWORDS.some(k => lowerName.includes(k) || lowerDir.includes(`\\${k}`))
}

/**
 * 从系统注册表获取已安装的暴雪/战网游戏信息
 * @returns 提取到的安装目录及名称线索数组
 */
async function getBattleNetRegistryHints(): Promise<Array<{ name: string, installDir: string }>> {
  if (process.platform !== 'win32') return []

  try {
    const script = [
      "$roots = @(",
      "  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
      ")",
      "$items = foreach ($r in $roots) {",
      "  Get-ItemProperty -Path $r -ErrorAction SilentlyContinue |",
      "    Where-Object { $_.DisplayName -and $_.InstallLocation -and (($_.Publisher -match '(?i)Blizzard|Activision') -or ($_.DisplayName -match '(?i)Battle\\.net|Blizzard|Diablo|Overwatch|Warcraft|Hearthstone|StarCraft|Call\\s*of\\s*Duty')) } |",
      "    Select-Object DisplayName, InstallLocation",
      "}",
      "$items | ConvertTo-Json -Compress"
    ].join('; ')

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 9000)
    if (code !== 0 || !output) return []

    return parsePowershellJson<RegistryHint>(output)
      .map(row => ({
        name: String(row.DisplayName || '').trim(),
        installDir: path.normalize(String(row.InstallLocation || '').trim())
      }))
      .filter(row => row.name && row.installDir)
  } catch {
    return []
  }
}

/**
 * 根据特征文件和文件夹命名探测是否符合战网游戏特征
 * @param installDir 探测目录
 * @returns 判断结果
 */
async function looksLikeBattleNetGameDir(installDir: string) {
  if (!await fs.pathExists(installDir)) return false
  const lower = path.basename(installDir).toLowerCase()
  if (isBattleNetLauncher(lower, installDir)) return false

  const buildInfo = path.join(installDir, '.build.info')
  if (await fs.pathExists(buildInfo)) return true

  if (BNET_NAME_HINTS.some(k => lower.includes(k))) return true

  return false
}

/**
 * 对一条战网游戏线索做执行文件深度探查与组装
 * @param name 游戏标称
 * @param installDir 指定目录
 * @param progressCallback 进度反馈回调
 * @returns 返回标准化结构结果，丢弃失败或不符条件的
 */
async function scanBattleNetHint(name: string, installDir: string, progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult | null> {
  if (isBattleNetLauncher(name, installDir)) return null
  if (!await looksLikeBattleNetGameDir(installDir)) return null

  progressCallback?.('scanning_dir', installDir)
  const displayName = normalizeDisplayName(name || path.basename(installDir))
  const exes = await pickRelatedExecutables(installDir, displayName, progressCallback)
  if (!exes || exes.length === 0) return null

  return {
    name: displayName,
    processName: dedupeProcessNames(exes.map(e => path.basename(e))),
    source: 'BattleNet',
    installDir
  }
}

/**
 * 扫描战网 Battle.net 游戏
 */
export async function scanBattleNetGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'BattleNet')
  const dedup = new Map<string, LocalGameScanResult>()

  const registryHints = await getBattleNetRegistryHints()
  const scannedRegistry = await mapWithConcurrency(registryHints, async (hint) => {
    return await scanBattleNetHint(hint.name, hint.installDir, progressCallback)
  }, 6)

  for (const game of scannedRegistry) {
    if (!game) continue
    const key = normalizeFsPath(game.installDir)
    if (!dedup.has(key)) dedup.set(key, game)
  }

  // 兜底：在常见根目录扫描一级可疑目录，不再截断前 N 项。
  const drives = await getWindowsDriveRoots()
  const candidateRoots = Array.from(new Set(drives.flatMap(root => [
    path.join(root, 'Games'),
    path.join(root, 'Game'),
    path.join(root, 'Program Files'),
    path.join(root, 'Program Files (x86)')
  ])))

  const fallbackBatches = await mapWithConcurrency(candidateRoots, async (root) => {
    if (!await fs.pathExists(root)) return []
    progressCallback?.('scanning_dir', root)

    const entries = await safeReadDir(root)
    const dirs = entries.filter(e => e.isDirectory())

    const candidates = await mapWithConcurrency(dirs, async (entry) => {
      const installDir = path.join(root, entry.name)
      const lower = entry.name.toLowerCase()
      if (isBattleNetLauncher(lower, installDir)) return null
      if (BNET_FALLBACK_SKIP_DIR_NAMES.has(lower)) return null
      if (BNET_NAME_HINTS.some(k => lower.includes(k))) {
        return { name: entry.name, installDir }
      }

      if (await fs.pathExists(path.join(installDir, '.build.info'))) {
        return { name: entry.name, installDir }
      }

      return null
    }, BNET_FALLBACK_DIR_CHECK_CONCURRENCY)

    const scanned = await mapWithConcurrency(candidates.filter(Boolean) as Array<{ name: string, installDir: string }>, async (hint) => {
      return await scanBattleNetHint(hint.name, hint.installDir, progressCallback)
    }, 4)

    return scanned.filter(Boolean) as LocalGameScanResult[]
  }, 3)

  for (const batch of fallbackBatches) {
    for (const game of batch) {
      const key = normalizeFsPath(game.installDir)
      if (!dedup.has(key)) dedup.set(key, game)
    }
  }

  return Array.from(dedup.values())
}


