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
const DRIVE_DETECT_CONCURRENCY = 16 // 并发探测盘符，避免串行等待 
const PICK_EXE_DEPTH_STAGES = [2, 4, 6] // 深度扫描阶段
const PICK_EXE_STAT_SAMPLE_LIMIT = 24 // 采样统计数量
const PICK_EXE_EARLY_ACCEPT_SCORE = 8 // 早期接受分数
const PICK_EXE_EARLY_ACCEPT_COUNT = 4 // 早期接受数量
const PICK_EXE_DEEP_FALLBACK_DEPTH = 6 // 深度回退深度
const LARGE_DIR_ENTRY_THRESHOLD = 3000 // 大目录条目阈值
const LARGE_DIR_SUBDIR_SCAN_LIMIT = 120 // 大目录子目录扫描限制
const LARGE_DIR_PRIORITY_KEYWORDS = [
  'bin', 'binaries', 'win64', 'win32', 'x64', 'x86',
  'game', 'client', 'release', 'shipping', 'launcher'
]
const PICK_EXE_MIN_SCORE = 2
const PICK_EXE_SCORE_GAP_FROM_BEST = 4

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
 * 解析 PowerShell ConvertTo-Json 输出，兼容数组/单对象/单字符串。
 */
export function parsePowershellJson<T>(raw: string): T[] {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed as T[]
    if (parsed !== null && parsed !== undefined) return [parsed as T]
    return []
  } catch {
    return []
  }
}

/**
 * 进程名去重并统一小写键，保留原始文件名大小写。
 */
export function dedupeProcessNames(names: string[]) {
  const map = new Map<string, string>()
  for (const name of names) {
    const n = String(name || '').trim()
    if (!n) continue
    const key = n.toLowerCase()
    if (!map.has(key)) map.set(key, n)
  }
  return Array.from(map.values())
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
 * 并发探测盘符，避免串行等待。
 */
export async function getWindowsDriveRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  const letters = Array.from({ length: 24 }, (_, idx) => String.fromCharCode(67 + idx))
  const detected = await mapWithConcurrency(letters, async (letter) => {
    const root = `${letter}:\\`
    return await fs.pathExists(root) ? root : ''
  }, DRIVE_DETECT_CONCURRENCY)

  return detected.filter(Boolean)
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
 * 判断进程名是否包含软过滤关键词
 * (在评分阶段降权使用，但不直接跳过)
 * @param exeName 进程名
 * @returns 判断结果
 */
function hasSoftIgnoreKeyword(exeName: string) {
  const lower = String(exeName || '').toLowerCase()
  return GAME_SCAN_SOFT_IGNORE_EXE_KEYWORDS.some((k) => lower.includes(k))
}

/**
 * 针对海量条目大目录结构（如几千文件夹）使用的粗略评分依据
 * 优先关注含二进制或常见游戏存放术语的目录，以便早期扫描
 * @param dirName 目录名
 * @returns 启发式得分
 */
function scoreDirNameForLargeScan(dirName: string) {
  const lower = String(dirName || '').toLowerCase()
  if (!lower) return 0

  let score = 0
  if (LARGE_DIR_PRIORITY_KEYWORDS.some((k) => lower.includes(k))) score += 6
  if (lower.startsWith('bin')) score += 2
  if (lower === 'x64' || lower === 'x86') score += 2
  return score
}

/**
 * 目录扫描队列的任务定义
 */
type DirScanTask = {
  /** 待扫描的目录路径 */
  dir: string
  /** 该目录在扫描过程中的层级深度 */
  depth: number
}

/**
 * 收集目录下的所有 .exe 文件路径（迭代扫描，避免递归栈开销）
 * @param maxDepth 最大扫描深度 (-1 表示无限)
 * @param progressCallback 进度回调
 */
export async function collectExePaths(
  dir: string,
  maxDepth: number,
  currentDepth: number = 1,
  progressCallback?: ScanProgressCallback
): Promise<string[]> {
  const results: string[] = []
  const pending: DirScanTask[] = [{ dir, depth: currentDepth }]
  const visited = new Set<string>()

  const workerCount = Math.max(1, Math.min(DEFAULT_IO_CONCURRENCY, pending.length || DEFAULT_IO_CONCURRENCY))

  const run = async () => {
    while (true) {
      const task = pending.shift()
      if (!task) return

      const normalizedTaskDir = normalizeFsPath(task.dir)
      if (visited.has(normalizedTaskDir)) continue
      visited.add(normalizedTaskDir)

      const dirents = await safeReadDir(task.dir)
      const isLargeDir = dirents.length > LARGE_DIR_ENTRY_THRESHOLD
      const subDirs: Array<{ fullPath: string, score: number }> = []

      for (const dirent of dirents) {
        const full = path.join(task.dir, dirent.name)
        if (dirent.isDirectory()) {
          const folderName = dirent.name.toLowerCase()
          if (GAME_SCAN_IGNORE_DIR_NAMES.has(folderName)) continue
          if (maxDepth === -1 || task.depth < maxDepth) {
            subDirs.push({
              fullPath: full,
              score: scoreDirNameForLargeScan(dirent.name)
            })
          }
          continue
        }

        if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.exe')) continue
        if (shouldSkipExeByName(dirent.name)) continue
        results.push(full)
      }

      const selectedSubDirs = isLargeDir && subDirs.length > LARGE_DIR_SUBDIR_SCAN_LIMIT
        ? subDirs
          .sort((a, b) => b.score - a.score || a.fullPath.localeCompare(b.fullPath))
          .slice(0, LARGE_DIR_SUBDIR_SCAN_LIMIT)
          .map(v => v.fullPath)
        : subDirs.map(v => v.fullPath)

      for (const subDir of selectedSubDirs) {
        progressCallback?.('scanning_dir', subDir)
        pending.push({ dir: subDir, depth: task.depth + 1 })
      }
    }
  }

  const workers = Array.from({ length: workerCount }, () => run())
  await Promise.all(workers)

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
    if (allExes.length >= PICK_EXE_EARLY_ACCEPT_COUNT) break
    if (allExes.some(exe => quickScore(exe) >= PICK_EXE_EARLY_ACCEPT_SCORE)) break
  }

  if (allExes.length === 0) {
    // 仅在浅层完全找不到 exe 时才深扫，避免对每个游戏都做重 I/O。
    const deepFallback = await collectExePaths(gameDir, PICK_EXE_DEEP_FALLBACK_DEPTH, 1, progressCallback)
    for (const exe of deepFallback) {
      if (seen.has(exe)) continue
      seen.add(exe)
      allExes.push(exe)
    }
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

  const bestScore = ranked[0]?.score ?? 0
  const scoreFloor = Math.max(PICK_EXE_MIN_SCORE, bestScore - PICK_EXE_SCORE_GAP_FROM_BEST)
  const selected = ranked
    .filter(r => r.score >= scoreFloor)
    .slice(0, 4)
    .map(r => r.exe)

  return selected.length > 0 ? selected : [ranked[0].exe]
}
