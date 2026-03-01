<template>
  <div class="flex-1 flex flex-col items-center justify-center text-center animate-fade-in-up pb-8">
    <div class="relative mb-8 group mt-[-8vh]">
      <div
        class="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 group-hover:scale-175 transition-transform duration-700">
      </div>
      <img src="/logo.svg"
        class="relative w-28 h-28 drop-shadow-2xl transition-transform duration-500 group-hover:scale-110"
        alt="LagZero Logo" />
    </div>

    <h1
      class="h-14 text-4xl font-black bg-gradient-to-br from-primary via-purple-500 to-secondary bg-clip-text text-transparent mb-2">
      {{ pkg.productName }}
    </h1>
    <p class="text-on-surface-muted mb-8 tracking-wide font-medium">{{ $t('settings.tagline') }}</p>

    <div class="grid gap-3 w-full max-w-[320px]">
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div class="flex justify-between items-center p-4 hover:bg-surface-overlay/30 transition-colors">
          <span class="text-sm font-bold">{{ $t('settings.current_version') }}</span>
          <span class="font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg text-xs tracking-wider">v{{
            appVersion }}</span>
        </div>
      </div>

      <n-button type="primary" block secondary size="large" @click="() => checkUpdate()" :loading="checkingUpdate"
        class="glass-button-primary mt-2">
        <template #icon>
          <div class="i-material-symbols-update text-lg"></div>
        </template>
        <span class="font-bold">{{ $t('settings.check_update') }}</span>
      </n-button>

      <div class="grid grid-cols-2 gap-3 mt-1">
        <n-button block secondary @click="openReleasesUrl" class="glass-button">
          <template #icon>
            <div class="i-material-symbols-history text-lg"></div>
          </template>
          <span class="font-bold">{{ $t('settings.releases') }}</span>
        </n-button>
        <n-button block secondary @click="openProjectUrl" class="glass-button">
          <template #icon>
            <div class="i-carbon-logo-github text-lg"></div>
          </template>
          <span class="font-bold">GitHub</span>
        </n-button>
      </div>
    </div>

    <div v-if="updateInfo"
      class="mt-8 w-full max-w-sm text-left bg-surface-panel/80 backdrop-blur-md border border-border/50 p-5 rounded-2xl space-y-3 animate-scale-in shadow-xl">
      <div v-if="updateInfo.error" class="text-error flex items-center gap-2 font-medium">
        <div class="i-material-symbols-error text-xl"></div>
        {{ $t('settings.update_error', { msg: updateInfo.error }) }}
      </div>
      <div v-else-if="updateInfo.available" class="space-y-4">
        <div class="text-success font-bold flex items-center gap-2 text-base">
          <div class="i-material-symbols-rocket-launch text-xl"></div>
          {{ $t('settings.update_available', { version: updateInfo.version }) }}
        </div>
        <div v-if="updateInfo.note"
          class="text-on-surface-muted text-xs whitespace-pre-wrap max-h-40 overflow-y-auto bg-surface/50 p-3 rounded-xl border border-border/50 font-mono shadow-inner custom-scrollbar">
          {{ updateInfo.note }}
        </div>

        <n-button type="primary" size="small" block class="glass-button-primary" @click="openReleasesUrl">
          <template #icon>
            <div class="i-material-symbols-download text-base"></div>
          </template>
          <span class="font-bold">{{ $t('settings.download_update') }}</span>
        </n-button>

        <div class="text-[11px] text-on-surface-muted text-right">{{ updateInfo.date }}</div>
      </div>
      <div v-else class="text-on-surface-muted flex items-center justify-center gap-2 py-2 font-medium">
        <div class="i-material-symbols-check-circle text-success text-xl"></div>
        {{ $t('settings.no_update') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui'
import pkg from '../../../package.json'
import { useAppUpdater } from '@/composables/useAppUpdater'

const { appVersion, checkingUpdate, updateInfo, checkUpdate, openProjectUrl, openReleasesUrl } = useAppUpdater()
</script>
