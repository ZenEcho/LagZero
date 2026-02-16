<template>
  <n-modal
    :show="modelValue"
    @update:show="$emit('update:modelValue', $event)"
    preset="card"
    :title="$t('common.categories')"
    class="w-[600px]"
    :mask-closable="false"
  >
    <div class="flex gap-2 mb-4">
      <n-input
        v-model:value="newCategoryName"
        :placeholder="$t('categories.new_category_placeholder')"
        @keyup.enter="addCategory"
      />
      <n-button 
        type="primary" 
        @click="addCategory" 
        :disabled="!newCategoryName"
      >
        <template #icon>
          <div class="i-material-symbols-add"></div>
        </template>
        {{ $t('common.add') }}
      </n-button>
    </div>

    <div class="max-h-[60vh] overflow-y-auto min-h-[100px]">
      <draggable 
        v-model="categoryStore.categories" 
        item-key="id"
        handle=".drag-handle"
        @end="saveOrder"
        class="space-y-2"
      >
        <template #item="{ element }">
          <div class="flex items-center gap-3 p-3 bg-surface rounded border border-border group hover:border-primary/50 transition">
            <div class="drag-handle text-on-surface-muted i-material-symbols-drag-indicator hover:text-on-surface cursor-grab active:cursor-grabbing"></div>
            
            <div class="flex-1 flex items-center gap-2">
              <div v-if="editingId === element.id" class="flex-1">
                <n-input 
                  v-model:value="element.name" 
                  size="small"
                  @blur="finishEdit(element)"
                  @keyup.enter="finishEdit(element)"
                  ref="editInput"
                  v-focus
                />
              </div>
              <div v-else class="flex-1 font-bold text-on-surface" @dblclick="startEdit(element)">
                {{ element.name }}
              </div>
            </div>

            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <n-button size="small" quaternary circle @click="startEdit(element)">
                <template #icon>
                  <div class="i-material-symbols-edit"></div>
                </template>
              </n-button>
              <n-button size="small" quaternary circle type="error" @click="deleteCategory(element)">
                <template #icon>
                  <div class="i-material-symbols-delete"></div>
                </template>
              </n-button>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import draggable from 'vuedraggable'
import { useCategoryStore } from '@/stores/categories'
import type { Category } from '@/types'
import { useMessage, useDialog } from 'naive-ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const categoryStore = useCategoryStore()
const newCategoryName = ref('')
const editingId = ref<string | null>(null)

// Custom directive for focus
const vFocus = {
  mounted: (el: HTMLElement) => {
    // Naive UI Input wrapper
    const input = el.querySelector('input')
    if (input) input.focus()
  }
}



async function addCategory() {
  if (!newCategoryName.value) return
  
  await categoryStore.addCategory({
    id: Date.now().toString(36),
    name: newCategoryName.value,
    order: categoryStore.categories.length
  })
  
  newCategoryName.value = ''
  message.success('Category added')
}

function startEdit(category: Category) {
  editingId.value = category.id
}

async function finishEdit(category: Category) {
  if (!editingId.value) return
  
  await categoryStore.updateCategory(category)
  editingId.value = null
}

function deleteCategory(category: Category) {
  dialog.warning({
    title: 'Delete Category',
    content: `Are you sure you want to delete "${category.name}"?`,
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await categoryStore.removeCategory(category.id)
      message.success('Category deleted')
    }
  })
}

async function saveOrder() {
  // Order is already saved when updated via removeCategory/updateCategory/addCategory
  // If drag and drop only updates the store state but not the backend, we need a method to persist.
  // Assuming updateCategory handles it per item or we need a bulk save.
  // Current store only has add/update/remove.
  // Let's iterate and update for now as the store doesn't have bulk save.
  const updates = categoryStore.categories.map((c, index) => ({
    ...c,
    order: index
  }))
  
  for (const c of updates) {
    await categoryStore.updateCategory(c)
  }
}
</script>
