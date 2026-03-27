<template>
  <div class="flex-1 space-y-6 w-full animate-fade-in-up ">
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.general') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">

        <!-- Language -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-language text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.language') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="localeItem in availableLocales" :key="localeItem.code" @click="setLanguage(localeItem.code)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="currentLocale === localeItem.code
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ localeItem.name }}
            </button>
          </div>
        </div>

        <!-- Theme Mode -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-brightness-6-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.theme_mode') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="mode in themeModes" :key="mode.value" @click="setTheme(mode.value)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold flex items-center justify-center gap-1.5"
              :class="theme === mode.value
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              <div :class="mode.icon" class="text-base text-current"></div>
              <span class="hidden sm:inline">{{ mode.label }}</span>
            </button>
          </div>
        </div>

        <!-- Theme Color -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-palette-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.theme_color') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5">{{ $t('settings.theme_desc') }}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button v-for="color in themeColors" :key="color.value" @click="setThemeColor(color.value)"
              class="group relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ring-2 ring-offset-2 ring-offset-surface"
              :class="[
                color.bg,
                themeColor === color.value ? 'scale-110 shadow-md ring-current' : 'ring-transparent opacity-60 hover:opacity-100'
              ]" :title="color.label">
              <div v-if="themeColor === color.value"
                class="i-material-symbols-check text-white font-bold text-sm animate-scale-in">
              </div>
            </button>
          </div>
        </div>

        <!-- Window Close Behavior -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-close-rounded text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.window_close_behavior') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5 line-clamp-2">{{
                $t('settings.window_close_behavior_desc') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="action in windowCloseActions" :key="action.value" @click="setWindowCloseAction(action.value)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.windowCloseAction === action.value
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </section>
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.protocol_guard') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div class="p-4 lg:p-5 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-link text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.protocol_guard_switch') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5 line-clamp-2">
                {{ $t('settings.protocol_guard_desc') }}
              </div>
            </div>
          </div>
        </div>

        <div v-for="row in protocolGuardRows" :key="row.scheme"
          class="p-4 lg:p-5 hover:bg-surface-overlay/30 transition-colors">
          <div class="space-y-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <div class="font-bold text-sm">{{ row.label }}</div>
                  <span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold"
                    :class="row.statusClass">
                    <span class="h-1.5 w-1.5 rounded-full" :class="row.statusDotClass"></span>
                    {{ row.statusLabel }}
                  </span>
                </div>
                <div class="text-xs text-on-surface-muted mt-1">
                  {{ row.description }}
                </div>
              </div>
              <div class="shrink-0 flex items-center gap-3 self-start">
                <n-switch :value="row.enabled" :loading="protocolGuardUpdating[row.scheme]" :disabled="row.busy"
                  @update:value="(value) => setProtocolGuardEnabledForScheme(row.scheme, value)" />
              </div>
            </div>

            <div v-if="row.hint" class="rounded-xl border px-3 py-2 text-xs leading-5" :class="row.hintClass">
              {{ row.hint }}
            </div>

            <div
              class="flex flex-col gap-3 text-xs text-on-surface-muted sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2">
                <div class="i-material-symbols-history text-sm"></div>
                <span>{{ $t('settings.protocol_guard_last_checked') }}: {{ row.checkedAtLabel }}</span>
              </div>
              <n-button quaternary size="small" :loading="protocolGuardRefreshing[row.scheme]"
                @click="refreshProtocolGuardState(row.scheme, true)">
                <template #icon>
                  <div class="i-material-symbols-refresh"></div>
                </template>
                {{ $t('settings.protocol_guard_refresh') }}
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Developer Section -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.developer') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-developer-mode-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.developer') }}</div>
            </div>
          </div>
          <div class="shrink-0">
            <n-button secondary class="glass-button" @click="openDevTools">
              {{ $t('settings.open_devtools') }}
            </n-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { appApi, electronApi } from '@/api'
import { useTheme, type ThemeColor, type Theme } from '@/composables/useTheme'
import { useSettingsStore, type WindowCloseAction } from '@/stores/settings'

const { locale, t } = useI18n()
const message = useMessage()
const { theme, setTheme, themeColor, setThemeColor } = useTheme()
const settingsStore = useSettingsStore()

type ProtocolGuardScheme = 'clash' | 'mihomo'
type ProtocolGuardState = Awaited<ReturnType<typeof appApi.getProtocolGuardState>>
const protocolGuardSchemes: ProtocolGuardScheme[] = ['clash', 'mihomo']

const currentLocale = computed(() => settingsStore.language)
const availableLocales = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' }
]

