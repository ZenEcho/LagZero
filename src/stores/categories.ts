import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Category } from '@/types'
import { categoryApi } from '@/api'

export const useCategoryStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])

  async function loadCategories() {
    try {
      categories.value = await categoryApi.getAll()
    } catch (e) {
      console.error('Failed to load categories:', e)
    }
  }

  async function addCategory(category: Category) {
    categories.value = await categoryApi.save(category)
  }

  async function updateCategory(category: Category) {
    categories.value = await categoryApi.save(category)
  }

  async function removeCategory(id: string) {
    categories.value = await categoryApi.delete(id)
  }

  loadCategories()

  return {
    categories,
    loadCategories,
    addCategory,
    updateCategory,
    removeCategory
  }
})
