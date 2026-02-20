<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('common.edit') : $t('games.add_game')" class="w-[500px]" :mask-closable="false">
    <n-form ref="formRef" label-placement="top" :model="form">
      <n-form-item :label="$t('games.name')">
        <n-input v-model:value="form.name" placeholder="例如：英雄联盟" />
      </n-form-item>

      <n-form-item :label="$t('games.process_name')">
        <ProcessSelector v-model="processNames" mode="single" />
      </n-form-item>

      <n-form-item :label="$t('games.icon')">
        <IconSelector v-model="form.iconUrl" :name="form.name" />
      </n-form-item>

      <n-form-item :label="$t('games.category')">
        <n-select :value="form.categories" @update:value="updateCategories" multiple
          :options="categoryStore.categories.map((c: any) => ({ label: c.name, value: c.id }))" />
      </n-form-item>

      <n-form-item :label="$t('games.tags')">
        <n-dynamic-tags v-model:value="form.tags" />
      </n-form-item>
    </n-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" @click="save" :disabled="!form.name || !processNames">
          {{ $t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>

</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Game } from '@/types'
import { useCategoryStore } from '@/stores/categories'
import { useMessage } from 'naive-ui'
import IconSelector from '@/components/common/IconSelector.vue'
import ProcessSelector from '@/components/common/ProcessSelector.vue'

const props = defineProps<{
  modelValue: boolean
  editingGame?: Game | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', game: Omit<Game, 'id'> | Game): void
}>()

const isEdit = computed(() => !!props.editingGame)
const categoryStore = useCategoryStore()
const message = useMessage()

const form = ref<Omit<Game, 'id'>>({
  name: '',
  iconUrl: '',
  processName: '',
  category: 'other',
  categories: [],
  tags: [],
  lastPlayed: 0
})

const processNames = computed({
  get: () => {
    if (Array.isArray(form.value.processName)) {
      return form.value.processName.join(', ')
    }
    return form.value.processName || ''
  },
  set: (val: string) => {
    const names = val.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    form.value.processName = names.length > 1 ? names : (names[0] || '')
  }
})

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.editingGame) {
      form.value = JSON.parse(JSON.stringify(props.editingGame))
      if (!Array.isArray(form.value.categories) || form.value.categories.length === 0) {
        form.value.categories = form.value.category ? [String(form.value.category)] : []
      }
      if (!Array.isArray(form.value.tags)) {
        form.value.tags = []
      }
    } else {
      const defaultCategory = categoryStore.categories[0]?.id || 'other'
      form.value = {
        name: '',
        iconUrl: '',
        processName: '',
        category: defaultCategory,
        categories: defaultCategory ? [defaultCategory] : [],
        tags: [],
        lastPlayed: 0
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

function updateCategories(value: string[]) {
  const clean = Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : []
  if (clean.length === 0) {
    message.warning('至少保留一个标签')
    return
  }
  form.value.categories = clean
  form.value.category = clean[0] || 'other'
}

function save() {
  if (!form.value.name) return
  const cleanCategories = Array.isArray(form.value.categories)
    ? form.value.categories.map((c) => String(c).trim()).filter(Boolean)
    : []
  if (cleanCategories.length === 0) {
    message.warning('请至少选择一个标签')
    return
  }
  const payload = {
    ...form.value,
    category: cleanCategories[0] || 'other',
    categories: cleanCategories
  }

  if (props.editingGame) {
    emit('save', { ...payload, id: props.editingGame.id })
  } else {
    emit('save', payload)
  }
  close()
}
</script>
