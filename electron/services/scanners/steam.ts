import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult } from './types'
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
    const libraryVdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
    if (!await fs.pathExists(libraryVdf)) continue

    libs.add(path.normalize(steamRoot))
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
      console.warn('[GameScan] Failed to parse Steam libraryfolders.vdf:', e)
    }
  }

  return Array.from(libs)
}

function parseAcfValue(content: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`"${escaped}"\\s+"([^"]*)"`, 'i'))
  return (match?.[1] || '').replace(/\\\\/g, '\\').trim()
}

async function scanSteamFromManifests(libRoot: string): Promise<LocalGameScanResult[]> {
  const results: LocalGameScanResult[] = []
  const steamAppsDir = path.join(libRoot, 'steamapps')
  if (!await fs.pathExists(steamAppsDir)) return results

  const entries = await safeReadDir(steamAppsDir)
  const manifestFiles = entries.filter(entry => entry.isFile() && /^appmanifest_\d+\.acf$/i.test(entry.name))

  for (const manifest of manifestFiles) {
    const manifestPath = path.join(steamAppsDir, manifest.name)
    try {
      const content = await fs.readFile(manifestPath, 'utf8')
      const appName = parseAcfValue(content, 'name')
      const installFolder = parseAcfValue(content, 'installdir')
      if (!installFolder) continue

      const installDir = path.join(steamAppsDir, 'common', installFolder)
      if (!await fs.pathExists(installDir)) continue

      const displayName = normalizeDisplayName(appName || installFolder)
      const exes = await pickRelatedExecutables(installDir, displayName)
      if (!exes || exes.length === 0) continue

      results.push({
        name: displayName,
        processName: exes.map(e => path.basename(e)),
        source: 'Steam',
        installDir
      })
    } catch {
      // ignore malformed appmanifest
    }
  }

  return results
}

/**
 * 扫描 Steam 游戏
 * 优先使用 appmanifest 解析，兜底扫描 common 目录
 */
export async function scanSteamGames(): Promise<LocalGameScanResult[]> {
  const roots = await readSteamLibraryRoots()
  const results: LocalGameScanResult[] = []
  const dedup = new Map<string, LocalGameScanResult>()

  for (const libRoot of roots) {
    const manifestResults = await scanSteamFromManifests(libRoot)
    for (const game of manifestResults) {
      dedup.set(normalizeFsPath(game.installDir), game)
    }

    const commonDir = path.join(libRoot, 'steamapps', 'common')
    if (!await fs.pathExists(commonDir)) continue

    const games = await safeReadDir(commonDir)
    for (const entry of games) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(commonDir, entry.name)
      if (dedup.has(normalizeFsPath(installDir))) continue
      const exes = await pickRelatedExecutables(installDir, entry.name)
      if (!exes || exes.length === 0) continue
      dedup.set(normalizeFsPath(installDir), {
        name: normalizeDisplayName(entry.name),
        processName: exes.map(e => path.basename(e)),
        source: 'Steam',
        installDir
      })
    }
  }

  results.push(...dedup.values())
  return results
}
