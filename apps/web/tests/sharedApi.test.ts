import assert from 'node:assert/strict'
import { test } from 'vitest'

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
