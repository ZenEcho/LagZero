<template>
   <div
      class="h-full relative overflow-hidden bg-background text-on-surface flex flex-col transition-colors duration-300">
      <!-- Ambient Background Effects -->
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
         <div
            class="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[120px] animate-pulse-slow">
         </div>
         <div
            class="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/5 rounded-full blur-[100px] animate-pulse-slow"
            style="animation-delay: 2s;"></div>
      </div>

      <!-- Main Content Container -->
      <div v-if="!game" class="relative z-10 flex-1 flex flex-col items-center justify-center p-8 text-center">
         <!-- Empty State (No Game Selected) -->
         <div class="relative mb-8 group">
            <div
               class="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-110 group-hover:scale-125 transition-transform duration-700">
            </div>
            <div
               class="relative z-10 w-32 h-32 md:w-40 md:h-40 bg-surface-panel/50 backdrop-blur-xl border border-border rounded-[2rem] flex items-center justify-center shadow-2xl transition-all duration-300 group-hover:-translate-y-2">
               <div class="i-material-symbols-sports-esports text-6xl md:text-7xl text-primary/80"></div>
            </div>
         </div>
         <h2 class="text-2xl md:text-3xl font-bold text-on-surface mb-3 tracking-tight">
            {{ $t('games.no_game_selected') }}
         </h2>
         <p class="text-on-surface-muted max-w-sm mb-8 text-sm md:text-base leading-relaxed">
            {{ $t('games.select_game_desc') }}
         </p>
         <button @click="$router.push('/games')"
            class="px-8 py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
            <div class="i-material-symbols-library-books text-xl"></div>
            {{ $t('games.go_library') }}
         </button>
      </div>

      <div v-else class="relative z-10 flex-1 flex flex-col h-full min-h-0">
         <!-- Header: Minimal Game Info -->
         <header
            class="flex-none h-16 px-6 flex items-center justify-between border-b border-border/50 bg-surface/80 backdrop-blur-md z-20">
            <div class="flex items-center gap-4">
               <div
                  class="w-10 h-10 rounded-lg bg-surface-panel border border-border overflow-hidden flex items-center justify-center shadow-sm">
                  <img v-if="game.iconUrl" :src="game.iconUrl" class="w-full h-full object-cover" />
                  <div v-else class="i-material-symbols-sports-esports text-xl text-primary/60"></div>
               </div>
               <div>
                  <h1 class="text-lg font-bold leading-tight text-on-surface ">{{ game.name }}</h1>
                  <div class="flex items-center gap-2 text-xs text-on-surface-muted">
                     <span
                        class="bg-surface-overlay px-1.5 py-0.5 rounded border border-border data-[active=true]:text-primary data-[active=true]:border-primary/20 max-w-[400px] inline-block truncate"
                        :data-active="isRunning">
                        {{ categoryLabel }}
                     </span>
                     <span class="w-1 h-1 rounded-full bg-border"></span>
                     <span :class="isRunning ? 'text-success font-medium' : 'text-on-surface-muted'">
                        {{ isRunning ? $t('common.running') : $t('common.stopped') }}
                     </span>
                  </div>
               </div>
            </div>

            <!-- Header Actions -->
            <div class="flex items-center gap-3">
               <div v-if="isRunning"
                  class="flex items-center gap-2 px-3 py-1 bg-success/10 border border-success/20 rounded-full">
                  <div class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></div>
                  <span class="text-[10px] font-black uppercase tracking-widest text-success">Live</span>
               </div>
               <div class="flex flex-row gap-1">
                  <div class="flex items-center p-1 rounded-xl border border-border/60 bg-surface-overlay/60">
                     <button @click="onNetworkModeChange('tun')" :disabled="isActionPending"
                        class="px-3 py-1 text-xs rounded-lg transition font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                        :class="settingsStore.accelNetworkMode === 'tun'
                           ? 'bg-surface text-primary shadow-sm'
                           : 'text-on-surface-muted hover:text-on-surface'">
                        TUN
                     </button>
                     <button @click="onNetworkModeChange('system_proxy')" :disabled="isActionPending"
                        class="px-3 py-1 text-xs rounded-lg transition font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                        :class="settingsStore.accelNetworkMode === 'system_proxy'
                           ? 'bg-surface text-primary shadow-sm'
                           : 'text-on-surface-muted hover:text-on-surface'">
                        {{ $t('dashboard.system_proxy_mode') }}
                     </button>
                  </div>
                  <button @click="showSessionTuningPanel = !showSessionTuningPanel"
                     :disabled="!isTunNetworkMode"
                     class="px-3 py-1 text-[11px] font-bold rounded-lg border border-border/60 bg-surface-overlay/60 text-on-surface-muted hover:text-on-surface transition disabled:opacity-50 disabled:cursor-not-allowed">
                     {{ $t('dashboard.session_tuning') }}
                  </button>
               </div>
            </div>
         </header>

         <div v-if="showSessionTuningPanel"
            class="mx-6 mt-4 p-4 rounded-2xl border border-border/60 bg-surface-panel/60 backdrop-blur-sm">
            <div class="flex items-center justify-between mb-3">
               <div class="text-xs font-black uppercase tracking-widest text-on-surface-muted">
                  {{ $t('settings.game_network_tuning') }}
               </div>
               <button @click="resetCurrentGameSessionTuning()"
                  class="px-2 py-1 text-[11px] rounded-md border border-border/50 text-on-surface-muted hover:text-on-surface transition">
                  {{ $t('settings.reset_session_network_tuning') }}
               </button>
            </div>
            <p class="text-xs text-on-surface-muted mb-3">{{ $t('dashboard.current_game_tuning_hint') }}</p>
            <p v-if="!isTunNetworkMode" class="text-xs text-warning mb-3">{{ $t('dashboard.session_tuning_tun_only') }}</p>
            <div class="flex items-center justify-between mb-3 rounded-lg border border-border/50 px-3 py-2">
               <span class="text-xs text-on-surface-muted">{{ $t('common.enabled') }}</span>
               <n-switch v-model:value="currentGameSessionTuning.enabled" size="small" :disabled="!isTunNetworkMode" />
            </div>
            <div class="flex bg-surface-overlay/50 p-1 rounded-xl border border-border/30 mb-3"
               :class="{ 'opacity-50 pointer-events-none': !currentGameSessionTuning.enabled || !isTunNetworkMode }">
               <button @click="applyProfilePreset('stable')"
                  class="flex-1 py-2 text-xs rounded-lg transition-all font-bold" :class="currentGameSessionTuning.profile === 'stable'
                     ? 'bg-surface shadow-sm text-primary'
                     : 'text-on-surface-muted hover:text-on-surface'">
                  {{ $t('settings.network_profile_stable') }}
               </button>
               <button @click="applyProfilePreset('aggressive')"
                  class="flex-1 py-2 text-xs rounded-lg transition-all font-bold" :class="currentGameSessionTuning.profile === 'aggressive'
                     ? 'bg-surface shadow-sm text-primary'
                     : 'text-on-surface-muted hover:text-on-surface'">
                  {{ $t('settings.network_profile_aggressive') }}
               </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3"
               :class="{ 'opacity-50 pointer-events-none': !currentGameSessionTuning.enabled || !isTunNetworkMode }">
               <n-select v-model:value="currentGameSessionTuning.udpMode" :options="udpModeOptions" size="small" />
               <n-input-number v-model:value="currentGameSessionTuning.tunMtu" :min="1200" :max="1500" size="small" />
               <n-select v-model:value="currentGameSessionTuning.tunStack" :options="tunStackOptions" size="small" />
               <div class="space-y-1">
                  <n-select v-model:value="currentGameSessionTuning.vlessPacketEncodingOverride"
                     :disabled="!currentNodeIsVless" :options="vlessEncodingOptions" size="small" />
                  <p v-if="!currentNodeIsVless" class="text-[11px] text-warning">
                     {{ $t('settings.vless_only_hint') }}
                  </p>
               </div>
               <div class="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
                  <span class="text-xs text-on-surface-muted">{{ $t('settings.strict_route') }}</span>
                  <n-switch v-model:value="currentGameSessionTuning.strictRoute" size="small" />
               </div>
            </div>
         </div>

         <div class="flex-1 flex overflow-hidden">
            <!-- Main Dashboard Area (Left) -->
            <main
               class="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 flex flex-col justify-evenly items-center gap-8 relative">

               <!-- 1. Hero Section: The Status Core -->
               <section class="flex flex-col items-center justify-center">

                  <!-- Live Stats (Level 1: Latency & Loss) -->
                  <div v-if="isRunning" class="mb-10 w-full flex justify-center animate-scale-in">
                     <div class="flex items-center gap-12 md:gap-20">
                        <!-- Latency -->
                        <div class="flex flex-col items-center">
                           <div class="flex items-baseline justify-center gap-2 relative">
                              <span
                                 class="text-7xl md:text-8xl font-black tabular-nums tracking-tighter drop-shadow-sm transition-colors duration-300"
                                 :class="getLatencyTextColor(currentLatency)">
                                 {{ currentLatency > 0 ? currentLatency : '---' }}
                              </span>
                              <span
                                 class="text-xl font-bold text-on-surface-muted uppercase tracking-widest absolute -right-10 bottom-3">ms</span>
                           </div>
                           <span class="text-xs uppercase font-bold text-on-surface-muted tracking-widest mt-2">{{
                              $t('common.latency') || '实时延迟' }}</span>
                        </div>

                        <div class="w-px h-16 md:h-20 bg-border/60"></div>

                        <!-- Packet Loss -->
                        <div class="flex flex-col items-center">
                           <div class="flex items-baseline justify-center gap-2 relative">
                              <span
                                 class="text-7xl md:text-8xl font-black tabular-nums tracking-tighter drop-shadow-sm transition-colors duration-300"
                                 :class="currentLoss > 0 ? 'text-warning' : 'text-on-surface'">
                                 {{ currentLoss }}
                              </span>
                              <span class="text-xl font-bold text-on-surface-muted absolute -right-6 bottom-3">%</span>
                           </div>
                           <span class="text-xs uppercase font-bold text-on-surface-muted tracking-widest mt-2">{{
                              $t('games.packet_loss') }}</span>
                        </div>
                     </div>
                  </div>

                  <div class="relative z-10 flex flex-col items-center">
                     <!-- Main Action Button -->
                     <div class="relative group">
                        <!-- Outer Glow Ring -->
                        <div
                           class="absolute inset-0 rounded-full bg-gradient-to-t from-primary/0 via-primary/30 to-primary/0 md:scale-150 animate-spin-slow opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                           :class="isRunning ? 'via-error/30' : (!isCoreInstalled ? 'via-on-surface-muted/10' : 'via-primary/30')">
                        </div>

                        <!-- Pulse Effect -->
                        <div v-if="!isRunning && isCoreInstalled"
                           class="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-20 duration-[3s]">
                        </div>

                        <button @click="toggleAccelerator"
                           :disabled="isActionPending || (!isRunning && !isCoreInstalled)"
                           class="relative w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center group outline-none transition-all duration-500 ease-out hover:scale-105 active:scale-95 z-10"
                           :class="[
                              isRunning ? 'shadow-[0_0_60px_-10px_rgba(var(--rgb-error),0.3)]' : (!isCoreInstalled ? 'shadow-[0_0_30px_-10px_rgba(0,0,0,0.1)]' : 'shadow-[0_0_60px_-10px_rgba(var(--rgb-primary),0.3)]'),
                              (isActionPending || (!isRunning && !isCoreInstalled)) ? 'opacity-80 cursor-not-allowed pointer-events-none' : ''
                           ]">

                           <!-- Button Background -->
                           <div
                              class="absolute inset-2 rounded-full border-4 backdrop-blur-md transition-all duration-500 overflow-hidden"
                              :class="isRunning
                                 ? 'bg-error/5 border-error/20 group-hover:bg-error/10 group-hover:border-error/40'
                                 : (!isCoreInstalled
                                    ? 'bg-on-surface-muted/5 border-on-surface-muted/20'
                                    : 'bg-primary/5 border-primary/20 group-hover:bg-primary/10 group-hover:border-primary/40')">
                              <!-- Shiny reflection -->
                              <div
                                 class="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-500">
                              </div>
                           </div>

                           <!-- Icon & Label -->
                           <div class="flex flex-col items-center gap-3 relative z-20">
                              <div
                                 class="text-5xl md:text-6xl transition-all duration-300 transform group-hover:scale-110"
                                 :class="isActionPending
                                    ? 'i-carbon-circle-dash animate-spin text-primary'
                                    : (isRunning ? 'i-carbon-stop-filled text-error drop-shadow-[0_2px_10px_rgba(var(--rgb-error),0.4)]' : (!isCoreInstalled ? 'i-carbon-cloud-download text-on-surface-muted' : 'i-carbon-play-filled-alt text-primary drop-shadow-[0_2px_10px_rgba(var(--rgb-primary),0.4)]'))">
                              </div>
                              <span class=" text-xs font-black uppercase tracking-[0.25em] transition-colors"
                                 :class="isRunning ? 'text-error' : (!isCoreInstalled ? 'text-on-surface-muted' : 'text-primary')">
                                 {{ (!isRunning && !isCoreInstalled) ? ($t('singbox_installer.preparing') || '环境准备中') :
                                    actionLabel }}
                              </span>
                           </div>
                        </button>
                     </div>

                     <!-- Status Description & Duration (Level 2) -->
                     <div class="mt-8 flex flex-col items-center gap-3">
                        <p class="text-sm font-medium max-w-xs text-center leading-relaxed transition-colors"
                           :class="isRunning ? 'text-success' : 'text-on-surface-muted'">
                           {{ isRunning ? $t('dashboard.active_protection') : (!isCoreInstalled ?
                              $t('singbox_installer.preparing') : $t('dashboard.ready_to_boost')) }}
                        </p>

                        <!-- Duration Badge -->
                        <div v-if="isRunning"
                           class="flex items-center gap-2 px-3 py-1 bg-surface-overlay/50 border border-border/50 rounded-full text-[11px] font-medium text-on-surface-muted animate-fade-in-up mt-1 shadow-sm">
                           <div class="i-carbon-time text-sm"></div>
                           <span>{{ $t('games.duration') }}: <span
                                 class="font-mono font-bold text-on-surface tracking-wide ml-1">{{ durationFormatted
                                 }}</span></span>
                        </div>
                     </div>
                  </div>
               </section>

               <!-- 2. Secondary Info: Charts -->
               <section v-if="isRunning"
                  class=" w-full max-w-4xl mx-auto opacity-90 hover:opacity-100 transition-opacity">
                  <div
                     class="w-full h-full bg-surface-panel/40 border border-border rounded-2xl p-4 relative overflow-hidden shadow-sm backdrop-blur-sm">
                     <div class="z-10 text-[10px] font-black uppercase text-on-surface-muted tracking-widest">
                        {{ $t('common.network_stability') }}</div>
                     <LatencyChart :node-key="selectedNode || undefined" />
                  </div>
               </section>

               <!-- Expert Tip (Bottom) -->
               <div v-if="!isRunning"
                  class="max-w-lg w-full p-5 rounded-2xl bg-surface-panel/40 border border-border flex items-start gap-4 shadow-sm backdrop-blur-sm">
                  <div
                     class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                     <div class="i-material-symbols-lightbulb text-lg"></div>
                  </div>
                  <div>
                     <h4 class="text-xs font-bold text-on-surface mb-1 ">{{ $t('dashboard.did_you_know') }}</h4>
                     <p class="text-xs text-on-surface-muted leading-relaxed">{{ currentDashboardHint }}</p>
                  </div>
               </div>
            </main>

            <!-- Sidebar: Configuration & Node Selector (Right) -->
            <aside
               class="w-80 lg:w-96 flex-none bg-surface-panel/60 border-l border-border/50 backdrop-blur-xl flex flex-col z-10 shadow-[-5px_0_30px_-5px_rgba(0,0,0,0.05)]">

               <!-- 1. Node Selector (Takes most space) -->
               <div class="flex-1 overflow-hidden flex flex-col p-5 gap-4">
                  <div class="flex items-center justify-between">
                     <span class="text-sm font-bold text-on-surface ">{{ $t('nodes.select_node') }}</span>
                     <button @click="$router.push('/nodes')"
                        class="text-xs font-medium text-primary hover:text-primary-hover hover:underline">{{
                           $t('common.more') }}</button>
                  </div>
                  <!-- The Node Selector Component -->
                  <div class="flex-1 flex flex-col min-h-0">
                     <NodeSelector :model-value="selectedNode" @update:modelValue="onNodeChange"
                        :nodes="nodeStore.nodes" compact class="flex-1" />
                  </div>
               </div>

               <!-- 2. Proxy Mode (Bottom of Sidebar, read-only) -->
               <div class="p-5 border-t border-border/50 bg-surface/30">
                  <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-muted mb-3 block">
                     {{ $t('games.mode') }}
                  </label>
                  <div
                     class="rounded-xl border  border-border bg-surface-overlay px-3 py-2 text-xs font-bold flex items-center gap-2">
                     <div
                        :class="activeProxyMode === 'process' ? 'i-carbon-application-web' : 'i-carbon-network-overlay'">
                     </div>
                     <span>
                        {{ activeProxyMode === 'process' ? $t('games.mode_process') : $t('games.mode_routing') }}
                     </span>
                  </div>
                  <p class="text-[10px] text-on-surface-muted/60 mt-3 text-center">
                     {{ activeProxyMode === 'process' ? $t('games.mode_process_desc') : $t('games.mode_routing_desc') }}
                  </p>
               </div>
            </aside>
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, onActivated, watch } from 'vue'
import { useGameStore } from '@/stores/games'
import { useCategoryStore } from '@/stores/categories'
import { useNodeStore } from '@/stores/nodes'
import { useSettingsStore } from '@/stores/settings'
import LatencyChart from '@/components/dashboard/LatencyChart.vue'
import NodeSelector from '@/components/dashboard/NodeSelector.vue'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useMessage, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import i18n from '@/i18n'
import { electronApi, singboxApi } from '@/api'

