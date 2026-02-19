<template>
  <div class="space-y-6 animate-fade-in-up">
    <section>
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
        <div class="i-material-symbols-article-outline text-primary"></div>
        {{ $t('settings.runtime_logs') }}
      </h2>
      <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-5 backdrop-blur-sm space-y-4">
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_1fr_2fr_auto] gap-3">
          <n-select v-model:value="logCategory" :options="logCategoryOptions" />
          <n-select v-model:value="logLevel" :options="logLevelOptions" />
          <n-input v-model:value="logKeyword" :placeholder="$t('settings.logs_search_placeholder')" clearable />
          <n-button secondary @click="clearLogs">{{ $t('settings.logs_clear') }}</n-button>
        </div>

        <div class="text-xs text-on-surface-muted">
          {{ $t('settings.logs_count_info', { filtered: filteredLogs.length, total: logEntries.length }) }}
        </div>

        <div class="rounded-xl border border-border/60 bg-black/30 h-[520px] overflow-y-auto custom-scrollbar">
          <div v-if="filteredLogs.length === 0"
            class="h-full flex items-center justify-center text-sm text-on-surface-muted">
            {{ $t('settings.logs_empty') }}
          </div>
          <div v-else class="divide-y divide-white/5">
            <div v-for="row in filteredLogs" :key="row.id" class="flex gap-4 px-4 py-3 font-mono text-sm border-l-[4px]"
              :class="[
                row.level === 'error' ? 'border-[#ff4d4f] bg-[#ff4d4f]/10' :
                  row.level === 'warn' ? 'border-[#faad14] bg-[#faad14]/10' :
                    row.level === 'debug' ? 'border-[#8c8c8c] bg-[#8c8c8c]/5' :
                      'border-[#52c41a] bg-[#52c41a]/10'
              ]">
              <!-- Left Side: Fixed Meta -->
              <div class="flex-none flex flex-col items-center gap-2 w-20">
                <span class="text-[11px] font-bold tracking-tighter ">
                  {{ formatLogTime(row.timestamp) }}
                </span>
                <span
                  class="w-full text-center py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm"
                  :class="logLevelLabelClass(row.level)">
                  {{ row.level }}
                </span>
              </div>

              <!-- Right Side: Content -->
              <div class="flex-1 min-w-0 space-y-1">
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/5 text-primary/80 uppercase tracking-tighter shadow-inner">
                    {{ $t('settings.logs_category_' + row.category) }}
                  </span>
                  <span class="text-[10px] text-white dark:text-gray-400 italic truncate">
                    {{ row.source }}
                  </span>
                </div>

                <div class="break-words leading-relaxed font-medium text-white dark:text-gray-400"
                  :class="logMessageTextClass(row.level)">
                  {{ row.message }}
                </div>

                <div v-if="row.detail"
                  class="mt-2 p-3 rounded-lg text-white dark:text-gray-400 bg-black/40 border border-white/5 text-xs  break-all whitespace-pre-wrap leading-relaxed shadow-inner">
                  {{ row.detail }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSelect, NInput, NButton } from 'naive-ui'
import { logsApi } from '@/api'
import type { LogEntry } from '@/types/electron'

const { t } = useI18n()

const logEntries = ref<LogEntry[]>([])
const logCategory = ref<'all' | 'frontend' | 'backend' | 'core'>('all')
const logLevel = ref<'all' | 'debug' | 'info' | 'warn' | 'error'>('all')
const logKeyword = ref('')

const logCategoryOptions = computed(() => [
  { label: t('settings.logs_all_categories'), value: 'all' },
  { label: t('settings.logs_category_frontend'), value: 'frontend' },
  { label: t('settings.logs_category_backend'), value: 'backend' },
  { label: t('settings.logs_category_core'), value: 'core' },
])

const logLevelOptions = computed(() => [
  { label: t('settings.logs_all_levels'), value: 'all' },
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
])

const filteredLogs = computed(() => {
  const keyword = logKeyword.value.trim().toLowerCase()
  return logEntries.value
    .filter((row) => {
      if (logCategory.value !== 'all' && row.category !== logCategory.value) return false
      if (logLevel.value !== 'all' && row.level !== logLevel.value) return false
      if (!keyword) return true
      const text = `${row.message} ${row.detail || ''} ${row.source}`.toLowerCase()
      return text.includes(keyword)
    })
    .slice()
    .reverse()
})

const onLogNew = (row: LogEntry) => {
  logEntries.value.push(row)
  if (logEntries.value.length > 3000) {
    logEntries.value.splice(0, logEntries.value.length - 3000)
  }
}

async function loadLogs() {
  try {
    const rows = await logsApi.getAll()
    // @ts-ignore
    logEntries.value = Array.isArray(rows) ? rows : []
  } catch {
    logEntries.value = []
  }
}

async function clearLogs() {
  try {
    await logsApi.clear()
  } finally {
    logEntries.value = []
  }
}

function formatLogTime(ts: number) {
  const date = new Date(ts)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function logLevelLabelClass(level: LogEntry['level']) {
  switch (level) {
    case 'error': return 'bg-red-500 text-white'
    case 'warn': return 'bg-amber-500 text-black'
    case 'debug': return 'bg-zinc-700 text-zinc-300'
    default: return 'bg-emerald-500 text-white'
  }
}

function logMessageTextClass(level: LogEntry['level']) {
  switch (level) {
    case 'error': return 'text-[#ff4d4f] font-bold'
    case 'warn': return 'text-[#fadb14] font-bold'
    case 'debug': return 'text-[#bfbfbf]'
    default: return 'text-[#95de64] font-bold'
  }
}

onMounted(async () => {
  await loadLogs()
  try {
    logsApi.onNew(onLogNew)
  } catch (e) { }
})

onUnmounted(() => {
  try {
    logsApi.offNew(onLogNew)
  } catch (e) { }
})
</script>


