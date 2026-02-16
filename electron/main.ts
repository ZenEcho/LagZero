import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
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

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(process.env.APP_ROOT, '.lagzero-dev'))
}

let win: BrowserWindow | null
let singboxManager: SingBoxManager | null = null
let processManager: ProcessManager | null = null
let gameManager: GameManager | null = null
let categoryManager: CategoryManager | null = null
let proxyMonitor: ProxyMonitor | null = null
let nodeManager: NodeManager | null = null
let dbManager: DatabaseManager | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading local resources (file://)
    },
    backgroundColor: '#1e1e1e',
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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

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
