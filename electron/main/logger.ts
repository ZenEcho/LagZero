import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { inspect } from 'util'
import { generateId } from '../utils/id'
import pkg from '../../package.json'
import os from 'os'

/**
 * 应用日志级别
 */
type AppLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * 应用日志分类
 * - frontend: 渲染进程日志
 * - backend: 主进程业务日志
 * - core: sing-box 内核日志
 */
type AppLogCategory = 'frontend' | 'backend' | 'core'

/**
 * 日志条目结构
 */
export type AppLogEntry = {
  /** 唯一日志 ID */
  id: string
  /** 时间戳 */
  timestamp: number
  /** 日志级别 */
  level: AppLogLevel
  /** 日志分类 */
  category: AppLogCategory
  /** 日志来源模块 */
  source: string
  /** 主要消息内容 */
  message: string
  /** 详细信息 (可选) */
  detail?: string
}

const MAX_LOG_ENTRIES = 3000
const appLogs: AppLogEntry[] = []
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024
const MAX_LOG_DIR_BYTES = 500 * 1024 * 1024
const LOG_WRITE_FLUSH_INTERVAL_MS = 250
const LOG_WRITE_FLUSH_MAX_LINES = 40
const LOG_PRUNE_INTERVAL_MS = 60 * 1000
const LOG_FILE_PREFIX = pkg.name
let logWriteChain: Promise<void> = Promise.resolve()
let sessionLogFilePath = ''
let sessionLogFileSizeBytes = 0
let sessionLogFileSizeKnown = false
let pendingLogLines: string[] = []
let logFlushTimer: NodeJS.Timeout | null = null
let lastPruneAt = 0

/**
 * 获取日志文件存储目录
 */
function getAppLogDir() {
  return path.join(app.getPath('userData'), 'logs')
}

/**
 * 获取当前会话的日志文件路径
 * 格式: {userData}/logs/{appName}-{timestamp}-{pid}.log
 */
function getAppLogFilePath() {
  if (sessionLogFilePath) return sessionLogFilePath
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  sessionLogFilePath = path.join(getAppLogDir(), `${LOG_FILE_PREFIX}-${stamp}-${process.pid}.log`)
  return sessionLogFilePath
}

/**
 * 将日志写入任务加入队列，确保按顺序写入文件
 */
function queueLogWrite(task: () => Promise<void>) {
  logWriteChain = logWriteChain
    .then(task)
    .catch(() => {
      // Avoid recursive logging when filesystem write fails.
    })
}

/**
   * 净化日志文本
   * 
   * 移除换行符等特殊字符，防止日志格式错乱。
   */
