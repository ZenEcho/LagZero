<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('common.edit') : $t('games.add_game')" class="w-[95vw] sm:w-[600px] lg:w-[1000px] xl:w-[1100px] max-h-[90vh] flex flex-col"
    :content-style="{ overflowY: 'auto' }" :mask-closable="false" :bordered="false" size="huge">
    <div class="flex flex-col lg:flex-row gap-6">

      <!-- Section 1: Basic Information (Left Column) -->
      <div class="flex-1 bg-surface-variant/10 rounded-xl p-5 border border-border/50 flex flex-col gap-4 h-fit">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-1 h-4 bg-primary rounded-full"></div>
          <h3 class="font-bold text-on-surface text-base">{{ $t('games.basic_info') }}</h3>
        </div>

        <div class="flex flex-col gap-4">
          <n-form-item :label="$t('games.name')" path="name">
            <n-input v-model:value="form.name" :placeholder="$t('games.name_placeholder')" />
          </n-form-item>
          <n-form-item :label="$t('games.category')" path="categories">
            <n-select :value="form.categories" @update:value="updateCategories" multiple
              :options="categoryStore.categories.map((c: any) => ({ label: c.name, value: c.id }))" />
          </n-form-item>
        </div>

        <n-form-item :label="$t('games.icon')" :show-feedback="false">
          <IconSelector v-model="form.iconUrl" />
        </n-form-item>
      </div>

      <!-- Section 2: Network Strategy (Right Column) -->
      <div
        class="flex-1 bg-surface-variant/10 rounded-xl p-5 border border-border/50 flex flex-col gap-4 transition-all duration-300 h-fit">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="w-1 h-4 bg-secondary rounded-full"></div>
            <h3 class="font-bold text-on-surface text-base">{{ $t('games.network_strategy') }}</h3>
          </div>

          <!-- Mode Switcher -->
          <div class="bg-surface p-1 rounded-lg border border-border flex shadow-sm w-full sm:w-auto">
            <button v-for="mode in ['process', 'routing']" :key="mode"
              @click="form.proxyMode = mode as 'process' | 'routing'"
              class="flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
              :class="form.proxyMode === mode ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-variant/50'">
              <div :class="mode === 'process' ? 'i-carbon-application-web' : 'i-carbon-network-overlay'"></div>
              {{ mode === 'process' ? $t('games.mode_process') : $t('games.mode_routing') }}
            </button>
          </div>
        </div>

        <!-- Mode Description -->
        <div
          class="bg-surface/50 p-3 rounded-lg border border-border/30 text-xs text-on-surface-muted flex gap-2 items-start">
          <div class="i-carbon-information text-primary mt-0.5 flex-shrink-0"></div>
          {{ form.proxyMode === 'process' ? $t('games.mode_process_desc') : $t('games.mode_routing_desc') }}
        </div>

        <!-- Dynamic Configuration Area -->
        <div class="mt-2 space-y-4">
          <template v-if="form.proxyMode === 'process'">
            <n-form-item :label="$t('games.process_name')">
              <ProcessSelector v-model="processList" mode="multi" />
            </n-form-item>
          </template>

          <template v-if="form.proxyMode === 'routing'">
            <n-form-item :label="$t('rules.ip_rules')">
              <div class="flex flex-col w-full gap-2">
                <n-input v-model:value="routingRulesText" type="textarea" :rows="5" class="font-mono text-xs"
                  placeholder="1.1.1.1/32&#10;8.8.8.8" />
                <span class="text-xs text-on-surface-muted flex items-center gap-1">
                  <div class="i-carbon-help"></div>
                  {{ $t('games.process_name_tip') }} (CIDR/IP)
                </span>
              </div>
            </n-form-item>

            <n-form-item :label="`${$t('games.process_name')} (${$t('common.optional')})`">
              <ProcessSelector v-model="processList" mode="multi" :placeholder="$t('games.process_optional_placeholder')" />
            </n-form-item>
          </template>

          <!-- Chain Proxy Toggle -->
          <div class="flex items-center justify-between p-3 bg-surface rounded-lg border border-border/50">
            <div class="flex flex-col mr-4 flex-1">
              <span class="text-sm font-bold text-on-surface">{{ $t('games.chain_proxy') }}</span>
              <span class="text-xs text-on-surface-muted">{{ $t('games.chain_proxy_desc') }}</span>
            </div>
            <n-switch v-model:value="form.chainProxy" :disabled="!hasProcessTargets" class="flex-shrink-0">
              <template #checked>{{ $t('common.enabled') }}</template>
              <template #unchecked>{{ $t('common.disabled') }}</template>
            </n-switch>
          </div>
        </div>
      </div>

    </div>

    <template #footer>
      <div class="flex justify-end gap-3 pt-2">
        <n-button @click="close" class="px-6">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" @click="save" class="px-6 shadow-lg shadow-primary/20 font-bold">
          {{ $t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
const categoryStore = useCategoryStore()
const message = useMessage()
const isEdit = computed(() => !!props.editingGame)

const form = ref<Partial<Game>>({
  name: '',
  iconUrl: '',
  processName: [],
  category: '',
  categories: [],
  proxyMode: 'process',
  routingRules: [],
  chainProxy: true
})

const processList = ref<string[]>([''])
const routingRulesText = ref('')
const hasProcessTargets = computed(() => processList.value.some(p => String(p || '').trim().length > 0))

watch(hasProcessTargets, (hasTargets) => {
  if (!hasTargets) form.value.chainProxy = false
}, { immediate: true })

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.editingGame) {
      form.value = JSON.parse(JSON.stringify(props.editingGame))
      form.value.chainProxy = form.value.chainProxy !== false
      if (!Array.isArray(form.value.categories) || form.value.categories.length === 0) {
        form.value.categories = form.value.category ? [String(form.value.category)] : []
      }

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
      const defaultCategory = categoryStore.categories[0]?.id || ''
      form.value = {
        name: '',
        iconUrl: '',
        processName: [],
        category: defaultCategory,
        categories: defaultCategory ? [defaultCategory] : [],
        proxyMode: 'process',
        routingRules: [],
        chainProxy: true
      }
      processList.value = ['']
      routingRulesText.value = ''
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

function updateCategories(value: string[]) {
  const clean = Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : []
  if (clean.length === 0) {
    message.warning(t('games.at_least_one_tag'))
    return
  }
  form.value.categories = clean
  form.value.category = clean[0]
}

function save() {
  if (!form.value.name) return

  const mode = form.value.proxyMode === 'routing' ? 'routing' : 'process'
  const cleanProcesses = processList.value.map(p => p.trim()).filter(Boolean)
  const cleanRules = routingRulesText.value
    .split(/[\r\n,;，；]+/g)
    .map(r => r.trim())
    .filter(Boolean)
  const cleanCategories = Array.isArray(form.value.categories)
    ? form.value.categories.map(c => String(c).trim()).filter(Boolean)
    : []

  if (mode === 'process' && cleanProcesses.length === 0) {
    message.warning(t('games.process_required'))
    return
  }

  if (mode === 'routing' && cleanRules.length === 0) {
    message.warning(t('games.routing_rule_required'))
    return
  }
  if (cleanCategories.length === 0) {
    message.warning(t('games.tag_required'))
    return
  }

  const gameData: Game = {
    ...form.value,
    category: cleanCategories[0] || '',
    categories: cleanCategories,
    proxyMode: mode,
    chainProxy: cleanProcesses.length > 0 ? form.value.chainProxy !== false : false,
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