// Stores
const gameStore = useGameStore()
const categoryStore = useCategoryStore()
const nodeStore = useNodeStore()
const settingsStore = useSettingsStore()
const { checkInterval } = storeToRefs(settingsStore)
const message = useMessage()
const { t } = useI18n()

// State
const game = computed(() => gameStore.currentGame)
const isRunning = computed(() => game.value?.status === 'accelerating')
const isCoreInstalled = ref(false)
const isSwitchingNode = ref(false)
const isModeSwitching = ref(false)
const isActionPending = computed(() => isSwitchingNode.value || isModeSwitching.value || gameStore.operationState !== 'idle')
const actionLabel = computed(() => {
   if (gameStore.operationState === 'starting') return '启动中'
   if (gameStore.operationState === 'stopping') return '暂停中'
   return isRunning.value ? String(i18n.global.t('common.stop')) : String(i18n.global.t('common.start'))
})
const currentLatency = ref(0)
const currentLoss = ref(0)
const startTime = ref(0)
const durationSeconds = ref(0)
const lastConnection = ref('')
const pendingNodeRestart = ref(false)
const totalSamples = ref(0)
const lostSamples = ref(0)
const showSessionTuningPanel = ref(false)
const highLossHintShown = ref(false)
const applyingSessionTuning = ref(false)

