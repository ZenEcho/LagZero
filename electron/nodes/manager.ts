import { ipcMain } from 'electron'
import { DatabaseManager } from '../db'
import { v4 as uuidv4 } from 'uuid'

// Reuse types from frontend via shared or duplicate for now to avoid complexity
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
  tls?: {
    enabled: boolean
    server_name?: string
    insecure?: boolean
    utls?: {
        enabled: boolean
        fingerprint: string
    }
  }
  flow?: string
  packet_encoding?: string
}

export class NodeManager {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
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
