import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'fs-extra'
import { spawn } from 'node:child_process'
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

/**
 * 当前文件的目录路径
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 当前文件的完整路径
 */
const __filename = fileURLToPath(import.meta.url)

// Polyfill global.__filename and global.__dirname for better-sqlite3
// @ts-ignore
global.__filename = __filename
// @ts-ignore
global.__dirname = __dirname

/**
 * 应用根目录路径
 */
process.env.APP_ROOT = path.join(__dirname, '../')

/**
 * 应用程序 ID，用于 Windows 上的 AppUserModelId
 */
const APP_ID = 'com.' + pkg.name + '.client'

/**
 * 静态资源目录路径
 * 开发环境下指向 public 目录，生产环境下指向渲染进程构建目录
 */
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// 设置开发环境下的 userData 目录，避免污染生产环境数据
if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(process.env.APP_ROOT, '.' + pkg.name + '-dev'))
}

// 设置 Windows 上的 AppUserModelId，确保任务栏图标和通知正常显示
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

// 确保以管理员权限启动
ensureAdminAtStartup()

/**
 * 窗口管理器实例
 */
const windowManager = new WindowManager()

/**
 * 托盘管理器实例
 */
const trayManager = new TrayManager(null as any) // 稍后更新 win 引用

// Services 实例引用
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

/**
 * 是否已经开始退出清理流程
 */
let quitCleanupStarted = false

/**
 * 是否正在为了重启而退出
 */
let quittingForRestart = false

/**
 * 开启 Chromium 底层日志落盘
 * 这类日志（如 disk_cache/gpu cache）不走 console.*，需要通过命令行开关单独捕获。
 */
function configureChromiumLogging() {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs')
    fs.ensureDirSync(logDir)
    const chromiumLogFile = path.join(logDir, 'chromium.log')
    app.commandLine.appendSwitch('enable-logging')
    app.commandLine.appendSwitch('log-file', chromiumLogFile)
  } catch (e) {
    console.warn('[Main] 配置 Chromium 日志失败:', e)
  }
}

configureChromiumLogging()

// 初始化日志系统
setupLogger(() => windowManager.get())

/**
 * 构建内容安全策略 (CSP) 字符串
 * @returns CSP 字符串
 */
function buildContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: http: https:",
    "worker-src 'self' blob:",
  ].join('; ')
}

/**
 * 设置渲染进程的内容安全策略 (CSP)
 * 拦截请求头并注入 CSP
 */
function setupRendererCsp() {
  const csp = buildContentSecurityPolicy()
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    const responseHeaders = details.responseHeaders || {}
    responseHeaders['Content-Security-Policy'] = [csp]
    callback({ responseHeaders })
  })
}

/**
 * 将本地文件转换为 Data URL 格式
 * @param filePath 文件绝对路径
 * @returns Data URL 字符串 (例如: data:image/png;base64,...)
 */
function toImageDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
  }
  const mime = mimeMap[ext] || 'application/octet-stream'
  const data = fs.readFileSync(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

/**
 * 重置标记文件名
 */
const RESET_MARKER_FILENAME = `${pkg.name}-pending-reset.marker`

/**
 * 获取重置标记文件的路径
 * @returns 临时目录下的标记文件路径
 */
function getResetMarkerPath(): string {
  return path.join(app.getPath('temp'), RESET_MARKER_FILENAME)
}

/**
 * 解析重置时需要清理的数据目录
 * - 当前 userData 目录 开发目录.lagzero-dev
 * - 当前 appDate 目录  C:\Users\user\AppData\Roaming\lagZero
 * - Windows Roaming(appData) 下的 LagZero 目录（开发模式也会清理）
 */
function resolveResetTargetDirectories(): string[] {
  const appData = app.getPath('appData')
  const userData = app.getPath('userData')
  const candidates = [
    userData,
    path.join(appData, app.getName()),
    path.join(appData, pkg.productName || ''),
    path.join(appData, pkg.name || '')
  ].filter(Boolean)

  const seen = new Set<string>()
  const targets: string[] = []
  for (const p of candidates) {
    const normalized = path.resolve(p)
    const normalizedAppData = path.resolve(appData)
    if (normalized === normalizedAppData) continue
    if (!normalized.startsWith(normalizedAppData + path.sep) && normalized !== path.resolve(userData)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    targets.push(normalized)
  }
  return targets
}

/**
 * 清理单个目录下的全部内容
 */
async function clearDirectoryContents(targetDir: string) {
  if (!await fs.pathExists(targetDir)) return []
  const entries = await fs.readdir(targetDir)
  const failed: string[] = []

  await Promise.all(entries.map(async (name) => {
    const target = path.join(targetDir, name)
    try {
      await fs.remove(target)
    } catch {
      failed.push(name)
    }
  }))
  return failed
}

/**
 * 清理用户数据目录
 */
async function clearUserDataDirectory() {
  const targets = resolveResetTargetDirectories()
  for (const targetDir of targets) {
    const failed = await clearDirectoryContents(targetDir)
    if (failed.length > 0) {
      console.warn(`[Main] 无法完全清理用户数据目录(${targetDir}):`, failed.join(', '))
    }
  }

  console.info('[Main] 已执行重置目录清理:', targets.join(' | '))
}

/**
 * 检查是否存在待处理的重置标记，如果存在则清理用户数据
 * 通常在应用启动时调用
 */
async function applyPendingResetIfNeeded() {
  const markerPath = getResetMarkerPath()
  if (!await fs.pathExists(markerPath)) return

  console.log('[Main] 检测到待处理的重置请求，正在清理用户数据...')
  try {
    await clearUserDataDirectory()
  } catch (e) {
    console.error('[Main] 无法清理待重置的用户数据:', e)
  } finally {
    await fs.remove(markerPath).catch(() => { })
  }
}

/**
 * 获取重启时使用的可执行文件路径
 * 处理 Windows 下的便携版情况
 * @returns 可执行文件路径
 */
function getRelaunchExecPath(): string {
  if (process.platform === 'win32') {
    return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  }
  return process.execPath
}

/**
 * 安全地重启应用程序
 * @returns 是否成功触发重启
 */
function relaunchAppSafely(): boolean {
  try {
    quittingForRestart = true
    const args = process.argv.slice(1)

    if (process.platform === 'win32') {
      const execPath = getRelaunchExecPath()
      const child = spawn(execPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.unref()
      app.exit(0)
      return true
    }

    app.relaunch({ execPath: getRelaunchExecPath(), args })
    app.exit(0)
    return true
  } catch (e) {
    quittingForRestart = false
    console.error('[Main] 无法重启应用:', e)
    return false
  }
}

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
  ipcMain.handle('system:scan-local-games', async (event) => {
    try {
      return await gameScannerService?.scanLocalGamesFromPlatforms((status, details) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('system:scan-progress', { status, details })
        }
      }) || []
    } catch (error) {
      console.error('[GameScan] 扫描本地游戏失败:', error)
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
  ipcMain.handle('app:open-dir', async (_, dir: string) => {
    const error = await shell.openPath(dir)
    if (error) {
      throw new Error(`Failed to open directory: ${error}`)
    }
  })
  ipcMain.handle('app:restart', async () => {
    if (VITE_DEV_SERVER_URL) {
      console.info('[Main] 开发模式下跳过应用重启。')
      return false
    }
    return relaunchAppSafely()
  })
  ipcMain.handle('app:reset', async () => {
    try {
      await systemService?.clearSystemProxy()
    } catch (e) {
      console.warn('[Main] 应用重置期间清理系统代理失败:', e)
    }

    try {
      singboxService?.stop()
      await new Promise((resolve) => setTimeout(resolve, 800))
    } catch (e) {
      console.warn('[Main] 应用重置期间停止 sing-box 失败:', e)
    }

    try {
      await dbService?.close()
    } catch (e) {
      console.warn('[Main] 应用重置期间关闭数据库失败:', e)
    }

    try {
      await session.defaultSession.clearStorageData()
      await session.defaultSession.clearCache()
    } catch (e) {
      console.warn('[Main] 应用重置期间清理浏览器存储/缓存失败:', e)
    }

    try {
      await clearUserDataDirectory()
    } catch (e) {
      console.warn('[Main] 应用重置期间立即清理用户数据失败:', e)
    }

    try {
      await fs.outputFile(getResetMarkerPath(), new Date().toISOString(), 'utf8')
    } catch (e) {
      console.warn('[Main] 写入重置标记失败:', e)
    }

    return relaunchAppSafely()
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
    return toImageDataUrl(result.filePaths[0]!)
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
  .then(async () => {
    await applyPendingResetIfNeeded()
    setupRendererCsp()
    startApp()
  })
  .catch((error) => {
    handleStartupError(error)
  })

// 全局未捕获异常处理
process.on('unhandledRejection', (reason) => {
  const message = String(reason)
  console.error('[Main] 未捕获的 Promise 拒绝:', message)
})

// 应用退出前清理
app.on('before-quit', (event) => {
  if (quittingForRestart) {
    trayManager.destroy()
    return
  }

  trayManager.destroy()

  if (quitCleanupStarted) return
  quitCleanupStarted = true
  event.preventDefault()

  // 尝试清理系统代理设置
  Promise.resolve(systemService?.clearSystemProxy())
    .catch((e) => {
      console.warn('[Main] 应用退出时清理系统代理失败:', e)
    })
    .finally(() => {
      app.exit(0)
    })
})
