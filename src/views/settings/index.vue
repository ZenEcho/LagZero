<template>
  <div class="h-full relative overflow-hidden bg-background text-on-surface flex transition-colors duration-300">
    <!-- Ambient Background Effects -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        class="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] animate-pulse-slow">
      </div>
      <div
        class="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-secondary/5 rounded-full blur-[80px] animate-pulse-slow"
        style="animation-delay: 2s;"></div>
    </div>

    <!-- Main Layout Container -->
    <div class="relative z-10 flex w-full h-full max-w-7xl mx-auto p-4 md:p-8 gap-8">

      <!-- Sidebar Navigation -->
      <aside class="w-64 flex-none flex flex-col gap-6">
        <div class="px-2">
          <h1 class="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {{ $t('common.settings') }}
          </h1>
          <p class="text-xs text-on-surface-muted mt-1 uppercase tracking-widest font-bold opacity-60">
            {{ $t('settings.preferences') }}
          </p>
        </div>

        <nav class="flex flex-col gap-2">
          <button v-for="tab in tabs" :key="tab.name" @click="activeTab = tab.name"
            class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden text-left"
            :class="activeTab === tab.name
              ? 'bg-primary/10 text-primary font-bold shadow-sm'
              : 'hover:bg-surface-overlay text-on-surface-muted hover:text-on-surface'">

            <!-- Active Indicator -->
            <div v-if="activeTab === tab.name"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"></div>

            <div
              :class="[tab.icon, activeTab === tab.name ? 'text-primary' : 'text-on-surface-muted group-hover:text-on-surface']"
              class="text-xl transition-colors"></div>
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <!-- App Info Small -->
        <div class="mt-auto px-4 py-4 rounded-xl bg-surface-panel/30 border border-border/50 backdrop-blur-sm">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-8 h-8 rounded-lg bg-surface-panel flex items-center justify-center border border-border">
              <img src="/logo.svg" class="w-5 h-5" alt="Logo" />
            </div>
            <div>
              <div class="text-sm font-bold">LagZero</div>
              <div class="text-[10px] text-on-surface-muted font-mono">v{{ appVersion }}</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main
        class="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-surface-panel/40 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl relative">
        <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-8">
          <Transition name="fade-slide" mode="out-in">
            <!-- General Settings -->
            <div v-if="activeTab === 'general'" class="space-y-8 max-w-3xl animate-fade-in-up">

              <!-- Language Section -->
              <section>
                <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
                  <div class="i-material-symbols-language text-primary"></div>
                  {{ $t('settings.language') }}
                </h2>
                <div class="bg-surface/50 border border-border/50 rounded-2xl p-1 flex gap-2 w-fit backdrop-blur-sm">
                  <button v-for="localeItem in availableLocales" :key="localeItem.code"
                    @click="setLanguage(localeItem.code)"
                    class="px-6 py-2.5 rounded-xl transition-all duration-200 font-medium relative overflow-hidden"
                    :class="currentLocale === localeItem.code
                      ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                      : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
                    {{ localeItem.name }}
                  </button>
                </div>
              </section>

              <div class="w-full h-px bg-border/30"></div>

              <!-- Theme Section -->
              <section>
                <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
                  <div class="i-material-symbols-palette-outline text-primary"></div>
                  {{ $t('settings.theme_color') }}
                </h2>
                <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm">
                  <div class="flex flex-wrap gap-4">
                    <button v-for="color in themeColors" :key="color.value" @click="setThemeColor(color.value)"
                      class="group relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
                      :class="[
                        color.bg,
                        themeColor === color.value ? 'scale-110 shadow-lg ring-2 ring-offset-2 ring-offset-surface ring-current' : 'opacity-70 hover:opacity-100 hover:scale-105'
                      ]" :title="color.label">
                      <div v-if="themeColor === color.value"
                        class="i-material-symbols-check text-white font-bold text-xl animate-scale-in">
                      </div>
                    </button>
                  </div>
                  <p class="mt-4 text-sm text-on-surface-muted">
                    {{ $t('settings.theme_desc') }}
                  </p>
                </div>
              </section>
            </div>

            <!-- Network Settings -->
            <div v-else-if="activeTab === 'network'" class="space-y-8 max-w-3xl animate-fade-in-up">

              <!-- Latency Check -->
              <section>
                <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
                  <div class="i-material-symbols-speed text-primary"></div>
                  {{ $t('settings.network') }}
                </h2>
                <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm space-y-6">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="space-y-3">
                      <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
                        $t('settings.check_method') }}</label>
                      <div class="flex bg-surface-overlay/50 p-1 rounded-xl border border-border/30">
                        <button v-for="method in ['ping', 'tcp']" :key="method" @click="setCheckMethod(method)"
                          class="flex-1 py-2 text-sm rounded-lg transition-all font-bold" :class="settingsStore.checkMethod === method
                            ? 'bg-surface shadow-sm text-primary'
                            : 'text-on-surface-muted hover:text-on-surface'">
                          {{ method.toUpperCase() }}
                        </button>
                      </div>
                    </div>

                    <div class="space-y-3">
                      <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
                        $t('settings.check_interval') }}</label>
                      <n-select v-model:value="settingsStore.checkInterval" :options="intervalOptions"
                        class="glass-select" />
                    </div>
                  </div>
                </div>
              </section>

              <div class="w-full h-px bg-border/30"></div>

              <!-- DNS Settings -->
              <section>
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-xl font-bold flex items-center gap-2">
                    <div class="i-material-symbols-dns-outline text-primary"></div>
                    {{ $t('settings.dns_config') }}
                  </h2>
                  <div class="flex bg-surface-overlay/50 rounded-lg p-1 border border-border/30">
                    <button @click="settingsStore.dnsMode = 'secure'"
                      class="px-3 py-1 text-xs rounded-md transition font-medium" :class="settingsStore.dnsMode === 'secure'
                        ? 'bg-surface shadow-sm text-primary'
                        : 'text-on-surface-muted hover:text-on-surface'">
                      {{ $t('settings.dns_mode_secure') }}
                    </button>
                    <button @click="settingsStore.dnsMode = 'system'"
                      class="px-3 py-1 text-xs rounded-md transition font-medium" :class="settingsStore.dnsMode === 'system'
                        ? 'bg-surface shadow-sm text-primary'
                        : 'text-on-surface-muted hover:text-on-surface'">
                      {{ $t('settings.dns_mode_system') }}
                    </button>
                  </div>
                </div>

                <div
                  class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm transition-opacity duration-300"
                  :class="{ 'opacity-50 pointer-events-none grayscale': settingsStore.dnsMode === 'system' }">
                  <div class="space-y-4">
                    <div class="space-y-2">
                      <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
                        $t('settings.dns_primary') }}</label>
                      <n-input v-model:value="settingsStore.dnsPrimary" placeholder="https://dns.google/dns-query"
                        class="glass-input" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
                        $t('settings.dns_secondary') }}</label>
                      <n-input v-model:value="settingsStore.dnsSecondary" placeholder="https://1.1.1.1/dns-query"
                        class="glass-input" />
                    </div>
                  </div>
                </div>
              </section>

              <div class="w-full h-px bg-border/30"></div>

              <!-- Advanced Network -->
              <section>
                <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
                  <div class="i-material-symbols-settings-ethernet text-primary"></div>
                  {{ $t('common.more') }}
                </h2>
                <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm space-y-6">
                  <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
                      $t('settings.tun_interface') }}</label>
                    <n-input v-model:value="settingsStore.tunInterfaceName" placeholder="singbox-tun"
                      class="glass-input" />
                  </div>

                  <div class="flex flex-wrap gap-4 pt-2">
                    <n-button secondary type="warning" @click="handleReinstallTun" :loading="working"
                      :disabled="working" class="glass-button">
                      <template #icon>
                        <div class="i-material-symbols-refresh"></div>
                      </template>
                      {{ $t('settings.tun_reinstall') }}
                    </n-button>
                    <n-button secondary type="info" @click="handleFlushDns" :loading="working" :disabled="working"
                      class="glass-button">
                      <template #icon>
                        <div class="i-material-symbols-cleaning-services"></div>
                      </template>
                      {{ $t('settings.dns_flush') }}
                    </n-button>
                  </div>

                  <div v-if="opMessage"
                    class="px-4 py-3 rounded-xl text-sm flex items-center gap-3 border animate-scale-in"
                    :class="opOk ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'">
                    <div :class="opOk ? 'i-material-symbols-check-circle text-lg' : 'i-material-symbols-error text-lg'">
                    </div>
                    {{ opMessage }}
                  </div>
                </div>
              </section>
            </div>

            <!-- About Tab -->
            <div v-else-if="activeTab === 'about'"
              class="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in-up">
              <div class="relative mb-8 group">
                <div
                  class="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 group-hover:scale-175 transition-transform duration-700">
                </div>
                <img src="/logo.svg"
                  class="relative w-32 h-32 drop-shadow-2xl transition-transform duration-500 group-hover:scale-110"
                  alt="LagZero Logo" />
              </div>

              <h1
                class=" h-14 text-4xl font-black bg-gradient-to-br from-primary via-purple-500 to-secondary bg-clip-text text-transparent mb-2">
                LagZero
              </h1>
              <p class="text-on-surface-muted mb-8 tracking-wide">{{ $t('settings.tagline') }}</p>

              <div class="grid gap-3 w-full max-w-xs">
                <div
                  class="bg-surface-overlay/50 border border-border/50 rounded-xl p-3 flex justify-between items-center mb-4 backdrop-blur-sm">
                  <span class="text-sm font-medium text-on-surface-muted">{{ $t('settings.current_version') }}</span>
                  <span class="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">v{{ appVersion
                  }}</span>
                </div>

                <n-button type="primary" block secondary size="large" @click="checkUpdate" :loading="checkingUpdate"
                  class="glass-button-primary">
                  <template #icon>
                    <div class="i-material-symbols-update"></div>
                  </template>
                  {{ $t('settings.check_update') }}
                </n-button>

                <div class="grid grid-cols-2 gap-3">
                  <n-button block secondary @click="openReleasesUrl" class="glass-button">
                    <template #icon>
                      <div class="i-material-symbols-history"></div>
                    </template>
                    {{ $t('settings.releases') }}
                  </n-button>
                  <n-button block secondary @click="openProjectUrl" class="glass-button">
                    <template #icon>
                      <div class="i-carbon-logo-github"></div>
                    </template>
                    GitHub
                  </n-button>
                </div>
              </div>

              <div v-if="updateInfo"
                class="mt-8 w-full max-w-md text-left bg-surface-panel/80 backdrop-blur-md border border-border p-5 rounded-2xl text-sm space-y-3 animate-scale-in shadow-xl">
                <div v-if="updateInfo.error" class="text-red-500 flex items-center gap-2">
                  <div class="i-material-symbols-error text-xl"></div>
                  {{ $t('settings.update_error', { msg: updateInfo.error }) }}
                </div>
                <div v-else-if="updateInfo.available" class="space-y-3">
                  <div class="text-green-500 font-bold flex items-center gap-2 text-base">
                    <div class="i-material-symbols-rocket-launch"></div>
                    {{ $t('settings.update_available', { version: updateInfo.version }) }}
                  </div>
                  <div v-if="updateInfo.note"
                    class="text-on-surface-muted text-xs whitespace-pre-wrap max-h-40 overflow-y-auto bg-surface/50 p-3 rounded-lg border border-border/50 font-mono">
                    {{ updateInfo.note }}
                  </div>

                  <n-button type="primary" size="small" block class="glass-button-primary mt-2"
                    @click="openReleasesUrl">
                    <template #icon>
                      <div class="i-material-symbols-download"></div>
                    </template>
                    {{ $t('settings.download_update') }}
                  </n-button>

                  <div class="text-xs text-on-surface-muted text-right">{{ updateInfo.date }}</div>
                </div>
                <div v-else class="text-on-surface-muted flex items-center justify-center gap-2 py-2">
                  <div class="i-material-symbols-check-circle text-green-500 text-lg"></div>
                  {{ $t('settings.no_update') }}
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeColor } from '@/composables/useTheme'
import { useSettingsStore } from '@/stores/settings'
import { NSelect, NInput, NButton } from 'naive-ui'

