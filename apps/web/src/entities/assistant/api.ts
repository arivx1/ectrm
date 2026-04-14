import {
  createApiError,
  fetchJson,
  getResponseCorrelationId,
  postJson,
  putJson,
  requestOk,
} from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import type {
  AssistantActionRequest,
  AssistantActionRequestStatus,
  AssistantAdminAgent,
  AssistantAgent,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantPromptContext,
  AssistantPromptContextRequest,
  AssistantPromptRequest,
  AssistantPromptResponse,
  AssistantProvider,
  AssistantRun,
  AssistantRunSummary,
  AssistantRuntimeSettings,
} from '../../shared/models'

export type CreateAssistantAgentInput = {
  agent_id: string
  name: string
  description: string
  status: AssistantAdminAgent['status']
  scope: AssistantAdminAgent['scope']
  provider: AssistantAdminAgent['provider']
  model: AssistantAdminAgent['model']
  allowed_workspaces: AssistantAdminAgent['allowed_workspaces']
  capabilities: AssistantAdminAgent['capabilities']
  allowed_tools: AssistantAdminAgent['allowed_tools']
  allowed_action_types: AssistantAdminAgent['allowed_action_types']
  system_prompt: string
}

export type UpdateAssistantAgentInput = Omit<CreateAssistantAgentInput, 'agent_id'>

export type BuildAssistantAgentDraftInput = {
  brief: string
  current_draft?: {
    agent_id?: string
    name?: string
    description?: string
    status?: AssistantAdminAgent['status']
    scope?: AssistantAdminAgent['scope']
    provider?: AssistantAdminAgent['provider']
    model?: AssistantAdminAgent['model']
    allowed_workspaces?: AssistantAdminAgent['allowed_workspaces']
    capabilities?: AssistantAdminAgent['capabilities']
    allowed_tools?: AssistantAdminAgent['allowed_tools']
    allowed_action_types?: AssistantAdminAgent['allowed_action_types']
    system_prompt?: string
  }
}

export type BuildAssistantAgentDraftResult = Omit<CreateAssistantAgentInput, 'provider' | 'model'> & {
  provider: AssistantProvider
  model: string
  builder_provider: AssistantProvider
  builder_model: string
  warnings: string[]
}

export type AssistantStreamEvent = {
  event: string
  data: Record<string, unknown>
}

function assistantMutationHeaders(): Headers {
  return buildMutationHeaders()
}

function assistantReadHeaders(accessToken?: string): Headers | undefined {
  const normalizedAccessToken = accessToken?.trim()
  if (!normalizedAccessToken) {
    return undefined
  }

  return new Headers({ Authorization: `Bearer ${normalizedAccessToken}` })
}

function actionRequestQuery(init?: {
  status?: AssistantActionRequestStatus
  limit?: number
  offset?: number
}): string {
  const params = new URLSearchParams()
  if (init?.status) {
    params.set('status', init.status)
  }
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  if (typeof init?.offset === 'number') {
    params.set('offset', String(init.offset))
  }
  return params.size > 0 ? `?${params.toString()}` : ''
}

export async function loadAssistantRuntimeSettings(apiBase: string): Promise<AssistantRuntimeSettings> {
  return fetchJson<AssistantRuntimeSettings>(`${apiBase}/assistant/settings`)
}

export async function listAssistantAgents(apiBase: string): Promise<AssistantAgent[]> {
  return fetchJson<AssistantAgent[]>(`${apiBase}/assistant/agents`)
}

export async function listAssistantConversations(
  apiBase: string,
  init?: { accessToken?: string; limit?: number },
): Promise<AssistantConversationSummary[]> {
  const params = new URLSearchParams()
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return fetchJson<AssistantConversationSummary[]>(`${apiBase}/assistant/conversations${suffix}`, {
    headers: assistantReadHeaders(init?.accessToken),
  })
}

