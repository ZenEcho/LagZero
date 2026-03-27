import { describe, expect, it } from 'vitest'
import { shouldEnsureAdminBeforeSingleInstanceCheck } from '../../electron/main/bootstrap'

describe('bootstrap admin preflight', () => {
  it('preflights elevation for deep-link launches on Windows', () => {
    expect(shouldEnsureAdminBeforeSingleInstanceCheck({
      platform: 'win32',
      portableRuntime: false,
      hasDeepLink: true
    })).toBe(true)
  })

  it('skips preflight when there is no deep link', () => {
    expect(shouldEnsureAdminBeforeSingleInstanceCheck({
      platform: 'win32',
      portableRuntime: false,
      hasDeepLink: false
    })).toBe(false)
  })

  it('skips preflight for portable builds', () => {
    expect(shouldEnsureAdminBeforeSingleInstanceCheck({
      platform: 'win32',
      portableRuntime: true,
      hasDeepLink: true
    })).toBe(false)
  })

  it('skips preflight outside Windows', () => {
    expect(shouldEnsureAdminBeforeSingleInstanceCheck({
      platform: 'linux',
      portableRuntime: false,
      hasDeepLink: true
    })).toBe(false)
  })
})
