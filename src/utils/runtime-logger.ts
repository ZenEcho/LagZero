import { logsApi } from '@/api'
import type { FrontendLogLevel, FrontendLogPayload } from '@/types'

const MAX_TEXT_LENGTH = 2000
const PROMPT_DEDUPE_WINDOW_MS = 1200
const promptSeenAt = new Map<string, number>()

function stringifyPart(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

function truncate(text: string) {
  if (text.length <= MAX_TEXT_LENGTH) return text
  return `${text.slice(0, MAX_TEXT_LENGTH)}...`
}

function makePayload(level: FrontendLogLevel, args: unknown[]): FrontendLogPayload {
  const parts = args.map(stringifyPart)
  const message = truncate(parts[0] || '')
  const detail = truncate(parts.slice(1).join(' '))
  return {
    level,
    source: 'renderer',
    message: message || '(empty)',
    ...(detail ? { detail } : {})
  }
}

function push(payload: FrontendLogPayload) {
  try {
    logsApi.pushFrontend(payload)
  } catch {
    // ignore logging channel errors
  }
}

function normalizePromptText(text: string) {
  return truncate(text.replace(/\s+/g, ' ').trim())
}

function shouldPushPrompt(key: string) {
  const now = Date.now()
  const last = promptSeenAt.get(key) || 0
  if (now - last < PROMPT_DEDUPE_WINDOW_MS) return false
  promptSeenAt.set(key, now)
  return true
}

function inferPromptLevelByClassName(className: string): FrontendLogLevel {
  const cls = className.toLowerCase()
  if (cls.includes('error') || cls.includes('danger')) return 'error'
  if (cls.includes('warning') || cls.includes('warn')) return 'warn'
  if (cls.includes('success')) return 'info'
  return 'info'
}

function collectPromptLogsFromElement(root: Element): FrontendLogPayload[] {
  const logs: FrontendLogPayload[] = []
  const buckets: Array<{ source: string, selector: string, type: string }> = [
    { source: 'renderer.prompt.message', selector: '.n-message', type: 'message' },
    { source: 'renderer.prompt.notification', selector: '.n-notification', type: 'notification' },
    { source: 'renderer.prompt.dialog', selector: '.n-dialog', type: 'dialog' }
  ]

  for (const bucket of buckets) {
    const candidates: Element[] = []
    if (root.matches?.(bucket.selector)) candidates.push(root)
    root.querySelectorAll(bucket.selector).forEach((el) => candidates.push(el))

    for (const el of candidates) {
      const text = normalizePromptText(el.textContent || '')
      if (!text) continue
      const key = `${bucket.type}|${text}`
      if (!shouldPushPrompt(key)) continue
      logs.push({
        level: inferPromptLevelByClassName((el as HTMLElement).className || ''),
        source: bucket.source,
        message: `[${bucket.type}] ${text}`
      })
    }
  }

  return logs
}

function installPromptLayerLogging() {
  const onMutation: MutationCallback = (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        const entries = collectPromptLogsFromElement(node)
        for (const entry of entries) push(entry)
      }
    }
  }

  const observer = new MutationObserver(onMutation)
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

declare global {
  interface Window {
    __lagzeroRuntimeLoggerInstalled?: boolean
  }
}

export function setupRuntimeLogging() {
  if (window.__lagzeroRuntimeLoggerInstalled) return
  window.__lagzeroRuntimeLoggerInstalled = true

  const methodMap: Array<[keyof Console, FrontendLogLevel]> = [
    ['debug', 'debug'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['log', 'info']
  ]

  for (const [name, level] of methodMap) {
    const original = console[name]
    if (typeof original !== 'function') continue
    console[name] = ((...args: unknown[]) => {
      ; (original as any).apply(console, args)
      push(makePayload(level, args))
    }) as any
  }

  window.addEventListener('error', (event) => {
    push({
      level: 'error',
      source: 'renderer.window',
      message: truncate(String(event.message || 'window error')),
      detail: truncate(String(event.error?.stack || ''))
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    push({
      level: 'error',
      source: 'renderer.promise',
      message: 'Unhandled promise rejection',
      detail: truncate(stringifyPart(event.reason))
    })
  })

  installPromptLayerLogging()
}
