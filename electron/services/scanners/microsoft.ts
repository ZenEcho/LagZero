import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult } from './types'
import { getWindowsDriveRoots, normalizeDisplayName, normalizeFsPath, safeReadDir } from './utils'
import { runCommand } from '../../utils/command'
import { scanFlatPlatformFolder } from './flat'

/**
 * 根据注册表或 Manifest 提供的提示信息，优化游戏名称
 */
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

/**
 * 解析 PowerShell 返回的 JSON 字符串
 */
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

/**
 * 从 Windows 注册表中获取已安装软件的名称和安装路径映射
 */
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

/**
 * 从 AppxManifest.xml 内容中提取显示名称
 */
function parseDisplayNameFromManifest(content: string): string {
  const displayName = content.match(/<DisplayName>([^<]+)<\/DisplayName>/i)?.[1]?.trim() || ''
  const identityName = content.match(/<Identity[^>]*\sName="([^"]+)"/i)?.[1]?.trim() || ''
  if (displayName && !/^ms-resource:/i.test(displayName)) return displayName
  return identityName
}

/**
 * 从 XboxGames 目录下的 AppxManifest.xml 解析游戏名称
 */
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

/**
 * 扫描 Microsoft Store / Xbox 游戏
 * 结合目录扫描、注册表和 AppxManifest 信息来获取准确的游戏名称
 */
export async function scanMicrosoftGames(): Promise<LocalGameScanResult[]> {
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
