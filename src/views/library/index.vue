<template>
  <div class="p-6 h-full flex flex-col">
    <!-- Header Controls -->
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div class="flex items-center gap-4">
          <h1 class="text-xl md:text-2xl font-bold text-on-surface">{{ $t('games.library') }}</h1>
          <div class="bg-surface rounded-lg p-1 flex border border-border">
            <button @click="viewMode = 'grid'" class="p-1.5 md:p-2 rounded transition"
              :class="viewMode === 'grid' ? 'bg-primary text-on-primary' : 'text-on-surface-muted hover:text-on-surface'">
              <div class="i-carbon-grid text-sm md:text-base"></div>
            </button>
            <button @click="viewMode = 'list'" class="p-1.5 md:p-2 rounded transition"
              :class="viewMode === 'list' ? 'bg-primary text-on-primary' : 'text-on-surface-muted hover:text-on-surface'">
              <div class="i-carbon-list text-sm md:text-base"></div>
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 md:gap-4 w-full sm:w-auto">
          <div class="relative flex-1 sm:flex-none">
            <input v-model="searchQuery" type="text" :placeholder="$t('games.search_placeholder')"
              class="bg-surface border border-border rounded-full py-1.5 pl-9 pr-4 text-xs md:text-sm text-on-surface w-full sm:w-48 lg:w-64 outline-none focus:border-primary placeholder:text-on-surface-muted" />
            <div class="i-carbon-search absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted text-sm"></div>
          </div>

          <n-button round @click="scanGames" :loading="isScanning" class="shadow-sm">
            <template #icon>
              <div class="i-carbon-radar"></div>
            </template>
            <span class="hidden xs:inline">{{ isScanning ? $t('games.scanning') : $t('games.scan_local') }}</span>
            <span class="xs:hidden">{{ isScanning ? '...' : '扫描' }}</span>
          </n-button>

          <n-button type="primary" round @click="openAddModal" class="shadow-lg shadow-primary/20">
            <template #icon>
              <div class="i-carbon-add"></div>
            </template>
            <span class="hidden xs:inline">{{ $t('games.add_game') }}</span>
            <span class="xs:hidden">添加</span>
          </n-button>

          <n-button quaternary circle @click="showCategoryManager = true" :title="$t('common.manage_categories')">
            <template #icon>
              <div class="i-carbon-categories"></div>
            </template>
          </n-button>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
      <button v-for="cat in categories" :key="cat.value" @click="activeCategory = cat.value"
        class="px-4 py-1 rounded-full text-sm border transition whitespace-nowrap"
        :class="activeCategory === cat.value ? 'bg-primary border-primary text-on-primary' : 'border-border text-on-surface-muted hover:border-border-hover hover:text-on-surface'">
        {{ cat.label }}
      </button>
    </div>

    <!-- Game Grid/List -->
    <div class="flex-1 overflow-y-auto min-h-0 pr-2">
      <div v-if="filteredGames.length === 0"
        class="h-full flex flex-col items-center justify-center text-on-surface-muted">
        <div class="i-carbon-game-console text-4xl mb-2"></div>
        <p>{{ $t('games.no_games_found') }}</p>
      </div>

      <div v-else
        :class="viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'flex flex-col gap-2'">
        <div v-for="game in filteredGames" :key="game.id" @click="selectGame(game.id)"
          class="bg-surface-panel border border-transparent hover:border-primary rounded-lg cursor-pointer transition group relative"
          :class="viewMode === 'grid' ? 'p-4 flex flex-col items-center text-center' : 'p-3 flex items-center gap-4'">
          <!-- Action Buttons (Hover) -->
          <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <n-button quaternary circle size="small" @click.stop="editGame(game)" :title="$t('common.edit')">
              <template #icon>
                <div class="i-carbon-edit text-xs"></div>
              </template>
            </n-button>
            <n-button quaternary circle size="small" type="error" @click.stop="deleteGame(game)"
              :title="$t('common.delete')">
              <template #icon>
                <div class="i-carbon-trash-can text-xs"></div>
              </template>
            </n-button>
          </div>

          <div
            class="bg-surface rounded-full flex items-center justify-center text-on-surface-muted group-hover:text-primary transition"
            :class="viewMode === 'grid' ? 'w-16 h-16 text-3xl mb-3' : 'w-10 h-10 text-xl'">
            <img v-if="game.iconUrl" :src="game.iconUrl" class="w-full h-full object-cover rounded-full" />
            <div v-else class="i-carbon-game-console"></div>
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="font-bold truncate text-on-surface" :class="viewMode === 'grid' ? 'text-base' : 'text-sm'">{{
              game.name }}</h3>
            <div class="text-xs text-on-surface-muted mt-1 flex items-center justify-center gap-2"
              :class="viewMode === 'list' && '!justify-start'">
              <span class="bg-surface px-2 rounded">{{ getCategoryLabel(game.category) }}</span>
              <span v-if="game.lastPlayed" class="text-on-surface-variant">{{ formatTime(game.lastPlayed) }}</span>
            </div>
          </div>

          <div v-if="game.id === gameStore.currentGameId"
            class="text-primary text-xs font-bold flex items-center gap-1">
            <div class="w-2 h-2 rounded-full bg-primary"></div>
            {{ $t('games.selected') }}
          </div>
          <div v-else-if="runningGames.includes(game.id)"
            class="text-success text-xs font-bold flex items-center gap-1">
            <div class="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            {{ $t('games.running') }}
          </div>
        </div>
      </div>
    </div>

    <AdvancedConfigEditor v-model="showEditModal" :editing-game="editingGame" @save="handleSaveGame" />

    <CategoryManager v-model="showCategoryManager" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore, type Game } from '@/stores/games'
