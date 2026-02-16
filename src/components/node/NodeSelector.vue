<template>
    <!-- 根容器：使用 surface-panel 背景，确保主题适应性 -->
    <div class="flex flex-col h-full overflow-hidden gap-3 bg-surface-panel/50 rounded-2xl">
        <!-- 工具栏：固定高度，不缩放 -->
        <div class="flex-none flex flex-col gap-2 bg-surface/50 rounded-xl border border-border/50 backdrop-blur-md transition-all sticky top-0 z-10"
            :class="compact ? 'p-2' : 'p-3 md:flex-row md:items-center md:justify-between shadow-sm'">

            <div class="flex items-center gap-2 w-full" :class="compact ? '' : 'md:w-auto'">
                <!-- 搜索框 -->
                <div class="relative group flex-1" :class="compact ? '' : 'md:min-w-[200px]'">
                    <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <div
                            class="i-material-symbols-search text-on-surface-muted group-focus-within:text-primary transition-colors text-base">
                        </div>
                    </div>
                    <input v-model="searchQuery" type="text" :placeholder="$t('common.search')"
                        class="pl-9 pr-3 py-1.5 bg-surface-overlay/50 rounded-lg border border-border focus:border-primary/50 focus:bg-surface-overlay outline-none text-on-surface text-xs w-full transition-all placeholder:text-on-surface-muted/50" />
                </div>

                <!-- 排序 (显示当前模式) -->
                <button @click="cycleSort"
                    class="px-2 py-1.5 rounded-lg border border-transparent hover:border-border hover:bg-surface-overlay text-on-surface-muted hover:text-primary transition-colors flex items-center gap-1.5"
                    :title="$t('common.sort_by')">
                    <div class="i-material-symbols-sort text-lg"></div>
                    <span class="text-[10px] font-bold uppercase tracking-wider">{{ $t(`common.${sortBy === 'latency' ?
                        'latency_short' : sortBy}`) }}</span>
                </button>
            </div>

            <!-- 过滤器 (非紧凑模式) -->
            <div v-if="!compact" class="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto mt-2 md:mt-0">
                <div class="flex gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar w-full md:w-auto">
                    <button v-for="type in uniqueTypes" :key="type" @click="toggleTypeFilter(type)"
                        class="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border"
                        :class="selectedTypes.includes(type)
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-surface-overlay/50 text-on-surface-muted border-border hover:border-primary/30 hover:text-on-surface'">
                        {{ type }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 节点列表区域 -->
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1">
            <div class="grid gap-2 pb-2" :class="compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'">
                <div v-for="node in sortedNodes" :key="node.id" @click="selectNode(node)"
                    class="group relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-sm select-none"
                    :class="[
                        modelValue === (node.id || node.tag)
                            ? 'bg-primary/5 border-primary shadow-[0_0_15px_-5px_rgba(var(--rgb-primary),0.3)]'
                            : 'bg-surface/50 border-border hover:border-primary/50 hover:bg-surface-overlay'
                    ]">

                    <!-- 选中时的背景高亮指示 -->
                    <div v-if="modelValue === (node.id || node.tag)"
                        class="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50 pointer-events-none">
                    </div>

                    <div class="relative z-10 flex items-center gap-3" :class="compact ? 'p-2.5 pl-3' : 'p-3'">

                        <!-- Protocol Icon -->
                        <div class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors border"
                            :class="modelValue === (node.id || node.tag)
                                ? 'bg-primary/20 text-primary border-primary/20'
                                : 'bg-surface-overlay border-border text-on-surface-muted group-hover:text-primary group-hover:border-primary/30'">
                            <div :class="getNodeIcon(node.type)" class="text-lg"></div>
                        </div>

                        <!-- Info -->
                        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div class="flex items-center justify-between gap-2">
                                <span
                                    class="text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                                    {{ node.tag || node.server }}
                                </span>
                                <!-- Latency Badge -->
                                <span class="shrink-0 font-mono text-[10px] font-bold"
                                    :class="getLatencyTextColor(node.latency)">
                                    {{ node.latency > 0 ? node.latency + 'ms' : '--' }}
                                </span>
                            </div>
                            <!-- Sub-info -->
                            <div class="flex items-center gap-2">
                                <span
                                    class="text-[9px] uppercase tracking-wider text-on-surface-muted/70 border border-border px-1 rounded bg-surface-overlay/50 group-hover:border-primary/20 transition-colors">
                                    {{ node.type }}
                                </span>
                                <span v-if="!compact" class="text-[10px] text-on-surface-muted/50 truncate">{{
                                    node.server }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 空状态展示 -->
                <div v-if="sortedNodes.length === 0"
                    class="col-span-full flex flex-col items-center justify-center py-10 text-center opacity-70">
                    <div class="w-16 h-16 rounded-full bg-surface-overlay flex items-center justify-center mb-3">
                        <div class="i-material-symbols-dns-outline text-3xl text-on-surface-muted/50"></div>
                    </div>
                    <span class="text-xs font-medium text-on-surface-muted">No nodes found</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { NodeConfig } from '@/utils/protocol'
import { useNodeStore } from '@/stores/nodes'

interface ExtendedNode extends NodeConfig {
    latency: number
    loss: number
    load: number
    bandwidth: number // bytes/sec
}

const props = defineProps<{
    modelValue: string | null | undefined
    nodes: NodeConfig[]
    compact?: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
}>()

// 响应式状态
const searchQuery = ref('')
const selectedTypes = ref<string[]>([])
const sortBy = ref<'latency' | 'load' | 'bandwidth'>('latency')

const nodeStore = useNodeStore()

// 合并节点实时统计数据
const nodesWithStats = computed<ExtendedNode[]>(() => {
    return props.nodes.map(node => {
        const defaultStat = { latency: -1, loss: 0 }
        const key = node.id || node.tag
        const stat = (key && nodeStore.nodeStats[key]) || defaultStat

        return {
            ...node,
            latency: stat.latency,
            loss: stat.loss,
            load: 0, // 待实现
            bandwidth: 0 // 待实现
        }
    })
})

// 提取不重复的节点类型
const uniqueTypes = computed(() => {
    const types = new Set(props.nodes.map(n => n.type))
    return Array.from(types).sort()
})

// 过滤与排序逻辑
const sortedNodes = computed(() => {
    let result = [...nodesWithStats.value]

    // 搜索过滤
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        result = result.filter(n =>
            (n.tag && n.tag.toLowerCase().includes(q)) ||
            (n.server && n.server.toLowerCase().includes(q))
        )
    }

    // 类型过滤
    if (selectedTypes.value.length > 0) {
        result = result.filter(n => selectedTypes.value.includes(n.type))
    }

    // 排序
    result.sort((a, b) => {
        if (sortBy.value === 'latency') {
            const latA = a.latency <= 0 ? 999999 : a.latency
            const latB = b.latency <= 0 ? 999999 : b.latency
            return latA - latB
        }
        if (sortBy.value === 'load') return a.load - b.load
        if (sortBy.value === 'bandwidth') return b.bandwidth - a.bandwidth
        return 0
    })

    return result
})

