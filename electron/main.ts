import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, NativeImage, shell, net } from 'electron'
// import { autoUpdater } from 'electron-updater'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { inspect } from 'node:util'
import { randomUUID } from 'node:crypto'
import fs from 'fs-extra'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Handle __filename error in ESM
const __filename = fileURLToPath(import.meta.url)
// Polyfill global.__filename and global.__dirname for better-sqlite3
// @ts-ignore
global.__filename = __filename
// @ts-ignore
global.__dirname = __dirname

import { SingBoxManager } from './singbox/manager'
import { ProcessManager } from './process/manager'
import { GameManager } from './games/manager'
import { CategoryManager } from './categories/manager'
import { ProxyMonitor } from './proxy/monitor'
import { NodeManager } from './nodes/manager'
import { DatabaseManager } from './db'
import { ping, tcpPing } from './network/ping'
import pkg from '../package.json'

process.env.APP_ROOT = path.join(__dirname, '..')
const APP_ID = 'com.' + pkg.name + '.client'

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(process.env.APP_ROOT, '.' + pkg.name + '-dev'))
}
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

let win: BrowserWindow | null
let tray: Tray | null = null
let singboxManager: SingBoxManager | null = null
let processManager: ProcessManager | null = null
let gameManager: GameManager | null = null
let categoryManager: CategoryManager | null = null
let proxyMonitor: ProxyMonitor | null = null
let nodeManager: NodeManager | null = null
let dbManager: DatabaseManager | null = null

type AppLogLevel = 'debug' | 'info' | 'warn' | 'error'
type AppLogCategory = 'frontend' | 'backend' | 'core'

type AppLogEntry = {
  id: string
  timestamp: number
  level: AppLogLevel
  category: AppLogCategory
  source: string
  message: string
  detail?: string
}

const MAX_LOG_ENTRIES = 3000
const appLogs: AppLogEntry[] = []
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024
const MAX_LOG_DIR_BYTES = 500 * 1024 * 1024
const LOG_FILE_PREFIX = pkg.name
let logWriteChain: Promise<void> = Promise.resolve()
let sessionLogFilePath = ''

function getAppLogDir() {
  return path.join(app.getPath('userData'), 'logs')
}

function getAppLogFilePath() {
  if (sessionLogFilePath) return sessionLogFilePath
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  sessionLogFilePath = path.join(getAppLogDir(), `${LOG_FILE_PREFIX}-${stamp}-${process.pid}.log`)
  return sessionLogFilePath
}

function queueLogWrite(task: () => Promise<void>) {
  logWriteChain = logWriteChain
    .then(task)
    .catch(() => {
      // Avoid recursive logging when filesystem write fails.
    })
}

function sanitizeLogText(text?: string) {
  if (!text) return ''
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function formatLogLine(row: AppLogEntry) {
  const iso = new Date(row.timestamp).toISOString()
  const base = `[${iso}] [${row.level.toUpperCase()}] [${row.category}] [${row.source}] ${sanitizeLogText(row.message)}`
  if (!row.detail) return `${base}\n`
  return `${base}\n${sanitizeLogText(row.detail)}\n`
}

async function ensureSingleFileLimit(logFilePath: string, incomingBytes: number) {
  const exists = await fs.pathExists(logFilePath)
  if (!exists) return
  const stat = await fs.stat(logFilePath)
  const nextSize = stat.size + incomingBytes
  if (nextSize <= MAX_LOG_FILE_BYTES) return
  await fs.truncate(logFilePath, 0)
}

async function pruneLogDirIfNeeded(logDir: string) {
  const exists = await fs.pathExists(logDir)
  if (!exists) return

  const dirents = await fs.readdir(logDir, { withFileTypes: true })
  const files: Array<{ path: string, size: number, mtimeMs: number }> = []

  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.log')) continue
    if (!dirent.name.toLowerCase().startsWith(`${LOG_FILE_PREFIX}-`)) continue
    const full = path.join(logDir, dirent.name)
    try {
      const st = await fs.stat(full)
      files.push({ path: full, size: st.size, mtimeMs: st.mtimeMs })
    } catch {
      // ignore read failures
    }
  }

  files.sort((a, b) => a.mtimeMs - b.mtimeMs)
  let total = files.reduce((sum, f) => sum + f.size, 0)

  for (const file of files) {
    if (total <= MAX_LOG_DIR_BYTES) break
    const active = path.normalize(file.path) === path.normalize(getAppLogFilePath())
    if (active && files.length > 1) continue

    try {
      await fs.remove(file.path)
      total -= file.size
    } catch {
      // ignore delete failures
    }
  }
}

