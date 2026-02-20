<template>
    <div @click="$emit('select', node)"
        class="group relative bg-surface-panel rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden hover:bg-surface/10"
        :class="[
            selected
                ? 'border-primary shadow-[0_0_15px_rgba(var(--rgb-primary),0.15)] bg-primary/5'
                : 'border-border hover:border-primary/30'
        ]">

        <!-- Hover Highlight Effect -->
        <div
            class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        </div>

        <div class="p-3 flex flex-col gap-2 relative z-10" :class="{ 'p-4 gap-3': !compact }">
            <!-- Header -->
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5 overflow-hidden">
                    <!-- Flag/Icon -->
                    <div
                        class="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-border group-hover:border-primary/30 transition-colors shadow-sm">
                        <div :class="getNodeIcon(node.type)"
                            class="text-base md:text-lg text-on-surface-variant group-hover:text-primary transition-colors">
                        </div>
                    </div>

                    <div class="flex flex-col min-w-0">
                        <div
                            class="font-bold text-xs md:text-sm text-on-surface truncate leading-tight group-hover:text-primary transition-colors">
                            {{ node.tag || node.server }}</div>
                        <div class="flex items-center gap-1.5 text-[9px] md:text-[10px] text-on-surface-muted mt-0.5">
                            <span class="uppercase bg-surface/50 px-1 py-0 rounded border border-border">{{ node.type
                                }}</span>
                            <span class="truncate opacity-70">{{ node.server }}</span>
                        </div>
                    </div>
                </div>

                <!-- Selection Indicator -->
                <div v-if="selected" class="shrink-0">
                    <div class="i-material-symbols-check-circle text-primary text-base md:text-lg animate-scale-in">
                    </div>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-3 gap-1.5 md:gap-2">
                <!-- Latency -->
                <div
                    class="bg-surface/40 rounded-lg py-1 px-1.5 flex flex-col items-center justify-center border border-border/50 group-hover:border-primary/20 transition-colors">
                    <div class="text-[8px] md:text-[9px] uppercase font-bold text-on-surface-muted mb-0.5">{{
                        $t('common.latency_short') }}
                    </div>
                    <div class="flex items-center gap-1">
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full" :class="getLatencyColor(node.latency)">
                        </div>
                        <span class="font-mono font-bold text-[10px] md:text-xs"
                            :class="getLatencyTextColor(node.latency)">
                            {{ node.latency > 0 ? node.latency : '-' }}
                        </span>
                        <span class="text-[8px] md:text-[9px] text-on-surface-muted">ms</span>
                    </div>
                </div>

                <!-- Load -->
                <div
                    class="bg-surface/40 rounded-lg py-1 px-1.5 flex flex-col items-center justify-center border border-border/50 group-hover:border-primary/20 transition-colors">
                    <div class="text-[8px] md:text-[9px] uppercase font-bold text-on-surface-muted mb-0.5">{{
                        $t('common.load') }}</div>
                    <div class="flex items-center gap-1">
                        <div class="i-material-symbols-analytics text-[9px] md:text-[10px] text-on-surface-muted"></div>
                        <span class="font-mono font-bold text-[10px] md:text-xs text-on-surface">{{ node.load || '-'
                            }}%</span>
                    </div>
                </div>

                <!-- Bandwidth -->
                <div
                    class="bg-surface/40 rounded-lg py-1 px-1.5 flex flex-col items-center justify-center border border-border/50 group-hover:border-primary/20 transition-colors">
                    <div class="text-[8px] md:text-[9px] uppercase font-bold text-on-surface-muted mb-0.5">{{
                        $t('common.speed') }}</div>
                    <div class="flex items-center gap-1">
                        <div class="i-material-symbols-speed text-[9px] md:text-[10px] text-on-surface-muted"></div>
                        <span class="font-mono font-bold text-[10px] md:text-xs text-on-surface">
                            {{ node.bandwidth ? (node.bandwidth / 1024 / 1024).toFixed(1) : '-' }}
                        </span>
                        <span class="text-[8px] md:text-[9px] text-on-surface-muted">MB/s</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">

defineProps<{
    node: any
    selected: boolean
    compact?: boolean
}>()

defineEmits<{
    (e: 'select', node: any): void
}>()

function getNodeIcon(type: string) {
    switch (type) {
        case 'vmess': return 'i-carbon-network-4'
        case 'vless': return 'i-carbon-ibm-cloud-vpc'
        case 'shadowsocks': return 'i-carbon-send-alt'
        case 'trojan': return 'i-carbon-security'
        default: return 'i-carbon-network-1'
    }
}

function getLatencyColor(ms: number) {
    if (ms <= 0) return 'bg-secondary/50'
    if (ms < 100) return 'bg-success shadow-[0_0_8px_rgba(var(--rgb-success),0.3)]'
    if (ms < 200) return 'bg-warning shadow-[0_0_8px_rgba(var(--rgb-warning),0.3)]'
    return 'bg-error shadow-[0_0_8px_rgba(var(--rgb-error),0.3)]'
}

function getLatencyTextColor(ms: number) {
    if (ms <= 0) return 'text-on-surface-muted'
    if (ms < 100) return 'text-success'
    if (ms < 200) return 'text-warning'
    return 'text-error'
}
</script>

<style scoped>
@keyframes scale-in {
    from {
        transform: scale(0.5);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

.animate-scale-in {
    animation: scale-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
</style>
