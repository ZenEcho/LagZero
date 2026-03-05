import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { dedupeProcessNames, getWindowsDriveRoots, mapWithConcurrency, normalizeDisplayName, normalizeFsPath, parsePowershellJson, pickRelatedExecutables } from './utils'
import { scanFlatPlatformFolder } from './flat'
import { runCommand } from '../../utils/command'

const EA_LAUNCHER_NAME_KEYWORDS = ['ea app', 'ea desktop', 'origin']
const EA_LAUNCHER_DIR_KEYWORDS = ['ea desktop', 'electronic arts\\ea desktop', '\\origin']
const EA_FLAT_IGNORE_DIRS = new Set(['ea app', 'ea desktop', 'origin', 'installer', 'installers', 'cache'])

/**
 * 注册表中 EA 游戏的展示及路径格式
 */
type EARegistryRow = {
  DisplayName?: string
  InstallLocation?: string
}

/**
 * EA 游戏的临时搜索线索
 */
type EAGameHint = {
  name: string
  installDir: string
}

/**
 * 判断此文件夹关联是否是 EA/Origin 客户端本体
 * @param name 应用名
 * @param installDir 安装位置
 * @returns 判断结果
 */
function isEALauncherEntry(name: string, installDir: string): boolean {
  const lowerName = String(name || '').toLowerCase()
  const lowerDir = String(installDir || '').toLowerCase()
  return EA_LAUNCHER_NAME_KEYWORDS.some(k => lowerName.includes(k)) ||
    EA_LAUNCHER_DIR_KEYWORDS.some(k => lowerDir.includes(k))
}

/**
 * 获取 EA/Origin 游戏的注册表安装路径
 */
async function getEARegistryInstalls(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  try {
    const script = [
      '$paths = @()',
      '$keys = @(',
      '  "HKLM:\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Games",',
      '  "HKLM:\\SOFTWARE\\Electronic Arts\\EA Games"',
      ')',
      'foreach ($key in $keys) {',
      '  if (Test-Path $key) {',
      '    $subkeys = Get-ChildItem -Path $key -ErrorAction SilentlyContinue',
      '    foreach ($subkey in $subkeys) {',
      '      $installDir = (Get-ItemProperty -Path $subkey.PSPath -Name "Install Dir" -ErrorAction SilentlyContinue)."Install Dir"',
      '      if ($installDir) { $paths += $installDir }',
      '    }',
      '  }',
      '}',
      '$paths | ConvertTo-Json -Compress'
    ].join('; ')

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 7000)
    if (code !== 0 || !output) return []

    const rows = parsePowershellJson<string>(output)
    return rows
      .map(v => path.normalize(String(v || '').trim()))
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 从卸载注册表读取 EA 游戏安装目录与名称
 */
async function getEAUninstallHints(): Promise<EAGameHint[]> {
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
      "    Where-Object { $_.DisplayName -and $_.InstallLocation -and (($_.Publisher -match '(?i)Electronic\\s+Arts|\\bEA\\b') -or ($_.DisplayName -match '(?i)\\bEA\\b|\\bOrigin\\b|Electronic\\s+Arts')) } |",
      "    Select-Object DisplayName, InstallLocation",
      "}",
      "$items | ConvertTo-Json -Compress"
    ].join('; ')

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 9000)
    if (code !== 0 || !output) return []

    return parsePowershellJson<EARegistryRow>(output)
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
 * 特定线索位置深层扫描 EA 进程配置
 * @param hint 游戏定位线索
 * @param progressCallback 进度通知
 * @returns 结果或空
 */
async function scanEAHintInstall(hint: EAGameHint, progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult | null> {
  if (isEALauncherEntry(hint.name, hint.installDir)) return null
  if (!await fs.pathExists(hint.installDir)) return null

  progressCallback?.('scanning_dir', hint.installDir)
  const displayName = normalizeDisplayName(hint.name || path.basename(hint.installDir))
  const exes = await pickRelatedExecutables(hint.installDir, displayName, progressCallback)
  if (!exes || exes.length === 0) return null

  return {
    name: displayName,
    processName: dedupeProcessNames(exes.map(e => path.basename(e))),
    source: 'EA',
    installDir: hint.installDir
  }
}

/**
 * 扫描 EA Games
 * 通过读取注册表以及扫描常见目录来发现 EA 游戏
 */
export async function scanEAGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'EA')
  const dedup = new Map<string, LocalGameScanResult>()

  const [regDirs, uninstallHints] = await Promise.all([
    getEARegistryInstalls(),
    getEAUninstallHints()
  ])

  const registryHints: EAGameHint[] = regDirs.map(dir => ({
    name: path.basename(dir),
    installDir: dir
  }))

  const mergedHints = [...registryHints, ...uninstallHints]
  const scannedHints = await mapWithConcurrency(mergedHints, async (hint) => {
    return await scanEAHintInstall(hint, progressCallback)
  }, 6)

  for (const game of scannedHints) {
    if (!game) continue
    const key = normalizeFsPath(game.installDir)
    if (!dedup.has(key)) dedup.set(key, game)
  }

  // 兜底常见目录扫描
  const drives = await getWindowsDriveRoots()
  const candidateRoots = Array.from(new Set(drives.flatMap(root => [
    path.join(root, 'EA Games'),
    path.join(root, 'Electronic Arts'),
    path.join(root, 'Program Files', 'EA Games'),
    path.join(root, 'Program Files', 'Electronic Arts'),
    path.join(root, 'Program Files (x86)', 'EA Games'),
    path.join(root, 'Program Files (x86)', 'Electronic Arts'),
    path.join(root, 'Games', 'EA Games'),
    path.join(root, 'Game', 'EA Games'),
    path.join(root, 'Games', 'Electronic Arts')
  ])))

  const flatResults = await scanFlatPlatformFolder('EA', candidateRoots, progressCallback, {
    ignoreDirNames: EA_FLAT_IGNORE_DIRS,
    shouldIncludeDir: (installDir, dirName) => !isEALauncherEntry(dirName, installDir)
  })

  for (const game of flatResults) {
    if (isEALauncherEntry(game.name, game.installDir)) continue
    const key = normalizeFsPath(game.installDir)
    if (!dedup.has(key)) dedup.set(key, game)
  }
  return Array.from(dedup.values())
}

