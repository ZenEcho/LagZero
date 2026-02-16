<template>
  <div ref="chartRef" class="w-full h-64"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    
    // Mock data generation
    const data = Array.from({ length: 20 }, () => Math.floor(Math.random() * 100))
    const xData = Array.from({ length: 20 }, (_, i) => i)

    const option = {
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
          data: data,
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(62, 175, 124, 0.5)' },
              { offset: 1, color: 'rgba(62, 175, 124, 0.0)' }
            ])
          },
          itemStyle: { color: '#3eaf7c' }
        }
      ]
    }
    chart.setOption(option)
    
    window.addEventListener('resize', resize)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})

const resize = () => chart?.resize()
</script>
