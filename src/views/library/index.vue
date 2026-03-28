<template>
  <div class="p-6 h-full flex flex-col">
    <!-- Header Controls -->
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div class="flex items-center gap-4 shrink-0">
          <h1 class="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3 whitespace-nowrap">
            {{ $t('games.library') }}
            <span
              class="text-sm font-normal text-on-surface-muted bg-surface-overlay px-2 py-0.5 rounded-full border border-border/50 font-mono">{{
                gameStore.gameLibrary.length }}</span>
          </h1>
          <div class="bg-surface rounded-lg p-1 flex border border-border">
            <button @click="setViewMode('grid')" class="p-1.5 md:p-2  rounded transition"
              :class="viewMode === 'grid' ? 'bg-primary text-on-primary' : 'text-on-surface-muted hover:text-on-surface'">
              <div class="i-carbon-grid text-sm md:text-base"></div>
            </button>
            <button @click="setViewMode('list')" class="p-1.5 md:p-2 rounded transition"
              :class="viewMode === 'list' ? 'bg-primary text-on-primary' : 'text-on-surface-muted hover:text-on-surface'">
              <div class="i-carbon-list text-sm md:text-base"></div>
            </button>
          </div>
        </div>

        <div ref="headerActionsRef"
          class="flex items-center gap-2 md:gap-4 w-full sm:flex-1 sm:min-w-0 sm:justify-end sm:flex-nowrap">
          <div class="relative flex-1 min-w-[150px]"
            :class="headerActionsCompact ? 'sm:max-w-[160px]' : 'sm:max-w-[240px] lg:max-w-[320px]'">
            <input v-model="searchQuery" type="text" :placeholder="$t('games.search_placeholder')"
              class="bg-surface border border-border rounded-full py-1.5 pl-9 pr-4 text-xs md:text-sm text-on-surface w-full outline-none focus:border-primary placeholder:text-on-surface-muted" />
            <div class="i-carbon-search absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted text-sm"></div>
          </div>

          <div v-if="isScanning" class="text-xs text-on-surface-muted italic truncate absolute top-0 max-w-sm"
            :title="scanProgressText">
            {{ scanProgressText }}
          </div>

          <n-popover trigger="hover" placement="bottom-end" :show-arrow="false">
            <template #trigger>
              <n-button :round="!utilityButtonsIconOnly" :circle="utilityButtonsIconOnly" @click="handleScanClick"
                :loading="isScanning" class="shadow-sm shrink-0"
                :title="utilityButtonsIconOnly ? $t('games.scan_local') : undefined">
                <template #icon>
                  <div class="i-carbon-radar"></div>
                </template>
                <template v-if="!utilityButtonsIconOnly">
                  <span class="hidden xs:inline ">{{ isScanning ? $t('games.scanning') : $t('games.scan_local')
                  }}</span>
                  <span class="xs:hidden">{{ isScanning ? '...' : $t('games.scan') }}</span>
                </template>
                <span v-if="!utilityButtonsIconOnly"
                  class="hidden xl:inline-flex ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-overlay border border-border/50 text-on-surface-muted">
                  {{ scanSourceSummary }}
                </span>
              </n-button>
            </template>

            <div class="w-[280px] p-1 flex flex-col gap-3">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <div class="text-xs font-bold text-on-surface">{{ $t('games.scan_scope') }}</div>
                  <div class="text-[11px] leading-5 text-on-surface-muted">{{ $t('games.scan_scope_desc') }}</div>
                </div>
                <n-tag size="small" :bordered="false" type="info">
                  {{ $t('games.scan_scope_selected_count', { count: activeScanSources.length }) }}
                </n-tag>
              </div>

              <div class="flex items-center gap-2">
                <button
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors bg-surface-overlay/60 border-border/50 text-on-surface hover:border-primary/50 hover:text-primary"
                  @click.stop="selectAllScanSources">
                  {{ $t('games.scan_select_all') }}
                </button>
                <button
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors bg-surface-overlay/60 border-border/50 text-on-surface hover:border-primary/50 hover:text-primary"
                  @click.stop="selectLocalScanSourceOnly">
                  {{ $t('games.scan_select_local_only') }}
                </button>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <button v-for="option in scanSourceOptions" :key="option.value"
                  class="px-3 py-2 rounded-xl border text-left transition-all duration-200"
                  :class="activeScanSourceSet.has(option.value)
                    ? 'border-primary bg-primary/10 text-primary shadow-[0_8px_18px_-14px_rgba(var(--rgb-primary),0.6)]'
                    : 'border-border/60 bg-surface-overlay/40 text-on-surface-muted hover:border-primary/40 hover:text-on-surface'" @click.stop="toggleScanSource(option.value)">
                  <div class="flex items-center gap-2">
                    <div class="text-sm"
                      :class="activeScanSourceSet.has(option.value) ? 'i-carbon-checkbox-checked-filled' : 'i-carbon-checkbox'">
                    </div>
                    <span class="text-xs font-semibold">{{ option.label }}</span>
                  </div>
                </button>
              </div>
            </div>
          </n-popover>

          <n-button :round="!utilityButtonsIconOnly" :circle="utilityButtonsIconOnly" secondary
            @click="toggleSelectionMode" class="shadow-sm shrink-0"
            :title="utilityButtonsIconOnly ? (selectionMode ? $t('common.cancel') : $t('games.batch_manage')) : undefined">
            <template #icon>
              <div :class="selectionMode ? 'i-carbon-close' : 'i-carbon-checkbox-indeterminate'"></div>
            </template>
            <template v-if="!utilityButtonsIconOnly">
              <span class="hidden xs:inline">{{ selectionMode ? $t('common.cancel') : $t('games.batch_manage') }}</span>
              <span class="xs:hidden">{{ selectionMode ? $t('common.cancel') : $t('games.batch') }}</span>
            </template>
          </n-button>

          <n-button type="primary" :round="!headerActionsCompact" :circle="headerActionsCompact" @click="openAddModal"
            class="shadow-lg shadow-primary/20 shrink-0"
            :title="headerActionsCompact ? $t('games.add_game') : undefined">
            <template #icon>
              <div class="i-carbon-add"></div>
            </template>
            <template v-if="!headerActionsCompact">
              <span class="hidden xs:inline ">{{ $t('games.add_game') }}</span>
              <span class="xs:hidden">{{ $t('common.add') }}</span>
            </template>
          </n-button>

          <n-button quaternary circle @click="showCategoryManager = true" :title="$t('common.categories')"
            class="shrink-0">
            <template #icon>
              <div class="i-carbon-categories"></div>
            </template>
          </n-button>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
      <button v-for="cat in categories" :key="cat.value" @click="activeCategory = cat.value"
        class="px-4 py-1.5 rounded-full  text-sm border transition whitespace-nowrap font-medium"
        :class="activeCategory === cat.value ? 'bg-primary border-primary text-on-primary shadow-md shadow-primary/20 ' : 'bg-surface border-border text-on-surface-muted hover:border-primary/50 hover:text-on-surface '">
        {{ cat.label }}
      </button>
    </div>

    <div v-if="selectionMode"
      class="mb-6 rounded-2xl border border-border/60 bg-surface/70 px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shadow-sm">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-primary/12 text-primary flex items-center justify-center">
          <div class="i-carbon-checkbox-indeterminate text-xl"></div>
        </div>
        <div class="min-w-0">
          <div class="text-sm font-bold text-on-surface">{{ $t('games.batch_selected', {
            count: selectedGameIds.length
          }) }}
          </div>
          <div class="text-xs text-on-surface-muted">{{ $t('games.batch_selected_hint') }}</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <n-button size="small" secondary @click="toggleVisibleSelection">
          {{ allVisibleSelected ? $t('games.batch_deselect_all_visible') : $t('games.batch_select_all_visible') }}
        </n-button>
        <n-button size="small" secondary @click="clearGameSelection" :disabled="selectedGameIds.length === 0">
          {{ $t('games.batch_clear_selection') }}
        </n-button>
        <n-button size="small" type="error" @click="deleteSelectedGames" :disabled="selectedGameIds.length === 0">
          {{ $t('games.batch_delete') }}
        </n-button>
      </div>
    </div>

    <div v-if="acceleratingGame"
      class="mb-6 rounded-xl border border-success/20 bg-gradient-to-r from-success/10 to-transparent p-4 flex items-center justify-between shadow-sm backdrop-blur-sm relative overflow-hidden group">
      <div class="absolute inset-0 bg-success/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="flex items-center gap-4 relative z-10">
        <div class="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success">
          <div class="i-carbon-rocket text-xl animate-pulse"></div>
        </div>
        <div>
          <div class="text-xs text-success/80 font-bold uppercase tracking-wider mb-0.5 ">{{
            $t('games.accelerating_now') }}
          </div>
          <div class="text-lg font-bold text-on-surface flex items-center gap-2 ">
            {{ acceleratingGame.name }}
            <n-tag size="small" type="success" :bordered="false" class="text-xs ">
              {{ acceleratingGame.latency ? acceleratingGame.latency + ' ms' : $t('common.connected') }}
            </n-tag>
          </div>
        </div>
      </div>
      <n-button type="error" size="small" secondary round @click="stopAcceleration(acceleratingGame.id!)"
        :loading="gameStore.operationState === 'stopping'" :disabled="isActionPending">
        {{ $t('common.stop_acceleration') }}
      </n-button>
    </div>

    <!-- Game Grid/List -->
    <div class="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
      <div v-if="filteredGames.length === 0"
        class="h-full flex flex-col items-center justify-center text-on-surface-muted">
        <div class="i-carbon-game-console text-6xl mb-4 opacity-50"></div>
        <p class="text-lg ">{{ $t('games.no_games_found') }}</p>
      </div>

      <div v-else class="mt-1"
        :class="viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 ' : 'flex flex-col gap-2'">
        <div v-for="game in filteredGames" :key="game.id" @click="game.id && handleGameClick(game)"
          class="group relative bg-surface border rounded-xl transition-all duration-300 overflow-hidden hover:shadow-[0_12px_28px_-12px_rgba(var(--rgb-primary),0.4)] "
          :class="[
            selectionMode
              ? (isGameSelectable(game) ? 'cursor-pointer hover:border-primary/50' : 'opacity-60 cursor-not-allowed border-border')
              : (isAccelerationLockedFor(game) ? 'opacity-50 grayscale cursor-not-allowed border-border' : 'cursor-pointer hover:border-primary/50'),
            isGameSelected(game)
              ? 'border-primary bg-primary/5 shadow-[0_0_18px_rgba(var(--rgb-primary),0.12)] ring-1 ring-primary/30'
              : (game.status === 'accelerating' ? 'border-success shadow-[0_0_15px_rgba(var(--rgb-success),0.2)] ring-1 ring-success/30' : 'border-border/50'),
            viewMode === 'grid' ? 'flex flex-col' : 'flex items-center p-3 gap-4'
          ]">

          <button v-if="selectionMode"
            class="absolute top-2 left-2 z-20 w-8 h-8 rounded-full border flex items-center justify-center transition-colors backdrop-blur-md"
            :class="isGameSelected(game)
              ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/30'
              : (isGameSelectable(game)
                ? 'bg-overlay/45 text-white/85 border-white/25 hover:bg-overlay/65'
                : 'bg-surface/80 text-on-surface-muted border-border/60 cursor-not-allowed')"
            :title="isGameSelected(game) ? $t('games.batch_unselect_game') : $t('games.batch_select_game')"
            @click.stop="toggleGameSelection(game)">
            <div :class="isGameSelected(game) ? 'i-carbon-checkbox-checked-filled' : 'i-carbon-checkbox'"
              class="text-lg">
            </div>
          </button>

          <!-- Grid View Image Area -->
          <div v-if="viewMode === 'grid'" class="aspect-[16/9] relative bg-surface-variant/50 overflow-hidden ">
            <!-- Background Image/Icon -->
            <div
              class="absolute inset-0 flex items-center justify-center transition-transform duration-700 group-hover:scale-110"
              :style="!game.iconUrl ? getFallbackStyle(game.name) : {}">
              <div v-if="!game.iconUrl" class="absolute inset-0 bg-overlay/20 pointer-events-none"></div>

              <img v-if="game.iconUrl" :src="game.iconUrl" class="w-full h-full object-cover relative " />
              <div v-else
                class="relative z-10 text-2xl font-black text-white/90 drop-shadow-md tracking-wider px-2 text-center">
                {{ getFallbackText(game.name) }}</div>
            </div>

            <!-- Gradient Overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent opacity-80"></div>

            <!-- Hover Overlay with Actions -->
            <div
              class="absolute inset-0 bg-overlay/55 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-[2px]"
              v-if="!selectionMode && !isAccelerationLockedFor(game)">
              <template v-if="game.status !== 'accelerating'">
                <button
                  class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-110 transition shadow-lg shadow-primary/40"
                  @click.stop="tryStartGame(game)" :title="$t('common.start_acceleration')" :disabled="isActionPending">
                  <div class="i-carbon-play-filled text-xl"></div>
                </button>
                <button
                  class="w-8 h-8 rounded-full bg-surface text-on-surface hover:text-primary flex items-center justify-center hover:scale-110 transition"
                  @click.stop="editGame(game)" :title="$t('common.settings')">
                  <div class="i-carbon-settings"></div>
                </button>
                <button
                  class="w-8 h-8 rounded-full bg-surface text-on-surface hover:text-error flex items-center justify-center hover:scale-110 transition"
                  @click.stop="deleteGame(game)" :title="$t('common.delete')">
                  <div class="i-carbon-trash-can"></div>
                </button>
              </template>
              <template v-else>
                <n-button type="error" round class="shadow-lg font-bold px-6" @click.stop="stopAcceleration(game.id!)"
                  :disabled="isActionPending" :loading="gameStore.operationState === 'stopping'">
                  {{ $t('common.stop_acceleration') }}
                </n-button>
              </template>
            </div>

            <!-- Status Badge (Top Right) -->
            <div class="absolute top-2 right-2 flex gap-1">
              <div v-if="game.status === 'accelerating'"
                class="px-2 py-0.5 rounded text-[10px] font-bold bg-success text-on-success shadow-sm flex items-center gap-1">
                <div class="w-1.5 h-1.5 bg-white rounded-full animate-pulse "></div>
                {{ $t('games.accelerating') }}
              </div>
              <div class="px-2 py-0.5 rounded text-[10px] font-bold shadow-sm uppercase backdrop-blur-md"
                :class="game.proxyMode === 'routing' ? 'bg-info/20 text-info border border-info/30' : 'bg-warning/20 text-warning border border-warning/30'">
                {{ game.proxyMode === 'routing' ? $t('games.mode_routing') : $t('games.mode_process') }}
              </div>
            </div>
          </div>

          <!-- List View Image -->
          <div v-else
            class="w-12 h-12 rounded-lg bg-surface-variant/50 flex-shrink-0 overflow-hidden relative group-hover:ring-2 ring-primary/20 flex items-center justify-center"
            :style="!game.iconUrl ? getFallbackStyle(game.name) : {}">
            <div v-if="!game.iconUrl" class="absolute inset-0 bg-overlay/20 pointer-events-none"></div>

            <img v-if="game.iconUrl" :src="game.iconUrl" class="w-full h-full object-cover absolute inset-0 z-10" />
            <div v-else class="relative z-10 text-white font-bold text-xl drop-shadow-sm">{{ getFallbackText(game.name,
              true) }}</div>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0" :class="viewMode === 'grid' ? 'p-3' : ''">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-bold text-on-surface truncate " :class="viewMode === 'grid' ? 'text-base' : 'text-sm'">
                {{ game.name }}
              </h3>
              <!-- List View Badges -->
              <div v-if="viewMode === 'list'" class="flex gap-2">
                <n-tag size="small" :type="game.proxyMode === 'routing' ? 'info' : 'warning'" :bordered="false"
                  class="text-[10px] h-5">
                  {{ game.proxyMode === 'routing' ? $t('games.mode_routing') : $t('games.mode_process') }}
                </n-tag>
                <n-tag v-if="game.status === 'accelerating'" type="success" size="small" :bordered="false" class="h-5">
                  {{ $t('games.accelerating') }}
                </n-tag>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-on-surface-muted gap-2">
              <div class="flex items-center gap-2 min-w-0 overflow-hidden ">
                <template v-for="tag in getVisibleTags(game)" :key="`${game.id || game.name}-tag-${tag}`">
                  <n-popover v-if="shouldUseTagPopover(tag)" trigger="hover" placement="top">
                    <template #trigger>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-medium max-w-[120px] truncate cursor-help"
                        :class="isPlatformTag(tag) ? 'bg-primary/20 text-primary' : 'bg-surface-variant text-on-surface-muted'">
                        {{ tag }}
                      </span>
                    </template>
                    <span>{{ tag }}</span>
                  </n-popover>
                  <span v-else class="px-1.5 py-0.5 rounded text-[10px] font-medium max-w-[120px] truncate"
                    :class="isPlatformTag(tag) ? 'bg-primary/20 text-primary' : 'bg-surface-variant text-on-surface-muted'">
                    {{ tag }}
                  </span>
                </template>
                <n-popover v-if="getHiddenTagCount(game) > 0" trigger="hover" placement="top">
                  <template #trigger>
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-variant text-on-surface-muted cursor-help">
                      +{{ getHiddenTagCount(game) }}
                    </span>
                  </template>
                  <div class="max-w-64 flex flex-wrap gap-1.5">
                    <span v-for="tag in getDisplayTags(game)" :key="`${game.id || game.name}-all-tag-${tag}`"
                      class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      :class="isPlatformTag(tag) ? 'bg-primary/20 text-primary' : 'bg-surface-variant text-on-surface-muted'">
                      {{ tag }}
                    </span>
                  </div>
                </n-popover>
                <span v-if="game.lastPlayed" class="truncate"
                  :class="viewMode === 'grid' ? ' absolute bottom-[56px]  right-2' : ''">
                  <n-time :time="game.lastPlayed" format="yy-MM-dd hh:mm" /></span>
              </div>

              <div v-if="game.status === 'accelerating' && game.latency !== undefined"
                class="font-mono text-success font-bold ">
                {{ game.latency }} ms
              </div>
            </div>
          </div>

          <!-- List View Actions -->
          <div v-if="viewMode === 'list' && !selectionMode"
            class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity px-2">
            <template v-if="game.status !== 'accelerating'">
              <n-button circle type="primary" size="small" @click.stop="tryStartGame(game)" :disabled="isActionPending">
                <template #icon>
                  <div class="i-carbon-play-filled"></div>
                </template>
              </n-button>
              <n-button circle quaternary size="small" @click.stop="editGame(game)" :title="$t('common.settings')">
                <template #icon>
                  <div class="i-carbon-settings"></div>
                </template>
              </n-button>
              <n-button circle quaternary size="small" @click.stop="deleteGame(game)" :title="$t('common.delete')">
                <template #icon>
                  <div class="i-carbon-trash-can"></div>
                </template>
              </n-button>
            </template>
            <n-button v-else type="error" size="small" round @click.stop="stopAcceleration(game.id!)"
              :loading="gameStore.operationState === 'stopping'" :disabled="isActionPending">
              {{ $t('common.stop_acceleration') }}
            </n-button>
          </div>

        </div>
      </div>
    </div>

    <GameEditModal v-model="showEditModal" :editing-game="editingGame" @save="handleSaveGame" />
    <CategoryManager v-model="showCategoryManager" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore, type Game } from '@/stores/games'
