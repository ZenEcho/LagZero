import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
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
import { ensureAdminAtStartup, loadAppIcon, handleStartupError } from './bootstrap'
import { WindowManager, VITE_DEV_SERVER_URL, MAIN_DIST, RENDERER_DIST } from './window'
import { TrayManager } from './tray'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const __filename = fileURLToPath(import.meta.url)

// Polyfill global.__filename and global.__dirname for better-sqlite3
// @ts-ignore
global.__filename = __filename
// @ts-ignore
global.__dirname = __dirname

process.env.APP_ROOT = path.join(__dirname, '../')
const APP_ID = 'com.' + pkg.name + '.client'

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(process.env.APP_ROOT, '.' + pkg.name + '-dev'))
}
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

// 确保以管理员权限启动
ensureAdminAtStartup()

const windowManager = new WindowManager()
const trayManager = new TrayManager(null as any) // 稍后更新 win 引用

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
let quitCleanupStarted = false

// 初始化日志系统
setupLogger(() => windowManager.get())

/**
 * 初始化所有业务服务并注册 IPC 监听
 * @param win 主窗口实例
 */
function initServices(win: BrowserWindow) {
  // 实例化服务
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

  // 注册通用数据库 IPC
  ipcMain.handle('db:export', () => dbService?.exportData())
  ipcMain.handle('db:import', (_, data) => dbService?.importData(data))

  // 注册扫描服务 IPC
  ipcMain.handle('system:scan-local-games', async () => {
    try {
      return await gameScannerService?.scanLocalGamesFromPlatforms() || []
    } catch (error) {
      console.error('[GameScan] Failed to scan local games:', error)
      return []
    }
  })
  ipcMain.handle('dialog:pick-process-folder', async (_, maxDepth: number = 1) => {
    const win = windowManager.get()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const dir = result.filePaths[0]
    return gameScannerService?.scanDir(dir, maxDepth)
  })

  // 注册更新服务 IPC
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:check-update', () => updaterService?.checkUpdate())
  ipcMain.handle('app:open-url', (_, url: string) => {
    shell.openExternal(url)
  })

  // 注册系统对话框 IPC
  ipcMain.handle('dialog:pick-image', async () => {
    const win = windowManager.get()
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
    const win = windowManager.get()
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
}

/**
 * 启动应用程序
 * 创建窗口、托盘图标并初始化服务
 */
function startApp() {
  const appIcon = loadAppIcon()
  const win = windowManager.create(appIcon)
  
  // 重新创建托盘以绑定正确的窗口引用
  trayManager.destroy()
  // @ts-ignore: 我们知道这是在创建一个新的
  const newTrayManager = new TrayManager(win)
  newTrayManager.create(appIcon)
  // 保持 trayManager 引用，防止被 GC
  Object.assign(trayManager, newTrayManager) 

  initServices(win)
}

// 监听所有窗口关闭事件
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 监听应用激活事件
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startApp()
  } else {
    windowManager.show()
  }
})

// 应用准备就绪
app.whenReady()
  .then(() => {
    startApp()
  })
  .catch((error) => {
    handleStartupError(error)
  })

// 全局未捕获异常处理
process.on('unhandledRejection', (reason) => {
  const message = String(reason)
  console.error('[Main] Unhandled rejection:', message)
})

// 应用退出前清理
app.on('before-quit', (event) => {
  trayManager.destroy()

  if (quitCleanupStarted) return
  quitCleanupStarted = true
  event.preventDefault()

  // 尝试清理系统代理设置
  Promise.resolve(systemService?.clearSystemProxy())
    .catch((e) => {
      console.warn('[Main] Failed to clear system proxy on app quit:', e)
    })
    .finally(() => {
      app.exit(0)
    })
})
