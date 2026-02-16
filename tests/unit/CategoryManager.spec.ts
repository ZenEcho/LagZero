import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CategoryManager, type Category } from '../../electron/categories/manager'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

describe('CategoryManager', () => {
  let manager: CategoryManager
  let categories: Category[]
  let db: any

  beforeEach(async () => {
    categories = [
      { id: 'fps', name: 'FPS', order: 1 },
      { id: 'moba', name: 'MOBA', order: 2 }
    ]

    db = {
      getAllCategories: vi.fn(async () => [...categories]),
      saveCategory: vi.fn(async (category: Category) => {
        const index = categories.findIndex(c => c.id === category.id)
        if (index >= 0) {
          categories[index] = { ...categories[index], ...category }
        } else {
          categories.push(category)
        }
        return [...categories]
      }),
      deleteCategory: vi.fn(async (id: string) => {
        categories = categories.filter(c => c.id !== id)
        return [...categories]
      })
    }

    manager = new CategoryManager(db)
    await manager.getAll()
  })

  it('初始化后可以读取分类', async () => {
    const list = await manager.getAll()
    expect(list.length).toBeGreaterThan(0)
    expect(list.find(c => c.id === 'fps')).toBeDefined()
  })

  it('可以新增分类', async () => {
    const newCat: Category = { id: 'test', name: 'Test Category' }
    await manager.save(newCat)

    const list = await manager.getAll()
    expect(list.find(c => c.id === 'test')).toEqual(expect.objectContaining(newCat))
  })

  it('可以更新分类', async () => {
    await manager.save({ id: 'fps', name: 'FPS Games' })

    const list = await manager.getAll()
    expect(list.find(c => c.id === 'fps')?.name).toBe('FPS Games')
  })

  it('可以删除分类', async () => {
    await manager.delete('fps')

    const list = await manager.getAll()
    expect(list.find(c => c.id === 'fps')).toBeUndefined()
  })
})
