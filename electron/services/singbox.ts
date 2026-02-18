import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { app, BrowserWindow, ipcMain } from 'electron'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import https from 'node:https'
import { generateId } from '../utils/id'

import { normalizeProcessNames, areStringArraysEqual } from '../utils/process-helper'

const BIN_DIR = path.join(app.getPath('userData'), 'bin')

/**
 * Sing-box 核心服务
 * 
 * 负责管理 sing-box 内核的生命周期，包括：
 * 1. 自动下载与安装内核
 * 2. 启动/停止/重启内核进程
 * 3. 实时日志捕获与分发
 * 4. 动态更新路由规则 (Process Rules)
 */
export class SingBoxService {
  private process: ChildProcess | null = null
  private mainWindow: BrowserWindow | null = null
  private retryCount = 0
  private maxRetries = 3
  private downloadPromise: Promise<string> | null = null
  private lastLogs: string[] = []
  private isStopping = false
  private suppressNextStoppedStatus = false
  private processRuleUpdateQueue: Promise<void> = Promise.resolve()

  constructor(window: BrowserWindow) {
    this.mainWindow = window
    this.setupIPC()
  }

  private setupIPC() {
    ipcMain.handle('singbox-start', async (_, configContent: string) => {
        const configPath = path.join(app.getPath('userData'), 'config.json')
        await fs.writeFile(configPath, configContent)
        await this.start(configPath)
    })
    ipcMain.handle('singbox-stop', () => this.stop())
    ipcMain.handle('singbox-restart', async (_, configContent: string) => {
        this.suppressNextStoppedStatus = true
        await this.stopAndWaitForExit(5000)
        const configPath = path.join(app.getPath('userData'), 'config.json')
        await fs.writeFile(configPath, configContent)
        await this.start(configPath)
    })
  }

  async checkAndDownloadBinary() {
    await fs.ensureDir(BIN_DIR)
    const platform = process.platform
    const arch = process.arch
    const ext = platform === 'win32' ? '.exe' : ''
    const binPath = path.join(BIN_DIR, `sing-box${ext}`)

    if (await fs.pathExists(binPath)) {
      return binPath
    }

    if (!this.downloadPromise) {
      this.downloadPromise = this.downloadAndInstallBinary(platform, arch)
        .finally(() => {
          this.downloadPromise = null
        })
    }

    return this.downloadPromise
  }

