import { BrowserWindow, NativeImage, app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import pkg from '../../package.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = process.env.APP_ROOT || path.join(__dirname, path.basename(__dirname) === 'main' ? '../..' : '..')
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
type WindowCloseAction = 'ask' | 'minimize' | 'quit'
type WindowCloseDecision = WindowCloseAction | 'cancel'

/**
 * 窗口管理器
 * 负责主窗口的创建、配置和生命周期管理
 */
export class WindowManager {
  private win: BrowserWindow | null = null
  private allowWindowClose = false
  private closingPromptVisible = false
  private windowCloseAction: WindowCloseAction = 'ask'

  constructor() {
    this.loadWindowCloseAction()
    app.on('before-quit', () => {
      this.allowWindowClose = true
    })
    this.setupIPC()
  }

  /**
   * 创建主窗口
   * @param icon 窗口图标
   * @returns BrowserWindow 实例
   */
  create(icon: NativeImage | null): BrowserWindow {
    const preloadCandidates = [
      path.join(__dirname, 'index.mjs'),
      path.join(__dirname, '../preload/index.mjs'),
      path.join(__dirname, 'preload.mjs'),
    ]
    const preloadPath = preloadCandidates.find(p => fs.existsSync(p)) || preloadCandidates[0]
    console.info('[Main] 已选择 preload 脚本:', preloadPath)

    this.win = new BrowserWindow({
      title: pkg.productName,
      width: 1200,
      height: 800,
      minWidth: 960,
      minHeight: 720,
      show: true,
      frame: false,
      paintWhenInitiallyHidden: false,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: Boolean(VITE_DEV_SERVER_URL),
        spellcheck: false,
        backgroundThrottling: true,
      },
      backgroundColor: '#1e1e1e',
      ...(icon ? { icon } : {}),
    })

    if (VITE_DEV_SERVER_URL) {
      this.win.loadURL(VITE_DEV_SERVER_URL)
      this.win.webContents.openDevTools()
    } else {
      this.win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }

    this.win.once('ready-to-show', () => {
      this.win?.show()
    })
    this.win.on('close', (event) => {
      if (this.allowWindowClose) return
      event.preventDefault()
      void this.handleCloseRequest()
    })
    this.win.on('closed', () => {
      this.win = null
    })

    return this.win
  }

  /**
   * 获取当前窗口实例
   */
  get() {
    return this.win
  }

  /**
   * 显示并聚焦窗口
   */
  show() {
    this.win?.show()
    this.win?.focus()
  }

  /**
   * 注册窗口控制相关的 IPC 事件
   */
  private setupIPC() {
    ipcMain.handle('window-minimize', () => this.win?.minimize())
    ipcMain.handle('window-maximize', () => {
      if (this.win && this.win.isMaximized()) {
        this.win.unmaximize()
      } else if (this.win) {
        this.win.maximize()
      }
    })
    ipcMain.handle('window-close', () => this.win?.close())
    ipcMain.handle('window-get-close-action', () => this.windowCloseAction)
    ipcMain.handle('window-set-close-action', (_, action: unknown) => {
      const nextAction = this.normalizeWindowCloseAction(action)
      this.windowCloseAction = nextAction
      this.saveWindowCloseAction(nextAction)
      return this.windowCloseAction
    })
    ipcMain.handle('window-submit-close-decision', (_, payload: unknown) => {
      const { action, remember } = this.normalizeCloseDecisionPayload(payload)
      if (action === 'cancel') {
        this.closingPromptVisible = false
        return false
      }

      if (remember) {
        this.windowCloseAction = action
        this.saveWindowCloseAction(action)
      }

      this.closingPromptVisible = false
      this.performCloseAction(action)
      return true
    })
    ipcMain.handle('window-open-devtools', () => this.win?.webContents.openDevTools())
  }

  private getWindowCloseSettingsPath(): string {
    return path.join(app.getPath('userData'), 'window-close-settings.json')
  }

  private normalizeWindowCloseAction(action: unknown): WindowCloseAction {
    return action === 'minimize' || action === 'quit' ? action : 'ask'
  }

  private normalizeCloseDecisionPayload(payload: unknown): { action: WindowCloseDecision, remember: boolean } {
    if (!payload || typeof payload !== 'object') {
      return { action: 'cancel', remember: false }
    }
    const record = payload as { action?: unknown, remember?: unknown }
    const action = record.action === 'minimize' || record.action === 'quit' || record.action === 'cancel'
      ? record.action
      : 'cancel'
    return { action, remember: !!record.remember }
  }

  private loadWindowCloseAction() {
    try {
      const settingsPath = this.getWindowCloseSettingsPath()
      const raw = fs.readJsonSync(settingsPath, { throws: false }) as { action?: unknown } | null
      this.windowCloseAction = this.normalizeWindowCloseAction(raw?.action)
    } catch {
      this.windowCloseAction = 'ask'
    }
  }

  private saveWindowCloseAction(action: WindowCloseAction) {
    try {
      const settingsPath = this.getWindowCloseSettingsPath()
      fs.ensureDirSync(path.dirname(settingsPath))
      fs.writeJsonSync(settingsPath, { action }, { spaces: 2 })
    } catch (e) {
      console.warn('[Main] 保存窗口关闭偏好失败:', e)
    }
  }

  private performCloseAction(action: WindowCloseAction) {
    if (!this.win || this.win.isDestroyed()) return
    if (action === 'quit') {
      this.allowWindowClose = true
      app.quit()
      return
    }
    this.win.hide()
  }

  private async handleCloseRequest() {
    if (!this.win || this.win.isDestroyed()) return
    if (this.closingPromptVisible) return

    if (this.windowCloseAction === 'quit' || this.windowCloseAction === 'minimize') {
      this.performCloseAction(this.windowCloseAction)
      return
    }

    this.closingPromptVisible = true
    try {
      this.win.webContents.send('window:close-confirm-required')
    } catch {
      this.closingPromptVisible = false
    }
  }
}
