<template>
  <div class="flex-1 space-y-6 w-full animate-fade-in-up ">
    <!-- Latency Check -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.network') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">

        <!-- Check Method -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-speed-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.check_method') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="method in ['ping', 'tcp']" :key="method" @click="setCheckMethod(method)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.checkMethod === method
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ method.toUpperCase() }}
            </button>
          </div>
        </div>

        <!-- Check Interval -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-transparent flex items-center justify-center text-primary shrink-0">
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.check_interval') }}</div>
            </div>
          </div>
          <div class="w-full sm:w-[200px] shrink-0">
            <n-select v-model:value="settingsStore.checkInterval" :options="intervalOptions" class="glass-select" />
          </div>
        </div>
      </div>
    </section>

    <!-- DNS Settings -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.dns_config') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">

        <!-- DNS Mode -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-dns-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.dns_mode') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button @click="settingsStore.dnsMode = 'secure'" :disabled="applyingDns"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.dnsMode === 'secure'
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ $t('settings.dns_mode_secure') }}
            </button>
            <button @click="settingsStore.dnsMode = 'system'" :disabled="applyingDns"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.dnsMode === 'system'
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ $t('settings.dns_mode_system') }}
            </button>
          </div>
        </div>

        <div class="p-4 lg:p-5 space-y-4 hover:bg-surface-overlay/30 transition-colors"
          :class="{ 'opacity-50 pointer-events-none grayscale': settingsStore.dnsMode === 'system' }">
          <p v-if="settingsStore.dnsMode === 'system'" class="text-xs text-warning">
            {{ $t('settings.dns_mode_system_hint') }}
          </p>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[200px] font-bold text-sm">{{ $t('settings.dns_primary') }}</div>
            <div class="w-full md:flex-1">
              <n-input v-model:value="settingsStore.dnsPrimary" placeholder="https://cloudflare-dns.com/dns-query"
                class="glass-input" />
            </div>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[200px] font-bold text-sm">{{ $t('settings.dns_secondary') }}</div>
            <div class="w-full md:flex-1">
              <n-input v-model:value="settingsStore.dnsSecondary" placeholder="https://dns.alidns.com/resolve"
                class="glass-input" />
            </div>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div class="w-full sm:w-[200px] font-bold text-sm">{{ $t('settings.dns_bootstrap') }}</div>
            <div class="w-full md:flex-1 space-y-1">
              <n-input v-model:value="settingsStore.dnsBootstrap" placeholder="223.5.5.5" class="glass-input" />
              <p class="text-xs text-on-surface-muted">{{ $t('settings.dns_bootstrap_hint') }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Sing-box Core -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.core_management') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-memory-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.core_management') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5 line-clamp-2">
                {{ $t('settings.core_version_desc') }}
              </div>
            </div>
          </div>
          <div class="shrink-0">
            <span
              class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold"
              :class="coreInstallInfo.exists
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-warning/30 bg-warning/10 text-warning'"
            >
              {{ coreStatusText }}
            </span>
          </div>
        </div>

        <div class="p-4 lg:p-5 space-y-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[220px] font-bold text-sm">{{ $t('settings.core_current_version') }}</div>
            <div class="w-full md:flex-1 text-sm text-on-surface-muted break-all">
              {{ installedCoreVersionText }}
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[220px] font-bold text-sm">{{ $t('settings.core_test_version') }}</div>
            <div class="w-full md:flex-1 text-sm text-on-surface-muted break-all">
              {{ testedCoreVersionText }}
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[220px] font-bold text-sm">{{ $t('settings.core_version') }}</div>
            <div class="w-full md:flex-1 space-y-2">
              <n-select
                v-model:value="settingsStore.singboxCoreVersion"
                :options="coreVersionOptions"
                :loading="loadingCoreVersions"
                filterable
                class="glass-select"
              />
              <p class="text-xs text-on-surface-muted">
                {{ $t('settings.core_target_version', { version: selectedCoreVersionText }) }}
              </p>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[220px] font-bold text-sm">{{ $t('settings.core_install_dir') }}</div>
            <div class="w-full md:flex-1 text-sm text-on-surface-muted break-all">
              {{ coreInstallInfo.installDir || '-' }}
            </div>
          </div>

          <p v-if="coreVersionError" class="text-xs text-warning">
            {{ $t('settings.core_version_fetch_failed', { error: coreVersionError }) }}
          </p>
          <p v-if="coreInstallInfo.isRunning" class="text-xs text-warning">
            {{ $t('settings.core_switch_requires_stop') }}
          </p>

          <div class="flex flex-wrap gap-3">
            <n-button
              secondary
              class="glass-button"
              :loading="installingCore"
              :disabled="coreInstallInfo.isRunning"
              @click="handleInstallCore"
            >
              <template #icon>
                <div class="i-material-symbols-download"></div>
              </template>
              {{ $t('settings.core_download') }}
            </n-button>
            <n-button secondary class="glass-button" :loading="loadingCoreVersions" @click="refreshCoreVersions(true)">
              <template #icon>
                <div class="i-material-symbols-refresh"></div>
              </template>
              {{ $t('settings.core_refresh_versions') }}
            </n-button>
            <n-button secondary class="glass-button" :loading="refreshingCoreInfo" @click="refreshCoreInstallInfo">
              <template #icon>
                <div class="i-material-symbols-info-outline"></div>
              </template>
              {{ $t('settings.core_refresh_status') }}
            </n-button>
            <n-button secondary class="glass-button" @click="openCoreInstallDir">
              <template #icon>
                <div class="i-material-symbols-folder-open-outline"></div>
              </template>
              {{ $t('settings.core_open_dir') }}
            </n-button>
          </div>

          <div v-if="showCoreInstallProgress" class="rounded-xl border border-border/40 bg-surface-overlay/30 p-3 text-sm">
            <div class="mb-2 flex items-center justify-between gap-3">
              <span class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">
                {{ $t('singbox_installer.download_progress') }}
              </span>
              <span
                class="text-xs font-medium"
                :class="coreInstallPhase === 'failed'
                  ? 'text-error'
                  : coreInstallPhase === 'completed'
                    ? 'text-success'
                    : 'text-on-surface-muted'"
              >
                {{ coreInstallPhaseSummary }}
              </span>
            </div>
            <n-progress
              v-if="typeof coreInstallProgress === 'number'"
              type="line"
              :percentage="coreInstallProgress"
              :indicator-placement="'inside'"
              :processing="coreInstallPhase !== 'completed' && coreInstallPhase !== 'failed'"
            />
            <div v-else class="flex items-center gap-2 text-on-surface-muted">
              <n-spin size="small" />
              <span>{{ coreInstallPhaseSummary }}</span>
            </div>
            <p class="mt-2 text-xs text-on-surface-muted break-words">
              {{ coreInstallPhaseDetail }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Local Proxy -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.local_proxy') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">

        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-lan-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.local_proxy') }}</div>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <n-switch v-model:value="settingsStore.localProxyEnabled" />
          </div>
        </div>

        <div class="p-4 lg:p-5 space-y-4 hover:bg-surface-overlay/30 transition-colors"
          :class="{ 'opacity-50 pointer-events-none': !settingsStore.localProxyEnabled }">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[300px]">
              <div class="font-bold text-sm">{{ $t('settings.local_proxy_port') }} (HTTP)</div>
              <div class="text-xs text-on-surface-muted mt-0.5">{{ $t('settings.local_proxy_info', {
                socks:
                  settingsStore.localProxyPort + 1
              }) }}</div>
            </div>
            <div class="w-full sm:w-auto md:w-[200px]">
              <n-input-number v-model:value="settingsStore.localProxyPort" :min="1024" :max="65535" class="glass-select"
                button-placement="both" />
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[300px]">
              <div class="font-bold text-sm">{{ $t('settings.local_proxy_node_strategy') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5">{{ $t('settings.local_proxy_node_recursive') }}</div>
            </div>
            <div class="w-full sm:w-auto shrink-0 flex items-center justify-end">
              <n-switch v-model:value="settingsStore.localProxyNodeRecursiveTest" />
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            :class="{ 'opacity-50 pointer-events-none': settingsStore.localProxyNodeRecursiveTest }">
            <div class="w-full sm:w-[300px] font-bold text-sm">
              {{ $t('settings.local_proxy_fixed_node_index') }}
            </div>
            <div class="w-full sm:w-auto md:w-[200px]">
              <n-input-number v-model:value="settingsStore.localProxyFixedNodeIndex" :min="1" :max="9999"
                class="glass-select" button-placement="both" />
            </div>
          </div>

          <div class="bg-surface-overlay/30 p-3 rounded-xl border border-border/30 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-widest text-on-surface-muted">{{ $t('common.status')
              }}</span>
              <span class="text-xs font-bold" :class="localProxyStore.statusLevel === 'error'
                ? 'text-error' : localProxyStore.statusLevel === 'warning'
                  ? 'text-yellow-500' : localProxyStore.statusLevel === 'success'
                    ? 'text-success' : 'text-on-surface-muted'">
                {{ localProxyStore.statusText || (localProxyStore.starting ? $t('common.checking') : '-') }}
              </span>
            </div>
            <div v-if="localProxyStore.testingTotal > 0" class="text-xs text-on-surface-muted text-right">
              {{ $t('common.checking') }} {{ localProxyStore.testingCurrent }}/{{ localProxyStore.testingTotal }}
              <span v-if="localProxyStore.testingNodeLabel">- {{ localProxyStore.testingNodeLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- System Proxy -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.system_proxy') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div class="p-4 lg:p-5 space-y-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4 mb-2">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-public text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.system_proxy') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5 max-w-lg">{{ $t('settings.system_proxy_info') }}</div>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[300px] font-bold text-sm">
              {{ $t('settings.system_proxy_port') }} (HTTP)
            </div>
            <div class="w-full sm:w-auto md:w-[200px]">
              <n-input-number v-model:value="settingsStore.systemProxyPort" :min="1024" :max="65535"
                class="glass-select" button-placement="both" />
            </div>
          </div>

          <div class="flex flex-col gap-2 pt-2">
            <div class="font-bold text-sm">
              {{ $t('settings.proxy_bypass') }}
            </div>
            <n-input v-model:value="settingsStore.systemProxyBypass" type="textarea"
              :autosize="{ minRows: 3, maxRows: 8 }" :placeholder="$t('settings.proxy_bypass_placeholder')"
              class="glass-input" />
            <p class="text-xs text-on-surface-muted mt-1">
              {{ $t('settings.proxy_bypass_info') }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Game Network Tuning -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.game_network_tuning') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm transition-opacity duration-300"
        :class="{ 'opacity-60 grayscale': !isTunNetworkMode }">

        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-joystick-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.game_network_tuning') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5 line-clamp-2"
                :title="$t('settings.game_network_tuning_hint')">
                {{ $t('settings.game_network_tuning_hint') }}
              </div>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <n-switch v-model:value="settingsStore.sessionNetworkTuning.enabled" :disabled="!isTunNetworkMode" />
          </div>
        </div>

        <div class="p-4 lg:p-5 space-y-4 hover:bg-surface-overlay/30 transition-colors"
          :class="{ 'opacity-50 pointer-events-none': !settingsStore.sessionNetworkTuning.enabled || !isTunNetworkMode }">
          <p v-if="!isTunNetworkMode"
            class="text-xs text-warning border border-warning/30 bg-warning/10 p-2 rounded-lg">
            {{ $t('settings.game_network_tuning_tun_only') }}
          </p>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="w-full sm:w-[200px] font-bold text-sm">{{ $t('settings.network_profile') }}</div>
            <div class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-[350px]">
              <button @click="applyProfilePreset('stable')"
                class="flex-1 px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.sessionNetworkTuning.profile === 'stable'
                  ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                  : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
                {{ $t('settings.network_profile_stable') }}
              </button>
              <button @click="applyProfilePreset('aggressive')"
                class="flex-1 px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.sessionNetworkTuning.profile === 'aggressive'
                  ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                  : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
                {{ $t('settings.network_profile_aggressive') }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
              <div class="font-bold text-sm">{{ $t('settings.udp_mode') }}</div>
              <n-select v-model:value="settingsStore.sessionNetworkTuning.udpMode" :options="udpModeOptions"
                class="glass-select" />
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="font-bold text-sm">{{ $t('settings.tun_stack') }}</div>
              <n-select v-model:value="settingsStore.sessionNetworkTuning.tunStack" :options="tunStackOptions"
                class="glass-select" />
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="font-bold text-sm">MTU</div>
              <n-input-number v-model:value="settingsStore.sessionNetworkTuning.tunMtu" :min="1200" :max="1500"
                class="glass-select" button-placement="both" />
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="font-bold text-sm">{{ $t('settings.vless_packet_encoding') }} <span
                  class="text-xs font-normal text-on-surface-muted">({{ $t('settings.vless_only') }})</span></div>
              <n-select v-model:value="settingsStore.sessionNetworkTuning.vlessPacketEncodingOverride"
                :options="vlessEncodingOptions" class="glass-select" />
            </div>
          </div>

          <p class="text-xs text-on-surface-muted mt-0">{{ $t('settings.vless_only_hint') }}</p>

          <div class="flex items-center justify-between pt-2">
            <div class="font-bold text-sm">{{ $t('settings.strict_route') }}</div>
            <n-switch v-model:value="settingsStore.sessionNetworkTuning.strictRoute" />
          </div>
          <div class="flex items-center justify-between">
            <div class="font-bold text-sm">{{ $t('settings.high_loss_hint_only') }}</div>
            <n-switch v-model:value="settingsStore.sessionNetworkTuning.highLossHintOnly"
              :disabled="!isTunNetworkMode" />
          </div>

          <div class="pt-2">
            <n-button secondary @click="settingsStore.resetSessionNetworkTuning()" class="glass-button w-full sm:w-auto"
              :disabled="!isTunNetworkMode">
              {{ $t('settings.reset_session_network_tuning') }}
            </n-button>
          </div>
        </div>
      </div>
    </section>

    <!-- Advanced Network -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('common.more') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div class="p-4 lg:p-5 space-y-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <div class="i-material-symbols-settings-ethernet text-xl"></div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">{{ $t('settings.tun_interface') }}</div>
              </div>
            </div>
            <div class="w-full sm:w-auto md:w-[200px] shrink-0">
              <n-input v-model:value="settingsStore.tunInterfaceName" placeholder="LagZero" class="glass-input" />
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <n-button secondary type="warning" @click="handleReinstallTun" :loading="working" :disabled="working"
              class="glass-button">
              <template #icon>
                <div class="i-material-symbols-refresh"></div>
              </template>
              {{ $t('settings.tun_reinstall') }}
            </n-button>
            <n-button secondary type="info" @click="handleFlushDns" :loading="working" :disabled="working"
              class="glass-button">
              <template #icon>
                <div class="i-material-symbols-cleaning-services"></div>
              </template>
              {{ $t('settings.dns_flush') }}
            </n-button>
          </div>

          <div v-if="opMessage" class="px-3 py-2 rounded-xl text-sm flex items-center gap-2 border animate-scale-in"
            :class="opOk ? 'bg-success/10 text-success border-success/20' : 'bg-error/10 text-error border-error/20'">
            <div :class="opOk ? 'i-material-symbols-check-circle text-base' : 'i-material-symbols-error text-base'">
            </div>
            {{ opMessage }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import pkg from '../../../package.json'
import { useSettingsStore } from '@/stores/settings'
import { useSingboxInstallerStore } from '@/stores/singbox-installer'
import { useLocalProxyStore } from '@/stores/local-proxy'
import { useGameStore } from '@/stores/games'
import { NSelect, NInput, NButton, NSwitch, NInputNumber, NProgress, NSpin, useMessage, type SelectGroupOption, type SelectOption } from 'naive-ui'
import { appApi, systemApi } from '@/api'

const { t } = useI18n()
const message = useMessage()
const settingsStore = useSettingsStore()
const singboxInstallerStore = useSingboxInstallerStore()
const localProxyStore = useLocalProxyStore()
const gameStore = useGameStore()
const {
  availableCoreVersions,
  loadingCoreVersions,
  versionLoadError: coreVersionError,
  refreshingInstallInfo: refreshingCoreInfo,
  installInfo: coreInstallInfo,
  phase: coreInstallPhase,
  progress: coreInstallProgress,
  resolvedVersion: coreInstallResolvedVersion,
  errorMessage: coreInstallErrorMessage,
  failedByTimeout: coreInstallFailedByTimeout,
  isInstalling: installingCore,
  hasInstallProgress: showCoreInstallProgress
} = storeToRefs(singboxInstallerStore)

const working = ref(false)
const applyingDns = ref(false)
const applyingSessionTuning = ref(false)
const opMessage = ref('')
const opOk = ref(true)

const intervalOptions = [
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 }
]
const udpModeOptions = computed(() => ([
  { label: t('settings.udp_mode_auto'), value: 'auto' },
  { label: t('settings.udp_mode_prefer_udp'), value: 'prefer_udp' },
  { label: t('settings.udp_mode_prefer_tcp'), value: 'prefer_tcp' }
]))
const tunStackOptions = [
  { label: 'system', value: 'system' },
  { label: 'mixed', value: 'mixed' }
]
const vlessEncodingOptions = computed(() => ([
  { label: t('settings.vless_packet_encoding_off'), value: 'off' },
  { label: 'xudp', value: 'xudp' }
]))
const isTunNetworkMode = computed(() => settingsStore.accelNetworkMode === 'tun')
const latestStableCoreVersion = computed(() => (
  availableCoreVersions.value.find((release) => release.channel === 'stable')?.version
))
const coreVersionOptions = computed<Array<SelectOption | SelectGroupOption>>(() => {
  const latestLabel = latestStableCoreVersion.value
    ? t('settings.core_version_latest_with_version', { version: latestStableCoreVersion.value })
    : t('settings.core_version_latest')
  const selectedVersion = settingsStore.singboxCoreVersion
  const needsSelectedFallback = selectedVersion !== 'latest'
    && !availableCoreVersions.value.some((release) => release.version === selectedVersion)
  const grouped = {
    stable: availableCoreVersions.value.filter((release) => release.channel === 'stable'),
    beta: availableCoreVersions.value.filter((release) => release.channel === 'beta'),
    alpha: availableCoreVersions.value.filter((release) => release.channel === 'alpha')
  }

  if (needsSelectedFallback) {
    const fallbackChannel = inferReleaseChannelFromVersion(selectedVersion)
    grouped[fallbackChannel] = [
      {
        version: selectedVersion,
        tagName: `v${selectedVersion}`,
        channel: fallbackChannel
      },
      ...grouped[fallbackChannel]
    ]
  }

  return [
    { label: latestLabel, value: 'latest' },
    ...buildCoreVersionGroups(grouped)
  ]
})
const coreStatusText = computed(() => (
  coreInstallInfo.value.exists
    ? t('settings.core_installed')
    : t('settings.core_missing')
))
const installedCoreVersionText = computed(() => {
  if (!coreInstallInfo.value.exists) return t('settings.core_missing')
  if (coreInstallInfo.value.installedVersion) return `v${coreInstallInfo.value.installedVersion}`
  return t('settings.core_installed_unknown')
})
const testedCoreVersionText = computed(() => {
  const version = String(pkg.lagZeroTestSingboxVersion || '').trim()
  if (!version) return t('settings.core_test_version_unset')
  return version.startsWith('v') ? version : `v${version}`
})
const selectedCoreVersionText = computed(() => {
  if (settingsStore.singboxCoreVersion === 'latest') {
    return latestStableCoreVersion.value
      ? t('settings.core_version_latest_with_version', { version: latestStableCoreVersion.value })
      : t('settings.core_version_latest')
  }
  return `v${settingsStore.singboxCoreVersion}`
})
const resolvedCoreVersionText = computed(() => {
  const version = String(coreInstallResolvedVersion.value || '').trim()
  if (!version) return selectedCoreVersionText.value
  return version.startsWith('v') ? version : `v${version}`
})
const coreInstallPhaseSummary = computed(() => {
  if (coreInstallPhase.value === 'checking') return t('singbox_installer.checking')
  if (coreInstallPhase.value === 'missing') return t('singbox_installer.missing')
  if (coreInstallPhase.value === 'resolving') return t('singbox_installer.resolving')
  if (coreInstallPhase.value === 'downloading') {
    return typeof coreInstallProgress.value === 'number'
      ? t('singbox_installer.downloading_percent', { percent: coreInstallProgress.value })
      : t('singbox_installer.downloading')
  }
  if (coreInstallPhase.value === 'extracting') return t('singbox_installer.extracting')
  if (coreInstallPhase.value === 'completed') {
    return t('settings.core_download_success', { version: resolvedCoreVersionText.value })
  }
  if (coreInstallPhase.value === 'failed') {
    return coreInstallFailedByTimeout.value
      ? t('singbox_installer.failed_timeout')
      : t('singbox_installer.failed')
  }
  return t('singbox_installer.preparing')
})
const coreInstallPhaseDetail = computed(() => {
  if (coreInstallPhase.value === 'failed' && coreInstallErrorMessage.value) {
    return coreInstallErrorMessage.value
  }
  return coreInstallPhaseSummary.value
})

function setCheckMethod(method: string) {
  // @ts-ignore
  settingsStore.checkMethod = method
}

function applyProfilePreset(profile: 'stable' | 'aggressive') {
  settingsStore.applySessionNetworkProfilePreset(profile)
}

function formatCoreVersionOptionLabel(version: string, publishedAt?: string) {
  if (!publishedAt) return `v${version}`
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return `v${version}`
  return `v${version} (${date.toLocaleDateString()})`
}

function inferReleaseChannelFromVersion(version: string): 'stable' | 'beta' | 'alpha' {
  const text = String(version || '').toLowerCase()
  if (text.includes('alpha')) return 'alpha'
  if (text.includes('beta') || /\brc\b/.test(text) || text.includes('preview')) return 'beta'
  return 'stable'
}

function buildCoreVersionGroups(grouped: Record<'stable' | 'beta' | 'alpha', Array<{
  version: string
  tagName: string
  publishedAt?: string
  channel: 'stable' | 'beta' | 'alpha'
}>>): SelectGroupOption[] {
  const groups: Array<{ key: 'stable' | 'beta' | 'alpha', label: string }> = [
    { key: 'stable', label: t('settings.core_version_group_stable') },
    { key: 'beta', label: t('settings.core_version_group_beta') },
    { key: 'alpha', label: t('settings.core_version_group_alpha') }
  ]

  return groups.reduce<SelectGroupOption[]>((acc, group) => {
    const releases = grouped[group.key]
    if (!releases.length) return acc
    acc.push({
      type: 'group' as const,
      key: `core-${group.key}`,
      label: group.label,
      children: releases.map((release) => ({
        label: formatCoreVersionOptionLabel(release.version, release.publishedAt),
        value: release.version
      }))
    })
    return acc
  }, [])
}

async function refreshCoreVersions(forceRefresh = false) {
  try {
    await singboxInstallerStore.refreshCoreVersions(forceRefresh)
  } catch {
    // 错误状态已同步到共享 store
  }
}

async function refreshCoreInstallInfo() {
  try {
    await singboxInstallerStore.refreshInstallInfo()
  } catch (e: any) {
    message.error(t('settings.core_status_load_failed', { error: String(e?.message || e) }))
  }
}

async function handleInstallCore() {
  if (installingCore.value) return
  try {
    await singboxInstallerStore.installCore(settingsStore.singboxCoreVersion)
    await refreshCoreInstallInfo()
    message.success(t('settings.core_download_success', { version: resolvedCoreVersionText.value }))
  } catch (e: any) {
    message.error(t('settings.core_download_failed', { error: String(e?.message || e) }))
  }
}

function openCoreInstallDir() {
  if (!coreInstallInfo.value.installDir) return
  void appApi.openDir(coreInstallInfo.value.installDir).catch((e: any) => {
    message.error(t('settings.core_open_dir_failed', { error: String(e?.message || e) }))
  })
}

async function handleFlushDns() {
  if (working.value) return
  working.value = true
  opMessage.value = ''
  try {
    const result = await systemApi.flushDnsCache()
    opOk.value = !!result?.ok
    opMessage.value = String(result?.message || '')
  } catch (e: any) {
    opOk.value = false
    opMessage.value = String(e?.message || e || t('settings.dns_flush_failed'))
  } finally {
    working.value = false
  }
}

async function handleReinstallTun() {
  if (working.value) return
  working.value = true
  opMessage.value = ''
  try {
    const result = await systemApi.reinstallTunAdapter(settingsStore.tunInterfaceName || 'LagZero')
    opOk.value = !!result?.ok
    opMessage.value = String(result?.message || '')
  } catch (e: any) {
    opOk.value = false
    opMessage.value = String(e?.message || e || t('settings.tun_reinstall_failed'))
  } finally {
    working.value = false
  }
}

watch(
  () => [
    settingsStore.localProxyEnabled,
    settingsStore.localProxyPort,
    settingsStore.localProxyNodeRecursiveTest,
    settingsStore.localProxyFixedNodeIndex
  ],
  () => {
    void localProxyStore.applySettingsChange()
  }
)

watch(
  () => settingsStore.dnsMode,
  async (mode, prev) => {
    if (mode === prev) return
    if (applyingDns.value) return
    const active = gameStore.getAcceleratingGame()
    if (!active?.id) return
    if (gameStore.operationState !== 'idle') return

    applyingDns.value = true
    try {
      await gameStore.stopGame(active.id)
      await gameStore.startGame(active.id)
    } catch (e: any) {
      opOk.value = false
      opMessage.value = String(e?.message || e || t('dashboard.start_failed'))
    } finally {
      applyingDns.value = false
    }
  }
)

watch(
  () => JSON.stringify(settingsStore.sessionNetworkTuning),
  async (_next, prev) => {
    if (_next === prev) return
    if (applyingSessionTuning.value) return
    if (!isTunNetworkMode.value) return
    const active = gameStore.getAcceleratingGame()
    if (!active?.id) return
    if (!gameStore.isUsingGlobalSessionNetworkTuning(active.id)) return
    if (gameStore.operationState !== 'idle') return

    applyingSessionTuning.value = true
    try {
      opOk.value = true
      opMessage.value = t('settings.session_network_tuning_restarting')
      const restarted = await gameStore.applySessionNetworkTuningChange()
      if (restarted) {
        opMessage.value = t('settings.session_network_tuning_applied')
      }
    } catch (e: any) {
      opOk.value = false
      opMessage.value = String(e?.message || e || t('settings.session_network_tuning_apply_failed'))
    } finally {
      applyingSessionTuning.value = false
    }
  }
)

onMounted(() => {
  void singboxInstallerStore.initialize()
  void refreshCoreVersions()
  void refreshCoreInstallInfo()
})
</script>