export async function getAssistantConversation(
  apiBase: string,
  conversationId: number,
  init?: { accessToken?: string },
): Promise<AssistantConversation> {
  return fetchJson<AssistantConversation>(
    `${apiBase}/assistant/conversations/${encodeURIComponent(String(conversationId))}`,
    {
      headers: assistantReadHeaders(init?.accessToken),
    },
  )
}

export async function listAssistantRuns(
  apiBase: string,
  init?: { accessToken?: string; limit?: number },
): Promise<AssistantRunSummary[]> {
  const params = new URLSearchParams()
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return fetchJson<AssistantRunSummary[]>(`${apiBase}/assistant/runs${suffix}`, {
    headers: assistantReadHeaders(init?.accessToken),
  })
}

export async function getAssistantRun(
  apiBase: string,
  runId: number,
  init?: { accessToken?: string },
): Promise<AssistantRun> {
  return fetchJson<AssistantRun>(`${apiBase}/assistant/runs/${encodeURIComponent(String(runId))}`, {
    headers: assistantReadHeaders(init?.accessToken),
  })
}

export async function listAssistantActionRequests(
  apiBase: string,
  init?: {
    accessToken?: string
    status?: AssistantActionRequestStatus
    limit?: number
    offset?: number
  },
): Promise<AssistantActionRequest[]> {
  return fetchJson<AssistantActionRequest[]>(
    `${apiBase}/assistant/action-requests${actionRequestQuery(init)}`,
    {
      headers: assistantReadHeaders(init?.accessToken),
    },
  )
}

export async function requestAssistantResponse(
  apiBase: string,
  payload: AssistantPromptRequest,
  init?: { accessToken?: string },
): Promise<AssistantPromptResponse> {
  return postJson<AssistantPromptResponse>(
    `${apiBase}/assistant/respond`,
    payload as unknown as Record<string, unknown>,
    { headers: assistantReadHeaders(init?.accessToken) },
  )
}

