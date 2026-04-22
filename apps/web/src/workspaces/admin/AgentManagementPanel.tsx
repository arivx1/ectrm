import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  approveAssistantAgentProfileRequest,
  buildAssistantAgentDraft,
  createAssistantAgentProfileRequest,
  createAssistantAgent,
  listAdminAssistantAgents,
  listAdminAssistantProfileRequests,
  listAdminAssistantRoleArchetypes,
  loadAssistantRuntimeSettings,
  rejectAssistantAgentProfileRequest,
  simulateAssistantAgentPolicy,
  updateAssistantAgent,
  type CreateAssistantAgentInput,
  type CreateAssistantAgentProfileRequestInput,
  type SimulateAssistantAgentPolicyInput,
  type UpdateAssistantAgentInput,
} from '../../entities/assistant/api'
import {
  assistantBudgetSignalClass,
  assistantBudgetSignalLabel,
  budgetMeterWidth,
  describeAssistantTokenBudget,
  formatBudgetPercent,
  formatTokenCount,
  isAgentBudgetDepleted,
  isAgentBudgetNearLimit,
} from '../../entities/assistant/budget'
import { seedAssistantAgents } from '../../entities/app/adminApi'
import { workspaceLabel } from '../../entities/app/appViews'
import { appConfig } from '../../shared/config'
import { ASSISTANT_ACTION_TYPES } from '../../shared/models'
import type {
  AssistantActionType,
  AssistantAdminAgent,
  AssistantAgentAuthorityLevel,
  AssistantAgentCapability,
  AssistantAgentProfileKind,
  AssistantAgentProfileRequest,
  AssistantAgentRoleArchetype,
  AssistantAgentScope,
  AssistantAgentStatus,
  AssistantPolicyDecision,
  AssistantPolicySimulation,
  AssistantPolicySimulationPhase,
  AssistantProvider,
  AssistantProviderStatus,
  ViewKey,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  AGENT_BUILDER_TEMPLATES,
  AGENT_BUILDER_WORKSPACE_OPTIONS,
  buildAgentBuilderDraftFromRole,
  buildAgentBuilderDraft,
  createEmptyAgentBuilderDraft,
  describeProfileKind,
  evaluateAgentRoleProfileFit,
  getAgentBuilderTemplate,
  suggestAgentBuilderAgentId,
  type AgentBuilderDraft,
  type AgentBuilderTemplateKey,
  type AgentRoleProfileFit,
  type AgentRoleProfileFitStatus,
} from './assistantAgentBuilder'

type AgentManagementPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AgentForm = AgentBuilderDraft

type ProfileRequestForm = {
  requested_agent_id: string
  business_problem: string
  proposed_mission: string
  human_owner_role: string
  requested_workspaces: ViewKey[]
  work_objects: string
  requested_inputs_tools: string[]
  expected_outputs: string
  requested_authority_ceiling: AssistantAgentAuthorityLevel
  stop_conditions: string
  success_metrics: string
  proposed_eval_cases: string
}

const STATUS_OPTIONS: AssistantAgentStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED']
const SCOPE_OPTIONS: AssistantAgentScope[] = ['PERSONAL', 'TEAM', 'ORGANIZATION']
const PROVIDER_OPTIONS: Array<AssistantProvider | ''> = ['', 'openai', 'anthropic', 'google']
const WORKSPACE_OPTIONS: ViewKey[] = AGENT_BUILDER_WORKSPACE_OPTIONS
const CAPABILITY_OPTIONS: AssistantAgentCapability[] = ['READ', 'EXPLAIN', 'DRAFT', 'ACTION']
const PROFILE_KIND_OPTIONS: AssistantAgentProfileKind[] = ['CUSTOM', 'ROLE_DERIVED', 'CURATED']
const AUTHORITY_OPTIONS: AssistantAgentAuthorityLevel[] = [
  'OBSERVE',
  'EXPLAIN',
  'DRAFT',
  'STAGE',
  'EXECUTE',
  'EXTERNAL_COMMIT',
]
const ACTION_TYPE_OPTIONS: AssistantActionType[] = [...ASSISTANT_ACTION_TYPES]
const ACTION_TYPE_LABELS: Record<AssistantActionType, string> = {
  cancel_trade: 'Cancel trade',
  issue_trade_confirmation: 'Issue confirmation',
  record_trade_confirmation_response: 'Record confirmation response',
  update_trade_workflow_item: 'Update workflow item',
  issue_trade_invoice: 'Issue invoice',
  create_trade_payment: 'Create payment',
  reprocess_document_ingestion: 'Reprocess document ingestion',
}

