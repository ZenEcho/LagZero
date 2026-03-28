<template>
  <n-modal :show="modelValue" @update:show="$emit('update:modelValue', $event)" preset="card"
    :title="isEdit ? $t('nodes.edit_node') : $t('nodes.add_node')" class="w-[640px]" :mask-closable="false">
    <div v-if="editBlockedReason"
      class="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
      {{ editBlockedReason }}
    </div>

    <div :class="editBlockedReason ? 'pointer-events-none opacity-60' : ''">
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

      <template v-if="supportsServerPortRanges">
        <div class="grid grid-cols-2 gap-4">
          <n-form-item label="Port Ranges">
            <n-input v-model:value="form.server_ports" placeholder="443,8443-9443" />
          </n-form-item>
          <n-form-item label="Hop Interval">
            <n-input v-model:value="form.hop_interval" placeholder="30s" />
          </n-form-item>
        </div>
      </template>

      <template v-if="isVmess || isVless || isTuic">
        <n-form-item :label="$t('nodes.uuid_label')">
          <n-input v-model:value="form.uuid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </n-form-item>
      </template>

      <template v-if="isTrojan">
        <n-form-item :label="$t('nodes.password')">
          <n-input v-model:value="form.password" :placeholder="$t('nodes.password_placeholder')" />
        </n-form-item>
      </template>

      <template v-if="isTuic">
        <n-form-item :label="$t('nodes.password')">
          <n-input v-model:value="form.password" :placeholder="$t('nodes.password_placeholder')" />
        </n-form-item>
      </template>

      <template v-if="isHysteria">
        <n-form-item label="Auth">
          <n-input v-model:value="form.auth" placeholder="auth string" />
        </n-form-item>
      </template>

      <template v-if="isHysteria2 || isAnyTls || isShadowTls">
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

      <template v-if="isHysteria || isHysteria2">
        <n-divider class="!my-2">{{ isHysteria ? 'Hysteria' : 'Hysteria2' }}</n-divider>
        <div class="grid grid-cols-2 gap-4">
          <n-form-item label="Upload Mbps">
            <n-input-number v-model:value="form.up_mbps" :show-button="false" class="w-full" placeholder="50" />
          </n-form-item>
          <n-form-item label="Download Mbps">
            <n-input-number v-model:value="form.down_mbps" :show-button="false" class="w-full" placeholder="200" />
          </n-form-item>
        </div>

        <template v-if="isHysteria">
          <n-form-item label="OBFS Password">
            <n-input v-model:value="form.obfs" :placeholder="$t('common.optional')" />
          </n-form-item>
        </template>

        <template v-else>
          <div class="grid grid-cols-2 gap-4">
            <n-form-item label="OBFS Type">
              <n-select v-model:value="form.obfs" :options="hysteria2ObfsOptions" filterable tag clearable />
            </n-form-item>
            <n-form-item label="OBFS Password">
              <n-input v-model:value="form.obfs_password" :placeholder="$t('common.optional')" />
            </n-form-item>
          </div>
        </template>

        <n-form-item :label="$t('nodes.network')">
          <n-select v-model:value="form.network" :options="quicNetworkOptions" clearable />
        </n-form-item>
      </template>

      <template v-if="isTuic">
        <n-divider class="!my-2">TUIC</n-divider>
        <div class="grid grid-cols-2 gap-4">
          <n-form-item label="Congestion Control">
            <n-select v-model:value="form.congestion_control" :options="tuicCongestionControlOptions" />
          </n-form-item>
          <n-form-item label="UDP Relay Mode">
            <n-select v-model:value="form.udp_relay_mode" :options="tuicUdpRelayModeOptions" />
          </n-form-item>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <n-form-item label="Heartbeat">
            <n-input v-model:value="form.heartbeat" placeholder="10s / 10000ms" />
          </n-form-item>
          <n-form-item :label="$t('nodes.network')">
            <n-select v-model:value="form.network" :options="quicNetworkOptions" clearable />
          </n-form-item>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <n-form-item label="UDP over Stream">
            <n-switch v-model:value="form.udp_over_stream" />
          </n-form-item>
          <n-form-item label="0-RTT Handshake">
            <n-switch v-model:value="form.zero_rtt_handshake" />
          </n-form-item>
        </div>
      </template>

      <template v-if="isAnyTls">
        <n-divider class="!my-2">AnyTLS</n-divider>
        <div class="grid grid-cols-2 gap-4">
          <n-form-item label="Idle Session Check">
            <n-input v-model:value="form.idle_session_check_interval" placeholder="30s" />
          </n-form-item>
          <n-form-item label="Idle Session Timeout">
            <n-input v-model:value="form.idle_session_timeout" placeholder="30s" />
          </n-form-item>
        </div>
        <n-form-item label="Min Idle Session">
          <n-input-number v-model:value="form.min_idle_session" :show-button="false" class="w-full" placeholder="0" />
        </n-form-item>
      </template>

      <template v-if="isShadowTls">
        <n-divider class="!my-2">ShadowTLS</n-divider>
        <n-form-item label="Version">
          <n-select v-model:value="form.version" :options="shadowTlsVersionOptions" />
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

      <template v-if="supportsTlsConfig">
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
          <n-switch :value="!!form.tls?.enabled" :disabled="isTlsRequiredProxy" @update:value="setTlsEnabled" />
        </n-form-item>

        <template v-if="form.tls?.enabled || isTlsRequiredProxy">
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

          <n-form-item label="Disable SNI">
            <n-switch :value="!!form.tls!.disable_sni" @update:value="setTlsDisableSni" />
          </n-form-item>
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
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button type="primary" @click="save" :disabled="!canSave || !!editBlockedReason"
          :title="editBlockedReason || undefined">
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
import type { NodeConfig } from '@/types'
import { useNodeStore } from '@/stores/nodes'
import { normalizeNodeType } from '@shared/utils'

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
const nodeStore = useNodeStore()
const isEdit = computed(() => !!props.editingNode)
const editBlockedReason = computed(() => {
  if (!props.editingNode) return ''
  return nodeStore.getNodeMutationBlockedReason(props.editingNode)
})

