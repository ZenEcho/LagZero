<template>
  <div class="h-full relative overflow-hidden bg-background text-on-surface flex transition-colors duration-300">
    <!-- Ambient Background Effects -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        class="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] animate-pulse-slow">
      </div>
      <div
        class="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-secondary/5 rounded-full blur-[80px] animate-pulse-slow"
        style="animation-delay: 2s;"></div>
    </div>

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
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppUpdater } from '@/composables/useAppUpdater'
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue'
import GeneralSettings from '@/components/settings/GeneralSettings.vue'
import NetworkSettings from '@/components/settings/NetworkSettings.vue'
import LogsSettings from '@/components/settings/LogsSettings.vue'
import AboutSettings from '@/components/settings/AboutSettings.vue'

const activeTab = ref('general')
const { getVersion } = useAppUpdater()

onMounted(async () => {
  await getVersion()
})
</script>