function createEmptyProfileRequestForm(): ProfileRequestForm {
  return {
    requested_agent_id: '',
    business_problem: '',
    proposed_mission: '',
    human_owner_role: '',
    requested_workspaces: ['assistant'],
    work_objects: '',
    requested_inputs_tools: [],
    expected_outputs: '',
    requested_authority_ceiling: 'DRAFT',
    stop_conditions: '',
    success_metrics: '',
    proposed_eval_cases: '',
  }
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeProfileRequestPayload(form: ProfileRequestForm): CreateAssistantAgentProfileRequestInput {
  return {
    requested_agent_id: form.requested_agent_id.trim() || null,
    business_problem: form.business_problem.trim(),
    proposed_mission: form.proposed_mission.trim(),
    human_owner_role: form.human_owner_role.trim(),
    requested_workspaces: form.requested_workspaces,
    work_objects: splitLines(form.work_objects),
    requested_inputs_tools: form.requested_inputs_tools,
    expected_outputs: splitLines(form.expected_outputs),
    requested_authority_ceiling: form.requested_authority_ceiling,
    stop_conditions: splitLines(form.stop_conditions),
    success_metrics: splitLines(form.success_metrics),
    proposed_eval_cases: splitLines(form.proposed_eval_cases),
  }
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function toAgentForm(agent: AssistantAdminAgent): AgentForm {
  return {
    agent_id: agent.agent_id,
    name: agent.name,
    description: agent.description,
    status: agent.status,
    scope: agent.scope,
    provider: agent.provider ?? '',
    model: agent.model ?? '',
    role_key: agent.role_key ?? '',
    profile_kind: agent.profile_kind ?? 'CUSTOM',
    specialization_summary: agent.specialization_summary ?? '',
    human_owner_role: agent.human_owner_role ?? '',
    authority_ceiling: agent.authority_ceiling ?? '',
    activation_notes: agent.activation_notes ?? '',
    profile_request_id: agent.profile_request_id ?? null,
    allowed_workspaces: [...agent.allowed_workspaces],
    capabilities: [...agent.capabilities],
    allowed_tools: [...agent.allowed_tools],
    allowed_action_types: [...agent.allowed_action_types],
    daily_token_allocation:
      agent.daily_token_allocation === null || agent.daily_token_allocation === undefined
        ? ''
        : String(agent.daily_token_allocation),
    system_prompt: agent.system_prompt,
  }
}

function normalizeAgentPayload(form: AgentForm): CreateAssistantAgentInput {
  const normalizedProvider = form.provider || null
  const normalizedModel = form.model.trim() ? form.model.trim() : null
  const dailyTokenAllocation = normalizeDailyTokenAllocation(form.daily_token_allocation)

  return {
    agent_id: form.agent_id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    status: form.status,
    scope: form.scope,
    provider: normalizedProvider,
    model: normalizedModel,
    role_key: form.role_key.trim() ? form.role_key.trim() : null,
    profile_kind: form.profile_kind,
    specialization_summary: form.specialization_summary.trim() ? form.specialization_summary.trim() : null,
    human_owner_role: form.human_owner_role.trim() ? form.human_owner_role.trim() : null,
    authority_ceiling: form.authority_ceiling || null,
    activation_notes: form.activation_notes.trim() ? form.activation_notes.trim() : null,
    profile_request_id: form.profile_request_id,
    allowed_workspaces: form.allowed_workspaces,
    capabilities: form.capabilities,
    allowed_tools: form.allowed_tools,
    allowed_action_types: form.allowed_action_types,
    daily_token_allocation: dailyTokenAllocation,
    system_prompt: form.system_prompt.trim(),
  }
}

function normalizeDailyTokenAllocation(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) {
    return null
  }
  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function describeDailyTokenAllocationMode(
  value: string,
  inheritedAllocation?: number | null,
): string {
  const trimmedValue = value.trim()
  const allocation = normalizeDailyTokenAllocation(value)
  if (allocation !== null) {
    return `Custom cap: ${formatTokenCount(allocation)} tokens per daily window.`
  }
  if (trimmedValue) {
    return 'Enter a whole number, or leave blank to inherit the platform default.'
  }
  if (typeof inheritedAllocation === 'number') {
    return `Inherited default: ${formatTokenCount(inheritedAllocation)} tokens per daily window.`
  }
  return 'Inherited default: the platform cap will be resolved after save.'
}

function budgetCardToneClass(budgetClass: string): string {
  if (budgetClass === 'is-red') {
    return 'is-budget-red'
  }
  if (budgetClass === 'is-amber') {
    return 'is-budget-amber'
  }
  if (budgetClass === 'is-green') {
    return 'is-budget-green'
  }
  return 'is-budget-pending'
}

function toggleSelection<T extends string>(
  current: T[],
  value: T,
  options?: { minSelections?: number },
): T[] {
  const minSelections = options?.minSelections ?? 0
  if (current.includes(value)) {
    return current.length <= minSelections ? current : current.filter((entry) => entry !== value)
  }
  return [...current, value]
}

function toggleCapability(form: AgentForm, capability: AssistantAgentCapability): AgentForm {
  const nextCapabilities = toggleSelection(form.capabilities, capability, { minSelections: 1 })
  const capabilityRemoved = form.capabilities.includes(capability) && !nextCapabilities.includes(capability)

  return {
    ...form,
    capabilities: nextCapabilities,
    allowed_tools: capabilityRemoved && capability === 'READ' ? [] : form.allowed_tools,
    allowed_action_types:
      capabilityRemoved && capability === 'ACTION' ? [] : form.allowed_action_types,
  }
}

function statusTone(status: AssistantAgentStatus): 'planned' | 'active' | 'cancelled' {
  if (status === 'ACTIVE') {
    return 'active'
  }
  if (status === 'DRAFT') {
    return 'planned'
  }
  return 'cancelled'
}

function describeLiveToolPlan(form: AgentForm, availableTools: string[]): string {
  if (!form.capabilities.includes('READ')) {
    return 'READ is disabled, so this agent will answer without live tools.'
  }
  if (form.allowed_tools.length > 0) {
    return `${form.allowed_tools.length} governed live tool${form.allowed_tools.length === 1 ? '' : 's'} selected.`
  }
  if (form.role_key && form.profile_kind !== 'CUSTOM') {
    return 'No subset pinned, so this profile inherits the role tool defaults on save.'
  }
  if (availableTools.length > 0) {
    return 'No live tools selected; custom agents answer from prompt context only.'
  }
  return 'Published tool options will appear once runtime settings finish loading.'
}

function describeActionPlan(form: AgentForm): string {
  if (!form.capabilities.includes('ACTION')) {
    return 'ACTION is disabled, so this agent cannot stage approval-gated mutations.'
  }
  if (form.allowed_action_types.length > 0) {
    return `${form.allowed_action_types.length} governed action type${form.allowed_action_types.length === 1 ? '' : 's'} selected.`
  }
  return 'Choose at least one explicit governed action before saving an ACTION-capable agent.'
}

function profileRequestStatusTone(
  status: AssistantAgentProfileRequest['status'],
): 'planned' | 'active' | 'cancelled' {
  if (status === 'APPROVED' || status === 'ACTIVATED') {
    return 'active'
  }
  if (status === 'REJECTED') {
    return 'cancelled'
  }
  return 'planned'
}

function titleFromAgentId(agentId: string | null): string {
  if (!agentId) {
    return ''
  }
  return agentId
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function renderPromptList(title: string, values: readonly string[]): string {
  return `${title}:\n${values.map((value) => `- ${value}`).join('\n')}`
}

function buildPromptFromProfileRequest(request: AssistantAgentProfileRequest): string {
  return [
    `You are ${titleFromAgentId(request.requested_agent_id) || 'a specialized managed agent'} inside the ECTRM operator console.`,
    `Business problem: ${request.business_problem}`,
    `Mission: ${request.proposed_mission}`,
    renderPromptList('Expected outputs', request.expected_outputs),
    renderPromptList('Stop conditions', request.stop_conditions),
    renderPromptList('Success metrics', request.success_metrics),
  ].join('\n\n')
}

function describeEffectivePolicy(agent: AssistantAdminAgent): string {
  const policy = agent.effective_policy
  if (!policy) {
    return 'Effective policy will appear after the agent reloads from the policy-aware API.'
  }
  return [
    `${policy.allowed_tools.length} allowed tool${policy.allowed_tools.length === 1 ? '' : 's'}`,
    `${policy.blocked_tools.length} blocked tool${policy.blocked_tools.length === 1 ? '' : 's'}`,
    `${policy.allowed_actions.length} allowed action${policy.allowed_actions.length === 1 ? '' : 's'}`,
    `${policy.blocked_actions.length} blocked action${policy.blocked_actions.length === 1 ? '' : 's'}`,
  ].join(' · ')
}

function findRoleForForm(
  form: AgentForm,
  roleArchetypes: AssistantAgentRoleArchetype[],
): AssistantAgentRoleArchetype | null {
  const roleKey = form.role_key.trim()
  return roleKey ? roleArchetypes.find((role) => role.role_key === roleKey) ?? null : null
}

function fitStatusLabel(status: AgentRoleProfileFitStatus): string {
  if (status === 'inherited') {
    return 'Inherited'
  }
  if (status === 'narrowed') {
    return 'Narrowed'
  }
  if (status === 'expanded') {
    return 'Blocked'
  }
  if (status === 'missing') {
    return 'Needed'
  }
  return 'Custom'
}

function roleCatalogStatusLabel(role: AssistantAgentRoleArchetype): string {
  if (role.catalog_status === 'SEEDED') {
    return 'Seeded'
  }
  if (role.catalog_status === 'TEMPLATE') {
    return 'Template'
  }
  if (role.catalog_status === 'PHASE_1') {
    return 'Phase 1'
  }
  return 'Future'
}

function listSummary(values: readonly string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(' · ') : emptyLabel
}

function actionSummary(values: readonly AssistantActionType[]): string {
  return values.length > 0
    ? values.map((actionType) => ACTION_TYPE_LABELS[actionType]).join(' · ')
    : 'No governed actions'
}

function policyResourceLabel(resourceId: string): string {
  return ACTION_TYPE_LABELS[resourceId as AssistantActionType] ?? resourceId
}

function policyDecisionSummary(
  decisions: readonly AssistantPolicyDecision[],
  emptyLabel: string,
): string {
  return decisions.length > 0
    ? decisions.map((decision) => policyResourceLabel(decision.resource_id)).join(' · ')
    : emptyLabel
}

function firstPolicyDecisionReason(decisions: readonly AssistantPolicyDecision[]): string {
  return decisions[0]?.reason ?? 'No policy decisions in this bucket.'
}

function PromptProfilePreview({
  form,
  role,
}: {
  form: AgentForm
  role: AssistantAgentRoleArchetype | null
}) {
  const previewLines = [
    `${describeProfileKind(form.profile_kind)}${role ? ` · ${role.name}` : ''}`,
    form.human_owner_role ? `Owner: ${form.human_owner_role}` : null,
    form.authority_ceiling ? `Authority: ${form.authority_ceiling}` : null,
    form.specialization_summary ? `Specialization: ${form.specialization_summary}` : null,
    form.system_prompt ? form.system_prompt : 'Prompt instructions are still blank.',
  ].filter(Boolean)

  return (
    <div className="assistant-prompt-profile-preview">
      <strong>Prompt Preview</strong>
      <pre>{previewLines.join('\n\n')}</pre>
    </div>
  )
}

function RoleProfileFitSummary({ fit }: { fit: AgentRoleProfileFit }) {
  return (
    <div className="assistant-profile-fit">
      <div className="assistant-profile-fit-grid">
        {fit.sections.map((section) => (
          <div key={`${section.label}-${section.detail}`} className="assistant-profile-fit-row">
            <span>{section.label}</span>
            <strong className={`assistant-profile-fit-pill is-${section.status}`}>
              {fitStatusLabel(section.status)}
            </strong>
            <small>{section.detail}</small>
          </div>
        ))}
      </div>

      {fit.errors.length > 0 ? (
        <div className="assistant-profile-fit-messages is-error">
          {fit.errors.map((error) => (
            <small key={error}>{error}</small>
          ))}
        </div>
      ) : null}

      {fit.warnings.length > 0 ? (
        <div className="assistant-profile-fit-messages is-warning">
          {fit.warnings.map((warning) => (
            <small key={warning}>{warning}</small>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AgentManagementPanel({
  authSession,
  formatDate,
  onOpenSettings,
}: AgentManagementPanelProps) {
  const requestSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [agentRecords, setAgentRecords] = useState<AssistantAdminAgent[]>([])
  const [profileRequests, setProfileRequests] = useState<AssistantAgentProfileRequest[]>([])
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [roleArchetypes, setRoleArchetypes] = useState<AssistantAgentRoleArchetype[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const [agentFlash, setAgentFlash] = useState<FlashMessage | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedCreateRoleKey, setSelectedCreateRoleKey] = useState<string | null>(null)
  const [selectedCreateTemplateKey, setSelectedCreateTemplateKey] =
    useState<AgentBuilderTemplateKey | null>(null)
  const [profileRequestForm, setProfileRequestForm] = useState<ProfileRequestForm>(() =>
    createEmptyProfileRequestForm(),
  )
  const [profileRequestApprovalNotes, setProfileRequestApprovalNotes] = useState<Record<number, string>>({})
  const [profileRequestRejectionReasons, setProfileRequestRejectionReasons] = useState<Record<number, string>>({})
  const [submittingProfileRequest, setSubmittingProfileRequest] = useState(false)
  const [decidingProfileRequestId, setDecidingProfileRequestId] = useState<number | null>(null)
  const [createForm, setCreateForm] = useState<AgentForm>(() => createEmptyAgentBuilderDraft())
  const [editForm, setEditForm] = useState<AgentForm>(() => createEmptyAgentBuilderDraft())
  const [builderBrief, setBuilderBrief] = useState('')
  const [builderWarnings, setBuilderWarnings] = useState<string[]>([])
  const [openAiProviderStatus, setOpenAiProviderStatus] = useState<AssistantProviderStatus | null>(null)
  const [buildingAgentDraft, setBuildingAgentDraft] = useState(false)
  const [seedingRecommendedAgents, setSeedingRecommendedAgents] = useState(false)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [savingAgent, setSavingAgent] = useState(false)
  const [simulationWorkspace, setSimulationWorkspace] = useState<ViewKey>('assistant')
  const [simulationPhase, setSimulationPhase] = useState<AssistantPolicySimulationPhase>('stage')
  const [simulationActorRole, setSimulationActorRole] = useState(
    authSession?.user.role.trim().toUpperCase() || 'OPS_ADMIN',
  )
  const [simulationPrompt, setSimulationPrompt] = useState('')
  const [simulationContext, setSimulationContext] = useState('')
  const [policySimulation, setPolicySimulation] = useState<AssistantPolicySimulation | null>(null)
  const [policySimulationLoading, setPolicySimulationLoading] = useState(false)
  const [policySimulationError, setPolicySimulationError] = useState('')

  const selectedAgent = useMemo(
    () => agentRecords.find((agent) => agent.agent_id === selectedAgentId) ?? null,
    [agentRecords, selectedAgentId],
  )
  const selectedCreateTemplate = useMemo(
    () => (selectedCreateTemplateKey ? getAgentBuilderTemplate(selectedCreateTemplateKey) : null),
    [selectedCreateTemplateKey],
  )
  const selectedCreateRole = useMemo(
    () =>
      selectedCreateRoleKey
        ? roleArchetypes.find((role) => role.role_key === selectedCreateRoleKey) ?? null
        : null,
    [roleArchetypes, selectedCreateRoleKey],
  )
  const approvedProfileRequests = useMemo(
    () => profileRequests.filter((request) => request.status === 'APPROVED' || request.status === 'ACTIVATED'),
    [profileRequests],
  )
  const createFormRole = useMemo(
    () => findRoleForForm(createForm, roleArchetypes),
    [createForm, roleArchetypes],
  )
  const editFormRole = useMemo(
    () => findRoleForForm(editForm, roleArchetypes),
    [editForm, roleArchetypes],
  )
  const createProfileFit = useMemo(
    () => evaluateAgentRoleProfileFit(createForm, roleArchetypes),
    [createForm, roleArchetypes],
  )
  const editProfileFit = useMemo(
    () => evaluateAgentRoleProfileFit(editForm, roleArchetypes),
    [editForm, roleArchetypes],
  )

  const statusCounts = useMemo(
    () =>
      agentRecords.reduce<Record<AssistantAgentStatus, number>>(
        (counts, agent) => {
          counts[agent.status] += 1
          return counts
        },
        {
          DRAFT: 0,
          ACTIVE: 0,
          PAUSED: 0,
          RETIRED: 0,
        },
      ),
    [agentRecords],
  )
  const depletedAgentCount = agentRecords.filter((agent) => isAgentBudgetDepleted(agent)).length
  const watchAgentCount = agentRecords.filter((agent) => isAgentBudgetNearLimit(agent)).length
  const roleDerivedAgentCount = agentRecords.filter((agent) => agent.profile_kind !== 'CUSTOM').length
  const createCanUseLiveTools = createForm.capabilities.includes('READ')
  const editCanUseLiveTools = editForm.capabilities.includes('READ')
  const createCanStageActions = createForm.capabilities.includes('ACTION')
  const editCanStageActions = editForm.capabilities.includes('ACTION')
  const createSuggestedAgentId = suggestAgentBuilderAgentId(createForm.name)
  const createWorkspaceSummary = createForm.allowed_workspaces.map((workspace) => workspaceLabel(workspace)).join(' · ')
  const createCapabilitySummary = createForm.capabilities.join(' · ')
  const createLiveToolSummary = describeLiveToolPlan(createForm, availableTools)
  const createActionSummary = describeActionPlan(createForm)
  const editActionSummary = describeActionPlan(editForm)
  const openAiBuilderReady = Boolean(openAiProviderStatus?.configured)
  const createBlockedByProfilePolicy = createProfileFit.errors.length > 0
  const editBlockedByProfilePolicy = editProfileFit.errors.length > 0
  const pendingProfileRequestCount = profileRequests.filter((request) => request.status === 'REQUESTED').length
  const profileRequestReady = Boolean(
    profileRequestForm.business_problem.trim() &&
      profileRequestForm.proposed_mission.trim() &&
      profileRequestForm.human_owner_role.trim() &&
      splitLines(profileRequestForm.work_objects).length > 0 &&
      splitLines(profileRequestForm.expected_outputs).length > 0 &&
      splitLines(profileRequestForm.stop_conditions).length > 0 &&
      splitLines(profileRequestForm.success_metrics).length > 0 &&
      splitLines(profileRequestForm.proposed_eval_cases).length > 0,
  )

  const refreshAgents = useCallback(
    async (preferredAgentId: string | null = null) => {
      if (!adminEnabled) {
        return
      }

      const requestId = requestSequenceRef.current + 1
      requestSequenceRef.current = requestId
      setAgentsLoading(true)
      setAgentsError('')

      try {
        const [nextAgents, runtimeSettings, nextRoles, nextProfileRequests] = await Promise.all([
          listAdminAssistantAgents(appConfig.apiBase),
          loadAssistantRuntimeSettings(appConfig.apiBase),
          listAdminAssistantRoleArchetypes(appConfig.apiBase),
          listAdminAssistantProfileRequests(appConfig.apiBase),
        ])
        if (requestSequenceRef.current !== requestId) {
          return
        }
        setAgentRecords(nextAgents)
        setProfileRequests(nextProfileRequests)
        setRoleArchetypes(nextRoles)
        setAvailableTools(runtimeSettings.available_tools.map((tool) => tool.name))
        setOpenAiProviderStatus(
          runtimeSettings.providers.find((provider) => provider.provider === 'openai') ?? null,
        )
        setSelectedAgentId((current) => {
          if (preferredAgentId && nextAgents.some((agent) => agent.agent_id === preferredAgentId)) {
            return preferredAgentId
          }
          if (current && nextAgents.some((agent) => agent.agent_id === current)) {
            return current
          }
          return nextAgents[0]?.agent_id ?? null
        })
        setSelectedCreateRoleKey((current) => {
          if (current && nextRoles.some((role) => role.role_key === current)) {
            return current
          }
          return nextRoles[0]?.role_key ?? null
        })
      } catch (error) {
        if (requestSequenceRef.current !== requestId) {
          return
        }
        setAgentRecords([])
        setProfileRequests([])
        setRoleArchetypes([])
        setAvailableTools([])
        setOpenAiProviderStatus(null)
        setSelectedAgentId(null)
        setAgentsError(error instanceof Error ? error.message : 'Could not load assistant agents.')
      } finally {
        if (requestSequenceRef.current === requestId) {
          setAgentsLoading(false)
        }
      }
    },
    [adminEnabled],
  )

  useEffect(() => {
    requestSequenceRef.current += 1
    setAgentFlash(null)

    if (!adminEnabled) {
      setAgentRecords([])
      setProfileRequests([])
      setRoleArchetypes([])
      setAvailableTools([])
      setAgentsError('')
      setAgentsLoading(false)
      setSelectedAgentId(null)
      setSelectedCreateRoleKey(null)
      setSelectedCreateTemplateKey(null)
      setProfileRequestForm(createEmptyProfileRequestForm())
      setProfileRequestApprovalNotes({})
      setProfileRequestRejectionReasons({})
      setSubmittingProfileRequest(false)
      setDecidingProfileRequestId(null)
      setCreateForm(createEmptyAgentBuilderDraft())
      setEditForm(createEmptyAgentBuilderDraft())
      setBuilderBrief('')
      setBuilderWarnings([])
      setOpenAiProviderStatus(null)
      setBuildingAgentDraft(false)
      setSeedingRecommendedAgents(false)
      setPolicySimulation(null)
      setPolicySimulationError('')
      setPolicySimulationLoading(false)
      setSimulationPrompt('')
      setSimulationContext('')
      setSimulationWorkspace('assistant')
      setSimulationPhase('stage')
      setSimulationActorRole(authSession?.user.role.trim().toUpperCase() || 'OPS_ADMIN')
      return
    }

    void refreshAgents()
  }, [adminEnabled, authSession?.user.role, refreshAgents])

  useEffect(() => {
    if (!selectedAgent) {
      setEditForm(createEmptyAgentBuilderDraft())
      setPolicySimulation(null)
      setPolicySimulationError('')
      setPolicySimulationLoading(false)
      return
    }
    setEditForm(toAgentForm(selectedAgent))
    setPolicySimulation(null)
    setPolicySimulationError('')
    setPolicySimulationLoading(false)
    setSimulationWorkspace(
      selectedAgent.allowed_workspaces.includes('assistant')
        ? 'assistant'
        : selectedAgent.allowed_workspaces[0] ?? 'assistant',
    )
  }, [selectedAgent])

  useEffect(() => {
    setSimulationActorRole((current) =>
      current.trim() ? current : authSession?.user.role.trim().toUpperCase() || 'OPS_ADMIN',
    )
  }, [authSession?.user.role])

  function handleApplyRoleArchetype(roleKey: string) {
    const role = roleArchetypes.find((entry) => entry.role_key === roleKey)
    if (!role) {
      return
    }
    setAgentFlash(null)
    setBuilderWarnings([])
    setSelectedCreateTemplateKey(null)
    setSelectedCreateRoleKey(role.role_key)
    setCreateForm(buildAgentBuilderDraftFromRole(role, availableTools))
    setBuilderBrief((current) =>
      current.trim()
        ? current
        : `Build a narrowed ${role.name.toLowerCase()} specialization for a specific team workflow.`,
    )
  }

  function handleApplyCreateTemplate(templateKey: AgentBuilderTemplateKey) {
    setAgentFlash(null)
    setBuilderWarnings([])
    setSelectedCreateTemplateKey(templateKey)
    const draft = buildAgentBuilderDraft(templateKey, availableTools)
    setSelectedCreateRoleKey(draft.role_key || null)
    setCreateForm(draft)
    setBuilderBrief((current) =>
      current.trim()
        ? current
        : `Build a managed agent for ${getAgentBuilderTemplate(templateKey).best_for.toLowerCase()}.`,
    )
  }

  function handleResetCreateForm() {
    setAgentFlash(null)
    setSelectedCreateTemplateKey(null)
    setSelectedCreateRoleKey(roleArchetypes[0]?.role_key ?? null)
    setCreateForm(createEmptyAgentBuilderDraft())
    setBuilderBrief('')
    setBuilderWarnings([])
  }

  function handleCreateNameChange(nextName: string) {
    setCreateForm((current) => {
      const currentSuggestedId = suggestAgentBuilderAgentId(current.name)
      const shouldSyncAgentId =
        current.agent_id.trim().length === 0 || current.agent_id.trim() === currentSuggestedId

      return {
        ...current,
        name: nextName,
        agent_id: shouldSyncAgentId ? suggestAgentBuilderAgentId(nextName) : current.agent_id,
      }
    })
  }

  async function handleGenerateDraftWithOpenAi() {
    if (!builderBrief.trim()) {
      return
    }

    setBuildingAgentDraft(true)
    setAgentFlash(null)
    setBuilderWarnings([])

    try {
      const suggestion = await buildAssistantAgentDraft(appConfig.apiBase, {
        brief: builderBrief,
        current_draft: {
          agent_id: createForm.agent_id || undefined,
          name: createForm.name || undefined,
          description: createForm.description || undefined,
          status: createForm.status,
          scope: createForm.scope,
          provider: createForm.provider || null,
          model: createForm.model || null,
          allowed_workspaces: createForm.allowed_workspaces,
          capabilities: createForm.capabilities,
          allowed_tools: createForm.allowed_tools,
          allowed_action_types: createForm.allowed_action_types,
          system_prompt: createForm.system_prompt || undefined,
        },
      })

      setCreateForm({
        agent_id: suggestion.agent_id,
        name: suggestion.name,
        description: suggestion.description,
        status: suggestion.status,
        scope: suggestion.scope,
        provider: suggestion.provider ?? '',
        model: suggestion.model ?? '',
        role_key: createForm.role_key,
        profile_kind: createForm.profile_kind,
        specialization_summary: createForm.specialization_summary,
        human_owner_role: createForm.human_owner_role,
        authority_ceiling: createForm.authority_ceiling,
        activation_notes: createForm.activation_notes,
        profile_request_id: createForm.profile_request_id,
        allowed_workspaces: [...suggestion.allowed_workspaces],
        capabilities: [...suggestion.capabilities],
        allowed_tools: [...suggestion.allowed_tools],
        allowed_action_types: [...suggestion.allowed_action_types],
        daily_token_allocation: createForm.daily_token_allocation,
        system_prompt: suggestion.system_prompt,
      })
      setBuilderWarnings(suggestion.warnings)
      setAgentFlash({
        tone: 'success',
        message: `Draft generated with OpenAI (${suggestion.builder_model}) and pinned to ${suggestion.model}.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not build assistant agent draft.',
      })
    } finally {
      setBuildingAgentDraft(false)
    }
  }

  async function handleSeedRecommendedAgents() {
    setSeedingRecommendedAgents(true)
    setAgentFlash(null)

    try {
      const payload = await seedAssistantAgents(appConfig.apiBase)
      await refreshAgents(payload.agent_ids[0] ?? null)
      setAgentFlash({
        tone: 'success',
        message: `Recommended agents synchronized: ${payload.created_count} created, ${payload.updated_count} updated across ${payload.total_templates} defaults.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not seed recommended assistant agents.',
      })
    } finally {
      setSeedingRecommendedAgents(false)
    }
  }

  async function handleCreateProfileRequest(event: React.FormEvent) {
    event.preventDefault()
    setAgentFlash(null)

    if (!profileRequestReady) {
      setAgentFlash({
        tone: 'error',
        message: 'Complete the custom profile request, including at least one eval case.',
      })
      return
    }

    setSubmittingProfileRequest(true)

    try {
      const created = await createAssistantAgentProfileRequest(
        appConfig.apiBase,
        normalizeProfileRequestPayload(profileRequestForm),
      )
      setProfileRequestForm(createEmptyProfileRequestForm())
      await refreshAgents()
      setAgentFlash({
        tone: 'success',
        message: `Profile request #${created.request_id} is queued for review.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not create profile request.',
      })
    } finally {
      setSubmittingProfileRequest(false)
    }
  }

  async function handleApproveProfileRequest(requestId: number) {
    const approvalNotes = profileRequestApprovalNotes[requestId]?.trim()
    if (!approvalNotes) {
      setAgentFlash({
        tone: 'error',
        message: 'Approval notes are required before a custom profile request can activate.',
      })
      return
    }

    setDecidingProfileRequestId(requestId)
    setAgentFlash(null)

    try {
      await approveAssistantAgentProfileRequest(appConfig.apiBase, requestId, {
        approval_notes: approvalNotes,
      })
      setProfileRequestApprovalNotes((current) => {
        const next = { ...current }
        delete next[requestId]
        return next
      })
      await refreshAgents()
      setAgentFlash({
        tone: 'success',
        message: `Profile request #${requestId} is approved for draft activation.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not approve profile request.',
      })
    } finally {
      setDecidingProfileRequestId(null)
    }
  }

  async function handleRejectProfileRequest(requestId: number) {
    const rejectionReason = profileRequestRejectionReasons[requestId]?.trim()
    if (!rejectionReason) {
      setAgentFlash({
        tone: 'error',
        message: 'A rejection reason is required to close a custom profile request.',
      })
      return
    }

    setDecidingProfileRequestId(requestId)
    setAgentFlash(null)

    try {
      await rejectAssistantAgentProfileRequest(appConfig.apiBase, requestId, {
        rejection_reason: rejectionReason,
      })
      setProfileRequestRejectionReasons((current) => {
        const next = { ...current }
        delete next[requestId]
        return next
      })
      await refreshAgents()
      setAgentFlash({
        tone: 'success',
        message: `Profile request #${requestId} was rejected.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not reject profile request.',
      })
    } finally {
      setDecidingProfileRequestId(null)
    }
  }

  function handleApplyProfileRequestToDraft(request: AssistantAgentProfileRequest) {
    if (request.status === 'ACTIVATED' && request.linked_agent_id) {
      setSelectedAgentId(request.linked_agent_id)
      setAgentFlash({
        tone: 'success',
        message: `Opened the agent linked to profile request #${request.request_id}.`,
      })
      return
    }
    if (request.status !== 'APPROVED') {
      setAgentFlash({
        tone: 'error',
        message: 'Only approved custom profile requests can be loaded into a draft.',
      })
      return
    }

    const requestedName = titleFromAgentId(request.requested_agent_id)
    const name = requestedName || `Custom Profile Request ${request.request_id}`
    const availableToolSet = new Set(availableTools.map((toolName) => toolName.toLowerCase()))
    const allowedTools =
      availableToolSet.size === 0
        ? [...request.requested_inputs_tools]
        : request.requested_inputs_tools.filter((toolName) => availableToolSet.has(toolName.toLowerCase()))
    const capabilities: AssistantAgentCapability[] =
      request.requested_authority_ceiling === 'OBSERVE'
        ? ['READ']
        : request.requested_authority_ceiling === 'EXPLAIN'
          ? ['READ', 'EXPLAIN']
          : ['READ', 'EXPLAIN', 'DRAFT']

    setSelectedCreateTemplateKey(null)
    setSelectedCreateRoleKey(null)
    setBuilderWarnings([])
    setBuilderBrief('')
    setCreateForm({
      agent_id: request.requested_agent_id || suggestAgentBuilderAgentId(name),
      name,
      description: request.business_problem,
      status: 'DRAFT',
      scope: 'TEAM',
      provider: '',
      model: '',
      role_key: '',
      profile_kind: 'CUSTOM',
      specialization_summary: request.proposed_mission,
      human_owner_role: request.human_owner_role,
      authority_ceiling: request.requested_authority_ceiling,
      activation_notes: request.approval_notes
        ? `Approved profile request #${request.request_id}: ${request.approval_notes}`
        : `Approved profile request #${request.request_id}.`,
      profile_request_id: request.request_id,
      allowed_workspaces: [...request.requested_workspaces],
      capabilities,
      allowed_tools: allowedTools,
      allowed_action_types: [],
      daily_token_allocation: '',
      system_prompt: buildPromptFromProfileRequest(request),
    })
    setAgentFlash({
      tone: 'success',
      message: `Loaded profile request #${request.request_id} into the builder as a draft-only custom agent.`,
    })
  }

  async function handleCreateAgent(event: React.FormEvent) {
    event.preventDefault()
    setAgentFlash(null)

    const profileFit = evaluateAgentRoleProfileFit(createForm, roleArchetypes)
    if (profileFit.errors.length > 0) {
      setAgentFlash({
        tone: 'error',
        message: profileFit.errors[0],
      })
      return
    }

    setCreatingAgent(true)

    try {
      const payload = normalizeAgentPayload(createForm)
      const created = await createAssistantAgent(appConfig.apiBase, payload)
      handleResetCreateForm()
      await refreshAgents(created.agent_id)
      setAgentFlash({
        tone: 'success',
        message: `${created.name} is now stored as version ${created.version}.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not create assistant agent.',
      })
    } finally {
      setCreatingAgent(false)
    }
  }

  async function handleSaveAgent(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedAgent) {
      return
    }

    setAgentFlash(null)

    const profileFit = evaluateAgentRoleProfileFit(editForm, roleArchetypes)
    if (profileFit.errors.length > 0) {
      setAgentFlash({
        tone: 'error',
        message: profileFit.errors[0],
      })
      return
    }

    setSavingAgent(true)

    try {
      const payload = normalizeAgentPayload(editForm)
      const updated = await updateAssistantAgent(
        appConfig.apiBase,
        selectedAgent.agent_id,
        {
          name: payload.name,
          description: payload.description,
          status: payload.status,
          scope: payload.scope,
          provider: payload.provider,
          model: payload.model,
          role_key: payload.role_key,
          profile_kind: payload.profile_kind,
          specialization_summary: payload.specialization_summary,
          human_owner_role: payload.human_owner_role,
          authority_ceiling: payload.authority_ceiling,
          activation_notes: payload.activation_notes,
          profile_request_id: payload.profile_request_id,
          allowed_workspaces: payload.allowed_workspaces,
          capabilities: payload.capabilities,
          allowed_tools: payload.allowed_tools,
          allowed_action_types: payload.allowed_action_types,
          daily_token_allocation: payload.daily_token_allocation,
          system_prompt: payload.system_prompt,
        } satisfies UpdateAssistantAgentInput,
      )
      await refreshAgents(updated.agent_id)
      setAgentFlash({
        tone: 'success',
        message: `${updated.name} saved as version ${updated.version}.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save assistant agent.',
      })
    } finally {
      setSavingAgent(false)
    }
  }

  async function handleRunPolicySimulation() {
    if (!selectedAgent) {
      return
    }

    setPolicySimulationLoading(true)
    setPolicySimulationError('')
    setPolicySimulation(null)

    try {
      const payload: SimulateAssistantAgentPolicyInput = {
        workspace: simulationWorkspace,
        phase: simulationPhase,
        actorRole: simulationActorRole,
        context: simulationContext,
        prompt: simulationPrompt,
      }
      const result = await simulateAssistantAgentPolicy(
        appConfig.apiBase,
        selectedAgent.agent_id,
        payload,
      )
      setPolicySimulation(result)
    } catch (error) {
      setPolicySimulationError(
        error instanceof Error ? error.message : 'Could not run the policy simulation.',
      )
    } finally {
      setPolicySimulationLoading(false)
    }
  }

  return (
    <section className="surface feature-panel assistant-admin-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Assistant Registry</span>
          <h3>Managed Agent Control</h3>
        </div>
        <p>
          Define named agents in-product so the assistant workspace can target governed roles instead of only
          raw model providers.
        </p>
      </div>

      {!adminEnabled && (
        <div className="roadmap-admin-lock">
          <p>Sign in with an administrative session to publish, pause, or retire managed assistant agents.</p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      )}

      {adminEnabled && (
        <>
          <div className="toolbar settings-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleSeedRecommendedAgents()}
              disabled={seedingRecommendedAgents}
            >
              {seedingRecommendedAgents ? 'Seeding Recommended Agents...' : 'Seed Recommended Agents'}
            </button>
          </div>

          <div className="assistant-admin-summary-grid">
            <article className="admin-summary-card">
              <span>Published</span>
              <strong>{statusCounts.ACTIVE}</strong>
              <p>Agents that can currently answer from the assistant workspace.</p>
            </article>
            <article className="admin-summary-card">
              <span>Drafts + Paused</span>
              <strong>{statusCounts.DRAFT + statusCounts.PAUSED}</strong>
              <p>Definitions still being shaped or temporarily held back from runtime use.</p>
            </article>
            <article className="admin-summary-card">
              <span>Bound providers</span>
              <strong>{agentRecords.filter((agent) => agent.provider).length}</strong>
              <p>Agents with a provider pinned instead of inheriting the current backend default.</p>
            </article>
            <article className="admin-summary-card">
              <span>Token budget</span>
              <strong>
                {depletedAgentCount > 0
                  ? `${depletedAgentCount} red`
                  : watchAgentCount > 0
                    ? `${watchAgentCount} watch`
                    : 'Green'}
              </strong>
              <p>Daily allocation status across managed agents based on recorded run usage.</p>
            </article>
            <article className="admin-summary-card">
              <span>Action scoped</span>
              <strong>{agentRecords.filter((agent) => agent.capabilities.includes('ACTION')).length}</strong>
              <p>Agents currently allowed to stage approval-gated mutations.</p>
            </article>
            <article className="admin-summary-card">
              <span>Role profiles</span>
              <strong>{roleDerivedAgentCount}</strong>
              <p>Managed agents currently tied to curated or role-derived catalog entries.</p>
            </article>
          </div>

          {agentsLoading ? <div className="feedback-banner feedback-banner-success">Loading assistant agents from Admin...</div> : null}
          {agentsError ? <div className="feedback-banner feedback-banner-error">{agentsError}</div> : null}
          {agentFlash ? (
            <div className={`feedback-banner ${agentFlash.tone === 'error' ? 'feedback-banner-error' : 'feedback-banner-success'}`}>
              {agentFlash.message}
            </div>
          ) : null}

          <div className="assistant-profile-request-panel">
            <div className="assistant-admin-section-head">
              <div>
                <span className="eyebrow">Custom Requests</span>
                <h4>Specialized Profile Intake</h4>
              </div>
              <span>
                {pendingProfileRequestCount} pending · {approvedProfileRequests.length} approved or active
              </span>
            </div>

            <div className="assistant-profile-request-grid">
              <form className="assistant-profile-request-form" onSubmit={handleCreateProfileRequest}>
                <div className="assistant-admin-form-grid">
                  <label className="field">
                    <span>Requested Agent ID</span>
                    <input
                      className="control"
                      value={profileRequestForm.requested_agent_id}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          requested_agent_id: event.target.value,
                        }))
                      }
                      placeholder="weather-dispatch-analyst"
                    />
                    <small className="form-note">Optional stable ID; leave blank to choose it during draft setup.</small>
                  </label>
                  <label className="field">
                    <span>Human Owner Role</span>
                    <input
                      className="control"
                      value={profileRequestForm.human_owner_role}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          human_owner_role: event.target.value,
                        }))
                      }
                      placeholder="Operations Lead"
                    />
                  </label>
                  <label className="field">
                    <span>Requested Authority</span>
                    <select
                      className="control"
                      value={profileRequestForm.requested_authority_ceiling}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          requested_authority_ceiling: event.target.value as AssistantAgentAuthorityLevel,
                        }))
                      }
                    >
                      {AUTHORITY_OPTIONS.map((authority) => (
                        <option key={authority} value={authority}>
                          {authority}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Business Problem</span>
                    <textarea
                      className="control"
                      value={profileRequestForm.business_problem}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          business_problem: event.target.value,
                        }))
                      }
                      placeholder="Describe the workflow gap that existing role archetypes do not cover."
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Proposed Mission</span>
                  <textarea
                    className="control"
                    value={profileRequestForm.proposed_mission}
                    onChange={(event) =>
                      setProfileRequestForm((current) => ({
                        ...current,
                        proposed_mission: event.target.value,
                      }))
                    }
                    placeholder="What should the specialized profile do, and where should it stop?"
                  />
                </label>

                <div className="assistant-admin-option-grid">
                  <div className="assistant-admin-option-group">
                    <strong>Requested workspaces</strong>
                    <div className="chip-row">
                      {WORKSPACE_OPTIONS.map((workspace) => (
                        <button
                          key={workspace}
                          type="button"
                          className={`entity-chip ${profileRequestForm.requested_workspaces.includes(workspace) ? '' : 'entity-chip-soft'}`}
                          onClick={() =>
                            setProfileRequestForm((current) => ({
                              ...current,
                              requested_workspaces: toggleSelection(current.requested_workspaces, workspace, {
                                minSelections: 1,
                              }),
                            }))
                          }
                        >
                          {workspaceLabel(workspace)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Requested inputs and tools</strong>
                    {availableTools.length > 0 ? (
                      <div className="chip-row">
                        {availableTools.map((toolName) => (
                          <button
                            key={toolName}
                            type="button"
                            className={`entity-chip ${profileRequestForm.requested_inputs_tools.includes(toolName) ? '' : 'entity-chip-soft'}`}
                            onClick={() =>
                              setProfileRequestForm((current) => ({
                                ...current,
                                requested_inputs_tools: toggleSelection(
                                  current.requested_inputs_tools,
                                  toolName,
                                ),
                              }))
                            }
                          >
                            {toolName}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>Runtime tool options will appear once assistant settings load.</p>
                    )}
                  </div>
                </div>

                <div className="assistant-admin-form-grid">
                  <label className="field">
                    <span>Work Objects</span>
                    <textarea
                      className="control"
                      value={profileRequestForm.work_objects}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          work_objects: event.target.value,
                        }))
                      }
                      placeholder="trade&#10;workflow item"
                    />
                  </label>
                  <label className="field">
                    <span>Expected Outputs</span>
                    <textarea
                      className="control"
                      value={profileRequestForm.expected_outputs}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          expected_outputs: event.target.value,
                        }))
                      }
                      placeholder="Exception summary&#10;Reviewer-ready next steps"
                    />
                  </label>
                  <label className="field">
                    <span>Stop Conditions</span>
                    <textarea
                      className="control"
                      value={profileRequestForm.stop_conditions}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          stop_conditions: event.target.value,
                        }))
                      }
                      placeholder="Evidence is stale or contradictory."
                    />
                  </label>
                  <label className="field">
                    <span>Success Metrics</span>
                    <textarea
                      className="control"
                      value={profileRequestForm.success_metrics}
                      onChange={(event) =>
                        setProfileRequestForm((current) => ({
                          ...current,
                          success_metrics: event.target.value,
                        }))
                      }
                      placeholder="Lower time to triage exceptions."
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Proposed Eval Cases</span>
                  <textarea
                    className="control"
                    value={profileRequestForm.proposed_eval_cases}
                    onChange={(event) =>
                      setProfileRequestForm((current) => ({
                        ...current,
                        proposed_eval_cases: event.target.value,
                      }))
                    }
                    placeholder="Allows supported exception summary.&#10;Blocks stale evidence action staging."
                  />
                  <small className="form-note">
                    Action-capable custom profiles cannot activate without eval coverage and approval notes.
                  </small>
                </label>

                <div className="toolbar settings-actions">
                  <button
                    type="submit"
                    className="button button-secondary"
                    disabled={submittingProfileRequest || !profileRequestReady}
                  >
                    {submittingProfileRequest ? 'Submitting Request...' : 'Submit Profile Request'}
                  </button>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setProfileRequestForm(createEmptyProfileRequestForm())}
                  >
                    Reset Request
                  </button>
                </div>
              </form>

              <div className="assistant-profile-request-list">
                {profileRequests.length === 0 ? (
                  <div className="empty-state">
                    <strong>No custom requests yet</strong>
                    <p>Requests appear here before they can become active custom profiles.</p>
                  </div>
                ) : (
                  profileRequests.map((request) => (
                    <article key={request.request_id} className="assistant-profile-request-card">
                      <div className="assistant-provider-head">
                        <strong>
                          #{request.request_id}{' '}
                          {titleFromAgentId(request.requested_agent_id) || 'Custom specialization'}
                        </strong>
                        <span className={`status-pill status-pill-${profileRequestStatusTone(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                      <p>{request.business_problem}</p>
                      <small>
                        {request.human_owner_role} · {request.requested_authority_ceiling} ·{' '}
                        {request.requested_workspaces.map((workspace) => workspaceLabel(workspace)).join(' · ')}
                      </small>
                      <small>
                        {request.proposed_eval_cases.length} eval case
                        {request.proposed_eval_cases.length === 1 ? '' : 's'} · requested by{' '}
                        {request.requested_by}
                        {request.reviewed_by ? ` · reviewed by ${request.reviewed_by}` : ''}
                      </small>

                      {request.status === 'REQUESTED' ? (
                        <div className="assistant-profile-request-decision-grid">
                          <label className="field">
                            <span>Approval Notes</span>
                            <textarea
                              className="control"
                              value={profileRequestApprovalNotes[request.request_id] ?? ''}
                              onChange={(event) =>
                                setProfileRequestApprovalNotes((current) => ({
                                  ...current,
                                  [request.request_id]: event.target.value,
                                }))
                              }
                              placeholder="Owner, prompt, tools/actions, and eval cases reviewed."
                            />
                          </label>
                          <label className="field">
                            <span>Rejection Reason</span>
                            <textarea
                              className="control"
                              value={profileRequestRejectionReasons[request.request_id] ?? ''}
                              onChange={(event) =>
                                setProfileRequestRejectionReasons((current) => ({
                                  ...current,
                                  [request.request_id]: event.target.value,
                                }))
                              }
                              placeholder="Why this should become a role, narrow, or stop."
                            />
                          </label>
                          <div className="toolbar settings-actions">
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={
                                decidingProfileRequestId === request.request_id ||
                                !profileRequestApprovalNotes[request.request_id]?.trim()
                              }
                              onClick={() => void handleApproveProfileRequest(request.request_id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="button button-ghost"
                              disabled={
                                decidingProfileRequestId === request.request_id ||
                                !profileRequestRejectionReasons[request.request_id]?.trim()
                              }
                              onClick={() => void handleRejectProfileRequest(request.request_id)}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="assistant-profile-request-review-note">
                          <strong>{request.status === 'REJECTED' ? 'Decision' : 'Review'}</strong>
                          <p>{request.rejection_reason || request.approval_notes || 'No review note recorded.'}</p>
                        </div>
                      )}

                      {request.status === 'APPROVED' || request.status === 'ACTIVATED' ? (
                        <div className="toolbar settings-actions">
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => handleApplyProfileRequestToDraft(request)}
                          >
                            {request.status === 'ACTIVATED' ? 'Open Linked Agent' : 'Load Builder Draft'}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="assistant-admin-grid">
            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Catalog</span>
                  <h4>Current Agents</h4>
                </div>
                <span>{agentRecords.length} total</span>
              </div>

              <div className="assistant-admin-agent-list">
                {agentRecords.length === 0 ? (
                  <div className="empty-state">
                    <strong>No agents yet</strong>
                    <p>Create the first managed agent below to make the assistant workspace configurable in-product.</p>
                  </div>
                ) : (
                  agentRecords.map((agent) => {
                    const budgetClass = assistantBudgetSignalClass(agent.token_budget)
                    return (
                      <button
                        key={agent.agent_id}
                        type="button"
                        className={[
                          'assistant-admin-agent-card',
                          selectedAgent?.agent_id === agent.agent_id ? 'is-selected' : '',
                          budgetCardToneClass(budgetClass),
                        ].join(' ')}
                        onClick={() => {
                          setAgentFlash(null)
                          setSelectedAgentId(agent.agent_id)
                        }}
                      >
                        <div className="assistant-provider-head">
                          <strong>{agent.name}</strong>
                          <span className={`assistant-budget-signal ${budgetClass}`}>
                            {assistantBudgetSignalLabel(agent.token_budget)}
                          </span>
                        </div>
                        <div className="assistant-agent-budget-row">
                          <span className={`status-pill status-pill-${statusTone(agent.status)}`}>{agent.status}</span>
                          <span>{formatBudgetPercent(agent.token_budget)} used</span>
                        </div>
                        <div className={`assistant-budget-meter ${budgetClass}`} aria-hidden="true">
                          <span style={{ width: budgetMeterWidth(agent.token_budget) }} />
                        </div>
                        <small>{describeAssistantTokenBudget(agent.token_budget)}</small>
                        <p>{agent.description}</p>
                        <small>
                          {agent.scope}
                          {` · ${describeProfileKind(agent.profile_kind)}`}
                          {agent.role_key ? ` · ${agent.role_key}` : ''}
                          {agent.provider ? ` · ${agent.provider}` : ' · inherited provider'}
                          {agent.model ? ` · ${agent.model}` : ''}
                          {agent.allowed_tools.length > 0 ? ` · ${agent.allowed_tools.length} live tools` : ''}
                          {agent.allowed_action_types.length > 0 ? ` · ${agent.allowed_action_types.length} actions` : ''}
                        </small>
                        <small>{describeEffectivePolicy(agent)}</small>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Create</span>
                  <h4>Builder Draft</h4>
                </div>
                <span>Start from a role template or shape one from scratch</span>
              </div>

              <div className="assistant-role-catalog-shell">
                <div className="assistant-admin-section-head">
                  <div>
                    <span className="eyebrow">Role Catalog</span>
                    <h4>Archetypes</h4>
                  </div>
                  <span>{roleArchetypes.length} server-owned roles</span>
                </div>

                {roleArchetypes.length === 0 ? (
                  <div className="empty-state">
                    <strong>No role catalog loaded</strong>
                    <p>Role archetypes will appear here when the Admin role API responds.</p>
                  </div>
                ) : (
                  <div className="assistant-role-catalog-grid">
                    {roleArchetypes.map((role) => (
                      <button
                        key={role.role_key}
                        type="button"
                        className={`assistant-role-catalog-card ${
                          selectedCreateRole?.role_key === role.role_key ? 'is-selected' : ''
                        }`}
                        onClick={() => setSelectedCreateRoleKey(role.role_key)}
                      >
                        <div className="assistant-provider-head">
                          <strong>{role.name}</strong>
                          <span className="status-pill status-pill-planned">
                            {roleCatalogStatusLabel(role)}
                          </span>
                        </div>
                        <p>{role.description}</p>
                        <small>{role.human_owner_role}</small>
                        <small>
                          {role.allowed_workspaces.map((workspace) => workspaceLabel(workspace)).join(' · ')}
                        </small>
                      </button>
                    ))}
                  </div>
                )}

                {selectedCreateRole ? (
                  <div className="assistant-role-detail">
                    <div className="assistant-admin-section-head">
                      <div>
                        <span className="eyebrow">{selectedCreateRole.role_key}</span>
                        <h4>{selectedCreateRole.name}</h4>
                      </div>
                      <span>{selectedCreateRole.authority_ceiling} authority</span>
                    </div>
                    <div className="assistant-builder-preview-grid">
                      <div className="assistant-sidebar-block">
                        <strong>Mission</strong>
                        <p>{selectedCreateRole.mission.join(' ')}</p>
                        <small>{listSummary(selectedCreateRole.work_objects, 'No work objects listed')}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Default tools</strong>
                        <p>{listSummary(selectedCreateRole.default_tools, 'No default live tools')}</p>
                        <small>{selectedCreateRole.capability_ceiling.join(' · ')}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Actions</strong>
                        <p>{actionSummary(selectedCreateRole.maximum_action_types)}</p>
                        <small>{selectedCreateRole.approval_rules.join(' ')}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Stop conditions + evals</strong>
                        <p>{selectedCreateRole.stop_conditions.slice(0, 2).join(' ')}</p>
                        <small>{selectedCreateRole.required_eval_coverage.join(' · ')}</small>
                      </div>
                    </div>
                    <div className="toolbar settings-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleApplyRoleArchetype(selectedCreateRole.role_key)}
                      >
                        Start Role-Derived Draft
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="assistant-builder-shell">
                <div className="assistant-builder-template-grid">
                  {AGENT_BUILDER_TEMPLATES.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      className={`assistant-builder-template-card ${
                        selectedCreateTemplateKey === template.key ? 'is-selected' : ''
                      }`}
                      onClick={() => handleApplyCreateTemplate(template.key)}
                    >
                      <div className="assistant-provider-head">
                        <strong>{template.name}</strong>
                        <span className="status-pill status-pill-planned">{template.scope}</span>
                      </div>
                      <p>{template.summary}</p>
                      <small>
                        {template.allowed_workspaces.map((workspace) => workspaceLabel(workspace)).join(' · ')}
                      </small>
                    </button>
                  ))}
                </div>

                <div className="assistant-builder-preview">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Blueprint</span>
                      <h4>{selectedCreateTemplate ? selectedCreateTemplate.name : 'Build From Scratch'}</h4>
                    </div>
                    <span>
                      {selectedCreateTemplate
                        ? selectedCreateTemplate.best_for
                        : 'Use the controls below to assemble a custom managed agent.'}
                    </span>
                  </div>

                  {selectedCreateTemplate ? (
                    <>
                      <div className="assistant-builder-preview-grid">
                        <div className="assistant-sidebar-block">
                          <strong>Focus areas</strong>
                          <p>{selectedCreateTemplate.focus_areas.join(' · ')}</p>
                          <small>{selectedCreateTemplate.description}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Workspace coverage</strong>
                          <p>{createWorkspaceSummary}</p>
                          <small>{createCapabilitySummary}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Live tool plan</strong>
                          <p>{createLiveToolSummary}</p>
                          <small>
                            {createForm.allowed_tools.length > 0
                              ? createForm.allowed_tools.join(' · ')
                              : createCanUseLiveTools && availableTools.length > 0
                                ? createForm.role_key && createForm.profile_kind !== 'CUSTOM'
                                  ? 'Role default tool catalog on save'
                                  : 'No live tools selected'
                                : 'No live-tool subset selected yet'}
                          </small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Action plan</strong>
                          <p>{createActionSummary}</p>
                          <small>
                            {createForm.allowed_action_types.length > 0
                              ? createForm.allowed_action_types
                                  .map((actionType) => ACTION_TYPE_LABELS[actionType])
                                  .join(' · ')
                              : createCanStageActions
                                ? 'Explicit action selection required'
                                : 'No staged actions enabled'}
                          </small>
                        </div>
                      </div>

                      <div className="chip-row">
                        {selectedCreateTemplate.focus_areas.map((focusArea) => (
                          <span key={focusArea} className="entity-chip entity-chip-soft">
                            {focusArea}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">
                      <strong>Choose a starting point</strong>
                      <p>
                        Template cards seed the draft with workspace access, governed tool defaults,
                        action guardrails, and a starter system prompt you can still edit line by line.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="assistant-builder-preview">
                <div className="assistant-admin-section-head">
                  <div>
                    <span className="eyebrow">OpenAI Builder</span>
                    <h4>Generate Draft With OpenAI</h4>
                  </div>
                  <span>
                    {openAiBuilderReady
                      ? `Uses ${openAiProviderStatus?.default_model ?? 'the configured OpenAI model'} for the builder call`
                      : 'Configure OPENAI_API_KEY on the API to enable draft generation'}
                  </span>
                </div>

                <label className="field">
                  <span>Builder brief</span>
                  <textarea
                    className="control assistant-admin-prompt"
                    value={builderBrief}
                    onChange={(event) => setBuilderBrief(event.target.value)}
                    placeholder="Describe who this agent helps, which workflows it should cover, what evidence it should rely on, and what kind of answers it should produce."
                  />
                  <small className="form-note">
                    The generated draft is pinned to OpenAI for runtime use, while workspace access, live tools, and action scopes stay governed by the form fields below.
                  </small>
                </label>

                {builderWarnings.length > 0 ? (
                  <div className="assistant-builder-warning-list">
                    {builderWarnings.map((warning) => (
                      <small key={warning} className="form-note">
                        {warning}
                      </small>
                    ))}
                  </div>
                ) : null}

                <div className="toolbar settings-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void handleGenerateDraftWithOpenAi()}
                    disabled={!builderBrief.trim() || buildingAgentDraft || !openAiBuilderReady}
                  >
                    {buildingAgentDraft ? 'Calling OpenAI...' : 'Generate With OpenAI'}
                  </button>
                </div>
              </div>

              <form className="assistant-admin-form" onSubmit={handleCreateAgent}>
                <div className="assistant-admin-form-grid">
                  <label className="field">
                    <span>Agent ID</span>
                    <input
                      className="control"
                      value={createForm.agent_id}
                      onChange={(event) => setCreateForm((current) => ({ ...current, agent_id: event.target.value }))}
                      placeholder="trade-explainer"
                    />
                    {createSuggestedAgentId && createForm.agent_id !== createSuggestedAgentId ? (
                      <small className="form-note">
                        Suggested from the current name: {createSuggestedAgentId}{' '}
                        <button
                          type="button"
                          className="button button-ghost assistant-builder-inline-action"
                          onClick={() =>
                            setCreateForm((current) => ({
                              ...current,
                              agent_id: createSuggestedAgentId,
                            }))
                          }
                        >
                          Use suggestion
                        </button>
                      </small>
                    ) : (
                      <small className="form-note">
                        Stable IDs make it easier to reference this managed agent from future prompts and tests.
                      </small>
                    )}
                  </label>
                  <label className="field">
                    <span>Name</span>
                    <input
                      className="control"
                      value={createForm.name}
                      onChange={(event) => handleCreateNameChange(event.target.value)}
                      placeholder="Trade Explainer"
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="control"
                      value={createForm.status}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, status: event.target.value as AssistantAgentStatus }))
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Scope</span>
                    <select
                      className="control"
                      value={createForm.scope}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, scope: event.target.value as AssistantAgentScope }))
                      }
                    >
                      {SCOPE_OPTIONS.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Provider</span>
                    <select
                      className="control"
                      value={createForm.provider}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          provider: event.target.value as AssistantProvider | '',
                          model: event.target.value ? current.model : '',
                        }))
                      }
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider || 'inherit'} value={provider}>
                          {provider || 'Inherit backend default'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Model Override</span>
                    <input
                      className="control"
                      disabled={!createForm.provider}
                      value={createForm.model}
                      onChange={(event) => setCreateForm((current) => ({ ...current, model: event.target.value }))}
                      placeholder="Leave blank to use the configured provider default"
                    />
                  </label>
                  <label className="field">
                    <span>Daily Token Allocation</span>
                    <input
                      className="control"
                      type="number"
                      min="0"
                      step="1"
                      value={createForm.daily_token_allocation}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          daily_token_allocation: event.target.value,
                        }))
                      }
                      placeholder="Inherit backend default"
                    />
                    <small className="form-note">
                      {describeDailyTokenAllocationMode(createForm.daily_token_allocation)} Leave blank to inherit;
                      set 0 to hold the agent in the red.
                    </small>
                  </label>
                </div>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    className="control"
                    value={createForm.description}
                    onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>

                <div className="assistant-builder-preview assistant-profile-panel">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Profile Guardrails</span>
                      <h4>{describeProfileKind(createForm.profile_kind)}</h4>
                    </div>
                    <span>
                      {createFormRole
                        ? `${createFormRole.name} · ${roleCatalogStatusLabel(createFormRole)}`
                        : 'No role boundary selected'}
                    </span>
                  </div>

                  <div className="assistant-admin-form-grid">
                    <label className="field">
                      <span>Profile Kind</span>
                      <select
                        className="control"
                        value={createForm.profile_kind}
                        onChange={(event) => {
                          const nextProfileKind = event.target.value as AssistantAgentProfileKind
                          setCreateForm((current) => ({
                            ...current,
                            profile_kind: nextProfileKind,
                            role_key: nextProfileKind === 'CUSTOM' ? '' : current.role_key,
                            profile_request_id:
                              nextProfileKind === 'CUSTOM' ? current.profile_request_id : null,
                          }))
                        }}
                      >
                        {PROFILE_KIND_OPTIONS.map((profileKind) => (
                          <option key={profileKind} value={profileKind}>
                            {describeProfileKind(profileKind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Role Archetype</span>
                      <select
                        className="control"
                        value={createForm.role_key}
                        disabled={createForm.profile_kind === 'CUSTOM'}
                        onChange={(event) => {
                          const nextRoleKey = event.target.value
                          setSelectedCreateRoleKey(nextRoleKey || null)
                          setCreateForm((current) => ({
                            ...current,
                            role_key: nextRoleKey,
                            profile_kind: nextRoleKey && current.profile_kind === 'CUSTOM' ? 'ROLE_DERIVED' : current.profile_kind,
                            profile_request_id: nextRoleKey ? null : current.profile_request_id,
                          }))
                        }}
                      >
                        <option value="">Select role archetype</option>
                        {roleArchetypes.map((role) => (
                          <option key={role.role_key} value={role.role_key}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Profile Request</span>
                      <select
                        className="control"
                        value={createForm.profile_request_id ?? ''}
                        disabled={createForm.profile_kind !== 'CUSTOM'}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            profile_request_id: event.target.value ? Number(event.target.value) : null,
                          }))
                        }
                      >
                        <option value="">No approved request</option>
                        {approvedProfileRequests.map((request) => (
                          <option key={request.request_id} value={request.request_id}>
                            #{request.request_id} {titleFromAgentId(request.requested_agent_id) || request.human_owner_role}
                          </option>
                        ))}
                      </select>
                      <small className="form-note">
                        Active custom profiles need an approved request unless they are role-mapped.
                      </small>
                    </label>
                    <label className="field">
                      <span>Human Owner Role</span>
                      <input
                        className="control"
                        value={createForm.human_owner_role}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            human_owner_role: event.target.value,
                          }))
                        }
                        placeholder="Operations Lead"
                      />
                    </label>
                    <label className="field">
                      <span>Authority Ceiling</span>
                      <select
                        className="control"
                        value={createForm.authority_ceiling}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            authority_ceiling: event.target.value as AssistantAgentAuthorityLevel | '',
                          }))
                        }
                      >
                        <option value="">No authority ceiling</option>
                        {AUTHORITY_OPTIONS.map((authority) => (
                          <option key={authority} value={authority}>
                            {authority}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Specialization Summary</span>
                    <textarea
                      className="control"
                      value={createForm.specialization_summary}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          specialization_summary: event.target.value,
                        }))
                      }
                      placeholder="Describe what this specialization narrows or adapts from the role archetype."
                    />
                  </label>
                  <label className="field">
                    <span>Activation Notes</span>
                    <textarea
                      className="control"
                      value={createForm.activation_notes}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          activation_notes: event.target.value,
                        }))
                      }
                      placeholder="Capture owner review, eval readiness, or rollout conditions."
                    />
                  </label>

                  <RoleProfileFitSummary fit={createProfileFit} />
                  <PromptProfilePreview form={createForm} role={createFormRole} />

                  {createFormRole ? (
                    <div className="toolbar settings-actions">
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => handleApplyRoleArchetype(createFormRole.role_key)}
                      >
                        Reapply Role Defaults
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="assistant-admin-option-grid">
                  <div className="assistant-admin-option-group">
                    <strong>Allowed workspaces</strong>
                    <div className="chip-row">
                      {WORKSPACE_OPTIONS.map((workspace) => (
                        <button
                          key={workspace}
                          type="button"
                          className={`entity-chip ${createForm.allowed_workspaces.includes(workspace) ? '' : 'entity-chip-soft'}`}
                          title={workspace}
                          onClick={() =>
                            setCreateForm((current) => ({
                              ...current,
                              allowed_workspaces: toggleSelection(current.allowed_workspaces, workspace, {
                                minSelections: 1,
                              }),
                            }))
                          }
                        >
                          {workspaceLabel(workspace)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Capabilities</strong>
                    <div className="chip-row">
                      {CAPABILITY_OPTIONS.map((capability) => (
                        <button
                          key={capability}
                          type="button"
                          className={`entity-chip ${createForm.capabilities.includes(capability) ? '' : 'entity-chip-soft'}`}
                          onClick={() => setCreateForm((current) => toggleCapability(current, capability))}
                        >
                          {capability}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Allowed live tools</strong>
                    <p>
                      {createCanUseLiveTools
                        ? 'Choose a subset. Blank role profiles inherit role defaults; blank custom agents use no live tools.'
                        : 'Enable READ capability to allow live tools for this agent.'}
                    </p>
                    <div className="chip-row">
                      {availableTools.map((toolName) => (
                        <button
                          key={toolName}
                          type="button"
                          className={`entity-chip ${createForm.allowed_tools.includes(toolName) ? '' : 'entity-chip-soft'}`}
                          disabled={!createCanUseLiveTools}
                          onClick={() =>
                            setCreateForm((current) => ({
                              ...current,
                              allowed_tools: toggleSelection(current.allowed_tools, toolName),
                            }))
                          }
                        >
                          {toolName}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Allowed actions</strong>
                    <p>{createActionSummary}</p>
                    <div className="chip-row">
                      {ACTION_TYPE_OPTIONS.map((actionType) => (
                        <button
                          key={actionType}
                          type="button"
                          className={`entity-chip ${createForm.allowed_action_types.includes(actionType) ? '' : 'entity-chip-soft'}`}
                          disabled={!createCanStageActions}
                          onClick={() =>
                            setCreateForm((current) => ({
                              ...current,
                              allowed_action_types: toggleSelection(
                                current.allowed_action_types,
                                actionType,
                              ),
                            }))
                          }
                        >
                          {ACTION_TYPE_LABELS[actionType]}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                <label className="field">
                  <span>System prompt</span>
                  <textarea
                    className="control assistant-admin-prompt"
                    value={createForm.system_prompt}
                    onChange={(event) => setCreateForm((current) => ({ ...current, system_prompt: event.target.value }))}
                    placeholder="Define the agent's operating instructions, tone, and boundaries."
                  />
                  <small className="form-note">
                    {selectedCreateTemplate
                      ? 'The template added a starter prompt. Edit it freely before publishing.'
                      : 'Keep instructions specific to the role, the evidence it should rely on, and the boundaries it should respect.'}
                  </small>
                </label>

                <div className="toolbar settings-actions">
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={creatingAgent || createBlockedByProfilePolicy}
                  >
                    {creatingAgent ? 'Creating Agent...' : 'Create Agent'}
                  </button>
                  <button type="button" className="button button-ghost" onClick={handleResetCreateForm}>
                    Reset Draft
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="assistant-admin-editor">
            <div className="assistant-admin-section-head">
              <div>
                <span className="eyebrow">Edit</span>
                <h4>{selectedAgent ? selectedAgent.name : 'Select an agent'}</h4>
              </div>
              <span>
                {selectedAgent
                  ? [
                      `Updated ${formatDate(selectedAgent.updated_at)} by ${selectedAgent.updated_by}`,
                      assistantBudgetSignalLabel(selectedAgent.token_budget),
                    ].join(' · ')
                  : 'Choose a record from the catalog'}
              </span>
            </div>

            {!selectedAgent ? (
              <div className="empty-state">
                <strong>No agent selected</strong>
                <p>Pick an agent from the catalog to edit its scope, publishing status, or runtime instructions.</p>
              </div>
            ) : (
              <form className="assistant-admin-form" onSubmit={handleSaveAgent}>
                <div className="assistant-agent-budget-detail">
                  <span className={`assistant-budget-signal ${assistantBudgetSignalClass(selectedAgent.token_budget)}`}>
                    {assistantBudgetSignalLabel(selectedAgent.token_budget)}
                  </span>
                  <div className="assistant-agent-budget-detail-copy">
                    <p>{describeAssistantTokenBudget(selectedAgent.token_budget)}</p>
                    <div
                      className={`assistant-budget-meter ${assistantBudgetSignalClass(selectedAgent.token_budget)}`}
                      aria-hidden="true"
                    >
                      <span style={{ width: budgetMeterWidth(selectedAgent.token_budget) }} />
                    </div>
                    <small>{formatBudgetPercent(selectedAgent.token_budget)} of the daily window used.</small>
                  </div>
                </div>

                <div className="assistant-sidebar-block">
                  <strong>Effective policy</strong>
                  <p>{describeEffectivePolicy(selectedAgent)}</p>
                  {selectedAgent.effective_policy ? (
                    <small>
                      {selectedAgent.effective_policy.policy_notes.join(' ')}
                    </small>
                  ) : null}
                </div>

                <div className="assistant-builder-preview assistant-policy-simulator">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Policy Simulator</span>
                      <h4>Dry Run Agent Access</h4>
                    </div>
                    <span>Read-only check against saved policy and deterministic action staging</span>
                  </div>

                  <div className="assistant-admin-form-grid">
                    <label className="field">
                      <span>Workspace</span>
                      <select
                        className="control"
                        value={simulationWorkspace}
                        onChange={(event) => setSimulationWorkspace(event.target.value as ViewKey)}
                      >
                        {WORKSPACE_OPTIONS.map((workspace) => (
                          <option key={workspace} value={workspace}>
                            {workspaceLabel(workspace)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Phase</span>
                      <select
                        className="control"
                        value={simulationPhase}
                        onChange={(event) =>
                          setSimulationPhase(event.target.value as AssistantPolicySimulationPhase)
                        }
                      >
                        <option value="stage">Stage approval request</option>
                        <option value="execute">Execute with reviewer role</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Actor role</span>
                      <input
                        className="control"
                        value={simulationActorRole}
                        onChange={(event) => setSimulationActorRole(event.target.value)}
                        placeholder="OPS_ADMIN"
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Simulation context</span>
                    <textarea
                      className="control"
                      value={simulationContext}
                      onChange={(event) => setSimulationContext(event.target.value)}
                      placeholder="Selected trade:&#10;- trade_id: T-1022&#10;- commodity: WTI"
                    />
                  </label>
                  <label className="field">
                    <span>Prompt to stage</span>
                    <textarea
                      className="control assistant-admin-prompt"
                      value={simulationPrompt}
                      onChange={(event) => setSimulationPrompt(event.target.value)}
                      placeholder="Cancel the selected trade."
                    />
                    <small className="form-note">
                      Leave the prompt blank to inspect tool and action gates only.
                    </small>
                  </label>

                  <div className="toolbar settings-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleRunPolicySimulation()}
                      disabled={policySimulationLoading}
                    >
                      {policySimulationLoading ? 'Running Simulation...' : 'Run Policy Simulation'}
                    </button>
                  </div>

                  {policySimulationError ? (
                    <div className="feedback-banner feedback-banner-error">{policySimulationError}</div>
                  ) : null}

                  {policySimulation ? (
                    <>
                      <div className="assistant-builder-preview-grid">
                        <div className="assistant-sidebar-block">
                          <strong>Allowed tools</strong>
                          <p>{policySimulation.allowed_tools.length}</p>
                          <small>
                            {policyDecisionSummary(policySimulation.allowed_tools, 'No live tools allowed')}
                          </small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Blocked tools</strong>
                          <p>{policySimulation.blocked_tools.length}</p>
                          <small>{firstPolicyDecisionReason(policySimulation.blocked_tools)}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Allowed actions</strong>
                          <p>{policySimulation.allowed_actions.length}</p>
                          <small>
                            {policyDecisionSummary(policySimulation.allowed_actions, 'No actions allowed')}
                          </small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Blocked actions</strong>
                          <p>{policySimulation.blocked_actions.length}</p>
                          <small>{firstPolicyDecisionReason(policySimulation.blocked_actions)}</small>
                        </div>
                      </div>

                      {policySimulation.staging_warnings.length > 0 ? (
                        <div className="feedback-banner feedback-banner-error">
                          {policySimulation.staging_warnings.join(' ')}
                        </div>
                      ) : null}

                      {policySimulation.staged_action_proposals.length > 0 ? (
                        <div className="assistant-builder-warning-list">
                          {policySimulation.staged_action_proposals.map((proposal) => (
                            <div
                              key={`${proposal.action_type}-${proposal.summary}`}
                              className="assistant-sidebar-block"
                            >
                              <strong>{policyResourceLabel(proposal.action_type)}</strong>
                              <p>{proposal.summary}</p>
                              <small>
                                {proposal.decision.allowed
                                  ? 'This staged proposal is allowed by the selected simulation policy.'
                                  : proposal.decision.reason}
                              </small>
                            </div>
                          ))}
                        </div>
                      ) : simulationPrompt.trim() ? (
                        <small className="form-note">
                          No action proposal matched the prompt and context for this dry run.
                        </small>
                      ) : null}

                      <small className="form-note">{policySimulation.simulation_notes.join(' ')}</small>
                    </>
                  ) : null}
                </div>

                <div className="assistant-admin-form-grid">
                  <label className="field">
                    <span>Agent ID</span>
                    <input className="control" value={editForm.agent_id} disabled />
                  </label>
                  <label className="field">
                    <span>Name</span>
                    <input
                      className="control"
                      value={editForm.name}
                      onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="control"
                      value={editForm.status}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, status: event.target.value as AssistantAgentStatus }))
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Scope</span>
                    <select
                      className="control"
                      value={editForm.scope}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, scope: event.target.value as AssistantAgentScope }))
                      }
                    >
                      {SCOPE_OPTIONS.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Provider</span>
                    <select
                      className="control"
                      value={editForm.provider}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          provider: event.target.value as AssistantProvider | '',
                          model: event.target.value ? current.model : '',
                        }))
                      }
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider || 'inherit'} value={provider}>
                          {provider || 'Inherit backend default'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Model Override</span>
                    <input
                      className="control"
                      disabled={!editForm.provider}
                      value={editForm.model}
                      onChange={(event) => setEditForm((current) => ({ ...current, model: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Daily Token Allocation</span>
                    <input
                      className="control"
                      type="number"
                      min="0"
                      step="1"
                      value={editForm.daily_token_allocation}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          daily_token_allocation: event.target.value,
                        }))
                      }
                      placeholder="Inherit backend default"
                    />
                    <small className="form-note">
                      {describeDailyTokenAllocationMode(
                        editForm.daily_token_allocation,
                        selectedAgent.token_budget?.allocated_tokens,
                      )}{' '}
                      Leave blank to inherit; set 0 to stop this agent immediately.
                    </small>
                  </label>
                </div>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    className="control"
                    value={editForm.description}
                    onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>

                <div className="assistant-builder-preview assistant-profile-panel">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Profile Guardrails</span>
                      <h4>{describeProfileKind(editForm.profile_kind)}</h4>
                    </div>
                    <span>
                      {editFormRole
                        ? `${editFormRole.name} · ${roleCatalogStatusLabel(editFormRole)}`
                        : 'No role boundary selected'}
                    </span>
                  </div>

                  <div className="assistant-admin-form-grid">
                    <label className="field">
                      <span>Profile Kind</span>
                      <select
                        className="control"
                        value={editForm.profile_kind}
                        onChange={(event) => {
                          const nextProfileKind = event.target.value as AssistantAgentProfileKind
                          setEditForm((current) => ({
                            ...current,
                            profile_kind: nextProfileKind,
                            role_key: nextProfileKind === 'CUSTOM' ? '' : current.role_key,
                            profile_request_id:
                              nextProfileKind === 'CUSTOM' ? current.profile_request_id : null,
                          }))
                        }}
                      >
                        {PROFILE_KIND_OPTIONS.map((profileKind) => (
                          <option key={profileKind} value={profileKind}>
                            {describeProfileKind(profileKind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Role Archetype</span>
                      <select
                        className="control"
                        value={editForm.role_key}
                        disabled={editForm.profile_kind === 'CUSTOM'}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            role_key: event.target.value,
                            profile_kind:
                              event.target.value && current.profile_kind === 'CUSTOM'
                                ? 'ROLE_DERIVED'
                                : current.profile_kind,
                            profile_request_id: event.target.value ? null : current.profile_request_id,
                          }))
                        }
                      >
                        <option value="">Select role archetype</option>
                        {roleArchetypes.map((role) => (
                          <option key={role.role_key} value={role.role_key}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Profile Request</span>
                      <select
                        className="control"
                        value={editForm.profile_request_id ?? ''}
                        disabled={editForm.profile_kind !== 'CUSTOM'}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            profile_request_id: event.target.value ? Number(event.target.value) : null,
                          }))
                        }
                      >
                        <option value="">No approved request</option>
                        {approvedProfileRequests.map((request) => (
                          <option key={request.request_id} value={request.request_id}>
                            #{request.request_id} {titleFromAgentId(request.requested_agent_id) || request.human_owner_role}
                          </option>
                        ))}
                      </select>
                      <small className="form-note">
                        Binding an approved request preserves custom activation audit history.
                      </small>
                    </label>
                    <label className="field">
                      <span>Human Owner Role</span>
                      <input
                        className="control"
                        value={editForm.human_owner_role}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            human_owner_role: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Authority Ceiling</span>
                      <select
                        className="control"
                        value={editForm.authority_ceiling}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            authority_ceiling: event.target.value as AssistantAgentAuthorityLevel | '',
                          }))
                        }
                      >
                        <option value="">No authority ceiling</option>
                        {AUTHORITY_OPTIONS.map((authority) => (
                          <option key={authority} value={authority}>
                            {authority}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Specialization Summary</span>
                    <textarea
                      className="control"
                      value={editForm.specialization_summary}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          specialization_summary: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Activation Notes</span>
                    <textarea
                      className="control"
                      value={editForm.activation_notes}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          activation_notes: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <RoleProfileFitSummary fit={editProfileFit} />
                  <PromptProfilePreview form={editForm} role={editFormRole} />

                  {editFormRole ? (
                    <div className="toolbar settings-actions">
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => {
                          const roleDraft = buildAgentBuilderDraftFromRole(editFormRole, availableTools)
                          setEditForm((current) => ({
                            ...current,
                            profile_kind: 'ROLE_DERIVED',
                            role_key: roleDraft.role_key,
                            profile_request_id: null,
                            human_owner_role: roleDraft.human_owner_role,
                            authority_ceiling: roleDraft.authority_ceiling,
                            activation_notes: current.activation_notes || roleDraft.activation_notes,
                            specialization_summary:
                              current.specialization_summary || roleDraft.specialization_summary,
                            allowed_workspaces: roleDraft.allowed_workspaces,
                            capabilities: roleDraft.capabilities,
                            allowed_tools: roleDraft.allowed_tools,
                            allowed_action_types: roleDraft.allowed_action_types,
                            system_prompt: current.system_prompt.trim() ? current.system_prompt : roleDraft.system_prompt,
                          }))
                        }}
                      >
                        Reapply Role Guardrails
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="assistant-admin-option-grid">
                  <div className="assistant-admin-option-group">
                    <strong>Allowed workspaces</strong>
                    <div className="chip-row">
                      {WORKSPACE_OPTIONS.map((workspace) => (
                        <button
                          key={workspace}
                          type="button"
                          className={`entity-chip ${editForm.allowed_workspaces.includes(workspace) ? '' : 'entity-chip-soft'}`}
                          title={workspace}
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              allowed_workspaces: toggleSelection(current.allowed_workspaces, workspace, {
                                minSelections: 1,
                              }),
                            }))
                          }
                        >
                          {workspaceLabel(workspace)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Capabilities</strong>
                    <div className="chip-row">
                      {CAPABILITY_OPTIONS.map((capability) => (
                        <button
                          key={capability}
                          type="button"
                          className={`entity-chip ${editForm.capabilities.includes(capability) ? '' : 'entity-chip-soft'}`}
                          onClick={() => setEditForm((current) => toggleCapability(current, capability))}
                        >
                          {capability}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Allowed live tools</strong>
                    <p>
                      {editCanUseLiveTools
                        ? 'Choose a subset. Blank role profiles inherit role defaults; blank custom agents use no live tools.'
                        : 'Enable READ capability to allow live tools for this agent.'}
                    </p>
                    <div className="chip-row">
                      {availableTools.map((toolName) => (
                        <button
                          key={toolName}
                          type="button"
                          className={`entity-chip ${editForm.allowed_tools.includes(toolName) ? '' : 'entity-chip-soft'}`}
                          disabled={!editCanUseLiveTools}
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              allowed_tools: toggleSelection(current.allowed_tools, toolName),
                            }))
                          }
                        >
                          {toolName}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Allowed actions</strong>
                    <p>{editActionSummary}</p>
                    <div className="chip-row">
                      {ACTION_TYPE_OPTIONS.map((actionType) => (
                        <button
                          key={actionType}
                          type="button"
                          className={`entity-chip ${editForm.allowed_action_types.includes(actionType) ? '' : 'entity-chip-soft'}`}
                          disabled={!editCanStageActions}
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              allowed_action_types: toggleSelection(
                                current.allowed_action_types,
                                actionType,
                              ),
                            }))
                          }
                        >
                          {ACTION_TYPE_LABELS[actionType]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="field">
                  <span>System prompt</span>
                  <textarea
                    className="control assistant-admin-prompt"
                    value={editForm.system_prompt}
                    onChange={(event) => setEditForm((current) => ({ ...current, system_prompt: event.target.value }))}
                  />
                </label>

                <div className="toolbar settings-actions">
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={savingAgent || editBlockedByProfilePolicy}
                  >
                    {savingAgent ? 'Saving Agent...' : 'Save Agent'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  )
}
