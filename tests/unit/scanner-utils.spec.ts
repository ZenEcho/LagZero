import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectExePaths, pickRelatedExecutables } from '../../electron/services/scanners/utils'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots) {
    await fs.remove(root)
  }
  tempRoots.length = 0
})

describe('scanner utils', () => {
  it('keeps root executable scanning when directory entry count is very large', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lagzero-scanner-utils-'))
    tempRoots.push(tempRoot)

    const gameRoot = path.join(tempRoot, 'BigGame')
    await fs.ensureDir(gameRoot)

    const chunks = 32
    const totalFiles = 3001
    const perChunk = Math.ceil(totalFiles / chunks)

    for (let c = 0; c < chunks; c += 1) {
      const writes: Promise<void>[] = []
      const start = c * perChunk
      const end = Math.min(totalFiles, (c + 1) * perChunk)
      for (let i = start; i < end; i += 1) {
        writes.push(fs.writeFile(path.join(gameRoot, `dummy_${i}.tmp`), ''))
      }
      await Promise.all(writes)
    }

    const gameExe = path.join(gameRoot, 'BigGame.exe')
    await fs.writeFile(gameExe, '')

    const exes = await collectExePaths(gameRoot, 1)
    const names = exes.map((e) => path.basename(e).toLowerCase())

    expect(names).toContain('biggame.exe')
  })

  it('respects maxDepth boundary without scanning one level deeper', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lagzero-scanner-depth-'))
    tempRoots.push(tempRoot)

    const gameRoot = path.join(tempRoot, 'DepthGame')
    const depth2Dir = path.join(gameRoot, 'Binaries')
    const depth3Dir = path.join(depth2Dir, 'Win64')

    await fs.ensureDir(depth3Dir)
    await fs.writeFile(path.join(depth2Dir, 'DepthGame.exe'), '')
    await fs.writeFile(path.join(depth3Dir, 'DepthGame-Win64.exe'), '')

    const exes = await collectExePaths(gameRoot, 2)
    const names = exes.map((e) => path.basename(e).toLowerCase())

    expect(names).toContain('depthgame.exe')
    expect(names).not.toContain('depthgame-win64.exe')
  })

  it('filters obvious archive helper executables from selected process names', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lagzero-scanner-pick-'))
    tempRoots.push(tempRoot)

    const gameRoot = path.join(tempRoot, 'Cyberpunk 2077')
    await fs.ensureDir(gameRoot)

    await fs.writeFile(path.join(gameRoot, 'Cyberpunk2077.exe'), '')
    await fs.writeFile(path.join(gameRoot, 'REDprelauncher.exe'), '')
    await fs.writeFile(path.join(gameRoot, '7za.exe'), '')

    const exes = await pickRelatedExecutables(gameRoot, 'Cyberpunk 2077')
    const names = exes.map((e) => path.basename(e).toLowerCase())

    expect(names).toContain('cyberpunk2077.exe')
    expect(names).not.toContain('7za.exe')
  })
})
