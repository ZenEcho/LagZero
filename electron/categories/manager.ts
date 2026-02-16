import { ipcMain } from 'electron'
import { DatabaseManager } from '../db'

export interface Category {
  id: string
  name: string
  parentId?: string
  rules?: string[]
  icon?: string
  order?: number
}

export class CategoryManager {
  private db: DatabaseManager
  private categoriesCache: Category[] = []

  constructor(db: DatabaseManager) {
    this.db = db
    this.refreshCache()
    this.registerIPC()
  }

  private async refreshCache() {
    try {
        this.categoriesCache = await this.db.getAllCategories()
    } catch (e) {
        console.error('Failed to refresh categories cache:', e)
    }
  }

  public async getAll() {
    this.categoriesCache = await this.db.getAllCategories()
    return this.categoriesCache
  }

  public async save(category: Category) {
    const result = await this.db.saveCategory(category)
    this.categoriesCache = result
    return result
  }

  public async delete(id: string) {
    const result = await this.db.deleteCategory(id)
    this.categoriesCache = result
    return result
  }

  public matchCategory(gameName: string, processNames: string | string[]): string | null {
    // Use cache for synchronous matching logic if needed, or just use current state
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
