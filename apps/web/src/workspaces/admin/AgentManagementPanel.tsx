import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  acceptAdminAssistantAgentHealthWorkPackage,
  approveAssistantAgentProfileRequest,
  buildAssistantAgentDraft,
  createAssistantAgentProfileRequest,
  createAssistantAgent,
  createAssistantAgentEval,
  deleteAssistantAgentEval,
  generateAssistantAgentSelfUpdateDraft,
  getAdminAssistantAgentHealthReview,
  getAdminAssistantAutonomyReview,
  listAdminAssistantAgentEvalRuns,
  listAdminAssistantAgentEvals,
  listAdminAssistantAgents,
  listAdminAssistantAgentRevisions,
  listAdminAssistantAgentWorkPackages,
  listAdminAssistantProfileRequests,
  listAdminAssistantRoleArchetypes,
  loadAssistantRuntimeSettings,
  publishAssistantAgentRevision,
  rejectAssistantAgentProfileRequest,
  runAssistantAgentEval,
  runAssistantAgentEvalSuite,
  simulateAssistantAgentPolicy,
  updateAdminAssistantAgentWorkPackage,
  updateAssistantAgentEval,
  updateAssistantAgent,
  type CreateAssistantAgentInput,
  type CreateAssistantAgentEvalInput,
  type CreateAssistantAgentProfileRequestInput,
  type SimulateAssistantAgentPolicyInput,
  type UpdateAssistantAgentEvalInput,
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
import {
  assistantActionTypeOptions,
  buildAssistantActionDefinitionMap,
  formatAssistantActionTypeLabel,
} from '../../entities/assistant/actionCatalog'
import { seedAssistantAgents } from '../../entities/app/adminApi'
import { workspaceLabel } from '../../entities/app/appViews'
import { appConfig } from '../../shared/config'
import type {
  AssistantActionDefinition,
  AssistantActionType,
  AssistantAdminAgent,
  AssistantAgentAuthorityLevel,
  AssistantAgentEval,
  AssistantAgentEvalRun,
  AssistantAgentEvalRunStatus,
  AssistantAgentHealthReview,
  AssistantAgentRevision,
  AssistantAgentRevisionPayload,
  AssistantAgentSkillDefinition,
  AssistantAgentSkillKey,
  AssistantAgentSelfUpdateDraft,
  AssistantAgentWorkPackage,
  AssistantAgentWorkPackageStatus,
  AssistantAutonomyReviewBrief,
  AssistantAgentCapability,
  AssistantAgentEvalGateStatus,
  AssistantAgentOrchestrationPattern,
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
  type AgentBuilderTemplateAvailability,
  type AgentBuilderTemplateKey,
  type AgentRoleProfileFit,
  type AgentRoleProfileFitStatus,
} from './assistantAgentBuilder'
import {
  applyControlTowerSupervisionDraft,
  controlTowerSignalTypeLabel,
  controlTowerSupervisionModeLabel,
  type AssistantControlTowerAgentSupervisionIntent,
  type AssistantControlTowerSupervisionIntent,
} from './assistantSupervisionDraft'

type AgentManagementPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
  controlTowerIntent?: AssistantControlTowerSupervisionIntent | null
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AgentWorkPackageDraft = {
  notes: string
  prUrl: string
  commitSha: string
  evalIds: string
  testNames: string
  docPaths: string
  owner: string
}

