<template>
  <div class="h-screen w-screen flex flex-col bg-background text-on-surface overflow-hidden">
    <!-- Title Bar (Drag Region) -->
    <div
      class="h-12 flex-shrink-0 flex items-center justify-between px-4 z-50 select-none app-drag-region bg-surface/80 backdrop-blur-md border-b border-border">
      <div class="text-xs font-bold text-on-surface-variant flex items-center gap-2">
        <img src="/logo.svg" alt="LagZero" class="h-6">
        <span class="text-lg font-bold text-on-surface">LagZero</span>
      </div>
      <div class="flex gap-1 no-drag items-center">
        <ThemeToggle />
        <div class="w-[1px] h-4 bg-border mx-2"></div>
        <button @click="minimize"
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition">
          <div class="i-material-symbols-remove text-lg"></div>
        </button>
        <button @click="maximize"
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition">
          <div class="i-material-symbols-crop-square text-lg"></div>
        </button>
        <button @click="close"
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-error hover:text-white text-on-surface-variant transition">
          <div class="i-material-symbols-close text-lg"></div>
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Sidebar -->
      <aside
        class="bg-surface-panel flex flex-col pt-4 z-40 border-r border-border transition-all duration-300 ease-in-out"
        :class="isCollapsed ? 'w-16 items-center' : 'w-64'" @wheel="handleSidebarWheel">
        <div class="flex-1 flex flex-col gap-2 px-2 w-full">
          <!-- Navigation Items -->
          <router-link to="/dashboard" active-class="bg-primary/10 text-primary"
            class="flex items-center gap-3 p-2 rounded-lg text-on-surface-muted hover:bg-surface hover:text-on-surface transition-colors h-10"
            :class="[
              isCollapsed ? 'justify-center w-10 mx-auto' : 'w-full',
              $route.path === '/dashboard' ? 'text-primary' : ''
            ]" :title="isCollapsed ? $t('common.dashboard') : ''">
            <div class="i-material-symbols-dashboard text-xl flex-shrink-0"></div>
            <span v-if="!isCollapsed"
              class="text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300">{{
                $t('common.dashboard') }}</span>
          </router-link>

          <router-link to="/games" active-class="bg-primary/10 text-primary"
            class="flex items-center gap-3 p-2 rounded-lg text-on-surface-muted hover:bg-surface hover:text-on-surface transition-colors h-10"
            :class="[
              isCollapsed ? 'justify-center w-10 mx-auto' : 'w-full',
              $route.path === '/games' ? 'text-primary' : ''
            ]" :title="isCollapsed ? $t('games.library') : ''">
            <div class="i-material-symbols-sports-esports text-xl flex-shrink-0"></div>
            <span v-if="!isCollapsed"
              class="text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300">{{
                $t('games.library') }}</span>
          </router-link>

          <router-link to="/nodes" active-class="bg-primary/10 text-primary"
            class="flex items-center gap-3 p-2 rounded-lg text-on-surface-muted hover:bg-surface hover:text-on-surface transition-colors h-10"
            :class="[
              isCollapsed ? 'justify-center w-10 mx-auto' : 'w-full',
              $route.path === '/nodes' ? 'text-primary' : ''
            ]" :title="isCollapsed ? $t('common.nodes') : ''">
            <div class="i-material-symbols-dns text-xl flex-shrink-0"></div>
            <span v-if="!isCollapsed"
              class="text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300">{{
                $t('common.nodes') }}</span>
          </router-link>

          <router-link to="/settings" active-class="bg-primary/10 text-primary"
            class="flex items-center gap-3 p-2 rounded-lg text-on-surface-muted hover:bg-surface hover:text-on-surface transition-colors h-10"
            :class="[
              isCollapsed ? 'justify-center w-10 mx-auto' : 'w-full',
              $route.path === '/settings' ? 'text-primary' : ''
            ]" :title="isCollapsed ? $t('common.settings') : ''">
            <div class="i-material-symbols-settings text-xl flex-shrink-0"></div>
            <span v-if="!isCollapsed"
              class="text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300">{{
                $t('common.settings') }}</span>
          </router-link>
        </div>

        <!-- Bottom Toggle Button -->
        <div class="p-2 w-full border-t border-border mt-auto">
          <button @click="toggleSidebar"
            class="flex items-center gap-3 p-2 rounded-lg text-on-surface-muted hover:bg-surface hover:text-on-surface transition-colors w-full h-10"
            :class="isCollapsed ? 'justify-center w-10 mx-auto' : ''" :title="$t('common.collapse')">
            <div class="i-material-symbols-menu-open text-xl transform transition-transform duration-300"
              :class="isCollapsed ? 'rotate-180' : ''"></div>
            <span v-if="!isCollapsed" class="text-sm font-medium whitespace-nowrap overflow-hidden">{{
              $t('common.collapse') }}</span>
          </button>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 flex flex-col h-full relative overflow-hidden bg-background">
        <router-view v-slot="{ Component }">
          <transition name="slide-fade" mode="out-in">
            <component :is="Component" class="h-full overflow-hidden" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const { width } = useWindowSize()
const isCollapsed = ref(true)
const $route = useRoute()
const router = useRouter()

// 屏幕宽度小于 1024px 时自动收起侧边栏
watchEffect(() => {
  if (width.value < 1024) {
    isCollapsed.value = true
  }
})

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}

function handleSidebarWheel(e: WheelEvent) {
  // Only handle if current route is dashboard, games or nodes
  if (!['/dashboard', '/games', '/nodes'].includes($route.path)) return

  if (e.deltaY > 0) {
    // Scroll Down -> Go to next page
    if ($route.path === '/dashboard') {
      router.push('/games')
    } else if ($route.path === '/games') {
      router.push('/nodes')
    }
  } else {
    // Scroll Up -> Go to prev page
    if ($route.path === '/games') {
      router.push('/dashboard')
    } else if ($route.path === '/nodes') {
      router.push('/games')
    }
  }
}

// @ts-ignore
const minimize = () => window.electron.minimize()
// @ts-ignore
const maximize = () => window.electron.maximize()
// @ts-ignore
const close = () => window.electron.close()
</script>

<style>
.slide-fade-enter-active {
  transition: all 0.2s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(10px);
  opacity: 0;
}
</style>
