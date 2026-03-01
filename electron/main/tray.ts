import { Tray, NativeImage, app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import pkg from '../../package.json'
import { VITE_DEV_SERVER_URL, RENDERER_DIST } from './window'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 系统托盘管理器
 * 负责创建和管理系统托盘图标及自定义菜单窗口
 */
export class TrayManager {
  private tray: Tray | null = null
  private win: BrowserWindow | null = null
  private trayWin: BrowserWindow | null = null
  private getLatestState: (() => Record<string, unknown> | null) | null = null

  constructor(win: BrowserWindow) {
    this.win = win
  }

  /**
   * 设置获取最新托盘状态的回调
   * 用于在托盘窗口显示时推送最新状态
   */
  setStateGetter(getter: () => Record<string, unknown> | null) {
    this.getLatestState = getter
  }

  /**
   * 向托盘窗口推送最新状态
   */
  pushLatestState() {
    if (!this.trayWin || this.trayWin.isDestroyed()) return
    if (!this.getLatestState) return
    const state = this.getLatestState()
    if (state) {
      this.trayWin.webContents.send('tray:state-updated', state)
    }
  }

  /**
   * 创建系统托盘
   * @param icon 应用图标
   */
  create(icon: NativeImage | null) {
    if (this.tray || !icon) return

    const trayIcon = icon.resize({ width: 20, height: 20, quality: 'best' })
    this.tray = new Tray(trayIcon)
    this.tray.setToolTip(pkg.productName)
    this.createTrayWindow()

    this.tray.on('click', () => this.showMainWindow())
    this.tray.on('right-click', (_event, bounds) => this.toggleTrayWindow(bounds))

    this.tray.on('double-click', () => {
      this.showMainWindow()
    })

    this.setupIPC()
  }

  private createTrayWindow() {
    const preloadCandidates = [
      path.join(__dirname, 'index.mjs'),
      path.join(__dirname, '../preload/index.mjs'),
      path.join(__dirname, 'preload.mjs'),
    ]
    const preloadPath = preloadCandidates.find(p => fs.existsSync(p)) || preloadCandidates[0]

    this.trayWin = new BrowserWindow({
      width: 272,
      height: 400,
      show: false,
      frame: false,
      fullscreenable: false,
      resizable: false,
      transparent: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      }
    })

    if (VITE_DEV_SERVER_URL) {
      this.trayWin.loadURL(`${VITE_DEV_SERVER_URL}#/tray`)
    } else {
      this.trayWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'tray' })
    }

    this.trayWin.on('blur', () => {
      this.trayWin?.hide()
    })
    this.trayWin.on('closed', () => {
      this.trayWin = null
    })
  }

  private toggleTrayWindow(bounds: Electron.Rectangle) {
    if (!this.trayWin) return

    if (this.trayWin.isVisible()) {
      this.trayWin.hide()
    } else {
      const position = this.calculatePosition(bounds)
      this.trayWin.setPosition(position.x, position.y, false)
      this.trayWin.show()
      this.trayWin.focus()
      // 每次显示时推送最新状态，确保 UI 与主窗口同步
      this.pushLatestState()
    }
  }

  private calculatePosition(trayBounds: Electron.Rectangle) {
    if (!this.trayWin) return { x: 0, y: 0 }

    const windowBounds = this.trayWin.getBounds()
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize

    let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2))
    let y = Math.round(trayBounds.y - windowBounds.height - 10)

    if (x + windowBounds.width > workAreaSize.width) {
      x = workAreaSize.width - windowBounds.width - 10
    }
    if (x < 10) x = 10

    if (y < 10) {
      y = Math.round(trayBounds.y + trayBounds.height + 10)
    }

    return { x, y }
  }

  private showMainWindow() {
    if (!this.win) return
    if (this.win.isVisible()) {
      this.win.focus()
    } else {
      this.win.center()
      this.win.show()
      this.win.focus()
    }
  }

  private setupIPC() {
    ipcMain.handle('tray:show-main', () => {
      this.trayWin?.hide()
      this.showMainWindow()
    })
    ipcMain.handle('tray:quit', () => {
      app.quit()
    })
  }

  /**
   * 销毁系统托盘
   */
  destroy() {
    ipcMain.removeHandler('tray:show-main')
    ipcMain.removeHandler('tray:quit')
    this.trayWin?.destroy()
    this.trayWin = null
    this.tray?.destroy()
    this.tray = null
  }

  getTrayWindow() {
    return this.trayWin
  }
}
