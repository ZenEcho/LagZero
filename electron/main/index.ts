import { app, BrowserWindow, ipcMain, dialog, shell, session, crashReporter } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import pkg from '../../package.json'
import { JsonStore } from '../common/store'
import { configureRuntimePaths, getLaunchExecutablePath, getLegacyWindowsUserDataPaths } from '../common/runtime-paths'

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
import {
  ensureAdminAtStartup,
  loadAppIcon,
  handleStartupError,
  shouldEnsureAdminBeforeSingleInstanceCheck
} from './bootstrap'
import {
  APP_DEEP_LINK_SCHEMES,
  findAppDeepLink,
  inspectAppDeepLink,
  queueAppDeepLinkImport,
  type AppDeepLinkImportPayload,
  type AppDeepLinkParseFailureReason
} from './deep-link'
import {
  buildProtocolClientGuardState,
  DEFAULT_PROTOCOL_CLIENT_GUARD_SETTINGS,
  ensureProtocolClient,
  isProtocolClientGuardEnabled,
  isProtocolClientRegistered,
  normalizeProtocolClientGuardSettings,
  registerProtocolClient,
  type GuardedProtocolScheme,
  type ProtocolClientGuardSettings,
  type ProtocolClientGuardState,
  type ProtocolClientRegistrationContext
} from './protocol-client'
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
const APP_ROOT = path.join(__dirname, path.basename(__dirname) === 'main' ? '../..' : '..')
process.env.APP_ROOT = APP_ROOT

/**
 * 应用程序 ID，用于 Windows 上的 AppUserModelId
 */
const APP_ID = 'com.' + pkg.name + '.client'

// 设置应用名称，确保任务栏和任务管理器显示正确
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}
app.setName(pkg.productName)

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST

const runtimePaths = configureRuntimePaths(APP_ROOT)

const launchDeepLink = findAppDeepLink(process.argv)
const shouldPreflightAdminForDeepLink = shouldEnsureAdminBeforeSingleInstanceCheck({
  hasDeepLink: !!launchDeepLink
})

// Deep-link secondary launches need to elevate before the single-instance check,
// otherwise a non-elevated protocol launch can be dropped while the elevated
// primary instance is already running.
if (shouldPreflightAdminForDeepLink) {
  ensureAdminAtStartup()
}

// 禁止多开，避免多个实例同时占用端口
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  if (launchDeepLink) {
    console.info('[Main] Secondary deep-link launch detected, handing off to the primary instance.')
  }
  app.quit()
  process.exit(0)
}

// 常规启动仍沿用原有的提权时机，避免普通二开误触发额外 UAC。
if (!shouldPreflightAdminForDeepLink) {
  ensureAdminAtStartup()
}

/**
 * 判断目录是否包含有效内容。
 * 仅用于启动早期的一次性迁移判断，使用同步调用避免打乱初始化顺序。
 */
function hasDirectoryContentsSync(targetDir: string) {
  try {
    return fs.pathExistsSync(targetDir) && fs.readdirSync(targetDir).length > 0
  } catch {
    return false
  }
}

/**
 * 将旧版 AppData\Roaming 下的数据迁移到 exe 同目录 data。
 */
function migrateLegacyUserDataIfNeeded() {
  if (!runtimePaths.usesExecutableDataDir) return

  const targetDir = runtimePaths.userDataPath
  const normalizedTarget = path.resolve(targetDir)
  if (hasDirectoryContentsSync(targetDir)) return

  for (const legacyDir of getLegacyWindowsUserDataPaths()) {
    const normalizedLegacy = path.resolve(legacyDir)
    if (normalizedLegacy === normalizedTarget) continue
    if (!hasDirectoryContentsSync(legacyDir)) continue

    try {
      fs.ensureDirSync(targetDir)
      fs.copySync(legacyDir, targetDir, {
        overwrite: false,
        errorOnExist: false
      })
      console.info(`[Main] 已迁移旧用户数据目录: ${legacyDir} -> ${targetDir}`)
    } catch (e) {
      console.warn(`[Main] 迁移旧用户数据目录失败: ${legacyDir} -> ${targetDir}`, e)
    }
    return
  }
}

migrateLegacyUserDataIfNeeded()

const protocolClientSettingsStore = new JsonStore<ProtocolClientGuardSettings>({
  name: 'protocol-client-settings',
  cwd: runtimePaths.userDataPath,
  defaults: DEFAULT_PROTOCOL_CLIENT_GUARD_SETTINGS
})

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
 * 托盘 UI 最新状态快照（用于托盘懒加载后的首次同步）。
 */