function sanitizeLogText(text?: string) {
  if (!text) return ''
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 格式化单行日志
 * 
 * 格式: [ISO时间] [LEVEL] [CATEGORY] [SOURCE] MESSAGE
 */
function formatLogLine(row: AppLogEntry) {
  const iso = new Date(row.timestamp).toISOString()
  const base = `[${iso}] [${row.level.toUpperCase()}] [${row.category}] [${row.source}] ${sanitizeLogText(row.message)}`
  if (!row.detail) return `${base}\n`
  return `${base}\n${sanitizeLogText(row.detail)}\n`
}

/**
 * 确保单个日志文件大小不超过限制
 * 
 * 如果超过限制 (MAX_LOG_FILE_BYTES)，则清空文件内容（简单轮转策略）。
 */
async function ensureSessionLogFileSizeKnown(logFilePath: string) {
  if (sessionLogFileSizeKnown) return
  if (!await fs.pathExists(logFilePath)) {
    sessionLogFileSizeBytes = 0
    sessionLogFileSizeKnown = true
    return
  }
  const stat = await fs.stat(logFilePath)
  sessionLogFileSizeBytes = stat.size
  sessionLogFileSizeKnown = true
}

async function ensureSingleFileLimit(logFilePath: string, incomingBytes: number) {
  await ensureSessionLogFileSizeKnown(logFilePath)
  if (sessionLogFileSizeBytes + incomingBytes <= MAX_LOG_FILE_BYTES) return
  await fs.truncate(logFilePath, 0)
  sessionLogFileSizeBytes = 0
  sessionLogFileSizeKnown = true
}

/**
 * 清理过期的日志文件
 * 
 * 如果日志目录总大小超过限制 (MAX_LOG_DIR_BYTES)，则删除最旧的文件。
 */
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

async function maybePruneLogDirIfNeeded(logDir: string, force = false) {
  const now = Date.now()
  if (!force && now - lastPruneAt < LOG_PRUNE_INTERVAL_MS) return
  lastPruneAt = now
  await pruneLogDirIfNeeded(logDir)
}

function getNetworkIpv4Summary() {
  const networkInterfaces = os.networkInterfaces()
  const result: string[] = []

  for (const [name, infos] of Object.entries(networkInterfaces)) {
    if (!infos) continue
    for (const info of infos) {
      const isIpv4 = (info.family as string | number) === 'IPv4' || (info.family as string | number) === 4
      if (info.internal || !isIpv4) continue
      result.push(`${name}:${info.address}`)
    }
  }

  return result.join(' | ')
}

function formatGpuDetails(gpuInfo: any) {
  if (!gpuInfo?.gpuDevice?.length) return ''
  return gpuInfo.gpuDevice.map((g: any) => {
    const parts: string[] = []
    if (g.active) parts.push('Active')
    if (g.vendorId) parts.push(`Vendor: 0x${g.vendorId.toString(16).padStart(4, '0')}`)
    if (g.deviceId) parts.push(`Device: 0x${g.deviceId.toString(16).padStart(4, '0')}`)
    if (g.driverVendor) parts.push(`DriverVendor: ${g.driverVendor}`)
    if (g.driverVersion) parts.push(`Driver: ${g.driverVersion}`)
    if (g.vendorString) parts.push(`VendorName: ${g.vendorString}`)
    if (g.deviceString) parts.push(`DeviceName: ${g.deviceString}`)
    return parts.join(' ')
  }).join(' | ')
}

async function writeStartupSection() {
  const logFilePath = getAppLogFilePath()
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'
  const offsetMin = -now.getTimezoneOffset()
  const offsetSign = offsetMin >= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetMin)
  const offsetHours = String(Math.floor(offsetAbs / 60)).padStart(2, '0')
  const offsetMins = String(offsetAbs % 60).padStart(2, '0')
  const tzOffset = `${offsetSign}${offsetHours}:${offsetMins}`
  const appUptimeSec = Math.floor(process.uptime())
  const osUptimeSec = Math.floor(os.uptime())
  const appUptimeMin = (appUptimeSec / 60).toFixed(1)
  const osUptimeHours = (osUptimeSec / 3600).toFixed(1)

  const cpus = os.cpus()
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU'
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2)
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2)
  const usedMemPercent = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1)
  const osLoadAvg = os.loadavg().map((n) => n.toFixed(2)).join(', ')
  const locale = app.getLocale()
  const launchArgs = process.argv.slice(1).join(' ')
  const memoryUsage = process.memoryUsage()
  const memoryRssMB = (memoryUsage.rss / 1024 / 1024).toFixed(1)
  const memoryHeapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(1)
  const memoryHeapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(1)

  let osVersion = ''
  try {
    osVersion = os.version()
  } catch {
    // ignore
  }

  let userName = ''
  let userHome = ''
  try {
    const userInfo = os.userInfo()
    userName = userInfo.username || ''
    userHome = userInfo.homedir || ''
  } catch {
    // ignore
  }

  const networkSummary = getNetworkIpv4Summary()

  let gpuDetails = ''
  try {
    const info = await app.getGPUInfo('basic') as any
    gpuDetails = formatGpuDetails(info)
  } catch (e) {
    // ignore
  }

  const section = [
    '',
    '='.repeat(88),
    `Session Start: ${now.toISOString()}`,
    `Local Time: ${now.toLocaleString()} | TZ: ${timezone} (UTC${tzOffset})`,
    `Version: ${app.getVersion()} | PID: ${process.pid} | Platform: ${process.platform} ${process.arch}`,
    `Electron: ${process.versions.electron} | Node: ${process.versions.node} | Chromium: ${process.versions.chrome} | V8: ${process.versions.v8}`,
    `OS: ${os.type()} ${os.release()}${osVersion ? ` (${osVersion})` : ''} | Host: ${os.hostname()} | Machine: ${os.machine()}`,
    `User: ${userName || 'Unknown'} | Home: ${userHome || 'Unknown'} | Locale: ${locale}`,
    `CPU: ${cpuModel} (${cpus.length} cores)`,
    `Memory: ${totalMem} GB Total | ${freeMem} GB Free | Used: ${usedMemPercent}%`,
    `MainProcess Memory: RSS ${memoryRssMB} MB | Heap ${memoryHeapUsedMB}/${memoryHeapTotalMB} MB`,
    `Uptime: App ${appUptimeSec}s (${appUptimeMin} min) | OS ${osUptimeSec}s (${osUptimeHours} h)`,
    `LoadAvg (1/5/15m): ${osLoadAvg}`,
    networkSummary ? `Network IPv4: ${networkSummary}` : null,
    `ExecPath: ${process.execPath}`,
    `CWD: ${process.cwd()}`,
    `App Paths: userData=${app.getPath('userData')} temp=${app.getPath('temp')} logs=${path.dirname(logFilePath)}`,
    launchArgs ? `Launch Args: ${launchArgs}` : null,
    gpuDetails ? `GPU: ${gpuDetails}` : null,
    '='.repeat(88),
    ''
  ].filter(Boolean).join('\n')

  await fs.ensureDir(path.dirname(logFilePath))
  await fs.writeFile(logFilePath, section, 'utf8')
  sessionLogFileSizeBytes = Buffer.byteLength(section, 'utf8')
  sessionLogFileSizeKnown = true
  await maybePruneLogDirIfNeeded(path.dirname(logFilePath), true)
}