async function writeStartupSection() {
  const logFilePath = getAppLogFilePath()
  const now = new Date()
  const section = [
    '',
    '='.repeat(88),
    `Session Start: ${now.toISOString()}`,
    `Version: ${app.getVersion()} | PID: ${process.pid} | Platform: ${process.platform} ${process.arch}`,
    `Electron: ${process.versions.electron} | Node: ${process.versions.node} | Chromium: ${process.versions.chrome}`,
    '='.repeat(88),
    ''
  ].join('\n')

  await fs.ensureDir(path.dirname(logFilePath))
  await fs.writeFile(logFilePath, section, 'utf8')
  await pruneLogDirIfNeeded(path.dirname(logFilePath))
}

function appendLogToFile(row: AppLogEntry) {
  const line = formatLogLine(row)
  const logFilePath = getAppLogFilePath()

  queueLogWrite(async () => {
    await fs.ensureDir(path.dirname(logFilePath))
    await ensureSingleFileLimit(logFilePath, Buffer.byteLength(line, 'utf8'))
    await fs.appendFile(logFilePath, line, 'utf8')
    await pruneLogDirIfNeeded(path.dirname(logFilePath))
  })
}

function pushAppLog(entry: Omit<AppLogEntry, 'id' | 'timestamp'>) {
  const row: AppLogEntry = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...entry
  }
  appLogs.push(row)
  if (appLogs.length > MAX_LOG_ENTRIES) appLogs.shift()
  win?.webContents.send('app-log:new', row)
  appendLogToFile(row)
}

function stringifyConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack || value.message
  return inspect(value, { depth: 3, breakLength: 120 })
}

function truncateLogText(text: string, max = 4000) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function inferLogCategory(message: string): AppLogCategory {
  return message.includes('[SingBox]') ? 'core' : 'backend'
}

function installMainConsoleLogCapture() {
  const original = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    log: console.log.bind(console)
  }

  const install = (method: keyof typeof original, level: AppLogLevel) => {
    ; (console as any)[method] = (...args: unknown[]) => {
      original[method](...args as any[])
      const text = truncateLogText(args.map(stringifyConsoleArg).join(' ').trim())
      pushAppLog({
        level,
        category: inferLogCategory(text),
        source: 'main',
        message: text || '(empty)'
      })
    }
  }

  install('debug', 'debug')
  install('info', 'info')
  install('warn', 'warn')
  install('error', 'error')
  install('log', 'info')
}

installMainConsoleLogCapture()
queueLogWrite(writeStartupSection)
pushAppLog({
  level: 'info',
  category: 'backend',
  source: 'logger',
  message: `App log file: ${getAppLogFilePath()}`
})

ipcMain.handle('logs:get-all', () => appLogs)
ipcMain.handle('logs:clear', () => {
  appLogs.length = 0
  const logDir = getAppLogDir()
  queueLogWrite(async () => {
    if (!await fs.pathExists(logDir)) return
    const dirents = await fs.readdir(logDir, { withFileTypes: true })
    for (const dirent of dirents) {
      if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.log')) continue
      if (!dirent.name.toLowerCase().startsWith(`${LOG_FILE_PREFIX}-`)) continue
      await fs.remove(path.join(logDir, dirent.name)).catch(() => { })
    }
  })
})
ipcMain.handle('logs:get-file-path', () => getAppLogFilePath())
ipcMain.handle('logs:push-frontend', (_, payload: Partial<AppLogEntry>) => {
  const level: AppLogLevel = payload.level === 'debug' || payload.level === 'warn' || payload.level === 'error'
    ? payload.level
    : 'info'

  pushAppLog({
    level,
    category: 'frontend',
    source: String(payload.source || 'renderer'),
    message: truncateLogText(String(payload.message || '(empty)')),
    detail: payload.detail ? truncateLogText(String(payload.detail)) : undefined
  })
})