import { useCategoryStore } from '@/stores/categories'
import { useI18n } from 'vue-i18n'
import { useMessage, useDialog } from 'naive-ui'
import type { LocalScanGame } from '@/types'
import { useLocalStorage, useWindowSize } from '@vueuse/core'
import { PLATFORMS, SCAN_SOURCES, type GameScanSource } from '@/constants'
import GameEditModal from '@/components/library/GameEditModal.vue'
import CategoryManager from '@/components/library/CategoryManager.vue'
import { useGameScanner } from '@/composables/useGameScanner'

const fallbackGradients = [
  'linear-gradient(135deg, #ff416c, #ff4b2b)',
  'linear-gradient(135deg, #f12711, #f5af19)',
  'linear-gradient(135deg, #f7971e, #ffd200)',
  'linear-gradient(135deg, #11998e, #38ef7d)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #8a4fff, #733dd9)'
]

function getFallbackStyle(name: string) {
  if (!name) return { background: fallbackGradients[0], color: 'white' }
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % fallbackGradients.length
  return {
    background: fallbackGradients[index],
    color: 'white'
  }
}

function getFallbackText(name: string, isList = false) {
  if (!name) return '?'
  if (isList) return name.substring(0, 1).toUpperCase()
  return name.length > 8 ? name.substring(0, 8) + '...' : name
}

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const router = useRouter()
const { width: windowWidth } = useWindowSize()
const gameStore = useGameStore()
const categoryStore = useCategoryStore()

