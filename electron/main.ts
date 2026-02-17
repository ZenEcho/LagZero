import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, NativeImage, shell, net } from 'electron'
// import { autoUpdater } from 'electron-updater'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
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

process.env.APP_ROOT = path.join(__dirname, '..')
const APP_ID = 'com.lagzero.client'

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(process.env.APP_ROOT, '.lagzero-dev'))
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
  tray.setToolTip('LagZero')
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

app.whenReady().then(() => {
  createWindow()
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

async function reinstallTunAdapter(interfaceName: string = 'singbox-tun'): Promise<SystemCommandResult> {
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
  return reinstallTunAdapter(interfaceName || 'singbox-tun')
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
