import { ipcMain } from 'electron'
import { DatabaseService } from './database'

/**
   * 游戏对象接口
   */
export interface Game {
  /** 游戏唯一 ID */
  id?: string
  /** 游戏名称 */
  name: string
  /** 图标 URL */
  iconUrl?: string
  /** 游戏进程名 (字符串或数组) */
  processName: string | string[]
  /** 分类 ID */
  category: string
  /** 标签列表 */
  tags?: string[]
  /** 关联的配置文件 ID */
  profileId?: string
  /** 最后运行时间 */
  lastPlayed?: number
  /** 当前状态 */
  status?: 'idle' | 'accelerating'
  /** 延迟 (ms) */
  latency?: number
  /** 指定的节点 ID */
  nodeId?: string
  /** 代理模式 */
  proxyMode?: 'process' | 'routing'
  /** 路由规则 */
  routingRules?: string[]
  /** 是否启用链式代理 */
  chainProxy?: boolean
}

/**
 * 游戏管理服务
 * 
 * 只是 DatabaseService 的一层薄封装，主要负责通过 IPC 暴露游戏相关的 CRUD 操作。
 * 具体的业务逻辑目前主要在 DatabaseService 中处理。
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
