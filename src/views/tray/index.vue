<template>
    <div class="h-screen w-screen bg-transparent select-none overflow-hidden p-1.5">
        <div
            class="h-full w-full flex flex-col bg-surface/95 backdrop-blur-3xl border border-border/40 text-on-surface shadow-xl relative rounded-2xl overflow-hidden transition-colors duration-300">
            <!-- Background Glow Effects -->
            <div class="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-80">
                <div class="absolute -top-[20%] -left-[10%] w-[70%] h-[50%] bg-primary/10 rounded-full blur-[60px]">
                </div>
                <div v-if="state.isRunning"
                    class="absolute -bottom-[20%] -right-[10%] w-[70%] h-[50%] bg-success/10 rounded-full blur-[60px]">
                </div>
            </div>

            <!-- Header: Game as Title -->
            <header class="flex-none px-4 pt-4 pb-3 flex items-center justify-between z-10 window-drag">
                <div class="flex items-center gap-3 min-w-0">
                    <div
                        class="w-10 h-10 rounded-[10px] bg-surface-panel border border-border/50 overflow-hidden flex shrink-0 items-center justify-center shadow-sm">
                        <img v-if="state.gameIconUrl" :src="state.gameIconUrl" class="w-full h-full object-cover" />
                        <div v-else class="i-material-symbols-sports-esports text-[24px] text-primary/60"></div>
                    </div>
                    <div class="min-w-0 flex flex-col justify-center gap-0.5">
                        <div
                            class="text-[9px] font-bold uppercase tracking-wider text-on-surface-muted/80 leading-none">
                            {{ state.gameName ? t('tray.current_game') : pkg.productName }}
                        </div>
                        <h2 class="text-[15px] font-bold text-on-surface truncate leading-tight">
                            {{ state.gameName || t('tray.no_game_selected') }}
                        </h2>
                    </div>
                </div>
                <span
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border transition-colors shrink-0"
                    :class="runningBadgeClass">
                    {{ runningStatusText }}
                </span>
            </header>

            <div class="w-full px-4">
                <div class="w-full h-px bg-border/40"></div>
            </div>

            <!-- Main: Big Action Button -->
            <main class="flex-1 min-h-0 px-4 py-5 flex flex-col items-center justify-center z-10 overflow-hidden">
                <div class="flex-1 flex flex-col items-center justify-center w-full">
                    <button @click="toggleAction" :disabled="isActionDisabled"
                        class="relative w-[100px] h-[100px] rounded-full flex items-center justify-center outline-none transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] group"
                        :class="[actionShadowClass, isActionDisabled ? 'opacity-70 cursor-not-allowed' : '']">
                        <div class="absolute inset-0 rounded-full border-[1.5px] backdrop-blur-md transition-all duration-300 group-hover:bg-opacity-20"
                            :class="actionSurfaceClass"></div>
                        <div class="flex flex-col items-center gap-1.5 relative z-20">
                            <div class="text-4xl transition-transform" :class="actionIconClass"></div>
                            <span class="text-[11px] font-black uppercase tracking-wider" :class="actionTextClass">
                                {{ actionText }}
                            </span>
                        </div>
                    </button>
                    <p
                        class="text-[11px] leading-relaxed text-center text-on-surface-muted/90 max-w-[220px] mt-4 min-h-[16px]">
                        {{ modeHintText }}
                    </p>
                </div>

                <!-- Stats: Cleaner and spaced -->
                <section class="w-full grid grid-cols-3 gap-2 text-center mt-3">
                    <div
                        class="rounded-xl bg-surface-panel/40 p-2.5 border border-border/30 flex flex-col items-center justify-center">
                        <div class="text-[9px] font-semibold uppercase tracking-wider text-on-surface-muted/80 mb-1.5">
                            {{ t('tray.latency') }}</div>
                        <div class="text-[14px] font-bold font-mono leading-none flex items-baseline justify-center gap-0.5"
                            :class="state.isRunning ? getLatencyTextColor(state.latency) : 'text-on-surface-muted/50'">
                            {{ latencyValue }}
                            <span v-if="state.isRunning && state.latency > 0"
                                class="text-[9px] opacity-80 font-normal">{{ t('tray.unit_ms') }}</span>
                        </div>
                    </div>
                    <div
                        class="rounded-xl bg-surface-panel/40 p-2.5 border border-border/30 flex flex-col items-center justify-center">
                        <div class="text-[9px] font-semibold uppercase tracking-wider text-on-surface-muted/80 mb-1.5">
                            {{ t('tray.packet_loss') }}</div>
                        <div class="text-[14px] font-bold font-mono leading-none flex items-baseline justify-center gap-0.5"
                            :class="state.isRunning && state.loss > 0 ? 'text-warning' : (state.isRunning ? 'text-on-surface' : 'text-on-surface-muted/50')">
                            {{ lossValue }}
                            <span v-if="state.isRunning" class="text-[9px] opacity-80 font-normal">%</span>
                        </div>
                    </div>
                    <div
                        class="rounded-xl bg-surface-panel/40 p-2.5 border border-border/30 flex flex-col items-center justify-center">
                        <div class="text-[9px] font-semibold uppercase tracking-wider text-on-surface-muted/80 mb-1.5">
                            {{ t('tray.duration') }}</div>
                        <div class="text-[14px] font-bold font-mono leading-none"
                            :class="state.isRunning ? 'text-on-surface' : 'text-on-surface-muted/50'">
                            {{ durationValue }}
                        </div>
                    </div>
                </section>
            </main>

            <!-- Footer -->
            <footer class="flex-none p-2 border-t border-border/30 bg-surface-overlay/30 z-10 flex gap-1.5">
                <button @click="showMainWindow"
                    class="flex-1 py-2 px-3 text-[11px] font-semibold rounded-xl hover:bg-surface-panel/80 text-on-surface-muted hover:text-on-surface transition-colors flex items-center justify-center gap-2">
                    <div class="i-material-symbols-dashboard-outline text-[16px]"></div>
                    {{ t('tray.show_window') }}
                </button>
                <div class="w-[1px] bg-border/40 my-2 mx-1 rounded-full"></div>
                <button @click="quitApp"
                    class="flex-1 py-2 px-3 text-[11px] font-semibold rounded-xl hover:bg-error/10 text-on-surface-muted hover:text-error transition-colors flex items-center justify-center gap-2">
                    <div class="i-carbon-power text-[14px]"></div>
                    {{ t('tray.quit') }}
                </button>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { electronApi } from '@/api'
