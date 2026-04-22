import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

type ListenerMap = Map<string, EventListenerOrEventListenerObject>

function createWindowStub() {
  const listeners: ListenerMap = new Map()
  const localStorageState = new Map<string, string>()
  const sessionStorageState = new Map<string, string>()

  const localStorage = {
    getItem(key: string) {
      return localStorageState.get(key) ?? null
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value)
    },
    removeItem(key: string) {
      localStorageState.delete(key)
    },
  }

  const sessionStorage = {
    getItem(key: string) {
      return sessionStorageState.get(key) ?? null
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value)
    },
  }

  return {
    listeners,
    window: {
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        href: 'http://localhost:5173/trades/T-100',
      },
      localStorage,
      sessionStorage,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.set(type, listener)
      },
    },
  }
}

test('reportClientIssue posts client telemetry with browser session context', async () => {
  const originalFetch = globalThis.fetch
  const { window } = createWindowStub()
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []

  vi.stubGlobal('window', window)
  vi.stubGlobal('navigator', { userAgent: 'Vitest Browser', sendBeacon: undefined })
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init })
    return new Response(null, { status: 202 })
  }) as typeof fetch

  vi.resetModules()
  const { reportClientIssue } = await import('../src/shared/clientTelemetry.ts')

  try {
    reportClientIssue({
      source: 'workspace-bootstrap.summary',
      level: 'warning',
      message: 'Workspace summary load failed.',
      error: new Error('summary unavailable'),
      handled: true,
      extra: {
        group: 'core',
      },
    })

    assert.equal(fetchCalls.length, 1)
    assert.match(fetchCalls[0].url, /^http:\/\/(localhost|127\.0\.0\.1):8000\/telemetry\/client-errors$/)

    const payload = JSON.parse(String(fetchCalls[0].init?.body)) as Record<string, unknown>
    assert.equal(payload.level, 'warning')
    assert.equal(payload.source, 'workspace-bootstrap.summary')
    assert.equal(payload.handled, true)
    assert.equal(payload.url, 'http://localhost:5173/trades/T-100')
    assert.equal(payload.user_agent, 'Vitest Browser')
    assert.equal(typeof payload.browser_session_id, 'string')
    assert.equal((payload.extra as Record<string, unknown>).group, 'core')
  } finally {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  }
})

test('installClientTelemetry reports unhandled rejections once per fingerprint window', async () => {
  const originalFetch = globalThis.fetch
  const { listeners, window } = createWindowStub()
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []

  vi.stubGlobal('window', window)
  vi.stubGlobal('navigator', { userAgent: 'Vitest Browser', sendBeacon: () => false })
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init })
    return new Response(null, { status: 202 })
  }) as typeof fetch

  vi.resetModules()
  const { installClientTelemetry } = await import('../src/shared/clientTelemetry.ts')

  try {
    installClientTelemetry()
    const listener = listeners.get('unhandledrejection')
    assert.ok(listener)

    const event = { reason: new Error('kaboom') } as PromiseRejectionEvent
    if (typeof listener === 'function') {
      listener(event)
      listener(event)
    } else {
      listener.handleEvent(event)
      listener.handleEvent(event)
    }

    assert.equal(fetchCalls.length, 1)
    const payload = JSON.parse(String(fetchCalls[0].init?.body)) as Record<string, unknown>
    assert.equal(payload.source, 'window.unhandledrejection')
    assert.equal(payload.message, 'kaboom')
    assert.equal(payload.handled, false)
  } finally {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  }
})