type LibraryViewMode = 'grid' | 'list'

function normalizeLibraryViewMode(value: unknown): LibraryViewMode {
  return value === 'list' ? 'list' : 'grid'
}

const viewMode = useLocalStorage<LibraryViewMode | string>('games-library-view-mode', 'grid')
viewMode.value = normalizeLibraryViewMode(viewMode.value)
const searchQuery = ref('')
const activeCategory = ref('all')
const { isScanning, scanProgressText, scanGames } = useGameScanner()
const runningGames = computed(() => gameStore.runningGames)
const acceleratingGame = computed(() => gameStore.getAcceleratingGame())
const isActionPending = computed(() => gameStore.operationState !== 'idle')
const headerActionsRef = ref<HTMLElement | null>(null)
const headerActionsCompact = ref(false)
const selectionMode = ref(false)
const selectedGameIds = ref<string[]>([])
const selectedScanSources = useLocalStorage<GameScanSource[]>('games-scan-sources', [...SCAN_SOURCES])

const showEditModal = ref(false)
const showCategoryManager = ref(false)
const editingGame = ref<Game | null>(null)
const platformTags = new Set<LocalScanGame['source']>(PLATFORMS)
const maxTagDisplayWidth = 200
const tagMaxWidth = 120
const tagTextFont = '500 10px sans-serif'
const tagPaddingX = 12
const tagGap = 8
const tagPopoverThreshold = 72

