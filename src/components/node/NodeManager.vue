<template>
  <div class="h-full flex flex-col">
    <!-- Node List -->
    <div class="flex-1 overflow-y-auto min-h-0 bg-surface-panel">
      <div v-if="nodeStore.nodes.length === 0"
        class="h-full flex flex-col items-center justify-center text-on-surface-muted p-8">
        <div class="i-material-symbols-dns text-4xl mb-2"></div>
        <p>{{ $t('common.no_nodes') }}</p>
      </div>

      <div v-else class="divide-y divide-border">
        <div v-for="node in nodeStore.nodes" :key="node.id || node.tag"
          class="p-3 hover:bg-surface flex items-center justify-between group transition cursor-default">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-2 h-2 rounded-full" :class="getNodeStatusColor(node)"></div>
            <div class="min-w-0">
              <div class="font-medium text-sm text-on-surface truncate">{{ node.tag || 'Unnamed Node' }}</div>
              <div class="text-xs text-on-surface-muted flex items-center gap-2">
                <span class="uppercase bg-surface-overlay px-1 rounded text-[10px]">{{ node.type }}</span>
                <span class="truncate">{{ node.server }}:{{ node.server_port }}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <!-- Status -->
            <div v-if="getNodeStats(node)" class="flex items-center gap-3 text-xs font-mono">
              <div class="flex items-center gap-1" :class="getLatencyColor(getNodeStats(node)!.latency)">
                <div class="i-carbon-chart-line"></div>
                <span>{{ getNodeStats(node)!.latency > 0 ? getNodeStats(node)!.latency + 'ms' : 'Timeout' }}</span>
              </div>
              <div v-if="getNodeStats(node)!.loss > 0" class="flex items-center gap-1 text-error">
                <div class="i-carbon-data-error"></div>
                <span>{{ getNodeStats(node)!.loss }}%</span>
              </div>
            </div>

            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <n-button quaternary circle size="small" @click="editNode(node)" :title="$t('common.edit')">
                <template #icon>
                  <div class="i-material-symbols-edit text-xs"></div>
                </template>
              </n-button>
              <n-button quaternary circle size="small" @click="testNodeLatency(node)" :loading="isTestingNode(node)"
                :title="$t('nodes.check_latency')">
                <template #icon>
                  <div class="i-material-symbols-network-check text-xs"></div>
                </template>
              </n-button>
              <n-button quaternary circle size="small" @click="shareNode(node)" :title="$t('common.share')">
                <template #icon>
                  <div class="i-material-symbols-share text-xs"></div>
                </template>
              </n-button>
              <n-button quaternary circle size="small" type="error" @click="deleteNode(node)"
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

    <NodeEditModal v-model="showEditModal" :editing-node="editingNode" @save="handleSaveNode" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useNodeStore } from '@/stores/nodes'
import { generateShareLink } from '@/utils/protocol'
import type { NodeConfig } from '@/utils/protocol'
import { useClipboard } from '@vueuse/core'
import NodeEditModal from './NodeEditModal.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const nodeStore = useNodeStore()
const message = useMessage()
const dialog = useDialog()
const { copy } = useClipboard()

const showEditModal = ref(false)
const editingNode = ref<NodeConfig | null>(null)
const testingNodes = reactive<Set<string>>(new Set())

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

function editNode(node: NodeConfig) {
  editingNode.value = node
  showEditModal.value = true
}

async function deleteNode(node: NodeConfig) {
  dialog.warning({
    title: t('common.delete') || '确认删除',
    content: t('nodes.delete_confirm', { name: node.tag }) || `确定要删除节点 ${node.tag} 吗？`,
    positiveText: t('common.delete') || '删除',
    negativeText: t('common.cancel') || '取消',
    onPositiveClick: async () => {
      if (node.id) {
        await nodeStore.removeNode(node.id)
        message.success(t('common.deleted') || '已删除')
      }
    }
  })
}

async function handleSaveNode(node: Omit<NodeConfig, 'id'> | NodeConfig) {
  const ok = await nodeStore.saveNode(node as NodeConfig)
  if (!ok) {
    message.error('保存失败，请检查填写内容或查看控制台错误')
  }
}

async function shareNode(node: NodeConfig) {
  const link = generateShareLink(node)
  if (link) {
    await copy(link)
    message.success('节点链接已复制')
  } else {
    message.error('生成分享链接失败')
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
