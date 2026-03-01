import { ipcMain } from 'electron'
import { DatabaseService } from './database'
import type { Game } from '@shared/types'

/**
 * 游戏管理服务
 *
 * DatabaseService 的 IPC 薄封装层，负责通过 IPC 暴露游戏相关的 CRUD 操作。
 */
export class GameService {
  private db: DatabaseService

  constructor(db: DatabaseService) {
    this.db = db
    this.registerIPC()
  }

  private registerIPC() {
    ipcMain.handle('games:get-all', () => this.db.getAllGames())

    ipcMain.handle('games:save', async (_, game: Game) => {
      return this.db.saveGame(game)
    })

    ipcMain.handle('games:delete', async (_, id: string) => {
      return this.db.deleteGame(id)
    })
  }
}