export async function streamAssistantResponse(
  apiBase: string,
  payload: AssistantPromptRequest,
  init: {
    accessToken?: string
    onEvent: (event: AssistantStreamEvent) => void
  },
): Promise<void> {
  const headers = assistantReadHeaders(init.accessToken) ?? new Headers()
  headers.set('Content-Type', 'application/json')

  const response = await requestOk(`${apiBase}/assistant/respond/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const correlationId = getResponseCorrelationId(response)

  if (!response.body) {
    throw createApiError('Assistant stream returned no body.', {
      status: response.status,
      correlationId,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function raiseStreamError(event: AssistantStreamEvent): never {
    const detail =
      typeof event.data.detail === 'string'
        ? event.data.detail
        : 'Assistant stream failed.'
    throw createApiError(detail, {
      status: response.status,
      correlationId,
    })
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let boundaryIndex = buffer.indexOf('\n\n')
    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)
      const parsedEvent = parseAssistantStreamEvent(rawEvent)
      if (parsedEvent) {
        if (parsedEvent.event === 'error') {
          raiseStreamError(parsedEvent)
        }
        init.onEvent(parsedEvent)
      }
      boundaryIndex = buffer.indexOf('\n\n')
    }

    if (done) {
      break
    }
  }

  const trailingEvent = parseAssistantStreamEvent(buffer.trim())
  if (trailingEvent) {
    if (trailingEvent.event === 'error') {
      raiseStreamError(trailingEvent)
    }
    init.onEvent(trailingEvent)
  }
}

export async function previewAssistantPromptContext(
  apiBase: string,
  payload: AssistantPromptContextRequest,
  init?: { accessToken?: string },
): Promise<AssistantPromptContext> {
  return postJson<AssistantPromptContext>(
    `${apiBase}/assistant/context`,
    payload as unknown as Record<string, unknown>,
    { headers: assistantReadHeaders(init?.accessToken) },
  )
}

function parseAssistantStreamEvent(rawEvent: string): AssistantStreamEvent | null {
  const trimmedEvent = rawEvent.trim()
  if (!trimmedEvent) {
    return null
  }

  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of trimmedEvent.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim() || eventName
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  try {
    return {
      event: eventName,
      data: JSON.parse(dataLines.join('\n')) as Record<string, unknown>,
    }
  } catch {
    return {
      event: eventName,
      data: { raw: dataLines.join('\n') },
    }
  }
}

export async function approveAssistantActionRequest(
  apiBase: string,
  actionRequestId: number,
): Promise<AssistantActionRequest> {
  return postJson<AssistantActionRequest>(
    `${apiBase}/assistant/action-requests/${actionRequestId}/approve`,
    {},
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function rejectAssistantActionRequest(
  apiBase: string,
  actionRequestId: number,
): Promise<AssistantActionRequest> {
  return postJson<AssistantActionRequest>(
    `${apiBase}/assistant/action-requests/${actionRequestId}/reject`,
    {},
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantActionRequests(
  apiBase: string,
  init?: {
    status?: AssistantActionRequestStatus
    limit?: number
    offset?: number
  },
): Promise<AssistantActionRequest[]> {
  return fetchJson<AssistantActionRequest[]>(
    `${apiBase}/admin/assistant/action-requests${actionRequestQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantAgents(apiBase: string): Promise<AssistantAdminAgent[]> {
  return fetchJson<AssistantAdminAgent[]>(`${apiBase}/admin/assistant/agents`, {
    headers: assistantMutationHeaders(),
  })
}

export async function createAssistantAgent(
  apiBase: string,
  payload: CreateAssistantAgentInput,
): Promise<AssistantAdminAgent> {
  const { actorId } = getMutationContext()

  return postJson<AssistantAdminAgent>(
    `${apiBase}/admin/assistant/agents`,
    {
      ...payload,
      created_by: actorId,
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function updateAssistantAgent(
  apiBase: string,
  agentId: string,
  payload: UpdateAssistantAgentInput,
): Promise<AssistantAdminAgent> {
  const { actorId } = getMutationContext()

  return putJson<AssistantAdminAgent>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId)}`,
    {
      ...payload,
      updated_by: actorId,
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function buildAssistantAgentDraft(
  apiBase: string,
  payload: BuildAssistantAgentDraftInput,
): Promise<BuildAssistantAgentDraftResult> {
  const normalizedDraft = payload.current_draft
    ? {
        ...(payload.current_draft.agent_id?.trim()
          ? { agent_id: payload.current_draft.agent_id.trim() }
          : {}),
        ...(payload.current_draft.name?.trim() ? { name: payload.current_draft.name.trim() } : {}),
        ...(payload.current_draft.description?.trim()
          ? { description: payload.current_draft.description.trim() }
          : {}),
        ...(payload.current_draft.status ? { status: payload.current_draft.status } : {}),
        ...(payload.current_draft.scope ? { scope: payload.current_draft.scope } : {}),
        ...(payload.current_draft.provider ? { provider: payload.current_draft.provider } : {}),
        ...(payload.current_draft.model?.trim() ? { model: payload.current_draft.model.trim() } : {}),
        allowed_workspaces: payload.current_draft.allowed_workspaces ?? [],
        capabilities: payload.current_draft.capabilities ?? [],
        allowed_tools: payload.current_draft.allowed_tools ?? [],
        allowed_action_types: payload.current_draft.allowed_action_types ?? [],
        ...(payload.current_draft.system_prompt?.trim()
          ? { system_prompt: payload.current_draft.system_prompt.trim() }
          : {}),
      }
    : undefined

  return postJson<BuildAssistantAgentDraftResult>(
    `${apiBase}/admin/assistant/agents/build`,
    {
      brief: payload.brief.trim(),
      ...(normalizedDraft ? { current_draft: normalizedDraft } : {}),
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}
