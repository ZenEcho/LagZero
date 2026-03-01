import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useTheme } from '../../src/composables/useTheme'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString()
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    })
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('useTheme', () => {
  let prefersDark = false

  beforeEach(() => {
    setActivePinia(createPinia())
    prefersDark = false
    localStorageMock.clear()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    document.documentElement.className = ''

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return prefersDark
        },
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
  })

  it('should initialize with default theme', () => {
    const scope = effectScope()
    const api = scope.run(() => useTheme())!
    expect(api.theme.value).toBe('auto')
    expect(api.themeColor.value).toBe('green')
    scope.stop()
  })

  it('should set theme and apply dark class', async () => {
    const scope = effectScope()
    const api = scope.run(() => useTheme())!

    api.setTheme('dark')
    await nextTick()

    expect(api.theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalled()
    scope.stop()
  })

  it('should toggle theme between dark and light', async () => {
    const scope = effectScope()
    const api = scope.run(() => useTheme())!

    api.setTheme('dark')
    await nextTick()
    expect(api.resolvedTheme.value).toBe('dark')

    api.toggleTheme()
    await nextTick()
    expect(api.theme.value).toBe('light')
    expect(api.resolvedTheme.value).toBe('light')

    api.toggleTheme()
    await nextTick()
    expect(api.theme.value).toBe('dark')
    expect(api.resolvedTheme.value).toBe('dark')
    scope.stop()
  })

  it('should follow system preference when theme is auto', async () => {
    const scope = effectScope()
    const api = scope.run(() => useTheme())!

    prefersDark = false
    api.setTheme('auto')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    prefersDark = true
    api.setTheme('light')
    await nextTick()
    api.setTheme('auto')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    scope.stop()
  })
})
