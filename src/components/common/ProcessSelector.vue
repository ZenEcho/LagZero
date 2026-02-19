<template>
  <div class="w-full">
    <!-- Single Line Mode (Comma separated) -->
    <div v-if="mode === 'single'" class="flex flex-col w-full gap-1">
      <n-input :value="singleValue" @update:value="handleSingleUpdate"
        placeholder="例如：League of Legends.exe, LeagueClient.exe" />
      <div class="flex gap-2">
        <n-button @click="handlePickProcess" size="small" dashed>选择文件</n-button>
        <n-button @click="handlePickFolder" size="small" dashed>选择目录</n-button>
      </div>
      <span class="text-xs text-on-surface-muted">{{ $t('games.process_name_tip') }}</span>
    </div>

    <!-- Multi Line Mode (List) -->
    <div v-else class="w-full max-h-[200px] overflow-y-auto">
      <div class="flex flex-col w-full gap-2">
        <div v-for="(_, index) in listValue" :key="index" class="flex gap-2">
          <n-input v-model:value="listValue[index]" :placeholder="placeholder || '例如：League of Legends.exe'"
            @update:value="emitListUpdate" />
          <n-button v-if="listValue.length > 1" @click="removeProcess(index)" type="error" quaternary circle>
            <template #icon>
              <div class="i-material-symbols-delete"></div>
            </template>
          </n-button>
        </div>
        <div class="flex gap-2 self-start">
          <n-button @click="addProcess" dashed size="small">
            <template #icon>
              <div class="i-material-symbols-add"></div>
            </template>
            {{ $t('games.add_process') }}
          </n-button>
          <n-button @click="handlePickProcess" dashed size="small">
            选择文件
          </n-button>
          <n-button @click="handlePickFolder" dashed size="small">
            选择目录
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFilePicker } from '@/composables/useFilePicker'

const props = withDefaults(defineProps<{
  modelValue: string | string[]
  mode?: 'single' | 'multi'
  placeholder?: string
}>(), {
  mode: 'single'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[]): void
}>()

const { pickProcess, pickProcessFolderWithDialog } = useFilePicker()

// Helpers for Single Mode
const singleValue = computed(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.join(', ')
  }
  return props.modelValue || ''
})

function handleSingleUpdate(val: string) {
  if (props.mode === 'multi') return
  emit('update:modelValue', val)
}

// Helpers for Multi Mode
const listValue = ref<string[]>([''])

watch(() => props.modelValue, (val) => {
  if (props.mode === 'multi') {
    if (Array.isArray(val)) {
      listValue.value = val.length > 0 ? [...val] : ['']
    } else if (val) {
      listValue.value = [val]
    } else {
      listValue.value = ['']
    }
  }
}, { immediate: true })

function emitListUpdate() {
  emit('update:modelValue', listValue.value)
}

function addProcess() {
  listValue.value.push('')
  emitListUpdate()
}

function removeProcess(index: number) {
  listValue.value.splice(index, 1)
  emitListUpdate()
}

// File Picking Logic
async function handlePickProcess() {
  const files = await pickProcess()
  if (files.length > 0) {
    addFiles(files)
  }
}

function handlePickFolder() {
  pickProcessFolderWithDialog((files) => {
    addFiles(files)
  })
}

function addFiles(files: string[]) {
  if (props.mode === 'single') {
    // Merge into comma separated string
    const current = singleValue.value
      ? singleValue.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      : []
    const set = new Set(current)
    files.forEach(f => set.add(f))
    // Emit comma separated string
    emit('update:modelValue', Array.from(set).join(', '))
  } else {
    // Multi mode
    const current = new Set(listValue.value.filter(Boolean))
    files.forEach(f => current.add(f))
    listValue.value = Array.from(current)
    if (listValue.value.length === 0) listValue.value.push('')
    emitListUpdate()
  }
}
</script>
