<template>
  <div class="h-full flex flex-col relative">
    <!-- Toolbar (Floating) -->
    <div v-if="nodeStore.selectedNodes.length > 0"
      class="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 min-w-[550px]">
      <div
        class="flex items-center justify-center gap-2 bg-surface-overlay/90 backdrop-blur-md border border-border shadow-xl rounded-full px-6 py-3">
        <span class="text-sm font-medium text-on-surface">{{ $t('nodes.selected_count', {
          count:
            nodeStore.selectedNodes.length
        }) }}</span>
        <div class="h-4 w-px bg-border"></div>
        <input v-model="groupName" type="text" :placeholder="$t('nodes.tag_placeholder_short')"
          class="h-8 w-40 rounded-full border border-border bg-surface px-3 text-xs text-on-surface outline-none focus:border-primary"
          @click.stop />
        <button @click="applyGroupToSelected"
          class="flex items-center gap-2 text-primary hover:text-primary-hover transition font-medium text-sm">
          <div class="i-material-symbols-folder-copy"></div>
          <span>{{ $t('nodes.apply_tag') }}</span>
        </button>
        <div class="h-4 w-px bg-border"></div>
        <button @click="nodeStore.clearSelectedNodes()"
          class="flex items-center gap-2 text-on-surface-muted hover:text-on-surface transition font-medium text-sm">
          <div class="i-material-symbols-close"></div>
          <span>{{ $t('common.cancel') }}</span>
        </button>
      </div>
    </div>

    <!-- Node List -->
    <div class="flex-1 overflow-y-auto min-h-0 bg-surface-panel p-4">
      <div v-if="nodeStore.nodes.length === 0"
        class="h-full flex flex-col items-center justify-center text-on-surface-muted p-8">
        <div class="i-material-symbols-dns text-6xl mb-4 opacity-50"></div>
        <p class="text-lg font-medium">{{ $t('common.no_nodes') }}</p>
        <p class="text-sm opacity-60 mt-2">{{ $t('common.add_node_hint') }}</p>
      </div>
      <div v-else-if="nodeStore.filteredNodes.length === 0"
        class="h-full flex flex-col items-center justify-center text-on-surface-muted p-8">
        <div class="i-material-symbols-search-off text-6xl mb-4 opacity-50"></div>
        <p class="text-lg font-medium">{{ $t('nodes.no_nodes_found') }}</p>
      </div>
      <div v-else>
        <div class="mb-3 px-1 flex items-center justify-between text-xs text-on-surface-muted h-8">
          <div class="flex items-center gap-2">
            <n-checkbox :checked="allVisibleSelected" :indeterminate="someVisibleSelected"
              @update:checked="toggleSelectAllVisible" />
            <span>{{ $t('nodes.select_all_visible') }}</span>
          </div>

          <div v-if="nodeStore.selectedNodes.length > 0"
            class="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200">
            <span class="text-xs font-medium text-on-surface">{{ $t('nodes.selected_count', {
              count:
                nodeStore.selectedNodes.length
            }) }}</span>
            <div class="h-4 w-px bg-border"></div>
            <button @click="deleteSelectedNodes"
              class="flex items-center gap-1 text-error hover:text-error-hover transition font-medium hover:bg-error/10 px-2 py-1 rounded">
              <div class="i-material-symbols-delete"></div>
              <span>{{ $t('common.delete') }}</span>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
          <div v-for="node in nodeStore.filteredNodes" :key="node.id || node.tag"
            class="group relative flex flex-col bg-surface border rounded-xl transition-all duration-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5"
            :class="[
              isSelected(node)
                ? 'border-primary ring-1 ring-primary bg-primary/5 shadow-[0_0_15px_rgba(var(--rgb-primary),0.1)]'
                : 'border-border hover:border-primary/50'
            ]">

            <!-- Selection Checkbox -->
            <div class="absolute top-3 right-3 z-10 transition-opacity duration-200"
              :class="isSelected(node) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
              <n-checkbox :checked="isSelected(node)" @update:checked="(checked) => setSelection(node, checked)"
                @click.stop />
            </div>

            <!-- Active Indicator Strip -->
            <div v-if="isLocalProxyActiveNode(node)"
              class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary-hover to-primary">
            </div>

            <div class="p-4 flex flex-col h-full">
              <!-- Header -->
              <div class="flex items-start gap-3 mb-4 pr-6">
                <div class="mt-1.5 w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
                  :class="[getNodeStatusColor(node), getNodeStatusColor(node).replace('bg-', 'text-')]"></div>

                <div class="min-w-0 flex-1">
                  <div class="font-bold text-base  text-on-surface truncate leading-tight mb-1"
                    :title="node.tag">
                    {{ node.tag || $t('nodes.unnamed_node') }}
                  </div>
                  <div class="flex items-center justify-between">
                    <span
                      class="uppercase bg-surface-overlay border border-border px-1.5 py-0.5 rounded text-[10px] tracking-wider font-mono text-on-surface-variant">
                      {{ node.type }}
                    </span>
                    <div v-if="isLocalProxyActiveNode(node)"
                      class="text-[8px] bg-surface-overlay  px-1.5 py-0.5 rounded text-primary/80 font-bold uppercase tracking-wider">
                      H: {{ settingsStore.localProxyPort }} <span class="opacity-30 mx-1">|</span>
                      S: {{ settingsStore.localProxyPort + 1 }}</div>
                  </div>
                </div>
              </div>

              <!-- Stats -->
              <div class="mb-4">
                <div
                  class="bg-surface-overlay/50 rounded-lg p-3 border border-border/50 flex items-center justify-between">
                  <span class="text-xs font-bold text-on-surface-muted uppercase tracking-wider">{{
                    $t('common.latency_short') }}</span>
                  <div class="flex items-baseline gap-1" :class="getLatencyColor(getNodeStats(node)?.latency ?? -1)">
                    <div v-if="getNodeStats(node)?.latency && getNodeStats(node)!.latency > 0"
                      class="flex items-baseline gap-1">
                      <span class="text-2xl font-mono font-bold leading-none tracking-tight">
                        {{ getNodeStats(node)!.latency }}
                      </span>
                      <span class="text-xs font-medium opacity-80">ms</span>
                    </div>
                    <span v-else class="text-sm font-mono opacity-50">--</span>
                  </div>
                </div>

              </div>

              <!-- Footer Info -->
              <div class="mt-auto pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                <div class="flex flex-col justify-start">
                  <div class="text-[10px] text-on-surface-muted/50 font-mono truncate ">
                    <span>{{ node.server }}:{{ node.server_port }}</span>
                  </div>
                  <div class="text-[10px] text-on-surface-muted/50 font-mono truncate ">
                    <span v-if="subscriptionLabelOf(node)" class="ml-2 text-primary/80">
                      <button class="hover:underline cursor-pointer"
                        @click.stop="jumpToGroup(subscriptionLabelOf(node))">
                        @{{ subscriptionLabelOf(node) }}
                      </button>
                    </span>
                    <span v-if="manualTagOf(node)" class="ml-2 text-success">
                      <button class="hover:underline cursor-pointer" @click.stop="jumpToGroup(manualTagOf(node))">
                        #{{ manualTagOf(node) }}
                      </button>
                    </span>
                  </div>
                </div>
                <!-- Action Buttons -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <n-button quaternary circle size="tiny" @click.stop="testNodeLatency(node)"
                    :loading="isTestingNode(node)" :title="$t('nodes.check_latency')">
                    <template #icon>
                      <div class="i-material-symbols-network-check text-xs"></div>
                    </template>
                  </n-button>
                  <n-button quaternary circle size="tiny" @click.stop="editNode(node)" :title="$t('common.edit')">
                    <template #icon>
                      <div class="i-material-symbols-edit text-xs"></div>
                    </template>
                  </n-button>
                  <n-button quaternary circle size="tiny" @click.stop="shareNode(node)" :title="$t('common.share')">
                    <template #icon>
                      <div class="i-material-symbols-share text-xs"></div>
                    </template>
                  </n-button>
                  <n-button quaternary circle size="tiny" type="error" @click.stop="deleteNode(node)"
                    :title="$t('common.delete')">
                    <template #icon>
                      <div class="i-material-symbols-delete text-xs"></div>
                    </template>
                  </n-button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>

    <NodeEditModal v-model="showEditModal" :editing-node="editingNode" @save="handleSaveNode" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { DEFAULT_NODE_GROUP, useNodeStore } from '@/stores/nodes'
