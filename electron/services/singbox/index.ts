import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { app, BrowserWindow, ipcMain } from 'electron'
import { SingBoxInstaller } from './installer'
import { SingBoxConfigManager } from './config'
import { getSingboxEnv, stripAnsi } from './utils'

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
  private retryTimer: NodeJS.Timeout | null = null
  private lastLogs: string[] = []
  private isStopping = false
  private suppressNextStoppedStatus = false
  private processRuleUpdateQueue: Promise<void> = Promise.resolve()

  private installer: SingBoxInstaller
  private configManager: SingBoxConfigManager

  constructor(window: BrowserWindow) {
    this.mainWindow = window
    const logFn = (msg: string, type: 'info' | 'error' = 'info') => this.log(msg, type)
    this.installer = new SingBoxInstaller(logFn, (status) => {
      this.safeSend('singbox-installer-status', status)
    })
    this.configManager = new SingBoxConfigManager(logFn)
    this.setupIPC()
  }

  /**
   * 注册 IPC 监听器
   */
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
    ipcMain.handle('singbox-ensure-core', async () => {
      await this.installer.checkAndDownloadBinary()
    })
    ipcMain.handle('singbox-get-install-info', async () => {
      const exists = await this.installer.checkBinaryExists()
      return {
        exists,
        installDir: this.installer.getInstallDir(),
        binaryPath: this.installer.getBinaryPath()
      }
    })
  }

  /**
   * 启动 sing-box 内核
   * @param configPath 配置文件路径
   */
  async start(configPath: string) {
    if (this.process) {
        this.log('进程已在运行', 'info')
        return
    }

    this.clearRetryTimer()
    this.isStopping = false
    const configExists = await fs.pathExists(configPath)
    if (!configExists) {
      const msg = `sing-box 配置文件不存在：${configPath}`
      this.log(msg, 'error')
      this.safeSend('singbox-error', msg)
      throw new Error(msg)
    }

    const binPath = await this.installer.checkAndDownloadBinary()
    
    try {
      await this.configManager.validateConfig(binPath, configPath)
    } catch (e: any) {
      this.safeSend('singbox-error', e.message)
      throw e
    }

    this.log('正在启动 sing-box...')
    this.lastLogs = []
    const pushLog = (line: string) => {
      const trimmed = stripAnsi(String(line || '').trim())
      if (!trimmed) return
      this.lastLogs.push(trimmed)
      if (this.lastLogs.length > 80) this.lastLogs.shift()
    }

    this.process = spawn(binPath, ['run', '-c', configPath], { windowsHide: true, env: getSingboxEnv() })

    this.process.stdout?.on('data', (data) => {
      const text = data.toString().trim()
      pushLog(text)
      this.log(stripAnsi(text))
    })

    this.process.stderr?.on('data', (data) => {
      const text = data.toString().trim()
      pushLog(text)
      this.log(stripAnsi(text), 'error')
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
        this.safeSend('singbox-error', msg)
        settle(() => reject(new Error(msg)))
      })

      this.process?.once('close', (code) => {
        if (!settled) {
          clearTimeout(startupTimer)
          const detail = this.configManager.buildHelpfulErrorDetail(this.lastLogs)
          const last = this.lastLogs.at(-1)
          const msg = `sing-box 启动后立即退出（code=${String(code)}）${last ? `：${last}` : ''}${detail ? `\n\n${detail}` : ''}`
          this.log(msg, 'error')
          this.safeSend('singbox-error', msg)
          settle(() => reject(new Error(msg)))
        }
      })
    })

    this.process.on('close', (code) => {
      this.log(`sing-box 退出，代码 ${code}`)
      this.process = null
      if (this.suppressNextStoppedStatus) {
        this.suppressNextStoppedStatus = false
      } else {
        this.sendStatus('stopped')
      }

      if (this.isStopping) return
      if (code !== 0 && this.retryCount < this.maxRetries) {
        this.retryCount++
        this.log(`正在重试启动 (${this.retryCount}/${this.maxRetries})...`)
        this.retryTimer = setTimeout(() => {
          void this.start(configPath).catch((err) => {
            this.log(`自动重试启动失败：${String((err as any)?.message || err)}`, 'error')
          })
        }, 2000)
      } else if (code !== 0) {
        const detail = this.configManager.buildHelpfulErrorDetail(this.lastLogs)
        const last = this.lastLogs.at(-1)
        const msg = `sing-box 启动失败（已重试 ${this.maxRetries} 次）${last ? `：${last}` : ''}${detail ? `\n\n${detail}` : ''}`
        this.log(msg, 'error')
        this.safeSend('singbox-error', msg)
      }
    })

    await started
    this.sendStatus('running')
    this.retryCount = 0
  }

  /**
   * 停止 sing-box 内核
   */
  stop() {
    this.clearRetryTimer()
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
    this.safeSend('singbox-log', { message, type, timestamp: Date.now() })
  }

  private sendStatus(status: 'running' | 'stopped') {
    this.safeSend('singbox-status', status)
  }

  /**
   * 动态更新进程匹配规则
   * 
   * @param processNames 需要代理的进程名列表
   */
  async updateProcessNames(processNames: string[]): Promise<void> {
    this.processRuleUpdateQueue = this.processRuleUpdateQueue
      .then(async () => {
        const changed = await this.configManager.updateProcessNames(processNames)
        if (changed && this.process) {
            const configPath = path.join(app.getPath('userData'), 'config.json')
            this.log(`检测到子进程，已更新进程匹配规则(${processNames.length})并重启 sing-box`)
            await this.restartWithCurrentConfig(configPath)
        }
      })
      .catch((err) => {
        const msg = `更新进程规则失败: ${String((err as any)?.message || err)}`
        this.log(msg, 'error')
      })
    return this.processRuleUpdateQueue
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

  private clearRetryTimer() {
    if (!this.retryTimer) return
    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private safeSend(channel: string, payload: any) {
    try {
      const win = this.mainWindow
      if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
      win.webContents.send(channel, payload)
    } catch {
      // Ignore renderer IPC errors during app shutdown/restart.
    }
  }
}
