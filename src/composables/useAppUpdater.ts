import { ref } from 'vue'
import { useNotification, NButton } from 'naive-ui'
import { h } from 'vue'
import { useI18n } from 'vue-i18n'
import { appApi } from '@/api'
import pkg from '../../package.json'

export function useAppUpdater() {
  const appVersion = ref(pkg.version)
  const checkingUpdate = ref(false)
  const updateInfo = ref<{ 
    available: boolean, 
    version?: string, 
    date?: string, 
    note?: string, 
    error?: string 
  } | null>(null)

  const notification = useNotification()
  const { t } = useI18n()

  async function getVersion() {
    try {
      appVersion.value = await appApi.getVersion()
      return appVersion.value
    } catch (e) {
      console.warn('App API not available', e)
      return '0.0.0'
    }
  }

  async function checkUpdate(silent = false) {
    if (checkingUpdate.value) return
    checkingUpdate.value = true
    updateInfo.value = null
    
    try {
      const res = await appApi.checkUpdate()
      
      if (res.error) {
        updateInfo.value = { available: false, error: res.error }
      } else {
        updateInfo.value = {
          available: res.updateAvailable,
          version: res.version,
          date: res.releaseDate,
          note: res.releaseNotes
        }

        if (res.updateAvailable && !silent) {
          showUpdateNotification(res)
        }
      }
      return updateInfo.value
    } catch (e: any) {
      updateInfo.value = { available: false, error: e.message }
      return updateInfo.value
    } finally {
      checkingUpdate.value = false
    }
  }

  function showUpdateNotification(res: { version?: string, releaseNotes?: string, releaseDate?: string }) {
    const n = notification.info({
      title: t('settings.update_available', { version: res.version || '' }),
      content: res.releaseNotes || t('settings.tagline'),
      meta: res.releaseDate,
      action: () =>
        h(
          NButton,
          {
            secondary: true,
            type: 'primary',
            size: 'small',
            onClick: () => {
              openReleasesUrl()
              n.destroy()
            }
          },
          { default: () => t('settings.download_update') }
        )
    })
  }

  function openReleasesUrl() {
    appApi.openUrl('https://github.com/ZenEcho/LagZero/releases')
  }

  function openProjectUrl() {
    appApi.openUrl('https://github.com/ZenEcho/LagZero')
  }
  /** 打开核心文件夹 */
  function openInstallDir() {
   
  }

  return {
    appVersion,
    checkingUpdate,
    updateInfo,
    getVersion,
    checkUpdate,
    openReleasesUrl,
    openProjectUrl,
    openInstallDir
  }
}