const udpModeOptions = computed(() => ([
   { label: String(t('settings.udp_mode_auto')), value: 'auto' },
   { label: String(t('settings.udp_mode_prefer_udp')), value: 'prefer_udp' },
   { label: String(t('settings.udp_mode_prefer_tcp')), value: 'prefer_tcp' }
]))
const tunStackOptions = [
   { label: 'system', value: 'system' },
   { label: 'mixed', value: 'mixed' }
]
const vlessEncodingOptions = computed(() => ([
   { label: String(t('settings.vless_packet_encoding_off')), value: 'off' },
   { label: 'xudp', value: 'xudp' }
]))
const isTunNetworkMode = computed(() => settingsStore.accelNetworkMode === 'tun')

function applyProfilePreset(profile: 'stable' | 'aggressive') {
   if (!isTunNetworkMode.value) return
   const gameId = String(game.value?.id || '').trim()
   if (!gameId) return
   gameStore.applyGameSessionNetworkProfilePreset(gameId, profile, {
      isCurrentNodeVless: currentNodeIsVless.value
   })
}

// Computed Helpers
const categoryLabel = computed(() => {
   if (!game.value) return ''
   const categoryIds = Array.isArray(game.value.categories) && game.value.categories.length > 0
      ? game.value.categories
      : (game.value.category ? [game.value.category] : [])
   if (categoryIds.length === 0) return String(i18n.global.t('common.uncategorized'))
   return categoryIds
      .map((id) => categoryStore.categories.find((c: any) => c.id === id)?.name || '')
      .filter(Boolean)
      .join(' / ') || String(i18n.global.t('common.uncategorized'))
})