function flushPendingLogLines() {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer)
    logFlushTimer = null
  }
  if (pendingLogLines.length === 0) return

  const chunk = pendingLogLines.join('')
  pendingLogLines = []
  const logFilePath = getAppLogFilePath()
  const bytes = Buffer.byteLength(chunk, 'utf8')

  queueLogWrite(async () => {
    await fs.ensureDir(path.dirname(logFilePath))
    await ensureSingleFileLimit(logFilePath, bytes)
    await fs.appendFile(logFilePath, chunk, 'utf8')
    sessionLogFileSizeBytes += bytes
    sessionLogFileSizeKnown = true
    await maybePruneLogDirIfNeeded(path.dirname(logFilePath))
  })
}

function scheduleLogFlush(immediate = false) {
  if (logFlushTimer) return
  logFlushTimer = setTimeout(() => {
    flushPendingLogLines()
  }, immediate ? 0 : LOG_WRITE_FLUSH_INTERVAL_MS)
}

function appendLogToFile(row: AppLogEntry) {
  pendingLogLines.push(formatLogLine(row))
  if (pendingLogLines.length >= LOG_WRITE_FLUSH_MAX_LINES) {
    scheduleLogFlush(true)
    return
  }
  scheduleLogFlush(false)
}

function pushAppLog(entry: Omit<AppLogEntry, 'id' | 'timestamp'>, win?: BrowserWindow | null) {
  const row: AppLogEntry = {
    id: generateId(),
    timestamp: Date.now(),
    ...entry
  }
  appLogs.push(row)
  if (appLogs.length > MAX_LOG_ENTRIES) appLogs.shift()
  try {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('app-log:new', row)
    }
  } catch {
    // Ignore IPC emit failures during shutdown/restart.
  }
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

function normalizeFrontendPayload(payload: Partial<AppLogEntry>): Omit<AppLogEntry, 'id' | 'timestamp'> {
  const level: AppLogLevel = payload.level === 'debug' || payload.level === 'warn' || payload.level === 'error'
    ? payload.level
    : 'info'

  return {
    level,
    category: 'frontend',
    source: String(payload.source || 'renderer'),
    message: truncateLogText(String(payload.message || '(empty)')),
    detail: payload.detail ? truncateLogText(String(payload.detail)) : undefined
  }
}

/**
 * 初始化并配置日志系统
 * 
 * 1. 拦截 console 方法，将日志重定向到文件和内存存储
 * 2. 写入启动日志头
 * 3. 注册 IPC 处理程序，供前端获取和推送日志
 * 
 * @param getWin - 获取主窗口实例的回调函数，用于向前端广播新日志
 */
export function setupLogger(getWin: () => BrowserWindow | null) {
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
        message: text || '(空)'
      }, getWin())
    }
  }

  install('debug', 'debug')
  install('info', 'info')
  install('warn', 'warn')
  install('error', 'error')
  install('log', 'info')

  queueLogWrite(writeStartupSection)
  const flushNow = () => flushPendingLogLines()
  app.on('before-quit', flushNow)
  process.on('exit', flushNow)

  pushAppLog({
    level: 'info',
    category: 'backend',
    source: 'logger',
    message: `应用日志文件: ${getAppLogFilePath()}`
  }, getWin())

  ipcMain.handle('logs:get-all', () => appLogs)
  ipcMain.handle('logs:clear', () => {
    appLogs.length = 0
    if (logFlushTimer) {
      clearTimeout(logFlushTimer)
      logFlushTimer = null
    }
    pendingLogLines = []
    sessionLogFileSizeBytes = 0
    sessionLogFileSizeKnown = false
    lastPruneAt = 0

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
  ipcMain.handle('logs:get-dir-path', () => getAppLogDir())
  ipcMain.handle('logs:push-frontend', (_, payload: Partial<AppLogEntry>) => {
    pushAppLog(normalizeFrontendPayload(payload), getWin())
  })
  ipcMain.handle('logs:push-frontend-batch', (_, payloads: Partial<AppLogEntry>[]) => {
    if (!Array.isArray(payloads) || payloads.length === 0) return
    const max = Math.min(payloads.length, 200)
    const win = getWin()
    for (let i = 0; i < max; i += 1) {
      pushAppLog(normalizeFrontendPayload(payloads[i] || {}), win)
    }
  })
}