const themeModes = computed<{ value: Theme, label: string, icon: string }[]>(() => [
  { value: 'light', label: t('settings.theme_light'), icon: 'i-material-symbols-light-mode-outline' },
  { value: 'dark', label: t('settings.theme_dark'), icon: 'i-material-symbols-dark-mode-outline' },
  { value: 'auto', label: t('settings.theme_auto'), icon: 'i-material-symbols-hdr-auto' }
])

const themeColors: { value: ThemeColor, label: string, bg: string }[] = [
  { value: 'green', label: 'Green', bg: 'bg-[#10b981]' },
  { value: 'blue', label: 'Blue', bg: 'bg-[#3b82f6]' },
  { value: 'purple', label: 'Purple', bg: 'bg-[#8b5cf6]' },
  { value: 'orange', label: 'Orange', bg: 'bg-[#f97316]' },
  { value: 'red', label: 'Red', bg: 'bg-[#ef4444]' }
]

const windowCloseActions = computed<{ value: WindowCloseAction, label: string }[]>(() => [
  { value: 'ask', label: t('settings.window_close_ask') },
  { value: 'minimize', label: t('settings.window_close_minimize') },
  { value: 'quit', label: t('settings.window_close_quit') }
])
const protocolGuardStates = ref<Record<ProtocolGuardScheme, ProtocolGuardState | null>>({
  clash: null,
  mihomo: null
})
const protocolGuardRefreshing = ref<Record<ProtocolGuardScheme, boolean>>({
  clash: false,
  mihomo: false
})
const protocolGuardUpdating = ref<Record<ProtocolGuardScheme, boolean>>({
  clash: false,
  mihomo: false
})

function getProtocolGuardEnabled(scheme: ProtocolGuardScheme): boolean {
  return scheme === 'clash'
    ? settingsStore.clashProtocolGuardEnabled
    : settingsStore.mihomoProtocolGuardEnabled
}

function setProtocolGuardEnabledFlag(scheme: ProtocolGuardScheme, enabled: boolean) {
  if (scheme === 'clash') {
    settingsStore.clashProtocolGuardEnabled = enabled
    return
  }
  settingsStore.mihomoProtocolGuardEnabled = enabled
}

function getProtocolGuardStatusLabel(scheme: ProtocolGuardScheme) {
  switch (protocolGuardStates.value[scheme]?.status) {
    case 'owned':
      return t('settings.protocol_guard_status_owned')
    case 'external':
      return t('settings.protocol_guard_status_external')
    case 'unsupported':
      return t('settings.protocol_guard_status_unsupported')
    default:
      return t('settings.protocol_guard_status_unknown')
  }
}

function getProtocolGuardStatusClass(scheme: ProtocolGuardScheme) {
  switch (protocolGuardStates.value[scheme]?.status) {
    case 'owned':
      return 'border-success/30 bg-success/10 text-success'
    case 'external':
      return 'border-warning/30 bg-warning/10 text-warning'
    case 'unsupported':
      return 'border-border/40 bg-surface-overlay/40 text-on-surface-muted'
    default:
      return 'border-border/40 bg-surface-overlay/40 text-on-surface-muted'
  }
}

function getProtocolGuardStatusDotClass(scheme: ProtocolGuardScheme) {
  switch (protocolGuardStates.value[scheme]?.status) {
    case 'owned':
      return 'bg-success'
    case 'external':
      return 'bg-warning'
    default:
      return 'bg-on-surface-muted/70'
  }
}

function getProtocolGuardSummary(scheme: ProtocolGuardScheme) {
  const state = protocolGuardStates.value[scheme]
  if (!state) return t('common.checking')
  if (!state.supported) return t('settings.protocol_guard_summary_unsupported')
  if (state.enabled && state.status === 'owned') return t('settings.protocol_guard_summary_owned_enabled')
  if (state.enabled && state.status === 'external') return t('settings.protocol_guard_summary_external_enabled')
  if (!state.enabled && state.status === 'owned') return t('settings.protocol_guard_summary_owned_disabled')
  return t('settings.protocol_guard_summary_external_disabled')
}

function getProtocolGuardCheckedAtLabel(scheme: ProtocolGuardScheme) {
  const checkedAt = protocolGuardStates.value[scheme]?.checkedAt
  if (!checkedAt) return '-'
  return new Date(checkedAt).toLocaleString()
}

function getProtocolGuardDescription(scheme: ProtocolGuardScheme) {
  return scheme === 'clash'
    ? t('settings.protocol_guard_scheme_desc_clash')
    : t('settings.protocol_guard_scheme_desc_mihomo')
}