const selectedNode = computed(() => game.value?.nodeId || null)
const currentGameSessionTuning = computed(() => {
   const gameId = String(game.value?.id || '').trim()
   if (!gameId) return settingsStore.sessionNetworkTuning
   return gameStore.ensureGameSessionNetworkTuning(gameId)
})
const currentNodeIsVless = computed(() => {
   const selectedNodeId = String(selectedNode.value || '').trim()
   if (!selectedNodeId) return false
   const node = nodeStore.nodes.find(n => String(n.id || n.tag) === selectedNodeId)
   return String(node?.type || '').toLowerCase() === 'vless'
})

function resetCurrentGameSessionTuning() {
   if (!isTunNetworkMode.value) return
   const gameId = String(game.value?.id || '').trim()
   if (!gameId) return
   gameStore.resetGameSessionNetworkTuning(gameId)
}

const activeProxyMode = computed<'process' | 'routing'>(() => game.value?.proxyMode === 'routing' ? 'routing' : 'process')
const dashboardHints = computed(() => ([
   String(i18n.global.t('dashboard.hint_1')),
   String(i18n.global.t('dashboard.hint_2')),
   String(i18n.global.t('dashboard.hint_3')),
   String(i18n.global.t('dashboard.hint_4'))
]))
const currentHintIndex = ref(0)
const currentDashboardHint = computed(() => dashboardHints.value[currentHintIndex.value] || '')

