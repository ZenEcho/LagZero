import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildProtocolClientGuardState,
  ensureProtocolClient,
  isProtocolClientGuardEnabled,
  isProtocolClientRegistered,
  normalizeProtocolClientGuardSettings,
  registerProtocolClient,
  resolveProtocolClientLaunchDetails,
  type ProtocolClientAppLike
} from '../../electron/main/protocol-client'

type RegistrationRecord = {
  executablePath?: string
  launchArgs?: string[]
}

function createFakeProtocolApp(initial?: Record<string, RegistrationRecord>): ProtocolClientAppLike & {
  calls: Array<{ method: 'is' | 'set'; scheme: string; executablePath?: string; launchArgs?: string[] }>
} {
  const registrations = new Map<string, RegistrationRecord>(
    Object.entries(initial || {}).map(([scheme, record]) => [scheme, {
      executablePath: record.executablePath,
      launchArgs: record.launchArgs ? [...record.launchArgs] : undefined
    }])
  )
  const calls: Array<{ method: 'is' | 'set'; scheme: string; executablePath?: string; launchArgs?: string[] }> = []

  function sameArgs(left?: string[], right?: string[]) {
    return JSON.stringify(left || []) === JSON.stringify(right || [])
  }

  return {
    calls,
    isDefaultProtocolClient(scheme, executablePath, launchArgs) {
      calls.push({ method: 'is', scheme, executablePath, launchArgs })
      const current = registrations.get(scheme)
      if (!current) return false
      return current.executablePath === executablePath && sameArgs(current.launchArgs, launchArgs)
    },
    setAsDefaultProtocolClient(scheme, executablePath, launchArgs) {
      calls.push({ method: 'set', scheme, executablePath, launchArgs })
      registrations.set(scheme, {
        executablePath,
        launchArgs: launchArgs ? [...launchArgs] : undefined
      })
      return true
    }
  }
}

describe('protocol client registration helpers', () => {
  it('resolves default-app launch details with the dev entry script', () => {
    const result = resolveProtocolClientLaunchDetails({
      execPath: 'C:\\Program Files\\Electron\\electron.exe',
      argv: ['electron.exe', '.\\electron\\main\\index.ts'],
      defaultApp: true
    })

    expect(result).toEqual({
      executablePath: 'C:\\Program Files\\Electron\\electron.exe',
      launchArgs: [path.resolve('.\\electron\\main\\index.ts')]
    })
  })

  it('registers packaged apps without extra launch arguments', () => {
    const fakeApp = createFakeProtocolApp()
    const context = {
      execPath: 'C:\\LagZero\\LagZero.exe',
      argv: ['C:\\LagZero\\LagZero.exe'],
      defaultApp: false
    }

    const registered = registerProtocolClient(fakeApp, 'clash', context)

    expect(registered).toBe(true)
    expect(fakeApp.calls).toContainEqual({
      method: 'set',
      scheme: 'clash',
      executablePath: undefined,
      launchArgs: undefined
    })
    expect(isProtocolClientRegistered(fakeApp, 'clash', context)).toBe(true)
  })

  it('re-registers a missing dev-mode protocol handler with explicit exec path and args', () => {
    const context = {
      execPath: 'C:\\Program Files\\Electron\\electron.exe',
      argv: ['electron.exe', '.\\electron\\main\\index.ts'],
      defaultApp: true
    }
    const fakeApp = createFakeProtocolApp({
      clash: {
        executablePath: 'C:\\OtherApp\\other.exe',
        launchArgs: ['C:\\OtherApp\\index.js']
      }
    })

    const status = ensureProtocolClient(fakeApp, 'clash', context)

    expect(status).toBe('registered')
    expect(fakeApp.calls.find(call => call.method === 'set')).toEqual({
      method: 'set',
      scheme: 'clash',
      executablePath: context.execPath,
      launchArgs: [path.resolve('.\\electron\\main\\index.ts')]
    })
  })

  it('skips registration when the current app already owns the protocol', () => {
    const context = {
      execPath: 'C:\\LagZero\\LagZero.exe',
      argv: ['C:\\LagZero\\LagZero.exe'],
      defaultApp: false
    }
    const fakeApp = createFakeProtocolApp({
      clash: {
        executablePath: undefined,
        launchArgs: undefined
      }
    })

    const status = ensureProtocolClient(fakeApp, 'clash', context)

    expect(status).toBe('already-registered')
    expect(fakeApp.calls.filter(call => call.method === 'set')).toHaveLength(0)
  })

  it('normalizes guard settings with a safe default', () => {
    expect(normalizeProtocolClientGuardSettings(undefined)).toEqual({
      guardClashScheme: true,
      guardMihomoScheme: true
    })

    expect(normalizeProtocolClientGuardSettings({
      guardClashScheme: false,
      guardMihomoScheme: false
    })).toEqual({
      guardClashScheme: false,
      guardMihomoScheme: false
    })
  })

  it('maps guard settings to enabled schemes', () => {
    expect(isProtocolClientGuardEnabled({ guardClashScheme: true, guardMihomoScheme: false }, 'clash')).toBe(true)
    expect(isProtocolClientGuardEnabled({ guardClashScheme: false, guardMihomoScheme: true }, 'clash')).toBe(false)
    expect(isProtocolClientGuardEnabled({ guardClashScheme: false, guardMihomoScheme: true }, 'mihomo')).toBe(true)
    expect(isProtocolClientGuardEnabled({ guardClashScheme: true, guardMihomoScheme: false }, 'mihomo')).toBe(false)
  })

  it('builds an ownership state for supported platforms', () => {
    expect(buildProtocolClientGuardState({
      scheme: 'clash',
      enabled: true,
      supported: true,
      isRegisteredToApp: true,
      checkedAt: 123
    })).toEqual({
      scheme: 'clash',
      enabled: true,
      supported: true,
      status: 'owned',
      isRegisteredToApp: true,
      checkedAt: 123
    })

    expect(buildProtocolClientGuardState({
      scheme: 'clash',
      enabled: false,
      supported: true,
      isRegisteredToApp: false,
      checkedAt: 456
    })).toEqual({
      scheme: 'clash',
      enabled: false,
      supported: true,
      status: 'external',
      isRegisteredToApp: false,
      checkedAt: 456
    })
  })

  it('builds an unsupported state when runtime guarding is unavailable', () => {
    expect(buildProtocolClientGuardState({
      scheme: 'clash',
      enabled: true,
      supported: false,
      isRegisteredToApp: true,
      checkedAt: 789
    })).toEqual({
      scheme: 'clash',
      enabled: true,
      supported: false,
      status: 'unsupported',
      isRegisteredToApp: false,
      checkedAt: 789
    })
  })

  it('builds ownership state for mihomo protocol too', () => {
    expect(buildProtocolClientGuardState({
      scheme: 'mihomo',
      enabled: true,
      supported: true,
      isRegisteredToApp: true,
      checkedAt: 321
    })).toEqual({
      scheme: 'mihomo',
      enabled: true,
      supported: true,
      status: 'owned',
      isRegisteredToApp: true,
      checkedAt: 321
    })
  })
})
