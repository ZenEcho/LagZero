import path from 'node:path'

export interface ProtocolClientAppLike {
  isDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean
  setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean
}

export interface ProtocolClientRegistrationContext {
  execPath: string
  argv: string[]
  defaultApp?: boolean
}

export type EnsureProtocolClientStatus = 'already-registered' | 'registered' | 'failed'
export type GuardedProtocolScheme = 'clash' | 'mihomo'
export type ProtocolClientOwnershipStatus = 'owned' | 'external' | 'unsupported'

export interface ProtocolClientGuardSettings {
  guardClashScheme: boolean
  guardMihomoScheme: boolean
}

export interface ProtocolClientGuardState {
  scheme: GuardedProtocolScheme
  enabled: boolean
  supported: boolean
  status: ProtocolClientOwnershipStatus
  isRegisteredToApp: boolean
  checkedAt: number
}

export const DEFAULT_PROTOCOL_CLIENT_GUARD_SETTINGS: ProtocolClientGuardSettings = {
  guardClashScheme: true,
  guardMihomoScheme: true
}

export function normalizeProtocolClientGuardSettings(
  value: Partial<ProtocolClientGuardSettings> | null | undefined
): ProtocolClientGuardSettings {
  return {
    guardClashScheme: value?.guardClashScheme !== false,
    guardMihomoScheme: value?.guardMihomoScheme !== false
  }
}

export function isProtocolClientGuardEnabled(
  settings: ProtocolClientGuardSettings,
  scheme: GuardedProtocolScheme
): boolean {
  switch (scheme) {
    case 'clash':
      return settings.guardClashScheme
    case 'mihomo':
      return settings.guardMihomoScheme
    default:
      return false
  }
}

export function buildProtocolClientGuardState(input: {
  scheme: GuardedProtocolScheme
  enabled: boolean
  supported: boolean
  isRegisteredToApp: boolean
  checkedAt?: number
}): ProtocolClientGuardState {
  const supported = !!input.supported
  const isRegisteredToApp = supported && !!input.isRegisteredToApp

  return {
    scheme: input.scheme,
    enabled: !!input.enabled,
    supported,
    status: supported
      ? (isRegisteredToApp ? 'owned' : 'external')
      : 'unsupported',
    isRegisteredToApp,
    checkedAt: input.checkedAt ?? Date.now()
  }
}

export function resolveProtocolClientLaunchDetails(context: ProtocolClientRegistrationContext) {
  if (!context.defaultApp) {
    return {
      executablePath: undefined,
      launchArgs: undefined
    }
  }

  const entry = String(context.argv?.[1] || '').trim()
  if (!entry) {
    return {
      executablePath: undefined,
      launchArgs: undefined
    }
  }

  return {
    executablePath: context.execPath,
    launchArgs: [path.resolve(entry)]
  }
}

export function isProtocolClientRegistered(
  targetApp: ProtocolClientAppLike,
  scheme: string,
  context: ProtocolClientRegistrationContext
): boolean {
  const details = resolveProtocolClientLaunchDetails(context)
  if (details.executablePath && details.launchArgs) {
    return targetApp.isDefaultProtocolClient(scheme, details.executablePath, details.launchArgs)
  }
  return targetApp.isDefaultProtocolClient(scheme)
}

export function registerProtocolClient(
  targetApp: ProtocolClientAppLike,
  scheme: string,
  context: ProtocolClientRegistrationContext
): boolean {
  const details = resolveProtocolClientLaunchDetails(context)
  if (details.executablePath && details.launchArgs) {
    return targetApp.setAsDefaultProtocolClient(scheme, details.executablePath, details.launchArgs)
  }
  return targetApp.setAsDefaultProtocolClient(scheme)
}

export function ensureProtocolClient(
  targetApp: ProtocolClientAppLike,
  scheme: string,
  context: ProtocolClientRegistrationContext
): EnsureProtocolClientStatus {
  if (isProtocolClientRegistered(targetApp, scheme, context)) {
    return 'already-registered'
  }

  const registered = registerProtocolClient(targetApp, scheme, context)
  if (!registered) {
    return 'failed'
  }

  return isProtocolClientRegistered(targetApp, scheme, context)
    ? 'registered'
    : 'failed'
}