const durationFormatted = computed(() => {
   const s = durationSeconds.value
   const h = Math.floor(s / 3600)
   const m = Math.floor((s % 3600) / 60)
   const sec = s % 60
   return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
})

async function restartForNodeSwitch() {
   if (!game.value || !isRunning.value) return

   if (isSwitchingNode.value) {
      pendingNodeRestart.value = true
      return
   }

   isSwitchingNode.value = true
   try {
      if (!game.value?.id) return
      do {
         pendingNodeRestart.value = false
         await gameStore.stopGame(game.value.id)
         await gameStore.startGame(game.value.id)
         startTime.value = Date.now()
      } while (pendingNodeRestart.value && !!game.value && isRunning.value)
   } catch (e: any) {
      message.error(String(e?.message || e || i18n.global.t('dashboard.node_switch_failed')))
   } finally {
      isSwitchingNode.value = false
   }
}

async function onNodeChange(val: string) {
   if (!game.value || !val) return
   const oldNodeId = game.value.nodeId
   if (oldNodeId === val) return

   await gameStore.updateGame({ ...game.value, nodeId: val })
   await restartForNodeSwitch()
   if (isRunning.value) {
      void sampleLatencyAndLoss(true)
   }
}

function modeLabelOf(mode: 'tun' | 'system_proxy') {
   return mode === 'system_proxy'
      ? String(i18n.global.t('dashboard.system_proxy_mode'))
      : 'TUN'
}

