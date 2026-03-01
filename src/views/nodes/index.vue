<template>
  <div class="p-6 h-full flex flex-col bg-background">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-end gap-4 mb-6 pb-4 border-b border-border/50">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold  text-on-surface tracking-tight flex items-center gap-3">
          {{ $t('common.nodes') }}
          <span
            class="text-sm font-normal text-on-surface-muted bg-surface-overlay px-2 py-0.5 rounded-full border border-border/50 font-mono">{{
              nodeStore.nodes.length }}</span>
        </h1>
        <p class="text-xs text-on-surface-muted mt-1 uppercase tracking-widest font-medium opacity-70">Global Server
          Network</p>
      </div>

      <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
        <button @click="checkAllNodes" :disabled="isChecking"
          class="flex-1  sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border hover:border-primary/50 hover:bg-surface-overlay hover:text-primary rounded-lg text-xs md:text-sm text-on-surface transition shadow-sm font-medium">
          <div class="i-material-symbols-network-check" :class="{ 'animate-pulse': isChecking }"></div>
          <span class="hidden xs:inline ">{{ isChecking ? $t('common.checking') : $t('nodes.check_latency') }}</span>
          <span class="xs:hidden">{{ isChecking ? '...' : $t('nodes.check_latency') }}</span>
        </button>

        <div class="w-px h-6 bg-border mx-1 hidden sm:block"></div>

        <button @click="showImportModal = true"
          class="flex-1  sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border hover:border-primary/50 hover:bg-surface-overlay rounded-lg text-xs md:text-sm text-on-surface transition shadow-sm font-medium">
          <div class="i-material-symbols-download"></div>
          <span class="hidden xs:inline">{{ $t('common.import') }}</span>
        </button>

        <button @click="exportNodes"
          class="flex-1  sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border hover:border-primary/50 hover:bg-surface-overlay rounded-lg text-xs md:text-sm text-on-surface transition shadow-sm font-medium">
          <div class="i-material-symbols-upload"></div>
          <span class="hidden xs:inline">{{ $t('common.export') }}</span>
        </button>

        <button @click="showSubscriptionModal = true"
          class="flex-1  sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border hover:border-primary/50 hover:bg-surface-overlay rounded-lg text-xs md:text-sm text-on-surface transition shadow-sm font-medium">
          <div class="i-material-symbols-rss-feed"></div>
          <span class="hidden xs:inline">{{ $t('nodes.subscription_manage') }}</span>
        </button>

        <button @click="openAddModal"
          class="flex-1  sm:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-primary text-on-primary hover:bg-primary-hover hover:shadow-[0_0_15px_rgba(var(--rgb-primary),0.4)] rounded-lg text-xs md:text-sm transition shadow-lg shadow-primary/20 font-bold tracking-wide">
          <div class="i-material-symbols-add"></div>
          <span class="hidden xs:inline">{{ $t('common.add') }}</span>
          <span class="xs:hidden">{{ $t('common.add') }}</span>
        </button>
      </div>
    </div>

    <div class="mb-4 flex flex-col md:flex-row gap-3">
      <div class="flex-1 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-3 ">
        <n-input v-model:value="nodeStore.searchQuery" :placeholder="$t('common.search')" clearable />
        <n-select v-model:value="nodeStore.activeTypeFilter" :options="typeFilterOptions" />
        <n-select v-model:value="nodeStore.activeGroupFilter" :options="groupFilterOptions" />
      </div>

      <n-popselect v-model:value="nodeStore.activeSortType" :options="sortOptions" trigger="click">
        <n-button class="w-full md:w-auto px-4">
          <template #icon>
            <div class="i-material-symbols-sort"></div>
          </template>
          {{ currentSortLabel }}
        </n-button>
      </n-popselect>
    </div>

    <!-- Node Manager (List Only) -->
    <div
      class="flex-1 bg-surface-panel/50 rounded-xl border border-border/50 overflow-hidden flex flex-col shadow-inner backdrop-blur-sm">
      <NodeManager />
    </div>

    <NodeEditModal v-model="showEditModal" :editing-node="editingNode" @save="handleSaveNode" />

    <NodeImportModal v-model="showImportModal" @imported="handleImported" />

    <SubscriptionManagerModal v-model="showSubscriptionModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useMessage } from 'naive-ui'
import NodeManager from '@/components/node/NodeManager.vue'
import NodeEditModal from '@/components/node/NodeEditModal.vue'
import NodeImportModal from '@/components/node/NodeImportModal.vue'
import SubscriptionManagerModal from '@/components/node/SubscriptionManagerModal.vue'
import type { NodeConfig } from '@/types'
import { DEFAULT_NODE_GROUP } from '@/stores/nodes'
import { useNodeStore } from '@/stores/nodes'
import { generateBatchLinks } from '@/utils/protocol'
import { useClipboard } from '@vueuse/core'
import i18n from '@/i18n'