// 切换类型过滤器
function toggleTypeFilter(type: string) {
    const index = selectedTypes.value.indexOf(type)
    if (index > -1) {
        selectedTypes.value.splice(index, 1)
    } else {
        selectedTypes.value.push(type)
    }
}

// 切换排序模式
function cycleSort() {
    const modes: ('latency' | 'load' | 'bandwidth')[] = ['latency', 'load', 'bandwidth']
    const currentIndex = modes.indexOf(sortBy.value)
    const nextIndex = (currentIndex + 1) % modes.length
    sortBy.value = modes[nextIndex]!
}

// 选择节点触发事件
function selectNode(node: ExtendedNode) {
    const id = node.id || node.tag
    if (id) {
        emit('update:modelValue', id)
    }
}

// 根据节点协议获取图标
function getNodeIcon(type: string) {
    const t = type.toLowerCase()
    if (t.includes('vmess')) return 'i-carbon-network-4'
    if (t.includes('vless')) return 'i-carbon-ibm-cloud-vpc'
    if (t.includes('shadowsocks') || t.includes('ss')) return 'i-carbon-send-alt'
    if (t.includes('trojan')) return 'i-carbon-security'
    if (t.includes('hysteria')) return 'i-carbon-flash'
    if (t.includes('tuic')) return 'i-carbon-rocket'
    return 'i-carbon-network-1'
}

// 延迟状态文字颜色
function getLatencyTextColor(ms: number) {
    if (ms <= 0) return 'text-on-surface-muted/40'
    if (ms < 100) return 'text-success'
    if (ms < 200) return 'text-warning'
    return 'text-error'
}
</script>

<style scoped>
/* 自定义滚动条样式 */
.custom-scrollbar::-webkit-scrollbar {
    width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(var(--primary-rgb), 0.15);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(var(--primary-rgb), 0.35);
}

/* 缩放动画 */
@keyframes scale-in {
    from {
        transform: scale(0.6);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

.animate-scale-in {
    animation: scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 脉冲动画 */
@keyframes pulse-slow {

    0%,
    100% {
        opacity: 0.1;
        transform: scale(1);
    }

    50% {
        opacity: 0.2;
        transform: scale(1.1);
    }
}

.animate-pulse-slow {
    animation: pulse-slow 4s infinite ease-in-out;
}

/* 隐藏滚动条 */
.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