const typeOptions = [
  { label: 'VMess', value: 'vmess' },
  { label: 'VLESS', value: 'vless' },
  { label: 'Shadowsocks', value: 'shadowsocks' },
  { label: 'Trojan', value: 'trojan' },
  { label: 'Hysteria', value: 'hysteria' },
  { label: 'Hysteria2', value: 'hysteria2' },
  { label: 'TUIC', value: 'tuic' },
  { label: 'AnyTLS', value: 'anytls' },
  { label: 'ShadowTLS', value: 'shadowtls' },
  { label: 'SOCKS', value: 'socks' },
  { label: 'HTTP', value: 'http' }
]

const networkOptions = [
  { label: 'TCP', value: 'tcp' },
  { label: 'WebSocket', value: 'ws' },
  { label: 'gRPC', value: 'grpc' }
]

const quicNetworkOptions = [
  { label: 'UDP', value: 'udp' },
  { label: 'TCP', value: 'tcp' }
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

const hysteria2ObfsOptions = [
  { label: 'salamander', value: 'salamander' }
]

const tuicCongestionControlOptions = [
  { label: 'bbr', value: 'bbr' },
  { label: 'cubic', value: 'cubic' },
  { label: 'new_reno', value: 'new_reno' }
]

const tuicUdpRelayModeOptions = [
  { label: 'native', value: 'native' },
  { label: 'quic', value: 'quic' }
]

const shadowTlsVersionOptions = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 }
]

