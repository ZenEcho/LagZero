import DatabaseConstructor from 'better-sqlite3'
import fs from 'fs-extra'
import path from 'node:path'

const DEFAULT_BOOTSTRAP_CATEGORY_NAMES = new Set([
  'Other',
  'FPS',
  'MOBA',
  'RPG',
  'Racing',
  'Sports',
  'Strategy',
  'Survival'
])

const DEFAULT_BOOTSTRAP_GAME_NAMES = new Set([
  '加速海外游戏',
  '加速全部游戏'
])

export interface LegacyUserDataMigrationResult {
  migrated: boolean
  sourceDirs: string[]
  copiedEntries: string[]
  mergedEntries: string[]
  replacedEntries: string[]
  skippedEntries: string[]
}

function normalizePathForComparison(targetPath: string) {
  const normalized = path.resolve(targetPath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function listDirectoryEntriesSync(targetDir: string) {
  try {
    if (!fs.pathExistsSync(targetDir)) return []
    return fs.readdirSync(targetDir)
  } catch {
    return []
  }
}

/**
 * 判断目标数据库是否只是启动后自动生成的默认空库。
 * 这类数据库没有用户节点/配置，仅包含默认分类和两条预置模式，
 * 可以在迁移旧数据库时安全替换。
 */
export function isLikelyBootstrapLagZeroDatabaseSync(dbPath: string) {
  if (!fs.pathExistsSync(dbPath)) return false

  let sqlite: DatabaseConstructor.Database | null = null

  try {
    sqlite = new DatabaseConstructor(dbPath, {
      readonly: true,
      fileMustExist: true
    })

    const tables = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('nodes', 'profiles', 'categories', 'games')
    `).all() as Array<{ name: string }>

    if (tables.length !== 4) return false

    const getCount = (table: string) => {
      const row = sqlite!.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number }
      return Number(row?.count || 0)
    }

    const nodeCount = getCount('nodes')
    const profileCount = getCount('profiles')
    const categories = sqlite.prepare('SELECT name FROM categories').all() as Array<{ name?: string }>
    const games = sqlite.prepare('SELECT name FROM games').all() as Array<{ name?: string }>

    if (nodeCount !== 0 || profileCount !== 0) return false
    if (categories.length !== DEFAULT_BOOTSTRAP_CATEGORY_NAMES.size) return false
    if (games.length !== DEFAULT_BOOTSTRAP_GAME_NAMES.size) return false

    if (!categories.every((row) => DEFAULT_BOOTSTRAP_CATEGORY_NAMES.has(String(row.name || '')))) {
      return false
    }

    if (!games.every((row) => DEFAULT_BOOTSTRAP_GAME_NAMES.has(String(row.name || '')))) {
      return false
    }

    return true
  } catch {
    return false
  } finally {
    sqlite?.close()
  }
}

function copyLegacyEntrySync(sourcePath: string, targetPath: string, options?: { replace?: boolean }) {
  if (options?.replace && fs.pathExistsSync(targetPath)) {
    fs.removeSync(targetPath)
  }

  fs.copySync(sourcePath, targetPath, {
    overwrite: false,
    errorOnExist: false
  })
}

/**
 * 将旧版 userData 目录增量合并到新的 data 目录。
 *
 * 规则：
 * - 缺失的文件/目录直接复制
 * - 已存在的目录执行合并，补齐缺失文件
 * - 若目标 lagzero.db 只是默认启动生成的空库，则使用旧数据库替换
 * - 其他已存在文件一律保留，避免覆盖用户在新目录中的更新数据
 */
export function migrateLegacyUserDataDirectoriesSync(input: {
  targetDir: string
  legacyDirs: string[]
}): LegacyUserDataMigrationResult {
  const result: LegacyUserDataMigrationResult = {
    migrated: false,
    sourceDirs: [],
    copiedEntries: [],
    mergedEntries: [],
    replacedEntries: [],
    skippedEntries: []
  }

  const normalizedTarget = normalizePathForComparison(input.targetDir)
  const visitedLegacyDirs = new Set<string>()

  fs.ensureDirSync(input.targetDir)

  for (const legacyDir of input.legacyDirs) {
    const normalizedLegacy = normalizePathForComparison(String(legacyDir || ''))
    if (!normalizedLegacy || normalizedLegacy === normalizedTarget) continue
    if (visitedLegacyDirs.has(normalizedLegacy)) continue
    visitedLegacyDirs.add(normalizedLegacy)

    const entryNames = listDirectoryEntriesSync(legacyDir)
    if (entryNames.length === 0) continue

    let sourceContributed = false

    for (const entryName of entryNames) {
      const sourcePath = path.join(legacyDir, entryName)
      const targetPath = path.join(input.targetDir, entryName)

      let sourceStat: fs.Stats
      try {
        sourceStat = fs.statSync(sourcePath)
      } catch {
        continue
      }

      const targetExists = fs.pathExistsSync(targetPath)
      const shouldReplaceBootstrapDb = entryName === 'lagzero.db'
        && targetExists
        && isLikelyBootstrapLagZeroDatabaseSync(targetPath)

      if (sourceStat.isDirectory()) {
        copyLegacyEntrySync(sourcePath, targetPath)
        if (targetExists) result.mergedEntries.push(entryName)
        else result.copiedEntries.push(entryName)
        sourceContributed = true
        continue
      }

      if (shouldReplaceBootstrapDb) {
        copyLegacyEntrySync(sourcePath, targetPath, { replace: true })
        result.replacedEntries.push(entryName)
        sourceContributed = true
        continue
      }

      if (!targetExists) {
        copyLegacyEntrySync(sourcePath, targetPath)
        result.copiedEntries.push(entryName)
        sourceContributed = true
        continue
      }

      result.skippedEntries.push(entryName)
    }

    if (sourceContributed) {
      result.sourceDirs.push(legacyDir)
    }
  }

  result.migrated =
    result.copiedEntries.length > 0
    || result.mergedEntries.length > 0
    || result.replacedEntries.length > 0

  return result
}