function formatStartupError(error: unknown) {
  const raw = String((error as any)?.stack || (error as any)?.message || error || 'Unknown error')
  const lower = raw.toLowerCase()

  if (lower.includes('better_sqlite3.node') && lower.includes('not a valid win32 application')) {
    return [
      'Failed to load better-sqlite3 native module due to architecture mismatch.',
      '',
      `Current runtime arch: ${process.arch}`,
      'Fix command: pnpm rebuild better-sqlite3',
      '',
      'Details:',
      raw
    ].join('\n')
  }

  if (lower.includes('better_sqlite3.node') && lower.includes('compiled against a different node.js version')) {
    return [
      'Failed to load better-sqlite3 due to native ABI mismatch.',
      '',
      `Current runtime: electron ${process.versions.electron}, modules ${process.versions.modules}, arch ${process.arch}`,
      'Fix command: pnpm run rebuild:native',
      'Fallback command: pnpm run rebuild:sqlite',
      '',
      'Details:',
      raw
    ].join('\n')
  }

  return raw
}

function loadAppIcon(): NativeImage | null {
  const baseDir = process.env.VITE_PUBLIC || ''
  const candidates = [
    path.join(baseDir, 'logo.png'),
    path.join(baseDir, 'logo.ico'),
    path.join(baseDir, 'logo.svg'),
  ]

  const tryFromPath = (p: string): NativeImage | null => {
    if (!p || !fs.existsSync(p)) return null
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
    return null
  }

  for (const p of candidates) {
    const image = tryFromPath(p)
    if (image) return image
  }

  const svgPath = path.join(baseDir, 'logo.svg')
  if (!fs.existsSync(svgPath)) {
    console.warn('[Main] Icon file not found:', svgPath)
    return null
  }

  const svg = fs.readFileSync(svgPath, 'utf-8')
  const toImage = (content: string) => {
    const svgBase64 = Buffer.from(content, 'utf-8').toString('base64')
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${svgBase64}`)
  }

  // Fallback: strip filters for platforms with poor SVG filter support.
  const sanitized = svg
    .replace(/<filter[\s\S]*?<\/filter>/gi, '')
    .replace(/\sfilter="url\(#.*?\)"/gi, '')

  const image = toImage(sanitized)
  if (!image.isEmpty()) return image

  // Last fallback: a minimal SVG that Electron can decode reliably on Windows.
  const fallbackSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#0f172a"/>
  <path d="M145 20 L78 131 L136 131 L118 236 L202 111 L141 111 L168 20 Z"
        fill="#22c55e" stroke="#ffffff" stroke-width="6" stroke-linejoin="round" />
</svg>`
  const fallbackImage = toImage(fallbackSvg)
  if (!fallbackImage.isEmpty()) {
    console.warn('[Main] logo.svg decode failed, using built-in fallback icon')
    return fallbackImage
  }

  console.warn('[Main] Failed to load icon from:', svgPath)
  console.warn('[Main] Recommended fallback: add public/logo.png or public/logo.ico')
  return null
}

function createTray(icon: NativeImage | null) {
  if (tray || !icon) return

  const trayIcon = icon.resize({ width: 20, height: 20, quality: 'best' })
  tray = new Tray(trayIcon)
  tray.setToolTip(pkg.productName)
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (!win) return
        win.show()
        win.focus()
      }
    },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]))

  tray.on('double-click', () => {
    if (!win) return
    if (win.isVisible()) {
      win.focus()
    } else {
      win.show()
      win.focus()
    }
  })
}

function createWindow() {
  const appIcon = loadAppIcon()

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 620,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading local resources (file://)
    },
    backgroundColor: '#1e1e1e',
    ...(appIcon ? { icon: appIcon } : {}),
  })

  dbManager = new DatabaseManager()
  singboxManager = new SingBoxManager(win)
  processManager = new ProcessManager()
  gameManager = new GameManager(dbManager)
  categoryManager = new CategoryManager(dbManager)
  proxyMonitor = new ProxyMonitor(win, processManager, singboxManager)
  nodeManager = new NodeManager(dbManager)

  // Register generic DB IPCs
  ipcMain.handle('db:export', () => dbManager?.exportData())
  ipcMain.handle('db:import', (_, data) => dbManager?.importData(data))

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  createTray(appIcon)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else if (win) {
    win.show()
    win.focus()
  }
})

app.whenReady()
  .then(() => {
    createWindow()
  })
  .catch((error) => {
    const message = formatStartupError(error)
    console.error('[Main] App startup failed:', message)
    dialog.showErrorBox('LagZero startup failed', message)
    app.quit()
  })

process.on('unhandledRejection', (reason) => {
  const message = formatStartupError(reason)
  console.error('[Main] Unhandled rejection:', message)
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = null
})

