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
                  <h1 class="text-lg font-bold leading-tight text-on-surface">{{ game.name }}</h1>
                  <div class="flex items-center gap-2 text-xs text-on-surface-muted">
                     <span
                        class="bg-surface-overlay px-1.5 py-0.5 rounded border border-border data-[active=true]:text-primary data-[active=true]:border-primary/20"
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
            </div>
         </header>

         <div class="flex-1 flex overflow-hidden">
            <!-- Main Dashboard Area (Left) -->
            <main class="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 flex flex-col gap-8 relative">

               <!-- 1. Hero Section: The Status Core -->
               <section class="flex flex-col items-center justify-center min-h-[500px] ">
                  <div v-if="isRunning" class=" w-full max-w-2xl flex justify-center">
                     <div
                        class="flex items-center gap-8 md:gap-12 px-8 py-4 bg-surface-panel/40 backdrop-blur-lg border border-border/50 rounded-2xl shadow-sm">
                        <div class="flex flex-col items-center">
                           <span class="text-[10px] uppercase font-bold text-on-surface-muted tracking-widest mb-1">{{
                              $t('games.packet_loss') }}</span>
                           <span class="text-2xl font-mono font-bold text-on-surface tabular-nums">{{ currentLoss
                           }}%</span>
                        </div>
                        <div class="w-px h-8 bg-border"></div>
                        <div class="flex flex-col items-center">
                           <span class="text-[10px] uppercase font-bold text-on-surface-muted tracking-widest mb-1">{{
                              $t('games.duration') }}</span>
                           <span class="text-2xl font-mono font-bold text-on-surface tabular-nums">{{ durationFormatted
                           }}</span>
                        </div>
                     </div>
                  </div>


                  <div class="relative z-10 flex flex-col items-center">
                     <!-- Latency Big Display -->
                     <div v-if="isRunning" class="mb-12 text-center animate-scale-in">
                        <div class="flex items-baseline justify-center gap-3 relative">
                           <span
                              class="text-8xl md:text-9xl font-black tabular-nums tracking-tighter drop-shadow-sm transition-colors duration-300"
                              :class="getLatencyTextColor(currentLatency)">
                              {{ currentLatency > 0 ? currentLatency : '---' }}
                           </span>
                           <span
                              class="text-xl font-bold text-on-surface-muted uppercase tracking-widest absolute -right-10 bottom-5">ms</span>
                        </div>
                     </div>

                     <!-- Main Action Button -->
                     <div class="relative group">
                        <!-- Outer Glow Ring -->
                        <div
                           class="absolute inset-0 rounded-full bg-gradient-to-t from-primary/0 via-primary/30 to-primary/0 md:scale-150 animate-spin-slow opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                           :class="isRunning ? 'via-error/30' : 'via-primary/30'">
                        </div>

                        <!-- Pulse Effect -->
                        <div v-if="!isRunning"
                           class="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-20 duration-[3s]">
                        </div>

                        <button @click="toggleAccelerator" :disabled="isActionPending"
                           class="relative w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center group outline-none transition-all duration-500 ease-out hover:scale-105 active:scale-95 z-10"
                           :class="[
                              isRunning ? 'shadow-[0_0_60px_-10px_rgba(var(--rgb-error),0.3)]' : 'shadow-[0_0_60px_-10px_rgba(var(--rgb-primary),0.3)]',
                              isActionPending ? 'opacity-80 cursor-not-allowed pointer-events-none' : ''
                           ]">

                           <!-- Button Background -->
                           <div
                              class="absolute inset-2 rounded-full border-4 backdrop-blur-md transition-all duration-500 overflow-hidden"
                              :class="isRunning
                                 ? 'bg-error/5 border-error/20 group-hover:bg-error/10 group-hover:border-error/40'
                                 : 'bg-primary/5 border-primary/20 group-hover:bg-primary/10 group-hover:border-primary/40'">
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
                                    : (isRunning ? 'i-carbon-stop-filled text-error drop-shadow-[0_2px_10px_rgba(var(--rgb-error),0.4)]' : 'i-carbon-play-filled-alt text-primary drop-shadow-[0_2px_10px_rgba(var(--rgb-primary),0.4)]')">
                              </div>
                              <span class="text-xs font-black uppercase tracking-[0.25em] transition-colors"
                                 :class="isRunning ? 'text-error' : 'text-primary'">
                                 {{ actionLabel }}
                              </span>
                           </div>
                        </button>
                     </div>

                     <p class="mt-10 text-sm font-medium max-w-xs text-center leading-relaxed transition-colors"
                        :class="isRunning ? 'text-success' : 'text-on-surface-muted'">
                        {{ isRunning ? $t('dashboard.active_protection') : $t('dashboard.ready_to_boost') }}
                     </p>
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
               <div v-else
                  class="mt-auto mx-auto max-w-lg w-full p-5 rounded-2xl bg-surface-panel/40 border border-border flex items-start gap-4 shadow-sm backdrop-blur-sm">
                  <div
                     class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                     <div class="i-material-symbols-lightbulb text-lg"></div>
                  </div>
                  <div>
                     <h4 class="text-xs font-bold text-on-surface mb-1">{{ $t('dashboard.did_you_know') }}</h4>
                     <p class="text-xs text-on-surface-muted leading-relaxed">{{ $t('dashboard.hint') }}</p>
                  </div>
               </div>
            </main>

            <!-- Sidebar: Configuration & Node Selector (Right) -->
            <aside
               class="w-80 lg:w-96 flex-none bg-surface-panel/60 border-l border-border/50 backdrop-blur-xl flex flex-col z-10 shadow-[-5px_0_30px_-5px_rgba(0,0,0,0.05)]">
               <!-- Sidebar Header -->
               <div class="p-5 border-b border-border/50 flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-widest text-on-surface-muted">{{
                     $t('games.configuration') }}</span>
               </div>

               <!-- 1. Node Selector (Takes most space) -->
               <div class="flex-1 overflow-hidden flex flex-col p-5 gap-4">
                  <div class="flex items-center justify-between">
                     <span class="text-sm font-bold text-on-surface">{{ $t('nodes.select_node') }}</span>
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
                  <div class="rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs font-bold flex items-center gap-2">
                     <div :class="activeProxyMode === 'process' ? 'i-carbon-application-web' : 'i-carbon-network-overlay'"></div>
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
import { useMessage } from 'naive-ui'
import i18n from '@/i18n'
import { electronApi } from '@/api'

// Stores
const gameStore = useGameStore()
const categoryStore = useCategoryStore()
const nodeStore = useNodeStore()
const settingsStore = useSettingsStore()
const { checkInterval } = storeToRefs(settingsStore)
const message = useMessage()

// State
const game = computed(() => gameStore.currentGame)
const isRunning = computed(() => game.value?.status === 'accelerating')
const isSwitchingNode = ref(false)
const isActionPending = computed(() => isSwitchingNode.value || gameStore.operationState !== 'idle')
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

// Computed Helpers
const categoryLabel = computed(() => {
   if (!game.value) return ''
   const cat = categoryStore.categories.find((c: any) => c.id === game.value!.category)
   return cat?.name || i18n.global.t('common.uncategorized')
})

const selectedNode = computed(() => game.value?.nodeId || null)

const activeProxyMode = computed<'process' | 'routing'>(() => game.value?.proxyMode === 'routing' ? 'routing' : 'process')

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
      void syncSessionStateFromStore().then(() => sampleLatencyAndLoss(true))
      resumeSampling()
      resumeDuration()
   } else {
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

onUnmounted(() => {
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
