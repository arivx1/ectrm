import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  createMessagingWorkspacePost,
  loadMessagingWorkspaceState,
} from '../src/entities/messages/api'

test('loadMessagingWorkspaceState targets the public messaging workspace endpoint', async () => {
  const originalFetch = global.fetch
  const requests: { url: string; init?: RequestInit }[] = []

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        conversations: [],
        messages: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const result = await loadMessagingWorkspaceState('http://localhost:8000')
    assert.deepEqual(result, { conversations: [], messages: [] })
    assert.equal(requests[0]?.url, 'http://localhost:8000/messages/workspace')
  } finally {
    global.fetch = originalFetch
  }
})

test('createMessagingWorkspacePost sends the durable post payload to the workspace write endpoint', async () => {
  const originalFetch = global.fetch
  const requests: { url: string; init?: RequestInit }[] = []

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        message_id: 'msg-1',
        conversation_id: 'ectrm-assistant',
        source: 'human',
        body: 'Hello',
        author: {
          name: 'Guest Operator',
          title: 'Prototype author',
          presence: 'Signed-out preview',
          initials: 'GO',
          tone: 'human',
        },
        assistant_run_id: null,
        assistant_agent_id: null,
        assistant_agent_name: null,
        created_by_user_id: null,
        created_by_session_id: null,
        created_by_role: null,
        created_at: '2026-05-16T20:00:00Z',
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const result = await createMessagingWorkspacePost('http://localhost:8000', {
      conversation_id: 'ectrm-assistant',
      body: 'Hello',
    })

    assert.equal(result.message_id, 'msg-1')
    assert.equal(requests[0]?.url, 'http://localhost:8000/messages/workspace/posts')
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.equal(requests[0]?.init?.body, JSON.stringify({
      conversation_id: 'ectrm-assistant',
      body: 'Hello',
    }))
  } finally {
    global.fetch = originalFetch
  }
})