import { useTheme } from '@/composables/useTheme'
import pkg from '../../../package.json'

useTheme()

type TrayOperationState = 'idle' | 'starting' | 'stopping'

interface TrayState {
    gameName: string
    gameIconUrl: string | null
    isRunning: boolean
    isCoreInstalled: boolean
    isActionPending: boolean
    operationState: TrayOperationState
    latency: number
    loss: number
    duration: string
}

type TrayStatePayload = Partial<TrayState> & { __version?: number }

const { t } = useI18n()
let latestStateVersion = 0

const state = ref<TrayState>({
    gameName: '',
    gameIconUrl: null,
    isRunning: false,
    isCoreInstalled: true,
    isActionPending: false,
    operationState: 'idle',
    latency: 0,
    loss: 0,
    duration: '00:00:00'
})

const isActionDisabled = computed(() => state.value.isActionPending || (!state.value.isRunning && !state.value.isCoreInstalled))
const runningStatusText = computed(() => (state.value.isRunning ? t('common.running') : t('common.stopped')))

const runningBadgeClass = computed(() => {
    return state.value.isRunning
        ? 'text-success border-success/30 bg-success/10'
        : 'text-on-surface-muted border-border/40 bg-surface/50'
})

const actionSurfaceClass = computed(() => {
    if (!state.value.isRunning && !state.value.isCoreInstalled) return 'bg-on-surface-muted/5 border-on-surface-muted/10'
    if (state.value.isRunning) return 'bg-error/5 border-error/20'
    return 'bg-primary/5 border-primary/20'
})

