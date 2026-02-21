import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import fs from 'fs-extra'
import { getWindowsDriveRoots, mapWithConcurrency, normalizeDisplayName, normalizeFsPath, pickRelatedExecutables, safeReadDir } from './utils'

const WEGAME_CONTAINER_DIRS = new Set(['rail_apps', 'common_apps', 'apps', 'games'])
const WEGAME_NON_GAME_DIRS = new Set(['rail_apps', 'common_apps', 'app', 'apps', 'cache', 'logs', 'temp', 'patch'])

/**
 * 扫描腾讯 WeGame 游戏
 */
export async function scanWeGameGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
    progressCallback?.('scanning_platform', 'WeGame')
    const results: LocalGameScanResult[] = []
    const dedup = new Map<string, LocalGameScanResult>()

    const drives = await getWindowsDriveRoots()
    const candidateRoots = Array.from(new Set(drives.flatMap(root => [
        path.join(root, 'WeGameApps'),
        path.join(root, 'WeGameApp'),
        path.join(root, 'Tencent', 'WeGame', 'apps'),
        path.join(root, 'Program Files', 'Tencent', 'WeGame', 'apps'),
        path.join(root, 'Program Files (x86)', 'Tencent', 'WeGame', 'apps'),
        path.join(root, 'Program Files', 'WeGameApps'),
        path.join(root, 'Program Files (x86)', 'WeGameApps')
    ])))

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
                processName: exes.map(e => path.basename(e)),
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

    results.push(...dedup.values())
    return results
}