const { locale, t } = useI18n()
const { themeColor, setThemeColor } = useTheme()
const settingsStore = useSettingsStore()

const activeTab = ref('general')
const tabs = computed(() => [
  { name: 'general', label: t('settings.general'), icon: 'i-material-symbols-tune' },
  { name: 'network', label: t('settings.network'), icon: 'i-material-symbols-wifi' },
  { name: 'about', label: t('settings.about'), icon: 'i-material-symbols-info-outline' },
])

const working = ref(false)
const opMessage = ref('')
const opOk = ref(true)

const appVersion = ref('0.0.0')
const checkingUpdate = ref(false)
const updateInfo = ref<{ available: boolean, version?: string, date?: string, note?: string, error?: string } | null>(null)

const currentLocale = computed(() => locale.value)
const availableLocales = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' }
]

const themeColors: { value: ThemeColor, label: string, bg: string }[] = [
  { value: 'green', label: 'Green', bg: 'bg-[#3eaf7c]' },
  { value: 'blue', label: 'Blue', bg: 'bg-[#3b82f6]' },
  { value: 'purple', label: 'Purple', bg: 'bg-[#8b5cf6]' },
  { value: 'orange', label: 'Orange', bg: 'bg-[#f97316]' },
  { value: 'red', label: 'Red', bg: 'bg-[#ef4444]' }
]