import { useSettingsStore } from '@/stores/settings'
import { useLocalProxyStore } from '@/stores/local-proxy'
import { generateShareLink } from '@/utils/protocol'
import type { NodeConfig } from '@/types'
import { useClipboard } from '@vueuse/core'
import NodeEditModal from './NodeEditModal.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const nodeStore = useNodeStore()
const settingsStore = useSettingsStore()
const localProxyStore = useLocalProxyStore()
const message = useMessage()
const dialog = useDialog()
const { copy } = useClipboard()

const showEditModal = ref(false)
const editingNode = ref<NodeConfig | null>(null)
const testingNodes = reactive<Set<string>>(new Set())
const groupName = ref('')

function isSelected(node: NodeConfig) {
  return nodeStore.isNodeSelected(node)
}

function setSelection(node: NodeConfig, checked: boolean) {
  nodeStore.setNodeSelected(node, checked)
}

function isTestingNode(node: NodeConfig) {
  const key = node.id || node.tag
  return testingNodes.has(key)
}

function getNodeStats(node: NodeConfig) {
  const key = node.id || node.tag
  return nodeStore.nodeStats[key]
}

function getNodeStatusColor(node: NodeConfig) {
  const stats = getNodeStats(node)
  if (!stats) return 'bg-on-surface-muted/30'

  if (stats.latency < 0) return 'bg-error'
  if (stats.latency < 100) return 'bg-success'
  if (stats.latency < 200) return 'bg-warning'
  return 'bg-error'
}

