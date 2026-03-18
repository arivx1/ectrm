import { fetchJson, postJson, putJson } from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import type {
  AssistantAdminAgent,
  AssistantAgent,
  AssistantPromptContext,
  AssistantPromptContextRequest,
  AssistantPromptRequest,
  AssistantPromptResponse,
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
  system_prompt: string
}

export type UpdateAssistantAgentInput = Omit<CreateAssistantAgentInput, 'agent_id'>

function assistantHeaders(): Headers {
  return buildMutationHeaders()
}

export async function loadAssistantRuntimeSettings(apiBase: string): Promise<AssistantRuntimeSettings> {
  return fetchJson<AssistantRuntimeSettings>(`${apiBase}/assistant/settings`)
}

export async function listAssistantAgents(apiBase: string): Promise<AssistantAgent[]> {
  return fetchJson<AssistantAgent[]>(`${apiBase}/assistant/agents`)
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