const intervalOptions = [
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 }
]

function setCheckMethod(method: string) {
  // @ts-ignore
  settingsStore.checkMethod = method
}

function setLanguage(lang: string) {
  locale.value = lang
}

async function handleFlushDns() {
  if (working.value) return
  working.value = true
  opMessage.value = ''
  try {
    const result = await window.system.flushDnsCache()
    opOk.value = !!result?.ok
    opMessage.value = String(result?.message || '')
  } catch (e: any) {
    opOk.value = false
    opMessage.value = String(e?.message || e || t('settings.dns_flush_failed'))
  } finally {
    working.value = false
  }
}

async function handleReinstallTun() {
  if (working.value) return
  working.value = true
  opMessage.value = ''
  try {
    const result = await window.system.reinstallTunAdapter(settingsStore.tunInterfaceName || 'singbox-tun')
    opOk.value = !!result?.ok
    opMessage.value = String(result?.message || '')
  } catch (e: any) {
    opOk.value = false
    opMessage.value = String(e?.message || e || t('settings.tun_reinstall_failed'))
  } finally {
    working.value = false
  }
}

async function checkUpdate() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  updateInfo.value = null
  try {
    const res = await window.app.checkUpdate()
    if (res.error) {
      updateInfo.value = { available: false, error: res.error }
    } else {
      updateInfo.value = {
        available: res.updateAvailable,
        version: res.version,
        date: res.releaseDate,
        note: res.releaseNotes
      }
    }
  } catch (e: any) {
    updateInfo.value = { available: false, error: e.message }
  } finally {
    checkingUpdate.value = false
  }
}

