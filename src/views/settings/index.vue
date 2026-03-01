<template>
  <div class="h-full relative overflow-hidden bg-background text-on-surface flex transition-colors duration-300">
    <!-- Main Layout Container -->
    <div class="relative z-10 flex w-full h-full max-w-[1400px] mx-auto py-6 px-4 md:p-8 lg:p-10 gap-6 lg:gap-8">

      <!-- Sidebar Navigation -->
      <SettingsSidebar v-model="activeTab" class="w-48 lg:w-60 shrink-0" />

      <!-- Main Content Area -->
      <main
        class="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-surface-panel/40 backdrop-blur-xl border border-border/50 rounded-[2rem] shadow-xl relative">
        <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6 md:p-10 lg:p-12">
          <div class="mx-auto w-full max-w-[860px] min-h-full flex flex-col">
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

            <section v-if="activeTab === 'general'" class="mt-8">
              <h2 class="text-xs font-bold uppercase tracking-widest text-error mb-3 pl-1">
                {{ $t('settings.danger_zone') }}
              </h2>
              <div
                class="bg-error/5 border border-error/20 rounded-2xl flex flex-col divide-y divide-error/10 backdrop-blur-sm overflow-hidden shadow-sm">
                <div
                  class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-error/10 transition-colors">
                  <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error shrink-0">
                      <div class="i-material-symbols-warning-outline-rounded text-xl"></div>
                    </div>
                    <div>
                      <div class="font-bold text-sm text-error">{{ $t('settings.reset_app') }}</div>
                      <div class="text-xs text-error/70 mt-0.5 line-clamp-2 max-w-sm">{{ $t('settings.reset_app_desc')
                        }}
                      </div>
                    </div>
                  </div>
                  <div class="shrink-0 flex items-center">
                    <n-button type="error" strong @click="openResetDialog" class="w-full sm:w-auto">
                      {{ $t('settings.reset_app') }}
                    </n-button>
                  </div>
                </div>
              </div>
            </section>
          </div>
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
