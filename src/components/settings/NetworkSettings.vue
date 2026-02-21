<template>
  <div class="space-y-8 max-w-3xl animate-fade-in-up">
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
            <n-select v-model:value="settingsStore.checkInterval" :options="intervalOptions" class="glass-select" />
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
          <button @click="settingsStore.dnsMode = 'secure'" :disabled="applyingDns"
            class="px-3 py-1 text-xs rounded-md transition font-medium" :class="settingsStore.dnsMode === 'secure'
              ? 'bg-surface shadow-sm text-primary'
              : 'text-on-surface-muted hover:text-on-surface'">
            {{ $t('settings.dns_mode_secure') }}
          </button>
          <button @click="settingsStore.dnsMode = 'system'" :disabled="applyingDns"
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
        <p v-if="settingsStore.dnsMode === 'system'" class="mb-3 text-xs text-warning">
          {{ $t('settings.dns_mode_system_hint') }}
        </p>
        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
              $t('settings.dns_primary') }}</label>
            <n-input v-model:value="settingsStore.dnsPrimary" placeholder="https://cloudflare-dns.com/dns-query"
              class="glass-input" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
              $t('settings.dns_secondary') }}</label>
            <n-input v-model:value="settingsStore.dnsSecondary" placeholder="https://dns.alidns.com/resolve"
              class="glass-input" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
              $t('settings.dns_bootstrap') }}</label>
            <n-input v-model:value="settingsStore.dnsBootstrap" placeholder="223.5.5.5" class="glass-input" />
            <p class="text-xs text-on-surface-muted">
              {{ $t('settings.dns_bootstrap_hint') }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="w-full h-px bg-border/30"></div>

    <!-- Local Proxy -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold flex items-center gap-2">
          <div class="i-material-symbols-lan text-primary"></div>
          {{ $t('settings.local_proxy') }}
        </h2>
        <n-switch v-model:value="settingsStore.localProxyEnabled">
          <template #checked>{{ $t('common.enabled') }}</template>
          <template #unchecked>{{ $t('common.disabled') }}</template>
        </n-switch>
      </div>

      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm transition-opacity duration-300"
        :class="{ 'opacity-50 pointer-events-none': !settingsStore.localProxyEnabled }">
        <div class="space-y-2">
          <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{
            $t('settings.local_proxy_port') }} (HTTP)</label>
          <n-input-number v-model:value="settingsStore.localProxyPort" :min="1024" :max="65535" class="glass-select"
            button-placement="both" />
          <p class="text-xs text-on-surface-muted mt-1">{{ $t('settings.local_proxy_info', {
            socks:
              settingsStore.localProxyPort + 1
          }) }}</p>
        </div>
        <div class="space-y-2 pt-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
              {{ $t('settings.local_proxy_node_strategy') }}
            </label>
            <n-switch v-model:value="settingsStore.localProxyNodeRecursiveTest" size="small" />
          </div>
          <p class="text-xs text-on-surface-muted">
            {{ $t('settings.local_proxy_node_recursive') }}
          </p>
        </div>
        <div class="space-y-2" :class="{ 'opacity-50 pointer-events-none': settingsStore.localProxyNodeRecursiveTest }">
          <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
            {{ $t('settings.local_proxy_fixed_node_index') }}
          </label>
          <n-input-number v-model:value="settingsStore.localProxyFixedNodeIndex" :min="1" :max="9999"
            class="glass-select" button-placement="both" />
        </div>
        <div class="space-y-2 pt-2">
          <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
            {{ $t('common.status') }}
          </label>
          <div class="px-3 py-2 rounded-lg border text-xs" :class="localProxyStore.statusLevel === 'error'
            ? 'border-error/40 text-error bg-error/10'
            : localProxyStore.statusLevel === 'warning'
              ? 'border-yellow-500/40 text-yellow-500 bg-yellow-500/10'
              : localProxyStore.statusLevel === 'success'
                ? 'border-success/40 text-success bg-success/10'
                : 'border-border/50 text-on-surface-muted bg-surface-overlay/40'">
            {{ localProxyStore.statusText || (localProxyStore.starting ? $t('common.checking') : '-') }}
          </div>
          <p v-if="localProxyStore.testingTotal > 0" class="text-xs text-on-surface-muted">
            {{ $t('common.checking') }} {{ localProxyStore.testingCurrent }}/{{ localProxyStore.testingTotal }}
            <span v-if="localProxyStore.testingNodeLabel">- {{ localProxyStore.testingNodeLabel }}</span>
          </p>
        </div>
      </div>
    </section>

    <div class="w-full h-px bg-border/30"></div>

    <!-- System Proxy -->
    <section>
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
        <div class="i-material-symbols-public text-primary"></div>
        {{ $t('settings.system_proxy') }}
      </h2>
      <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm space-y-4">
        <div class="space-y-2">
          <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
            {{ $t('settings.system_proxy_port') }} (HTTP)
          </label>
          <n-input-number v-model:value="settingsStore.systemProxyPort" :min="1024" :max="65535" class="glass-select"
            button-placement="both" />
          <p class="text-xs text-on-surface-muted mt-1">
            {{ $t('settings.system_proxy_info') }}
          </p>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
            {{ $t('settings.proxy_bypass') }}
          </label>
          <n-input v-model:value="settingsStore.systemProxyBypass" type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }" :placeholder="$t('settings.proxy_bypass_placeholder')"
            class="glass-input" />
          <p class="text-xs text-on-surface-muted mt-1">
            {{ $t('settings.proxy_bypass_info') }}
          </p>
        </div>
      </div>
    </section>

    <div class="w-full h-px bg-border/30"></div>

    <!-- Game Network Tuning -->
    <section>
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
        <div class="i-material-symbols-joystick text-primary"></div>
        {{ $t('settings.game_network_tuning') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm space-y-4 transition-opacity duration-300"
        :class="{ 'opacity-60': !isTunNetworkMode }">
        <p class="text-xs text-on-surface-muted">
          {{ $t('settings.game_network_tuning_hint') }}
        </p>
        <p v-if="!isTunNetworkMode" class="text-xs text-warning">
          {{ $t('settings.game_network_tuning_tun_only') }}
        </p>
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
            {{ $t('common.enabled') }}
          </label>
          <n-switch v-model:value="settingsStore.sessionNetworkTuning.enabled" :disabled="!isTunNetworkMode" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4"
          :class="{ 'opacity-50 pointer-events-none': !settingsStore.sessionNetworkTuning.enabled || !isTunNetworkMode }">
          <div class="space-y-2 md:col-span-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
              {{ $t('settings.network_profile') }}
            </label>
            <div class="flex bg-surface-overlay/50 p-1 rounded-xl border border-border/30">
              <button @click="applyProfilePreset('stable')"
                class="flex-1 py-2 text-sm rounded-lg transition-all font-bold" :class="settingsStore.sessionNetworkTuning.profile === 'stable'
                  ? 'bg-surface shadow-sm text-primary'
                  : 'text-on-surface-muted hover:text-on-surface'">
                {{ $t('settings.network_profile_stable') }}
              </button>
              <button @click="applyProfilePreset('aggressive')"
                class="flex-1 py-2 text-sm rounded-lg transition-all font-bold" :class="settingsStore.sessionNetworkTuning.profile === 'aggressive'
                  ? 'bg-surface shadow-sm text-primary'
                  : 'text-on-surface-muted hover:text-on-surface'">
                {{ $t('settings.network_profile_aggressive') }}
              </button>
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
              {{ $t('settings.udp_mode') }}
            </label>
            <n-select v-model:value="settingsStore.sessionNetworkTuning.udpMode" :options="udpModeOptions"
              class="glass-select" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
              MTU
            </label>
            <n-input-number v-model:value="settingsStore.sessionNetworkTuning.tunMtu" :min="1200" :max="1500"
              class="glass-select" button-placement="both" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
              {{ $t('settings.tun_stack') }}
            </label>
            <n-select v-model:value="settingsStore.sessionNetworkTuning.tunStack" :options="tunStackOptions"
              class="glass-select" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
              {{ $t('settings.vless_packet_encoding') }} ({{ $t('settings.vless_only') }})
            </label>
            <n-select v-model:value="settingsStore.sessionNetworkTuning.vlessPacketEncodingOverride"
              :options="vlessEncodingOptions" class="glass-select" />
            <p class="text-xs text-on-surface-muted">{{ $t('settings.vless_only_hint') }}</p>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
                {{ $t('settings.strict_route') }}
              </label>
              <n-switch v-model:value="settingsStore.sessionNetworkTuning.strictRoute" />
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-on-surface-muted">
            {{ $t('settings.high_loss_hint_only') }}
          </p>
          <n-switch v-model:value="settingsStore.sessionNetworkTuning.highLossHintOnly" :disabled="!isTunNetworkMode" />
        </div>
        <div class="pt-1">
          <n-button secondary @click="settingsStore.resetSessionNetworkTuning()" class="glass-button"
            :disabled="!isTunNetworkMode">
            {{ $t('settings.reset_session_network_tuning') }}
          </n-button>
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
          <n-input v-model:value="settingsStore.tunInterfaceName" placeholder="LagZero" class="glass-input" />
        </div>

        <div class="flex flex-wrap gap-4 pt-2">
          <n-button secondary type="warning" @click="handleReinstallTun" :loading="working" :disabled="working"
            class="glass-button">
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

        <div v-if="opMessage" class="px-4 py-3 rounded-xl text-sm flex items-center gap-3 border animate-scale-in"
          :class="opOk ? 'bg-success/10 text-success border-success/20' : 'bg-error/10 text-error border-error/20'">
          <div :class="opOk ? 'i-material-symbols-check-circle text-lg' : 'i-material-symbols-error text-lg'">
          </div>
          {{ opMessage }}
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { useLocalProxyStore } from '@/stores/local-proxy'
import { useGameStore } from '@/stores/games'
import { NSelect, NInput, NButton, NSwitch, NInputNumber } from 'naive-ui'
import { systemApi } from '@/api'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const localProxyStore = useLocalProxyStore()
const gameStore = useGameStore()

const working = ref(false)
const applyingDns = ref(false)
const applyingSessionTuning = ref(false)
const opMessage = ref('')
const opOk = ref(true)

const intervalOptions = [
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 }
]
const udpModeOptions = computed(() => ([
  { label: t('settings.udp_mode_auto'), value: 'auto' },
  { label: t('settings.udp_mode_prefer_udp'), value: 'prefer_udp' },
  { label: t('settings.udp_mode_prefer_tcp'), value: 'prefer_tcp' }
]))
const tunStackOptions = [
  { label: 'system', value: 'system' },
  { label: 'mixed', value: 'mixed' }
]
const vlessEncodingOptions = computed(() => ([
  { label: t('settings.vless_packet_encoding_off'), value: 'off' },
  { label: 'xudp', value: 'xudp' }
]))
const isTunNetworkMode = computed(() => settingsStore.accelNetworkMode === 'tun')

function setCheckMethod(method: string) {
  // @ts-ignore
  settingsStore.checkMethod = method
}

function applyProfilePreset(profile: 'stable' | 'aggressive') {
  settingsStore.applySessionNetworkProfilePreset(profile)
}

async function handleFlushDns() {
  if (working.value) return
  working.value = true
  opMessage.value = ''
  try {
    const result = await systemApi.flushDnsCache()
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
    const result = await systemApi.reinstallTunAdapter(settingsStore.tunInterfaceName || 'LagZero')
    opOk.value = !!result?.ok
    opMessage.value = String(result?.message || '')
  } catch (e: any) {
    opOk.value = false
    opMessage.value = String(e?.message || e || t('settings.tun_reinstall_failed'))
  } finally {
    working.value = false
  }
}

watch(
  () => [
    settingsStore.localProxyEnabled,
    settingsStore.localProxyPort,
    settingsStore.localProxyNodeRecursiveTest,
    settingsStore.localProxyFixedNodeIndex
  ],
  () => {
    void localProxyStore.applySettingsChange()
  }
)

watch(
  () => settingsStore.dnsMode,
  async (mode, prev) => {
    if (mode === prev) return
    if (applyingDns.value) return
    const active = gameStore.getAcceleratingGame()
    if (!active?.id) return
    if (gameStore.operationState !== 'idle') return

    applyingDns.value = true
    try {
      await gameStore.stopGame(active.id)
      await gameStore.startGame(active.id)
    } catch (e: any) {
      opOk.value = false
      opMessage.value = String(e?.message || e || t('dashboard.start_failed'))
    } finally {
      applyingDns.value = false
    }
  }
)

watch(
  () => JSON.stringify(settingsStore.sessionNetworkTuning),
  async (_next, prev) => {
    if (_next === prev) return
    if (applyingSessionTuning.value) return
    if (!isTunNetworkMode.value) return
    const active = gameStore.getAcceleratingGame()
    if (!active?.id) return
    if (!gameStore.isUsingGlobalSessionNetworkTuning(active.id)) return
    if (gameStore.operationState !== 'idle') return

    applyingSessionTuning.value = true
    try {
      opOk.value = true
      opMessage.value = t('settings.session_network_tuning_restarting')
      const restarted = await gameStore.applySessionNetworkTuningChange()
      if (restarted) {
        opMessage.value = t('settings.session_network_tuning_applied')
      }
    } catch (e: any) {
      opOk.value = false
      opMessage.value = String(e?.message || e || t('settings.session_network_tuning_apply_failed'))
    } finally {
      applyingSessionTuning.value = false
    }
  }
)
</script>
