import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { singboxApi } from '@/api'
import { useSettingsStore } from './settings'

export type SingboxInstallerPhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'missing'
  | 'resolving'
  | 'downloading'
  | 'extracting'
  | 'completed'
  | 'failed'

export interface SingboxInstallerStatusEvent {
  phase: Exclude<SingboxInstallerPhase, 'idle'>
  installDir: string
  binaryPath: string
  version?: string
  downloadUrl?: string
  progress?: number
  error?: string
  isTimeout?: boolean
}

export interface SingboxCoreReleaseOption {
  version: string
  tagName: string
  publishedAt?: string
  channel: 'stable' | 'beta' | 'alpha'
}

export interface SingboxInstallInfo {
  exists: boolean
  installDir: string
  binaryPath: string
  installedVersion?: string
  preferredVersion: string
  isRunning: boolean
}

const ACTIVE_INSTALL_PHASES = new Set<SingboxInstallerPhase>([
  'checking',
  'resolving',
  'downloading',
  'extracting'
])

function createDefaultInstallInfo(preferredVersion = 'latest'): SingboxInstallInfo {
  return {
    exists: false,
    installDir: '',
    binaryPath: '',
    installedVersion: undefined,
    preferredVersion,
    isRunning: false
  }
}

function normalizeProgress(progress?: number) {
  return typeof progress === 'number'
    ? Math.max(0, Math.min(100, Math.floor(progress)))
    : undefined
}