const tagMeasureContext = typeof document !== 'undefined'
  ? document.createElement('canvas').getContext('2d')
  : null
const scanSourceLabelKeyMap: Record<GameScanSource, string> = {
  Steam: 'games.scan_source_steam',
  Microsoft: 'games.scan_source_microsoft',
  Epic: 'games.scan_source_epic',
  EA: 'games.scan_source_ea',
  BattleNet: 'games.scan_source_battlenet',
  WeGame: 'games.scan_source_wegame',
  Local: 'games.scan_source_local'
}

let headerActionsResizeObserver: ResizeObserver | null = null
let headerCompactMeasureToken = 0

onMounted(() => {
  categoryStore.loadCategories()
  initHeaderActionsObserver()
  scheduleHeaderCompactModeSync()
})

onBeforeUnmount(() => {
  headerActionsResizeObserver?.disconnect()
  headerActionsResizeObserver = null
})

watch(selectedScanSources, (value) => {
  const normalized = normalizeScanSources(value)
  if (normalized.length !== value.length || normalized.some((source, index) => source !== value[index])) {
    selectedScanSources.value = normalized
  }
}, { immediate: true })

watch(() => gameStore.gameLibrary.map(game => String(game.id || '')).join('|'), () => {
  const validIds = new Set(gameStore.gameLibrary.map(game => String(game.id || '')).filter(Boolean))
  selectedGameIds.value = selectedGameIds.value.filter(id => validIds.has(id))
}, { immediate: true })