let latestTrayState: Record<string, unknown> | null = null
let latestTrayStateVersion = 0
const pendingDeepLinkImports: AppDeepLinkImportPayload[] = []
let deepLinkRendererReady = false
type DeepLinkDispatchStatus = 'dispatched' | 'renderer-not-ready' | 'window-missing' | 'send-failed'
const GUARDED_PROTOCOL_SCHEMES: GuardedProtocolScheme[] = ['clash', 'mihomo']
const PROTOCOL_CLIENT_GUARD_INTERVAL_MS = 15000
let protocolClientGuardTimer: NodeJS.Timeout | null = null
let protocolClientGuardRunning = false

/**
 * 开启 Chromium 底层日志落盘
 * 这类日志（如 disk_cache/gpu cache）不走 console.*，需要通过命令行开关单独捕获。
 */
function shouldEnableChromiumLogging() {
  if (VITE_DEV_SERVER_URL) return true
  const flag = String(process.env.LAGZERO_ENABLE_CHROMIUM_LOG || '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

function configureChromiumLogging() {
  if (!shouldEnableChromiumLogging()) return
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

function setupCrashReporter() {
  try {
    crashReporter.start({
      productName: pkg.productName || pkg.name,
      companyName: pkg.name,
      submitURL: 'https://lagzero.invalid/crash',
      uploadToServer: false,
      compress: true,
      ignoreSystemCrashHandler: false
    })
    console.info(`[Main] CrashReporter 已启用，dump 目录: ${app.getPath('crashDumps')}`)
  } catch (e) {
    console.warn('[Main] 启用 CrashReporter 失败:', e)
  }
}

function registerAppProtocolClient() {
  try {
    const context = getProtocolClientRegistrationContext()
    for (const scheme of APP_DEEP_LINK_SCHEMES) {
      if (isGuardedProtocolScheme(scheme) && !isGuardedProtocolSchemeEnabled(scheme)) {
        continue
      }
      registerProtocolClient(app, scheme, context)
    }
  } catch (e) {
    console.warn('[Main] 注册自定义协议失败:', e)
  }
}

function getProtocolClientRegistrationContext(): ProtocolClientRegistrationContext {
  return {
    execPath: process.execPath,
    argv: process.argv,
    defaultApp: !!process.defaultApp
  }
}

function isGuardedProtocolScheme(scheme: string): scheme is GuardedProtocolScheme {
  return GUARDED_PROTOCOL_SCHEMES.includes(scheme as GuardedProtocolScheme)
}

function getProtocolClientGuardSettings(): ProtocolClientGuardSettings {
  const normalized = normalizeProtocolClientGuardSettings(protocolClientSettingsStore.get())
  const current = protocolClientSettingsStore.get()
  if (
    current.guardClashScheme !== normalized.guardClashScheme
    || current.guardMihomoScheme !== normalized.guardMihomoScheme
  ) {
    protocolClientSettingsStore.set(normalized)
  }
  return normalized
}

function isGuardedProtocolSchemeEnabled(scheme: GuardedProtocolScheme): boolean {
  return isProtocolClientGuardEnabled(getProtocolClientGuardSettings(), scheme)
}

function getEnabledGuardedProtocolSchemes(): GuardedProtocolScheme[] {
  return GUARDED_PROTOCOL_SCHEMES.filter(isGuardedProtocolSchemeEnabled)
}

function getProtocolClientGuardState(scheme: GuardedProtocolScheme): ProtocolClientGuardState {
  const supported = process.platform === 'win32'
  const enabled = isGuardedProtocolSchemeEnabled(scheme)
  const isRegisteredToApp = supported
    ? isProtocolClientRegistered(app, scheme, getProtocolClientRegistrationContext())
    : false

  return buildProtocolClientGuardState({
    scheme,
    enabled,
    supported,
    isRegisteredToApp
  })
}

function setGuardedProtocolSchemeEnabled(scheme: GuardedProtocolScheme, enabled: boolean): ProtocolClientGuardState {
  const currentSettings = getProtocolClientGuardSettings()
  const nextSettings = normalizeProtocolClientGuardSettings({
    ...currentSettings,
    ...(scheme === 'clash' ? { guardClashScheme: !!enabled } : {}),
    ...(scheme === 'mihomo' ? { guardMihomoScheme: !!enabled } : {})
  })
  protocolClientSettingsStore.set(nextSettings)

  if (!getEnabledGuardedProtocolSchemes().length) {
    stopProtocolClientGuard()
    return getProtocolClientGuardState(scheme)
  }

  registerAppProtocolClient()
  ensureGuardedProtocolClients('startup')
  startProtocolClientGuard()
  return getProtocolClientGuardState(scheme)
}

function ensureGuardedProtocolClients(reason: 'startup' | 'activate' | 'periodic') {
  if (process.platform !== 'win32') return
  if (protocolClientGuardRunning) return

  const schemes = getEnabledGuardedProtocolSchemes()
  if (!schemes.length) return

  protocolClientGuardRunning = true
  try {
    const context = getProtocolClientRegistrationContext()
    for (const scheme of schemes) {
      const status = ensureProtocolClient(app, scheme, context)
      if (status === 'registered') {
        console.info(`[Main] 已重新接管 ${scheme}:// 协议 (${reason})`)
      } else if (status === 'failed') {
        console.warn(`[Main] ${scheme}:// 协议检测到被占用，但重新注册失败 (${reason})`)
      }
    }
  } catch (e) {
    console.warn('[Main] 协议守护检查失败:', e)
  } finally {
    protocolClientGuardRunning = false
  }
}

function startProtocolClientGuard() {
  if (process.platform !== 'win32') return
  if (!getEnabledGuardedProtocolSchemes().length) return
  if (protocolClientGuardTimer) return

  ensureGuardedProtocolClients('startup')
  protocolClientGuardTimer = setInterval(() => {
    ensureGuardedProtocolClients('periodic')
  }, PROTOCOL_CLIENT_GUARD_INTERVAL_MS)
  protocolClientGuardTimer.unref?.()
}

function stopProtocolClientGuard() {
  if (!protocolClientGuardTimer) return
  clearInterval(protocolClientGuardTimer)
  protocolClientGuardTimer = null
}

function queueDeepLinkImport(rawUrl: string | null | undefined) {
  const inspected = inspectAppDeepLink(String(rawUrl || '').trim())
  if (!inspected.ok) {
    return inspected
  }

  const pendingCountBefore = pendingDeepLinkImports.length
  const dispatchStatus = dispatchDeepLinkImport(inspected.payload)
  if (dispatchStatus !== 'dispatched') {
    pendingDeepLinkImports.push(inspected.payload)
  }
  return {
    ok: true as const,
    payload: inspected.payload,
    queueReason: dispatchStatus === 'dispatched' ? null : dispatchStatus,
    queued: pendingDeepLinkImports.length > pendingCountBefore
  }
}

function dispatchDeepLinkImport(payload: AppDeepLinkImportPayload): DeepLinkDispatchStatus {
  const win = windowManager.get()
  if (!win || win.isDestroyed()) {
    return 'window-missing'
  }
  if (!deepLinkRendererReady) {
    return 'renderer-not-ready'
  }

  try {
    win.webContents.send('app:deep-link-import', payload)
    return 'dispatched'
  } catch {
    return 'send-failed'
  }
}

function summarizeSubscriptionUrlForLog(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized) return '(empty)'
  try {
    const url = new URL(normalized)
    return `${url.origin}${url.pathname}`
  } catch {
    return normalized.slice(0, 160)
  }
}

function summarizeDeepLinkForLog(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized) return '(empty)'
  try {
    const url = new URL(normalized)
    const action = url.hostname.trim() || url.pathname.replace(/^\/+/, '').trim() || '(empty)'
    const target = String(
      url.searchParams.get('url')
      || url.searchParams.get('subscription')
      || url.searchParams.get('config')
      || ''
    ).trim()
    const targetSummary = target ? summarizeSubscriptionUrlForLog(target) : 'missing-subscription-url'
    return `${url.protocol}//${action} -> ${targetSummary}`
  } catch {
    return normalized.slice(0, 160)
  }
}

function describeDeepLinkParseFailure(reason: AppDeepLinkParseFailureReason): string {
  switch (reason) {
    case 'unsupported-action':
      return '外部导入链接动作不受支持，仅支持 import、install-config、subscribe、subscription。'
    case 'missing-subscription-url':
      return '外部导入链接里没有找到订阅地址参数（url / subscription / config）。'
    case 'invalid-subscription-url':
      return '外部导入链接里的订阅地址无效，必须是 http:// 或 https://。'
    case 'not-app-deep-link':
      return '这不是 LagZero 支持的外部导入协议链接。'
    case 'invalid-url':
    default:
      return '外部导入链接格式无效，客户端无法解析。'
  }
}

function reportDeepLinkImportParseFailure(rawUrl: string, reason: AppDeepLinkParseFailureReason) {
  const summary = summarizeDeepLinkForLog(rawUrl)
  const detail = describeDeepLinkParseFailure(reason)
  console.warn(`[Main] 外部导入协议解析失败 (${reason}): ${detail} | ${summary}`)
  dialog.showErrorBox(`${pkg.productName} 外部导入失败`, `${detail}\n\n${summary}`)
}

function handleIncomingDeepLink(rawUrl: string | null | undefined, options?: { showWindow?: boolean }) {
  const normalizedRawUrl = String(rawUrl || '').trim()
  if (!normalizedRawUrl) {
    return false
  }

  if (normalizedRawUrl) {
    console.info(`[Main] 收到外部导入协议: ${summarizeDeepLinkForLog(normalizedRawUrl)}`)
  }

  const queued = queueDeepLinkImport(normalizedRawUrl)
  if (!queued.ok) {
    reportDeepLinkImportParseFailure(queued.rawUrl, queued.reason)
    return false
  }

  if (!queued.queued) {
    console.info(`[Main] 外部导入已发送到渲染进程: ${summarizeDeepLinkForLog(queued.payload.rawUrl)}`)
  } else {
    const reasonLabel = queued.queueReason === 'window-missing'
      ? '主窗口不存在'
      : queued.queueReason === 'send-failed'
        ? '发送到渲染进程失败'
        : '渲染进程尚未声明就绪'
    console.info(
      `[Main] 外部导入已进入待处理队列 | 原因=${reasonLabel} | 当前排队=${pendingDeepLinkImports.length} | ${summarizeDeepLinkForLog(queued.payload.rawUrl)}`
    )
  }
  if (options?.showWindow !== false) {
    windowManager.show()
  }
  return true
}

configureChromiumLogging()
setupCrashReporter()
registerAppProtocolClient()

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
 * - 当前 userData 目录（Windows 打包版为 exe 同目录 data）
 * - 旧版 Windows Roaming(appData) 下的 LagZero 目录（迁移/重置兼容）
 */
function resolveResetTargetDirectories(): string[] {
  const appData = app.getPath('appData')
  const userData = app.getPath('userData')
  const candidates = [
    userData,
    ...getLegacyWindowsUserDataPaths()
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
  return getLaunchExecutablePath()
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
 * Close app without relaunch
 * @returns whether close was triggered
 */
function closeAppSafely(): boolean {
  try {
    app.quit()
    return true
  } catch (e) {
    console.error('[Main] Failed to close app:', e)
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
  ipcMain.handle('system:scan-local-games', async (event, sources?: string[]) => {
    const startedAt = Date.now()
    let lastScanDirProgressAt = 0
    let lastScanDir = ''
    console.info('[GameScan] 收到扫描请求')
    try {
      const result = await gameScannerService?.scanLocalGamesFromPlatforms(sources, (status, details) => {
        if (event.sender.isDestroyed()) return

        if (status === 'scanning_dir') {
          const now = Date.now()
          const dir = String(details || '')
          // 高频目录进度做节流，避免 IPC 风暴拖慢扫描。
          if (dir === lastScanDir && now - lastScanDirProgressAt < 1000) return
          if (now - lastScanDirProgressAt < 120) return
          lastScanDirProgressAt = now
          lastScanDir = dir
        }

        event.sender.send('system:scan-progress', { status, details })
      }) || []
      console.info(`[GameScan] 扫描请求完成 | 返回=${result.length} | 耗时=${Date.now() - startedAt}ms`)
      return result
    } catch (error) {
      console.error(`[GameScan] 扫描本地游戏失败 | 耗时=${Date.now() - startedAt}ms`, error)
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
  ipcMain.handle('app:get-protocol-guard-state', (_, scheme: GuardedProtocolScheme) => {
    if (!isGuardedProtocolScheme(scheme)) {
      throw new Error(`unsupported protocol guard scheme: ${String(scheme)}`)
    }
    return getProtocolClientGuardState(scheme)
  })
  ipcMain.handle('app:set-protocol-guard-enabled', (_, scheme: GuardedProtocolScheme, enabled: boolean) => {
    if (!isGuardedProtocolScheme(scheme)) {
      throw new Error(`unsupported protocol guard scheme: ${String(scheme)}`)
    }
    return setGuardedProtocolSchemeEnabled(scheme, !!enabled)
  })
  ipcMain.handle('app:consume-pending-deep-link-imports', () => {
    const queued = [...pendingDeepLinkImports]
    pendingDeepLinkImports.length = 0
    if (queued.length > 0) {
      console.info(`[Main] 渲染进程已就绪，开始处理 ${queued.length} 条等待中的外部导入请求`)
    }
    return queued
  })
  ipcMain.on('app:deep-link-renderer-ready', () => {
    deepLinkRendererReady = true
    console.info('[Main] 渲染进程已声明可接收外部导入事件')
  })
  ipcMain.on('app:deep-link-renderer-not-ready', () => {
    deepLinkRendererReady = false
    console.info('[Main] 渲染进程已声明暂不可接收外部导入事件')
  })
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
      console.info('[Main] Dev mode restart request: close app without relaunch.')
      return closeAppSafely()
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

    if (VITE_DEV_SERVER_URL) {
      console.info('[Main] Dev mode reset request: close app after cleanup.')
      return closeAppSafely()
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

  // 注册托盘通信 IPC
  ipcMain.on('tray:sync-state', (_, state) => {
    if (state && typeof state === 'object') {
      latestTrayStateVersion += 1
      latestTrayState = {
        ...(state as Record<string, unknown>),
        __version: latestTrayStateVersion
      }
    } else {
      latestTrayState = null
    }

    const trayWin = trayManager.getTrayWindow()
    if (trayWin && !trayWin.isDestroyed()) {
      trayWin.webContents.send('tray:state-updated', latestTrayState)
    }
  })

  ipcMain.handle('tray:get-state', () => latestTrayState)

  ipcMain.on('tray:action-toggle', () => {
    const mainWin = windowManager.get()
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('tray:do-toggle')
    }
  })
}

/**
 * 启动应用程序
 * 创建窗口、托盘图标并初始化服务
 */
function startApp() {
  const appIcon = loadAppIcon()
  const win = windowManager.create(appIcon)
  deepLinkRendererReady = false
  // Deep-link readiness is driven by explicit renderer IPC rather than generic page loading events,
  // otherwise later resource loads can incorrectly push imports back into the pending queue.
  win.webContents.on('did-start-loading', () => {
    console.info('[Main] 渲染进程开始加载页面')
  })
  win.webContents.on('did-finish-load', () => {
    console.info('[Main] 渲染进程 did-finish-load')
  })
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.warn(`[Main] 渲染进程 did-fail-load | code=${code} | description=${description}`)
  })

  // 重新创建托盘以绑定正确的窗口引用
  trayManager.destroy()
  // @ts-ignore: 我们知道这是在创建一个新的
  const newTrayManager = new TrayManager(win)
  newTrayManager.create(appIcon)
  newTrayManager.setStateGetter(() => latestTrayState)
  // 保持 trayManager 引用，防止被 GC
  Object.assign(trayManager, newTrayManager)

  initServices(win)
}

// 第二个实例启动时，唤起并聚焦已运行实例
app.on('second-instance', (_event, argv) => {
  const handled = handleIncomingDeepLink(findAppDeepLink(argv), { showWindow: true })
  if (!handled) {
    windowManager.show()
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleIncomingDeepLink(url, { showWindow: true })
})

// 监听所有窗口关闭事件
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 监听应用激活事件
app.on('activate', () => {
  ensureGuardedProtocolClients('activate')
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
    startProtocolClientGuard()
    startApp()
    handleIncomingDeepLink(findAppDeepLink(process.argv), { showWindow: false })
  })
  .catch((error) => {
    handleStartupError(error)
  })

// 全局未捕获异常处理
process.on('unhandledRejection', (reason) => {
  console.error('[Main] 未捕获的 Promise 拒绝:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[Main] 未捕获异常:', error)
})

app.on('render-process-gone', (_event, _webContents, details) => {
  console.error('[Main] 渲染进程退出:', details)
})

app.on('child-process-gone', (_event, details) => {
  console.error('[Main] 子进程退出:', details)
})

// 应用退出前清理
app.on('before-quit', (event) => {
  stopProtocolClientGuard()
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
