import type {
  AssistantAdminAgent,
  AssistantAgentRevisionDiff,
  AssistantProvider,
} from '../../shared/models'
import type { AgentBuilderDraft } from './assistantAgentBuilder'

type ComparableConstruction = {
  name: string
  description: string
  status: string
  scope: string
  provider: string | null
  model: string | null
  role_key: string | null
  profile_kind: string
  specialization_summary: string | null
  human_owner_role: string | null
  authority_ceiling: string | null
  activation_notes: string | null
  orchestration_pattern: string
  parent_agent_id: string | null
  managed_agent_ids: string[]
  delegation_guidance: string | null
  profile_request_id: number | null
  allowed_workspaces: string[]
  capabilities: string[]
  skills: string[]
  allowed_tools: string[]
  allowed_action_types: string[]
  daily_token_allocation: number | null
  system_prompt: string
}

const DRAFT_CONSTRUCTION_DIFF_FIELDS: Array<[keyof ComparableConstruction, string]> = [
  ['name', 'Name'],
  ['description', 'Description'],
  ['status', 'Status'],
  ['scope', 'Scope'],
  ['provider', 'Provider'],
  ['model', 'Model'],
  ['role_key', 'Role archetype'],
  ['profile_kind', 'Profile kind'],
  ['specialization_summary', 'Specialization'],
  ['human_owner_role', 'Human owner role'],
  ['authority_ceiling', 'Authority ceiling'],
  ['activation_notes', 'Activation notes'],
  ['orchestration_pattern', 'Orchestration pattern'],
  ['parent_agent_id', 'Parent agent'],
  ['managed_agent_ids', 'Managed agents'],
  ['delegation_guidance', 'Delegation guidance'],
  ['profile_request_id', 'Profile request'],
  ['allowed_workspaces', 'Allowed workspaces'],
  ['capabilities', 'Capabilities'],
  ['skills', 'Skills'],
  ['allowed_tools', 'Allowed tools'],
  ['allowed_action_types', 'Allowed actions'],
  ['daily_token_allocation', 'Daily token allocation'],
  ['system_prompt', 'System prompt'],
]

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeDailyTokenAllocation(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) {
    return null
  }
  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatConstructionValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((entry) => String(entry)).join(', ') : 'None'
  }
  if (value === null || value === undefined || value === '') {
    return 'None'
  }
  const rendered = String(value)
  return rendered.length > 180 ? `${rendered.slice(0, 177)}...` : rendered
}

function comparableFromAgent(agent: AssistantAdminAgent): ComparableConstruction {
  return {
    name: agent.name,
    description: agent.description,
    status: agent.status,
    scope: agent.scope,
    provider: agent.provider,
    model: agent.model,
    role_key: agent.role_key ?? null,
    profile_kind: agent.profile_kind,
    specialization_summary: agent.specialization_summary ?? null,
    human_owner_role: agent.human_owner_role ?? null,
    authority_ceiling: agent.authority_ceiling ?? null,
    activation_notes: agent.activation_notes ?? null,
    orchestration_pattern: agent.orchestration_pattern,
    parent_agent_id: agent.parent_agent_id ?? null,
    managed_agent_ids: [...agent.managed_agent_ids],
    delegation_guidance: agent.delegation_guidance ?? null,
    profile_request_id: agent.profile_request_id ?? null,
    allowed_workspaces: [...agent.allowed_workspaces],
    capabilities: [...agent.capabilities],
    skills: [...agent.skills],
    allowed_tools: [...agent.allowed_tools],
    allowed_action_types: [...agent.allowed_action_types],
    daily_token_allocation: agent.daily_token_allocation ?? null,
    system_prompt: agent.system_prompt,
  }
}

function comparableFromDraft(form: AgentBuilderDraft): ComparableConstruction {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    status: form.status,
    scope: form.scope,
    provider: form.provider || null,
    model: normalizeOptionalText(form.model),
    role_key: normalizeOptionalText(form.role_key),
    profile_kind: form.profile_kind,
    specialization_summary: normalizeOptionalText(form.specialization_summary),
    human_owner_role: normalizeOptionalText(form.human_owner_role),
    authority_ceiling: form.authority_ceiling || null,
    activation_notes: normalizeOptionalText(form.activation_notes),
    orchestration_pattern: form.orchestration_pattern,
    parent_agent_id: normalizeOptionalText(form.parent_agent_id),
    managed_agent_ids: [...form.managed_agent_ids],
    delegation_guidance: normalizeOptionalText(form.delegation_guidance),
    profile_request_id: form.profile_request_id,
    allowed_workspaces: [...form.allowed_workspaces],
    capabilities: [...form.capabilities],
    skills: [...form.skills],
    allowed_tools: [...form.allowed_tools],
    allowed_action_types: [...form.allowed_action_types],
    daily_token_allocation: normalizeDailyTokenAllocation(form.daily_token_allocation),
    system_prompt: form.system_prompt.trim(),
  }
}

function constructionValuesMatch(currentValue: unknown, nextValue: unknown): boolean {
  return JSON.stringify(currentValue ?? null) === JSON.stringify(nextValue ?? null)
}

export function buildDraftConstructionDiffSummary(
  currentAgent: AssistantAdminAgent,
  draft: AgentBuilderDraft,
): AssistantAgentRevisionDiff[] {
  const current = comparableFromAgent(currentAgent)
  const next = comparableFromDraft(draft)

  return DRAFT_CONSTRUCTION_DIFF_FIELDS.flatMap(([fieldKey, label]) => {
    if (constructionValuesMatch(current[fieldKey], next[fieldKey])) {
      return []
    }
    return [
      {
        field_key: fieldKey,
        label,
        current_value: formatConstructionValue(current[fieldKey]),
        next_value: formatConstructionValue(next[fieldKey]),
      },
    ]
  })
}

export function buildDraftPreviewAgent(
  currentAgent: AssistantAdminAgent,
  draft: AgentBuilderDraft,
): AssistantAdminAgent {
  const next = comparableFromDraft(draft)
  return {
    ...currentAgent,
    name: next.name,
    description: next.description,
    status: draft.status,
    scope: draft.scope,
    provider: next.provider as AssistantProvider | null,
    model: next.model,
    role_key: next.role_key,
    profile_kind: draft.profile_kind,
    specialization_summary: next.specialization_summary,
    human_owner_role: next.human_owner_role,
    authority_ceiling: draft.authority_ceiling || null,
    activation_notes: next.activation_notes,
    orchestration_pattern: draft.orchestration_pattern,
    parent_agent_id: next.parent_agent_id,
    managed_agent_ids: [...draft.managed_agent_ids],
    delegation_guidance: next.delegation_guidance,
    profile_request_id: draft.profile_request_id,
    allowed_workspaces: [...draft.allowed_workspaces],
    capabilities: [...draft.capabilities],
    skills: [...draft.skills],
    allowed_tools: [...draft.allowed_tools],
    allowed_action_types: [...draft.allowed_action_types],
    daily_token_allocation: next.daily_token_allocation,
    system_prompt: next.system_prompt,
    has_unpublished_revision: true,
  }
}
