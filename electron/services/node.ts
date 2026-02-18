import { ipcMain } from 'electron'
import { DatabaseService } from './database'

// Reuse types from frontend via shared or duplicate for now to avoid complexity
/**
 * 代理节点配置接口
 * 
 * 定义了节点的所有属性，包括服务器地址、端口、协议类型及各协议特定的配置项。
 * 尽量复用前端定义的类型结构。
 */
interface NodeConfig {
  id: string
  type: string
  tag: string
  server: string
  server_port: number
  uuid?: string
  password?: string
  method?: string
  plugin?: string
  plugin_opts?: string
  network?: string
  security?: string
  path?: string
  host?: string
  service_name?: string
  alpn?: string
  fingerprint?: string
  tls?: {
    enabled: boolean
    server_name?: string
    insecure?: boolean
    utls?: {
        enabled: boolean
        fingerprint: string
    }
    reality?: {
      enabled: boolean
      public_key?: string
      short_id?: string
    }
  }
  flow?: string
  packet_encoding?: string
  username?: string
}

/**
 * 节点管理服务
 * 
 * 负责代理节点的增删改查及导入导出。
 * 实际数据存储委托给 DatabaseService。
 */
export class NodeService {
  private db: DatabaseService

  constructor(db: DatabaseService) {
    this.db = db
    this.registerIPC()
  }

  public getAll() {
    return this.db.getAllNodes()
  }

  public save(node: Partial<NodeConfig>) {
    return this.db.saveNode(node)
  }

  public delete(id: string) {
    return this.db.deleteNode(id)
  }

  public importNodes(newNodes: Partial<NodeConfig>[]) {
    return this.db.importNodes(newNodes)
  }

  private registerIPC() {
    ipcMain.handle('nodes:get-all', () => this.getAll())
    ipcMain.handle('nodes:save', (_, node: any) => this.save(node))
    ipcMain.handle('nodes:delete', (_, id: string) => this.delete(id))
    ipcMain.handle('nodes:import', (_, nodes: any[]) => this.importNodes(nodes))
  }
}
