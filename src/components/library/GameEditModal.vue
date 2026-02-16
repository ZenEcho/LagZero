<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('common.edit') : $t('games.add_game')" class="w-[500px]" :mask-closable="false">
    <n-form ref="formRef" label-placement="top" :model="form">
      <n-form-item :label="$t('games.name')">
        <n-input v-model:value="form.name" placeholder="例如：英雄联盟" />
      </n-form-item>

      <n-form-item :label="$t('games.process_name')">
        <div class="flex flex-col w-full gap-1">
          <n-input v-model:value="processNames" placeholder="例如：League of Legends.exe, LeagueClient.exe" />
          <div class="flex gap-2">
            <n-button @click="pickProcess" size="small" dashed>选择文件</n-button>
            <n-button @click="pickProcessFolder" size="small" dashed>选择目录</n-button>
          </div>
          <span class="text-xs text-on-surface-muted">{{ $t('games.process_name_tip') }}</span>
        </div>
      </n-form-item>

      <n-form-item :label="$t('games.icon')">
        <div class="flex items-center gap-2 w-full">
          <div
            class="w-10 h-10 bg-surface rounded border border-border overflow-hidden flex items-center justify-center">
            <img v-if="form.iconUrl" :src="form.iconUrl" class="w-full h-full object-cover" />
            <div v-else class="i-material-symbols-image text-xl text-on-surface-muted"></div>
          </div>
          <n-input v-model:value="form.iconUrl" placeholder="支持 URL 或 file://..." />
          <n-button @click="pickImage">选择文件</n-button>
          <n-button quaternary @click="form.iconUrl = ''">清空</n-button>
        </div>
      </n-form-item>

      <n-form-item :label="$t('games.category')">
        <n-radio-group v-model:value="form.category">
          <n-radio-button v-for="cat in categories" :key="cat" :value="cat" :label="cat.toUpperCase()" />
        </n-radio-group>
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
import { ref, watch, computed, h } from 'vue'
import { useMessage, useDialog, NInputNumber } from 'naive-ui'
import type { Game } from '@/types'

const props = defineProps<{
  modelValue: boolean
  editingGame?: Game | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', game: Omit<Game, 'id'> | Game): void
}>()

const isEdit = computed(() => !!props.editingGame)

const categories: Game['category'][] = ['fps', 'moba', 'rpg', 'other']

const form = ref<Omit<Game, 'id'>>({
  name: '',
  iconUrl: '',
  processName: '',
  category: 'other',
  lastPlayed: 0
})

const message = useMessage()
const dialog = useDialog()

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
    } else {
      form.value = {
        name: '',
        iconUrl: '',
        processName: '',
        category: 'other',
        lastPlayed: 0
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function pickImage() {
  const picker = window.electron?.pickImage
  if (!picker) {
    message.error('当前环境不支持选择文件')
    return
  }
  const url = await picker()
  if (url) {
    form.value.iconUrl = url
  }
}

async function pickProcess() {
  const picker = window.electron?.pickProcess
  if (!picker) {
    message.error('当前环境不支持选择文件')
    return
  }
  const files = await picker()
  if (files && files.length > 0) {
    let current: string[] = []
    if (Array.isArray(form.value.processName)) {
      current = [...form.value.processName]
    } else if (form.value.processName) {
      current = [form.value.processName]
    }
    const set = new Set(current)
    files.forEach((f: string) => set.add(f))
    form.value.processName = Array.from(set)
  }
}

async function pickProcessFolder() {
  const picker = window.electron?.pickProcessFolder
  if (!picker) {
    message.error('当前环境不支持选择文件')
    return
  }

  // Ask for depth
  const depth = ref(1)
  dialog.create({
    title: '选择目录扫描深度',
    content: () => h('div', { class: 'flex flex-col gap-2' }, [
      h('span', '请输入扫描深度（1 表示仅当前目录，-1 表示无限递归）：'),
      h(NInputNumber, {
        value: depth.value,
        onUpdateValue: (v: number | null) => { if (v !== null) depth.value = v },
        min: -1
      })
    ]),
    positiveText: '确定选择目录',
    negativeText: '取消',
    onPositiveClick: async () => {
      const files = await picker(depth.value)
      if (files && files.length > 0) {
        let current: string[] = []
        if (Array.isArray(form.value.processName)) {
          current = [...form.value.processName]
        } else if (form.value.processName) {
          current = [form.value.processName]
        }
        const set = new Set(current)
        files.forEach((f: string) => set.add(f))
        form.value.processName = Array.from(set)
        message.success(`已添加 ${files.length} 个可执行文件`)
      } else if (files) {
        message.info('该目录下未找到 exe 文件')
      }
    }
  })
}

function save() {
  if (!form.value.name) return

  if (props.editingGame) {
    emit('save', { ...form.value, id: props.editingGame.id })
  } else {
    emit('save', form.value)
  }
  close()
}
</script>
