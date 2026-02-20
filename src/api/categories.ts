import type { Category } from '@/types'

export const categoryApi = {
  getAll: () => window.categories.getAll(),
  save: (category: Category) => window.categories.save(category),
  delete: (id: string) => window.categories.delete(id),
  match: (name: string, processes: string | string[]) => window.categories.match(name, processes),
}
