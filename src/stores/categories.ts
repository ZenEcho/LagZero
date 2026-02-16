import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Category } from '@/types'

export const useCategoryStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])

  async function loadCategories() {
    try {
      // @ts-ignore
      categories.value = await window.categories.getAll()
    } catch (e) {
      console.error('Failed to load categories:', e)
    }
  }

  async function addCategory(category: Category) {
    // @ts-ignore
    categories.value = await window.categories.save(category)
  }

  async function updateCategory(category: Category) {
    // @ts-ignore
    categories.value = await window.categories.save(category)
  }

  async function removeCategory(id: string) {
    // @ts-ignore
    categories.value = await window.categories.delete(id)
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
