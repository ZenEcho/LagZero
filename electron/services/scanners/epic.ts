import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { getWindowsDriveRoots, normalizeDisplayName, normalizeFsPath, pickRelatedExecutables, safeReadDir } from './utils'
import { scanFlatPlatformFolder } from './flat'

/**
 * 扫描 Epic Games
 * 优先读取 %ProgramData%/Epic/EpicGamesLauncher/Data/Manifests 下的配置
 * 兜底扫描常见 Epic 游戏目录
 */
export async function scanEpicGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
    progressCallback?.('scanning_platform', 'Epic')
    const results: LocalGameScanResult[] = []
    const dedup = new Map<string, LocalGameScanResult>()

    // 1. 从 Manifests 文件夹读取
    const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
    const manifestDir = path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')

    if (await fs.pathExists(manifestDir)) {
        const files = await safeReadDir(manifestDir)
        for (const file of files) {
            if (file.isFile() && file.name.endsWith('.item')) {
                try {
                    const content = await fs.readJSON(path.join(manifestDir, file.name))
                    if (content.InstallLocation && content.DisplayName) {
                        const installDir = path.normalize(content.InstallLocation)
                        if (await fs.pathExists(installDir)) {
                            const displayName = normalizeDisplayName(content.DisplayName)
                            progressCallback?.('scanning_dir', installDir)
                            const exes = await pickRelatedExecutables(installDir, displayName, progressCallback)
                            if (exes && exes.length > 0) {
                                const game: LocalGameScanResult = {
                                    name: displayName,
                                    processName: exes.map(e => path.basename(e)),
                                    source: 'Epic',
                                    installDir
                                }
                                dedup.set(normalizeFsPath(installDir), game)
                            }
                        }
                    }
                } catch (e) {
                    // ignore parse error
                }
            }
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
        if (!dedup.has(normalizeFsPath(game.installDir))) {
            dedup.set(normalizeFsPath(game.installDir), game)
        }
    }

    results.push(...dedup.values())
    return results
}