const categories = computed(() => {
  const list = categoryStore.categories.map((c: any) => ({
    label: c.name,
    value: c.id
  }))
  return [{ label: t('common.all'), value: 'all' }, ...list]
})

const categoryNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const c of categoryStore.categories) {
    map.set(String(c.id), String(c.name || '').trim())
  }
  return map
})

const selectedGameIdSet = computed(() => new Set(selectedGameIds.value))
const activeScanSources = computed(() => normalizeScanSources(selectedScanSources.value))
const activeScanSourceSet = computed(() => new Set(activeScanSources.value))
const scanSourceOptions = computed(() => SCAN_SOURCES.map(source => ({
  value: source,
  label: getScanSourceLabel(source)
})))
const utilityButtonsIconOnly = computed(() => windowWidth.value < 1000 || headerActionsCompact.value)
const scanSourceSummary = computed(() => {
  if (activeScanSources.value.length === SCAN_SOURCES.length) return t('games.scan_scope_all')
  if (activeScanSources.value.length === 0) return t('games.scan_scope_none')
  if (activeScanSources.value.length <= 2) {
    return activeScanSources.value.map(source => getScanSourceLabel(source)).join(' / ')
  }
  return t('games.scan_scope_selected_count', { count: activeScanSources.value.length })
})

watch(viewMode, (value) => {
  const normalized = normalizeLibraryViewMode(value)
  if (value !== normalized) {
    viewMode.value = normalized
  }
}, { immediate: true })

