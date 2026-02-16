<template>
  <div ref="chartRef" class="w-full h-64"></div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useNodeStore } from '@/stores/nodes'
import { useIntervalFn } from '@vueuse/core'

const props = defineProps<{
  nodeKey?: string | null
}>()

const nodeStore = useNodeStore()
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

const activeNodeKey = computed(() => props.nodeKey || '')

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function renderChart(xData: string[], yData: (number | null)[]) {
  if (!chart) return
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    grid: {
      top: 20,
      right: 20,
      bottom: 20,
      left: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#666' } }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#333' } },
      axisLine: { lineStyle: { color: '#666' } }
    },
    series: [
      {
        data: yData,
        type: 'line',
        smooth: true,
        showSymbol: false,
        connectNulls: false,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(62, 175, 124, 0.5)' },
            { offset: 1, color: 'rgba(62, 175, 124, 0.0)' }
          ])
        },
        itemStyle: { color: '#3eaf7c' }
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

watch(activeNodeKey, () => {
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
