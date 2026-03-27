<template>
  <!-- 正常模式：模态框 -->
  <n-modal
    :show="visible && !isMinimized"
    preset="card"
    class="w-[680px] max-w-[96vw] transition-all duration-300 ease-in-out"
    :title="t('singbox_installer.title')"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <template #header-extra>
      <n-button quaternary circle size="small" @click="isMinimized = true">
        <template #icon>
          <div class="i-material-symbols-remove text-lg"></div>
        </template>
      </n-button>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-on-surface-muted">
        {{ t('singbox_installer.description') }}
      </p>

      <div class="rounded-xl border border-border bg-surface-overlay/35 p-3 text-sm">
        <div class="font-semibold mb-2">{{ t('settings.core_version') }}</div>
        <n-select
          v-model:value="settingsStore.singboxCoreVersion"
          :options="coreVersionOptions"
          :loading="loadingCoreVersions"
          :disabled="!canChooseVersion"
          filterable
          class="glass-select"
        />
        <div class="mt-3 space-y-2 rounded-lg bg-surface/50 px-3 py-2 text-xs text-on-surface-muted">
          <div class="flex items-center justify-between gap-3">
            <span>{{ t('settings.core_target_version_label') }}</span>
            <span class="font-medium text-on-surface">{{ selectedCoreVersionText }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span>{{ t('settings.core_test_version') }}</span>
            <span class="font-medium text-on-surface">{{ testedCoreVersionText }}</span>
          </div>
        </div>
        <div v-if="versionLoadError" class="mt-2 text-xs text-warning break-words">
          {{ t('settings.core_version_fetch_failed', { error: versionLoadError }) }}
        </div>
        <div class="mt-3 flex gap-2">
          <n-button size="small" :loading="loadingCoreVersions" @click="refreshCoreVersions(true)">
            {{ t('singbox_installer.refresh_versions') }}
          </n-button>
        </div>
      </div>

      <div class="rounded-xl border border-border bg-surface-overlay/35 p-3 text-sm">
        <div class="font-semibold mb-3">{{ t('singbox_installer.resource_info') }}</div>
        <div class="space-y-3">
          <div class="rounded-lg bg-surface/50 px-3 py-2">
            <div class="mb-1 text-xs font-medium text-on-surface">{{ t('singbox_installer.download_url') }}</div>
            <div class="break-all text-xs text-on-surface-muted">{{ effectiveDownloadUrl }}</div>
          </div>
          <div class="rounded-lg bg-surface/50 px-3 py-2">
            <div class="mb-1 text-xs font-medium text-on-surface">{{ t('singbox_installer.install_dir') }}</div>
            <div class="break-all text-xs text-on-surface-muted">{{ installDir }}</div>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <n-button size="small" @click="openDownloadUrl">
            {{ t('singbox_installer.open_download_url') }}
          </n-button>
          <n-button size="small" @click="openInstallDir">
            {{ t('singbox_installer.open_install_dir') }}
          </n-button>
        </div>
      </div>

      <div class="rounded-xl border border-border bg-surface-overlay/35 p-3 text-sm">
        <div class="font-semibold mb-2">{{ t('singbox_installer.download_progress') }}</div>
        <n-progress
          v-if="typeof progress === 'number'"
          type="line"
          :percentage="progress"
          :indicator-placement="'inside'"
          processing
        />
        <div v-else class="text-on-surface-muted flex items-center gap-2">
          <n-spin size="small" />
          <span>{{ phaseText }}</span>
        </div>
        <div class="mt-2 text-xs text-on-surface-muted">
          {{ phaseText }}
        </div>
      </div>

      <div v-if="phase === 'failed'" class="rounded-xl border border-error/40 bg-error/8 p-3 text-sm text-on-surface">
        <div class="font-semibold text-error mb-2">
          {{ failedByTimeout ? t('singbox_installer.download_timeout') : t('singbox_installer.download_failed') }}
        </div>
        <div class="text-on-surface-muted break-words">
          {{ errorMessage || t('singbox_installer.auto_download_failed') }}
        </div>
        <div class="mt-2 text-on-surface-muted">
          {{ t('singbox_installer.manual_install_guide') }}
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button
          v-if="phase === 'missing' || phase === 'failed'"
          type="primary"
          :loading="ensuring"
          @click="ensureCore"
        >
          {{ downloadButtonText }}
        </n-button>
        <n-button :loading="rechecking" @click="checkAgain">
          {{ t('singbox_installer.recheck') }}
        </n-button>
      </div>
    </template>
  </n-modal>

  <!-- 最小化模式：底部悬浮窗 -->
  <Teleport to="body">
    <div v-if="visible && isMinimized" class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[5000] w-[320px]">
      <n-card
        size="small"
        class="shadow-xl border-border/50 backdrop-blur-md bg-surface-panel/95"
        :title="typeof progress === 'number' ? t('singbox_installer.downloading_percent', { percent: progress }) : phaseText"
        :bordered="true"
      >
        <template #header-extra>
          <n-button quaternary circle size="small" @click="isMinimized = false">
            <template #icon>
              <div class="i-material-symbols-open-in-full text-lg"></div>
            </template>
          </n-button>
        </template>

        <div class="flex flex-col gap-2 py-1">
          <n-progress
            v-if="typeof progress === 'number'"
            type="line"
            :percentage="progress"
            :indicator-placement="'inside'"
            processing
          />
          <div v-else-if="phase === 'failed'" class="text-error text-sm flex items-center gap-2">
            <div class="i-material-symbols-error"></div>
            <span>{{ t('singbox_installer.failed') }}</span>
          </div>
          <div v-else class="flex items-center gap-2 text-on-surface-muted text-sm">
            <n-spin size="small" />
            <span>{{ phaseText }}</span>
          </div>
        </div>
      </n-card>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMessage, type SelectGroupOption, type SelectOption } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import pkg from '../../../package.json'
