import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, NativeImage, shell } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'fs-extra'
import pkg from '../../package.json'

import { SingBoxService } from '../services/singbox'
import { ProcessService } from '../services/process'
import { GameService } from '../services/game'
import { CategoryService } from '../services/category'
import { ProxyMonitorService } from '../services/proxy-monitor'
import { NodeService } from '../services/node'
import { DatabaseService } from '../services/database'
import { GameScannerService } from '../services/game-scanner'
import { UpdaterService } from '../services/updater'
import { SystemService } from '../services/system'
import { setupLogger } from './logger'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const __filename = fileURLToPath(import.meta.url)

// Polyfill global.__filename and global.__dirname for better-sqlite3
// @ts-ignore
global.__filename = __filename
// @ts-ignore
global.__dirname = __dirname

process.env.APP_ROOT = path.join(__dirname, '../..')
const APP_ID = 'com.' + pkg.name + '.client'

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

let win: BrowserWindow | null = null
let tray: Tray | null = null

// Services
let dbService: DatabaseService | null = null
let singboxService: SingBoxService | null = null
let processService: ProcessService | null = null
let gameService: GameService | null = null
let categoryService: CategoryService | null = null
let proxyMonitorService: ProxyMonitorService | null = null
let nodeService: NodeService | null = null
let gameScannerService: GameScannerService | null = null
let updaterService: UpdaterService | null = null
let systemService: SystemService | null = null

// Setup Logger
setupLogger(() => win)

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

  const sanitized = svg
    .replace(/<filter[\s\S]*?<\/filter>/gi, '')
    .replace(/\sfilter="url\(#.*?\)"/gi, '')

  const image = toImage(sanitized)
  if (!image.isEmpty()) return image

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
      preload: path.join(__dirname, '../preload/index.mjs'), // Adjusted path
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    backgroundColor: '#1e1e1e',
    ...(appIcon ? { icon: appIcon } : {}),
  })

  // Initialize Services
  dbService = new DatabaseService()
  singboxService = new SingBoxService(win)
  processService = new ProcessService()
  gameService = new GameService(dbService)
  categoryService = new CategoryService(dbService)
  proxyMonitorService = new ProxyMonitorService(win, processService, singboxService)
  nodeService = new NodeService(dbService)
  gameScannerService = new GameScannerService()
  updaterService = new UpdaterService()
  systemService = new SystemService()

  // Register generic DB IPCs
  ipcMain.handle('db:export', () => dbService?.exportData())
  ipcMain.handle('db:import', (_, data) => dbService?.importData(data))

  // Register Scanner IPCs
  ipcMain.handle('system:scan-local-games', async () => {
    try {
      return await gameScannerService?.scanLocalGamesFromPlatforms() || []
    } catch (error) {
      console.error('[GameScan] Failed to scan local games:', error)
      return []
    }
  })
  ipcMain.handle('dialog:pick-process-folder', async (_, maxDepth: number = 1) => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const dir = result.filePaths[0]
    return gameScannerService?.scanDir(dir, maxDepth)
  })

  // Register Updater IPCs
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:check-update', () => updaterService?.checkUpdate())
  ipcMain.handle('app:open-url', (_, url: string) => {
    shell.openExternal(url)
  })

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
  return result.filePaths.map(p => path.basename(p))
})
