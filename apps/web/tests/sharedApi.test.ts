import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'

import { patchJson, postJson, putJson } from '../src/shared/api.ts'

type FetchCall = {
  url: string
  init?: RequestInit
}

function okJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const originalWindow = globalThis.window

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        href: 'http://ectrm.local:5173/app',
        hostname: 'ectrm.local',
      },
    },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
    return
  }

  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  })
})

test('json write helpers preserve Authorization when init.headers is a Headers instance', async () => {
  const originalFetch = globalThis.fetch
  const calls: FetchCall[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return okJsonResponse({ ok: true })
  }) as typeof fetch

  try {
    const authHeaders = new Headers()
    authHeaders.set('Authorization', 'Bearer smoke-token')

    await postJson('http://example.test/post', { ok: true }, { headers: authHeaders })
    await putJson('http://example.test/put', { ok: true }, { headers: authHeaders })
    await patchJson('http://example.test/patch', { ok: true }, { headers: authHeaders })

    assert.equal(calls.length, 3)
    for (const call of calls) {
      const headers = new Headers(call.init?.headers)
      assert.equal(headers.get('Authorization'), 'Bearer smoke-token')
      assert.equal(headers.get('Content-Type'), 'application/json')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('json requests try loopback aliases and the browser hostname before surfacing a local connection failure', async () => {
  const originalFetch = globalThis.fetch
  const calls: FetchCall[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const normalizedUrl = String(url)
    calls.push({ url: normalizedUrl, init })

    if (normalizedUrl === 'http://ectrm.local:8000/health') {
      return okJsonResponse({ ok: true })
    }

    throw new TypeError('Failed to fetch')
  }) as typeof fetch

  try {
    const { fetchJson } = await import('../src/shared/api.ts')
    const payload = await fetchJson<{ ok: boolean }>('http://127.0.0.1:8000/health')

    assert.deepEqual(payload, { ok: true })
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        'http://127.0.0.1:8000/health',
        'http://localhost:8000/health',
        'http://ectrm.local:8000/health',
      ],
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
