import { ipcMain } from 'electron'
import { DatabaseManager } from '../db'

export interface Game {
  id?: string
  name: string
  iconUrl?: string
  processName: string | string[]
  category: string
  tags?: string[]
  profileId?: string
  lastPlayed?: number
  status?: 'idle' | 'accelerating'
  latency?: number
  nodeId?: string
  proxyMode?: 'process' | 'routing'
  routingRules?: string[]
  chainProxy?: boolean
}

export class GameManager {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
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