ipcMain.handle('window-minimize', () => win?.minimize())
ipcMain.handle('window-maximize', () => {
  if (win && win.isMaximized()) {
    win.unmaximize()
  } else if (win) {
    win.maximize()
  }
})
ipcMain.handle('window-close', () => win?.close())

ipcMain.handle('dialog:pick-image', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico', 'svg'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return pathToFileURL(result.filePaths[0]!).toString()
})

ipcMain.handle('dialog:pick-process', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Executables', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  // Return filenames only, as users usually just need the process name (e.g. game.exe)
  // But maybe they want full path? The UI shows "e.g. League of Legends.exe".
  // The backend matcher uses `game.processName` which seems to be just filename usually, 
  // but let's see. 
  // `matchRunningGames` in store uses `t.toLowerCase() === pNameLower`. `pName` from `scanProcesses` is just name.
  // So we should return basenames.

  return result.filePaths.map(p => path.basename(p))
})

async function scanDir(dir: string, maxDepth: number, currentDepth: number = 1): Promise<string[]> {
  let results: string[] = []
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        if (maxDepth === -1 || currentDepth < maxDepth) {
          const subResults = await scanDir(path.join(dir, dirent.name), maxDepth, currentDepth + 1)
          results.push(...subResults)
        }
      } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith('.exe')) {
        results.push(dirent.name)
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err)
  }
  return results
}

type LocalGameScanResult = {
  name: string
  processName: string
  source: 'steam' | 'microsoft' | 'epic' | 'ea'
  installDir: string
}

const GAME_SCAN_IGNORE_DIR_NAMES = new Set([
  '_commonredist',
  'redist',
  'redistributable',
  'installer',
  'installers',
  'directx',
  'vcredist',
  'prereq',
  'prerequisites',
  'support',
  'tools',
  'launcher'
])

const GAME_SCAN_IGNORE_EXE_KEYWORDS = [
  'setup',
  'unins',
  'uninstall',
  'installer',
  'crashreport',
  'updater',
  'helper',
  'bootstrap'
]

const GAME_SCAN_EXE_HARD_EXCLUDE = new Set([
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe'
])

function normalizeDisplayName(name: string) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeFsPath(p: string) {
  return path.normalize(p).replace(/[\\\/]+$/, '').toLowerCase()
}

async function safeReadDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function getWindowsDriveRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const roots: string[] = []
  for (let i = 67; i <= 90; i += 1) {
    const letter = String.fromCharCode(i)
    const root = `${letter}:\\`
    if (await fs.pathExists(root)) roots.push(root)
  }
  return roots
}

function basenameLower(p: string) {
  return path.basename(p).toLowerCase()
}

function shouldSkipExeByName(exeName: string) {
  const lower = exeName.toLowerCase()
  if (!lower.endsWith('.exe')) return true
  if (GAME_SCAN_EXE_HARD_EXCLUDE.has(lower)) return true
  return GAME_SCAN_IGNORE_EXE_KEYWORDS.some(k => lower.includes(k))
}

async function collectExePaths(dir: string, maxDepth: number, currentDepth: number = 1): Promise<string[]> {
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

async function pickBestExecutable(gameDir: string, displayName: string): Promise<string | null> {
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

async function readSteamLibraryRoots(): Promise<string[]> {
  const drives = await getWindowsDriveRoots()
  const candidateSteamRoots = Array.from(new Set(
    drives.flatMap(root => [
      path.join(root, 'Program Files (x86)', 'Steam'),
      path.join(root, 'Program Files', 'Steam'),
      path.join(root, 'Steam')
    ])
  ))
  const libs = new Set<string>()

  for (const steamRoot of candidateSteamRoots) {
    const libraryVdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
    if (!await fs.pathExists(libraryVdf)) continue

    libs.add(path.normalize(steamRoot))
    try {
      const content = await fs.readFile(libraryVdf, 'utf8')
      const lines = content.split(/\r?\n/)
      for (const line of lines) {
        const m = line.match(/"path"\s+"([^"]+)"/i)
        if (!m?.[1]) continue
        const p = m[1].replace(/\\\\/g, '\\').trim()
        if (p) libs.add(path.normalize(p))
      }
    } catch (e) {
      console.warn('[GameScan] Failed to parse Steam libraryfolders.vdf:', e)
    }
  }

  return Array.from(libs)
}

async function scanSteamGames(): Promise<LocalGameScanResult[]> {
  const roots = await readSteamLibraryRoots()
  const results: LocalGameScanResult[] = []

  for (const libRoot of roots) {
    const commonDir = path.join(libRoot, 'steamapps', 'common')
    if (!await fs.pathExists(commonDir)) continue

    const games = await safeReadDir(commonDir)
    for (const entry of games) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(commonDir, entry.name)
      const exe = await pickBestExecutable(installDir, entry.name)
      if (!exe) continue
      results.push({
        name: normalizeDisplayName(entry.name),
        processName: path.basename(exe),
        source: 'steam',
        installDir
      })
    }
  }

  return results
}

