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
  getAdminAssistantOutcomeMetrics,
  getAdminAssistantRunAuditTrace,
  getAssistantConversation,
  listAdminAssistantActionRequests,
  listAdminAssistantRoleArchetypes,
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

test('listAdminAssistantActionRequests includes history filters and returns the page payload', async () => {
  const expected = {
    items: [{ action_request_id: 7 }],
    total_count: 1,
    limit: 20,
    offset: 40,
    has_more: false,
    summary: {
      total_count: 1,
      pending_count: 0,
      executed_count: 0,
      rejected_count: 1,
      failed_count: 0,
      avg_decision_seconds: 90,
    },
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantActionRequests('http://api.test', {
    status: 'REJECTED',
    actionType: 'cancel_trade',
    agentId: 'ops-governor',
    userId: 'trader.alpha',
    decidedBy: 'ops_admin',
    search: 'T-1014',
    createdAfter: '2026-04-01',
    createdBefore: '2026-04-30',
    decidedAfter: '2026-04-02',
    decidedBefore: '2026-04-29',
    limit: 20,
    offset: 40,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/action-requests?status=REJECTED&action_type=cancel_trade&agent_id=ops-governor&user_id=trader.alpha&decided_by=ops_admin&search=T-1014&created_after=2026-04-01&created_before=2026-04-30&decided_after=2026-04-02&decided_before=2026-04-29&limit=20&offset=40',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantOutcomeMetrics includes advisory filters and admin auth', async () => {
  const expected = {
    generated_at: '2026-04-11T09:00:00Z',
    created_after: '2026-04-01T00:00:00',
    created_before: '2026-04-30T23:59:59',
    thresholds: {
      min_decided_actions_for_promotion: 10,
      max_rejection_rate_for_promotion: 0.1,
      max_failed_execution_rate_for_promotion: 0.02,
      max_stale_action_rate_for_promotion: 0.05,
      max_pending_actions_for_promotion: 0,
      min_decided_actions_for_pause_signal: 5,
      rejection_rate_pause_threshold: 0.4,
      failed_execution_rate_pause_threshold: 0.1,
      stale_action_rate_pause_threshold: 0.25,
      oldest_pending_hours_pause_threshold: 72,
    },
    by_agent: [],
    by_action_type: [],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantOutcomeMetrics('http://api.test', {
    agentId: ' ops-governor ',
    actionType: ' cancel_trade ',
    createdAfter: '2026-04-01T00:00:00',
    createdBefore: '2026-04-30T23:59:59',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/outcome-metrics?agent_id=ops-governor&action_type=cancel_trade&created_after=2026-04-01T00%3A00%3A00&created_before=2026-04-30T23%3A59%3A59',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantRunAuditTrace owns the admin trace URL and mutation auth', async () => {
  const expected = {
    run: { run_id: 701 },
    action_requests: [],
    timeline: [],
    mutation_event_count: 0,
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantRunAuditTrace('http://api.test', 701)

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/runs/701/audit-trace')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('listAdminAssistantRoleArchetypes loads the server-owned role catalog with admin auth', async () => {
  const expected = [
    {
      role_key: 'trade-ops-copilot',
      name: 'Trade Ops Copilot',
      catalog_status: 'SEEDED',
    },
  ]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantRoleArchetypes('http://api.test')

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/role-archetypes')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
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
