<template>
    <div class="flex flex-col h-full overflow-hidden gap-3 bg-surface-panel/50 rounded-2xl">
        <div class="flex-none flex flex-col gap-2 bg-surface/50 rounded-xl border border-border/50 backdrop-blur-md transition-all sticky top-0 z-10"
            :class="compact ? 'p-2 shadow-sm' : 'p-3 shadow-sm'">

            <div class="flex items-center gap-2 w-full">
                <div class="relative group flex-1">
                    <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <div
                            class="i-material-symbols-search text-on-surface-muted group-focus-within:text-primary transition-colors text-base">
                        </div>
                    </div>
                    <input v-model="nodeStore.searchQuery" type="text" :placeholder="$t('common.search')"
                        class="pl-9 pr-3 py-1.5 bg-surface-overlay/50 rounded-lg border border-border focus:border-primary/50 focus:bg-surface-overlay outline-none text-on-surface text-xs w-full transition-all placeholder:text-on-surface-muted" />
                </div>

                <n-popselect v-model:value="nodeStore.activeSortType" :options="sortOptions" trigger="click">
                    <button
                        class="px-2 py-1.5 rounded-lg border border-transparent hover:border-border hover:bg-surface-overlay text-on-surface-muted hover:text-primary transition-colors flex items-center gap-1.5"
                        :title="$t('common.sort_by')">
                        <div :class="getSortIcon(nodeStore.activeSortType)" class="text-lg"></div>
                        <span class="text-[10px] font-bold uppercase tracking-wider">{{
                            getSortLabel(nodeStore.activeSortType) }}</span>
                    </button>
                </n-popselect>
            </div>

            <div class="flex flex-row gap-2 justify-center items-center w-full">
                <select v-model="nodeStore.activeTypeFilter"
                    class=" w-full px-2 py-1.5 rounded-lg border border-border bg-surface-overlay/50 text-xs text-on-surface outline-none focus:border-primary/50">
                    <option value="all">{{ $t('nodes.filter_all_types') }}</option>
                    <option v-for="type in availableTypes" :key="type" :value="type" class=" ">
                        {{ type.toUpperCase() }}
                    </option>
                </select>

                <select v-model="nodeStore.activeGroupFilter"
                    class=" w-full px-2 py-1.5 rounded-lg border border-border bg-surface-overlay/50 text-xs text-on-surface outline-none focus:border-primary/50">
                    <option value="all">{{ $t('nodes.filter_all_groups') }}</option>
                    <option v-for="group in availableGroups" :key="group" :value="group">
                        {{ group === DEFAULT_NODE_GROUP ? $t('nodes.default_group') : group }}
                    </option>
                </select>
            </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1">
            <div class="grid gap-2 pb-2" :class="compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'">
                <div v-for="node in visibleNodes" :key="node.id || node.tag" @click="selectNode(node)"
                    class="group  relative rounded-xl border transition-all duration-200  overflow-hidden backdrop-blur-sm "
                    :class="[
                        modelValue === (node.id || node.tag)
                            ? 'bg-primary/5 border-primary shadow-[0_0_15px_-5px_rgba(var(--rgb-primary),0.3)]'
                            : 'bg-surface/50 border-border hover:border-primary/50 hover:bg-surface-overlay'
                    ]">

                    <div v-if="modelValue === (node.id || node.tag)"
                        class="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50 pointer-events-none">
                    </div>

                    <div class="relative  z-10 flex items-center gap-3" :class="compact ? 'p-2.5 pl-3' : 'p-3'">
                        <div class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors border"
                            :class="modelValue === (node.id || node.tag)
                                ? 'bg-primary/20 text-primary border-primary/20'
                                : 'bg-surface-overlay border-border text-on-surface-muted group-hover:text-primary group-hover:border-primary/30'">
                            <div :class="getNodeIcon(node.type)" class="text-lg"></div>
                        </div>

                        <div class="flex-1 min-w-0 flex flex-col gap-0.5 ">
                            <div class="flex items-center justify-between gap-2">
                                <span
                                    class="text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors ">
                                    {{ node.tag || node.server }}
                                </span>
                                <span class="shrink-0 font-mono text-[10px] font-bold"
                                    :class="getLatencyTextColor(node.latency)">
                                    {{ node.latency > 0 ? node.latency + 'ms' : '--' }}
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span
                                    class="text-[9px] mt-1 uppercase tracking-wider text-on-surface-muted border border-border px-1 rounded bg-surface-overlay/50 group-hover:border-primary/20 transition-colors">
                                    {{ node.type }}
                                </span>
                                <span v-if="!compact" class="text-[10px] text-on-surface-muted truncate">{{
                                    node.server }}</span>
                                <div class="flex items-center gap-1 mt-0.5 min-h-[14px]">
                                    <span v-if="subscriptionLabelOf(node)"
                                        class="text-[9px] text-primary/85 bg-primary/10 border border-primary/20 px-1 rounded truncate"
                                        :title="subscriptionLabelOf(node)">
                                        <button class="hover:underline cursor-pointer"
                                            @click.stop="jumpToGroup(subscriptionLabelOf(node))">
                                            @{{ subscriptionLabelOf(node) }}
                                        </button>
                                    </span>
                                    <span v-if="manualTagOf(node)"
                                        class="text-[9px] text-success bg-success/10 border border-success/20 px-1 rounded truncate"
                                        :title="manualTagOf(node)">
                                        <button class="hover:underline cursor-pointer"
                                            @click.stop="jumpToGroup(manualTagOf(node))">
                                            #{{ manualTagOf(node) }}
                                        </button>
                                    </span>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                <div v-if="visibleNodes.length === 0"
                    class="col-span-full flex flex-col items-center justify-center py-10 text-center opacity-70">
                    <div class="w-16 h-16 rounded-full bg-surface-overlay flex items-center justify-center mb-3">
                        <div class="i-material-symbols-dns-outline text-3xl text-on-surface-muted/50"></div>
                    </div>
                    <span class="text-xs font-medium text-on-surface-muted">
                        <p class="text-lg  font-medium">{{ $t('common.no_nodes') }}</p>
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NodeConfig } from '@/types'
import { DEFAULT_NODE_GROUP, useNodeStore } from '@/stores/nodes'

