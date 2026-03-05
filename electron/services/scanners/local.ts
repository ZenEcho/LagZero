import { shell } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { dedupeProcessNames, mapWithConcurrency, normalizeDisplayName, pickRelatedExecutables, shouldSkipExeByName } from './utils'

/**
 * 特定指向系统级核心与工具的捷径配置黑名单关键字，过滤误扫
 */
const LOCAL_SHORTCUT_SKIP_TARGET_KEYWORDS = [
  'code.exe',
  '\\system32\\',
  '\\windows\\',
  '\\microsoft office\\',
  '\\office\\'
]

/**
 * 读取本地快捷方式 (.lnk) 识别独立游戏
 */
export async function scanLocalShortcuts(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'Local')
  if (process.platform !== 'win32') return []

  const dedup = new Set<string>()

  const dirsToScan = [
    path.join(os.homedir(), 'Desktop'),
    path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ]

  const lnkFiles: string[] = []

  async function collectLnks(dir: string, depth = 0) {
    if (depth > 3) return
    if (!await fs.pathExists(dir)) return
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })
      await mapWithConcurrency(items, async (item) => {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          progressCallback?.('scanning_dir', fullPath)
          await collectLnks(fullPath, depth + 1)
        } else if (item.isFile() && item.name.toLowerCase().endsWith('.lnk')) {
          lnkFiles.push(fullPath)
        }
      }, 6)
    } catch {
      // ignore
    }
  }

  await mapWithConcurrency(dirsToScan, async (dir) => {
    await collectLnks(dir)
    return true
  }, 4)

  const parsedResults = await mapWithConcurrency(lnkFiles, async (lnk) => {
    try {
      const shortcut = shell.readShortcutLink(lnk)
      const target = String(shortcut.target || '').trim()
      if (!target || !target.toLowerCase().endsWith('.exe')) return null
      if (shouldSkipExeByName(path.basename(target))) return null

      const lowerTarget = target.toLowerCase()
      if (LOCAL_SHORTCUT_SKIP_TARGET_KEYWORDS.some(k => lowerTarget.includes(k))) return null
      if (!await fs.pathExists(target)) return null

      const installDir = path.dirname(target)
      const exeKey = target.toLowerCase()
      if (dedup.has(exeKey)) return null
      dedup.add(exeKey)

      let displayName = normalizeDisplayName(path.basename(lnk, '.lnk'))
      if (!displayName) displayName = normalizeDisplayName(path.basename(installDir))

      let processNames = [path.basename(target)]
      try {
        const exes = await pickRelatedExecutables(installDir, displayName, progressCallback)
        if (exes && exes.length > 0) {
          processNames = dedupeProcessNames([...processNames, ...exes.map(e => path.basename(e))])
        }
      } catch {
        // ignore
      }

      return {
        name: displayName,
        processName: processNames,
        source: 'Local' as const,
        installDir
      } as LocalGameScanResult
    } catch {
      return null
    }
  }, 8)

  return parsedResults.filter(Boolean) as LocalGameScanResult[]
}