async function onNetworkModeChange(nextMode: 'tun' | 'system_proxy') {
   if (!game.value) return
   if (isActionPending.value) return
   const prevMode = settingsStore.accelNetworkMode
   if (prevMode === nextMode) return

   settingsStore.accelNetworkMode = nextMode
   if (!isRunning.value || !game.value.id) return

   isModeSwitching.value = true
   try {
      await gameStore.stopGame(game.value.id)
      await gameStore.startGame(game.value.id)
      message.success(i18n.global.t('dashboard.mode_switch_success', { mode: modeLabelOf(nextMode) }))
   } catch (e: any) {
      settingsStore.accelNetworkMode = prevMode
      try {
         await gameStore.stopGame(game.value.id)
         await gameStore.startGame(game.value.id)
      } catch (restoreError) {
         console.error('Failed to restore previous acceleration mode after rollback', restoreError)
      }
      message.error(String(e?.message || e || i18n.global.t('dashboard.mode_switch_failed')))
   } finally {
      isModeSwitching.value = false
   }
}

function refreshDuration() {
   if (!isRunning.value || startTime.value <= 0) {
      durationSeconds.value = 0
      return
   }
   durationSeconds.value = Math.floor((Date.now() - startTime.value) / 1000)
}

function refreshSessionLossRate() {
   if (totalSamples.value <= 0) {
      currentLoss.value = 0
      return
   }
   currentLoss.value = Math.round((lostSamples.value / totalSamples.value) * 100)
   if (
      isRunning.value
      && currentGameSessionTuning.value.highLossHintOnly
      && !highLossHintShown.value
      && totalSamples.value >= 20
      && currentLoss.value >= 15
   ) {
      highLossHintShown.value = true
      message.warning(String(i18n.global.t('dashboard.high_loss_hint')))
   }
}

