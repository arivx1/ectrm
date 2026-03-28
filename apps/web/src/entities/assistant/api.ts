import { fetchJson, postJson, putJson } from '../../shared/api'
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
  system_prompt: string
}

export type UpdateAssistantAgentInput = Omit<CreateAssistantAgentInput, 'agent_id'>

export type AssistantStreamEvent = {
  event: string
  data: Record<string, unknown>
}

function assistantHeaders(): Headers {
  return buildMutationHeaders()
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
  init?: { headers?: HeadersInit; limit?: number },
): Promise<AssistantConversationSummary[]> {
  const params = new URLSearchParams()
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return fetchJson<AssistantConversationSummary[]>(`${apiBase}/assistant/conversations${suffix}`, {
    headers: init?.headers,
  })
}

export async function getAssistantConversation(
  apiBase: string,
  conversationId: number,
  init?: { headers?: HeadersInit },
): Promise<AssistantConversation> {
  return fetchJson<AssistantConversation>(
    `${apiBase}/assistant/conversations/${encodeURIComponent(String(conversationId))}`,
    {
      headers: init?.headers,
    },
  )
}

export async function listAssistantRuns(
  apiBase: string,
  init?: { headers?: HeadersInit; limit?: number },
): Promise<AssistantRunSummary[]> {
  const params = new URLSearchParams()
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return fetchJson<AssistantRunSummary[]>(`${apiBase}/assistant/runs${suffix}`, {
    headers: init?.headers,
  })
}

export async function getAssistantRun(
  apiBase: string,
  runId: number,
  init?: { headers?: HeadersInit },
): Promise<AssistantRun> {
  return fetchJson<AssistantRun>(`${apiBase}/assistant/runs/${encodeURIComponent(String(runId))}`, {
    headers: init?.headers,
  })
}

export async function listAssistantActionRequests(
  apiBase: string,
  init?: {
    headers?: HeadersInit
    status?: AssistantActionRequestStatus
    limit?: number
    offset?: number
  },
): Promise<AssistantActionRequest[]> {
  return fetchJson<AssistantActionRequest[]>(
    `${apiBase}/assistant/action-requests${actionRequestQuery(init)}`,
    {
      headers: init?.headers,
    },
  )
}

export async function requestAssistantResponse(
  apiBase: string,
  payload: AssistantPromptRequest,
  init?: { headers?: HeadersInit },
): Promise<AssistantPromptResponse> {
  return postJson<AssistantPromptResponse>(
    `${apiBase}/assistant/respond`,
    payload as unknown as Record<string, unknown>,
    { headers: init?.headers },
  )
}

export async function streamAssistantResponse(
  apiBase: string,
  payload: AssistantPromptRequest,
  init: {
    headers?: HeadersInit
    onEvent: (event: AssistantStreamEvent) => void
  },
): Promise<void> {
  const response = await fetch(`${apiBase}/assistant/respond/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await buildApiError(response)
  }

  if (!response.body) {
    throw new Error('Assistant stream returned no body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let boundaryIndex = buffer.indexOf('\n\n')
    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)
      const parsedEvent = parseAssistantStreamEvent(rawEvent)
      if (parsedEvent) {
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
    init.onEvent(trailingEvent)
  }
}

export async function previewAssistantPromptContext(
  apiBase: string,
  payload: AssistantPromptContextRequest,
  init?: { headers?: HeadersInit },
): Promise<AssistantPromptContext> {
  return postJson<AssistantPromptContext>(
    `${apiBase}/assistant/context`,
    payload as unknown as Record<string, unknown>,
    { headers: init?.headers },
  )
}

async function buildApiError(response: Response): Promise<Error> {
  const text = await response.text()
  if (text) {
    let payload:
      | {
          detail?: unknown
          error?: {
            message?: unknown
          }
        }
      | null = null

    try {
      payload = JSON.parse(text) as {
        detail?: unknown
        error?: {
          message?: unknown
        }
      }
    } catch {
      // Fall back to the raw response body when it is not valid JSON.
    }

    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return new Error(payload.detail)
    }

    if (typeof payload?.error?.message === 'string' && payload.error.message.trim()) {
      return new Error(payload.error.message)
    }
  }

  return new Error(text || `Request failed: ${response.status}`)
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
      headers: assistantHeaders(),
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
      headers: assistantHeaders(),
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
      headers: assistantHeaders(),
    },
  )
}

export async function listAdminAssistantAgents(apiBase: string): Promise<AssistantAdminAgent[]> {
  return fetchJson<AssistantAdminAgent[]>(`${apiBase}/admin/assistant/agents`, {
    headers: assistantHeaders(),
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
      headers: assistantHeaders(),
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
      headers: assistantHeaders(),
    },
  )
}
