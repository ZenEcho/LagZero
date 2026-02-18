import fs from 'fs-extra'
import path from 'path'
import { runCommand } from '../utils/command'

/**
 * 本地游戏扫描结果接口
 */
export type LocalGameScanResult = {
  /** 游戏显示名称 */
  name: string
  /** 游戏主进程名 (如 dota2.exe) */
  processName: string
  /** 来源平台 */
  source: 'steam' | 'microsoft' | 'epic' | 'ea'
  /** 安装目录绝对路径 */
  installDir: string
}

const GAME_SCAN_IGNORE_DIR_NAMES = new Set([
  '_commonredist',
  'redist',
  'redistributable',
  'installer',
  'installers',
  'directx',
  'vcredist',
  'prereq',
  'prerequisites',
  'support',
  'tools',
  'launcher'
])

const GAME_SCAN_IGNORE_EXE_KEYWORDS = [
  'setup',
  'unins',
  'uninstall',
  'installer',
  'crashreport',
  'updater',
  'helper',
  'bootstrap'
]

const GAME_SCAN_EXE_HARD_EXCLUDE = new Set([
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe'
])

function normalizeDisplayName(name: string) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeFsPath(p: string) {
  return path.normalize(p).replace(/[\\\/]+$/, '').toLowerCase()
}

async function safeReadDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function getWindowsDriveRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const roots: string[] = []
  for (let i = 67; i <= 90; i += 1) {
    const letter = String.fromCharCode(i)
    const root = `${letter}:\\`
    if (await fs.pathExists(root)) roots.push(root)
  }
  return roots
}

function basenameLower(p: string) {
  return path.basename(p).toLowerCase()
}

function shouldSkipExeByName(exeName: string) {
  const lower = exeName.toLowerCase()
  if (!lower.endsWith('.exe')) return true
  if (GAME_SCAN_EXE_HARD_EXCLUDE.has(lower)) return true
  return GAME_SCAN_IGNORE_EXE_KEYWORDS.some(k => lower.includes(k))
}

async function collectExePaths(dir: string, maxDepth: number, currentDepth: number = 1): Promise<string[]> {
  const results: string[] = []
  const dirents = await safeReadDir(dir)

  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      const folderName = dirent.name.toLowerCase()
      if (GAME_SCAN_IGNORE_DIR_NAMES.has(folderName)) continue
      if (maxDepth === -1 || currentDepth < maxDepth) {
        const sub = await collectExePaths(full, maxDepth, currentDepth + 1)
        results.push(...sub)
      }
      continue
    }

    if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.exe')) continue
    if (shouldSkipExeByName(dirent.name)) continue
    results.push(full)
  }

  return results
}

async function pickBestExecutable(gameDir: string, displayName: string): Promise<string | null> {
  const exes = await collectExePaths(gameDir, 3)
  if (exes.length === 0) return null
  if (exes.length === 1) return exes[0] || null

  const target = normalizeDisplayName(displayName).toLowerCase()
  const ranked = await Promise.all(exes.map(async (exe) => {
    let score = 0
    const base = basenameLower(exe).replace(/\.exe$/, '')
    const full = exe.toLowerCase()

    if (base === target) score += 10
    if (base.includes(target)) score += 6
    if (target.includes(base)) score += 4
    if (!full.includes('launcher')) score += 2

    try {
      const stat = await fs.stat(exe)
      score += Math.min(8, Math.floor((stat.size || 0) / (40 * 1024 * 1024)))
    } catch {
      // ignore stat errors and keep heuristic score
    }

    return { exe, score }
  }))

  ranked.sort((a, b) => b.score - a.score)
  return ranked[0]?.exe || null
}

async function readSteamLibraryRoots(): Promise<string[]> {
  const drives = await getWindowsDriveRoots()
  const candidateSteamRoots = Array.from(new Set(
    drives.flatMap(root => [
      path.join(root, 'Program Files (x86)', 'Steam'),
      path.join(root, 'Program Files', 'Steam'),
      path.join(root, 'Steam')
    ])
  ))
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

async function scanSteamGames(): Promise<LocalGameScanResult[]> {
  const roots = await readSteamLibraryRoots()
  const results: LocalGameScanResult[] = []

  for (const libRoot of roots) {
    const commonDir = path.join(libRoot, 'steamapps', 'common')
    if (!await fs.pathExists(commonDir)) continue

    const games = await safeReadDir(commonDir)
    for (const entry of games) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(commonDir, entry.name)
      const exe = await pickBestExecutable(installDir, entry.name)
      if (!exe) continue
      results.push({
        name: normalizeDisplayName(entry.name),
        processName: path.basename(exe),
        source: 'steam',
        installDir
      })
    }
  }

  return results
}