import { appApi } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { useSingboxInstallerStore, type SingboxCoreReleaseOption } from '@/stores/singbox-installer'

const DEFAULT_DOWNLOAD_URL = 'https://github.com/SagerNet/sing-box/releases/latest'
const message = useMessage()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const singboxInstallerStore = useSingboxInstallerStore()
const {
  initialized,
  availableCoreVersions,
  loadingCoreVersions,
  versionLoadError,
  installInfo,
  phase,
  progress,
  downloadUrl,
  errorMessage,
  failedByTimeout,
  isInstalling: ensuring
} = storeToRefs(singboxInstallerStore)
const visible = ref(false)
const rechecking = ref(false)
const isMinimized = ref(false)
const installDir = computed(() => installInfo.value.installDir)

const latestStableCoreVersion = computed(() => (
  availableCoreVersions.value.find((release) => release.channel === 'stable')?.version
))
const coreVersionOptions = computed<Array<SelectOption | SelectGroupOption>>(() => {
  const latestLabel = latestStableCoreVersion.value
    ? t('settings.core_version_latest_with_version', { version: latestStableCoreVersion.value })
    : t('settings.core_version_latest')
  const selectedVersion = settingsStore.singboxCoreVersion
  const needsSelectedFallback = selectedVersion !== 'latest'
    && !availableCoreVersions.value.some((release) => release.version === selectedVersion)
  const grouped = {
    stable: availableCoreVersions.value.filter((release) => release.channel === 'stable'),
    beta: availableCoreVersions.value.filter((release) => release.channel === 'beta'),
    alpha: availableCoreVersions.value.filter((release) => release.channel === 'alpha')
  }

  if (needsSelectedFallback) {
    const fallbackChannel = inferReleaseChannelFromVersion(selectedVersion)
    grouped[fallbackChannel] = [
      {
        version: selectedVersion,
        tagName: `v${selectedVersion}`,
        channel: fallbackChannel
      },
      ...grouped[fallbackChannel]
    ]
  }

  return [
    { label: latestLabel, value: 'latest' },
    ...buildCoreVersionGroups(grouped)
  ]
})
const selectedCoreVersionText = computed(() => {
  if (settingsStore.singboxCoreVersion === 'latest') {
    return latestStableCoreVersion.value
      ? t('settings.core_version_latest_with_version', { version: latestStableCoreVersion.value })
      : t('settings.core_version_latest')
  }
  return `v${settingsStore.singboxCoreVersion}`
})
const testedCoreVersionText = computed(() => {
  const version = String(pkg.lagZeroTestSingboxVersion || '').trim()
  if (!version) return t('settings.core_test_version_unset')
  return version.startsWith('v') ? version : `v${version}`
})
const effectiveDownloadUrl = computed(() => {
  if (downloadUrl.value) return downloadUrl.value
  return buildReleasePageUrl(settingsStore.singboxCoreVersion)
})
const canChooseVersion = computed(() => !ensuring.value && !['resolving', 'downloading', 'extracting'].includes(phase.value))
const downloadButtonText = computed(() => (
  phase.value === 'failed'
    ? t('singbox_installer.retry_download')
    : t('singbox_installer.download_selected')
))
const phaseText = computed(() => {
  if (phase.value === 'checking') return t('singbox_installer.checking')
  if (phase.value === 'missing') return t('singbox_installer.missing')
  if (phase.value === 'resolving') return t('singbox_installer.resolving')
  if (phase.value === 'downloading') {
    return typeof progress.value === 'number'
      ? t('singbox_installer.downloading_percent', { percent: progress.value })
      : t('singbox_installer.downloading')
  }
  if (phase.value === 'extracting') return t('singbox_installer.extracting')
  if (phase.value === 'failed') return failedByTimeout.value ? t('singbox_installer.failed_timeout') : t('singbox_installer.failed')
  return t('singbox_installer.preparing')
})

