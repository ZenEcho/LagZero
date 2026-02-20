import fs from 'fs-extra'
import path from 'path'
import { GAME_SCAN_IGNORE_DIR_NAMES, GAME_SCAN_IGNORE_EXE_KEYWORDS, GAME_SCAN_EXE_HARD_EXCLUDE } from './types'

/**
 * 标准化游戏显示名称
 * 去除下划线、多余空格等
 */
export function normalizeDisplayName(name: string) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 标准化文件系统路径
 * 统一分隔符、转小写、去除尾部斜杠
 */
export function normalizeFsPath(p: string) {
  return path.normalize(p).replace(/[\\\/]+$/, '').toLowerCase()
}

/**
 * 安全地读取目录内容
 * 遇到错误时返回空数组而不是抛出异常
 */
export async function safeReadDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * 获取 Windows 系统下的所有驱动器根目录 (C:\, D:\, ...)
 */
export async function getWindowsDriveRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const roots: string[] = []
  for (let i = 67; i <= 90; i += 1) {
    const letter = String.fromCharCode(i)
    const root = `${letter}:\\`
    if (await fs.pathExists(root)) roots.push(root)
  }
  return roots
}

/**
 * 获取路径的基本名称（小写）
 */
export function basenameLower(p: string) {
  return path.basename(p).toLowerCase()
}

/**
 * 判断是否应跳过该可执行文件
 */
export function shouldSkipExeByName(exeName: string) {
  const lower = exeName.toLowerCase()
  if (!lower.endsWith('.exe')) return true
  if (GAME_SCAN_EXE_HARD_EXCLUDE.has(lower)) return true
  return GAME_SCAN_IGNORE_EXE_KEYWORDS.some(k => lower.includes(k))
}

/**
 * 递归收集目录下的所有 .exe 文件路径
 * @param maxDepth 最大递归深度 (-1 表示无限)
 */
export async function collectExePaths(dir: string, maxDepth: number, currentDepth: number = 1): Promise<string[]> {
  const results: string[] = []
  const dirents = await safeReadDir(dir)

  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      const folderName = dirent.name.toLowerCase()
      if (GAME_SCAN_IGNORE_DIR_NAMES.has(folderName)) continue
      if (maxDepth === -1 || currentDepth < maxDepth) {
        const sub = await collectExePaths(full, maxDepth, currentDepth + 1)
        results.push(...sub)
      }
      continue
    }

    if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.exe')) continue
    if (shouldSkipExeByName(dirent.name)) continue
    results.push(full)
  }

  return results
}

/**
 * 启发式算法：从目录下选择最像是游戏主进程的可执行文件
 * 
 * 评分规则：
 * - 文件名与文件夹名完全匹配 (+10)
 * - 文件名包含文件夹名 (+6)
 * - 文件夹名包含文件名 (+4)
 * - 不包含 launcher 关键词 (+2)
 * - 文件体积越大分数越高 (每 40MB +1, 上限 +8)
 */
export async function pickBestExecutable(gameDir: string, displayName: string): Promise<string | null> {
  const exes = await collectExePaths(gameDir, 3)
  if (exes.length === 0) return null
  if (exes.length === 1) return exes[0] || null

  const target = normalizeDisplayName(displayName).toLowerCase()
  const ranked = await Promise.all(exes.map(async (exe) => {
    let score = 0
    const base = basenameLower(exe).replace(/\.exe$/, '')
    const full = exe.toLowerCase()

    if (base === target) score += 10
    if (base.includes(target)) score += 6
    if (target.includes(base)) score += 4
    if (!full.includes('launcher')) score += 2

    try {
      const stat = await fs.stat(exe)
      score += Math.min(8, Math.floor((stat.size || 0) / (40 * 1024 * 1024)))
    } catch {
      // ignore stat errors and keep heuristic score
    }

    return { exe, score }
  }))

  ranked.sort((a, b) => b.score - a.score)
  return ranked[0]?.exe || null
}
