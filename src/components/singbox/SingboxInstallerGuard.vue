<template>
  <!-- 正常模式：模态框 -->
  <n-modal :show="visible && !isMinimized" preset="card"
    class="w-[680px] max-w-[96vw] transition-all duration-300 ease-in-out" :title="t('singbox_installer.title')"
    :closable="false" :mask-closable="false" :close-on-esc="false">
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
        <div class="font-semibold mb-2">{{ t('singbox_installer.download_url') }}</div>
        <div class="break-all text-on-surface-muted">{{ effectiveDownloadUrl }}</div>
        <div class="mt-3 flex gap-2">
          <n-button size="small" @click="openDownloadUrl">
            {{ t('singbox_installer.open_download_url') }}
          </n-button>
        </div>
      </div>

      <div class="rounded-xl border border-border bg-surface-overlay/35 p-3 text-sm">
        <div class="font-semibold mb-2">{{ t('singbox_installer.install_dir') }}</div>
        <div class="break-all text-on-surface-muted">{{ installDir }}</div>
        <div class="mt-3 flex gap-2">
          <n-button size="small" @click="openInstallDir">
            {{ t('singbox_installer.open_install_dir') }}
          </n-button>
        </div>
      </div>

      <div class="rounded-xl border border-border bg-surface-overlay/35 p-3 text-sm">
        <div class="font-semibold mb-2">{{ t('singbox_installer.download_progress') }}</div>
        <n-progress v-if="typeof progress === 'number'" type="line" :percentage="progress"
          :indicator-placement="'inside'" processing />
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
        <n-button v-if="phase === 'failed'" :loading="ensuring" @click="retryDownload">
          {{ t('singbox_installer.retry_download') }}
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
      <n-card size="small" class="shadow-xl border-border/50 backdrop-blur-md bg-surface-panel/95"
        :title="typeof progress === 'number' ? t('singbox_installer.downloading_percent', { percent: progress }) : phaseText"
        :bordered="true">
        <template #header-extra>
          <n-button quaternary circle size="small" @click="isMinimized = false">
            <template #icon>
              <div class="i-material-symbols-open-in-full text-lg"></div>
            </template>
          </n-button>
        </template>

        <div class="flex flex-col gap-2 py-1">
          <n-progress v-if="typeof progress === 'number'" type="line" :percentage="progress"
            :indicator-placement="'inside'" processing />
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { appApi, singboxApi } from '@/api'

type InstallerPhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'missing'
  | 'resolving'
  | 'downloading'
  | 'extracting'
  | 'completed'
  | 'failed'

interface InstallerStatusEvent {
  phase: Exclude<InstallerPhase, 'idle'>
  installDir: string
  binaryPath: string
  version?: string
  downloadUrl?: string
  progress?: number
  error?: string
  isTimeout?: boolean
}

const DEFAULT_DOWNLOAD_URL = 'https://github.com/SagerNet/sing-box/releases/latest'
const message = useMessage()
const { t } = useI18n()
const visible = ref(false)
const phase = ref<InstallerPhase>('idle')
const progress = ref<number | undefined>(undefined)
const installDir = ref('')
const binaryPath = ref('')
const downloadUrl = ref('')
const errorMessage = ref('')
const failedByTimeout = ref(false)
const ensuring = ref(false)
const rechecking = ref(false)
const coreReadyLock = ref(false)
const isMinimized = ref(false)

const effectiveDownloadUrl = computed(() => downloadUrl.value || DEFAULT_DOWNLOAD_URL)
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

const onInstallerStatus = (payload: InstallerStatusEvent) => {
  if (coreReadyLock.value) {
    visible.value = false
    return
  }

  phase.value = payload.phase
  installDir.value = payload.installDir || installDir.value
  binaryPath.value = payload.binaryPath || binaryPath.value
  downloadUrl.value = payload.downloadUrl || downloadUrl.value
  errorMessage.value = payload.error || ''
  failedByTimeout.value = Boolean(payload.isTimeout)
  progress.value = typeof payload.progress === 'number'
    ? Math.max(0, Math.min(100, Math.floor(payload.progress)))
    : undefined

  if (payload.phase === 'ready' || payload.phase === 'completed') {
    markCoreReady()
    return
  }

  if (payload.phase === 'missing' || payload.phase === 'resolving' || payload.phase === 'downloading' || payload.phase === 'extracting' || payload.phase === 'failed') {
    visible.value = true
  }
}
const openInstallDir = () => {
  void appApi.openDir(installDir.value).catch((e: any) => {
    message.error(t('singbox_installer.open_dir_failed', { error: String(e?.message || e) }))
  })
}
onMounted(async () => {
  window.electron.on('singbox-installer-status', onInstallerStatus)
  try {
    const info = await singboxApi.getInstallInfo()
    installDir.value = info.installDir
    binaryPath.value = info.binaryPath

    if (!info.exists) {
      phase.value = 'missing'
      visible.value = true
      void ensureCore()
    } else {
      markCoreReady()
    }
  } catch (e: any) {
    visible.value = true
    phase.value = 'failed'
    errorMessage.value = String(e?.message || e)
  }
})

onUnmounted(() => {
  window.electron.off('singbox-installer-status', onInstallerStatus)
})

async function ensureCore() {
  if (ensuring.value) return
  ensuring.value = true
  try {
    await singboxApi.ensureCoreInstalled()
  } catch (e: any) {
    if (phase.value !== 'failed') {
      phase.value = 'failed'
      errorMessage.value = String(e?.message || e)
    }
    visible.value = true
  } finally {
    ensuring.value = false
  }
}

async function checkAgain() {
  if (rechecking.value) return
  rechecking.value = true
  try {
    const info = await singboxApi.getInstallInfo()
    installDir.value = info.installDir
    binaryPath.value = info.binaryPath

    if (info.exists) {
      markCoreReady()
      const restarted = await appApi.restart()
      if (!restarted) {
        message.warning(t('singbox_installer.restart_hint'))
      }
      return
    }

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

function retryDownload() {
  phase.value = 'missing'
  errorMessage.value = ''
  void ensureCore()
}

function markCoreReady() {
  coreReadyLock.value = true
  visible.value = false
  phase.value = 'ready'
}
</script>
