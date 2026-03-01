import { ipcMain } from 'electron'
import { DatabaseService } from './database'
import type { NodeConfig } from '@shared/types'

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

  /**
   * 获取所有节点
   */
  public getAll() {
    return this.db.getAllNodes()
  }

  /**
   * 保存节点配置
   */
  public save(node: Partial<NodeConfig>) {
    return this.db.saveNode(node)
  }

  /**
   * 删除节点
   */
  public delete(id: string) {
    return this.db.deleteNode(id)
  }

  /**
   * 批量导入节点
   */
  public importNodes(newNodes: Partial<NodeConfig>[]) {
    return this.db.importNodes(newNodes)
  }

  /**
   * 注册 IPC 监听器
   */
  private registerIPC() {
    ipcMain.handle('nodes:get-all', () => this.getAll())
    ipcMain.handle('nodes:save', (_, node: any) => this.save(node))
    ipcMain.handle('nodes:delete', (_, id: string) => this.delete(id))
    ipcMain.handle('nodes:import', (_, nodes: any[]) => this.importNodes(nodes))
  }
}
