import { Tray, Menu, NativeImage, app, BrowserWindow } from 'electron'
import pkg from '../../package.json'

/**
 * 系统托盘管理器
 * 负责创建和管理系统托盘图标及菜单
 */
export class TrayManager {
  private tray: Tray | null = null
  private win: BrowserWindow | null = null

  constructor(win: BrowserWindow) {
    this.win = win
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
    this.tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => {
          if (!this.win) return
          this.win.show()
          this.win.focus()
        }
      },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ]))

    this.tray.on('double-click', () => {
      if (!this.win) return
      if (this.win.isVisible()) {
        this.win.focus()
      } else {
        this.win.show()
        this.win.focus()
      }
    })
  }

  /**
   * 销毁系统托盘
   */
  destroy() {
    this.tray?.destroy()
    this.tray = null
  }
}