watch(
  () => [selectionMode.value, isScanning.value, scanSourceSummary.value].join('|'),
  () => {
    scheduleHeaderCompactModeSync()
  },
  { immediate: true }
)

function getGameCategoryIds(game: Game): string[] {
  if (Array.isArray(game.categories) && game.categories.length > 0) {
    return game.categories.map(c => String(c)).filter(Boolean)
  }
  return game.category ? [String(game.category)] : []
}

function isPlatformTag(tag: string): boolean {
  return platformTags.has(tag as LocalScanGame['source'])
}

function getDisplayTags(game: Game): string[] {
  const categoryTags = getGameCategoryIds(game)
    .map((id) => categoryNameMap.value.get(String(id)) || '')
    .map((name) => String(name || '').trim())
    .filter(Boolean)
  const customTags = Array.isArray(game.tags) ? game.tags.map(t => String(t || '').trim()).filter(Boolean) : []
  return Array.from(new Set([...categoryTags, ...customTags]))
}

function getVisibleTags(game: Game): string[] {
  const tags = getDisplayTags(game)
  let usedWidth = 0
  const visible: string[] = []

  for (const tag of tags) {
    const tagWidth = getTagWidth(tag)
    const nextWidth = usedWidth + (visible.length > 0 ? tagGap : 0) + tagWidth
    if (nextWidth > maxTagDisplayWidth) break
    visible.push(tag)
    usedWidth = nextWidth
  }

  if (visible.length === 0 && tags.length > 0 && tags[0]) {
    return [tags[0]!]
  }

  return visible
}
/** */
function getHiddenTagCount(game: Game): number {
  return Math.max(getDisplayTags(game).length - getVisibleTags(game).length, 0)
}

