<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('common.edit') : $t('games.add_game')" class="w-[600px]" :mask-closable="false">
    <n-form ref="formRef" label-placement="top" :model="form">
      <div class="grid grid-cols-2 gap-4">
        <n-form-item :label="$t('games.name')">
          <n-input v-model:value="form.name" placeholder="例如：英雄联盟" />
        </n-form-item>
        <n-form-item :label="$t('games.category')">
          <n-select v-model:value="form.category"
            :options="categoryStore.categories.map((c: any) => ({ label: c.name, value: c.id }))" />
        </n-form-item>
      </div>

      <n-form-item :label="$t('games.mode')">
        <div class="flex flex-col w-full gap-2">
          <n-radio-group v-model:value="form.proxyMode">
            <n-space>
              <n-radio value="process">{{ $t('games.mode_process') }}</n-radio>
              <n-radio value="routing">{{ $t('games.mode_routing') }}</n-radio>
            </n-space>
          </n-radio-group>
          <span class="text-xs text-on-surface-muted">
            {{ form.proxyMode === 'process' ? $t('games.mode_process_desc') : $t('games.mode_routing_desc') }}
          </span>
        </div>
      </n-form-item>

      <template v-if="form.proxyMode === 'process'">
        <n-form-item :label="$t('games.process_name')">
          <div class="w-full max-h-[200px] overflow-y-auto">
            <div class="flex flex-col w-full gap-2">
              <div v-for="(_, index) in processList" :key="index" class="flex gap-2">
                <n-input v-model:value="processList[index]" placeholder="例如：League of Legends.exe" />
                <n-button v-if="processList.length > 1" @click="removeProcess(index)" type="error" quaternary circle>
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
                <n-button @click="pickProcess" dashed size="small">
                  选择文件
                </n-button>
                <n-button @click="pickProcessFolder" dashed size="small">
                  选择目录
                </n-button>
              </div>
            </div>
          </div>
        </n-form-item>


      </template>

      <template v-if="form.proxyMode === 'routing'">
        <n-form-item :label="$t('rules.ip_rules')">
          <div class="flex flex-col w-full gap-1">
            <n-input v-model:value="routingRulesText" type="textarea" :rows="5" class="font-mono"
              placeholder="1.1.1.1/32&#10;8.8.8.8" />
            <span class="text-xs text-on-surface-muted">{{ $t('games.process_name_tip') }} (CIDR/IP)</span>
          </div>
        </n-form-item>

        <n-form-item :label="`${$t('games.process_name')} (${$t('common.optional')})`">
          <div class="w-full max-h-[200px] overflow-y-auto">
            <div class="flex flex-col w-full gap-2">
              <div v-for="(_, index) in processList" :key="index" class="flex gap-2">
                <n-input v-model:value="processList[index]" placeholder="例如：Game.exe（用于启动检测）" />
                <n-button v-if="processList.length > 1" @click="removeProcess(index)" type="error" quaternary circle>
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
                <n-button @click="pickProcess" dashed size="small">
                  选择文件
                </n-button>
                <n-button @click="pickProcessFolder" dashed size="small">
                  选择目录
                </n-button>
              </div>
            </div>
          </div>
        </n-form-item>
      </template>

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

    </n-form>
    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" @click="save">
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
import { useCategoryStore } from '@/stores/categories'

const props = defineProps<{
  modelValue: boolean
  editingGame?: Game | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', game: Game): void
}>()

const categoryStore = useCategoryStore()
const message = useMessage()
const dialog = useDialog()
const isEdit = computed(() => !!props.editingGame)

const form = ref<Partial<Game>>({
  name: '',
  iconUrl: '',
  processName: [],
  category: '',
  proxyMode: 'process',
  routingRules: []
})

const processList = ref<string[]>([''])
const routingRulesText = ref('')

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.editingGame) {
      form.value = JSON.parse(JSON.stringify(props.editingGame))

      if (Array.isArray(props.editingGame.processName)) {
        processList.value = [...props.editingGame.processName]
      } else if (props.editingGame.processName) {
        processList.value = [props.editingGame.processName]
      } else {
        processList.value = ['']
      }

      if (props.editingGame.routingRules) {
        routingRulesText.value = props.editingGame.routingRules.join('\n')
      } else {
        routingRulesText.value = ''
      }
    } else {
      form.value = {
        name: '',
        iconUrl: '',
        processName: [],
        category: categoryStore.categories[0]?.id || '',
        proxyMode: 'process',
        routingRules: []
      }
      processList.value = ['']
      routingRulesText.value = ''
    }
  }
})

function addProcess() {
  processList.value.push('')
}

function removeProcess(index: number) {
  processList.value.splice(index, 1)
}

function close() {
  emit('update:modelValue', false)
}

async function pickImage() {
  // @ts-ignore
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
    // If we have existing empty slots, fill them first
    // Or just append unique ones
    const current = new Set(processList.value.filter(Boolean))
    files.forEach((f: string) => current.add(f))
    processList.value = Array.from(current)
    if (processList.value.length === 0) processList.value.push('')
  }
}

async function pickProcessFolder() {
  const picker = window.electron?.pickProcessFolder
  if (!picker) {
    message.error('当前环境不支持选择文件')
    return
  }

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
        const current = new Set(processList.value.filter(Boolean))
        files.forEach((f: string) => current.add(f))
        processList.value = Array.from(current)
        if (processList.value.length === 0) processList.value.push('')
        message.success(`已添加 ${files.length} 个可执行文件`)
      } else if (files) {
        message.info('该目录下未找到 exe 文件')
      }
    }
  })
}

function save() {
  if (!form.value.name) return

  const cleanProcesses = processList.value.map(p => p.trim()).filter(Boolean)

  const cleanRules = routingRulesText.value.split('\n').map(r => r.trim()).filter(Boolean)

  const gameData: Game = {
    ...form.value,
    iconUrl: form.value.iconUrl ? String(form.value.iconUrl).trim() : undefined,
    processName: cleanProcesses,
    routingRules: cleanRules
  } as Game

  if (props.editingGame) {
    gameData.id = props.editingGame.id
  }

  emit('save', gameData)
  close()
}
</script>