function getLatencyColor(ms: number) {
  if (ms < 0) return 'text-error'
  if (ms < 100) return 'text-success'
  if (ms < 200) return 'text-warning'
  return 'text-error'
}

function isLocalProxyActiveNode(node: NodeConfig) {
  if (!settingsStore.localProxyEnabled || !localProxyStore.running) return false
  const key = String(node.id || node.tag || '')
  return !!key && key === localProxyStore.activeNodeKey
}

function editNode(node: NodeConfig) {
  editingNode.value = node
  showEditModal.value = true
}

async function deleteNode(node: NodeConfig) {
  dialog.warning({
    title: t('common.delete'),
    content: t('nodes.delete_confirm', { name: node.tag }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    positiveButtonProps: {
      type: 'error'
    },
    onPositiveClick: async () => {
      if (node.id) {
        await nodeStore.removeNode(node.id)
        message.success(t('common.deleted'))
      }
    }
  })
}

async function deleteSelectedNodes() {
  const count = nodeStore.selectedNodes.length
  if (count === 0) return

  dialog.warning({
    title: t('common.delete'),
    content: t('nodes.delete_batch_confirm', { count }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    positiveButtonProps: {
      type: 'error'
    },
    onPositiveClick: async () => {
      const ids = nodeStore.selectedNodes.map(n => n.id).filter(Boolean) as string[]
      if (ids.length) {
        await nodeStore.removeNodes(ids)
        message.success(t('common.deleted'))
      }
    }
  })
}

function applyGroupToSelected() {
  nodeStore.setGroupForSelectedNodes(groupName.value)
  message.success(t('nodes.tag_applied'))
}

function subscriptionLabelOf(node: NodeConfig) {
  const group = nodeStore.getNodeSubscriptionGroup(node)
  return group === DEFAULT_NODE_GROUP ? '' : group
}

function manualTagOf(node: NodeConfig) {
  return nodeStore.getNodeManualTag(node)
}

function jumpToGroup(group: string) {
  const value = String(group || '').trim()
  if (!value) return
  nodeStore.activeGroupFilter = value
}

const allVisibleSelected = computed(() => {
  if (!nodeStore.filteredNodes.length) return false
  return nodeStore.filteredNodes.every((node) => nodeStore.isNodeSelected(node))
})

const someVisibleSelected = computed(() => {
  if (!nodeStore.filteredNodes.length) return false
  const selectedCount = nodeStore.filteredNodes.filter((node) => nodeStore.isNodeSelected(node)).length
  return selectedCount > 0 && selectedCount < nodeStore.filteredNodes.length
})

function toggleSelectAllVisible(checked: boolean) {
  for (const node of nodeStore.filteredNodes) {
    nodeStore.setNodeSelected(node, checked)
  }
}

async function handleSaveNode(node: Omit<NodeConfig, 'id'> | NodeConfig) {
  const ok = await nodeStore.saveNode(node as NodeConfig)
  if (!ok) {
    message.error(t('nodes.save_failed'))
  }
}

async function shareNode(node: NodeConfig) {
  const link = generateShareLink(node)
  if (link) {
    await copy(link)
    message.success(t('nodes.link_copied'))
  } else {
    message.error(t('nodes.link_copy_failed'))
  }
}

async function testNodeLatency(node: NodeConfig) {
  const key = node.id || node.tag
  if (testingNodes.has(key)) return

  testingNodes.add(key)
  try {
    await nodeStore.checkNode(node)
  } finally {
    testingNodes.delete(key)
  }
}

// Expose methods if needed by parent, but mainly NodeManager handles its own list interactions
defineExpose({
  editNode,
  deleteNode
})
</script>
