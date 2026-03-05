import fs from 'fs-extra'
import path from 'path'
import { LocalGameScanResult, ScanProgressCallback } from './types'
import { dedupeProcessNames, getWindowsDriveRoots, mapWithConcurrency, normalizeDisplayName, normalizeFsPath, parsePowershellJson, safeReadDir, pickRelatedExecutables } from './utils'
import { runCommand } from '../../utils/command'
import { scanFlatPlatformFolder } from './flat'

/**
 * 根据注册表或 Manifest 提供的提示信息，优化游戏名称
 * @param installDir 游戏安装目录
 * @param hints 注册或解析来的名录库
 * @returns 最接近真实名字字串或空
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
 * 从 Windows 注册表中获取已安装软件的名称和安装路径映射
 * @returns 包名定位和本地全量索引哈希名库
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
 * @param content Application Manifest 文本
 * @returns 暴露出来的主观标识名字
 */
function parseDisplayNameFromManifest(content: string): string {
  const displayName = content.match(/<DisplayName>([^<]+)<\/DisplayName>/i)?.[1]?.trim() || ''
  const identityName = content.match(/<Identity[^>]*\sName="([^"]+)"/i)?.[1]?.trim() || ''
  if (displayName && !/^ms-resource:/i.test(displayName)) return displayName
  return identityName
}

/**
 * 从 XboxGames 目录下的 AppxManifest.xml 解析游戏名称
 * @param xboxRoots Xbox 默认多盘加载外设口
 * @returns { 安装基础包索引 -> 主游戏展示字向 }
 */
async function getManifestDisplayNameHints(xboxRoots: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  const rootBatches = await mapWithConcurrency(xboxRoots, async (root) => {
    if (!await fs.pathExists(root)) return [] as Array<{ installDir: string, name: string }>
    const entries = await safeReadDir(root)

    const rows = await mapWithConcurrency(entries, async (entry) => {
      if (!entry.isDirectory()) return null
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
          return { installDir: gameDir, name: normalizeDisplayName(parsedName) }
        } catch {
          // ignore manifest read errors
        }
      }

      return null
    }, 6)

    return rows.filter(Boolean) as Array<{ installDir: string, name: string }>
  }, 4)

  for (const batch of rootBatches) {
    for (const row of batch) {
      map.set(normalizeFsPath(row.installDir), row.name)
    }
  }

  return map
}

/**
 * 扫描 UWP / 已安装的 AppxPackages
 * @param progressCallback 透传加载回溯日志流
 * @returns 分析出标准列表输出
 */
async function scanAppxPackages(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  if (process.platform !== 'win32') return []

  const script = "Get-AppxPackage | Where-Object { $_.InstallLocation } | Select-Object Name, InstallLocation | ConvertTo-Json -Compress"
  const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 15000)
  if (code !== 0 || !output) return []

  const rows = parsePowershellJson<{ Name?: string, InstallLocation?: string }>(output)

  const scanned = await mapWithConcurrency(rows, async (row) => {
    const packageName = String(row.Name || '').trim()
    const location = String(row.InstallLocation || '').trim()
    if (!packageName || !location) return null

    const manifestPath = path.join(location, 'AppxManifest.xml')
    if (!await fs.pathExists(manifestPath)) return null
    progressCallback?.('scanning_dir', location)

    try {
      const content = await fs.readFile(manifestPath, 'utf8')
      const isGame = content.includes('Category="public.app-category.games"') ||
        content.includes('<Category>games</Category>') ||
        content.includes('Executable="GameLaunchHelper.exe"') ||
        content.includes('TargetDeviceFamily Name="Windows.Xbox"') ||
        /(Forza|Minecraft|Halo|AgeOf|SeaOf|FlightSim|StateOfDecay|Gears)/i.test(packageName)

      if (!isGame) return null

      const parsedName = parseDisplayNameFromManifest(content) || packageName
      const exes = await pickRelatedExecutables(location, parsedName, progressCallback)
      if (!exes || exes.length === 0) return null

      return {
        name: normalizeDisplayName(parsedName),
        processName: dedupeProcessNames(exes.map(e => path.basename(e))),
        source: 'Microsoft' as const,
        installDir: location
      } as LocalGameScanResult
    } catch {
      return null
    }
  }, 6)

  return scanned.filter(Boolean) as LocalGameScanResult[]
}

/**
 * 扫描 Microsoft Store / Xbox 游戏
 * 结合目录扫描、注册表和 AppxManifest 信息来获取准确的游戏名称
 */
export async function scanMicrosoftGames(progressCallback?: ScanProgressCallback): Promise<LocalGameScanResult[]> {
  progressCallback?.('scanning_platform', 'Microsoft')
  const drives = await getWindowsDriveRoots()
  const roots = drives.map(root => path.join(root, 'XboxGames'))

  const [base, appxBase] = await Promise.all([
    scanFlatPlatformFolder('Microsoft', roots, progressCallback),
    scanAppxPackages(progressCallback)
  ])

  const uniqueGames = new Map<string, LocalGameScanResult>()
  for (const game of [...base, ...appxBase]) {
    const key = normalizeFsPath(game.installDir)
    const prev = uniqueGames.get(key)

    if (!prev) {
      uniqueGames.set(key, {
        ...game,
        processName: dedupeProcessNames(game.processName)
      })
      continue
    }

    uniqueGames.set(key, {
      ...prev,
      name: prev.name.length >= game.name.length ? prev.name : game.name,
      processName: dedupeProcessNames([...prev.processName, ...game.processName])
    })
  }
  const mergedBase = Array.from(uniqueGames.values())

  const [registryHints, manifestHints] = await Promise.all([
    getRegistryDisplayNameHints(),
    getManifestDisplayNameHints(roots)
  ])
  const hints = new Map<string, string>([...registryHints, ...manifestHints])

  return mergedBase.map(game => {
    const hintName = pickBestNameFromHints(game.installDir, hints)
    return hintName ? { ...game, name: hintName } : game
  })
}