function openProjectUrl() {
  window.app.openUrl('https://github.com/ZenEcho/LagZero')
}

function openReleasesUrl() {
  window.app.openUrl('https://github.com/ZenEcho/LagZero/releases')
}

onMounted(async () => {
  if (window.app) {
    appVersion.value = await window.app.getVersion()
  }
})
</script>

<style scoped>
/* Animations copied from Dashboard for consistency */
@keyframes pulse-slow {

  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }

  50% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}

.animate-pulse-slow {
  animation: pulse-slow 8s infinite ease-in-out;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out;
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(var(--rgb-border), 0.5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--rgb-border), 0.8);
}

/* Glass overrides for generic inputs/buttons if needed */
.glass-input :deep(.n-input) {
  background-color: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
}

.glass-select :deep(.n-base-selection) {
  background-color: rgba(255, 255, 255, 0.03) !important;
  backdrop-filter: blur(10px);
}

.glass-button,
.glass-button-primary {
  background-color: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.glass-button:hover,
.glass-button-primary:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.glass-button-primary {
  background-color: rgba(var(--rgb-primary), 0.1);
  border-color: rgba(var(--rgb-primary), 0.3);
  color: rgb(var(--rgb-primary));
}

.glass-button-primary:hover {
  background-color: rgba(var(--rgb-primary), 0.2);
  box-shadow: 0 4px 12px rgba(var(--rgb-primary), 0.2);
}
</style>
