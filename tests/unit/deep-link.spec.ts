import { describe, expect, it } from 'vitest'
import {
  APP_DEEP_LINK_SCHEMES,
  findAppDeepLink,
  inspectAppDeepLink,
  parseAppDeepLink,
  queueAppDeepLinkImport
} from '../../electron/main/deep-link'
const APP_DEEP_LINK_SCHEME = APP_DEEP_LINK_SCHEMES[0]
describe('LagZero deep link parsing', () => {
  it('finds lagzero protocol links in argv', () => {
    const raw = `${APP_DEEP_LINK_SCHEME}://import?url=${encodeURIComponent('https://example.com/sub')}`
    const result = findAppDeepLink(['--flag', raw, '--another'])
    expect(result).toBe(raw)
  })

  it('parses import deep link with defaults', () => {
    const raw = `${APP_DEEP_LINK_SCHEME}://import?url=${encodeURIComponent('https://example.com/sub')}&name=${encodeURIComponent('My Sub')}`
    const result = parseAppDeepLink(raw)

    expect(result).toEqual({
      action: 'import-subscription',
      rawUrl: raw,
      subscriptionUrl: 'https://example.com/sub',
      name: 'My Sub',
      schedule: 'manual',
      immediate: true
    })
  })

  it('parses install-config alias and query overrides', () => {
    const result = parseAppDeepLink(
      `${APP_DEEP_LINK_SCHEME}://install-config?url=${encodeURIComponent('https://example.com/provider.yaml')}&schedule=daily&immediate=false`
    )

    expect(result?.action).toBe('import-subscription')
    expect(result?.subscriptionUrl).toBe('https://example.com/provider.yaml')
    expect(result?.schedule).toBe('daily')
    expect(result?.immediate).toBe(false)
  })

  it('parses clash install-config compatibility links', () => {
    const raw = 'clash://install-config?url=https://example.com/provider.yaml?token=abc123'
    const result = parseAppDeepLink(raw)

    expect(result?.action).toBe('import-subscription')
    expect(result?.subscriptionUrl).toBe('https://example.com/provider.yaml?token=abc123')
    expect(result?.schedule).toBe('manual')
    expect(result?.immediate).toBe(true)
  })

  it('parses mihomo install-config compatibility links', () => {
    const raw = 'mihomo://install-config?url=https://example.com/provider.yaml?token=abc123&name=Meta'
    const result = parseAppDeepLink(raw)

    expect(result?.action).toBe('import-subscription')
    expect(result?.subscriptionUrl).toBe('https://example.com/provider.yaml?token=abc123')
    expect(result?.name).toBe('Meta')
    expect(result?.schedule).toBe('manual')
    expect(result?.immediate).toBe(true)
  })

  it('rejects non-http subscription targets', () => {
    const result = parseAppDeepLink(
      `${APP_DEEP_LINK_SCHEME}://import?url=${encodeURIComponent('file:///tmp/config.yaml')}`
    )
    expect(result).toBeNull()
  })

  it('reports missing subscription urls clearly', () => {
    expect(inspectAppDeepLink(`${APP_DEEP_LINK_SCHEME}://install-config`)).toEqual({
      ok: false,
      rawUrl: `${APP_DEEP_LINK_SCHEME}://install-config`,
      reason: 'missing-subscription-url'
    })
  })

  it('reports invalid subscription urls clearly', () => {
    expect(
      inspectAppDeepLink(`${APP_DEEP_LINK_SCHEME}://install-config?url=${encodeURIComponent('file:///tmp/config.yaml')}`)
    ).toEqual({
      ok: false,
      rawUrl: `${APP_DEEP_LINK_SCHEME}://install-config?url=${encodeURIComponent('file:///tmp/config.yaml')}`,
      reason: 'invalid-subscription-url'
    })
  })

  it('keeps repeated compatibility imports while the renderer is not ready', () => {
    const raw = 'clash://install-config?url=https://example.com/provider.yaml?token=abc123'
    const queue = [] as Array<NonNullable<ReturnType<typeof parseAppDeepLink>>>

    expect(queueAppDeepLinkImport(queue, raw)).toBe(true)
    expect(queueAppDeepLinkImport(queue, raw)).toBe(true)

    expect(queue).toHaveLength(2)
    expect(queue[0]).toEqual(queue[1])
  })

  it('skips queueing when the import was dispatched immediately', () => {
    const raw = 'mihomo://install-config?url=https://example.com/provider.yaml?token=abc123'
    const queue = [] as Array<NonNullable<ReturnType<typeof parseAppDeepLink>>>
    const dispatched: Array<NonNullable<ReturnType<typeof parseAppDeepLink>>> = []

    expect(queueAppDeepLinkImport(queue, raw, (payload) => {
      dispatched.push(payload)
      return true
    })).toBe(true)

    expect(dispatched).toHaveLength(1)
    expect(queue).toHaveLength(0)
  })
})
