<template>
  <div ref="chartRef" class="w-full" :class="chartHeightClass"></div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useNodeStore } from '@/stores/nodes'
import { useIntervalFn } from '@vueuse/core'
import { useTheme } from '@/composables/useTheme'

const props = withDefaults(defineProps<{
  nodeKey?: string | null
  compact?: boolean
  embedded?: boolean
}>(), {
  compact: false,
  embedded: false
})

const nodeStore = useNodeStore()
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

const { isDark, themeColor } = useTheme()

const activeNodeKey = computed(() => props.nodeKey || '')
const chartHeightClass = computed(() => {
  if (props.embedded) {
    return props.compact ? 'h-24 md:h-28' : 'h-28 md:h-32'
  }
  return props.compact ? 'h-48' : 'h-64'
})

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function renderChart(xData: string[], yData: (number | null)[]) {
  if (!chart) return

  const css = getComputedStyle(document.documentElement)
  const primaryRgb = css.getPropertyValue('--rgb-primary').trim() || '16, 185, 129'
  const borderRgb = css.getPropertyValue('--rgb-border').trim() || '226, 232, 240'
  const mutedTextRgb = css.getPropertyValue('--rgb-on-surface-muted').trim() || '148, 163, 184'
  const axisColor = `rgba(${borderRgb}, 0.9)`
  const splitColor = `rgba(${borderRgb}, 0.45)`
  const axisTextColor = `rgba(${mutedTextRgb}, 1)`
  const isEmbedded = props.embedded

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: isEmbedded ? 'line' : 'cross' }
    },
    grid: {
      top: isEmbedded ? 8 : 20,
      right: isEmbedded ? 6 : 20,
      bottom: isEmbedded ? 4 : 20,
      left: isEmbedded ? 6 : 40,
      containLabel: !isEmbedded
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLabel: isEmbedded ? { show: false } : { color: axisTextColor },
      axisTick: { show: !isEmbedded },
      axisLine: isEmbedded
        ? { show: false }
        : { lineStyle: { color: axisColor } }
    },
    yAxis: {
      type: 'value',
      axisLabel: isEmbedded ? { show: false } : { color: axisTextColor },
      axisTick: { show: false },
      splitLine: {
        lineStyle: { color: splitColor, type: isEmbedded ? 'dashed' : 'solid' }
      },
      axisLine: isEmbedded
        ? { show: false }
        : { lineStyle: { color: axisColor } }
    },
    series: [
      {
        data: yData,
        type: 'line',
        smooth: true,
        showSymbol: false,
        connectNulls: false,
        lineStyle: {
          width: isEmbedded ? 2.5 : 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `rgba(${primaryRgb}, ${isEmbedded ? 0.32 : 0.5})` },
            { offset: 1, color: `rgba(${primaryRgb}, 0.0)` }
          ])
        },
        itemStyle: { color: `rgba(${primaryRgb}, 1)` }
      }
    ]
  })
}

async function refreshChart() {
  const nodeKey = activeNodeKey.value
  if (!nodeKey) {
    renderChart([], [])
    return
  }

  const history = await nodeStore.getNodeLatencyHistory(nodeKey, 240)
  renderChart(
    history.map(item => formatTime(item.timestamp)),
    history.map(item => (item.latency > 0 ? item.latency : null))
  )
}

const { pause } = useIntervalFn(() => {
  void refreshChart()
}, 1000)

onMounted(() => {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value)
  void refreshChart()
  window.addEventListener('resize', resize)
})

watch([activeNodeKey, themeColor, isDark, () => props.compact, () => props.embedded], async () => {
  await nextTick()
  resize()
  void refreshChart()
})

onUnmounted(() => {
  pause()
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})

const resize = () => chart?.resize()
</script>
