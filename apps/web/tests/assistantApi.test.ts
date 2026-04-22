import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import type { AssistantPromptRequest } from '../src/shared/models.ts'

const { fetchJsonMock, postJsonMock, putJsonMock, requestOkMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
  putJsonMock: vi.fn(),
  requestOkMock: vi.fn(),
}))

vi.mock('../src/shared/mutation.ts', () => ({
  buildMutationHeaders: (headers?: HeadersInit) => {
    const merged = new Headers(headers)
    merged.set('Authorization', 'Bearer mutation-token')
    return merged
  },
  getMutationContext: () => ({
    actorId: 'assistant_user',
    accessToken: 'mutation-token',
    role: 'OPS_ADMIN',
  }),
}))

vi.mock('../src/shared/api.ts', () => ({
  createApiError: (message: string, init?: { status?: number; correlationId?: string | null }) =>
    Object.assign(new Error(message), init),
  fetchJson: fetchJsonMock,
  getResponseCorrelationId: (response: Pick<Response, 'headers'>) => response.headers.get('x-correlation-id'),
  postJson: postJsonMock,
  putJson: putJsonMock,
  requestOk: requestOkMock,
}))

import {
  buildAssistantAgentDraft,
  getAssistantConversation,
  listAssistantActionRequests,
  listAssistantConversations,
  previewAssistantPromptContext,
  streamAssistantResponse,
} from '../src/entities/assistant/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
  postJsonMock.mockReset()
  putJsonMock.mockReset()
  requestOkMock.mockReset()
})

test('listAssistantConversations builds limit and authorization into the helper request', async () => {
  const expected = [{ conversation_id: 1 }]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAssistantConversations('http://api.test', {
    accessToken: 'conversation-token',
    limit: 12,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/conversations?limit=12')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer conversation-token')
})

test('getAssistantConversation owns the encoded detail URL and auth headers', async () => {
  const expected = { conversation_id: 42 }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAssistantConversation('http://api.test', 42, {
    accessToken: 'detail-token',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/conversations/42')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer detail-token')
})

test('listAssistantActionRequests centralizes query-string assembly for pending approvals', async () => {
  const expected = [{ action_request_id: 7 }]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAssistantActionRequests('http://api.test', {
    accessToken: 'actions-token',
    status: 'PENDING',
    limit: 12,
    offset: 3,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/action-requests?status=PENDING&limit=12&offset=3')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer actions-token')
})

test('previewAssistantPromptContext sends typed payloads with access-token-based auth', async () => {
  const request = {
    provider: 'OPENAI',
    workspace: 'assistant',
    use_live_tools: true,
  }
  const expected = { provider: 'OPENAI', model: 'gpt-5.4' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await previewAssistantPromptContext('http://api.test', request, {
    accessToken: 'preview-token',
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/context')
  assert.deepEqual(body, request)
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer preview-token')
})

test('streamAssistantResponse derives auth headers from the typed helper options', async () => {
  const payload: AssistantPromptRequest = {
    provider: 'OPENAI',
    workspace: 'assistant',
    messages: [{ role: 'user', content: 'Hello' }],
  }
  const receivedEvents: unknown[] = []
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('event: assistant.delta\ndata: {"chunk":"Hello back"}\n\n'),
      )
      controller.close()
    },
  })
  requestOkMock.mockResolvedValueOnce(
    new Response(stream, {
      status: 200,
      headers: { 'x-correlation-id': 'corr-123' },
    }),
  )

  await streamAssistantResponse('http://api.test', payload, {
    accessToken: 'stream-token',
    onEvent: (event) => {
      receivedEvents.push(event)
    },
  })

  const [url, init] = requestOkMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/respond/stream')
  assert.equal((init as RequestInit | undefined)?.method, 'POST')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer stream-token')
  assert.equal(headers.get('Content-Type'), 'application/json')
  assert.deepEqual(receivedEvents, [
    {
      event: 'assistant.delta',
      data: { chunk: 'Hello back' },
    },
  ])
})

test('buildAssistantAgentDraft posts the normalized current draft to the admin builder route', async () => {
  const expected = {
    agent_id: 'ops-briefing',
    name: 'Ops Briefing',
    description: 'Summarizes queue pressure.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5-mini',
    allowed_workspaces: ['assistant', 'operations'],
    capabilities: ['READ', 'EXPLAIN'],
    allowed_tools: ['list_workflow_items'],
    allowed_action_types: [],
    system_prompt: 'Summarize the queue.',
    builder_provider: 'openai',
    builder_model: 'gpt-5',
    warnings: [],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await buildAssistantAgentDraft('http://api.test', {
    brief: '  Build an operations briefing agent.  ',
    current_draft: {
      agent_id: '  ops-briefing  ',
      name: '  Ops Briefing  ',
      description: '  Summarizes queue pressure. ',
      status: 'DRAFT',
      scope: 'TEAM',
      provider: null,
      model: '  ',
      allowed_workspaces: ['assistant', 'operations'],
      capabilities: ['READ', 'EXPLAIN'],
      allowed_tools: ['list_workflow_items'],
      allowed_action_types: [],
      system_prompt: '  Summarize the queue.  ',
    },
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/agents/build')
  assert.deepEqual(body, {
    brief: 'Build an operations briefing agent.',
    current_draft: {
      agent_id: 'ops-briefing',
      name: 'Ops Briefing',
      description: 'Summarizes queue pressure.',
      status: 'DRAFT',
      scope: 'TEAM',
      allowed_workspaces: ['assistant', 'operations'],
      capabilities: ['READ', 'EXPLAIN'],
      allowed_tools: ['list_workflow_items'],
      allowed_action_types: [],
      system_prompt: 'Summarize the queue.',
    },
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})
