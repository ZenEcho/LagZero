<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('nodes.edit_node') : $t('nodes.add_node')" class="w-[640px]" :mask-closable="false">
    <n-form label-placement="top" :model="form">
      <n-form-item :label="$t('nodes.tag')">
        <n-input v-model:value="form.tag" :placeholder="$t('nodes.tag_placeholder')" />
      </n-form-item>

      <n-form-item :label="$t('nodes.type')">
        <n-select v-model:value="form.type" :options="typeOptions" />
      </n-form-item>

      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2">
          <n-form-item :label="$t('nodes.server')">
            <n-input v-model:value="form.server" :placeholder="$t('nodes.server_placeholder')" />
          </n-form-item>
        </div>
        <div>
          <n-form-item :label="$t('nodes.port')">
            <n-input-number v-model:value="form.server_port" :placeholder="$t('nodes.port_placeholder')"
              :show-button="false" class="w-full" />
          </n-form-item>
        </div>
      </div>

      <template v-if="isVmess || isVless">
        <n-form-item :label="$t('nodes.uuid_label')">
          <n-input v-model:value="form.uuid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </n-form-item>
      </template>

      <template v-if="isTrojan">
        <n-form-item :label="$t('nodes.password')">
          <n-input v-model:value="form.password" :placeholder="$t('nodes.password_placeholder')" />
        </n-form-item>
      </template>

      <template v-if="isSocks || isHttp">
        <div class="grid grid-cols-2 gap-4">
          <n-form-item :label="$t('nodes.username')">
            <n-input v-model:value="form.username" :placeholder="$t('common.optional')" />
          </n-form-item>
          <n-form-item :label="$t('nodes.password')">
            <n-input v-model:value="form.password" :placeholder="$t('common.optional')" />
          </n-form-item>
        </div>
      </template>

      <template v-if="isShadowsocks">
        <n-form-item :label="$t('nodes.password')">
          <n-input v-model:value="form.password" :placeholder="$t('nodes.password_placeholder')" />
        </n-form-item>
        <n-form-item :label="$t('nodes.method')">
          <n-select v-model:value="form.method" :options="ssMethodOptions" filterable tag
            placeholder="aes-256-gcm / chacha20-ietf-poly1305" />
        </n-form-item>
        <n-form-item :label="$t('nodes.plugin')">
          <n-input v-model:value="form.plugin" :placeholder="`v2ray-plugin / obfs-local (${$t('common.optional')})`" />
        </n-form-item>
        <n-form-item :label="$t('nodes.plugin_opts')">
          <n-input v-model:value="form.plugin_opts"
            :placeholder="`mode=websocket;host=example.com (${$t('common.optional')})`" />
        </n-form-item>
      </template>

      <template v-if="isCoreProxy">
        <n-divider class="!my-2">{{ $t('nodes.transport') }}</n-divider>
        <n-form-item :label="$t('nodes.network')">
          <n-select v-model:value="form.network" :options="networkOptions" />
        </n-form-item>

        <template v-if="form.network === 'ws'">
          <div class="grid grid-cols-2 gap-4">
            <n-form-item :label="$t('nodes.ws_host')">
              <n-input v-model:value="form.host" :placeholder="`example.com (${$t('common.optional')})`" />
            </n-form-item>
            <n-form-item :label="$t('nodes.ws_path')">
              <n-input v-model:value="form.path" placeholder="/ws" />
            </n-form-item>
          </div>
        </template>

        <template v-if="form.network === 'grpc'">
          <n-form-item :label="$t('nodes.grpc_service')">
            <n-input v-model:value="form.service_name" placeholder="service-name" />
          </n-form-item>
        </template>
      </template>

      <template v-if="isCoreProxy">
        <n-divider class="!my-2">{{ $t('nodes.security') }}</n-divider>

        <n-form-item v-if="isVless" :label="$t('nodes.security_mode')">
          <n-select v-model:value="form.security" :options="vlessSecurityOptions" />
        </n-form-item>

        <n-form-item v-if="isVmess" :label="$t('nodes.cipher')">
          <n-select v-model:value="form.security" :options="vmessCipherOptions" />
        </n-form-item>

        <n-form-item v-if="isVless" :label="$t('nodes.flow')">
          <n-select v-model:value="form.flow" :options="vlessFlowOptions" clearable />
        </n-form-item>

        <n-form-item v-if="isVless" :label="$t('nodes.packet_encoding')">
          <n-select v-model:value="form.packet_encoding" :options="packetEncodingOptions" clearable />
        </n-form-item>

        <n-form-item :label="$t('nodes.tls')">
          <n-switch :value="!!form.tls?.enabled" @update:value="setTlsEnabled" />
        </n-form-item>

        <template v-if="form.tls?.enabled">
          <div class="grid grid-cols-2 gap-4">
            <n-form-item :label="$t('nodes.sni')">
              <n-input v-model:value="form.tls!.server_name" placeholder="example.com" />
            </n-form-item>
            <n-form-item :label="$t('nodes.allow_insecure')">
              <n-switch :value="!!form.tls!.insecure" @update:value="setTlsInsecure" />
            </n-form-item>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <n-form-item :label="$t('nodes.alpn')">
              <n-input v-model:value="form.alpn" placeholder="h2,http/1.1" />
            </n-form-item>
            <n-form-item :label="$t('nodes.fingerprint')">
              <n-select v-model:value="form.fingerprint" :options="fingerprintOptions" filterable clearable
                placeholder="chrome / safari / firefox" />
            </n-form-item>
          </div>
        </template>

        <template v-if="isVless && form.security === 'reality'">
          <n-divider class="!my-2">{{ $t('nodes.reality') }}</n-divider>
          <div class="grid grid-cols-2 gap-4">
            <n-form-item :label="$t('nodes.public_key')">
              <n-input v-model:value="form.tls!.reality!.public_key" :placeholder="$t('nodes.reality_placeholder')" />
            </n-form-item>
            <n-form-item :label="$t('nodes.short_id')">
              <n-input v-model:value="form.tls!.reality!.short_id" :placeholder="$t('common.optional')" />
            </n-form-item>
          </div>
        </template>
      </template>
    </n-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" @click="save" :disabled="!canSave">
          {{ $t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
const message = useMessage()
const isEdit = computed(() => !!props.editingNode)

const typeOptions = [
  { label: 'VMess', value: 'vmess' },
  { label: 'VLESS', value: 'vless' },
  { label: 'Shadowsocks', value: 'shadowsocks' },
  { label: 'Trojan', value: 'trojan' },
  { label: 'SOCKS', value: 'socks' },
  { label: 'HTTP', value: 'http' }
]

const networkOptions = [
  { label: 'TCP', value: 'tcp' },
  { label: 'WebSocket', value: 'ws' },
  { label: 'gRPC', value: 'grpc' }
]

const ssMethodOptions = [
  { label: t('common.none'), value: 'none' },
  { label: 'aes-128-gcm', value: 'aes-128-gcm' },
  { label: 'aes-256-gcm', value: 'aes-256-gcm' },
  { label: 'chacha20-ietf-poly1305', value: 'chacha20-ietf-poly1305' },
  { label: 'xchacha20-ietf-poly1305', value: 'xchacha20-ietf-poly1305' },
  { label: '2022-blake3-aes-128-gcm', value: '2022-blake3-aes-128-gcm' },
  { label: '2022-blake3-aes-256-gcm', value: '2022-blake3-aes-256-gcm' },
  { label: '2022-blake3-chacha20-poly1305', value: '2022-blake3-chacha20-poly1305' }
]

const vmessCipherOptions = computed(() => [
  { label: t('common.auto'), value: 'auto' },
  { label: 'aes-128-gcm', value: 'aes-128-gcm' },
  { label: 'chacha20-poly1305', value: 'chacha20-poly1305' },
  { label: t('common.none'), value: 'none' }
])

const vlessSecurityOptions = computed(() => [
  { label: t('common.none'), value: 'none' },
  { label: 'tls', value: 'tls' },
  { label: 'reality', value: 'reality' }
])

const vlessFlowOptions = [
  { label: 'xtls-rprx-vision', value: 'xtls-rprx-vision' },
  { label: 'xtls-rprx-vision-udp443', value: 'xtls-rprx-vision-udp443' }
]

const packetEncodingOptions = [
  { label: 'packetaddr', value: 'packetaddr' },
  { label: 'xudp', value: 'xudp' }
]

const fingerprintOptions = [
  { label: 'chrome', value: 'chrome' },
  { label: 'safari', value: 'safari' },
  { label: 'firefox', value: 'firefox' },
  { label: 'edge', value: 'edge' }
]

function createDefaultForm(): Partial<NodeConfig> {
  return {
    tag: '',
    type: 'vmess',
    server: '',
    server_port: 443,
    uuid: '',
    password: '',
    method: 'aes-256-gcm',
    network: 'tcp',
    security: 'auto',
    path: '',
    host: '',
    service_name: '',
    flow: '',
    packet_encoding: '',
    username: '',
    alpn: '',
    fingerprint: '',
    tls: {
      enabled: false,
      server_name: '',
      insecure: false,
      utls: {
        enabled: false,
        fingerprint: 'chrome'
      },
      reality: {
        enabled: false,
        public_key: '',
        short_id: ''
      }
    }
  }
}

const form = ref<Partial<NodeConfig>>(createDefaultForm())

const normalizedType = computed(() => normalizeNodeType(form.value.type as string))
const isVmess = computed(() => normalizedType.value === 'vmess')
const isVless = computed(() => normalizedType.value === 'vless')
const isTrojan = computed(() => normalizedType.value === 'trojan')
const isShadowsocks = computed(() => normalizedType.value === 'shadowsocks')
const isSocks = computed(() => normalizedType.value === 'socks')
const isHttp = computed(() => normalizedType.value === 'http')
const isCoreProxy = computed(() => isVmess.value || isVless.value || isTrojan.value)

const canSave = computed(() => {
  const tag = String(form.value.tag ?? '').trim()
  const server = String(form.value.server ?? '').trim()
  const port = form.value.server_port
  const type = normalizedType.value

  if (!tag || !server || !type) return false
  if (typeof port !== 'number' || !Number.isFinite(port) || port <= 0) return false

  if (type === 'vmess' || type === 'vless') {
    if (!String(form.value.uuid ?? '').trim()) return false
  }
  if (type === 'trojan') {
    if (!String(form.value.password ?? '').trim()) return false
  }
  if (type === 'shadowsocks') {
    if (!String(form.value.password ?? '').trim()) return false
    if (!String(form.value.method ?? '').trim()) return false
  }
  if (type === 'vless' && form.value.security === 'reality') {
    if (!String(form.value.tls?.reality?.public_key ?? '').trim()) return false
  }
  return true
})

watch(() => props.modelValue, (val) => {
  if (!val) return
  if (props.editingNode) {
    const editing = props.editingNode
    form.value = {
      ...createDefaultForm(),
      ...editing,
      type: normalizeNodeType(editing.type) || 'vmess',
      tls: {
        ...createDefaultForm().tls!,
        ...(editing.tls || {}),
        utls: {
          ...createDefaultForm().tls!.utls!,
          ...(editing.tls?.utls || {})
        },
        reality: {
          ...createDefaultForm().tls!.reality!,
          ...(editing.tls?.reality || {})
        }
      }
    }
  } else {
    form.value = createDefaultForm()
  }
  applyTypeDefaults()
})

watch(() => form.value.type, () => {
  applyTypeDefaults()
})

watch(() => form.value.security, (security) => {
  if (!isVless.value) return
  if (security === 'tls' || security === 'reality') {
    setTlsEnabled(true)
  }
  if (security === 'reality') {
    ensureTls()
    form.value.tls!.reality!.enabled = true
  } else if (form.value.tls?.reality) {
    form.value.tls.reality.enabled = false
  }
})

function applyTypeDefaults() {
  const type = normalizedType.value
  if (isCoreProxy.value && (!form.value.network || form.value.network === '')) {
    form.value.network = 'tcp'
  }
  if (type === 'vmess' && !form.value.security) {
    form.value.security = 'auto'
  }
  if (type === 'vless' && !form.value.security) {
    form.value.security = 'none'
  }
  if (type === 'trojan') {
    if (!form.value.security || form.value.security === 'none') form.value.security = 'tls'
    setTlsEnabled(true)
  }
  if (type === 'socks' || type === 'http') {
    ensureTls()
    form.value.tls!.enabled = false
    form.value.security = undefined
    form.value.network = undefined
  }
}

function ensureTls() {
  if (!form.value.tls) {
    form.value.tls = {
      enabled: false,
      server_name: '',
      insecure: false,
      utls: { enabled: false, fingerprint: 'chrome' },
      reality: { enabled: false, public_key: '', short_id: '' }
    }
  }
  if (!form.value.tls.utls) form.value.tls.utls = { enabled: false, fingerprint: 'chrome' }
  if (!form.value.tls.reality) form.value.tls.reality = { enabled: false, public_key: '', short_id: '' }
}

function setTlsEnabled(enabled: boolean) {
  ensureTls()
  form.value.tls!.enabled = enabled
}

function setTlsInsecure(enabled: boolean) {
  ensureTls()
  form.value.tls!.insecure = enabled
}

function close() {
  emit('update:modelValue', false)
}

function save() {
  if (!canSave.value) {
    message.error(t('common.fill_required'))
    return
  }

  const type = normalizeNodeType(form.value.type as string) || 'vmess'
  const payload: any = {
    ...form.value,
    type,
    tag: String(form.value.tag ?? '').trim(),
    server: String(form.value.server ?? '').trim(),
    server_port: Number(form.value.server_port || 0),
    uuid: String(form.value.uuid ?? '').trim() || undefined,
    password: String(form.value.password ?? '').trim() || undefined,
    method: String(form.value.method ?? '').trim() || undefined,
    plugin: String(form.value.plugin ?? '').trim() || undefined,
    plugin_opts: String(form.value.plugin_opts ?? '').trim() || undefined,
    path: String(form.value.path ?? '').trim() || undefined,
    host: String(form.value.host ?? '').trim() || undefined,
    service_name: String(form.value.service_name ?? '').trim() || undefined,
    flow: String(form.value.flow ?? '').trim() || undefined,
    packet_encoding: String(form.value.packet_encoding ?? '').trim() || undefined,
    username: String(form.value.username ?? '').trim() || undefined,
    alpn: String(form.value.alpn ?? '').trim() || undefined,
    fingerprint: String(form.value.fingerprint ?? '').trim() || undefined
  }

  if (!payload.tls?.enabled) {
    payload.tls = { enabled: false }
  } else {
    payload.tls = {
      ...payload.tls,
      server_name: String(payload.tls.server_name ?? '').trim() || undefined,
      insecure: !!payload.tls.insecure,
      utls: payload.fingerprint
        ? { enabled: true, fingerprint: payload.fingerprint }
        : undefined,
      reality: payload.security === 'reality'
        ? {
          enabled: true,
          public_key: String(payload.tls?.reality?.public_key ?? '').trim() || undefined,
          short_id: String(payload.tls?.reality?.short_id ?? '').trim() || undefined
        }
        : undefined
    }
  }

  emit('save', payload)
  close()
}
</script>