async function scanFlatPlatformFolder(source: 'epic' | 'ea' | 'microsoft', roots: string[]): Promise<LocalGameScanResult[]> {
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

function pickBestNameFromHints(installDir: string, hints: Map<string, string>) {
  const dirKey = normalizeFsPath(installDir)
  let bestName = ''
  let bestLen = -1

  for (const [hintPath, hintName] of hints.entries()) {
    if (!hintName) continue
    if (dirKey === hintPath || dirKey.startsWith(`${hintPath}\\`) || hintPath.startsWith(`${dirKey}\\`)) {
      if (hintPath.length > bestLen) {
        bestLen = hintPath.length
        bestName = hintName
      }
    }
  }
  return bestName
}

function parsePowershellJson<T>(raw: string): T[] {
  const text = raw.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed as T[]
    if (parsed && typeof parsed === 'object') return [parsed as T]
    return []
  } catch {
    return []
  }
}

async function getRegistryDisplayNameHints(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (process.platform !== 'win32') return map

  const script = [
    "$roots = @(",
    "  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
    ")",
    "$items = foreach ($r in $roots) {",
    "  Get-ItemProperty -Path $r -ErrorAction SilentlyContinue |",
    "    Where-Object { $_.DisplayName -and $_.InstallLocation } |",
    "    Select-Object DisplayName, InstallLocation",
    "}",
    "$items | ConvertTo-Json -Compress"
  ].join('; ')

  const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 15000)
  if (code !== 0 || !output) return map

  const rows = parsePowershellJson<{ DisplayName?: string, InstallLocation?: string }>(output)
  for (const row of rows) {
    const name = String(row.DisplayName || '').trim()
    const location = String(row.InstallLocation || '').trim()
    if (!name || !location) continue
    map.set(normalizeFsPath(location), name)
  }

  return map
}

function parseDisplayNameFromManifest(content: string): string {
  const displayName = content.match(/<DisplayName>([^<]+)<\/DisplayName>/i)?.[1]?.trim() || ''
  const identityName = content.match(/<Identity[^>]*\sName="([^"]+)"/i)?.[1]?.trim() || ''
  if (displayName && !/^ms-resource:/i.test(displayName)) return displayName
  return identityName
}

async function getManifestDisplayNameHints(xboxRoots: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  for (const root of xboxRoots) {
    if (!await fs.pathExists(root)) continue
    const entries = await safeReadDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const gameDir = path.join(root, entry.name)
      const manifestCandidates = [
        path.join(gameDir, 'AppxManifest.xml'),
        path.join(gameDir, 'Content', 'AppxManifest.xml')
      ]

      for (const manifestPath of manifestCandidates) {
        if (!await fs.pathExists(manifestPath)) continue
        try {
          const content = await fs.readFile(manifestPath, 'utf8')
          const parsedName = parseDisplayNameFromManifest(content)
          if (!parsedName) continue
          map.set(normalizeFsPath(gameDir), normalizeDisplayName(parsedName))
          break
        } catch {
          // ignore manifest read errors
        }
      }
    }
  }

  return map
}

async function scanMicrosoftGames(): Promise<LocalGameScanResult[]> {
  const drives = await getWindowsDriveRoots()
  const roots = drives.map(root => path.join(root, 'XboxGames'))
  const base = await scanFlatPlatformFolder('microsoft', roots)

  const [registryHints, manifestHints] = await Promise.all([
    getRegistryDisplayNameHints(),
    getManifestDisplayNameHints(roots)
  ])
  const hints = new Map<string, string>([...registryHints, ...manifestHints])

  return base.map(game => {
    const hintName = pickBestNameFromHints(game.installDir, hints)
    return hintName ? { ...game, name: hintName } : game
  })
}

export class GameScannerService {
  async scanLocalGamesFromPlatforms(): Promise<LocalGameScanResult[]> {
    if (process.platform !== 'win32') return []
    const drives = await getWindowsDriveRoots()

    const [steam, microsoft, epic, ea] = await Promise.all([
      scanSteamGames(),
      scanMicrosoftGames(),
      scanFlatPlatformFolder('epic', Array.from(new Set(
        drives.flatMap(root => [
          path.join(root, 'Epic Games'),
          path.join(root, 'Program Files', 'Epic Games'),
          path.join(root, 'Program Files (x86)', 'Epic Games')
        ])
      ))),
      scanFlatPlatformFolder('ea', Array.from(new Set(
        drives.flatMap(root => [
          path.join(root, 'EA Games'),
          path.join(root, 'Electronic Arts'),
          path.join(root, 'Program Files', 'EA Games'),
          path.join(root, 'Program Files', 'Electronic Arts'),
          path.join(root, 'Program Files (x86)', 'EA Games'),
          path.join(root, 'Program Files (x86)', 'Electronic Arts')
        ])
      )))
    ])

    const dedup = new Map<string, LocalGameScanResult>()
    for (const game of [...steam, ...microsoft, ...epic, ...ea]) {
      const key = `${game.name.toLowerCase()}|${game.processName.toLowerCase()}`
      if (!dedup.has(key)) dedup.set(key, game)
    }

    return Array.from(dedup.values())
  }

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
