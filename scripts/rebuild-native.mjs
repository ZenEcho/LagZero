import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const electronRange = packageJson.devDependencies?.electron
const electronVersion = electronRange?.match(/\d+\.\d+\.\d+/)?.[0]

if (!electronVersion) {
  throw new Error(`Unable to resolve Electron version from ${packageJsonPath}`)
}

const pnpmCli = process.env.npm_execpath
const command = pnpmCli ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const args = [
  'exec',
  'electron-rebuild',
  '-f',
  '-w',
  'better-sqlite3',
  '-v',
  electronVersion,
  '-m',
  '.'
]

const commandArgs = pnpmCli ? [pnpmCli, ...args] : args

if (process.platform === 'win32') {
  commandArgs.push('--sequential')
}

await new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  })

  child.on('exit', code => {
    if (code === 0) {
      resolve()
      return
    }

    console.error(
      'rebuild:native failed. If Windows reports EPERM while touching better_sqlite3.node, close all running LagZero/Electron processes first. ' +
      'If a prebuilt binary is unavailable, install Python 3 and Microsoft Visual Studio C++ Build Tools before retrying.'
    )
    reject(new Error(`electron-rebuild exited with code ${code ?? 'unknown'}`))
  })

  child.on('error', reject)
})