function createDefaultForm(): Partial<NodeConfig> {
  return {
    tag: '',
    type: 'vmess',
    server: '',
    server_port: 443,
    server_ports: '',
    hop_interval: '',
    uuid: '',
    password: '',
    auth: '',
    method: 'aes-256-gcm',
    obfs: '',
    obfs_password: '',
    up_mbps: undefined,
    down_mbps: undefined,
    version: 3,
    network: '',
    security: 'auto',
    path: '',
    host: '',
    service_name: '',
    flow: '',
    packet_encoding: '',
    username: '',
    congestion_control: 'bbr',
    udp_relay_mode: 'native',
    udp_over_stream: false,
    zero_rtt_handshake: false,
    heartbeat: '10s',
    idle_session_check_interval: '',
    idle_session_timeout: '',
    min_idle_session: 0,
    alpn: '',
    fingerprint: '',
    tls: {
      enabled: false,
      disable_sni: false,
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
const isHysteria = computed(() => normalizedType.value === 'hysteria')
const isHysteria2 = computed(() => normalizedType.value === 'hysteria2')
const isTuic = computed(() => normalizedType.value === 'tuic')
const isAnyTls = computed(() => normalizedType.value === 'anytls')
const isShadowTls = computed(() => normalizedType.value === 'shadowtls')
const isShadowsocks = computed(() => normalizedType.value === 'shadowsocks')
const isSocks = computed(() => normalizedType.value === 'socks')
const isHttp = computed(() => normalizedType.value === 'http')
const isCoreProxy = computed(() => isVmess.value || isVless.value || isTrojan.value)
const supportsServerPortRanges = computed(() => isHysteria.value || isHysteria2.value)
const supportsTlsConfig = computed(() =>
  isCoreProxy.value
  || isHysteria.value
  || isHysteria2.value
  || isTuic.value
  || isAnyTls.value
  || isShadowTls.value
)
const isTlsRequiredProxy = computed(() =>
  isTrojan.value
  || isHysteria.value
  || isHysteria2.value
  || isTuic.value
  || isAnyTls.value
  || isShadowTls.value
)

const canSave = computed(() => {
  const tag = String(form.value.tag ?? '').trim()
  const server = String(form.value.server ?? '').trim()
  const port = form.value.server_port
  const type = normalizedType.value

  if (!tag || !server || !type) return false
  if (typeof port !== 'number' || !Number.isFinite(port) || port <= 0) return false

  if (type === 'vmess' || type === 'vless' || type === 'tuic') {
    if (!String(form.value.uuid ?? '').trim()) return false
  }
  if (type === 'trojan' || type === 'tuic' || type === 'hysteria2' || type === 'anytls') {
    if (!String(form.value.password ?? '').trim()) return false
  }
  if (type === 'shadowsocks') {
    if (!String(form.value.password ?? '').trim()) return false
    if (!String(form.value.method ?? '').trim()) return false
  }
  if (type === 'shadowtls') {
    const version = Number(form.value.version || 3)
    if (version > 1 && !String(form.value.password ?? '').trim()) return false
  }
  if (type === 'hysteria2' && String(form.value.obfs ?? '').trim() && !String(form.value.obfs_password ?? '').trim()) {
    return false
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
  if ((isHysteria.value || isHysteria2.value || isTuic.value) && (!form.value.network || form.value.network === '')) {
    form.value.network = 'udp'
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
  if (type === 'tuic') {
    if (!form.value.congestion_control) form.value.congestion_control = 'bbr'
    if (!form.value.udp_relay_mode) form.value.udp_relay_mode = 'native'
    if (!form.value.heartbeat) form.value.heartbeat = '10s'
    setTlsEnabled(true)
    form.value.security = undefined
  }
  if (type === 'hysteria' || type === 'hysteria2' || type === 'anytls' || type === 'shadowtls') {
    setTlsEnabled(true)
    form.value.security = undefined
  }
  if (type === 'shadowtls' && !form.value.version) {
    form.value.version = 3
  }
  if (type === 'socks' || type === 'http') {
    ensureTls()
    form.value.tls!.enabled = false
    form.value.security = undefined
    form.value.network = undefined
  }
  if (!supportsServerPortRanges.value) {
    form.value.server_ports = ''
    form.value.hop_interval = ''
  }
}

function ensureTls() {
  if (!form.value.tls) {
    form.value.tls = {
      enabled: false,
      disable_sni: false,
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

function setTlsDisableSni(enabled: boolean) {
  ensureTls()
  form.value.tls!.disable_sni = enabled
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim()
  return normalized || undefined
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function close() {
  emit('update:modelValue', false)
}

function save() {
  if (editBlockedReason.value) {
    message.warning(editBlockedReason.value)
    return
  }

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
    server_ports: normalizeOptionalString(form.value.server_ports),
    hop_interval: normalizeOptionalString(form.value.hop_interval),
    uuid: normalizeOptionalString(form.value.uuid),
    password: normalizeOptionalString(form.value.password),
    auth: normalizeOptionalString(form.value.auth),
    method: normalizeOptionalString(form.value.method),
    plugin: normalizeOptionalString(form.value.plugin),
    plugin_opts: normalizeOptionalString(form.value.plugin_opts),
    obfs: normalizeOptionalString(form.value.obfs),
    obfs_password: normalizeOptionalString(form.value.obfs_password),
    up_mbps: normalizeOptionalNumber(form.value.up_mbps),
    down_mbps: normalizeOptionalNumber(form.value.down_mbps),
    version: normalizeOptionalNumber(form.value.version),
    path: normalizeOptionalString(form.value.path),
    host: normalizeOptionalString(form.value.host),
    service_name: normalizeOptionalString(form.value.service_name),
    flow: normalizeOptionalString(form.value.flow),
    packet_encoding: normalizeOptionalString(form.value.packet_encoding),
    username: normalizeOptionalString(form.value.username),
    congestion_control: normalizeOptionalString(form.value.congestion_control),
    udp_relay_mode: normalizeOptionalString(form.value.udp_relay_mode),
    udp_over_stream: !!form.value.udp_over_stream,
    zero_rtt_handshake: !!form.value.zero_rtt_handshake,
    heartbeat: normalizeOptionalString(form.value.heartbeat),
    idle_session_check_interval: normalizeOptionalString(form.value.idle_session_check_interval),
    idle_session_timeout: normalizeOptionalString(form.value.idle_session_timeout),
    min_idle_session: normalizeOptionalNumber(form.value.min_idle_session),
    alpn: normalizeOptionalString(form.value.alpn),
    fingerprint: normalizeOptionalString(form.value.fingerprint)
  }

  const requiresTls = ['trojan', 'hysteria', 'hysteria2', 'tuic', 'anytls', 'shadowtls'].includes(type)

  if (!payload.tls?.enabled && !requiresTls) {
    payload.tls = { enabled: false }
  } else {
    payload.tls = {
      ...payload.tls,
      enabled: true,
      disable_sni: !!payload.tls?.disable_sni,
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
}
</script>