import { useCategoryStore } from '@/stores/categories'
import { useI18n } from 'vue-i18n'
import { useTimeAgo } from '@vueuse/core'
import { useMessage, useDialog } from 'naive-ui'
import AdvancedConfigEditor from '@/components/library/AdvancedConfigEditor.vue'
import CategoryManager from '@/components/library/CategoryManager.vue'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const router = useRouter()
const gameStore = useGameStore()
const categoryStore = useCategoryStore()

const viewMode = ref<'grid' | 'list'>('grid')
const searchQuery = ref('')
const activeCategory = ref('all')
const isScanning = ref(false)
const runningGames = computed(() => gameStore.runningGames)

const showEditModal = ref(false)
const showCategoryManager = ref(false)
const editingGame = ref<Game | null>(null)

onMounted(() => {
  categoryStore.loadCategories()
})

const categories = computed(() => {
  const list = categoryStore.categories.map(c => ({
    label: c.name,
    value: c.id
  }))
  return [{ label: '全部', value: 'all' }, ...list]
})

function getCategoryLabel(id: string) {
  const cat = categoryStore.categories.find(c => c.id === id)
  return cat?.name || '未分类'
}

const filteredGames = computed(() => {
  return gameStore.gameLibrary.filter(game => {
    const matchSearch = game.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchCat = activeCategory.value === 'all' || game.category === activeCategory.value
    return matchSearch && matchCat
  }).sort((a, b) => {
    const aRunning = runningGames.value.includes(a.id)
    const bRunning = runningGames.value.includes(b.id)
    if (aRunning !== bRunning) return aRunning ? -1 : 1

    const aTime = a.lastPlayed || 0
    const bTime = b.lastPlayed || 0
    return bTime - aTime
  })
})

async function scanGames() {
  isScanning.value = true
  try {
    const processes = await window.system.scanProcesses()
    const matched = gameStore.matchRunningGames(processes)
    if (matched.length > 0) {
      if (!gameStore.currentGame?.status || gameStore.currentGame.status === 'idle') {
      }
    }
  } finally {
    setTimeout(() => { isScanning.value = false }, 500)
  }
}

function selectGame(id: string) {
  gameStore.setCurrentGame(id)
  router.push('/dashboard')
}

function formatTime(timestamp: number) {
  return useTimeAgo(timestamp).value
}

function openAddModal() {
  editingGame.value = null
  showEditModal.value = true
}

function editGame(game: Game) {
  editingGame.value = game
  showEditModal.value = true
}

async function deleteGame(game: Game) {
  dialog.warning({
    title: t('common.delete') || '确认删除',
    content: t('games.delete_confirm') || '您确定要删除这个游戏吗？',
    positiveText: t('common.delete') || '删除',
    negativeText: t('common.cancel') || '取消',
    onPositiveClick: async () => {
      await gameStore.removeGame(game.id)
      message.success(t('common.deleted') || '已删除')
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
