import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { getWindowsDriveRoots, normalizeFsPath } from './utils'
import { scanFlatPlatformFolder } from './flat'
import { runCommand } from '../../utils/command'
import fs from 'fs-extra'
import { normalizeDisplayName, pickRelatedExecutables } from './utils'

const EA_LAUNCHER_NAME_KEYWORDS = ['ea app', 'ea desktop', 'origin']
const EA_LAUNCHER_DIR_KEYWORDS = ['ea desktop', 'electronic arts\\ea desktop', '\\origin']

function isEALauncherEntry(name: string, installDir: string): boolean {
    const lowerName = name.toLowerCase()
    const lowerDir = installDir.toLowerCase()
    return EA_LAUNCHER_NAME_KEYWORDS.some(k => lowerName.includes(k)) ||
        EA_LAUNCHER_DIR_KEYWORDS.some(k => lowerDir.includes(k))
}

/**
 * 获取 EA/Origin 游戏的注册表安装路径
 */
async function getEARegistryInstalls(): Promise<string[]> {
    const dirs: string[] = []
    if (process.platform !== 'win32') return dirs

    try {
        const script = `
    $paths = @()
    $keys = @(
      "HKLM:\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Games",
      "HKLM:\\SOFTWARE\\Electronic Arts\\EA Games"
    )
    foreach ($key in $keys) {
      if (Test-Path $key) {
        $subkeys = Get-ChildItem -Path $key -ErrorAction SilentlyContinue
        foreach ($subkey in $subkeys) {
          $installDir = (Get-ItemProperty -Path $subkey.PSPath -Name "Install Dir" -ErrorAction SilentlyContinue)."Install Dir"
          if ($installDir) {
            $paths += $installDir
          }
        }
      }
    }
    $paths | ConvertTo-Json -Compress
    `
        const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 6000)
        if (code === 0 && output) {
            const text = output.trim()
            if (text) {
                const parsed = text.startsWith('[') ? JSON.parse(text) : [text.replace(/^"|"$/g, '')]
                dirs.push(...parsed)
            }
        }
    } catch (e) {
        // ignore
    }
    return dirs.map(d => path.normalize(d.trim())).filter(d => Boolean(d))
}

/**
 * 从卸载注册表读取 EA 游戏安装目录与名称
 */
async function getEAUninstallHints(): Promise<Array<{ name: string, installDir: string }>> {
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
        const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 8000)
        if (code !== 0 || !output) return []
        const text = output.trim()
        const rows = text.startsWith('[') ? JSON.parse(text) : [JSON.parse(text)]
        return rows
            .map((row: any) => ({
                name: String(row?.DisplayName || '').trim(),
                installDir: path.normalize(String(row?.InstallLocation || '').trim())
            }))
            .filter((row: any) => row.name && row.installDir)
    } catch {
        return []
    }
}

/**
 * 扫描 EA Games
 * 通过读取注册表以及扫描常见目录来发现 EA 游戏
 */
export async function scanEAGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
    progressCallback?.('scanning_platform', 'EA')
    const results: LocalGameScanResult[] = []
    const dedup = new Map<string, LocalGameScanResult>()

    // 1. 通过注册表扫描
    const regDirs = await getEARegistryInstalls()
    for (const dir of regDirs) {
        if (await fs.pathExists(dir)) {
            const folderName = path.basename(dir)
            if (isEALauncherEntry(folderName, dir)) continue
            progressCallback?.('scanning_dir', dir)
            const displayName = normalizeDisplayName(folderName)
            const exes = await pickRelatedExecutables(dir, displayName, progressCallback)
            if (exes && exes.length > 0) {
                const game: LocalGameScanResult = {
                    name: displayName,
                    processName: exes.map(e => path.basename(e)),
                    source: 'EA',
                    installDir: dir
                }
                dedup.set(normalizeFsPath(dir), game)
            }
        }
    }

    // 1.1 通过卸载注册表补充（EA App 常见来源）
    const uninstallHints = await getEAUninstallHints()
    for (const hint of uninstallHints) {
        if (isEALauncherEntry(hint.name, hint.installDir)) continue
        if (!await fs.pathExists(hint.installDir)) continue
        progressCallback?.('scanning_dir', hint.installDir)
        const displayName = normalizeDisplayName(hint.name || path.basename(hint.installDir))
        const exes = await pickRelatedExecutables(hint.installDir, displayName, progressCallback)
        if (!exes || exes.length === 0) continue
        const key = normalizeFsPath(hint.installDir)
        if (!dedup.has(key)) {
            dedup.set(key, {
                name: displayName,
                processName: exes.map(e => path.basename(e)),
                source: 'EA',
                installDir: hint.installDir
            })
        }
    }

    // 2. 兜底常见目录扫描
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

    const flatResults = await scanFlatPlatformFolder('EA', candidateRoots, progressCallback)
    for (const game of flatResults) {
        if (isEALauncherEntry(game.name, game.installDir)) continue
        const key = normalizeFsPath(game.installDir)
        if (!dedup.has(key)) dedup.set(key, game)
    }

    results.push(...dedup.values())
    return results
}
