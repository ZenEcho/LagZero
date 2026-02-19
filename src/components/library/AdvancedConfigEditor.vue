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
          <ProcessSelector v-model="processList" mode="multi" />
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
          <ProcessSelector v-model="processList" mode="multi" placeholder="例如：Game.exe（用于启动检测）" />
        </n-form-item>
      </template>

      <n-form-item :label="$t('games.icon')">
          <IconSelector v-model="form.iconUrl" />
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
  (e: 'save', game: Game): void
}>()

const categoryStore = useCategoryStore()
const message = useMessage()
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

function close() {
  emit('update:modelValue', false)
}

function save() {
  if (!form.value.name) return

  const mode = form.value.proxyMode === 'routing' ? 'routing' : 'process'
  const cleanProcesses = processList.value.map(p => p.trim()).filter(Boolean)
  const cleanRules = routingRulesText.value.split('\n').map(r => r.trim()).filter(Boolean)

  if (mode === 'process' && cleanProcesses.length === 0) {
    message.warning('进程模式需要至少填写一个进程名')
    return
  }

  if (mode === 'routing' && cleanRules.length === 0) {
    message.warning('路由模式需要至少填写一条 IP/CIDR 规则')
    return
  }

  const gameData: Game = {
    ...form.value,
    proxyMode: mode,
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