type AgentWorkPackageFilters = {
  status: '' | AssistantAgentWorkPackageStatus
  sourceAgentId: string
  staleOnly: boolean
  hasPr: boolean
  hasCommit: boolean
  hasEval: boolean
  hasTests: boolean
  hasDocs: boolean
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

type AgentEvalForm = {
  name: string
  workspace: ViewKey
  prompt: string
  context: string
  use_live_tools: boolean
  expected_substrings: string
  expected_tool_names: string
  expected_action_types: AssistantActionType[]
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
const ORCHESTRATION_PATTERN_OPTIONS: AssistantAgentOrchestrationPattern[] = [
  'SINGLE',
  'MANAGER',
  'TRIAGE',
  'PARALLEL',
  'EVALUATOR',
]
const DEFAULT_AGENT_WORK_PACKAGE_FILTERS: AgentWorkPackageFilters = {
  status: '',
  sourceAgentId: '',
  staleOnly: false,
  hasPr: false,
  hasCommit: false,
  hasEval: false,
  hasTests: false,
  hasDocs: false,
}

const STALE_WORK_PACKAGE_THRESHOLD_HOURS = 72
const STALE_WORK_PACKAGE_THRESHOLD_MS = STALE_WORK_PACKAGE_THRESHOLD_HOURS * 60 * 60 * 1000

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

function createEmptyAgentEvalForm(agent: AssistantAdminAgent | null = null): AgentEvalForm {
  return {
    name: '',
    workspace: agent?.allowed_workspaces.includes('assistant')
      ? 'assistant'
      : agent?.allowed_workspaces[0] ?? 'assistant',
    prompt: '',
    context: '',
    use_live_tools: agent ? agent.capabilities.includes('READ') : true,
    expected_substrings: '',
    expected_tool_names: '',
    expected_action_types: [],
  }
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toAgentEvalForm(record: AssistantAgentEval): AgentEvalForm {
  return {
    name: record.name,
    workspace: record.workspace,
    prompt: record.prompt,
    context: record.context ?? '',
    use_live_tools: record.use_live_tools,
    expected_substrings: record.expected_substrings.join('\n'),
    expected_tool_names: record.expected_tool_names.join('\n'),
    expected_action_types: [...record.expected_action_types],
  }
}

function normalizeAgentEvalPayload(form: AgentEvalForm): UpdateAssistantAgentEvalInput {
  return {
    name: form.name.trim(),
    workspace: form.workspace,
    prompt: form.prompt.trim(),
    context: form.context.trim() || null,
    use_live_tools: form.use_live_tools,
    expected_substrings: splitLines(form.expected_substrings),
    expected_tool_names: splitLines(form.expected_tool_names),
    expected_action_types: form.expected_action_types,
  }
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
    orchestration_pattern: agent.orchestration_pattern,
    parent_agent_id: agent.parent_agent_id ?? '',
    managed_agent_ids: [...agent.managed_agent_ids],
    delegation_guidance: agent.delegation_guidance ?? '',
    profile_request_id: agent.profile_request_id ?? null,
    allowed_workspaces: [...agent.allowed_workspaces],
    capabilities: [...agent.capabilities],
    skills: [...agent.skills],
    allowed_tools: [...agent.allowed_tools],
    allowed_action_types: [...agent.allowed_action_types],
    daily_token_allocation:
      agent.daily_token_allocation === null || agent.daily_token_allocation === undefined
        ? ''
        : String(agent.daily_token_allocation),
    system_prompt: agent.system_prompt,
  }
}

function toAgentFormFromSelfUpdateDraft(draft: AssistantAgentSelfUpdateDraft): AgentForm {
  return toAgentFormFromRevisionPayload({
    name: draft.name,
    description: draft.description,
    status: draft.status,
    scope: draft.scope,
    provider: draft.provider,
    model: draft.model,
    role_key: draft.role_key ?? null,
    profile_kind: draft.profile_kind,
    specialization_summary: draft.specialization_summary ?? null,
    human_owner_role: draft.human_owner_role ?? null,
    authority_ceiling: draft.authority_ceiling ?? null,
    activation_notes: draft.activation_notes ?? null,
    orchestration_pattern: draft.orchestration_pattern,
    parent_agent_id: draft.parent_agent_id ?? null,
    managed_agent_ids: [...draft.managed_agent_ids],
    delegation_guidance: draft.delegation_guidance ?? null,
    profile_request_id: draft.profile_request_id ?? null,
    allowed_workspaces: [...draft.allowed_workspaces],
    capabilities: [...draft.capabilities],
    skills: [...draft.skills],
    allowed_tools: [...draft.allowed_tools],
    allowed_action_types: [...draft.allowed_action_types],
    daily_token_allocation: draft.daily_token_allocation ?? null,
    system_prompt: draft.system_prompt,
  }, draft.agent_id)
}

function toAgentFormFromRevisionPayload(payload: AssistantAgentRevisionPayload, agentId: string): AgentForm {
  return {
    agent_id: agentId,
    name: payload.name,
    description: payload.description,
    status: payload.status,
    scope: payload.scope,
    provider: payload.provider ?? '',
    model: payload.model ?? '',
    role_key: payload.role_key ?? '',
    profile_kind: payload.profile_kind ?? 'CUSTOM',
    specialization_summary: payload.specialization_summary ?? '',
    human_owner_role: payload.human_owner_role ?? '',
    authority_ceiling: payload.authority_ceiling ?? '',
    activation_notes: payload.activation_notes ?? '',
    orchestration_pattern: payload.orchestration_pattern,
    parent_agent_id: payload.parent_agent_id ?? '',
    managed_agent_ids: [...payload.managed_agent_ids],
    delegation_guidance: payload.delegation_guidance ?? '',
    profile_request_id: payload.profile_request_id ?? null,
    allowed_workspaces: [...payload.allowed_workspaces],
    capabilities: [...payload.capabilities],
    skills: [...payload.skills],
    allowed_tools: [...payload.allowed_tools],
    allowed_action_types: [...payload.allowed_action_types],
    daily_token_allocation:
      payload.daily_token_allocation === null || payload.daily_token_allocation === undefined
        ? ''
        : String(payload.daily_token_allocation),
    system_prompt: payload.system_prompt,
  }
}

function toRevisionFromSelfUpdateDraft(draft: AssistantAgentSelfUpdateDraft): AssistantAgentRevision {
  return {
    revision_id: draft.revision_id,
    agent_id: draft.agent_id,
    version: draft.revision_version,
    change_summary: draft.change_summary,
    diff_summary: draft.diff_summary,
    payload: {
      name: draft.name,
      description: draft.description,
      status: draft.status,
      scope: draft.scope,
      provider: draft.provider,
      model: draft.model,
      role_key: draft.role_key ?? null,
      profile_kind: draft.profile_kind,
      specialization_summary: draft.specialization_summary ?? null,
      human_owner_role: draft.human_owner_role ?? null,
      authority_ceiling: draft.authority_ceiling ?? null,
      activation_notes: draft.activation_notes ?? null,
      orchestration_pattern: draft.orchestration_pattern,
      parent_agent_id: draft.parent_agent_id ?? null,
      managed_agent_ids: [...draft.managed_agent_ids],
      delegation_guidance: draft.delegation_guidance ?? null,
      profile_request_id: draft.profile_request_id ?? null,
      allowed_workspaces: draft.allowed_workspaces,
      capabilities: draft.capabilities,
      skills: draft.skills,
      allowed_tools: draft.allowed_tools,
      allowed_action_types: draft.allowed_action_types,
      daily_token_allocation: draft.daily_token_allocation ?? null,
      system_prompt: draft.system_prompt,
    },
    created_at: draft.created_at,
    created_by: draft.created_by,
    published_at: draft.published_at,
    published_by: draft.published_by,
    restored_from_revision_id: null,
    is_published: Boolean(draft.published_at),
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
    orchestration_pattern: form.orchestration_pattern,
    parent_agent_id: form.parent_agent_id.trim() ? form.parent_agent_id.trim() : null,
    managed_agent_ids: form.managed_agent_ids,
    delegation_guidance: form.delegation_guidance.trim() ? form.delegation_guidance.trim() : null,
    profile_request_id: form.profile_request_id,
    allowed_workspaces: form.allowed_workspaces,
    capabilities: form.capabilities,
    skills: form.skills,
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

function evalGateTone(status: AssistantAgentEvalGateStatus): 'planned' | 'active' | 'cancelled' {
  if (status === 'PASS') {
    return 'active'
  }
  if (status === 'BLOCKED') {
    return 'cancelled'
  }
  return 'planned'
}

function describeEvalGate(agent: AssistantAdminAgent): string {
  const gate = agent.eval_gate
  if (!gate) {
    return 'Eval coverage status will appear after the agent reloads from Admin.'
  }
  if (gate.status === 'PASS') {
    return `${gate.covered_cases.length} eval case${gate.covered_cases.length === 1 ? '' : 's'} cover activation.`
  }
  if (gate.status === 'BLOCKED') {
    return gate.missing_cases[0] ?? 'Eval coverage must be completed before activation or promotion.'
  }
  return 'No eval gate is required for this draft-only profile.'
}

function describeAgentEval(record: AssistantAgentEval): string {
  const expectations = [
    record.expected_substrings.length > 0
      ? `${record.expected_substrings.length} text assertion${record.expected_substrings.length === 1 ? '' : 's'}`
      : '',
    record.expected_tool_names.length > 0
      ? `${record.expected_tool_names.length} tool assertion${record.expected_tool_names.length === 1 ? '' : 's'}`
      : '',
    record.expected_action_types.length > 0
      ? `${record.expected_action_types.length} action assertion${record.expected_action_types.length === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean)

  return expectations.length > 0
    ? expectations.join(' · ')
    : 'Coverage case recorded; add assertions as the harness grows.'
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

function orchestrationPatternLabel(pattern: AssistantAgentOrchestrationPattern): string {
  switch (pattern) {
    case 'MANAGER':
      return 'Manager'
    case 'TRIAGE':
      return 'Triage'
    case 'PARALLEL':
      return 'Parallel'
    case 'EVALUATOR':
      return 'Evaluator'
    default:
      return 'Single'
  }
}

function agentHierarchyLabel(agent: Pick<AssistantAdminAgent, 'agent_id' | 'name' | 'role_key'>): string {
  return `${agent.name} (${agent.agent_id})${agent.role_key ? ` · ${agent.role_key}` : ''}`
}

function findAgentLabelById(
  agentId: string,
  agentRecords: readonly Pick<AssistantAdminAgent, 'agent_id' | 'name' | 'role_key'>[],
): string {
  const record = agentRecords.find((agent) => agent.agent_id === agentId)
  return record ? agentHierarchyLabel(record) : agentId
}

function describeRoleKeyList(roleKeys: readonly string[]): string {
  return roleKeys.length > 0 ? roleKeys.map((roleKey) => titleFromAgentId(roleKey) || roleKey).join(' · ') : 'None'
}

function resolveRecommendedHierarchyAgents(
  role: AssistantAgentRoleArchetype,
  agentRecords: AssistantAdminAgent[],
  currentAgentId: string,
): {
  parentAgent: AssistantAdminAgent | null
  managedAgents: AssistantAdminAgent[]
} {
  const normalizedCurrentAgentId = currentAgentId.trim()
  const availableAgents = agentRecords.filter((agent) => agent.agent_id !== normalizedCurrentAgentId)
  const parentAgent =
    role.recommended_parent_role_keys
      .map((roleKey) => availableAgents.find((agent) => agent.role_key === roleKey) ?? null)
      .find((agent) => agent !== null) ?? null
  const seenManagedIds = new Set<string>()
  const managedAgents: AssistantAdminAgent[] = []

  for (const roleKey of role.recommended_managed_role_keys) {
    for (const agent of availableAgents) {
      if (agent.role_key !== roleKey || seenManagedIds.has(agent.agent_id)) {
        continue
      }
      managedAgents.push(agent)
      seenManagedIds.add(agent.agent_id)
    }
  }

  return { parentAgent, managedAgents }
}

function applyRoleHierarchyRecommendations(
  form: AgentForm,
  role: AssistantAgentRoleArchetype,
  agentRecords: AssistantAdminAgent[],
): AgentForm {
  const recommendation = resolveRecommendedHierarchyAgents(role, agentRecords, form.agent_id)
  return {
    ...form,
    orchestration_pattern: role.recommended_orchestration_pattern,
    parent_agent_id: recommendation.parentAgent?.agent_id ?? '',
    managed_agent_ids: recommendation.managedAgents.map((agent) => agent.agent_id),
    delegation_guidance: role.delegation_guidance.join(' '),
  }
}

function describeHierarchyPlan(
  form: AgentForm,
  agentRecords: readonly Pick<AssistantAdminAgent, 'agent_id' | 'name' | 'role_key'>[],
): string {
  const segments = [orchestrationPatternLabel(form.orchestration_pattern)]
  if (form.parent_agent_id.trim()) {
    segments.push(`reports to ${findAgentLabelById(form.parent_agent_id.trim(), agentRecords)}`)
  }
  if (form.managed_agent_ids.length > 0) {
    segments.push(
      `${form.managed_agent_ids.length} managed subordinate${form.managed_agent_ids.length === 1 ? '' : 's'}`,
    )
  }
  return segments.join(' · ')
}

type AgentHierarchyEditorProps = {
  form: AgentForm
  setForm: React.Dispatch<React.SetStateAction<AgentForm>>
  role: AssistantAgentRoleArchetype | null
  agentRecords: AssistantAdminAgent[]
}

type AgentSkillSelectorProps = {
  selectedSkills: AssistantAgentSkillKey[]
  availableSkills: AssistantAgentSkillDefinition[]
  onToggle: (skillName: AssistantAgentSkillKey) => void
  description: string
}

function AgentSkillSelector({
  selectedSkills,
  availableSkills,
  onToggle,
  description,
}: AgentSkillSelectorProps) {
  return (
    <div className="assistant-admin-option-group">
      <strong>Skills</strong>
      <p>{description}</p>
      <div className="chip-row">
        {availableSkills.map((skill) => (
          <button
            key={skill.name}
            type="button"
            className={`entity-chip ${selectedSkills.includes(skill.name) ? '' : 'entity-chip-soft'}`}
            onClick={() => onToggle(skill.name)}
            title={skill.description}
          >
            {skill.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AgentHierarchyEditor({
  form,
  setForm,
  role,
  agentRecords,
}: AgentHierarchyEditorProps) {
  const selectableAgents = agentRecords.filter((agent) => agent.agent_id !== form.agent_id.trim())
  const recommendedHierarchy = role
    ? resolveRecommendedHierarchyAgents(role, agentRecords, form.agent_id)
    : null

  return (
    <div className="assistant-builder-preview assistant-profile-panel">
      <div className="assistant-admin-section-head">
        <div>
          <span className="eyebrow">Hierarchy</span>
          <h4>{orchestrationPatternLabel(form.orchestration_pattern)} orchestration</h4>
        </div>
        <span>
          {role
            ? `Recommended ${orchestrationPatternLabel(role.recommended_orchestration_pattern)}`
            : 'Optional for custom agents'}
        </span>
      </div>

      <div className="assistant-admin-form-grid">
        <label className="field">
          <span>Orchestration Pattern</span>
          <select
            className="control"
            value={form.orchestration_pattern}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                orchestration_pattern: event.target.value as AssistantAgentOrchestrationPattern,
                managed_agent_ids:
                  event.target.value === 'SINGLE' ? [] : current.managed_agent_ids,
              }))
            }
          >
            {ORCHESTRATION_PATTERN_OPTIONS.map((pattern) => (
              <option key={pattern} value={pattern}>
                {orchestrationPatternLabel(pattern)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Parent Agent</span>
          <select
            className="control"
            value={form.parent_agent_id}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                parent_agent_id: event.target.value,
              }))
            }
          >
            <option value="">No parent agent</option>
            {selectableAgents.map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agentHierarchyLabel(agent)}
              </option>
            ))}
          </select>
          <small className="form-note">
            Use a parent when this agent should report conclusions upward instead of owning final synthesis itself.
          </small>
        </label>
      </div>

      <div className="assistant-admin-option-group">
        <strong>Managed subordinates</strong>
        <p>
          Pick the concrete agents this manager can consult. Save stays blocked if you keep subordinates on a
          single-agent pattern.
        </p>
        <div className="chip-row">
          {selectableAgents.map((agent) => (
            <button
              key={agent.agent_id}
              type="button"
              className={`entity-chip ${form.managed_agent_ids.includes(agent.agent_id) ? '' : 'entity-chip-soft'}`}
              disabled={form.orchestration_pattern === 'SINGLE'}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  managed_agent_ids: toggleSelection(current.managed_agent_ids, agent.agent_id),
                }))
              }
              title={agent.role_key ?? agent.agent_id}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Delegation Guidance</span>
        <textarea
          className="control"
          value={form.delegation_guidance}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              delegation_guidance: event.target.value,
            }))
          }
          placeholder="Describe when this agent should delegate, what it still owns, and when it should stop."
        />
      </label>

      <div className="assistant-builder-preview-grid">
        <div className="assistant-sidebar-block">
          <strong>Current plan</strong>
          <p>{describeHierarchyPlan(form, agentRecords)}</p>
          <small>
            {form.managed_agent_ids.length > 0
              ? form.managed_agent_ids.map((agentId) => findAgentLabelById(agentId, agentRecords)).join(' · ')
              : 'No managed subordinates selected'}
          </small>
        </div>
        <div className="assistant-sidebar-block">
          <strong>Recommended topology</strong>
          <p>
            {role
              ? `${orchestrationPatternLabel(role.recommended_orchestration_pattern)} · parent ${describeRoleKeyList(
                  role.recommended_parent_role_keys,
                )}`
              : 'No role recommendation selected'}
          </p>
          <small>
            {role
              ? `Managed roles: ${describeRoleKeyList(role.recommended_managed_role_keys)}`
              : 'Custom agents can stay single until a reusable delegation pattern proves out.'}
          </small>
        </div>
        <div className="assistant-sidebar-block">
          <strong>Resolved recommendations</strong>
          <p>
            {recommendedHierarchy?.parentAgent
              ? `Parent: ${recommendedHierarchy.parentAgent.name}`
              : 'No recommended parent agent loaded'}
          </p>
          <small>
            {recommendedHierarchy && recommendedHierarchy.managedAgents.length > 0
              ? recommendedHierarchy.managedAgents.map((agent) => agent.name).join(' · ')
              : 'No recommended subordinate agents are currently loaded'}
          </small>
        </div>
      </div>

      {form.orchestration_pattern !== 'SINGLE' && !form.skills.includes('inter_agent_consultation') ? (
        <small className="form-note">
          Add the Inter-Agent Consultation skill before saving a multi-agent orchestration pattern.
        </small>
      ) : null}

      {role ? (
        <div className="toolbar settings-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setForm((current) => applyRoleHierarchyRecommendations(current, role, agentRecords))}
          >
            Apply Role Hierarchy
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() =>
              setForm((current) => ({
                ...current,
                parent_agent_id: '',
                managed_agent_ids: [],
              }))
            }
          >
            Clear Wiring
          </button>
        </div>
      ) : null}
    </div>
  )
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
    return 'Role preset'
  }
  if (role.catalog_status === 'PHASE_1') {
    return 'Phase 1'
  }
  return 'Future'
}

function roleCatalogSyncSummary(role: AssistantAgentRoleArchetype): string {
  if (role.current_profile_ids.length > 0) {
    return `Synced defaults: ${role.current_profile_ids.join(' · ')}`
  }
  if (role.catalog_status === 'PHASE_1') {
    return 'Pilot blueprint only until a human saves a role-derived profile.'
  }
  if (role.catalog_status === 'TEMPLATE') {
    return 'Role preset only; not auto-synchronized into the managed roster.'
  }
  return 'No synchronized default profile.'
}

function templateAvailabilityLabel(availability: AgentBuilderTemplateAvailability): string {
  return availability === 'SEEDED_DEFAULT' ? 'Seeded default' : 'Template only'
}

function templateAvailabilityTone(availability: AgentBuilderTemplateAvailability): 'active' | 'planned' {
  return availability === 'SEEDED_DEFAULT' ? 'active' : 'planned'
}

function listSummary(values: readonly string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(' · ') : emptyLabel
}

function actionSummary(
  values: readonly AssistantActionType[],
  actionDefinitionsByName: ReadonlyMap<string, AssistantActionDefinition>,
): string {
  return values.length > 0
    ? values.map((actionType) => formatAssistantActionTypeLabel(actionType, actionDefinitionsByName)).join(' · ')
    : 'No governed actions'
}

function agentEvalExpectationSummary(record: AssistantAgentEval): string {
  const segments = [
    `${record.expected_substrings.length} text check${record.expected_substrings.length === 1 ? '' : 's'}`,
    `${record.expected_tool_names.length} tool check${record.expected_tool_names.length === 1 ? '' : 's'}`,
    `${record.expected_action_types.length} action check${record.expected_action_types.length === 1 ? '' : 's'}`,
  ]
  return segments.join(' · ')
}

function evalRunStatusTone(status: AssistantAgentEvalRunStatus): 'active' | 'cancelled' {
  return status === 'PASS' ? 'active' : 'cancelled'
}

function evalRunStatusLabel(status: AssistantAgentEvalRunStatus): string {
  if (status === 'PASS') {
    return 'Passed'
  }
  if (status === 'FAIL') {
    return 'Failed'
  }
  return 'Errored'
}

function policyResourceLabel(
  resourceId: string,
  actionDefinitionsByName: ReadonlyMap<string, AssistantActionDefinition>,
): string {
  return formatAssistantActionTypeLabel(resourceId, actionDefinitionsByName)
}

function policyDecisionSummary(
  decisions: readonly AssistantPolicyDecision[],
  emptyLabel: string,
  actionDefinitionsByName: ReadonlyMap<string, AssistantActionDefinition>,
): string {
  return decisions.length > 0
    ? decisions.map((decision) => policyResourceLabel(decision.resource_id, actionDefinitionsByName)).join(' · ')
    : emptyLabel
}

function firstPolicyDecisionReason(decisions: readonly AssistantPolicyDecision[]): string {
  return decisions[0]?.reason ?? 'No policy decisions in this bucket.'
}

function autonomyReviewRecommendationLabel(
  recommendation: AssistantAutonomyReviewBrief['recommended_next_authority'],
): string {
  if (recommendation === 'ELIGIBLE_FOR_BOUNDED_REVIEW') {
    return 'Bounded review candidate'
  }
  if (recommendation === 'PAUSE') {
    return 'Pause'
  }
  if (recommendation === 'NARROW') {
    return 'Narrow'
  }
  return 'Keep staged'
}

function healthReviewPriorityLabel(priority: string): string {
  if (priority === 'P1') {
    return 'High'
  }
  if (priority === 'P2') {
    return 'Medium'
  }
  if (priority === 'P3') {
    return 'Planned'
  }
  return 'Watch'
}

function agentWorkPackageStatusLabel(status: AssistantAgentWorkPackageStatus): string {
  if (status === 'IN_PROGRESS') {
    return 'In progress'
  }
  if (status === 'IMPLEMENTED') {
    return 'Implemented'
  }
  if (status === 'DISMISSED') {
    return 'Dismissed'
  }
  if (status === 'ACCEPTED') {
    return 'Accepted'
  }
  return 'Candidate'
}

function agentWorkPackageNextStatuses(
  status: AssistantAgentWorkPackageStatus,
): AssistantAgentWorkPackageStatus[] {
  if (status === 'ACCEPTED') {
    return ['IN_PROGRESS', 'DISMISSED']
  }
  if (status === 'IN_PROGRESS') {
    return ['IMPLEMENTED', 'DISMISSED']
  }
  return []
}

function workPackageDraftFromRecord(workPackage: AssistantAgentWorkPackage): AgentWorkPackageDraft {
  return {
    notes: workPackage.notes ?? '',
    prUrl: workPackage.implementation_evidence.pr_url ?? '',
    commitSha: workPackage.implementation_evidence.commit_sha ?? '',
    evalIds: workPackage.implementation_evidence.eval_ids.join(', '),
    testNames: workPackage.implementation_evidence.test_names.join('\n'),
    docPaths: workPackage.implementation_evidence.doc_paths.join('\n'),
    owner: workPackage.implementation_evidence.owner ?? '',
  }
}

function splitDraftLines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  )
}

function parseDraftEvalIds(value: string): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const entry of splitDraftLines(value)) {
    const resolved = Number.parseInt(entry, 10)
    if (!Number.isFinite(resolved) || resolved <= 0 || seen.has(resolved)) {
      continue
    }
    ids.push(resolved)
    seen.add(resolved)
  }
  return ids
}

function workPackageHasImplementationEvidence(workPackage: AssistantAgentWorkPackage): boolean {
  return Boolean(
    workPackage.implementation_evidence.pr_url ||
      workPackage.implementation_evidence.commit_sha ||
      workPackage.implementation_evidence.eval_ids.length > 0 ||
      workPackage.implementation_evidence.test_names.length > 0 ||
      workPackage.implementation_evidence.doc_paths.length > 0,
  )
}

function isStaleOpenWorkPackage(workPackage: AssistantAgentWorkPackage, now = Date.now()): boolean {
  if (workPackage.status !== 'ACCEPTED' && workPackage.status !== 'IN_PROGRESS') {
    return false
  }
  if (workPackageHasImplementationEvidence(workPackage)) {
    return false
  }

  const updatedAt = Date.parse(workPackage.updated_at)
  if (!Number.isFinite(updatedAt)) {
    return false
  }

  return now - updatedAt >= STALE_WORK_PACKAGE_THRESHOLD_MS
}

function applyLocalWorkPackageFilters(
  workPackages: AssistantAgentWorkPackage[],
  filters: AgentWorkPackageFilters,
): AssistantAgentWorkPackage[] {
  const now = Date.now()
  return workPackages.filter((workPackage) => {
    if (filters.sourceAgentId && !workPackage.source_agent_ids.includes(filters.sourceAgentId)) {
      return false
    }
    if (filters.staleOnly && !isStaleOpenWorkPackage(workPackage, now)) {
      return false
    }
    return true
  })
}

function hasActiveWorkPackageFilters(filters: AgentWorkPackageFilters): boolean {
  return Boolean(
    filters.status ||
      filters.sourceAgentId ||
      filters.staleOnly ||
      filters.hasPr ||
      filters.hasCommit ||
      filters.hasEval ||
      filters.hasTests ||
      filters.hasDocs,
  )
}

function PromptProfilePreview({
  form,
  role,
  agentRecords,
}: {
  form: AgentForm
  role: AssistantAgentRoleArchetype | null
  agentRecords: AssistantAdminAgent[]
}) {
  const previewLines = [
    `${describeProfileKind(form.profile_kind)}${role ? ` · ${role.name}` : ''}`,
    'Build recipe: hierarchy + role + skills + capabilities + workspaces + tools + actions + prompt',
    form.human_owner_role ? `Owner: ${form.human_owner_role}` : null,
    form.authority_ceiling ? `Authority: ${form.authority_ceiling}` : null,
    `Hierarchy: ${describeHierarchyPlan(form, agentRecords)}`,
    form.delegation_guidance ? `Delegation: ${form.delegation_guidance}` : null,
    form.skills.length > 0 ? `Skills: ${form.skills.join(' · ')}` : 'Skills: none selected',
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

function describeChangedValue(current: string, next: string): string {
  return current === next ? next : `${current} -> ${next}`
}

function summarizeCapabilitySelection(values: readonly AssistantAgentCapability[]): string {
  return values.length > 0 ? values.join(' · ') : 'No capabilities selected'
}

function formatAssistantSkillLabel(
  skill: AssistantAgentSkillKey,
  definitionsByName: ReadonlyMap<AssistantAgentSkillKey, AssistantAgentSkillDefinition>,
): string {
  return (
    definitionsByName.get(skill)?.label ??
    skill
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  )
}

function summarizeSkillSelection(
  values: readonly AssistantAgentSkillKey[],
  definitionsByName: ReadonlyMap<AssistantAgentSkillKey, AssistantAgentSkillDefinition>,
): string {
  return values.length > 0
    ? values.map((skill) => formatAssistantSkillLabel(skill, definitionsByName)).join(' · ')
    : 'No explicit skill set'
}

function summarizeToolSelection(values: readonly string[]): string {
  return values.length > 0 ? `${values.length} explicit tool${values.length === 1 ? '' : 's'}` : 'No explicit tool subset'
}

function summarizeActionSelection(values: readonly AssistantActionType[]): string {
  return values.length > 0
    ? `${values.length} governed action${values.length === 1 ? '' : 's'}`
    : 'No explicit governed actions'
}

export function AgentManagementPanel({
  authSession,
  formatDate,
  onOpenSettings,
  controlTowerIntent = null,
}: AgentManagementPanelProps) {
  const requestSequenceRef = useRef(0)
  const appliedSupervisionIntentIdRef = useRef<number | null>(null)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [agentRecords, setAgentRecords] = useState<AssistantAdminAgent[]>([])
  const [profileRequests, setProfileRequests] = useState<AssistantAgentProfileRequest[]>([])
  const [agentEvalRecords, setAgentEvalRecords] = useState<AssistantAgentEval[]>([])
  const [availableSkills, setAvailableSkills] = useState<AssistantAgentSkillDefinition[]>([])
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [availableActionDefinitions, setAvailableActionDefinitions] = useState<AssistantActionDefinition[]>([])
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
  const [autonomyReview, setAutonomyReview] = useState<AssistantAutonomyReviewBrief | null>(null)
  const [autonomyReviewLoading, setAutonomyReviewLoading] = useState(false)
  const [autonomyReviewError, setAutonomyReviewError] = useState('')
  const [selfUpdateBrief, setSelfUpdateBrief] = useState('')
  const [selfUpdateDraft, setSelfUpdateDraft] = useState<AssistantAgentSelfUpdateDraft | null>(null)
  const [selfUpdateLoading, setSelfUpdateLoading] = useState(false)
  const [selfUpdateError, setSelfUpdateError] = useState('')
  const [agentRevisions, setAgentRevisions] = useState<AssistantAgentRevision[]>([])
  const [agentRevisionsLoading, setAgentRevisionsLoading] = useState(false)
  const [agentRevisionsError, setAgentRevisionsError] = useState('')
  const [publishingRevisionId, setPublishingRevisionId] = useState<number | null>(null)
  const [agentHealthReview, setAgentHealthReview] = useState<AssistantAgentHealthReview | null>(null)
  const [agentHealthReviewLoading, setAgentHealthReviewLoading] = useState(false)
  const [agentHealthReviewError, setAgentHealthReviewError] = useState('')
  const [agentWorkPackages, setAgentWorkPackages] = useState<AssistantAgentWorkPackage[]>([])
  const [trackedWorkPackageKeys, setTrackedWorkPackageKeys] = useState<string[]>([])
  const [agentWorkPackagesLoading, setAgentWorkPackagesLoading] = useState(false)
  const [agentWorkPackageError, setAgentWorkPackageError] = useState('')
  const [acceptingWorkPackageId, setAcceptingWorkPackageId] = useState<string | null>(null)
  const [transitioningWorkPackageId, setTransitioningWorkPackageId] = useState<string | null>(null)
  const [agentWorkPackageFilters, setAgentWorkPackageFilters] =
    useState<AgentWorkPackageFilters>(DEFAULT_AGENT_WORK_PACKAGE_FILTERS)
  const [workPackageDrafts, setWorkPackageDrafts] = useState<Record<string, AgentWorkPackageDraft>>({})
  const [selectedAgentEvalId, setSelectedAgentEvalId] = useState<number | null>(null)
  const [agentEvalForm, setAgentEvalForm] = useState<AgentEvalForm>(() => createEmptyAgentEvalForm())
  const [agentEvalRuns, setAgentEvalRuns] = useState<AssistantAgentEvalRun[]>([])
  const [agentEvalRunsLoading, setAgentEvalRunsLoading] = useState(false)
  const [agentEvalError, setAgentEvalError] = useState('')
  const [savingAgentEval, setSavingAgentEval] = useState(false)
  const [deletingAgentEvalId, setDeletingAgentEvalId] = useState<number | null>(null)
  const [runningAgentEvalId, setRunningAgentEvalId] = useState<number | null>(null)
  const [runningAgentEvalSuite, setRunningAgentEvalSuite] = useState(false)
  const [activeSupervisionIntent, setActiveSupervisionIntent] =
    useState<AssistantControlTowerAgentSupervisionIntent | null>(null)

  const selectedAgent = useMemo(
    () => agentRecords.find((agent) => agent.agent_id === selectedAgentId) ?? null,
    [agentRecords, selectedAgentId],
  )
  const selectedAgentEvalRecords = useMemo(
    () =>
      selectedAgent
        ? agentEvalRecords.filter((record) => record.agent_id === selectedAgent.agent_id)
        : [],
    [agentEvalRecords, selectedAgent],
  )
  const selectedAgentEval = useMemo(
    () => selectedAgentEvalRecords.find((record) => record.eval_id === selectedAgentEvalId) ?? null,
    [selectedAgentEvalId, selectedAgentEvalRecords],
  )
  const selectedAgentEvals = selectedAgentEvalRecords
  const selectedEvalRecord = selectedAgentEval
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
  const actionDefinitionsByName = useMemo(
    () => buildAssistantActionDefinitionMap(availableActionDefinitions),
    [availableActionDefinitions],
  )
  const skillDefinitionsByName = useMemo(
    () => new Map(availableSkills.map((skill) => [skill.name, skill])),
    [availableSkills],
  )
  const actionTypeOptions = useMemo(
    () => assistantActionTypeOptions(availableActionDefinitions),
    [availableActionDefinitions],
  )
  const createWorkspaceSummary = createForm.allowed_workspaces.map((workspace) => workspaceLabel(workspace)).join(' · ')
  const createCapabilitySummary = createForm.capabilities.join(' · ')
  const createSkillSummary = summarizeSkillSelection(createForm.skills, skillDefinitionsByName)
  const createLiveToolSummary = describeLiveToolPlan(createForm, availableTools)
  const createActionSummary = describeActionPlan(createForm)
  const editSkillSummary = summarizeSkillSelection(editForm.skills, skillDefinitionsByName)
  const editActionSummary = describeActionPlan(editForm)
  const supervisionPolicyMessages = useMemo(
    () =>
      activeSupervisionIntent
        ? [...editProfileFit.errors.slice(0, 1), ...editProfileFit.warnings.slice(0, 2)]
        : [],
    [activeSupervisionIntent, editProfileFit],
  )
  const openAiBuilderReady = Boolean(openAiProviderStatus?.configured)
  const createBlockedByProfilePolicy = createProfileFit.errors.length > 0
  const editBlockedByProfilePolicy = editProfileFit.errors.length > 0
  const pendingProfileRequestCount = profileRequests.filter((request) => request.status === 'REQUESTED').length
  const trackedWorkPackageIds = useMemo(
    () => new Set(trackedWorkPackageKeys),
    [trackedWorkPackageKeys],
  )
  const workPackageSourceAgentOptions = useMemo(() => {
    const options = agentRecords.map((agent) => ({
      agent_id: agent.agent_id,
      name: agent.name,
    }))
    if (!agentWorkPackageFilters.sourceAgentId) {
      return options
    }
    return options.some((agent) => agent.agent_id === agentWorkPackageFilters.sourceAgentId)
      ? options
      : [...options, { agent_id: agentWorkPackageFilters.sourceAgentId, name: agentWorkPackageFilters.sourceAgentId }]
  }, [agentRecords, agentWorkPackageFilters.sourceAgentId])
  const workPackageFiltersActive = useMemo(
    () => hasActiveWorkPackageFilters(agentWorkPackageFilters),
    [agentWorkPackageFilters],
  )
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
  const agentEvalReady = Boolean(selectedAgent && agentEvalForm.name.trim() && agentEvalForm.prompt.trim())

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
        const [nextAgents, runtimeSettings, nextRoles, nextProfileRequests, nextAgentEvals] = await Promise.all([
          listAdminAssistantAgents(appConfig.apiBase),
          loadAssistantRuntimeSettings(appConfig.apiBase),
          listAdminAssistantRoleArchetypes(appConfig.apiBase),
          listAdminAssistantProfileRequests(appConfig.apiBase),
          listAdminAssistantAgentEvals(appConfig.apiBase, { limit: 500 }),
        ])
        if (requestSequenceRef.current !== requestId) {
          return
        }
        setAgentRecords(nextAgents)
        setProfileRequests(nextProfileRequests)
        setAgentEvalRecords(nextAgentEvals)
        setRoleArchetypes(nextRoles)
        setAvailableSkills(runtimeSettings.available_skills)
        setAvailableTools(runtimeSettings.available_tools.map((tool) => tool.name))
        setAvailableActionDefinitions(runtimeSettings.available_action_types)
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
        setAgentEvalRecords([])
        setRoleArchetypes([])
        setAvailableSkills([])
        setAvailableTools([])
        setAvailableActionDefinitions([])
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

  const loadAgentRevisions = useCallback(
    async (agentId: string | null) => {
      if (!adminEnabled || !agentId) {
        setAgentRevisions([])
        setAgentRevisionsError('')
        setAgentRevisionsLoading(false)
        return
      }

      setAgentRevisionsLoading(true)
      setAgentRevisionsError('')
      try {
        const revisions = await listAdminAssistantAgentRevisions(appConfig.apiBase, agentId)
        setAgentRevisions(revisions)
      } catch (error) {
        setAgentRevisions([])
        setAgentRevisionsError(
          error instanceof Error ? error.message : 'Could not load assistant agent revisions.',
        )
      } finally {
        setAgentRevisionsLoading(false)
      }
    },
    [adminEnabled],
  )

  const loadAgentWorkPackages = useCallback(async () => {
    if (!adminEnabled) {
      setAgentWorkPackages([])
      setTrackedWorkPackageKeys([])
      setAgentWorkPackageError('')
      setAgentWorkPackagesLoading(false)
      return
    }

    setAgentWorkPackagesLoading(true)
    setAgentWorkPackageError('')
    try {
      const records = await listAdminAssistantAgentWorkPackages(appConfig.apiBase, {
        status: agentWorkPackageFilters.status || undefined,
        hasPr: agentWorkPackageFilters.hasPr || undefined,
        hasCommit: agentWorkPackageFilters.hasCommit || undefined,
        hasEval: agentWorkPackageFilters.hasEval || undefined,
        hasTests: agentWorkPackageFilters.hasTests || undefined,
        hasDocs: agentWorkPackageFilters.hasDocs || undefined,
      })
      const filteredRecords = applyLocalWorkPackageFilters(records, agentWorkPackageFilters)
      setAgentWorkPackages(filteredRecords)
      if (hasActiveWorkPackageFilters(agentWorkPackageFilters)) {
        const allRecords = await listAdminAssistantAgentWorkPackages(appConfig.apiBase)
        setTrackedWorkPackageKeys(allRecords.map((workPackage) => workPackage.work_package_id))
      } else {
        setTrackedWorkPackageKeys(filteredRecords.map((workPackage) => workPackage.work_package_id))
      }
    } catch (error) {
      setAgentWorkPackages([])
      setTrackedWorkPackageKeys([])
      setAgentWorkPackageError(
        error instanceof Error ? error.message : 'Could not load tracked agent work packages.',
      )
    } finally {
      setAgentWorkPackagesLoading(false)
    }
  }, [adminEnabled, agentWorkPackageFilters])

  useEffect(() => {
    requestSequenceRef.current += 1
    setAgentFlash(null)

    if (!adminEnabled) {
      appliedSupervisionIntentIdRef.current = null
      setAgentRecords([])
      setProfileRequests([])
      setAgentEvalRecords([])
      setRoleArchetypes([])
      setAvailableTools([])
      setAvailableActionDefinitions([])
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
      setSelectedAgentEvalId(null)
      setAgentEvalForm(createEmptyAgentEvalForm())
      setSavingAgentEval(false)
      setDeletingAgentEvalId(null)
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
      setAutonomyReview(null)
      setAutonomyReviewError('')
      setAutonomyReviewLoading(false)
      setSelfUpdateBrief('')
      setSelfUpdateDraft(null)
      setSelfUpdateError('')
      setSelfUpdateLoading(false)
      setAgentRevisions([])
      setAgentRevisionsError('')
      setAgentRevisionsLoading(false)
      setPublishingRevisionId(null)
      setAgentHealthReview(null)
      setAgentHealthReviewError('')
      setAgentHealthReviewLoading(false)
      setAgentWorkPackages([])
      setTrackedWorkPackageKeys([])
      setAgentWorkPackageError('')
      setAgentWorkPackagesLoading(false)
      setAcceptingWorkPackageId(null)
      setTransitioningWorkPackageId(null)
      setAgentWorkPackageFilters(DEFAULT_AGENT_WORK_PACKAGE_FILTERS)
      setWorkPackageDrafts({})
      setSelectedAgentEvalId(null)
      setAgentEvalForm(createEmptyAgentEvalForm())
      setAgentEvalRuns([])
      setAgentEvalRunsLoading(false)
      setAgentEvalError('')
      setSavingAgentEval(false)
      setDeletingAgentEvalId(null)
      setRunningAgentEvalId(null)
      setRunningAgentEvalSuite(false)
      setActiveSupervisionIntent(null)
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
    void loadAgentWorkPackages()
  }, [loadAgentWorkPackages])

  useEffect(() => {
    if (!selectedAgent) {
      setEditForm(createEmptyAgentBuilderDraft())
      setSelectedAgentEvalId(null)
      setAgentEvalForm(createEmptyAgentEvalForm())
      setSavingAgentEval(false)
      setDeletingAgentEvalId(null)
      setPolicySimulation(null)
      setPolicySimulationError('')
      setPolicySimulationLoading(false)
      setAutonomyReview(null)
      setAutonomyReviewError('')
      setAutonomyReviewLoading(false)
      setSelfUpdateBrief('')
      setSelfUpdateDraft(null)
      setSelfUpdateError('')
      setSelfUpdateLoading(false)
      setAgentRevisions([])
      setAgentRevisionsError('')
      setAgentRevisionsLoading(false)
      setPublishingRevisionId(null)
      setSelectedAgentEvalId(null)
      setAgentEvalForm(createEmptyAgentEvalForm())
      setAgentEvalRuns([])
      setAgentEvalRunsLoading(false)
      setAgentEvalError('')
      return
    }
    setEditForm(toAgentForm(selectedAgent))
    setSelectedAgentEvalId(null)
    setAgentEvalForm(createEmptyAgentEvalForm(selectedAgent))
    setSavingAgentEval(false)
    setDeletingAgentEvalId(null)
    setPolicySimulation(null)
    setPolicySimulationError('')
    setPolicySimulationLoading(false)
    setAutonomyReview(null)
    setAutonomyReviewError('')
    setAutonomyReviewLoading(false)
    setSelfUpdateBrief('')
    setSelfUpdateDraft(null)
    setSelfUpdateError('')
    setSelfUpdateLoading(false)
    setAgentRevisions([])
    setAgentRevisionsError('')
    setAgentRevisionsLoading(false)
    setPublishingRevisionId(null)
    setAgentEvalRuns([])
    setAgentEvalRunsLoading(false)
    setAgentEvalError('')
    setSelectedAgentEvalId((current) => {
      if (current && selectedAgentEvalRecords.some((record) => record.eval_id === current)) {
        return current
      }
      return selectedAgentEvalRecords[0]?.eval_id ?? null
    })
    setSimulationWorkspace(
      selectedAgent.allowed_workspaces.includes('assistant')
        ? 'assistant'
        : selectedAgent.allowed_workspaces[0] ?? 'assistant',
    )
  }, [selectedAgent, selectedAgentEvalRecords])

  useEffect(() => {
    void loadAgentRevisions(selectedAgent?.agent_id ?? null)
  }, [loadAgentRevisions, selectedAgent?.agent_id])

  useEffect(() => {
    if (!controlTowerIntent) {
      return
    }
    if (appliedSupervisionIntentIdRef.current === controlTowerIntent.intent_id) {
      return
    }
    if (
      controlTowerIntent.kind === 'agent_supervision' &&
      activeSupervisionIntent?.intent_id === controlTowerIntent.intent_id
    ) {
      return
    }
    setAgentFlash(null)

    if (controlTowerIntent.kind === 'work_package_review') {
      setActiveSupervisionIntent(null)
      setAgentWorkPackageFilters({
        ...DEFAULT_AGENT_WORK_PACKAGE_FILTERS,
        sourceAgentId:
          controlTowerIntent.work_package_filters.source_agent_id ?? controlTowerIntent.agent_id,
        status: controlTowerIntent.work_package_filters.status ?? '',
        staleOnly: controlTowerIntent.work_package_filters.stale_only ?? false,
      })
      if (selectedAgentId !== controlTowerIntent.agent_id) {
        setSelectedAgentId(controlTowerIntent.agent_id)
      }
      setAgentFlash({
        tone: 'success',
        message: `Filtered the work package backlog to ${controlTowerSignalTypeLabel(controlTowerIntent.signal_type).toLowerCase()} follow-up for ${controlTowerIntent.agent_name ?? controlTowerIntent.agent_id}.`,
      })
      appliedSupervisionIntentIdRef.current = controlTowerIntent.intent_id
      return
    }

    setActiveSupervisionIntent(controlTowerIntent)
    if (selectedAgentId !== controlTowerIntent.agent_id) {
      setSelectedAgentId(controlTowerIntent.agent_id)
    }
  }, [activeSupervisionIntent?.intent_id, controlTowerIntent, selectedAgentId])

  useEffect(() => {
    if (!activeSupervisionIntent || !selectedAgent) {
      return
    }
    if (selectedAgent.agent_id !== activeSupervisionIntent.agent_id) {
      return
    }
    if (appliedSupervisionIntentIdRef.current === activeSupervisionIntent.intent_id) {
      return
    }

    const preparedOn = new Date().toISOString().slice(0, 10)
    setEditForm(
      applyControlTowerSupervisionDraft(
        toAgentForm(selectedAgent),
        activeSupervisionIntent,
        preparedOn,
      ),
    )
    setAgentFlash({
      tone: 'success',
      message: `${controlTowerSupervisionModeLabel(activeSupervisionIntent.mode)} draft loaded for ${selectedAgent.name}. Review the scope below, then save when ready.`,
    })
    appliedSupervisionIntentIdRef.current = activeSupervisionIntent.intent_id
  }, [activeSupervisionIntent, selectedAgent])

  useEffect(() => {
    if (!activeSupervisionIntent) {
      return
    }
    if (selectedAgentId === activeSupervisionIntent.agent_id || agentsLoading) {
      return
    }
    if (!selectedAgent || selectedAgent.agent_id !== activeSupervisionIntent.agent_id) {
      setActiveSupervisionIntent(null)
    }
  }, [activeSupervisionIntent, agentsLoading, selectedAgent, selectedAgentId])

  useEffect(() => {
    if (selectedAgentEval) {
      setAgentEvalForm(toAgentEvalForm(selectedAgentEval))
      return
    }
    setAgentEvalForm(createEmptyAgentEvalForm(selectedAgent))
  }, [selectedAgent, selectedAgentEval])

  const loadAgentEvalRunHistory = useCallback(
    async (evalId: number) => {
      if (!adminEnabled) {
        return
      }
      setAgentEvalRunsLoading(true)
      try {
        const runs = await listAdminAssistantAgentEvalRuns(appConfig.apiBase, evalId, { limit: 8 })
        setAgentEvalRuns(runs)
      } catch (error) {
        setAgentEvalError(error instanceof Error ? error.message : 'Could not load eval run history.')
        setAgentEvalRuns([])
      } finally {
        setAgentEvalRunsLoading(false)
      }
    },
    [adminEnabled],
  )

  useEffect(() => {
    if (!selectedAgentEvalId) {
      setAgentEvalRuns([])
      setAgentEvalRunsLoading(false)
      return
    }
    setAgentEvalError('')
    void loadAgentEvalRunHistory(selectedAgentEvalId)
  }, [loadAgentEvalRunHistory, selectedAgentEvalId])

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
    setCreateForm(applyRoleHierarchyRecommendations(buildAgentBuilderDraftFromRole(role, availableTools), role, agentRecords))
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
    const role = roleArchetypes.find((entry) => entry.role_key === draft.role_key)
    setSelectedCreateRoleKey(draft.role_key || null)
    setCreateForm(role ? applyRoleHierarchyRecommendations(draft, role, agentRecords) : draft)
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

  function handleLoadSupervisionDraft(mode: AssistantControlTowerAgentSupervisionIntent['mode']) {
    if (!selectedAgent) {
      return
    }

    const nextIntent: AssistantControlTowerAgentSupervisionIntent = {
      intent_id: Date.now(),
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.name,
      signal_type: activeSupervisionIntent?.signal_type ?? 'POLICY_WARNING',
      kind: 'agent_supervision',
      mode,
    }

    appliedSupervisionIntentIdRef.current = null
    setActiveSupervisionIntent(nextIntent)
    setAgentFlash(null)
  }

  function handleClearSupervisionDraft() {
    if (!selectedAgent) {
      return
    }

    setEditForm(toAgentForm(selectedAgent))
    setActiveSupervisionIntent(null)
    setAgentFlash(null)
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
          skills: createForm.skills,
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
        orchestration_pattern: createForm.orchestration_pattern,
        parent_agent_id: createForm.parent_agent_id,
        managed_agent_ids: [...createForm.managed_agent_ids],
        delegation_guidance: createForm.delegation_guidance,
        profile_request_id: createForm.profile_request_id,
        allowed_workspaces: [...suggestion.allowed_workspaces],
        capabilities: [...suggestion.capabilities],
        skills: [...suggestion.skills],
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
      const totalProfiles = payload.total_profiles ?? payload.total_templates
      setAgentFlash({
        tone: 'success',
        message: `Pilot lineup synchronized: ${payload.created_count} created, ${payload.updated_count} updated across ${totalProfiles} seeded defaults.`,
      })
    } catch (error) {
      setAgentFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not sync the pilot assistant lineup.',
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
      orchestration_pattern: 'SINGLE',
      parent_agent_id: '',
      managed_agent_ids: [],
      delegation_guidance: '',
      profile_request_id: request.request_id,
      allowed_workspaces: [...request.requested_workspaces],
      capabilities,
      skills: [],
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
          orchestration_pattern: payload.orchestration_pattern,
          parent_agent_id: payload.parent_agent_id,
          managed_agent_ids: payload.managed_agent_ids,
          delegation_guidance: payload.delegation_guidance,
          profile_request_id: payload.profile_request_id,
          allowed_workspaces: payload.allowed_workspaces,
          capabilities: payload.capabilities,
          skills: payload.skills,
          allowed_tools: payload.allowed_tools,
          allowed_action_types: payload.allowed_action_types,
          daily_token_allocation: payload.daily_token_allocation,
          system_prompt: payload.system_prompt,
        } satisfies UpdateAssistantAgentInput,
      )
      await refreshAgents(updated.agent_id)
      setActiveSupervisionIntent(null)
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

  async function handleGenerateAutonomyReview() {
    if (!selectedAgent) {
      return
    }

    setAutonomyReviewLoading(true)
    setAutonomyReviewError('')
    setAutonomyReview(null)

    try {
      const result = await getAdminAssistantAutonomyReview(appConfig.apiBase, selectedAgent.agent_id)
      setAutonomyReview(result)
    } catch (error) {
      setAutonomyReviewError(
        error instanceof Error ? error.message : 'Could not generate the autonomy review brief.',
      )
    } finally {
      setAutonomyReviewLoading(false)
    }
  }

  async function handleGenerateSelfUpdateDraft() {
    if (!selectedAgent) {
      return
    }

    setSelfUpdateLoading(true)
    setSelfUpdateError('')
    setSelfUpdateDraft(null)
    setAgentFlash(null)

    try {
      const draft = await generateAssistantAgentSelfUpdateDraft(appConfig.apiBase, selectedAgent.agent_id, {
        brief: selfUpdateBrief,
      })
      setSelfUpdateDraft(draft)
      await loadAgentRevisions(selectedAgent.agent_id)
      setAgentFlash({
        tone: 'success',
        message: `Stored self-update draft revision v${draft.revision_version} for ${selectedAgent.name}. Review the diff, then publish when ready.`,
      })
    } catch (error) {
      setSelfUpdateError(
        error instanceof Error ? error.message : 'Could not generate the self-update draft.',
      )
    } finally {
      setSelfUpdateLoading(false)
    }
  }

  function handleApplySelfUpdateDraft() {
    if (!selfUpdateDraft) {
      return
    }

    setEditForm(toAgentFormFromSelfUpdateDraft(selfUpdateDraft))
    setAgentFlash({
      tone: 'success',
      message: `${selfUpdateDraft.name} self-update draft revision loaded into the editor. Review the narrowed scope and prompt before saving.`,
    })
  }

  function handleLoadRevisionIntoEditor(revision: AssistantAgentRevision) {
    setEditForm(toAgentFormFromRevisionPayload(revision.payload, revision.agent_id))
    setAgentFlash({
      tone: 'success',
      message: `Revision v${revision.version} loaded into the editor for review.`,
    })
  }

  async function handlePublishAgentRevision(revision: AssistantAgentRevision) {
    if (!selectedAgent) {
      return
    }

    setPublishingRevisionId(revision.revision_id)
    setSelfUpdateError('')
    setAgentRevisionsError('')
    setAgentFlash(null)

    try {
      const published = await publishAssistantAgentRevision(
        appConfig.apiBase,
        selectedAgent.agent_id,
        revision.revision_id,
      )
      await refreshAgents(published.agent_id)
      await loadAgentRevisions(published.agent_id)
      setActiveSupervisionIntent(null)
      setSelfUpdateDraft((current) =>
        current && current.revision_id === revision.revision_id
          ? {
              ...current,
              published_at: published.published_at ?? current.published_at,
              published_by: published.published_by ?? current.published_by,
            }
          : current,
      )
      setAgentFlash({
        tone: 'success',
        message: `Revision v${revision.version} is now published to ${published.name}.`,
      })
    } catch (error) {
      setAgentRevisionsError(
        error instanceof Error ? error.message : 'Could not publish the assistant agent revision.',
      )
    } finally {
      setPublishingRevisionId(null)
    }
  }

  async function handleGenerateAgentHealthReview() {
    setAgentHealthReviewLoading(true)
    setAgentHealthReviewError('')

    try {
      const result = await getAdminAssistantAgentHealthReview(appConfig.apiBase)
      setAgentHealthReview(result)
      await loadAgentWorkPackages()
    } catch (error) {
      setAgentHealthReviewError(
        error instanceof Error ? error.message : 'Could not generate the agent health review.',
      )
    } finally {
      setAgentHealthReviewLoading(false)
    }
  }

  async function handleAcceptHealthWorkPackage(workPackageId: string) {
    setAcceptingWorkPackageId(workPackageId)
    setAgentHealthReviewError('')
    setAgentWorkPackageError('')
    setAgentFlash(null)

    try {
      const accepted = await acceptAdminAssistantAgentHealthWorkPackage(appConfig.apiBase, workPackageId, {
        acceptedBy: authSession?.user.user_id,
      })
      await loadAgentWorkPackages()
      setAgentFlash({
        tone: 'success',
        message: `${accepted.title} accepted into the agent work package backlog.`,
      })
    } catch (error) {
      setAgentWorkPackageError(
        error instanceof Error ? error.message : 'Could not accept the agent work package.',
      )
    } finally {
      setAcceptingWorkPackageId(null)
    }
  }

  async function handleUpdateAgentWorkPackageStatus(
    workPackage: AssistantAgentWorkPackage,
    status: AssistantAgentWorkPackageStatus,
  ) {
    const draft = workPackageDrafts[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)
    const notes = draft.notes.trim()
    const implementationEvidence = {
      prUrl: draft.prUrl.trim() || undefined,
      commitSha: draft.commitSha.trim() || undefined,
      evalIds: parseDraftEvalIds(draft.evalIds),
      testNames: splitDraftLines(draft.testNames),
      docPaths: splitDraftLines(draft.docPaths),
      owner: draft.owner.trim() || undefined,
    }
    const hasEvidenceArtifact = Boolean(
      implementationEvidence.prUrl ||
        implementationEvidence.commitSha ||
        implementationEvidence.evalIds.length > 0 ||
        implementationEvidence.testNames.length > 0 ||
        implementationEvidence.docPaths.length > 0,
    )
    if (status === 'IMPLEMENTED' && !hasEvidenceArtifact) {
      setAgentWorkPackageError('Add a PR, commit, eval, test, or doc artifact before marking the package implemented.')
      return
    }

    setTransitioningWorkPackageId(workPackage.work_package_id)
    setAgentWorkPackageError('')
    setAgentFlash(null)

    try {
      const updated = await updateAdminAssistantAgentWorkPackage(
        appConfig.apiBase,
        workPackage.work_package_id,
        {
          status,
          updatedBy: authSession?.user.user_id,
          notes: notes || undefined,
          implementationEvidence,
        },
      )
      await loadAgentWorkPackages()
      setWorkPackageDrafts((current) => {
        const next = { ...current }
        delete next[workPackage.work_package_id]
        return next
      })
      setAgentFlash({
        tone: 'success',
        message: `${updated.title} moved to ${agentWorkPackageStatusLabel(updated.status).toLowerCase()}.`,
      })
    } catch (error) {
      setAgentWorkPackageError(
        error instanceof Error ? error.message : 'Could not update the agent work package.',
      )
    } finally {
      setTransitioningWorkPackageId(null)
    }
  }

  function handleEditAgentEval(record: AssistantAgentEval) {
    setSelectedAgentEvalId(record.eval_id)
    setAgentEvalForm(toAgentEvalForm(record))
    setAgentEvalRuns([])
    setAgentEvalError('')
  }

  function handleResetAgentEvalForm() {
    handleCreateNewEvalCase()
  }

  function handleCreateNewEvalCase() {
    setSelectedAgentEvalId(null)
    setAgentEvalForm(createEmptyAgentEvalForm(selectedAgent))
    setAgentEvalRuns([])
    setAgentEvalError('')
  }

  async function handleSaveAgentEval() {
    if (!selectedAgent) {
      return
    }
    if (!agentEvalForm.name.trim() || !agentEvalForm.prompt.trim()) {
      setAgentEvalError('Eval name and prompt are required before saving.')
      return
    }

    setSavingAgentEval(true)
    setAgentEvalError('')
    setAgentFlash(null)

    try {
      const payload = normalizeAgentEvalPayload(agentEvalForm)
      const saved = selectedAgentEval
        ? await updateAssistantAgentEval(
            appConfig.apiBase,
            selectedAgentEval.eval_id,
            payload,
          )
        : await createAssistantAgentEval(appConfig.apiBase, {
            ...payload,
            agent_id: selectedAgent.agent_id,
          } satisfies CreateAssistantAgentEvalInput)
      await refreshAgents(selectedAgent.agent_id)
      setSelectedAgentEvalId(saved.eval_id)
      setAgentFlash({
        tone: 'success',
        message: `${saved.name} eval case saved.`,
      })
    } catch (error) {
      setAgentEvalError(error instanceof Error ? error.message : 'Could not save eval case.')
    } finally {
      setSavingAgentEval(false)
    }
  }

  async function handleDeleteAgentEval(evalId: number) {
    if (!selectedAgent) {
      return
    }

    setDeletingAgentEvalId(evalId)
    setAgentEvalError('')
    setAgentFlash(null)

    try {
      await deleteAssistantAgentEval(appConfig.apiBase, evalId)
      await refreshAgents(selectedAgent.agent_id)
      setSelectedAgentEvalId(null)
      setAgentEvalRuns([])
      setAgentFlash({
        tone: 'success',
        message: 'Eval case deleted.',
      })
    } catch (error) {
      setAgentEvalError(error instanceof Error ? error.message : 'Could not delete eval case.')
    } finally {
      setDeletingAgentEvalId(null)
    }
  }

  async function handleRunAgentEval(evalId: number) {
    if (!selectedAgent) {
      return
    }

    setRunningAgentEvalId(evalId)
    setAgentEvalError('')
    setAgentFlash(null)

    try {
      const result = await runAssistantAgentEval(appConfig.apiBase, evalId)
      await refreshAgents(selectedAgent.agent_id)
      setSelectedAgentEvalId(evalId)
      await loadAgentEvalRunHistory(evalId)
      setAgentFlash({
        tone: result.status === 'PASS' ? 'success' : 'error',
        message:
          result.status === 'PASS'
            ? 'Eval case passed.'
            : `Eval case ${evalRunStatusLabel(result.status).toLowerCase()}: ${
                result.failure_reasons[0] ?? 'review the run history for details'
              }.`,
      })
    } catch (error) {
      setAgentEvalError(error instanceof Error ? error.message : 'Could not run eval case.')
    } finally {
      setRunningAgentEvalId(null)
    }
  }

  async function handleRunAgentEvalSuite() {
    if (!selectedAgent || selectedAgentEvalRecords.length === 0) {
      return
    }

    setRunningAgentEvalSuite(true)
    setAgentEvalError('')
    setAgentFlash(null)

    try {
      const results = await runAssistantAgentEvalSuite(appConfig.apiBase, selectedAgent.agent_id)
      await refreshAgents(selectedAgent.agent_id)
      if (selectedAgentEvalId) {
        await loadAgentEvalRunHistory(selectedAgentEvalId)
      }
      const failedCount = results.filter((result) => result.status !== 'PASS').length
      setAgentFlash({
        tone: failedCount === 0 ? 'success' : 'error',
        message:
          failedCount === 0
            ? `Eval suite passed ${results.length} case${results.length === 1 ? '' : 's'}.`
            : `Eval suite completed with ${failedCount} failing case${failedCount === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      setAgentEvalError(error instanceof Error ? error.message : 'Could not run eval suite.')
    } finally {
      setRunningAgentEvalSuite(false)
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
              {seedingRecommendedAgents ? 'Syncing Pilot Lineup...' : 'Sync Pilot Lineup'}
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

          <div id="assistant-agent-work-packages" className="assistant-profile-request-panel">
            <div className="assistant-admin-section-head">
              <div>
                <span className="eyebrow">Health Review</span>
                <h4>Agent Work Packages</h4>
              </div>
              <span>
                {agentHealthReview
                  ? `${agentHealthReview.work_package_count} candidate package${agentHealthReview.work_package_count === 1 ? '' : 's'} · ${agentHealthReview.pause_count} pause signal${agentHealthReview.pause_count === 1 ? '' : 's'}`
                  : 'Generate from autonomy briefs'}
                {workPackageFiltersActive
                  ? ` · ${agentWorkPackages.length} shown of ${trackedWorkPackageKeys.length} tracked`
                  : ` · ${agentWorkPackages.length} tracked`}
              </span>
            </div>

            <div className="toolbar settings-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void handleGenerateAgentHealthReview()}
                disabled={agentHealthReviewLoading}
              >
                {agentHealthReviewLoading ? 'Generating Health Review...' : 'Generate Health Review'}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void loadAgentWorkPackages()}
                disabled={agentWorkPackagesLoading}
              >
                {agentWorkPackagesLoading ? 'Refreshing Backlog...' : 'Refresh Backlog'}
              </button>
            </div>

            <div className="assistant-work-package-filter-grid">
              <label className="field">
                <span>Status</span>
                <select
                  className="control"
                  value={agentWorkPackageFilters.status}
                  onChange={(event) =>
                    setAgentWorkPackageFilters((current) => ({
                      ...current,
                      status: event.target.value as AgentWorkPackageFilters['status'],
                    }))
                  }
                >
                  <option value="">All tracked statuses</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="IMPLEMENTED">Implemented</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </label>
              <label className="field">
                <span>Source Agent</span>
                <select
                  className="control"
                  value={agentWorkPackageFilters.sourceAgentId}
                  onChange={(event) =>
                    setAgentWorkPackageFilters((current) => ({
                      ...current,
                      sourceAgentId: event.target.value,
                    }))
                  }
                >
                  <option value="">All source agents</option>
                  {workPackageSourceAgentOptions.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agent.name} ({agent.agent_id})
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>Backlog Filters</span>
                <div className="toolbar settings-actions assistant-work-package-filter-pills">
                  {([
                    ['staleOnly', `Stale ${STALE_WORK_PACKAGE_THRESHOLD_HOURS}h+`],
                    ['hasPr', 'PR'],
                    ['hasCommit', 'Commit'],
                    ['hasEval', 'Eval'],
                    ['hasTests', 'Tests'],
                    ['hasDocs', 'Docs'],
                  ] as const).map(([filterKey, label]) => {
                    const active = agentWorkPackageFilters[filterKey]
                    return (
                      <button
                        key={filterKey}
                        type="button"
                        className={active ? 'button button-secondary' : 'button button-ghost'}
                        onClick={() =>
                          setAgentWorkPackageFilters((current) => ({
                            ...current,
                            [filterKey]: !current[filterKey],
                          }))
                        }
                      >
                        {label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setAgentWorkPackageFilters(DEFAULT_AGENT_WORK_PACKAGE_FILTERS)}
                    disabled={!workPackageFiltersActive}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {agentHealthReviewError ? (
              <div className="feedback-banner feedback-banner-error">{agentHealthReviewError}</div>
            ) : null}
            {agentWorkPackageError ? (
              <div className="feedback-banner feedback-banner-error">{agentWorkPackageError}</div>
            ) : null}

            {agentHealthReview ? (
              <div className="assistant-builder-preview-grid">
                <div className="assistant-sidebar-block">
                  <strong>Review coverage</strong>
                  <p>{agentHealthReview.agent_count} agents</p>
                  <small>
                    {agentHealthReview.bounded_review_candidate_count} bounded candidate
                    {agentHealthReview.bounded_review_candidate_count === 1 ? '' : 's'} ·{' '}
                    {agentHealthReview.keep_staged_count} staged
                  </small>
                </div>
                {agentHealthReview.work_packages.slice(0, 3).map((workPackage) => {
                  const isTracked = trackedWorkPackageIds.has(workPackage.work_package_id)
                  const isAccepting = acceptingWorkPackageId === workPackage.work_package_id
                  return (
                    <div key={workPackage.work_package_id} className="assistant-sidebar-block">
                      <strong>
                        {healthReviewPriorityLabel(workPackage.priority)} · {workPackage.package_type}
                      </strong>
                      <p>{workPackage.title}</p>
                      <small>
                        {workPackage.source_agent_names.join(' · ')}
                        {workPackage.recommended_owner_role
                          ? ` · owner ${workPackage.recommended_owner_role}`
                          : ''}
                      </small>
                      <div className="toolbar settings-actions">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => void handleAcceptHealthWorkPackage(workPackage.work_package_id)}
                          disabled={isTracked || isAccepting}
                        >
                          {isTracked ? 'Tracked' : isAccepting ? 'Accepting...' : 'Accept Package'}
                        </button>
                        {workPackage.source_agent_ids.slice(0, 2).map((agentId) => (
                          <button
                            key={`${workPackage.work_package_id}-${agentId}`}
                            type="button"
                            className="button button-ghost"
                            onClick={() => setSelectedAgentId(agentId)}
                          >
                            Open {agentId}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {agentWorkPackages.length > 0 ? (
              <div className="assistant-builder-preview-grid">
                {agentWorkPackages.slice(0, 3).map((workPackage) => {
                  const nextStatuses = agentWorkPackageNextStatuses(workPackage.status)
                  const draft = workPackageDrafts[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)
                  const isTransitioning = transitioningWorkPackageId === workPackage.work_package_id
                  return (
                    <div key={`tracked-${workPackage.work_package_id}`} className="assistant-sidebar-block">
                      <strong>
                        {agentWorkPackageStatusLabel(workPackage.status)} · {healthReviewPriorityLabel(workPackage.priority)}
                      </strong>
                      <p>{workPackage.title}</p>
                      <small>
                        {workPackage.source_agent_names.join(' · ')}
                        {workPackage.accepted_by ? ` · accepted by ${workPackage.accepted_by}` : ''}
                      </small>
                      {workPackage.notes ? <small>{workPackage.notes}</small> : null}
                      {workPackage.implemented_by || workPackage.implemented_at ? (
                        <small>
                          {workPackage.implemented_by ? `implemented by ${workPackage.implemented_by}` : 'implemented'}
                          {workPackage.implemented_at ? ` · ${formatDate(workPackage.implemented_at)}` : ''}
                        </small>
                      ) : null}
                      {(workPackage.implementation_evidence.pr_url ||
                        workPackage.implementation_evidence.commit_sha ||
                        workPackage.implementation_evidence.eval_ids.length > 0 ||
                        workPackage.implementation_evidence.test_names.length > 0 ||
                        workPackage.implementation_evidence.doc_paths.length > 0 ||
                        workPackage.implementation_evidence.owner) ? (
                        <small>
                          {workPackage.implementation_evidence.owner
                            ? `owner ${workPackage.implementation_evidence.owner}`
                            : 'evidence ready'}
                          {workPackage.implementation_evidence.pr_url ? ' · PR linked' : ''}
                          {workPackage.implementation_evidence.commit_sha ? ' · commit linked' : ''}
                          {workPackage.implementation_evidence.eval_ids.length > 0
                            ? ` · ${workPackage.implementation_evidence.eval_ids.length} eval${workPackage.implementation_evidence.eval_ids.length === 1 ? '' : 's'}`
                            : ''}
                          {workPackage.implementation_evidence.test_names.length > 0
                            ? ` · ${workPackage.implementation_evidence.test_names.length} test${workPackage.implementation_evidence.test_names.length === 1 ? '' : 's'}`
                            : ''}
                          {workPackage.implementation_evidence.doc_paths.length > 0
                            ? ` · ${workPackage.implementation_evidence.doc_paths.length} doc${workPackage.implementation_evidence.doc_paths.length === 1 ? '' : 's'}`
                            : ''}
                        </small>
                      ) : null}
                      {workPackage.implementation_evidence.pr_url ? (
                        <small>
                          PR:{' '}
                          <a
                            href={workPackage.implementation_evidence.pr_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open linked pull request
                          </a>
                        </small>
                      ) : null}
                      {workPackage.implementation_evidence.commit_sha ? (
                        <small>Commit: {workPackage.implementation_evidence.commit_sha}</small>
                      ) : null}
                      {workPackage.implementation_evidence.eval_ids.length > 0 ? (
                        <small>Eval IDs: {workPackage.implementation_evidence.eval_ids.join(', ')}</small>
                      ) : null}
                      {workPackage.implementation_evidence.test_names.length > 0 ? (
                        <small>Tests: {workPackage.implementation_evidence.test_names.join(', ')}</small>
                      ) : null}
                      {workPackage.implementation_evidence.doc_paths.length > 0 ? (
                        <small>Docs: {workPackage.implementation_evidence.doc_paths.join(', ')}</small>
                      ) : null}
                      {nextStatuses.length > 0 ? (
                        <div className="assistant-profile-request-decision-grid">
                          <label className="field">
                            <span>Decision Note</span>
                            <textarea
                              className="control"
                              value={draft.notes}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    notes: event.target.value,
                                  },
                                }))
                              }
                              placeholder="What changed, why this moved, or any helpful handoff context."
                            />
                          </label>
                          <label className="field">
                            <span>Implementation Owner</span>
                            <input
                              className="control"
                              value={draft.owner}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    owner: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Owner or reviewer shepherding the implementation."
                            />
                          </label>
                          <label className="field">
                            <span>PR URL</span>
                            <input
                              className="control"
                              value={draft.prUrl}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    prUrl: event.target.value,
                                  },
                                }))
                              }
                              placeholder="https://github.com/org/repo/pull/123"
                            />
                          </label>
                          <label className="field">
                            <span>Commit SHA</span>
                            <input
                              className="control"
                              value={draft.commitSha}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    commitSha: event.target.value,
                                  },
                                }))
                              }
                              placeholder="abc123def456"
                            />
                          </label>
                          <label className="field">
                            <span>Eval IDs</span>
                            <input
                              className="control"
                              value={draft.evalIds}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    evalIds: event.target.value,
                                  },
                                }))
                              }
                              placeholder="12, 18, 25"
                            />
                          </label>
                          <label className="field">
                            <span>Test Names</span>
                            <textarea
                              className="control"
                              value={draft.testNames}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    testNames: event.target.value,
                                  },
                                }))
                              }
                              placeholder="apps.api.tests.test_assistant_api&#10;npm test -- assistantApi.test.ts"
                            />
                          </label>
                          <label className="field">
                            <span>Doc Paths</span>
                            <textarea
                              className="control"
                              value={draft.docPaths}
                              onChange={(event) =>
                                setWorkPackageDrafts((current) => ({
                                  ...current,
                                  [workPackage.work_package_id]: {
                                    ...(current[workPackage.work_package_id] ?? workPackageDraftFromRecord(workPackage)),
                                    docPaths: event.target.value,
                                  },
                                }))
                              }
                              placeholder="docs/engineering/agent-knowledge-base.md"
                            />
                          </label>
                          <div className="toolbar settings-actions">
                            {nextStatuses.map((status) => (
                              <button
                                key={`${workPackage.work_package_id}-${status}`}
                                type="button"
                                className={status === 'DISMISSED' ? 'button button-ghost' : 'button button-secondary'}
                                disabled={isTransitioning}
                                onClick={() => void handleUpdateAgentWorkPackageStatus(workPackage, status)}
                              >
                                {status === 'IN_PROGRESS'
                                  ? 'Start Work'
                                  : status === 'IMPLEMENTED'
                                    ? 'Mark Implemented'
                                    : 'Dismiss'}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
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
                          {agent.eval_gate ? (
                            <span className={`status-pill status-pill-${evalGateTone(agent.eval_gate.status)}`}>
                              Evals {agent.eval_gate.status}
                            </span>
                          ) : null}
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
                          {` · ${orchestrationPatternLabel(agent.orchestration_pattern)}`}
                          {agent.managed_agent_ids.length > 0
                            ? ` · ${agent.managed_agent_ids.length} managed`
                            : ''}
                          {agent.provider ? ` · ${agent.provider}` : ' · inherited provider'}
                          {agent.model ? ` · ${agent.model}` : ''}
                          {agent.skills.length > 0 ? ` · ${agent.skills.length} skills` : ''}
                          {agent.allowed_tools.length > 0 ? ` · ${agent.allowed_tools.length} live tools` : ''}
                          {agent.allowed_action_types.length > 0 ? ` · ${agent.allowed_action_types.length} actions` : ''}
                        </small>
                        <small>{describeEffectivePolicy(agent)}</small>
                        <small>{describeEvalGate(agent)}</small>
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
                <span>Start from a Phase 1 pilot blueprint, browse the full role catalog, or shape one from scratch</span>
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
                        <small>
                          {orchestrationPatternLabel(role.recommended_orchestration_pattern)} · manages{' '}
                          {role.recommended_managed_role_keys.length}
                        </small>
                        <small>{roleCatalogSyncSummary(role)}</small>
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
                        <strong>Skills + recipe</strong>
                        <p>{summarizeSkillSelection(selectedCreateRole.skills, skillDefinitionsByName)}</p>
                        <small>Role + skills + capabilities + tools + actions + prompt guidance</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Hierarchy</strong>
                        <p>{orchestrationPatternLabel(selectedCreateRole.recommended_orchestration_pattern)}</p>
                        <small>
                          Parent roles: {describeRoleKeyList(selectedCreateRole.recommended_parent_role_keys)} ·
                          managed roles: {describeRoleKeyList(selectedCreateRole.recommended_managed_role_keys)}
                        </small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Actions</strong>
                        <p>{actionSummary(selectedCreateRole.maximum_action_types, actionDefinitionsByName)}</p>
                        <small>{selectedCreateRole.approval_rules.join(' ')}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Stop conditions + evals</strong>
                        <p>{selectedCreateRole.stop_conditions.slice(0, 2).join(' ')}</p>
                        <small>
                          {selectedCreateRole.eval_gate
                            ? `${selectedCreateRole.eval_gate.status}: ${selectedCreateRole.required_eval_coverage.join(' · ')}`
                            : selectedCreateRole.required_eval_coverage.join(' · ')}
                        </small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Availability</strong>
                        <p>{roleCatalogSyncSummary(selectedCreateRole)}</p>
                        <small>{roleCatalogStatusLabel(selectedCreateRole)}</small>
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
                        <span className={`status-pill status-pill-${templateAvailabilityTone(template.availability)}`}>
                          {templateAvailabilityLabel(template.availability)}
                        </span>
                      </div>
                      <p>{template.summary}</p>
                      <small>{template.scope} scope</small>
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
                        ? templateAvailabilityLabel(selectedCreateTemplate.availability)
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
                          <strong>Availability</strong>
                          <p>{selectedCreateTemplate.best_for}</p>
                          <small>{selectedCreateTemplate.availability_note}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Workspace coverage</strong>
                          <p>{createWorkspaceSummary}</p>
                          <small>{createCapabilitySummary}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Skill plan</strong>
                          <p>{createSkillSummary}</p>
                          <small>Make the specialization visible before anyone reads the prompt.</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Hierarchy plan</strong>
                          <p>{describeHierarchyPlan(createForm, agentRecords)}</p>
                          <small>
                            {createForm.delegation_guidance || 'No delegation guidance drafted yet.'}
                          </small>
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
                                  .map((actionType) =>
                                    formatAssistantActionTypeLabel(actionType, actionDefinitionsByName),
                                  )
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
                        Pilot blueprints seed the draft with governed workspaces, tool defaults,
                        authority boundaries, and a starter system prompt you can still edit line by line.
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

                  <AgentHierarchyEditor
                    form={createForm}
                    setForm={setCreateForm}
                    role={createFormRole}
                    agentRecords={agentRecords}
                  />

                  <RoleProfileFitSummary fit={createProfileFit} />
                  <PromptProfilePreview form={createForm} role={createFormRole} agentRecords={agentRecords} />

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

                  <AgentSkillSelector
                    selectedSkills={createForm.skills}
                    availableSkills={availableSkills}
                    description="Make the agent's build recipe explicit: which reusable specialties should users expect?"
                    onToggle={(skillName) =>
                      setCreateForm((current) => ({
                        ...current,
                        skills: toggleSelection(current.skills, skillName),
                      }))
                    }
                  />

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
                      {actionTypeOptions.map((actionType) => (
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
                          {formatAssistantActionTypeLabel(actionType, actionDefinitionsByName)}
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
                      ? 'The role preset added a starter prompt. Edit it freely before publishing.'
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

                <div className="assistant-sidebar-block">
                  <strong>Eval gate</strong>
                  <p>{describeEvalGate(selectedAgent)}</p>
                  {selectedAgent.eval_gate ? (
                    <small>
                      {selectedAgent.eval_gate.status}
                      {selectedAgent.eval_gate.missing_cases.length > 0
                        ? ` · ${selectedAgent.eval_gate.missing_cases.join(' · ')}`
                        : ` · ${selectedAgent.eval_gate.covered_cases.join(' · ')}`}
                    </small>
                  ) : null}
                </div>

                {activeSupervisionIntent && activeSupervisionIntent.agent_id === selectedAgent.agent_id ? (
                  <div className={`assistant-supervision-banner is-${activeSupervisionIntent.mode}`}>
                    <div className="assistant-admin-section-head">
                      <div>
                        <span className="eyebrow">Supervision Draft</span>
                        <h4>{controlTowerSupervisionModeLabel(activeSupervisionIntent.mode)}</h4>
                      </div>
                      <span>{controlTowerSignalTypeLabel(activeSupervisionIntent.signal_type)}</span>
                    </div>
                    <p>
                      Prepared from the Control Tower for {selectedAgent.name}. Existing policy and eval guardrails
                      still apply, and nothing changes until this form is saved by a human supervisor.
                    </p>

                    <div className="assistant-supervision-summary-grid">
                      <div className="assistant-sidebar-block">
                        <strong>Status</strong>
                        <p>{describeChangedValue(selectedAgent.status, editForm.status)}</p>
                        <small>
                          {activeSupervisionIntent.mode === 'pause'
                            ? 'Pause uses the existing typed status update path.'
                            : 'Narrowing keeps the status unchanged until you decide otherwise.'}
                        </small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Capabilities</strong>
                        <p>
                          {describeChangedValue(
                            summarizeCapabilitySelection(selectedAgent.capabilities),
                            summarizeCapabilitySelection(editForm.capabilities),
                          )}
                        </p>
                        <small>{summarizeCapabilitySelection(editForm.capabilities)}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Skills</strong>
                        <p>
                          {describeChangedValue(
                            summarizeSkillSelection(selectedAgent.skills, skillDefinitionsByName),
                            summarizeSkillSelection(editForm.skills, skillDefinitionsByName),
                          )}
                        </p>
                        <small>{editSkillSummary}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Live tools</strong>
                        <p>
                          {describeChangedValue(
                            summarizeToolSelection(selectedAgent.allowed_tools),
                            summarizeToolSelection(editForm.allowed_tools),
                          )}
                        </p>
                        <small>{listSummary(editForm.allowed_tools, 'No explicit live tool subset yet')}</small>
                      </div>
                      <div className="assistant-sidebar-block">
                        <strong>Governed actions</strong>
                        <p>
                          {describeChangedValue(
                            summarizeActionSelection(selectedAgent.allowed_action_types),
                            summarizeActionSelection(editForm.allowed_action_types),
                          )}
                        </p>
                        <small>{actionSummary(editForm.allowed_action_types, actionDefinitionsByName)}</small>
                      </div>
                    </div>

                    {supervisionPolicyMessages.length > 0 ? (
                      <div
                        className={`assistant-profile-fit-messages ${
                          editProfileFit.errors.length > 0 ? 'is-error' : 'is-warning'
                        }`}
                      >
                        {supervisionPolicyMessages.map((message) => (
                          <small key={message}>{message}</small>
                        ))}
                      </div>
                    ) : null}

                    <div className="assistant-control-tower-actions assistant-supervision-actions">
                      <button
                        type="button"
                        className={
                          activeSupervisionIntent.mode === 'pause'
                            ? 'button button-primary'
                            : 'button button-secondary'
                        }
                        onClick={() => handleLoadSupervisionDraft('pause')}
                      >
                        Load Pause Draft
                      </button>
                      <button
                        type="button"
                        className={
                          activeSupervisionIntent.mode === 'narrow'
                            ? 'button button-primary'
                            : 'button button-secondary'
                        }
                        onClick={() => handleLoadSupervisionDraft('narrow')}
                      >
                        Load Narrowing Draft
                      </button>
                      {editForm.capabilities.includes('ACTION') ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setEditForm((current) => toggleCapability(current, 'ACTION'))}
                        >
                          Disable ACTION
                        </button>
                      ) : null}
                      {editCanStageActions && editForm.allowed_action_types.length > 0 ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              allowed_action_types: [],
                            }))
                          }
                        >
                          Clear Actions
                        </button>
                      ) : null}
                      {editCanUseLiveTools && editForm.allowed_tools.length > 0 ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              allowed_tools: [],
                            }))
                          }
                        >
                          Clear Tool Picks
                        </button>
                      ) : null}
                      <button type="button" className="button button-ghost" onClick={handleClearSupervisionDraft}>
                        Clear Draft
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="assistant-builder-preview assistant-agent-eval-catalog">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Eval Catalog</span>
                      <h4>Saved Behavior Cases</h4>
                    </div>
                    <span>
                      {selectedAgentEvals.length} persisted case
                      {selectedAgentEvals.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {selectedAgentEvals.length === 0 ? (
                    <div className="empty-state">
                      <strong>No eval cases yet</strong>
                      <p>
                        Add at least one persisted case for custom action-capable profiles before activation.
                      </p>
                    </div>
                  ) : (
                    <div className="assistant-builder-warning-list">
                      {selectedAgentEvals.map((record) => (
                        <article key={record.eval_id} className="assistant-profile-request-card">
                          <div className="assistant-provider-head">
                            <strong>{record.name}</strong>
                            <span className="status-pill status-pill-planned">
                              {workspaceLabel(record.workspace)}
                            </span>
                          </div>
                          <p>{record.prompt}</p>
                          <small>{describeAgentEval(record)}</small>
                          <small>
                            {record.use_live_tools ? 'Uses live tools' : 'No live tools'} · updated{' '}
                            {formatDate(record.updated_at)} by {record.updated_by}
                          </small>
                          <div className="toolbar settings-actions">
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => handleEditAgentEval(record)}
                            >
                              Edit Case
                            </button>
                            <button
                              type="button"
                              className="button button-ghost"
                              disabled={deletingAgentEvalId === record.eval_id}
                              onClick={() => void handleDeleteAgentEval(record.eval_id)}
                            >
                              {deletingAgentEvalId === record.eval_id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">
                        {selectedEvalRecord ? `Editing #${selectedEvalRecord.eval_id}` : 'New Case'}
                      </span>
                      <h4>{selectedEvalRecord?.name || 'Add Eval Case'}</h4>
                    </div>
                    <span>Cases are stored independently from the agent prompt.</span>
                  </div>

                  <div className="assistant-builder-preview-grid">
                    <label className="field">
                      <span>Case Name</span>
                      <input
                        className="control"
                        value={agentEvalForm.name}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Blocks stale weather evidence"
                      />
                    </label>
                    <label className="field">
                      <span>Workspace</span>
                      <select
                        className="control"
                        value={agentEvalForm.workspace}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            workspace: event.target.value as ViewKey,
                          }))
                        }
                      >
                        {WORKSPACE_OPTIONS.map((workspace) => (
                          <option key={workspace} value={workspace}>
                            {workspaceLabel(workspace)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Prompt</span>
                    <textarea
                      className="control"
                      value={agentEvalForm.prompt}
                      onChange={(event) =>
                        setAgentEvalForm((current) => ({ ...current, prompt: event.target.value }))
                      }
                      placeholder="Ask the agent to handle the scenario being guarded."
                    />
                  </label>

                  <label className="field">
                    <span>Context</span>
                    <textarea
                      className="control"
                      value={agentEvalForm.context}
                      onChange={(event) =>
                        setAgentEvalForm((current) => ({ ...current, context: event.target.value }))
                      }
                      placeholder="Optional fixture context, selected work object, or evidence notes."
                    />
                  </label>

                  <div className="assistant-builder-preview-grid">
                    <label className="field">
                      <span>Expected Text</span>
                      <textarea
                        className="control"
                        value={agentEvalForm.expected_substrings}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            expected_substrings: event.target.value,
                          }))
                        }
                        placeholder="One required substring per line"
                      />
                    </label>
                    <label className="field">
                      <span>Expected Tool Names</span>
                      <textarea
                        className="control"
                        value={agentEvalForm.expected_tool_names}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            expected_tool_names: event.target.value,
                          }))
                        }
                        placeholder="get_workspace_summary&#10;list_workflow_items"
                      />
                    </label>
                  </div>

                  <div className="assistant-admin-option-grid">
                    <label className="projection-integrity-toggle">
                      <input
                        type="checkbox"
                        checked={agentEvalForm.use_live_tools}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            use_live_tools: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <strong>Use live tools</strong>
                        <span>Run the case with governed tool access when the harness executes it.</span>
                      </span>
                    </label>

                    <div className="assistant-admin-option-group">
                      <strong>Expected governed actions</strong>
                      <p>Select actions the case should stage or exercise when relevant.</p>
                      <div className="chip-row">
                        {actionTypeOptions.map((actionType) => (
                          <button
                            key={actionType}
                            type="button"
                            className={`entity-chip ${agentEvalForm.expected_action_types.includes(actionType) ? '' : 'entity-chip-soft'}`}
                            onClick={() =>
                              setAgentEvalForm((current) => ({
                                ...current,
                                expected_action_types: toggleSelection(
                                  current.expected_action_types,
                                  actionType,
                                ),
                              }))
                            }
                          >
                            {formatAssistantActionTypeLabel(actionType, actionDefinitionsByName)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="toolbar settings-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={savingAgentEval || !agentEvalReady}
                      onClick={() => void handleSaveAgentEval()}
                    >
                      {savingAgentEval
                        ? 'Saving Eval...'
                        : selectedAgentEval
                          ? 'Update Eval Case'
                          : 'Create Eval Case'}
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={handleResetAgentEvalForm}
                    >
                      Clear Eval Form
                    </button>
                  </div>
                </div>

                <div className="assistant-builder-preview assistant-policy-simulator">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Eval Catalog</span>
                      <h4>Regression Cases</h4>
                    </div>
                    <span>
                      {selectedAgentEvalRecords.length} saved case
                      {selectedAgentEvalRecords.length === 1 ? '' : 's'} for this agent
                    </span>
                  </div>

                  <div className="toolbar settings-actions">
                    <button type="button" className="button button-ghost" onClick={handleCreateNewEvalCase}>
                      New Eval Case
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleRunAgentEvalSuite()}
                      disabled={runningAgentEvalSuite || selectedAgentEvalRecords.length === 0}
                    >
                      {runningAgentEvalSuite ? 'Running Suite...' : 'Run Suite'}
                    </button>
                  </div>

                  {agentEvalError ? (
                    <div className="feedback-banner feedback-banner-error">{agentEvalError}</div>
                  ) : null}

                  {selectedAgentEvalRecords.length === 0 ? (
                    <div className="empty-state">
                      <strong>No eval cases yet</strong>
                      <p>
                        Save one prompt expectation here, then run it whenever the agent prompt, tools, or
                        authority changes.
                      </p>
                    </div>
                  ) : (
                    <div className="assistant-builder-warning-list">
                      {selectedAgentEvalRecords.map((record) => (
                        <button
                          key={record.eval_id}
                          type="button"
                          className={`assistant-admin-agent-card ${
                            selectedAgentEval?.eval_id === record.eval_id ? 'is-selected' : ''
                          }`}
                          onClick={() => setSelectedAgentEvalId(record.eval_id)}
                        >
                          <div>
                            <strong>{record.name}</strong>
                            <span>{workspaceLabel(record.workspace)} · {agentEvalExpectationSummary(record)}</span>
                          </div>
                          {record.latest_run ? (
                            <span className={`status-pill status-pill-${evalRunStatusTone(record.latest_run.status)}`}>
                              {evalRunStatusLabel(record.latest_run.status)}
                            </span>
                          ) : (
                            <span className="status-pill status-pill-planned">Not run</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="assistant-admin-form-grid">
                    <label className="field">
                      <span>Eval Name</span>
                      <input
                        className="control"
                        value={agentEvalForm.name}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Allowed workflow update staging"
                      />
                    </label>
                    <label className="field">
                      <span>Workspace</span>
                      <select
                        className="control"
                        value={agentEvalForm.workspace}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            workspace: event.target.value as ViewKey,
                          }))
                        }
                      >
                        {WORKSPACE_OPTIONS.map((workspace) => (
                          <option key={workspace} value={workspace}>
                            {workspaceLabel(workspace)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Prompt</span>
                    <textarea
                      className="control assistant-admin-prompt"
                      value={agentEvalForm.prompt}
                      onChange={(event) =>
                        setAgentEvalForm((current) => ({ ...current, prompt: event.target.value }))
                      }
                      placeholder="Review the selected workflow item and stage the allowed update."
                    />
                  </label>

                  <label className="field">
                    <span>Context</span>
                    <textarea
                      className="control"
                      value={agentEvalForm.context}
                      onChange={(event) =>
                        setAgentEvalForm((current) => ({ ...current, context: event.target.value }))
                      }
                      placeholder="Optional deterministic fixture context for the case."
                    />
                  </label>

                  <div className="assistant-admin-form-grid">
                    <label className="field">
                      <span>Expected Text</span>
                      <textarea
                        className="control"
                        value={agentEvalForm.expected_substrings}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            expected_substrings: event.target.value,
                          }))
                        }
                        placeholder="One required response substring per line"
                      />
                    </label>
                    <label className="field">
                      <span>Expected Tools</span>
                      <textarea
                        className="control"
                        value={agentEvalForm.expected_tool_names}
                        onChange={(event) =>
                          setAgentEvalForm((current) => ({
                            ...current,
                            expected_tool_names: event.target.value,
                          }))
                        }
                        placeholder="list_workflow_items"
                      />
                    </label>
                  </div>

                  <div className="assistant-admin-option-group">
                    <strong>Expected action types</strong>
                    <div className="chip-row">
                      {actionTypeOptions.map((actionType) => (
                        <button
                          key={actionType}
                          type="button"
                          className={`entity-chip ${agentEvalForm.expected_action_types.includes(actionType) ? '' : 'entity-chip-soft'}`}
                          onClick={() =>
                            setAgentEvalForm((current) => ({
                              ...current,
                              expected_action_types: toggleSelection(current.expected_action_types, actionType),
                            }))
                          }
                        >
                          {formatAssistantActionTypeLabel(actionType, actionDefinitionsByName)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="assistant-admin-toggle">
                    <input
                      type="checkbox"
                      checked={agentEvalForm.use_live_tools}
                      onChange={(event) =>
                        setAgentEvalForm((current) => ({
                          ...current,
                          use_live_tools: event.target.checked,
                        }))
                      }
                    />
                    <span>Allow live tools during this eval run</span>
                  </label>

                  <div className="toolbar settings-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void handleSaveAgentEval()}
                      disabled={savingAgentEval}
                    >
                      {savingAgentEval ? 'Saving Eval...' : selectedAgentEval ? 'Save Eval Case' : 'Create Eval Case'}
                    </button>
                    {selectedAgentEval ? (
                      <>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => void handleRunAgentEval(selectedAgentEval.eval_id)}
                          disabled={runningAgentEvalId === selectedAgentEval.eval_id}
                        >
                          {runningAgentEvalId === selectedAgentEval.eval_id ? 'Running Eval...' : 'Run Case'}
                        </button>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => void handleDeleteAgentEval(selectedAgentEval.eval_id)}
                          disabled={deletingAgentEvalId === selectedAgentEval.eval_id}
                        >
                          {deletingAgentEvalId === selectedAgentEval.eval_id ? 'Deleting...' : 'Delete Case'}
                        </button>
                      </>
                    ) : null}
                  </div>

                  {agentEvalRunsLoading ? (
                    <small className="form-note">Loading eval run history...</small>
                  ) : agentEvalRuns.length > 0 ? (
                    <div className="assistant-builder-warning-list">
                      {agentEvalRuns.map((run) => (
                        <div key={run.eval_run_id} className="assistant-sidebar-block">
                          <strong>
                            <span className={`status-pill status-pill-${evalRunStatusTone(run.status)}`}>
                              {evalRunStatusLabel(run.status)}
                            </span>{' '}
                            {formatDate(run.completed_at)}
                          </strong>
                          <p>
                            {run.failure_reasons[0] ??
                              `${run.observed_tool_names.length} tool call${run.observed_tool_names.length === 1 ? '' : 's'} observed`}
                          </p>
                          <small>
                            Run by {run.run_by}
                            {run.run_id ? ` · Assistant run #${run.run_id}` : ''}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : selectedAgentEval ? (
                    <small className="form-note">No run history recorded for this eval case yet.</small>
                  ) : null}
                </div>

                <div className="assistant-builder-preview assistant-policy-simulator">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Autonomy Review</span>
                      <h4>Generated Brief</h4>
                    </div>
                    <span>Outcome metrics, eval expectations, and knowledge-base lessons</span>
                  </div>

                  <div className="toolbar settings-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleGenerateAutonomyReview()}
                      disabled={autonomyReviewLoading}
                    >
                      {autonomyReviewLoading ? 'Generating Brief...' : 'Generate Autonomy Brief'}
                    </button>
                  </div>

                  {autonomyReviewError ? (
                    <div className="feedback-banner feedback-banner-error">{autonomyReviewError}</div>
                  ) : null}

                  {autonomyReview ? (
                    <>
                      <div className="assistant-builder-preview-grid">
                        <div className="assistant-sidebar-block">
                          <strong>Recommendation</strong>
                          <p>{autonomyReviewRecommendationLabel(autonomyReview.recommended_next_authority)}</p>
                          <small>{autonomyReview.recommendation_reasons[0] ?? 'No reason returned.'}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Outcome evidence</strong>
                          <p>{autonomyReview.outcome_metrics?.decided_action_count ?? 0} decided</p>
                          <small>
                            {autonomyReview.outcome_metrics
                              ? `${autonomyReview.outcome_metrics.executed_action_count} executed · ${autonomyReview.outcome_metrics.rejected_action_count} rejected · ${autonomyReview.outcome_metrics.failed_action_count} failed`
                              : 'No agent outcome metrics in the selected window'}
                          </small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Eval signal</strong>
                          <p>{autonomyReview.eval_signal.status.replace(/_/g, ' ')}</p>
                          <small>
                            {autonomyReview.eval_signal.required_cases.length +
                              autonomyReview.eval_signal.proposed_cases.length}{' '}
                            declared case
                            {autonomyReview.eval_signal.required_cases.length +
                              autonomyReview.eval_signal.proposed_cases.length ===
                            1
                              ? ''
                              : 's'}
                          </small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Knowledge base</strong>
                          <p>{autonomyReview.knowledge_base_entries.length} matched lessons</p>
                          <small>
                            {autonomyReview.deterministic_algorithm_candidates.length} deterministic candidate
                            {autonomyReview.deterministic_algorithm_candidates.length === 1 ? '' : 's'}
                          </small>
                        </div>
                      </div>

                      <div className="assistant-builder-warning-list">
                        {autonomyReview.stop_conditions.slice(0, 3).map((condition) => (
                          <small key={condition} className="form-note">
                            {condition}
                          </small>
                        ))}
                      </div>

                      {autonomyReview.deterministic_algorithm_candidates.length > 0 ? (
                        <div className="assistant-sidebar-block">
                          <strong>Deterministic candidates</strong>
                          <p>{autonomyReview.deterministic_algorithm_candidates[0]}</p>
                        </div>
                      ) : null}
                    </>
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
                            {policyDecisionSummary(
                              policySimulation.allowed_tools,
                              'No live tools allowed',
                              actionDefinitionsByName,
                            )}
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
                            {policyDecisionSummary(
                              policySimulation.allowed_actions,
                              'No actions allowed',
                              actionDefinitionsByName,
                            )}
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
                              <strong>{policyResourceLabel(proposal.action_type, actionDefinitionsByName)}</strong>
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

                <div className="assistant-builder-preview assistant-policy-simulator">
                  <div className="assistant-admin-section-head">
                    <div>
                      <span className="eyebrow">Self-Update</span>
                      <h4>Learning Draft</h4>
                    </div>
                    <span>Turn feedback and failing evals into a reviewable prompt/config draft</span>
                  </div>

                  <label className="field">
                    <span>Optional focus</span>
                    <textarea
                      className="control"
                      value={selfUpdateBrief}
                      onChange={(event) => setSelfUpdateBrief(event.target.value)}
                      placeholder="Focus on repeated unsupported workflow staging or missing evidence language."
                    />
                    <small className="form-note">
                      Leave blank to let the server build the draft from recent mistakes and governance signals.
                    </small>
                  </label>

                  <div className="toolbar settings-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleGenerateSelfUpdateDraft()}
                      disabled={selfUpdateLoading}
                    >
                      {selfUpdateLoading ? 'Generating Draft...' : 'Generate Self-Update Draft'}
                    </button>
                    {selfUpdateDraft ? (
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => handleApplySelfUpdateDraft()}
                      >
                        Apply To Editor
                      </button>
                    ) : null}
                    {selfUpdateDraft ? (
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void handlePublishAgentRevision(toRevisionFromSelfUpdateDraft(selfUpdateDraft))}
                        disabled={publishingRevisionId === selfUpdateDraft.revision_id}
                      >
                        {publishingRevisionId === selfUpdateDraft.revision_id
                          ? 'Publishing...'
                          : 'Publish Draft Revision'}
                      </button>
                    ) : null}
                  </div>

                  {selfUpdateError ? (
                    <div className="feedback-banner feedback-banner-error">{selfUpdateError}</div>
                  ) : null}

                  {agentRevisionsError ? (
                    <div className="feedback-banner feedback-banner-error">{agentRevisionsError}</div>
                  ) : null}

                  {selfUpdateDraft ? (
                    <>
                      <div className="assistant-builder-preview-grid">
                        <div className="assistant-sidebar-block">
                          <strong>Draft revision</strong>
                          <p>v{selfUpdateDraft.revision_version}</p>
                          <small>
                            Stored {formatDate(selfUpdateDraft.created_at)} by {selfUpdateDraft.created_by}
                          </small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Suggested changes</strong>
                          <p>{selfUpdateDraft.change_summary.length}</p>
                          <small>{selfUpdateDraft.change_summary[0] ?? 'No change summary returned.'}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Needs-work feedback</strong>
                          <p>{selfUpdateDraft.evidence.recent_needs_work_feedback.length}</p>
                          <small>{selfUpdateDraft.evidence.recent_needs_work_feedback[0] ?? 'No comments captured.'}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Failing evals</strong>
                          <p>{selfUpdateDraft.evidence.failing_eval_cases.length}</p>
                          <small>{selfUpdateDraft.evidence.failing_eval_cases[0] ?? 'No failing evals captured.'}</small>
                        </div>
                        <div className="assistant-sidebar-block">
                          <strong>Visible diffs</strong>
                          <p>{selfUpdateDraft.diff_summary.length}</p>
                          <small>{selfUpdateDraft.diff_summary[0]?.label ?? 'No field-level diff returned.'}</small>
                        </div>
                      </div>

                      <div className="assistant-builder-warning-list">
                        {selfUpdateDraft.change_summary.map((summary) => (
                          <small key={summary} className="form-note">
                            {summary}
                          </small>
                        ))}
                      </div>

                      {selfUpdateDraft.diff_summary.length > 0 ? (
                        <div className="assistant-builder-warning-list">
                          {selfUpdateDraft.diff_summary.map((entry) => (
                            <small key={`${entry.field_key}-${entry.next_value}`} className="form-note">
                              {entry.label}: {entry.current_value}{' -> '}{entry.next_value}
                            </small>
                          ))}
                        </div>
                      ) : null}

                      {selfUpdateDraft.warnings.length > 0 ? (
                        <div className="assistant-builder-warning-list">
                          {selfUpdateDraft.warnings.map((warning) => (
                            <small key={warning} className="form-note">
                              {warning}
                            </small>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="assistant-builder-warning-list">
                    <strong>Recent revisions</strong>
                    {agentRevisionsLoading ? (
                      <small className="form-note">Loading recent revision history...</small>
                    ) : agentRevisions.length === 0 ? (
                      <small className="form-note">
                        No stored revisions yet. Generate a self-update draft or save the agent to start revision history.
                      </small>
                    ) : (
                      agentRevisions.map((revision) => (
                        <div key={revision.revision_id} className="assistant-sidebar-block">
                          <strong>
                            v{revision.version} {revision.is_published ? 'Published' : 'Draft'}
                          </strong>
                          <p>{revision.change_summary[0] ?? 'No change summary recorded.'}</p>
                          <small>
                            {formatDate(revision.created_at)} by {revision.created_by}
                          </small>
                          <small>
                            {revision.diff_summary.length > 0
                              ? `${revision.diff_summary.length} visible diffs`
                              : revision.is_published
                                ? 'Matches the current published revision.'
                                : 'No field-level diff summary available.'}
                          </small>
                          <div className="toolbar settings-actions">
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => handleLoadRevisionIntoEditor(revision)}
                            >
                              Load Into Editor
                            </button>
                            {!revision.is_published ? (
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => void handlePublishAgentRevision(revision)}
                                disabled={publishingRevisionId === revision.revision_id}
                              >
                                {publishingRevisionId === revision.revision_id ? 'Publishing...' : 'Publish'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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

                  <AgentHierarchyEditor
                    form={editForm}
                    setForm={setEditForm}
                    role={editFormRole}
                    agentRecords={agentRecords}
                  />

                  <RoleProfileFitSummary fit={editProfileFit} />
                  <PromptProfilePreview form={editForm} role={editFormRole} agentRecords={agentRecords} />

                  {editFormRole ? (
                    <div className="toolbar settings-actions">
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => {
                          const roleDraft = applyRoleHierarchyRecommendations(
                            buildAgentBuilderDraftFromRole(editFormRole, availableTools),
                            editFormRole,
                            agentRecords,
                          )
                          setEditForm((current) => ({
                            ...current,
                            profile_kind: 'ROLE_DERIVED',
                            role_key: roleDraft.role_key,
                            profile_request_id: null,
                            human_owner_role: roleDraft.human_owner_role,
                            authority_ceiling: roleDraft.authority_ceiling,
                            activation_notes: current.activation_notes || roleDraft.activation_notes,
                            orchestration_pattern: roleDraft.orchestration_pattern,
                            parent_agent_id: roleDraft.parent_agent_id,
                            managed_agent_ids: [...roleDraft.managed_agent_ids],
                            delegation_guidance: roleDraft.delegation_guidance,
                            specialization_summary:
                              current.specialization_summary || roleDraft.specialization_summary,
                            allowed_workspaces: roleDraft.allowed_workspaces,
                            capabilities: roleDraft.capabilities,
                            skills: roleDraft.skills,
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

                  <AgentSkillSelector
                    selectedSkills={editForm.skills}
                    availableSkills={availableSkills}
                    description="Keep the specialization explicit so users can see how this agent is built."
                    onToggle={(skillName) =>
                      setEditForm((current) => ({
                        ...current,
                        skills: toggleSelection(current.skills, skillName),
                      }))
                    }
                  />

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
                      {actionTypeOptions.map((actionType) => (
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
                          {formatAssistantActionTypeLabel(actionType, actionDefinitionsByName)}
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
