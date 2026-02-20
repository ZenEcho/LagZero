<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="$t('common.categories')" class="w-[600px]" :mask-closable="false">
    <div class="flex gap-2 mb-4">
      <n-input v-model:value="newCategoryName" :placeholder="$t('categories.new_category_placeholder')"
        @keyup.enter="addCategory" />
      <n-button type="primary" @click="addCategory" :disabled="!newCategoryName">
        {{ $t('common.add') }}
      </n-button>
    </div>

    <div class="max-h-[60vh] overflow-y-auto min-h-[100px]">
      <draggable v-model="categoryStore.categories" item-key="id" handle=".drag-handle" @end="saveOrder"
        class="space-y-2">
        <template #item="{ element }">
          <div
            class="flex items-center gap-3 p-3 bg-surface rounded border border-border group hover:border-primary/50 transition">
            <div class="drag-handle text-on-surface-muted hover:text-on-surface cursor-grab active:cursor-grabbing">⋮⋮</div>

            <div class="flex-1 flex items-center gap-2">
              <div v-if="editingId === element.id" class="flex-1">
                <n-input v-model:value="editingDraftName" size="small" @keyup.enter="finishEdit(element)"
                  @keyup.esc="cancelEdit" ref="editInput" v-focus />
              </div>
              <div v-else class="flex-1 font-bold text-on-surface" @dblclick="startEdit(element)">
                {{ element.name }}
              </div>
            </div>

            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <template v-if="editingId === element.id">
                <n-button size="small" quaternary type="primary" @click="finishEdit(element)" :title="$t('common.save')">
                  {{ $t('common.save') }}
                </n-button>
                <n-button size="small" quaternary @click="cancelEdit" :title="$t('common.cancel')">
                  {{ $t('common.cancel') }}
                </n-button>
              </template>
              <template v-else>
                <n-button size="small" quaternary @click="startEdit(element)">
                  {{ $t('common.edit') }}
                </n-button>
                <n-button size="small" quaternary type="error" @click="deleteCategory(element)">
                  {{ $t('common.delete') }}
                </n-button>
              </template>
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
const editingDraftName = ref('')
const editingOriginalName = ref('')

// Custom directive for focus
const vFocus = {
  mounted: (el: HTMLElement) => {
    // Naive UI Input wrapper
    const input = el.querySelector('input')
    if (input) input.focus()
  }
}



async function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return

  await categoryStore.addCategory({
    id: Date.now().toString(36),
    name,
    order: categoryStore.categories.length
  })

  newCategoryName.value = ''
  message.success(t('categories.added'))
}

function startEdit(category: Category) {
  editingId.value = category.id
  editingDraftName.value = category.name
  editingOriginalName.value = category.name
}

function cancelEdit() {
  editingId.value = null
  editingDraftName.value = ''
  editingOriginalName.value = ''
}

async function finishEdit(category: Category) {
  if (!editingId.value) return
  const nextName = editingDraftName.value.trim()
  if (!nextName) {
    message.warning(t('categories.name_required'))
    return
  }
  if (nextName === editingOriginalName.value) {
    cancelEdit()
    return
  }

  await categoryStore.updateCategory({ ...category, name: nextName })
  message.success(t('categories.updated'))
  cancelEdit()
}

function deleteCategory(category: Category) {
  if ((categoryStore.categories || []).length <= 1) {
    message.warning(t('categories.keep_one'))
    return
  }

  dialog.warning({
    title: t('categories.delete_title'),
    content: t('categories.delete_confirm', { name: category.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await categoryStore.removeCategory(category.id)
        message.success(t('categories.deleted'))
      } catch (e: any) {
        message.error(String(e?.message || t('categories.delete_failed')))
      }
    }
  })
}

async function saveOrder() {
  // Order is already saved when updated via removeCategory/updateCategory/addCategory
  // If drag and drop only updates the store state but not the backend, we need a method to persist.
  // Assuming updateCategory handles it per item or we need a bulk save.
  // Current store only has add/update/remove.
  // Let's iterate and update for now as the store doesn't have bulk save.
  const updates = categoryStore.categories.map((c: Category, index: number) => ({
    ...c,
    order: index
  }))

  for (const c of updates) {
    await categoryStore.updateCategory(c)
  }
}
</script>
