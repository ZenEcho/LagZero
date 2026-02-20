<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="$t('nodes.subscription_manage')" class="w-[800px]" :mask-closable="false">

    <div class="mb-4 rounded-xl border border-border/50 bg-surface-panel/40 p-4">
      <div class="grid grid-cols-1 md:grid-cols-[1fr_2fr_180px_120px] gap-2 mb-3">
        <n-input v-model:value="subscriptionName" :placeholder="$t('nodes.subscription_name')" />
        <n-input v-model:value="subscriptionUrl" :placeholder="$t('nodes.subscription_url')" />
        <n-select v-model:value="subscriptionSchedule" :options="subscriptionScheduleOptions" />
        <n-button type="primary" @click="handleAddSubscription">{{ $t('common.add') }}</n-button>
      </div>

      <div v-if="nodeStore.subscriptions.length > 0" class="space-y-2 max-h-[400px] overflow-y-auto">
        <div v-for="sub in nodeStore.subscriptions" :key="sub.id"
          class="rounded-lg border border-border/60 bg-surface/40 px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
          <div class="min-w-0 flex-1">
            <template v-if="editingId === sub.id">
              <div class="grid grid-cols-1 md:grid-cols-[1fr_2fr_150px] gap-2">
                <n-input v-model:value="editDraft.name" size="small" :placeholder="$t('nodes.subscription_name')" />
                <n-input v-model:value="editDraft.url" size="small" :placeholder="$t('nodes.subscription_url')" />
                <n-select v-model:value="editDraft.schedule" size="small" :options="subscriptionScheduleOptions" />
              </div>
            </template>
            <template v-else>
              <div class="text-sm font-medium truncate">{{ sub.name }}</div>
              <div class="text-xs text-on-surface-muted truncate">{{ sub.url }}</div>
            </template>
            <div v-if="editingId !== sub.id" class="text-[11px] text-on-surface-muted">
              {{ $t('nodes.subscription_last_fetch') }}: {{ formatLastFetched(sub.lastFetchedAt) }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <n-switch v-if="editingId !== sub.id" :value="sub.enabled"
              @update:value="(val) => toggleSubscriptionEnabled(sub.id, val)" />
            <n-button v-if="editingId !== sub.id" size="small" @click="startEdit(sub.id)">{{ $t('common.edit')
              }}</n-button>
            <n-button v-else size="small" type="primary" @click="saveEdit(sub.id)">{{ $t('common.save') }}</n-button>
            <n-button v-if="editingId === sub.id" size="small" @click="cancelEdit">{{ $t('common.cancel') }}</n-button>
            <n-button v-if="editingId !== sub.id" size="small" @click="refreshSubscription(sub.id)">{{
              $t('nodes.subscription_refresh') }}</n-button>
            <n-button v-if="editingId !== sub.id" size="small" type="error" @click="removeSubscription(sub.id)">{{
              $t('common.delete') }}</n-button>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-8 text-on-surface-muted">
        {{ $t('common.no_data') }}
      </div>
    </div>

  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useNodeStore, type NodeSubscriptionSchedule } from '@/stores/nodes'
import i18n from '@/i18n'

defineProps<{
  modelValue: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const nodeStore = useNodeStore()
const message = useMessage()
const dialog = useDialog()

const subscriptionName = ref('')
const subscriptionUrl = ref('')
const subscriptionSchedule = ref<NodeSubscriptionSchedule>('daily')
const editingId = ref('')
const editDraft = ref<{
  name: string
  url: string
  schedule: NodeSubscriptionSchedule
}>({
  name: '',
  url: '',
  schedule: 'daily'
})

const subscriptionScheduleOptions = computed(() => [
  { label: i18n.global.t('nodes.subscription_schedule_startup'), value: 'startup' },
  { label: i18n.global.t('nodes.subscription_schedule_daily'), value: 'daily' },
  { label: i18n.global.t('nodes.subscription_schedule_monthly'), value: 'monthly' }
])

function formatLastFetched(ts?: number) {
  if (!ts) return i18n.global.t('nodes.subscription_never')
  return new Date(ts).toLocaleString()
}

function handleAddSubscription() {
  const ok = nodeStore.addSubscription({
    name: subscriptionName.value,
    url: subscriptionUrl.value,
    schedule: subscriptionSchedule.value
  })
  if (!ok) {
    message.warning(i18n.global.t('nodes.subscription_invalid_form'))
    return
  }
  subscriptionName.value = ''
  subscriptionUrl.value = ''
  subscriptionSchedule.value = 'daily'
  message.success(i18n.global.t('nodes.subscription_added'))
}

async function refreshSubscription(id: string) {
  const result = await nodeStore.refreshSubscription(id)
  if (result.ok) {
    message.success(i18n.global.t('common.import_success', { count: result.count }))
  } else {
    message.error(i18n.global.t('nodes.subscription_update_failed'))
  }
}

function removeSubscription(id: string) {
  const sub = nodeStore.subscriptions.find((row) => row.id === id)
  const name = String(sub?.name || '').trim()
  const count = name
    ? nodeStore.nodes.filter((node) => nodeStore.getNodeSubscriptionGroup(node) === name).length
    : 0

  dialog.warning({
    title: i18n.global.t('common.delete'),
    content: i18n.global.t('nodes.subscription_delete_confirm', { name }),
    positiveText: i18n.global.t('nodes.subscription_delete_with_nodes', { count }),
    negativeText: i18n.global.t('nodes.subscription_delete_only'),
    onPositiveClick: async () => {
      await nodeStore.removeSubscription(id, { deleteNodes: true })
      message.success(i18n.global.t('common.deleted'))
    },
    onNegativeClick: async () => {
      await nodeStore.removeSubscription(id, { deleteNodes: false })
      message.success(i18n.global.t('common.deleted'))
    }
  })
}

function toggleSubscriptionEnabled(id: string, enabled: boolean) {
  nodeStore.updateSubscription(id, { enabled })
}

function startEdit(id: string) {
  const target = nodeStore.subscriptions.find((row) => row.id === id)
  if (!target) return
  editingId.value = id
  editDraft.value = {
    name: target.name,
    url: target.url,
    schedule: target.schedule
  }
}

function cancelEdit() {
  editingId.value = ''
  editDraft.value = {
    name: '',
    url: '',
    schedule: 'daily'
  }
}

function saveEdit(id: string) {
  const name = editDraft.value.name.trim()
  const url = editDraft.value.url.trim()
  if (!name || !url) {
    message.warning(i18n.global.t('nodes.subscription_invalid_form'))
    return
  }
  nodeStore.updateSubscription(id, {
    name,
    url,
    schedule: editDraft.value.schedule
  })
  message.success(i18n.global.t('common.save'))
  cancelEdit()
}
</script>
