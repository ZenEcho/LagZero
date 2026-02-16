<template>
  <div class="p-6 h-full flex flex-col">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h1 class="text-xl md:text-2xl font-bold text-on-surface">{{ $t('common.nodes') }}</h1>
      <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <button @click="checkAllNodes" :disabled="isChecking"
          class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-1.5 bg-surface border border-border hover:bg-surface-overlay rounded-full text-xs md:text-sm text-on-surface transition">
          <div class="i-material-symbols-network-check" :class="{ 'animate-pulse': isChecking }"></div>
          <span class="hidden xs:inline">{{ isChecking ? $t('common.checking') : $t('nodes.check_latency') }}</span>
          <span class="xs:hidden">{{ isChecking ? '...' : $t('nodes.check_latency') }}</span>
        </button>
        <button @click="showImportModal = true"
          class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-1.5 bg-surface border border-border hover:bg-surface-overlay rounded-full text-xs md:text-sm text-on-surface transition">
          <div class="i-material-symbols-download"></div>
          <span class="hidden xs:inline">{{ $t('common.import') }}</span>
          <span class="xs:hidden">{{ $t('common.import') }}</span>
        </button>
        <button @click="exportNodes"
          class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-1.5 bg-surface border border-border hover:bg-surface-overlay rounded-full text-xs md:text-sm text-on-surface transition">
          <div class="i-material-symbols-upload"></div>
          <span class="hidden xs:inline">{{ $t('common.export') }}</span>
          <span class="xs:hidden">{{ $t('common.export') }}</span>
        </button>
        <button @click="openAddModal"
          class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-1.5 bg-primary text-on-primary hover:bg-primary-hover rounded-full text-xs md:text-sm transition shadow-lg shadow-primary/20">
          <div class="i-material-symbols-add"></div>
          <span class="hidden xs:inline">{{ $t('common.add') }}</span>
          <span class="xs:hidden">{{ $t('common.add') }}</span>
        </button>
      </div>
    </div>

    <!-- Node Manager (List Only) -->
    <div class="flex-1 bg-surface-panel rounded-xl border border-border overflow-hidden flex flex-col">
      <NodeManager />
    </div>

    <NodeEditModal v-model="showEditModal" :editing-node="editingNode" @save="handleSaveNode" />

    <NodeImportModal v-model="showImportModal" @imported="handleImported" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import NodeManager from '@/components/node/NodeManager.vue'
import NodeEditModal from '@/components/node/NodeEditModal.vue'
import NodeImportModal from '@/components/node/NodeImportModal.vue'
import type { NodeConfig } from '@/utils/protocol'
import { useNodeStore } from '@/stores/nodes'
import { generateBatchLinks } from '@/utils/protocol'
import { useClipboard } from '@vueuse/core'
import i18n from '@/i18n'

const nodeStore = useNodeStore()
const message = useMessage()
const { copy } = useClipboard()
const showEditModal = ref(false)
const showImportModal = ref(false)
const editingNode = ref<NodeConfig | null>(null)
const isChecking = ref(false)

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
</script>