const nodeStore = useNodeStore()
const message = useMessage()
const { copy } = useClipboard()
const showEditModal = ref(false)
const showImportModal = ref(false)
const showSubscriptionModal = ref(false)
const editingNode = ref<NodeConfig | null>(null)
const isChecking = ref(false)

const typeFilterOptions = computed(() => [
  { label: i18n.global.t('nodes.filter_all_types'), value: 'all' },
  ...nodeStore.availableNodeTypes.map((type) => ({ label: type.toUpperCase(), value: type }))
])

const groupFilterOptions = computed(() => [
  { label: i18n.global.t('nodes.filter_all_groups'), value: 'all' },
  ...nodeStore.availableGroups.map((group) => ({
    label: group === DEFAULT_NODE_GROUP ? i18n.global.t('nodes.default_group') : group,
    value: group
  }))
])

const sortOptions = computed(() => [
  { label: `${i18n.global.t('common.creation')} · ${i18n.global.t('common.ascending')}`, value: 'default-asc' },
  { label: `${i18n.global.t('common.creation')} · ${i18n.global.t('common.descending')}`, value: 'default-desc' },
  { label: `${i18n.global.t('common.latency_short')} · ${i18n.global.t('common.ascending')}`, value: 'latency-asc' },
  { label: `${i18n.global.t('common.latency_short')} · ${i18n.global.t('common.descending')}`, value: 'latency-desc' },
  { label: `${i18n.global.t('common.alphabetical')} · ${i18n.global.t('common.ascending')}`, value: 'alphabetical-asc' },
  { label: `${i18n.global.t('common.alphabetical')} · ${i18n.global.t('common.descending')}`, value: 'alphabetical-desc' }
])

const currentSortLabel = computed(() => {
  const found = sortOptions.value.find(o => o.value === nodeStore.activeSortType)
  return found ? found.label : ''
})

function openAddModal() {
  editingNode.value = null
  showEditModal.value = true
}

async function handleSaveNode(node: Omit<NodeConfig, 'id'> | NodeConfig) {
  const ok = await nodeStore.saveNode(node as NodeConfig)
  if (!ok) {
    message.error(i18n.global.t('nodes.save_failed'))
  }
}

function handleImported() {
  nodeStore.loadNodes()
}

async function checkAllNodes() {
  if (isChecking.value) return
  isChecking.value = true
  try {
    await nodeStore.checkAllNodes()
  } finally {
    isChecking.value = false
  }
}


async function exportNodes() {
  if (nodeStore.nodes.length === 0) {
    message.warning(i18n.global.t('nodes.no_nodes_to_export'))
    return
  }
  const content = generateBatchLinks(nodeStore.nodes)
  if (content) {
    await copy(content)
    message.success(i18n.global.t('nodes.export_success', { count: nodeStore.nodes.length }))
  } else {
    message.error(i18n.global.t('nodes.export_failed'))
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

async function importFromText(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return

  const count = await nodeStore.addNodes(trimmed)
  if (count > 0) {
    message.success(i18n.global.t('common.import_success', { count }))
  } else {
    message.error(i18n.global.t('common.import_fail'))
  }
}

async function exportSelectedNodes() {
  const targets = nodeStore.selectedNodes
  if (targets.length === 0) {
    message.warning(i18n.global.t('nodes.no_selected_nodes_to_export'))
    return
  }

  const content = generateBatchLinks(targets)
  if (content) {
    await copy(content)
    message.success(i18n.global.t('nodes.export_success', { count: targets.length }))
  } else {
    message.error(i18n.global.t('nodes.export_failed'))
  }
}

async function onDocumentPaste(event: ClipboardEvent) {
  if (isEditableTarget(event.target)) return
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text.trim()) return
  event.preventDefault()
  await importFromText(text)
}

async function onDocumentKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return
  const withModifier = event.ctrlKey || event.metaKey
  if (!withModifier || event.altKey) return

  if (event.key.toLowerCase() === 'c') {
    event.preventDefault()
    await exportSelectedNodes()
  }
}

onMounted(() => {
  window.addEventListener('paste', onDocumentPaste)
  window.addEventListener('keydown', onDocumentKeydown)
  void nodeStore.runScheduledSubscriptions('startup')
})

onUnmounted(() => {
  window.removeEventListener('paste', onDocumentPaste)
  window.removeEventListener('keydown', onDocumentKeydown)
})
</script>
