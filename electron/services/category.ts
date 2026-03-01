import { ipcMain } from 'electron'
import { DatabaseService } from './database'
import type { Category } from '@shared/types'

/**
 * 游戏分类管理服务
 *
 * 负责管理左侧侧边栏的游戏分类，支持 CRUD 操作以及
 * 基于规则的自动分类匹配。
 */
export class CategoryService {
  private db: DatabaseService
  /** 内存缓存，减少数据库查询频率 */
  private categoriesCache: Category[] = []

  /**
   * 初始化分类服务
   * @param db - 数据库服务实例
   */
  constructor(db: DatabaseService) {
    this.db = db
    this.refreshCache()
    this.registerIPC()
  }

  /**
   * 刷新分类缓存
   */
  private async refreshCache() {
    try {
      this.categoriesCache = await this.db.getAllCategories()
    } catch (e) {
      console.error('刷新分类缓存失败:', e)
    }
  }

  /**
   * 获取所有分类
   */
  public async getAll() {
    this.categoriesCache = await this.db.getAllCategories()
    return this.categoriesCache
  }

  /**
   * 保存分类（新增或更新）
   */
  public async save(category: Category) {
    const result = await this.db.saveCategory(category)
    this.categoriesCache = result
    return result
  }

  /**
   * 删除分类
   */
  public async delete(id: string) {
    const result = await this.db.deleteCategory(id)
    this.categoriesCache = result
    return result
  }

  /**
   * 根据游戏名称或进程名自动匹配分类
   *
   * 遍历所有分类的 rules (正则)，如果匹配成功则返回该分类 ID。
   *
   * @param gameName - 游戏显示名称
   * @param processNames - 游戏进程名列表
   * @returns string | null - 匹配到的分类 ID，无匹配则返回 null
   */
  public async matchCategory(gameName: string, processNames: string | string[]): Promise<string | null> {
    const categories = this.categoriesCache
    const pNames = Array.isArray(processNames) ? processNames : [processNames]

    for (const cat of categories) {
      if (cat.rules && cat.rules.length > 0) {
        for (const rule of cat.rules) {
          try {
            const regex = new RegExp(rule, 'i')
            if (regex.test(gameName)) return cat.id
            for (const pName of pNames) {
              if (regex.test(pName)) return cat.id
            }
          } catch (e) {
            // Ignore invalid regex
          }
        }
      }
    }
    return null
  }

  private registerIPC() {
    ipcMain.handle('categories:get-all', () => this.getAll())
    ipcMain.handle('categories:save', (_, category: Category) => this.save(category))
    ipcMain.handle('categories:delete', (_, id: string) => this.delete(id))
    ipcMain.handle('categories:match', (_, name: string, processes: string[]) => this.matchCategory(name, processes))
  }
}
