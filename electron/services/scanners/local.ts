import { shell } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { normalizeDisplayName, pickRelatedExecutables, shouldSkipExeByName } from './utils'

/**
 * 读取本地快捷方式 (.lnk) 识别独立游戏
 */
export async function scanLocalShortcuts(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
    progressCallback?.('scanning_platform', 'Local')
    if (process.platform !== 'win32') return []

    const results: LocalGameScanResult[] = []
    const dedup = new Set<string>()

    const dirsToScan = [
        path.join(os.homedir(), 'Desktop'),
        path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'),
        path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ]

    const lnkFiles: string[] = []

    // 递归收集 .lnk 文件 (Start Menu 有多层目录)
    async function collectLnks(dir: string, depth = 0) {
        if (depth > 3) return
        if (!await fs.pathExists(dir)) return
        try {
            const items = await fs.readdir(dir, { withFileTypes: true })
            const tasks = items.map(async (item) => {
                const fullPath = path.join(dir, item.name)
                if (item.isDirectory()) {
                    progressCallback?.('scanning_dir', fullPath)
                    await collectLnks(fullPath, depth + 1)
                } else if (item.isFile() && item.name.toLowerCase().endsWith('.lnk')) {
                    lnkFiles.push(fullPath)
                }
            })
            await Promise.all(tasks)
        } catch { }
    }

    const collectTasks = dirsToScan.map(dir => collectLnks(dir))
    await Promise.all(collectTasks)

    // 并行解析 lnk
    const parseTasks = lnkFiles.map(async (lnk) => {
        try {
            const shortcut = shell.readShortcutLink(lnk)
            const target = shortcut.target

            if (!target || !target.toLowerCase().endsWith('.exe')) return null
            if (shouldSkipExeByName(path.basename(target))) return null

            // 额外的：过滤掉知名非游戏软件 (如 Chrome, Edge, 办公软件等)
            const lowerTarget = target.toLowerCase()
            if (lowerTarget.includes('chrome.exe') ||
                lowerTarget.includes('msedge.exe') ||
                lowerTarget.includes('code.exe') ||
                lowerTarget.includes('office') ||
                lowerTarget.includes('system32')) {
                return null
            }

            if (!await fs.pathExists(target)) return null

            const installDir = path.dirname(target)
            const exeKey = target.toLowerCase()

            // 此处由于并非完全同步，使用 Set 进行去重可能有极小并发覆盖可能，但可以接受，都在最后过滤
            if (dedup.has(exeKey)) return null
            dedup.add(exeKey)

            // 解析名字：使用快捷方式的名字，去掉后缀
            let displayName = path.basename(lnk, '.lnk')
            displayName = normalizeDisplayName(displayName)

            // 使用 pickRelatedExecutables 获取更完整的主进程列表，但确保 target 本身被包含
            let processNames = [path.basename(target)]
            try {
                const exes = await pickRelatedExecutables(installDir, displayName, progressCallback)
                if (exes && exes.length > 0) {
                    processNames = Array.from(new Set([...processNames, ...exes.map(e => path.basename(e))]))
                }
            } catch { }

            return {
                name: displayName,
                processName: processNames,
                source: 'Local',
                installDir
            } as LocalGameScanResult
        } catch (e) {
            return null
        }
    })

    const parsedResults = await Promise.all(parseTasks)
    for (const res of parsedResults) {
        if (res !== null) results.push(res)
    }

    return results
}
