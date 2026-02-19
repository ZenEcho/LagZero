import { logsApi } from '@/api'
import type { FrontendLogLevel, FrontendLogPayload } from '@/types'

const MAX_TEXT_LENGTH = 2000

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
}