async function scanFlatPlatformFolder(source: 'epic' | 'ea' | 'microsoft', roots: string[]): Promise<LocalGameScanResult[]> {
  const results: LocalGameScanResult[] = []

  for (const root of roots) {
    if (!await fs.pathExists(root)) continue
    const entries = await safeReadDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(root, entry.name)
      const exe = await pickBestExecutable(installDir, entry.name)
      if (!exe) continue
      results.push({
        name: normalizeDisplayName(entry.name),
        processName: path.basename(exe),
        source,
        installDir
      })
    }
  }

  return results
}

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

function parseDisplayNameFromManifest(content: string): string {
  const displayName = content.match(/<DisplayName>([^<]+)<\/DisplayName>/i)?.[1]?.trim() || ''
  const identityName = content.match(/<Identity[^>]*\sName="([^"]+)"/i)?.[1]?.trim() || ''
  if (displayName && !/^ms-resource:/i.test(displayName)) return displayName
  return identityName
}

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

async function scanMicrosoftGames(): Promise<LocalGameScanResult[]> {
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

async function scanLocalGamesFromPlatforms(): Promise<LocalGameScanResult[]> {
  if (process.platform !== 'win32') return []
  const drives = await getWindowsDriveRoots()

  const [steam, microsoft, epic, ea] = await Promise.all([
    scanSteamGames(),
    scanMicrosoftGames(),
    scanFlatPlatformFolder('epic', Array.from(new Set(
      drives.flatMap(root => [
        path.join(root, 'Epic Games'),
        path.join(root, 'Program Files', 'Epic Games'),
        path.join(root, 'Program Files (x86)', 'Epic Games')
      ])
    ))),
    scanFlatPlatformFolder('ea', Array.from(new Set(
      drives.flatMap(root => [
        path.join(root, 'EA Games'),
        path.join(root, 'Electronic Arts'),
        path.join(root, 'Program Files', 'EA Games'),
        path.join(root, 'Program Files', 'Electronic Arts'),
        path.join(root, 'Program Files (x86)', 'EA Games'),
        path.join(root, 'Program Files (x86)', 'Electronic Arts')
      ])
    )))
  ])

  const dedup = new Map<string, LocalGameScanResult>()
  for (const game of [...steam, ...microsoft, ...epic, ...ea]) {
    const key = `${game.name.toLowerCase()}|${game.processName.toLowerCase()}`
    if (!dedup.has(key)) dedup.set(key, game)
  }

  return Array.from(dedup.values())
}

ipcMain.handle('dialog:pick-process-folder', async (_, maxDepth: number = 1) => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const dir = result.filePaths[0]
  return scanDir(dir, maxDepth)
})

ipcMain.handle('system:ping', async (_, host: string) => ping(host))
ipcMain.handle('system:tcp-ping', async (_, host: string, port: number) => {
  try {
    return await tcpPing(host, port)
  } catch (e: any) {
    return { latency: -1, loss: 100 }
  }
})
ipcMain.handle('system:scan-local-games', async () => {
  try {
    return await scanLocalGamesFromPlatforms()
  } catch (error) {
    console.error('[GameScan] Failed to scan local games:', error)
    return []
  }
})

type SystemCommandResult = {
  ok: boolean
  code: number
  output: string
  message: string
}

function runCommand(command: string, args: string[], timeoutMs: number = 15000): Promise<{ code: number, output: string }> {
  return new Promise((resolve) => {
    const p = spawn(command, args, { windowsHide: true })
    const chunks: Buffer[] = []
    const onData = (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d)))

    p.stdout?.on('data', onData)
    p.stderr?.on('data', onData)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      p.kill()
    }, timeoutMs)

    p.on('close', (code) => {
      clearTimeout(timer)
      const output = Buffer.concat(chunks).toString('utf8').trim()
      if (timedOut) {
        resolve({ code: -1, output: output || 'Command timeout' })
        return
      }
      resolve({ code: typeof code === 'number' ? code : -1, output })
    })

    p.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, output: String(err?.message || err) })
    })
  })
}