function shouldUseTagPopover(tag: string): boolean {
  return getTagWidth(tag) > tagPopoverThreshold
}

function getTagWidth(tag: string): number {
  const text = String(tag || '')
  if (tagMeasureContext) {
    tagMeasureContext.font = tagTextFont
    const measured = Math.ceil(tagMeasureContext.measureText(text).width)
    return Math.min(measured + tagPaddingX, tagMaxWidth)
  }
  const estimated = Math.ceil(text.length * 6)
  return Math.min(estimated + tagPaddingX, tagMaxWidth)
}

const filteredGames = computed(() => {
  return gameStore.gameLibrary.filter((game: Game) => {
    const matchSearch = game.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchCat = activeCategory.value === 'all' || getGameCategoryIds(game).includes(activeCategory.value)
    return matchSearch && matchCat
  }).sort((a: Game, b: Game) => {
    const aAccelerating = a.status === 'accelerating'
    const bAccelerating = b.status === 'accelerating'
    if (aAccelerating !== bAccelerating) return aAccelerating ? -1 : 1

    const aRunning = a.id ? runningGames.value.includes(a.id) : false
    const bRunning = b.id ? runningGames.value.includes(b.id) : false
    if (aRunning !== bRunning) return aRunning ? -1 : 1

    const aTime = a.lastPlayed || 0
    const bTime = b.lastPlayed || 0
    return bTime - aTime
  })
})
const selectableVisibleGames = computed(() => filteredGames.value.filter(game => isGameSelectable(game)))
const allVisibleSelected = computed(() =>
  selectableVisibleGames.value.length > 0
  && selectableVisibleGames.value.every(game => !!game.id && selectedGameIdSet.value.has(String(game.id)))
)

function initHeaderActionsObserver() {
  if (typeof ResizeObserver === 'undefined') return
  headerActionsResizeObserver?.disconnect()
  if (!headerActionsRef.value) return
  headerActionsResizeObserver = new ResizeObserver(() => {
    scheduleHeaderCompactModeSync()
  })
  headerActionsResizeObserver.observe(headerActionsRef.value)
}

function isHeaderActionsOverflowing(): boolean {
  const element = headerActionsRef.value
  if (!element) return false
  return element.scrollWidth - element.clientWidth > 4
}

function scheduleHeaderCompactModeSync() {
  const token = ++headerCompactMeasureToken
  void syncHeaderCompactMode(token)
}

async function syncHeaderCompactMode(token: number) {
  await nextTick()
  if (token !== headerCompactMeasureToken) return

  if (headerActionsCompact.value) {
    headerActionsCompact.value = false
    await nextTick()
    if (token !== headerCompactMeasureToken) return
  }

  headerActionsCompact.value = isHeaderActionsOverflowing()
}

function normalizeScanSources(value: unknown): GameScanSource[] {
  const selected = new Set(
    (Array.isArray(value) ? value : [])
      .map(source => String(source || '').trim())
      .filter(Boolean)
  )
  return SCAN_SOURCES.filter(source => selected.has(source))
}

function getScanSourceLabel(source: GameScanSource): string {
  return t(scanSourceLabelKeyMap[source])
}

function setViewMode(mode: LibraryViewMode) {
  viewMode.value = normalizeLibraryViewMode(mode)
}

