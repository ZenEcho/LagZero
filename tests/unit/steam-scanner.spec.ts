import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { pickRelatedExecutables } from '../../electron/services/scanners/utils'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots) {
    await fs.remove(root)
  }
  tempRoots.length = 0
})

describe('steam scanner executable depth', () => {
  it('can collect FiraxisBugReporter.exe under Base/Binaries/Win64Steam', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lagzero-steam-test-'))
    tempRoots.push(tempRoot)

    const gameRoot = path.join(tempRoot, "Sid Meier's Civilization VI")
    const targetDir = path.join(gameRoot, 'Base', 'Binaries', 'Win64Steam')
    await fs.ensureDir(targetDir)

    const targetExe = path.join(targetDir, 'FiraxisBugReporter.exe')
    const civExe = path.join(targetDir, 'CivilizationVI.exe')
    await fs.writeFile(targetExe, '')
    await fs.writeFile(civExe, '')

    const exes = await pickRelatedExecutables(gameRoot, "Sid Meier's Civilization VI")
    const names = exes.map(e => path.basename(e).toLowerCase())

    expect(names).toContain('firaxisbugreporter.exe')
  })
})