async function flushDnsCache(): Promise<SystemCommandResult> {
  if (process.platform === 'win32') {
    const { code, output } = await runCommand('ipconfig', ['/flushdns'])
    return {
      ok: code === 0,
      code,
      output,
      message: code === 0 ? 'DNS cache flushed.' : 'Failed to flush DNS cache. Try running LagZero as administrator.'
    }
  }

  return {
    ok: false,
    code: -1,
    output: '',
    message: `Unsupported platform: ${process.platform}`
  }
}

async function reinstallTunAdapter(interfaceName: string = 'LagZero'): Promise<SystemCommandResult> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      code: -1,
      output: '',
      message: `Unsupported platform: ${process.platform}`
    }
  }

  // Try to remove old adapter instance, then sing-box will recreate it on next start.
  const psScript = [
    `$name = '${interfaceName.replace(/'/g, "''")}'`,
    "$adapter = Get-NetAdapter -Name $name -ErrorAction SilentlyContinue",
    "if ($null -eq $adapter) { Write-Output \"TUN adapter not found: $name\"; exit 2 }",
    "Disable-NetAdapter -Name $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null",
    "Start-Sleep -Milliseconds 400",
    "if (Get-Command Remove-NetAdapter -ErrorAction SilentlyContinue) {",
    "  Remove-NetAdapter -Name $name -Confirm:$false -ErrorAction Stop",
    "  Write-Output \"TUN adapter removed: $name\"",
    "  exit 0",
    "}",
    "Write-Output \"Remove-NetAdapter not available\"",
    "exit 3"
  ].join('; ')

  const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], 25000)
  const ok = code === 0 || code === 2
  return {
    ok,
    code,
    output,
    message: ok
      ? 'TUN adapter reset finished. Restart acceleration to recreate adapter.'
      : 'Failed to reset TUN adapter. Try running LagZero as administrator.'
  }
}

ipcMain.handle('system:flush-dns-cache', () => flushDnsCache())
ipcMain.handle('system:tun-reinstall', async (_, interfaceName?: string) => {
  return reinstallTunAdapter(interfaceName || 'LagZero')
})

// Update & Info handlers
ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.handle('app:check-update', async () => {
  try {
    const fetchGithub = async (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const request = net.request(url)
        request.setHeader('User-Agent', 'LagZero-Client')
        request.on('response', (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`GitHub API Error: ${response.statusCode}`))
            return
          }
          let data = ''
          response.on('data', (chunk) => { data += chunk })
          response.on('end', () => resolve(data))
        })
        request.on('error', (err) => reject(err))
        request.end()
      })
    }

    let latestVersion = ''
    let releaseDate = ''
    let releaseNotes = ''
    let hasUpdate = false

    try {
      // 1. Try releases/latest first
      const rawRelease = await fetchGithub('https://api.github.com/repos/ZenEcho/LagZero/releases/latest')
      const release = JSON.parse(rawRelease)
      latestVersion = release.tag_name.replace(/^v/, '')
      releaseDate = new Date(release.published_at).toLocaleDateString()
      releaseNotes = release.body || ''
    } catch (e) {
      // 2. Fallback to tags if latest release is not available
      const rawTags = await fetchGithub('https://api.github.com/repos/ZenEcho/LagZero/tags')
      const tags = JSON.parse(rawTags)
      if (Array.isArray(tags) && tags.length > 0) {
        latestVersion = tags[0].name.replace(/^v/, '')
        releaseNotes = `Tag: ${tags[0].name}`
      } else {
        throw new Error('No version info found')
      }
    }

    const currentVersion = app.getVersion()
    const v1Parts = latestVersion.split('.').map(Number)
    const v2Parts = currentVersion.split('.').map(Number)

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const u = v1Parts[i] || 0
      const c = v2Parts[i] || 0
      if (u > c) {
        hasUpdate = true
        break
      }
      if (u < c) {
        hasUpdate = false
        break
      }
    }

    return {
      updateAvailable: hasUpdate,
      version: latestVersion,
      releaseDate,
      releaseNotes
    }
  } catch (e: any) {
    return { error: e.message || 'Update check failed' }
  }
})

ipcMain.handle('app:open-url', (_, url: string) => {
  shell.openExternal(url)
})
