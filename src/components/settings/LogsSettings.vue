<template>
  <div class="flex-1 space-y-6 w-full animate-fade-in-up ">
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.runtime_logs') }}
      </h2>
      <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm space-y-4">

        <div class="grid grid-cols-1 lg:grid-cols-[1fr_1fr_2fr_auto] gap-3">
          <n-select v-model:value="logCategory" :options="logCategoryOptions" class="glass-select" />
          <n-select v-model:value="logLevel" :options="logLevelOptions" class="glass-select" />
          <n-input v-model:value="logKeyword" :placeholder="$t('settings.logs_search_placeholder')" clearable
            class="glass-input" />
          <n-button secondary @click="clearLogs" class="glass-button w-full lg:w-auto">
            <template #icon>
              <div class="i-material-symbols-delete-outline"></div>
            </template>
            {{ $t('settings.logs_clear') }}
          </n-button>
        </div>

        <div class="text-xs text-on-surface-muted flex gap-4">
          <span>{{ $t('settings.logs_count_info', { filtered: filteredLogs.length, total: logEntries.length }) }}</span>
        </div>

        <div v-if="logDirPath"
          class="text-[11px] text-on-surface-muted break-all border border-border/30 bg-surface-overlay/30 p-2 rounded-lg">
          <div><span class="font-bold border-b border-border/50 pb-0.5">{{ $t('settings.logs_current_dir') }}:</span>
            <span class="font-mono mt-1 block">{{ logDirPath }}</span>
          </div>
          <div class="mt-2"><span class="font-bold border-b border-border/50 pb-0.5">{{ $t('settings.logs_current_path')
          }}:</span> <span class="font-mono mt-1 block">{{ logFilePath }}</span></div>
        </div>

        <div
          class="rounded-xl border border-border/50 bg-surface-overlay/30 h-[calc(100vh-550px)] min-h-[400px] overflow-y-auto custom-scrollbar shadow-inner">
          <div v-if="filteredLogs.length === 0"
            class="h-full flex flex-col items-center justify-center text-sm text-on-surface-muted gap-2">
            <div class="i-material-symbols-article-outline text-4xl opacity-50"></div>
            {{ $t('settings.logs_empty') }}
          </div>
          <div v-else class="divide-y divide-border/30">
            <div v-for="row in filteredLogs" :key="row.id"
              class="flex gap-4 px-4 py-3 font-mono text-xs sm:text-sm border-l-[3px] transition-colors hover:bg-surface-overlay/20"
              :class="[
                row.level === 'error' ? 'border-error bg-error/5 hover:bg-error/10' :
                  row.level === 'warn' ? 'border-warning bg-warning/5 hover:bg-warning/10' :
                    row.level === 'debug' ? 'border-secondary bg-secondary/5 hover:bg-secondary/10' :
                      'border-success bg-success/5 hover:bg-success/10'
              ]">
              <!-- Left Side: Fixed Meta -->
              <div class="flex-none flex flex-col items-center gap-2 w-16 sm:w-20">
                <span class="text-[10px] sm:text-[11px] font-bold tracking-tighter text-on-surface-muted">
                  {{ formatLogTime(row.timestamp) }}
                </span>
                <span
                  class="w-full text-center py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-sm"
                  :class="logLevelLabelClass(row.level)">
                  {{ row.level }}
                </span>
              </div>

              <!-- Right Side: Content -->
              <div class="flex-1 min-w-0 space-y-1.5 pt-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    class="text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded bg-surface/80 border border-border/50 text-primary/80 uppercase tracking-tighter shadow-sm">
                    {{ $t('settings.logs_category_' + row.category) }}
                  </span>
                  <span class="text-[10px] text-on-surface-muted italic shrink-0 break-all">
                    {{ row.source }}
                  </span>
                </div>

                <div class="break-words leading-relaxed font-medium text-on-surface"
                  :class="logMessageTextClass(row.level)">
                  {{ row.message }}
                </div>

                <div v-if="row.detail"
                  class="mt-2 p-2 sm:p-3 rounded-lg text-on-surface bg-background/50 border border-border/50 text-[11px] sm:text-xs break-all whitespace-pre-wrap leading-relaxed shadow-inner">
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
const logDirPath = ref('')
const logFilePath = ref('')
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

async function loadLogFilePath() {
  try {
    const filePath = await logsApi.getFilePath()
    logFilePath.value = String(filePath || '')
  } catch {
    logFilePath.value = ''
  }
}

async function loadLogDirPath() {
  try {
    const dirPath = await logsApi.getDirPath()
    logDirPath.value = String(dirPath || '')
  } catch {
    logDirPath.value = ''
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
    case 'error': return 'bg-error text-on-error'
    case 'warn': return 'bg-warning text-on-warning'
    case 'debug': return 'bg-secondary text-on-secondary'
    default: return 'bg-success text-on-success'
  }
}

function logMessageTextClass(level: LogEntry['level']) {
  switch (level) {
    case 'error': return 'text-error font-bold'
    case 'warn': return 'text-warning font-bold'
    case 'debug': return 'text-secondary'
    default: return 'text-success font-bold'
  }
}

onMounted(async () => {
  await Promise.all([loadLogs(), loadLogFilePath(), loadLogDirPath()])
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