async function syncSessionStateFromStore() {
   if (!game.value?.id) return
   const sessionStart = gameStore.getAccelerationStartedAt(game.value.id)
   if (sessionStart > 0) {
      startTime.value = sessionStart
   } else if (isRunning.value) {
      startTime.value = Date.now()
   }
   const stats = await nodeStore.getGameLatencyStatsForSession(game.value.id)
   totalSamples.value = stats.total
   lostSamples.value = stats.lost
   refreshSessionLossRate()
   refreshDuration()
}

async function sampleLatencyAndLoss(recordLatency: boolean) {
   if (!isRunning.value || !game.value?.id || !game.value.nodeId) return

   const node = nodeStore.nodes.find(n => (n.id === game.value!.nodeId) || (n.tag === game.value!.nodeId))
   if (!node) return

   const stats = await nodeStore.checkNode(node, undefined, {
      recordLatency,
      gameId: game.value.id,
      accelerationSeconds: durationSeconds.value,
      sessionLossRate: currentLoss.value
   })
   if (!stats) return

   currentLatency.value = stats.latency
   gameStore.updateLatency(game.value.id, currentLatency.value)

   if (recordLatency) {
      totalSamples.value += 1
      if (stats.loss > 0 || stats.latency <= 0) {
         lostSamples.value += 1
      }
   }
   refreshSessionLossRate()
}

const { pause: pauseSampling, resume: resumeSampling } = useIntervalFn(() => {
   void sampleLatencyAndLoss(true)
}, checkInterval, { immediate: false })

const { pause: pauseDuration, resume: resumeDuration } = useIntervalFn(() => {
   refreshDuration()
}, 1000, { immediate: false })

const { pause: pauseHintRotation, resume: resumeHintRotation } = useIntervalFn(() => {
   if (dashboardHints.value.length <= 1) return
   currentHintIndex.value = (currentHintIndex.value + 1) % dashboardHints.value.length
}, 5000, { immediate: false })

async function toggleAccelerator() {
   if (!game.value) return
   if (isActionPending.value) return

   if (isRunning.value) {
      try {
         if (game.value.id) await gameStore.stopGame(game.value.id)
      } finally {
         startTime.value = 0
         totalSamples.value = 0
         lostSamples.value = 0
         lastConnection.value = ''
         refreshSessionLossRate()
         refreshDuration()
      }
   } else {
      if (!selectedNode.value) {
         message.warning(i18n.global.t('dashboard.please_select_node'))
         return
      }
      try {
         if (game.value.id) await gameStore.startGame(game.value.id)
         await syncSessionStateFromStore()
         await sampleLatencyAndLoss(true)
      } catch (e: any) {
         const rawMsg = String(e?.message || e || '')
         if (rawMsg.startsWith('Another game is already accelerating:')) {
            const gameName = rawMsg.replace('Another game is already accelerating:', '').trim()
            message.warning(gameName ? `已有游戏正在加速：${gameName}，请先停止后再切换。` : '已有游戏正在加速，请先停止后再切换。')
         } else {
            message.error(rawMsg || i18n.global.t('dashboard.start_failed'))
         }
      }
   }
}

function getLatencyTextColor(ms: number) {
   if (ms <= 0) return 'text-on-surface-muted'
   if (ms < 100) return 'text-success'
   if (ms < 200) return 'text-warning'
   return 'text-error'
}

