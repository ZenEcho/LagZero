import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'node:path'

vi.mock('better-sqlite3', async () => {
  const fs = await import('node:fs')

  class MockDatabase {
    private filePath: string

    constructor(filePath: string) {
      this.filePath = String(filePath || '')
    }

    private readTables() {
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const data = JSON.parse(raw || '{}') as { tables?: Record<string, Array<Record<string, unknown>>> }
      return data.tables || {}
    }

    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim()

      if (normalized.includes('FROM sqlite_master')) {
        return {
          all: () => Object.keys(this.readTables())
            .filter((name) => ['nodes', 'profiles', 'categories', 'games'].includes(name))
            .map((name) => ({ name }))
        }
      }

      const countMatch = normalized.match(/^SELECT COUNT\(\*\) AS count FROM (\w+)$/i)
      if (countMatch) {
        return {
          get: () => ({ count: (this.readTables()[countMatch[1]] || []).length })
        }
      }

      const nameMatch = normalized.match(/^SELECT name FROM (\w+)$/i)
      if (nameMatch) {
        return {
          all: () => (this.readTables()[nameMatch[1]] || []).map((row) => ({ name: row.name }))
        }
      }

      throw new Error(`Unsupported SQL in mock better-sqlite3: ${normalized}`)
    }

    close() { }
  }

  return {
    default: MockDatabase
  }
})

import {
  isLikelyBootstrapLagZeroDatabaseSync,
  migrateLegacyUserDataDirectoriesSync
} from '../../electron/common/user-data-migration'

describe('user data migration', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lagzero-user-data-migration-'))
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  async function createDb(dbPath: string, options?: { bootstrap?: boolean, nodeTags?: string[] }) {
    const bootstrapCategories = ['Other', 'FPS', 'MOBA', 'RPG', 'Racing', 'Sports', 'Strategy', 'Survival']
    const bootstrapGames = ['加速海外游戏', '加速全部游戏']

    const categories = bootstrapCategories.map((name) => ({
      id: `cat-${name}`,
      name
    }))

    if (!options?.bootstrap) {
      categories.push({
        id: 'cat-custom',
        name: 'Custom'
      })
    }

    const data = {
      tables: {
        nodes: (options?.nodeTags || []).map((tag) => ({
          id: `node-${tag}`,
          tag
        })),
        profiles: [],
        categories,
        games: bootstrapGames.map((name) => ({
          id: `game-${name}`,
          name
        }))
      }
    }

    await fs.writeJson(dbPath, data)
  }

  it('migrates legacy files when target only contains runtime directories', async () => {
    const legacyDir = path.join(tempRoot, 'legacy')
    const targetDir = path.join(tempRoot, 'data')

    await fs.ensureDir(path.join(legacyDir, 'bin'))
    await fs.ensureDir(path.join(targetDir, 'logs'))
    await fs.ensureDir(path.join(targetDir, 'session'))

    await createDb(path.join(legacyDir, 'lagzero.db'), { nodeTags: ['legacy-node'] })
    await fs.writeJson(path.join(legacyDir, 'config.json'), { mode: 'legacy' })
    await fs.writeFile(path.join(legacyDir, 'bin', 'sing-box.exe'), 'legacy-core', 'utf8')

    const result = migrateLegacyUserDataDirectoriesSync({
      targetDir,
      legacyDirs: [legacyDir]
    })

    expect(result.migrated).toBe(true)
    expect(result.copiedEntries).toEqual(expect.arrayContaining(['lagzero.db', 'config.json', 'bin']))
    expect(await fs.pathExists(path.join(targetDir, 'lagzero.db'))).toBe(true)
    expect(await fs.readJson(path.join(targetDir, 'config.json'))).toEqual({ mode: 'legacy' })
    expect(await fs.readFile(path.join(targetDir, 'bin', 'sing-box.exe'), 'utf8')).toBe('legacy-core')
  })

  it('recognizes bootstrap databases and replaces them with the legacy database', async () => {
    const legacyDir = path.join(tempRoot, 'legacy')
    const targetDir = path.join(tempRoot, 'data')

    await fs.ensureDir(legacyDir)
    await fs.ensureDir(targetDir)

    await createDb(path.join(legacyDir, 'lagzero.db'), { nodeTags: ['legacy-node'] })
    await createDb(path.join(targetDir, 'lagzero.db'), { bootstrap: true })

    expect(isLikelyBootstrapLagZeroDatabaseSync(path.join(targetDir, 'lagzero.db'))).toBe(true)

    const result = migrateLegacyUserDataDirectoriesSync({
      targetDir,
      legacyDirs: [legacyDir]
    })

    expect(result.replacedEntries).toContain('lagzero.db')

    const migratedDb = await fs.readJson(path.join(targetDir, 'lagzero.db'))
    expect(migratedDb.tables.nodes).toHaveLength(1)
  })

  it('does not overwrite a non-bootstrap database in the new data directory', async () => {
    const legacyDir = path.join(tempRoot, 'legacy')
    const targetDir = path.join(tempRoot, 'data')

    await fs.ensureDir(legacyDir)
    await fs.ensureDir(targetDir)

    await createDb(path.join(legacyDir, 'lagzero.db'), { nodeTags: ['legacy-node'] })
    await createDb(path.join(targetDir, 'lagzero.db'), { nodeTags: ['current-node'] })

    expect(isLikelyBootstrapLagZeroDatabaseSync(path.join(targetDir, 'lagzero.db'))).toBe(false)

    const result = migrateLegacyUserDataDirectoriesSync({
      targetDir,
      legacyDirs: [legacyDir]
    })

    expect(result.replacedEntries).not.toContain('lagzero.db')
    expect(result.skippedEntries).toContain('lagzero.db')

    const currentDb = await fs.readJson(path.join(targetDir, 'lagzero.db'))
    expect(currentDb.tables.nodes[0]?.tag).toBe('current-node')
  })
})
