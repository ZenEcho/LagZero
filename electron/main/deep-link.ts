export const APP_DEEP_LINK_SCHEMES = ['lagzero', 'clash', 'mihomo'] as const

export type DeepLinkSubscriptionSchedule = 'manual' | 'startup' | 'daily' | 'monthly'
export type AppDeepLinkParseFailureReason =
  | 'not-app-deep-link'
  | 'invalid-url'
  | 'unsupported-action'
  | 'missing-subscription-url'
  | 'invalid-subscription-url'

export interface AppDeepLinkImportPayload {
  action: 'import-subscription'
  rawUrl: string
  subscriptionUrl: string
  name?: string
  schedule: DeepLinkSubscriptionSchedule
  immediate: boolean
}

const IMPORT_ACTIONS = new Set([
  '',
  'import',
  'install-config',
  'subscribe',
  'subscription'
])

export type AppDeepLinkParseResult =
  | {
    ok: true
    payload: AppDeepLinkImportPayload
  }
  | {
    ok: false
    rawUrl: string
    reason: AppDeepLinkParseFailureReason
  }

export function isAppDeepLink(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return APP_DEEP_LINK_SCHEMES.some((scheme) => normalized.startsWith(`${scheme}://`))
}

export function findAppDeepLink(args: string[]): string | null {
  for (const arg of args || []) {
    const normalized = String(arg || '').trim()
    if (isAppDeepLink(normalized)) return normalized
  }
  return null
}

export function inspectAppDeepLink(rawUrl: string): AppDeepLinkParseResult {
  const normalizedRawUrl = String(rawUrl || '').trim()
  if (!isAppDeepLink(normalizedRawUrl)) {
    return {
      ok: false,
      rawUrl: normalizedRawUrl,
      reason: 'not-app-deep-link'
    }
  }

  try {
    const url = new URL(normalizedRawUrl)
    if (!APP_DEEP_LINK_SCHEMES.includes(url.protocol.replace(':', '') as typeof APP_DEEP_LINK_SCHEMES[number])) {
      return {
        ok: false,
        rawUrl: normalizedRawUrl,
        reason: 'invalid-url'
      }
    }

    const hostAction = url.hostname.trim().toLowerCase()
    const pathAction = url.pathname.replace(/^\/+/, '').trim().toLowerCase()
    if (!IMPORT_ACTIONS.has(hostAction) && !IMPORT_ACTIONS.has(pathAction)) {
      return {
        ok: false,
        rawUrl: normalizedRawUrl,
        reason: 'unsupported-action'
      }
    }

    const subscriptionUrlParam = firstNonEmptyParam(url, ['url', 'subscription', 'config'])
    if (!subscriptionUrlParam) {
      return {
        ok: false,
        rawUrl: normalizedRawUrl,
        reason: 'missing-subscription-url'
      }
    }
    if (!isHttpUrl(subscriptionUrlParam)) {
      return {
        ok: false,
        rawUrl: normalizedRawUrl,
        reason: 'invalid-subscription-url'
      }
    }

    const name = firstNonEmptyParam(url, ['name', 'title', 'profile']) || undefined
    const schedule = normalizeSchedule(
      firstNonEmptyParam(url, ['schedule', 'update', 'mode'])
    )
    const immediate = normalizeBooleanParam(
      firstNonEmptyParam(url, ['immediate', 'refresh', 'fetch']),
      true
    )

    return {
      ok: true,
      payload: {
        action: 'import-subscription',
        rawUrl: normalizedRawUrl,
        subscriptionUrl: subscriptionUrlParam,
        name,
        schedule,
        immediate
      }
    }
  } catch {
    return {
      ok: false,
      rawUrl: normalizedRawUrl,
      reason: 'invalid-url'
    }
  }
}

export function parseAppDeepLink(rawUrl: string): AppDeepLinkImportPayload | null {
  const result = inspectAppDeepLink(rawUrl)
  return result.ok ? result.payload : null
}

export function queueAppDeepLinkImport(
  queue: AppDeepLinkImportPayload[],
  rawUrl: string | null | undefined,
  dispatch?: (payload: AppDeepLinkImportPayload) => boolean
): boolean {
  const parsed = rawUrl ? parseAppDeepLink(rawUrl) : null
  if (!parsed) return false
  if (dispatch?.(parsed)) {
    return true
  }
  // Preserve repeated identical links so users can re-import an existing
  // subscription or retry the same external protocol action while the renderer
  // is still booting.
  queue.push(parsed)
  return true
}

function firstNonEmptyParam(url: URL, keys: string[]): string {
  for (const key of keys) {
    const value = String(url.searchParams.get(key) || '').trim()
    if (value) return value
  }
  return ''
}

function normalizeSchedule(value: string): DeepLinkSubscriptionSchedule {
  switch (String(value || '').trim().toLowerCase()) {
    case 'startup':
    case 'daily':
    case 'monthly':
      return String(value).trim().toLowerCase() as DeepLinkSubscriptionSchedule
    case 'manual':
    default:
      return 'manual'
  }
}

function normalizeBooleanParam(value: string, fallback: boolean): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
