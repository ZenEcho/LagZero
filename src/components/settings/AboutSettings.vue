<template>
  <div class="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in-up">
    <div class="relative mb-8 group">
      <div
        class="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 group-hover:scale-175 transition-transform duration-700">
      </div>
      <img src="/logo.svg"
        class="relative w-32 h-32 drop-shadow-2xl transition-transform duration-500 group-hover:scale-110"
        alt="LagZero Logo" />
    </div>

    <h1
      class=" h-14 text-4xl font-black bg-gradient-to-br from-primary via-purple-500 to-secondary bg-clip-text text-transparent mb-2">
      {{ pkg.name }}
    </h1>
    <p class="text-on-surface-muted mb-8 tracking-wide">{{ $t('settings.tagline') }}</p>

    <div class="grid gap-3 w-full max-w-xs">
      <div
        class="bg-surface-overlay/50 border border-border/50 rounded-xl p-3 flex justify-between items-center mb-4 backdrop-blur-sm">
        <span class="text-sm font-medium text-on-surface-muted">{{ $t('settings.current_version') }}</span>
        <span class="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">v{{ appVersion
        }}</span>
      </div>

      <n-button type="primary" block secondary size="large" @click="() => checkUpdate()" :loading="checkingUpdate"
        class="glass-button-primary">
        <template #icon>
          <div class="i-material-symbols-update"></div>
        </template>
        {{ $t('settings.check_update') }}
      </n-button>

      <div class="grid grid-cols-2 gap-3">
        <n-button block secondary @click="openReleasesUrl" class="glass-button">
          <template #icon>
            <div class="i-material-symbols-history"></div>
          </template>
          {{ $t('settings.releases') }}
        </n-button>
        <n-button block secondary @click="openProjectUrl" class="glass-button">
          <template #icon>
            <div class="i-carbon-logo-github"></div>
          </template>
          GitHub
        </n-button>
      </div>
    </div>

    <div v-if="updateInfo"
      class="mt-8 w-full max-w-md text-left bg-surface-panel/80 backdrop-blur-md border border-border p-5 rounded-2xl text-sm space-y-3 animate-scale-in shadow-xl">
      <div v-if="updateInfo.error" class="text-red-500 flex items-center gap-2">
        <div class="i-material-symbols-error text-xl"></div>
        {{ $t('settings.update_error', { msg: updateInfo.error }) }}
      </div>
      <div v-else-if="updateInfo.available" class="space-y-3">
        <div class="text-green-500 font-bold flex items-center gap-2 text-base">
          <div class="i-material-symbols-rocket-launch"></div>
          {{ $t('settings.update_available', { version: updateInfo.version }) }}
        </div>
        <div v-if="updateInfo.note"
          class="text-on-surface-muted text-xs whitespace-pre-wrap max-h-40 overflow-y-auto bg-surface/50 p-3 rounded-lg border border-border/50 font-mono">
          {{ updateInfo.note }}
        </div>

        <n-button type="primary" size="small" block class="glass-button-primary mt-2" @click="openReleasesUrl">
          <template #icon>
            <div class="i-material-symbols-download"></div>
          </template>
          {{ $t('settings.download_update') }}
        </n-button>

        <div class="text-xs text-on-surface-muted text-right">{{ updateInfo.date }}</div>
      </div>
      <div v-else class="text-on-surface-muted flex items-center justify-center gap-2 py-2">
        <div class="i-material-symbols-check-circle text-green-500 text-lg"></div>
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


