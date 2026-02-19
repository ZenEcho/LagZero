<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('common.edit') : $t('games.add_game')" class="w-[500px]" :mask-closable="false">
    <n-form ref="formRef" label-placement="top" :model="form">
      <n-form-item :label="$t('games.name')">
        <n-input v-model:value="form.name" placeholder="例如：英雄联盟" />
      </n-form-item>

      <n-form-item :label="$t('games.process_name')">
        <ProcessSelector v-model="processNames" mode="single" />
      </n-form-item>

      <n-form-item :label="$t('games.icon')">
        <IconSelector v-model="form.iconUrl" :name="form.name" />
      </n-form-item>

      <n-form-item :label="$t('games.category')">
        <n-radio-group v-model:value="form.category">
          <n-radio-button v-for="cat in categories" :key="cat" :value="cat" :label="cat.toUpperCase()" />
        </n-radio-group>
      </n-form-item>
    </n-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" @click="save" :disabled="!form.name || !processNames">
          {{ $t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>

</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Game } from '@/types'
import { GAME_CATEGORIES } from '@/constants'
import IconSelector from '@/components/common/IconSelector.vue'
import ProcessSelector from '@/components/common/ProcessSelector.vue'

const props = defineProps<{
  modelValue: boolean
  editingGame?: Game | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', game: Omit<Game, 'id'> | Game): void
}>()

const isEdit = computed(() => !!props.editingGame)

const categories = GAME_CATEGORIES

const form = ref<Omit<Game, 'id'>>({
  name: '',
  iconUrl: '',
  processName: '',
  category: 'other',
  lastPlayed: 0
})

const processNames = computed({
  get: () => {
    if (Array.isArray(form.value.processName)) {
      return form.value.processName.join(', ')
    }
    return form.value.processName || ''
  },
  set: (val: string) => {
    const names = val.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    form.value.processName = names.length > 1 ? names : (names[0] || '')
  }
})

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.editingGame) {
      form.value = JSON.parse(JSON.stringify(props.editingGame))
    } else {
      form.value = {
        name: '',
        iconUrl: '',
        processName: '',
        category: 'other',
        lastPlayed: 0
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

function save() {
  if (!form.value.name) return

  if (props.editingGame) {
    emit('save', { ...form.value, id: props.editingGame.id })
  } else {
    emit('save', form.value)
  }
  close()
}
</script>