// Event Listeners
function onSingboxEvent(name: string, data: any) {
   if (name === 'singbox-log' && data?.message) {
      const msg = data.message as string
      if (msg.includes('connection to')) {
         const parts = msg.split('connection to ')
         if (parts.length > 1) {
            const target = parts[1]?.split(' ')[0]?.trim()
            if (target) lastConnection.value = target
         }
      }
   } else if (name === 'singbox-error') {
      message.error(String(data || i18n.global.t('dashboard.singbox_error')))
   } else if (name === 'singbox-status' && data === 'stopped') {
      gameStore.resetAllAccelerationStatus()
      startTime.value = 0
      lastConnection.value = ''
   }
}

function onInstallerStatusChange(d: any) {
   if (d && (d.phase === 'ready' || d.phase === 'completed')) {
      isCoreInstalled.value = true
   } else if (d && (d.phase === 'missing' || d.phase === 'resolving' || d.phase === 'downloading' || d.phase === 'extracting' || d.phase === 'failed')) {
      isCoreInstalled.value = false
   }
}

onMounted(() => {
   nodeStore.loadNodes()
   if (isRunning.value) {
      void syncSessionStateFromStore().then(() => sampleLatencyAndLoss(true))
      resumeSampling()
      resumeDuration()
   }
   try {
      electronApi.on('singbox-log', (d: any) => onSingboxEvent('singbox-log', d))
      electronApi.on('singbox-error', (d: any) => onSingboxEvent('singbox-error', d))
      electronApi.on('singbox-status', (d: any) => onSingboxEvent('singbox-status', d))
      electronApi.on('singbox-installer-status', onInstallerStatusChange)
      singboxApi.getInstallInfo().then((info) => {
         isCoreInstalled.value = info.exists
      }).catch(() => {
         isCoreInstalled.value = false
      })
   } catch (e) {
      console.warn('Electron API events not available', e)
   }
})

onActivated(() => {
   if (isRunning.value) {
      void syncSessionStateFromStore().then(() => sampleLatencyAndLoss(true))
   }
})

watch(isRunning, (running) => {
   if (running) {
      highLossHintShown.value = false
      pauseHintRotation()
      void syncSessionStateFromStore().then(() => sampleLatencyAndLoss(true))
      resumeSampling()
      resumeDuration()
   } else {
      currentHintIndex.value = 0
      resumeHintRotation()
      pauseSampling()
      pauseDuration()
      startTime.value = 0
      durationSeconds.value = 0
      currentLatency.value = 0
      totalSamples.value = 0
      lostSamples.value = 0
      refreshSessionLossRate()
   }
}, { immediate: true })

watch(
   () => settingsStore.accelNetworkMode,
   (mode) => {
      if (mode !== 'tun') {
         showSessionTuningPanel.value = false
      }
   }
)

onUnmounted(() => {
   pauseHintRotation()
   pauseSampling()
   pauseDuration()
   try {
      // Logic for cleanup if necessary
      // electronApi.off is defined as function in types, so no need to check existence if we trust types.
      // However, if we want to be safe at runtime:
      if (typeof electronApi.off === 'function') {
         // ...
      }
   } catch (e) { }
})

watch(
   () => JSON.stringify(currentGameSessionTuning.value),
   async (next, prev) => {
      if (next === prev) return
      if (applyingSessionTuning.value) return
      if (!isTunNetworkMode.value) return
      if (!isRunning.value) return
      if (gameStore.operationState !== 'idle') return

      applyingSessionTuning.value = true
      try {
         message.info(String(i18n.global.t('settings.session_network_tuning_restarting')))
         const restarted = await gameStore.applySessionNetworkTuningChange()
         if (restarted) {
            message.success(String(i18n.global.t('settings.session_network_tuning_applied')))
         }
      } catch (e: any) {
         message.error(String(e?.message || e || i18n.global.t('settings.session_network_tuning_apply_failed')))
      } finally {
         applyingSessionTuning.value = false
      }
   }
)
</script>


<style scoped>
/* Animations */
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

@keyframes spin-slow {
   from {
      transform: rotate(0deg);
   }

   to {
      transform: rotate(360deg);
   }
}

.animate-spin-slow {
   animation: spin-slow 12s infinite linear;
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

.custom-scrollbar::-webkit-scrollbar {
   width: 4px;
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
</style>
