<template>
  <n-modal
    :show="modelValue"
    @update:show="$emit('update:modelValue', $event)"
    preset="card"
    :title="isEdit ? $t('nodes.edit_node') : $t('nodes.add_node')"
    class="w-[500px]"
    :mask-closable="false"
  >
    <n-form
      ref="formRef"
      label-placement="top"
      :model="form"
    >
      <n-form-item :label="$t('nodes.tag')">
        <n-input 
          v-model:value="form.tag" 
          :placeholder="$t('nodes.tag_placeholder')"
        />
      </n-form-item>

      <n-form-item :label="$t('nodes.type')">
        <n-select
          v-model:value="form.type"
          :options="[
            { label: 'VMess', value: 'vmess' },
            { label: 'VLESS', value: 'vless' },
            { label: 'Shadowsocks', value: 'shadowsocks' },
            { label: 'Trojan', value: 'trojan' }
          ]"
        />
      </n-form-item>

      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2">
          <n-form-item :label="$t('nodes.server')">
            <n-input 
              v-model:value="form.server" 
              :placeholder="$t('nodes.server_placeholder')"
            />
          </n-form-item>
        </div>
        <div>
          <n-form-item :label="$t('nodes.port')">
            <n-input-number 
              v-model:value="form.server_port" 
              :placeholder="$t('nodes.port_placeholder')"
              :show-button="false"
            />
          </n-form-item>
        </div>
      </div>

      <template v-if="form.type && ['vmess', 'vless', 'trojan'].includes(form.type)">
        <n-form-item :label="$t('nodes.uuid')">
          <n-input 
            v-model:value="form.uuid" 
            :placeholder="$t('nodes.uuid_placeholder')"
          />
        </n-form-item>
      </template>

      <template v-else-if="form.type === 'shadowsocks'">
        <n-form-item :label="$t('nodes.password')">
          <n-input 
            v-model:value="form.password" 
            :placeholder="$t('nodes.password_placeholder')"
          />
        </n-form-item>
        <n-form-item :label="$t('nodes.method')">
          <n-input 
            v-model:value="form.method" 
            :placeholder="$t('nodes.method_placeholder')"
          />
        </n-form-item>
      </template>

      <template v-if="form.type && ['vmess', 'vless'].includes(form.type)">
        <n-form-item :label="$t('nodes.network')">
          <n-select
            v-model:value="form.network"
            :options="[
              { label: 'TCP', value: 'tcp' },
              { label: 'WebSocket', value: 'ws' },
              { label: 'gRPC', value: 'grpc' }
            ]"
          />
        </n-form-item>
      </template>
    </n-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button 
          type="primary" 
          @click="save" 
          :disabled="!canSave"
        >
          {{ $t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useMessage } from 'naive-ui'
import type { NodeConfig } from '@/utils/protocol'
import { normalizeNodeType } from '@/utils/protocol'

const props = defineProps<{
  modelValue: boolean
  editingNode?: NodeConfig | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', node: Omit<NodeConfig, 'id'> | NodeConfig): void
}>()

const message = useMessage()
const isEdit = computed(() => !!props.editingNode)

const form = ref<Partial<NodeConfig>>({
  tag: '',
  type: 'vmess',
  server: '',
  server_port: 443,
  uuid: '',
  password: '',
  method: 'aes-256-gcm',
  network: 'tcp'
})

const canSave = computed(() => {
  const tag = String(form.value.tag ?? '').trim()
  const server = String(form.value.server ?? '').trim()
  const port = form.value.server_port
  const type = form.value.type

  if (!tag) return false
  if (!server) return false
  if (typeof port !== 'number' || !Number.isFinite(port) || port <= 0) return false
  if (!type) return false

  if (normalizeNodeType(type) === 'shadowsocks') {
    const password = String(form.value.password ?? '').trim()
    const method = String(form.value.method ?? '').trim()
    return !!password && !!method
  }

  return true
})

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.editingNode) {
      form.value = {
        ...props.editingNode,
        type: normalizeNodeType(props.editingNode.type) || 'vmess'
      }
    } else {
      form.value = {
        tag: '',
        type: 'vmess',
        server: '',
        server_port: 443,
        uuid: '',
        password: '',
        method: 'aes-256-gcm',
        network: 'tcp'
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

function save() {
  if (!canSave.value) {
    message.error('请把必填项填写完整后再保存')
    return
  }

  const tag = String(form.value.tag ?? '').trim()
  const server = String(form.value.server ?? '').trim()
  const serverPort = form.value.server_port as number

  emit('save', {
    ...form.value,
    type: normalizeNodeType(form.value.type as string) || 'vmess',
    tag,
    server,
    server_port: serverPort
  } as any)
  close()
}
</script>
