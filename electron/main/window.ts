import { BrowserWindow, NativeImage, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = process.env.APP_ROOT || path.join(__dirname, '../')
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

/**
 * 窗口管理器
 * 负责主窗口的创建、配置和生命周期管理
 */
export class WindowManager {
  private win: BrowserWindow | null = null

  constructor() {
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
    console.info('[Main] preload selected:', preloadPath)

    this.win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 960,
      minHeight: 720,
      frame: false,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
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
  }
}