const actionShadowClass = computed(() => {
    if (!state.value.isRunning && !state.value.isCoreInstalled) return ''
    return state.value.isRunning
        ? 'shadow-[0_0_40px_-10px_rgba(var(--rgb-error),0.4)]'
        : 'shadow-[0_0_40px_-10px_rgba(var(--rgb-primary),0.4)]'
})

const actionIconClass = computed(() => {
    if (state.value.isActionPending) return 'i-carbon-circle-dash animate-spin text-primary'
    if (!state.value.isRunning && !state.value.isCoreInstalled) return 'i-carbon-cloud-download text-on-surface-muted'
    return state.value.isRunning ? 'i-carbon-stop-filled text-error' : 'i-carbon-play-filled-alt text-primary'
})

const actionTextClass = computed(() => {
    if (!state.value.isRunning && !state.value.isCoreInstalled) return 'text-on-surface-muted'
    return state.value.isRunning ? 'text-error' : 'text-primary'
})

const actionText = computed(() => {
    if (!state.value.isRunning && !state.value.isCoreInstalled) return t('singbox_installer.preparing')
    if (state.value.operationState === 'starting') return t('common.starting')
    if (state.value.operationState === 'stopping') return t('common.stopping')
    if (state.value.isActionPending) return state.value.isRunning ? t('common.stopping') : t('common.starting')
    return state.value.isRunning ? t('common.stop') : t('common.start')
})

const modeHintText = computed(() => {
    if (!state.value.isRunning && !state.value.isCoreInstalled) return t('singbox_installer.preparing')
    return state.value.isRunning ? t('tray.running_hint') : t('tray.idle_hint')
})

const latencyValue = computed(() => (state.value.isRunning && state.value.latency > 0 ? String(state.value.latency) : '--'))
const lossValue = computed(() => (state.value.isRunning ? String(Math.max(0, Math.round(state.value.loss))) : '--'))
const durationValue = computed(() => {
    if (!state.value.isRunning) return '00:00:00'
    return state.value.duration || '00:00:00'
})

function getLatencyTextColor(ms: number) {
    if (ms <= 0) return 'text-on-surface-muted'
    if (ms < 100) return 'text-success'
    if (ms < 200) return 'text-warning'
    return 'text-error'
}

function normalizeOperationState(stateLike: unknown): TrayOperationState {
    if (stateLike === 'starting' || stateLike === 'stopping') return stateLike
    return 'idle'
}

function handleStateUpdate(newState: TrayStatePayload | null | undefined) {
    if (!newState || typeof newState !== 'object') return

    const version = Number(newState.__version || 0)
    if (version > 0) {
        if (version < latestStateVersion) return
        latestStateVersion = version
    }

    const next: Partial<TrayState> = { ...newState }
    delete (next as TrayStatePayload).__version
    state.value = {
        ...state.value,
        ...next,
        operationState: normalizeOperationState(next.operationState)
    }
}

function toggleAction() {
    if (state.value.isActionPending) return
    electronApi.trayActionToggle()
}

function showMainWindow() {
    electronApi.trayShowMain()
}

function quitApp() {
    electronApi.trayQuit()
}

onMounted(async () => {
    electronApi.on('tray:state-updated', handleStateUpdate)
    try {
        const latest = await electronApi.trayGetState()
        handleStateUpdate(latest)
    } catch {
        // ignore
    }
})

onUnmounted(() => {
    if (typeof electronApi.off === 'function') {
        electronApi.off('tray:state-updated', handleStateUpdate)
    }
})
</script>

<style>
/* AppWindow like dragging for top header to allow moving if needed, though tray might be fixed */
.window-drag {
    -webkit-app-region: drag;
}

.window-drag * {
    -webkit-app-region: no-drag;
}

/* Prevent body scroll */
html,
body,
#app {
    overflow: hidden !important;
    background: transparent !important;
}
</style>