function formatCoreVersionOptionLabel(version: string, publishedAt?: string) {
  if (!publishedAt) return `v${version}`
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return `v${version}`
  return `v${version} (${date.toLocaleDateString()})`
}

function inferReleaseChannelFromVersion(version: string): 'stable' | 'beta' | 'alpha' {
  const text = String(version || '').toLowerCase()
  if (text.includes('alpha')) return 'alpha'
  if (text.includes('beta') || /\brc\b/.test(text) || text.includes('preview')) return 'beta'
  return 'stable'
}

function buildCoreVersionGroups(grouped: Record<'stable' | 'beta' | 'alpha', SingboxCoreReleaseOption[]>): SelectGroupOption[] {
  const groups: Array<{ key: 'stable' | 'beta' | 'alpha', label: string }> = [
    { key: 'stable', label: t('settings.core_version_group_stable') },
    { key: 'beta', label: t('settings.core_version_group_beta') },
    { key: 'alpha', label: t('settings.core_version_group_alpha') }
  ]

  return groups.reduce<SelectGroupOption[]>((acc, group) => {
    const releases = grouped[group.key]
    if (!releases.length) return acc
    acc.push({
      type: 'group' as const,
      key: `core-${group.key}`,
      label: group.label,
      children: releases.map((release) => ({
        label: formatCoreVersionOptionLabel(release.version, release.publishedAt),
        value: release.version
      }))
    })
    return acc
  }, [])
}

function buildReleasePageUrl(version: string) {
  if (!version || version === 'latest') return DEFAULT_DOWNLOAD_URL
  return `https://github.com/SagerNet/sing-box/releases/tag/v${version}`
}

async function refreshCoreVersions(forceRefresh = false) {
  try {
    await singboxInstallerStore.refreshCoreVersions(forceRefresh)
  } catch {
    // 错误状态已同步到共享 store
  }
}

function openInstallDir() {
  void appApi.openDir(installDir.value).catch((e: any) => {
    message.error(t('singbox_installer.open_dir_failed', { error: String(e?.message || e) }))
  })
}

watch(
  () => [initialized.value, installInfo.value.exists, phase.value] as const,
  ([ready, exists, currentPhase]) => {
    if (!ready) return

    if (currentPhase === 'ready' || currentPhase === 'completed') {
      visible.value = false
      return
    }

    if (!exists || currentPhase === 'missing' || currentPhase === 'resolving' || currentPhase === 'downloading' || currentPhase === 'extracting' || currentPhase === 'failed') {
      visible.value = true
    }
  },
  { immediate: true }
)

onMounted(() => {
  void singboxInstallerStore.initialize().catch(() => {
    // 共享 store 已保存失败状态，这里只避免未处理的异步警告
  })
  void refreshCoreVersions()
})

async function ensureCore() {
  if (ensuring.value) return
  try {
    await singboxInstallerStore.installCore(settingsStore.singboxCoreVersion)
  } catch (e: any) {
    visible.value = true
  }
}

async function checkAgain() {
  if (rechecking.value) return
  rechecking.value = true
  try {
    const info = await singboxInstallerStore.refreshInstallInfo({ syncPhase: true })

    if (info.exists) {
      const restarted = await appApi.restart()
      if (!restarted) {
        message.warning(t('singbox_installer.restart_hint'))
      }
      return
    }

    phase.value = 'missing'
    message.warning(t('singbox_installer.core_not_found'))
  } catch (e: any) {
    message.error(t('singbox_installer.recheck_failed', { error: String(e?.message || e) }))
  } finally {
    rechecking.value = false
  }
}

function openDownloadUrl() {
  void appApi.openUrl(effectiveDownloadUrl.value).catch((e: any) => {
    message.error(t('singbox_installer.open_url_failed', { error: String(e?.message || e) }))
  })
}
</script>