interface ExtendedNode extends NodeConfig {
    latency: number
    loss: number
}

const props = defineProps<{
    modelValue: string | null | undefined
    nodes: NodeConfig[]
    compact?: boolean // 是否紧凑显示，不显示节点类型和服务器地址
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()
const nodeStore = useNodeStore()

const availableTypes = computed(() => nodeStore.availableNodeTypes)
const availableGroups = computed(() => nodeStore.availableGroups)
const sortOptions = computed(() => [
    { label: `${t('common.creation')} · ${t('common.ascending')}`, value: 'default-asc' },
    { label: `${t('common.creation')} · ${t('common.descending')}`, value: 'default-desc' },
    { label: `${t('common.latency_short')} · ${t('common.ascending')}`, value: 'latency-asc' },
    { label: `${t('common.latency_short')} · ${t('common.descending')}`, value: 'latency-desc' },
    { label: `${t('common.alphabetical')} · ${t('common.ascending')}`, value: 'alphabetical-asc' },
    { label: `${t('common.alphabetical')} · ${t('common.descending')}`, value: 'alphabetical-desc' }
])

const nodesWithStats = computed<ExtendedNode[]>(() => {
    return props.nodes.map(node => {
        const defaultStat = { latency: -1, loss: 0 }
        const key = node.id || node.tag
        const stat = (key && nodeStore.nodeStats[key]) || defaultStat

        return {
            ...node,
            latency: stat.latency,
            loss: stat.loss
        }
    })
})

const visibleNodes = computed<ExtendedNode[]>(() => {
    const allowedKeys = new Set(
        props.nodes
            .map(node => String(node.id || node.tag || '').trim())
            .filter(Boolean)
    )

    const matched = nodeStore.filteredNodes.filter((node) => {
        const key = String(node.id || node.tag || '').trim()
        return !!key && allowedKeys.has(key)
    })

    const statMap = new Map(nodesWithStats.value.map((node) => [String(node.id || node.tag || '').trim(), node]))
    return matched.map((node) => {
        const key = String(node.id || node.tag || '').trim()
        return statMap.get(key) || {
            ...node,
            latency: -1,
            loss: 0
        }
    })
})

function getSortIcon(mode: string) {
    switch (mode) {
        case 'default-asc': return 'i-material-symbols-arrow-upward'
        case 'default-desc': return 'i-material-symbols-arrow-downward'
        case 'latency-asc': return 'i-material-symbols-network-check'
        case 'latency-desc': return 'i-material-symbols-network-check'
        case 'alphabetical-asc': return 'i-material-symbols-sort-by-alpha'
        case 'alphabetical-desc': return 'i-material-symbols-sort-by-alpha'
        default: return 'i-material-symbols-sort'
    }
}

function getSortLabel(mode: string) {
    switch (mode) {
        case 'default-asc': return `${t('common.creation')} ${t('common.ascending')}`
        case 'default-desc': return `${t('common.creation')} ${t('common.descending')}`
        case 'latency-asc': return `${t('common.latency_short')} ${t('common.ascending')}`
        case 'latency-desc': return `${t('common.latency_short')} ${t('common.descending')}`
        case 'alphabetical-asc': return `${t('common.alphabetical')} ${t('common.ascending')}`
        case 'alphabetical-desc': return `${t('common.alphabetical')} ${t('common.descending')}`
        default: return mode
    }
}

function selectNode(node: ExtendedNode) {
    const id = node.id || node.tag
    if (id) {
        emit('update:modelValue', id)
    }
}

function subscriptionLabelOf(node: NodeConfig): string {
    const group = nodeStore.getNodeSubscriptionGroup(node)
    return group === DEFAULT_NODE_GROUP ? '' : group
}

function manualTagOf(node: NodeConfig): string {
    return nodeStore.getNodeManualTag(node)
}

function jumpToGroup(group: string) {
    const value = String(group || '').trim()
    if (!value) return
    nodeStore.activeGroupFilter = value
}

function getNodeIcon(type: string) {
    const normalized = type.toLowerCase()
    if (normalized.includes('vmess')) return 'i-carbon-network-4'
    if (normalized.includes('vless')) return 'i-carbon-ibm-cloud-vpc'
    if (normalized.includes('shadowsocks') || normalized === 'ss' || normalized.startsWith('ss-')) return 'i-carbon-send-alt'
    if (normalized.includes('trojan')) return 'i-carbon-security'
    if (normalized.includes('hysteria')) return 'i-carbon-flash'
    if (normalized.includes('tuic')) return 'i-carbon-rocket'
    return 'i-carbon-network-1'
}

function getLatencyTextColor(ms: number) {
    if (ms <= 0) return 'text-on-surface-muted'
    if (ms < 100) return 'text-success'
    if (ms < 200) return 'text-warning'
    return 'text-error'
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(var(--rgb-primary), 0.15);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(var(--rgb-primary), 0.35);
}

.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