  async start(configPath: string) {
    if (this.process) {
        this.log('Process already running', 'info')
        return
    }

    this.isStopping = false
    const binPath = await this.checkAndDownloadBinary()
    if (!await fs.pathExists(binPath)) {
      const msg = 'sing-box 可执行文件不存在，无法启动加速'
      this.log(msg, 'error')
      this.mainWindow?.webContents.send('singbox-error', msg)
      throw new Error(msg)
    }

    await this.validateConfig(binPath, configPath)

    this.log('正在启动 sing-box...')
    this.lastLogs = []
    const pushLog = (line: string) => {
      const trimmed = this.stripAnsi(String(line || '').trim())
      if (!trimmed) return
      this.lastLogs.push(trimmed)
      if (this.lastLogs.length > 80) this.lastLogs.shift()
    }

    this.process = spawn(binPath, ['run', '-c', configPath], { windowsHide: true, env: this.getSingboxEnv() })

    this.process.stdout?.on('data', (data) => {
      const text = data.toString().trim()
      pushLog(text)
      this.log(this.stripAnsi(text))
    })

    this.process.stderr?.on('data', (data) => {
      const text = data.toString().trim()
      pushLog(text)
      this.log(this.stripAnsi(text), 'error')
    })

    const started = await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      const startupTimer = setTimeout(() => {
        settle(() => resolve())
      }, 800)

      this.process?.once('error', (err) => {
        clearTimeout(startupTimer)
        const msg = `sing-box 启动失败：${String(err?.message || err)}`
        this.log(msg, 'error')
        this.mainWindow?.webContents.send('singbox-error', msg)
        settle(() => reject(new Error(msg)))
      })

      this.process?.once('close', (code) => {
        if (!settled) {
          clearTimeout(startupTimer)
          const detail = this.buildHelpfulErrorDetail(this.lastLogs)
          const last = this.lastLogs.at(-1)
          const msg = `sing-box 启动后立即退出（code=${String(code)}）${last ? `：${last}` : ''}${detail ? `\n\n${detail}` : ''}`
          this.log(msg, 'error')
          this.mainWindow?.webContents.send('singbox-error', msg)
          settle(() => reject(new Error(msg)))
        }
      })
    })

    this.process.on('close', (code) => {
      this.log(`sing-box exited with code ${code}`)
      this.process = null
      if (this.suppressNextStoppedStatus) {
        this.suppressNextStoppedStatus = false
      } else {
        this.sendStatus('stopped')
      }

      if (this.isStopping) return
      if (code !== 0 && this.retryCount < this.maxRetries) {
        this.retryCount++
        this.log(`Retrying start (${this.retryCount}/${this.maxRetries})...`)
        setTimeout(() => this.start(configPath), 2000)
      } else if (code !== 0) {
        const detail = this.buildHelpfulErrorDetail(this.lastLogs)
        const last = this.lastLogs.at(-1)
        const msg = `sing-box 启动失败（已重试 ${this.maxRetries} 次）${last ? `：${last}` : ''}${detail ? `\n\n${detail}` : ''}`
        this.log(msg, 'error')
        this.mainWindow?.webContents.send('singbox-error', msg)
      }
    })

    await started
    this.sendStatus('running')
    this.retryCount = 0
  }

  /**
   * 停止 sing-box
   */
  stop() {
    if (this.process) {
      this.isStopping = true
      this.retryCount = 0
      const current = this.process
      const pid = typeof current.pid === 'number' ? current.pid : null
      current.kill('SIGINT')
      setTimeout(() => {
        if (!this.process) return
    if (this.process !== current) return
    if (process.platform === 'win32' && pid) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      this.process.kill('SIGKILL')
    }
  }, 800)
}
  }

  private log(message: string, type: 'info' | 'error' = 'info') {
    console.log(`[SingBox] ${message}`)
    this.mainWindow?.webContents.send('singbox-log', { message, type, timestamp: Date.now() })
  }

  private sendStatus(status: 'running' | 'stopped') {
    this.mainWindow?.webContents.send('singbox-status', status)
  }

  private async validateConfig(binPath: string, configPath: string): Promise<void> {
    const { code, output } = await this.runOnce(binPath, ['check', '-c', configPath])
    if (code === 0) return

    const lines = output
      .split(/\r?\n/g)
      .map(l => this.stripAnsi(l.trim()))
      .filter(Boolean)
      .slice(-12)

    const detail = this.buildHelpfulErrorDetail(lines)
    const msg = `sing-box 配置校验失败（code=${String(code)}）${lines.length ? `：${lines.at(-1)}` : ''}${detail ? `\n\n${detail}` : ''}`
    this.log(msg, 'error')
    this.mainWindow?.webContents.send('singbox-error', msg)
    throw new Error(msg)
  }

  private runOnce(binPath: string, args: string[]): Promise<{ code: number, output: string }> {
    return new Promise((resolve) => {
      const p = spawn(binPath, args, { windowsHide: true, env: this.getSingboxEnv() })
      const chunks: Buffer[] = []
      const onData = (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d)))
      p.stdout?.on('data', onData)
      p.stderr?.on('data', onData)
      p.on('close', (code) => {
        resolve({ code: typeof code === 'number' ? code : -1, output: Buffer.concat(chunks).toString('utf8') })
      })
      p.on('error', () => {
        resolve({ code: -1, output: '无法执行 sing-box，请检查可执行文件是否完整' })
      })
    })
  }

  private buildHelpfulErrorDetail(lines: string[]): string {
    const text = lines.join('\n').toLowerCase()
    const hints: string[] = []
console.log(text);

    if (text.includes('create tun') || text.includes('tun') || text.includes('wintun') || text.includes('tunnel')) {
      hints.push('提示：当前使用 TUN 模式，Windows 下通常需要管理员权限，并且需要可用的 TUN/Wintun 支持。请尝试“以管理员身份运行”LagZero。')
    }

    if (text.includes('access is denied') || text.includes('permission denied') || text.includes('operation not permitted')) {
      hints.push('提示：看起来是权限不足导致启动失败，请尝试“以管理员身份运行”。')
    }

    if (text.includes('invalid') || text.includes('unknown field') || text.includes('parse') || text.includes('json')) {
      hints.push('提示：节点/配置参数可能不兼容当前 sing-box 版本，请把弹窗里的最后一行报错发我。')
    }

    if (text.includes('deprecated_special_outbounds') || text.includes('deprecated special outbounds') || text.includes('enable_deprecated_special_outbounds')) {
      hints.push('提示：当前 sing-box 版本要求开启兼容开关，我已在程序内自动注入环境变量 ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS=true。')
    }

    if (text.includes('deprecated_tun_address_x') || text.includes('deprecated tun address x') || text.includes('enable_deprecated_tun_address_x')) {
      hints.push('提示：当前 sing-box 版本要求开启 TUN 兼容开关，我已在程序内自动注入环境变量 ENABLE_DEPRECATED_TUN_ADDRESS_X=true。')
    }

    if (hints.length === 0) return ''
    return Array.from(new Set(hints)).join('\n')
  }

  private getSingboxEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS: 'true',
      ENABLE_DEPRECATED_TUN_ADDRESS_X: 'true'
    }
  }

  private stripAnsi(input: string): string {
    return input.replace(/\x1B\[[0-9;]*m/g, '')
  }

  /**
   * 动态更新进程匹配规则
   * 
   * 修改 config.json 中的 route.rules 和 dns.rules，添加或更新进程名列表，
   * 然后重启 sing-box 以生效。
   * 
   * @param processNames - 最新的需要代理的进程名列表
   */
  async updateProcessNames(processNames: string[]): Promise<void> {
    this.processRuleUpdateQueue = this.processRuleUpdateQueue
      .then(() => this.applyProcessNameUpdate(processNames))
      .catch((err) => {
        const msg = `更新进程规则失败: ${String((err as any)?.message || err)}`
        this.log(msg, 'error')
      })
    return this.processRuleUpdateQueue
  }

  private async applyProcessNameUpdate(processNames: string[]): Promise<void> {
    const configPath = path.join(app.getPath('userData'), 'config.json')
    if (!await fs.pathExists(configPath)) return
    if (!this.process) return

    const normalized = normalizeProcessNames(processNames)
    if (normalized.length === 0) return

    let configRaw = ''
    try {
      configRaw = await fs.readFile(configPath, 'utf8')
    } catch {
      return
    }

    let config: any
    try {
      config = JSON.parse(configRaw)
    } catch {
      return
    }

    let changed = false
    const routeRules = Array.isArray(config?.route?.rules) ? config.route.rules : []
    const routeRule = routeRules.find((r: any) => Array.isArray(r?.process_name) && r?.outbound === 'proxy')
    if (routeRule) {
      if (!areStringArraysEqual(routeRule.process_name, normalized)) {
        routeRule.process_name = normalized
        changed = true
      }
    } else {
      routeRules.push({ process_name: normalized, outbound: 'proxy' })
      if (config?.route) config.route.rules = routeRules
      changed = true
    }

    const dnsRules = Array.isArray(config?.dns?.rules) ? config.dns.rules : []
    const hasRemotePrimaryServer = Array.isArray(config?.dns?.servers)
      && config.dns.servers.some((s: any) => s?.tag === 'remote-primary')
    if (hasRemotePrimaryServer) {
      const dnsRule = dnsRules.find((r: any) => Array.isArray(r?.process_name) && r?.server === 'remote-primary')
      if (dnsRule) {
        if (!areStringArraysEqual(dnsRule.process_name, normalized)) {
          dnsRule.process_name = normalized
          changed = true
        }
      } else {
        dnsRules.unshift({ process_name: normalized, server: 'remote-primary' })
        if (config?.dns) config.dns.rules = dnsRules
        changed = true
      }
    }

    if (!changed) return

    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
    this.log(`检测到子进程，已更新进程匹配规则(${normalized.length})并重启 sing-box`)
    await this.restartWithCurrentConfig(configPath)
  }

  private async restartWithCurrentConfig(configPath: string): Promise<void> {
    this.suppressNextStoppedStatus = true
    await this.stopAndWaitForExit(5000)
    await this.start(configPath)
  }

  private async stopAndWaitForExit(timeoutMs: number): Promise<void> {
    if (!this.process) return
    const current = this.process
    this.stop()
    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }

      const timer = setTimeout(finish, timeoutMs)
      current.once('close', () => {
        clearTimeout(timer)
        finish()
      })
    })
  }

  private async downloadAndInstallBinary(platform: NodeJS.Platform, arch: string): Promise<string> {
    const ext = platform === 'win32' ? '.exe' : ''
    const binPath = path.join(BIN_DIR, `sing-box${ext}`)

    if (await fs.pathExists(binPath)) return binPath

    this.log('未检测到 sing-box，开始自动下载...')

    const { version, downloadUrl, archiveExt } = await this.resolveLatestReleaseDownload(platform, arch)

    const archivePath = path.join(BIN_DIR, `sing-box-${version}${archiveExt}`)
    const extractDir = path.join(BIN_DIR, `tmp-${generateId()}`)

    try {
      await fs.ensureDir(extractDir)
      await this.downloadToFile(downloadUrl, archivePath)
      await this.extractAndInstall(archivePath, archiveExt, extractDir, binPath, platform === 'win32')

      if (!await fs.pathExists(binPath)) {
        throw new Error('安装完成后仍未找到 sing-box 可执行文件')
      }

      this.log(`sing-box 已安装：${binPath}`)
      return binPath
    } catch (e: any) {
      const msg = `sing-box 自动下载/安装失败：${String(e?.message || e)}`
      this.log(msg, 'error')
      this.mainWindow?.webContents.send('singbox-error', msg)
      throw new Error(msg)
    } finally {
      await fs.remove(extractDir).catch(() => {})
      await fs.remove(archivePath).catch(() => {})
    }
  }

  private async resolveLatestReleaseDownload(platform: NodeJS.Platform, arch: string): Promise<{ version: string, downloadUrl: string, archiveExt: string }> {
    const platformName = platform === 'win32' ? 'windows'
      : platform === 'darwin' ? 'darwin'
      : platform === 'linux' ? 'linux'
      : null

    if (!platformName) {
      throw new Error(`不支持的平台：${platform}`)
    }

    const archName = arch === 'x64' ? 'amd64'
      : arch === 'arm64' ? 'arm64'
      : arch === 'ia32' ? '386'
      : null

    if (!archName) {
      throw new Error(`不支持的架构：${arch}`)
    }

    const archiveExt = platformName === 'windows' ? '.zip' : '.tar.gz'

    const release = await this.fetchJson<any>('https://api.github.com/repos/SagerNet/sing-box/releases/latest')
    const tagName = String(release?.tag_name || '')
    const version = tagName.startsWith('v') ? tagName.slice(1) : tagName
    if (!version) throw new Error('无法解析 sing-box 版本号')

    const assetName = `sing-box-${version}-${platformName}-${archName}${archiveExt}`
    const assets: any[] = Array.isArray(release?.assets) ? release.assets : []
    const asset = assets.find(a => String(a?.name || '') === assetName)
    const downloadUrl = String(asset?.browser_download_url || '')

    if (!downloadUrl) {
      throw new Error(`未找到对应的发布包：${assetName}`)
    }

    return { version, downloadUrl, archiveExt }
  }

  private fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'LagZero',
          'Accept': 'application/vnd.github+json'
        }
      }, (res) => {
        const status = res.statusCode || 0
        const chunks: Buffer[] = []

        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if (status >= 300) {
            reject(new Error(`请求失败（${status}）：${body.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(body) as T)
          } catch (e) {
            reject(new Error('解析 JSON 失败'))
          }
        })
      })

      req.on('error', reject)
      req.end()
    })
  }

  private async downloadToFile(url: string, destPath: string): Promise<void> {
    await fs.ensureDir(path.dirname(destPath))

    const doRequest = (u: string, redirectLeft: number): Promise<void> => new Promise((resolve, reject) => {
      const req = https.request(u, {
        method: 'GET',
        headers: { 'User-Agent': 'LagZero' }
      }, (res) => {
        const status = res.statusCode || 0
        const location = res.headers.location
        if ([301, 302, 303, 307, 308].includes(status) && location && redirectLeft > 0) {
          res.resume()
          resolve(doRequest(location, redirectLeft - 1))
          return
        }
        if (status >= 300) {
          reject(new Error(`下载失败（${status}）`))
          res.resume()
          return
        }

        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        let lastLoggedBucket = -1
        const fileStream = createWriteStream(destPath)

        res.on('data', (chunk) => {
          received += Buffer.byteLength(chunk)
          if (total > 0) {
            const pct = Math.floor((received / total) * 100)
            const bucket = Math.floor(pct / 20) * 20
            if (bucket !== lastLoggedBucket && bucket <= 100) {
              lastLoggedBucket = bucket
              this.log(`正在下载 sing-box：${bucket}%`)
            }
          }
        })

        pipeline(res as unknown as Readable, fileStream)
          .then(() => resolve())
          .catch(reject)
      })

      req.on('error', reject)
      req.end()
    })

    await doRequest(url, 5)
  }

  private async extractAndInstall(
    archivePath: string,
    archiveExt: string,
    extractDir: string,
    binPath: string,
    isWindows: boolean
  ): Promise<void> {
    if (archiveExt === '.zip') {
      const zip = new AdmZip(archivePath)
      zip.extractAllTo(extractDir, true)
    } else if (archiveExt === '.tar.gz') {
      await tar.x({ file: archivePath, cwd: extractDir })
    } else {
      throw new Error(`不支持的压缩格式：${archiveExt}`)
    }

    const exeName = isWindows ? 'sing-box.exe' : 'sing-box'
    const exePath = await this.findFileRecursive(extractDir, exeName)
    if (!exePath) {
      throw new Error('解压后未找到 sing-box 可执行文件')
    }

    await fs.copyFile(exePath, binPath)

    if (isWindows) {
      const exeDir = path.dirname(exePath)
      const entries = await fs.readdir(exeDir, { withFileTypes: true })
      const dlls = entries
        .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.dll'))
        .map(e => path.join(exeDir, e.name))

      for (const dll of dlls) {
        const target = path.join(BIN_DIR, path.basename(dll))
        await fs.copyFile(dll, target)
      }
    }

    await fs.chmod(binPath, 0o755).catch(() => {})
  }

  private async findFileRecursive(rootDir: string, fileName: string): Promise<string | null> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(rootDir, entry.name)
      if (entry.isFile() && entry.name === fileName) return full
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const found = await this.findFileRecursive(path.join(rootDir, entry.name), fileName)
      if (found) return found
    }
    return null
  }
}
