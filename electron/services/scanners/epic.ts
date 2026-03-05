import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { dedupeProcessNames, getWindowsDriveRoots, mapWithConcurrency, normalizeDisplayName, normalizeFsPath, pickRelatedExecutables, safeReadDir } from './utils'
import { scanFlatPlatformFolder } from './flat'

/**
 * Epic 游戏 Manifest 数据文件中的必要字段定义
 */
type EpicManifestItem = {
  InstallLocation?: string
  DisplayName?: string
  LaunchExecutable?: string
  AppName?: string
}

/**
 * 扫描 Epic Games
 * 优先读取 %ProgramData%/Epic/EpicGamesLauncher/Data/Manifests 下的配置
 * 兜底扫描常见 Epic 游戏目录
 */
export async function scanEpicGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'Epic')
  const dedup = new Map<string, LocalGameScanResult>()

  // 1. 从 Manifests 文件夹读取
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
  const manifestDir = path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')

  if (await fs.pathExists(manifestDir)) {
    const files = await safeReadDir(manifestDir)
    const manifestFiles = files.filter(file => file.isFile() && file.name.endsWith('.item'))

    const parsed = await mapWithConcurrency(manifestFiles, async (file) => {
      try {
        const content = await fs.readJSON(path.join(manifestDir, file.name)) as EpicManifestItem
        const installLocation = String(content.InstallLocation || '').trim()
        const displayNameRaw = String(content.DisplayName || content.AppName || '').trim()
        if (!installLocation || !displayNameRaw) return null

        const installDir = path.normalize(installLocation)
        if (!await fs.pathExists(installDir)) return null
        const displayName = normalizeDisplayName(displayNameRaw)

        progressCallback?.('scanning_dir', installDir)

        const launchExeRaw = String(content.LaunchExecutable || '').trim()
        const launchExePath = launchExeRaw ? path.join(installDir, launchExeRaw) : ''
        const hasLaunchExe = launchExePath && await fs.pathExists(launchExePath)

        let processNames: string[] = []
        if (hasLaunchExe) {
          processNames = [path.basename(launchExePath)]
        }

        const exes = await pickRelatedExecutables(installDir, displayName, progressCallback)
        if (exes && exes.length > 0) {
          processNames = dedupeProcessNames([...processNames, ...exes.map(e => path.basename(e))])
        }

        if (processNames.length === 0) return null

        return {
          name: displayName,
          processName: processNames,
          source: 'Epic' as const,
          installDir
        } as LocalGameScanResult
      } catch {
        return null
      }
    }, 8)

    for (const game of parsed) {
      if (!game) continue
      dedup.set(normalizeFsPath(game.installDir), game)
    }
  }

  // 2. 兜底扫描常见目录
  const drives = await getWindowsDriveRoots()
  const candidateRoots = Array.from(new Set(drives.flatMap(root => [
    path.join(root, 'Epic Games'),
    path.join(root, 'Program Files', 'Epic Games'),
    path.join(root, 'Program Files (x86)', 'Epic Games'),
    path.join(root, 'Games', 'Epic Games'),
    path.join(root, 'Game', 'Epic Games')
  ])))

  const flatResults = await scanFlatPlatformFolder('Epic', candidateRoots, progressCallback)
  for (const game of flatResults) {
    const key = normalizeFsPath(game.installDir)
    if (!dedup.has(key)) {
      dedup.set(key, game)
    }
  }
  return Array.from(dedup.values())
}