export const useSingboxInstallerStore = defineStore('singbox-installer', () => {
  const settingsStore = useSettingsStore()

  const initialized = ref(false)
  const availableCoreVersions = ref<SingboxCoreReleaseOption[]>([])
  const loadingCoreVersions = ref(false)
  const versionLoadError = ref('')
  const refreshingInstallInfo = ref(false)
  const installInfo = ref<SingboxInstallInfo>(createDefaultInstallInfo(settingsStore.singboxCoreVersion))
  const phase = ref<SingboxInstallerPhase>('idle')
  const progress = ref<number | undefined>(undefined)
  const resolvedVersion = ref('')
  const downloadUrl = ref('')
  const errorMessage = ref('')
  const failedByTimeout = ref(false)
  const installCallCount = ref(0)

  let initializePromise: Promise<void> | null = null
  let refreshCoreVersionsPromise: Promise<SingboxCoreReleaseOption[]> | null = null
  let refreshInstallInfoPromise: Promise<SingboxInstallInfo> | null = null
  let installCorePromise: Promise<void> | null = null
  let statusListenerBound = false

  const isInstalling = computed(() => (
    installCallCount.value > 0 || ACTIVE_INSTALL_PHASES.has(phase.value)
  ))
  const hasInstallProgress = computed(() => (
    phase.value !== 'idle' && phase.value !== 'ready' && phase.value !== 'completed'
  ))

  watch(
    () => settingsStore.singboxCoreVersion,
    (version, prev) => {
      if (version === prev) return

      installInfo.value = {
        ...installInfo.value,
        preferredVersion: version
      }

      if (isInstalling.value) return

      downloadUrl.value = ''
      progress.value = undefined
      resolvedVersion.value = ''
      errorMessage.value = ''
      failedByTimeout.value = false
      phase.value = installInfo.value.exists ? 'ready' : 'missing'
    }
  )

  function applyInstallInfo(next: SingboxInstallInfo) {
    installInfo.value = next
  }

  function syncPhaseFromInstallInfo() {
    if (isInstalling.value) return
    phase.value = installInfo.value.exists ? 'ready' : 'missing'
  }

  function applyInstallerStatus(payload: SingboxInstallerStatusEvent) {
    phase.value = payload.phase
    resolvedVersion.value = String(payload.version || '').trim()
    downloadUrl.value = payload.downloadUrl || downloadUrl.value
    errorMessage.value = String(payload.error || '')
    failedByTimeout.value = Boolean(payload.isTimeout)
    progress.value = normalizeProgress(payload.progress)

    installInfo.value = {
      ...installInfo.value,
      installDir: payload.installDir || installInfo.value.installDir,
      binaryPath: payload.binaryPath || installInfo.value.binaryPath
    }

    if (payload.phase === 'ready' || payload.phase === 'completed') {
      installInfo.value = {
        ...installInfo.value,
        exists: true,
        installedVersion: resolvedVersion.value || installInfo.value.installedVersion
      }
      void refreshInstallInfo()
      return
    }

    if (payload.phase === 'missing') {
      installInfo.value = {
        ...installInfo.value,
        exists: false,
        installedVersion: undefined
      }
    }
  }

  function bindStatusListener() {
    if (statusListenerBound || typeof window === 'undefined' || typeof window.electron?.on !== 'function') {
      return
    }

    window.electron.on('singbox-installer-status', applyInstallerStatus)
    statusListenerBound = true
  }

  async function initialize() {
    if (initialized.value) return
    if (initializePromise) return initializePromise

    bindStatusListener()
    initializePromise = (async () => {
      try {
        await refreshInstallInfo({ syncPhase: true })
      } catch (e: any) {
        phase.value = 'failed'
        errorMessage.value = String(e?.message || e)
        throw e
      } finally {
        initialized.value = true
        initializePromise = null
      }
    })()

    return initializePromise
  }

  async function refreshCoreVersions(forceRefresh = false) {
    if (refreshCoreVersionsPromise) return refreshCoreVersionsPromise

    loadingCoreVersions.value = true
    versionLoadError.value = ''
    refreshCoreVersionsPromise = (async () => {
      try {
        const versions = await singboxApi.listCoreVersions(forceRefresh)
        availableCoreVersions.value = versions
        return versions
      } catch (e: any) {
        versionLoadError.value = String(e?.message || e || '')
        throw e
      } finally {
        loadingCoreVersions.value = false
        refreshCoreVersionsPromise = null
      }
    })()

    return refreshCoreVersionsPromise
  }

  async function refreshInstallInfo(options: { syncPhase?: boolean } = {}) {
    if (refreshInstallInfoPromise) {
      const info = await refreshInstallInfoPromise
      if (options.syncPhase) syncPhaseFromInstallInfo()
      return info
    }

    refreshingInstallInfo.value = true
    refreshInstallInfoPromise = (async () => {
      try {
        const info = await singboxApi.getInstallInfo()
        applyInstallInfo(info)
        if (options.syncPhase) syncPhaseFromInstallInfo()
        return info
      } finally {
        refreshingInstallInfo.value = false
        refreshInstallInfoPromise = null
      }
    })()

    return refreshInstallInfoPromise
  }

  async function installCore(preferredVersion?: string) {
    bindStatusListener()
    if (installCorePromise) return installCorePromise

    installCallCount.value += 1
    downloadUrl.value = ''
    progress.value = undefined
    resolvedVersion.value = ''
    errorMessage.value = ''
    failedByTimeout.value = false
    phase.value = 'checking'

    installCorePromise = (async () => {
      try {
        await singboxApi.installCore(preferredVersion)
        await refreshInstallInfo()
      } catch (e: any) {
        if (phase.value !== 'failed') {
          phase.value = 'failed'
          errorMessage.value = String(e?.message || e)
        }
        throw e
      } finally {
        installCallCount.value = Math.max(0, installCallCount.value - 1)
        installCorePromise = null
      }
    })()

    return installCorePromise
  }

  return {
    initialized,
    availableCoreVersions,
    loadingCoreVersions,
    versionLoadError,
    refreshingInstallInfo,
    installInfo,
    phase,
    progress,
    resolvedVersion,
    downloadUrl,
    errorMessage,
    failedByTimeout,
    isInstalling,
    hasInstallProgress,
    initialize,
    refreshCoreVersions,
    refreshInstallInfo,
    installCore
  }
})
