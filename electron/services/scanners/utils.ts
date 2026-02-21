import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import {
  GAME_SCAN_IGNORE_DIR_NAMES,
  GAME_SCAN_IGNORE_EXE_KEYWORDS,
  GAME_SCAN_SOFT_IGNORE_EXE_KEYWORDS,
  GAME_SCAN_EXE_HARD_EXCLUDE,
  ScanProgressCallback
} from './types'

// 调整 libuv 的底层线程池大小，以最大化利用多核 CPU 处理海量并发文件的 I/O
process.env.UV_THREADPOOL_SIZE = String(Math.max(4, os.cpus().length * 2))
const DEFAULT_IO_CONCURRENCY = Math.max(4, Math.min(16, os.cpus().length))
const PICK_EXE_DEPTH_STAGES = [2, 4, 6]
const PICK_EXE_STAT_SAMPLE_LIMIT = 40

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
 * 带并发限制的 map，避免一次性创建大量 I/O 任务导致磁盘抖动。
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number = DEFAULT_IO_CONCURRENCY
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.floor(concurrency))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const run = async () => {
    while (true) {
      const idx = nextIndex
      if (idx >= items.length) return
      nextIndex += 1
      results[idx] = await worker(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run())
  await Promise.all(workers)
  return results
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

function hasSoftIgnoreKeyword(exeName: string) {
  const lower = String(exeName || '').toLowerCase()
  return GAME_SCAN_SOFT_IGNORE_EXE_KEYWORDS.some((k) => lower.includes(k))
}

/**
 * 递归收集目录下的所有 .exe 文件路径
 * @param maxDepth 最大递归深度 (-1 表示无限)
 * @param progressCallback 进度回调
 */
export async function collectExePaths(
  dir: string,
  maxDepth: number,
  currentDepth: number = 1,
  progressCallback?: ScanProgressCallback
): Promise<string[]> {
  const results: string[] = []
  const dirents = await safeReadDir(dir)

  // 性能优化：单层目录文件异常多时直接跳过，防止卡死
  if (dirents.length > 3000) {
    return results
  }

  const subDirs: string[] = []

  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      const folderName = dirent.name.toLowerCase()
      if (GAME_SCAN_IGNORE_DIR_NAMES.has(folderName)) continue
      if (maxDepth === -1 || currentDepth <= maxDepth) {
        subDirs.push(full)
      }
      continue
    }

    if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.exe')) continue
    if (shouldSkipExeByName(dirent.name)) continue
    results.push(full)
  }

  // 多线程/并发处理所有合法的子目录
  if (subDirs.length > 0) {
    const subResults = await mapWithConcurrency(subDirs, async (subDir) => {
      progressCallback?.('scanning_dir', subDir)
      return await collectExePaths(subDir, maxDepth, currentDepth + 1, progressCallback)
    }, DEFAULT_IO_CONCURRENCY)
    for (const sub of subResults) {
      results.push(...sub)
    }
  }

  return results
}

/**
 * 启发式算法：从目录下选择所有像是游戏主进程及相关子程序的可执行文件
 * 
 * 评分规则：
 * - 文件名与文件夹名完全匹配 (+10)
 * - 文件名包含文件夹名 (+6)
 * - 文件夹名包含文件名 (+4)
 * - 不包含 launcher 关键词 (+2)
 * - 包含 shipping, win64, binaries 等关键词 (+4) (针对 UE 等引擎)
 * - 文件体积越大分数越高 (每 40MB +1, 上限 +8)
 */
export async function pickRelatedExecutables(
  gameDir: string,
  displayName: string,
  progressCallback?: ScanProgressCallback
): Promise<string[]> {
  const target = normalizeDisplayName(displayName).toLowerCase()

  const quickScore = (exe: string) => {
    let score = 0
    const base = basenameLower(exe).replace(/\.exe$/, '')
    const full = exe.toLowerCase()

    if (base === target) score += 10
    if (base.includes(target)) score += 6
    if (target.includes(base)) score += 4
    if (!full.includes('launcher')) score += 2

    // 针对虚幻引擎等常见的深层目录特征给予加分
    if (full.includes('shipping') || full.includes('win64') || full.includes('binaries')) {
      score += 4
    }
    // 常见辅助/上报进程做降权，但不直接丢弃，避免误伤真实联动进程。
    if (hasSoftIgnoreKeyword(base)) {
      score -= 3
    }
    return score
  }

  const allExes: string[] = []
  const seen = new Set<string>()
  for (const depth of PICK_EXE_DEPTH_STAGES) {
    const current = await collectExePaths(gameDir, depth, 1, progressCallback)
    for (const exe of current) {
      if (seen.has(exe)) continue
      seen.add(exe)
      allExes.push(exe)
    }

    if (allExes.length === 0) continue
    if (allExes.length >= 8) break
    if (allExes.some(exe => quickScore(exe) >= 10)) break
  }

  if (allExes.length === 0) return []
  if (allExes.length === 1) return [allExes[0]]

  const quickRanked = allExes
    .map(exe => ({ exe, score: quickScore(exe) }))
    .sort((a, b) => b.score - a.score)
  const candidates = quickRanked
    .slice(0, PICK_EXE_STAT_SAMPLE_LIMIT)
    .map(v => v.exe)

  const ranked = await Promise.all(candidates.map(async (exe) => {
    let score = quickScore(exe)

    try {
      const stat = await fs.stat(exe)
      score += Math.min(8, Math.floor((stat.size || 0) / (40 * 1024 * 1024)))
    } catch {
      // ignore stat errors and keep heuristic score
    }

    return { exe, score }
  }))

  ranked.sort((a, b) => b.score - a.score)

  // 选择得分较高的进程（比如前5个，或者得分 > 0 的进程），但至少返回1个（如果是空则前面已经返回了）
  // 加上为了支持子程序，我们把得分最高的，以及所有比较可能的是子程序的也带上。
  // 可以把前3到5个得分最高的 exe 选出来，只要它们不是安装包即可。
  const selected = ranked.filter(r => r.score >= 0).slice(0, 5).map(r => r.exe)
  return selected.length > 0 ? selected : [ranked[0].exe]
}
