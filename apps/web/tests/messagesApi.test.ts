import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  createMessagingWorkspacePost,
  loadMessagingWorkspaceState,
  updateMessagingWorkspacePost,
} from '../src/entities/messages/api'

test('loadMessagingWorkspaceState targets the public messaging workspace endpoint', async () => {
  const originalFetch = global.fetch
  const requests: { url: string; init?: RequestInit }[] = []

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        conversations: [
          {
            conversation_id: 'ectrm-assistant',
            section: 'Starred',
            kind: 'channel',
            label: '#ectrm-assistant',
            connected_workspace: 'Assistant Console',
            assistant_workspace: 'assistant',
            description: 'Governed assistant drafts stay here.',
            topic: 'Keep governed assistant activity in one lane.',
            composer_hint: 'Reply here to keep assistant guidance threaded.',
            sort_order: 10,
            preview: 'Action draft is ready.',
            unread_count: 1,
            latest_activity_at: '2026-05-16T20:14:00Z',
            highlights: ['Action draft AR-204 is staged for review.'],
            metrics: [{ label: 'Governed drafts', value: '1 new' }],
            members: [
              {
                name: 'ECTRM Desk',
                title: 'System notification',
                presence: 'Watching the desk',
                initials: 'EC',
                tone: 'desk',
              },
            ],
            timeline: [
              {
                id: 'assistant-day',
                kind: 'system',
                created_at: '2026-05-16T20:05:00Z',
                source: 'SYSTEM',
                label: 'Today',
                detail: 'Action draft AR-204 moved into governed review.',
                author: null,
                body: [],
                reactions: [],
                attachment: null,
                parent_message_id: null,
                thread_root_message_id: null,
                reply_count: 0,
                thread_participants: [],
                created_by_user_id: null,
                created_by_role: null,
                edited_at: null,
                deleted_at: null,
                pinned_at: null,
              },
            ],
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const result = await loadMessagingWorkspaceState('http://localhost:8000')
    assert.equal(result.conversations.length, 1)
    assert.equal(result.conversations[0]?.conversation_id, 'ectrm-assistant')
    assert.equal(result.conversations[0]?.timeline[0]?.kind, 'system')
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
        parent_message_id: null,
        thread_root_message_id: 'msg-1',
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
        reactions: [],
        attachment: null,
        edited_at: null,
        deleted_at: null,
        pinned_at: null,
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
      attachment: {
        label: 'Attachment',
        title: 'timing-note.pdf',
        summary: 'application/pdf • 42 KB',
        footnote: 'Added from the desk composer.',
      },
    })

    assert.equal(result.message_id, 'msg-1')
    assert.equal(requests[0]?.url, 'http://localhost:8000/messages/workspace/posts')
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.equal(
      requests[0]?.init?.body,
      JSON.stringify({
        conversation_id: 'ectrm-assistant',
        body: 'Hello',
        attachment: {
          label: 'Attachment',
          title: 'timing-note.pdf',
          summary: 'application/pdf • 42 KB',
          footnote: 'Added from the desk composer.',
        },
      }),
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('updateMessagingWorkspacePost targets the patch endpoint for post actions', async () => {
  const originalFetch = global.fetch
  const requests: { url: string; init?: RequestInit }[] = []

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        message_id: 'msg-1',
        conversation_id: 'ectrm-assistant',
        source: 'human',
        body: 'Updated body',
        parent_message_id: null,
        thread_root_message_id: 'msg-1',
        author: {
          name: 'Messaging Admin',
          title: 'Desk operator',
          presence: 'You',
          initials: 'MA',
          tone: 'human',
        },
        assistant_run_id: null,
        assistant_agent_id: null,
        assistant_agent_name: null,
        created_by_user_id: 'messaging.admin',
        created_by_session_id: 'session-1',
        created_by_role: 'OPS_ADMIN',
        reactions: ['👍'],
        attachment: null,
        edited_at: '2026-05-16T20:05:00Z',
        deleted_at: null,
        pinned_at: null,
        created_at: '2026-05-16T20:00:00Z',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const result = await updateMessagingWorkspacePost(
      'http://localhost:8000',
      'msg-1',
      {
        body: 'Updated body',
      },
    )

    assert.equal(result.message_id, 'msg-1')
    assert.equal(requests[0]?.url, 'http://localhost:8000/messages/workspace/posts/msg-1')
    assert.equal(requests[0]?.init?.method, 'PATCH')
    assert.equal(
      requests[0]?.init?.body,
      JSON.stringify({
        body: 'Updated body',
      }),
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('updateMessagingWorkspacePost can persist explicit reaction changes', async () => {
  const originalFetch = global.fetch
  const requests: { url: string; init?: RequestInit }[] = []

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        message_id: 'msg-2',
        conversation_id: 'ectrm-assistant',
        source: 'human',
        body: 'Acknowledged.',
        parent_message_id: null,
        thread_root_message_id: 'msg-2',
        author: {
          name: 'Messaging Admin',
          title: 'Desk operator',
          presence: 'You',
          initials: 'MA',
          tone: 'human',
        },
        assistant_run_id: null,
        assistant_agent_id: null,
        assistant_agent_name: null,
        created_by_user_id: 'messaging.admin',
        created_by_session_id: 'session-1',
        created_by_role: 'OPS_ADMIN',
        reactions: ['👍', '👀'],
        attachment: null,
        edited_at: null,
        deleted_at: null,
        pinned_at: null,
        created_at: '2026-05-16T20:00:00Z',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    await updateMessagingWorkspacePost('http://localhost:8000', 'msg-2', {
      reactions: ['👍', '👀'],
    })

    assert.equal(
      requests[0]?.init?.body,
      JSON.stringify({
        reactions: ['👍', '👀'],
      }),
    )
  } finally {
    global.fetch = originalFetch
  }
})
