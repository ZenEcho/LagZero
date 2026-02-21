<template>
  <div class="h-full relative overflow-hidden bg-background text-on-surface flex transition-colors duration-300">
    <!-- Main Layout Container -->
    <div class="relative z-10 flex w-full h-full max-w-7xl mx-auto p-4 md:p-8 gap-8">

      <!-- Sidebar Navigation -->
      <SettingsSidebar v-model="activeTab" />

      <!-- Main Content Area -->
      <main
        class="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-surface-panel/40 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl relative">
        <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-8">
          <Transition name="fade-slide" mode="out-in">
            <!-- General Settings -->
            <GeneralSettings v-if="activeTab === 'general'" />

            <!-- Network Settings -->
            <NetworkSettings v-else-if="activeTab === 'network'" />

            <!-- Logs -->
            <LogsSettings v-else-if="activeTab === 'logs'" />

            <!-- About Tab -->
            <AboutSettings v-else-if="activeTab === 'about'" />
          </Transition>

          <section v-if="activeTab === 'general'"
            class="mt-8 rounded-2xl border border-error/40 bg-error/8 p-5 backdrop-blur-sm">
            <h3 class="text-lg font-bold flex items-center gap-2 text-error">
              <div class="i-material-symbols-warning-outline-rounded"></div>
              {{ $t('settings.danger_zone') }}
            </h3>
            <p class="mt-2 text-sm text-on-surface-muted">
              {{ $t('settings.reset_app_desc') }}
            </p>
            <div class="mt-4">
              <n-button type="error" strong @click="openResetDialog">
                {{ $t('settings.reset_app') }}
              </n-button>
            </div>
          </section>
        </div>
      </main>
    </div>
    <n-modal :show="showResetDialog" @update:show="onResetDialogUpdate" preset="card" class="w-[520px] max-w-[95vw]"
      :title="$t('settings.reset_app_confirm_title')" :mask-closable="false">
      <div class="space-y-3">
        <p class="text-sm text-on-surface-muted">
          {{ $t('settings.reset_app_confirm_desc', { keyword: resetKeyword }) }}
        </p>
        <n-input v-model:value="resetConfirmText"
          :placeholder="$t('settings.reset_app_confirm_placeholder', { keyword: resetKeyword })" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <n-button @click="closeResetDialog">{{ $t('common.cancel') }}</n-button>
          <n-button type="error" :loading="resetting" @click="confirmReset">
            {{ $t('settings.reset_app_confirm_button') }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useAppUpdater } from '@/composables/useAppUpdater'
import { appApi } from '@/api'
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue'
import GeneralSettings from '@/components/settings/GeneralSettings.vue'
import NetworkSettings from '@/components/settings/NetworkSettings.vue'
import LogsSettings from '@/components/settings/LogsSettings.vue'
import AboutSettings from '@/components/settings/AboutSettings.vue'

const activeTab = ref('general')
const { getVersion } = useAppUpdater()
const { t } = useI18n()
const message = useMessage()
const resetKeyword = 'RESET'
const showResetDialog = ref(false)
const resetConfirmText = ref('')
const resetting = ref(false)

onMounted(async () => {
  await getVersion()
})

function openResetDialog() {
  resetConfirmText.value = ''
  showResetDialog.value = true
}

function closeResetDialog() {
  if (resetting.value) return
  showResetDialog.value = false
}

function onResetDialogUpdate(v: boolean) {
  if (!v && resetting.value) return
  showResetDialog.value = v
}

async function confirmReset() {
  if (resetConfirmText.value.trim().toUpperCase() !== resetKeyword) {
    message.error(t('settings.reset_app_keyword_mismatch', { keyword: resetKeyword }))
    return
  }

  resetting.value = true
  try {
    await appApi.reset()
  } catch (e) {
    message.error(t('settings.reset_app_failed'))
  } finally {
    resetting.value = false
  }
}
</script>