function getProtocolGuardHint(scheme: ProtocolGuardScheme) {
  const state = protocolGuardStates.value[scheme]
  if (!state) return t('common.checking')
  if (!state.supported) return t('settings.protocol_guard_summary_unsupported')
  if (state.status === 'external') return getProtocolGuardSummary(scheme)
  if (!state.enabled) return getProtocolGuardSummary(scheme)
  return ''
}

function getProtocolGuardHintClass(scheme: ProtocolGuardScheme) {
  const state = protocolGuardStates.value[scheme]
  if (!state) {
    return 'border-border/30 bg-surface-overlay/30 text-on-surface-muted'
  }
  if (!state.supported) {
    return 'border-border/30 bg-surface-overlay/30 text-on-surface-muted'
  }
  if (state.status === 'external') {
    return 'border-warning/25 bg-warning/8 text-warning'
  }
  if (!state.enabled) {
    return 'border-border/30 bg-surface-overlay/30 text-on-surface-muted'
  }
  return 'border-border/30 bg-surface-overlay/30 text-on-surface-muted'
}

const protocolGuardRows = computed(() => protocolGuardSchemes.map((scheme) => ({
  scheme,
  label: `${scheme}://`,
  description: getProtocolGuardDescription(scheme),
  enabled: getProtocolGuardEnabled(scheme),
  state: protocolGuardStates.value[scheme],
  busy: protocolGuardRefreshing.value[scheme] || protocolGuardUpdating.value[scheme],
  statusLabel: getProtocolGuardStatusLabel(scheme),
  statusClass: getProtocolGuardStatusClass(scheme),
  statusDotClass: getProtocolGuardStatusDotClass(scheme),
  hint: getProtocolGuardHint(scheme),
  hintClass: getProtocolGuardHintClass(scheme),
  checkedAtLabel: getProtocolGuardCheckedAtLabel(scheme)
})))

const { resume: resumeProtocolGuardPolling, pause: pauseProtocolGuardPolling } = useIntervalFn(() => {
  void refreshAllProtocolGuardStates(false)
}, 30000, { immediate: false })

function isWindowCloseAction(value: unknown): value is WindowCloseAction {
  return value === 'ask' || value === 'minimize' || value === 'quit'
}

function setLanguage(lang: string) {
  settingsStore.language = lang
  locale.value = lang
}

async function setWindowCloseAction(action: WindowCloseAction) {
  settingsStore.windowCloseAction = action
  try {
    await electronApi.setWindowCloseAction(action)
  } catch {
    // ignore
  }
}

function applyProtocolGuardState(state: ProtocolGuardState) {
  protocolGuardStates.value[state.scheme] = state
  setProtocolGuardEnabledFlag(state.scheme, state.enabled)
}

async function refreshProtocolGuardState(scheme: ProtocolGuardScheme, showError = true) {
  protocolGuardRefreshing.value[scheme] = true
  try {
    const state = await appApi.getProtocolGuardState(scheme)
    applyProtocolGuardState(state)
  } catch {
    if (showError) {
      message.error(t('settings.protocol_guard_refresh_failed', { scheme: `${scheme}://` }))
    }
  } finally {
    protocolGuardRefreshing.value[scheme] = false
  }
}

async function refreshAllProtocolGuardStates(showError = true) {
  await Promise.allSettled(protocolGuardSchemes.map((scheme) => refreshProtocolGuardState(scheme, showError)))
}

async function setProtocolGuardEnabledForScheme(scheme: ProtocolGuardScheme, enabled: boolean) {
  protocolGuardUpdating.value[scheme] = true
  try {
    const state = await appApi.setProtocolGuardEnabled(scheme, enabled)
    applyProtocolGuardState(state)
    message.success(t(enabled
      ? 'settings.protocol_guard_enabled_success'
      : 'settings.protocol_guard_disabled_success', { scheme: `${scheme}://` }))
  } catch {
    message.error(t('settings.protocol_guard_update_failed', { scheme: `${scheme}://` }))
    await refreshProtocolGuardState(scheme, false)
  } finally {
    protocolGuardUpdating.value[scheme] = false
  }
}

onMounted(async () => {
  try {
    const action = await electronApi.getWindowCloseAction()
    if (isWindowCloseAction(action)) {
      settingsStore.windowCloseAction = action
    }
  } catch {
    // ignore
  }
  await refreshAllProtocolGuardStates(false)
  resumeProtocolGuardPolling()
})

onUnmounted(() => {
  pauseProtocolGuardPolling()
})

function openDevTools() {
  window.electron.openDevTools()
}
</script>
