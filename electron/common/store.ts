import fs from 'fs-extra'
import path from 'node:path'

/**
 * 本地 JSON 存储类配置选项
 */
export interface StoreOptions<T> {
  /** 存储文件名称 (不含后缀) */
  name: string
  /** 默认数据 */
  defaults: T
  /** 存储目录路径 */
  cwd: string
  /** 保留的备份文件数量，默认为 5 */
  backupCount?: number
}

/**
 * 简单的本地 JSON 文件存储
 * 
 * 提供数据的持久化存储、读取、自动备份功能。
 * 
 * @template T - 存储数据的类型接口
 */
export class JsonStore<T> {
  private filePath: string
  private backupDir: string
  private data: T
  private options: StoreOptions<T>

  constructor(options: StoreOptions<T>) {
    this.options = { backupCount: 5, ...options }
    this.filePath = path.join(this.options.cwd, `${this.options.name}.json`)
    this.backupDir = path.join(this.options.cwd, 'backups', this.options.name)
    this.data = this.options.defaults
    this.init()
  }

  private init() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.data = fs.readJsonSync(this.filePath)
      } else {
        this.save()
      }
    } catch (e) {
      console.error(`Failed to load store ${this.options.name}:`, e)
      // Attempt to load latest backup if main file is corrupted?
    }
  }

  public get(): T {
    return this.data
  }

  public set(data: T) {
    this.data = data
    this.save()
  }

  private async save() {
    try {
      await this.backup()
      await fs.writeJson(this.filePath, this.data, { spaces: 2 })
    } catch (e) {
      console.error(`Failed to save store ${this.options.name}:`, e)
    }
  }

  private async backup() {
    if (!this.options.backupCount || this.options.backupCount <= 0) return

    try {
      await fs.ensureDir(this.backupDir)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.backupDir, `${this.options.name}-${timestamp}.json`)
      
      if (fs.existsSync(this.filePath)) {
        await fs.copy(this.filePath, backupPath)
      }

      // Cleanup old backups
      const files = await fs.readdir(this.backupDir)
      const backups = files
        .filter(f => f.startsWith(this.options.name) && f.endsWith('.json'))
        .map(f => path.join(this.backupDir, f))
        .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime())

      if (backups.length > this.options.backupCount) {
        const toDelete = backups.slice(this.options.backupCount)
        await Promise.all(toDelete.map(f => fs.remove(f)))
      }
    } catch (e) {
      console.error(`Backup failed for ${this.options.name}:`, e)
    }
  }
}
