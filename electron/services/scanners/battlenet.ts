import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { getWindowsDriveRoots, normalizeFsPath } from './utils'
import { scanFlatPlatformFolder } from './flat'

/**
 * 扫描战网 Battle.net 游戏
 */
export async function scanBattleNetGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
    progressCallback?.('scanning_platform', 'BattleNet')
    const results: LocalGameScanResult[] = []
    const dedup = new Map<string, LocalGameScanResult>()

    const drives = await getWindowsDriveRoots()
    const candidateRoots = Array.from(new Set(drives.flatMap(root => [
        path.join(root, 'Program Files (x86)', 'Battle.net'),
        path.join(root, 'Program Files', 'Battle.net'),
        path.join(root, 'Program Files (x86)'),
        path.join(root, 'Program Files'),
        path.join(root, 'Games'),
        path.join(root, 'Game')
    ])))

    // 由于战网游戏通常直接放在 Program Files 或者 Games 下面（如 World of Warcraft, Overwatch）
    // 我们可以通过寻找特定的包含 .build.info 的目录来精确打标，或者直接依赖 flatScan 后续配合名称匹配
    // 这里直接使用 flatScan 寻找，因为 utils 里的 heuristics 能够挑选出 exe
    // 但为了避免把大量非战网游戏标为 BattleNet，我们进行过滤
    const flatResults = await scanFlatPlatformFolder('BattleNet', candidateRoots, progressCallback)
    const battleNetGameNames = ['world of warcraft', 'overwatch', 'diablo', 'starcraft', 'hearthstone', 'heroes of the storm', 'call of duty']

    for (const game of flatResults) {
        const isBattleNetGame = battleNetGameNames.some(name => game.name.toLowerCase().includes(name))
        if (isBattleNetGame && !dedup.has(normalizeFsPath(game.installDir))) {
            dedup.set(normalizeFsPath(game.installDir), game)
        }
    }

    results.push(...dedup.values())
    return results
}
