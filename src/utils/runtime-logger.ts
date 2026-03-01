import { logsApi } from '@/api'
import type { FrontendLogLevel, FrontendLogPayload } from '@/types'

const MAX_TEXT_LENGTH = 2000
const LOG_BATCH_SIZE = 40
const LOG_BATCH_INTERVAL_MS = 250
const LOG_QUEUE_MAX = 400
const PROMPT_DEDUPE_WINDOW_MS = 1200
const PROMPT_DEDUPE_TTL_MS = 2 * 60 * 1000
const PROMPT_DEDUPE_CLEANUP_INTERVAL_MS = 30 * 1000
const PROMPT_DEDUPE_MAX_KEYS = 400
const PROMPT_SELECTOR = '.n-message, .n-notification, .n-dialog'
const promptSeenAt = new Map<string, number>()
const pendingQueue: FrontendLogPayload[] = []
let logFlushTimer: ReturnType<typeof setTimeout> | null = null
let logFlushInFlight = false
let lastPromptCleanupAt = 0

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

function scheduleLogFlush(immediate = false) {
  if (logFlushTimer) return
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null
    void flushPendingLogs()
  }, immediate ? 0 : LOG_BATCH_INTERVAL_MS)
}

async function flushPendingLogs() {
  if (logFlushInFlight || pendingQueue.length === 0) return
  logFlushInFlight = true
  try {
    while (pendingQueue.length > 0) {
      const batch = pendingQueue.splice(0, LOG_BATCH_SIZE)
      if (batch.length === 1) {
        await logsApi.pushFrontend(batch[0]!)
      } else {
        await logsApi.pushFrontendBatch(batch)
      }
    }
  } catch {
    // ignore logging channel errors
  } finally {
    logFlushInFlight = false
    if (pendingQueue.length > 0) scheduleLogFlush(true)
  }
}

function push(payload: FrontendLogPayload) {
  if (pendingQueue.length >= LOG_QUEUE_MAX) {
    pendingQueue.splice(0, pendingQueue.length - LOG_QUEUE_MAX + 1)
  }
  pendingQueue.push(payload)
  scheduleLogFlush(pendingQueue.length >= LOG_BATCH_SIZE)
}

function normalizePromptText(text: string) {
  return truncate(text.replace(/\s+/g, ' ').trim())
}

function cleanupPromptDedupe(now: number) {
  const shouldCleanupByTime = now - lastPromptCleanupAt >= PROMPT_DEDUPE_CLEANUP_INTERVAL_MS
  if (!shouldCleanupByTime && promptSeenAt.size <= PROMPT_DEDUPE_MAX_KEYS) return

  lastPromptCleanupAt = now
  for (const [key, ts] of promptSeenAt) {
    if (now - ts > PROMPT_DEDUPE_TTL_MS) {
      promptSeenAt.delete(key)
    }
  }

  while (promptSeenAt.size > PROMPT_DEDUPE_MAX_KEYS) {
    const first = promptSeenAt.keys().next().value as string | undefined
    if (!first) break
    promptSeenAt.delete(first)
  }
}

function shouldPushPrompt(key: string) {
  const now = Date.now()
  cleanupPromptDedupe(now)
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

function resolvePromptBucket(el: Element): { source: string, type: string } | null {
  const classList = (el as HTMLElement).classList
  if (classList.contains('n-message')) {
    return { source: 'renderer.prompt.message', type: 'message' }
  }
  if (classList.contains('n-notification')) {
    return { source: 'renderer.prompt.notification', type: 'notification' }
  }
  if (classList.contains('n-dialog')) {
    return { source: 'renderer.prompt.dialog', type: 'dialog' }
  }
  return null
}

function collectPromptLogsFromElement(root: Element): FrontendLogPayload[] {
  const logs: FrontendLogPayload[] = []

  const candidates: Element[] = []
  if (root.matches?.(PROMPT_SELECTOR)) candidates.push(root)
  root.querySelectorAll(PROMPT_SELECTOR).forEach((el) => candidates.push(el))

  for (const el of candidates) {
    const bucket = resolvePromptBucket(el)
    if (!bucket) continue
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

  return logs
}

function installPromptLayerLogging() {
  const pendingRoots = new Set<Element>()
  let promptFlushScheduled = false

  const flushPromptRoots = () => {
    promptFlushScheduled = false
    if (pendingRoots.size === 0) return

    const roots = Array.from(pendingRoots)
    pendingRoots.clear()
    for (const root of roots) {
      const entries = collectPromptLogsFromElement(root)
      for (const entry of entries) push(entry)
    }
  }

  const schedulePromptFlush = () => {
    if (promptFlushScheduled) return
    promptFlushScheduled = true
    setTimeout(flushPromptRoots, 80)
  }

  const onMutation: MutationCallback = (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        pendingRoots.add(node)
      }
    }
    schedulePromptFlush()
  }

  const observer = new MutationObserver(onMutation)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true })
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

  window.addEventListener('beforeunload', () => {
    if (logFlushTimer) {
      clearTimeout(logFlushTimer)
      logFlushTimer = null
    }
    void flushPendingLogs()
  }, { once: true })
}