function toggleScanSource(source: GameScanSource) {
  const next = activeScanSourceSet.value.has(source)
    ? activeScanSources.value.filter(item => item !== source)
    : [...activeScanSources.value, source]
  selectedScanSources.value = normalizeScanSources(next)
}

function selectAllScanSources() {
  selectedScanSources.value = [...SCAN_SOURCES]
}

function selectLocalScanSourceOnly() {
  selectedScanSources.value = ['Local']
}

async function handleScanClick() {
  if (isScanning.value) return
  if (activeScanSources.value.length === 0) {
    message.warning(t('games.scan_source_required'))
    return
  }
  await scanGames(activeScanSources.value)
}

function isGameSelectable(game: Game) {
  return !!game.id && game.status !== 'accelerating'
}

function isGameSelected(game: Game) {
  return !!game.id && selectedGameIdSet.value.has(String(game.id))
}

function clearGameSelection() {
  selectedGameIds.value = []
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    clearGameSelection()
  }
}

function toggleGameSelection(game: Game) {
  if (!selectionMode.value || !isGameSelectable(game) || !game.id) return
  const id = String(game.id)
  if (selectedGameIdSet.value.has(id)) {
    selectedGameIds.value = selectedGameIds.value.filter(selectedId => selectedId !== id)
    return
  }
  selectedGameIds.value = [...selectedGameIds.value, id]
}

function selectAllVisibleGames() {
  const nextIds = selectableVisibleGames.value
    .map(game => String(game.id || ''))
    .filter(Boolean)
  selectedGameIds.value = Array.from(new Set([...selectedGameIds.value, ...nextIds]))
}

function clearVisibleSelection() {
  const visibleIds = new Set(
    selectableVisibleGames.value
      .map(game => String(game.id || ''))
      .filter(Boolean)
  )
  selectedGameIds.value = selectedGameIds.value.filter(id => !visibleIds.has(id))
}

function toggleVisibleSelection() {
  if (allVisibleSelected.value) {
    clearVisibleSelection()
    return
  }
  selectAllVisibleGames()
}

function selectGame(id: string) {
  const ok = gameStore.setCurrentGame(id)
  if (!ok) {
    const name = acceleratingGame.value?.name || t('games.current_game')
    message.warning(t('games.switching_warning', { name }))
    return
  }
  router.push('/dashboard')
}

function tryStartGame(game: Game) {
  if (isActionPending.value) return
  if (game.id) selectGame(game.id)
}

function handleGameClick(game: Game) {
  if (selectionMode.value) {
    toggleGameSelection(game)
    return
  }
  if (game.status === 'accelerating') {
    router.push('/dashboard')
  } else {
    tryStartGame(game)
  }
}

async function stopAcceleration(id: string) {
  if (isActionPending.value) return
  try {
    await gameStore.stopGame(id)
    message.success(t('games.stopped_acceleration'))
  } catch (e) {
    message.error(t('games.stop_failed'))
  }
}

function isAccelerationLockedFor(game: Game) {
  const active = acceleratingGame.value
  return !!active && game.id !== active.id
}


function openAddModal() {
  editingGame.value = null
  showEditModal.value = true
}

function editGame(game: Game) {
  editingGame.value = game
  showEditModal.value = true
}

async function deleteSelectedGames() {
  if (selectedGameIds.value.length === 0) {
    message.warning(t('games.batch_select_games_first'))
    return
  }

  const count = selectedGameIds.value.length
  dialog.warning({
    title: t('games.batch_delete'),
    content: t('games.batch_delete_confirm', { count }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    positiveButtonProps: {
      type: 'error'
    },
    onPositiveClick: async () => {
      await gameStore.removeGames(selectedGameIds.value)
      toggleSelectionMode()
      message.success(t('games.batch_delete_success', { count }))
    }
  })
}

async function deleteGame(game: Game) {
  dialog.warning({
    title: t('common.delete'),
    content: t('games.delete_confirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    positiveButtonProps: {
      type: 'error'
    },
    onPositiveClick: async () => {
      if (game.id) await gameStore.removeGame(game.id)
      message.success(t('common.deleted'))
    }
  })
}

async function handleSaveGame(gameData: Game | Omit<Game, 'id'>) {
  if ('id' in gameData) {
    await gameStore.updateGame(gameData as Game)
  } else {
    const newGame = {
      ...gameData,
      id: Date.now().toString(36),
      latency: 0,
      status: 'idle'
    } as Game
    await gameStore.addGame(newGame)
  }
}
</script>
