import { useMemo, useState } from 'react'

import {
  assistantBudgetSignalClass,
  assistantBudgetSignalLabel,
  budgetMeterWidth,
  describeAssistantTokenBudget,
  formatBudgetPercent,
} from '../../entities/assistant/budget'
import type {
  AssistantActionDefinition,
  AssistantActionType,
  AssistantAgent,
  AssistantAgentEvalGateStatus,
  AssistantAgentOrchestrationPattern,
  AssistantAgentSkillDefinition,
  AssistantAgentSkillKey,
  AssistantRuntimeSettings,
  ViewKey,
} from '../../shared/models'
import { buildAssistantAgentAccessSummary } from './assistantWorkspaceAccessSummary'

type AssistantAgentDirectoryPanelProps = {
  agents: AssistantAgent[]
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
  initialComparisonAgentId?: string
}

type AssistantAgentChipListProps = {
  emptyLabel: string
  values: string[]
}

type ComparableAgent = AssistantAgent | null

type AssistantAgentComparisonRow = {
  label: string
  primary: string
  comparison: string
  different: boolean
}

export type AssistantAgentComparisonSummary = {
  headline: string
  primaryName: string
  primaryBestFor: string
  primaryAvoidWhen: string
  comparisonName: string
  comparisonBestFor: string
  comparisonAvoidWhen: string
  rows: AssistantAgentComparisonRow[]
}

const FOUNDATION_COMPARE_TARGET = '__platform-foundation__'

function AssistantAgentChipList({ values, emptyLabel }: AssistantAgentChipListProps) {
  if (values.length === 0) {
    return <small>{emptyLabel}</small>
  }

  return (
    <div className="assistant-agent-chip-list">
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  )
}

function formatCatalogLabel(value: string): string {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatRoleKey(roleKey: string | null | undefined): string {
  return roleKey?.trim() ? formatCatalogLabel(roleKey) : 'Custom mission'
}

function formatProfileKind(value: AssistantAgent['profile_kind'] | null | undefined): string {
  if (value === 'ROLE_DERIVED') {
    return 'Role-derived'
  }
  if (value === 'CURATED') {
    return 'Curated'
  }
  return 'Custom'
}

function formatWorkspaceLabel(value: ViewKey): string {
  return formatCatalogLabel(value)
}

function formatSkillLabel(
  value: AssistantAgentSkillKey,
  definitionsByName: ReadonlyMap<AssistantAgentSkillKey, AssistantAgentSkillDefinition>,
): string {
  return definitionsByName.get(value)?.label ?? formatCatalogLabel(value)
}

function formatActionLabel(
  value: AssistantActionType,
  definitionsByName: ReadonlyMap<AssistantActionType, AssistantActionDefinition>,
): string {
  return definitionsByName.get(value)?.label ?? formatCatalogLabel(value)
}

function formatAgentStatusTone(
  status: AssistantAgent['status'] | 'FOUNDATION',
): 'active' | 'planned' | 'cancelled' {
  if (status === 'ACTIVE' || status === 'FOUNDATION') {
    return 'active'
  }
  if (status === 'RETIRED') {
    return 'cancelled'
  }
  return 'planned'
}

function formatEvalGateTone(
  status: AssistantAgentEvalGateStatus | null | undefined,
): 'active' | 'planned' | 'cancelled' {
  if (status === 'PASS') {
    return 'active'
  }
  if (status === 'BLOCKED') {
    return 'cancelled'
  }
  return 'planned'
}

function formatEvalGateSummary(selectedAgent: AssistantAgent | null): string {
  const gate = selectedAgent?.eval_gate
  if (!selectedAgent) {
    return 'No named eval gate is attached to the platform foundation.'
  }
  if (!gate) {
    return 'Eval gate details will appear once this profile reloads from the policy-aware API.'
  }
  if (gate.status === 'PASS') {
    return `${gate.covered_cases.length} eval case${gate.covered_cases.length === 1 ? '' : 's'} currently cover activation.`
  }
  if (gate.status === 'BLOCKED') {
    return gate.missing_cases[0] ?? 'Eval coverage must be completed before this profile can activate or expand.'
  }
  return 'No eval gate is required for this profile today.'
}

function formatEffectivePolicySummary(selectedAgent: AssistantAgent | null): string {
  const policy = selectedAgent?.effective_policy
  if (!selectedAgent) {
    return 'Shared backend policy still governs live tools and approval-gated actions without a named agent override.'
  }
  if (!policy) {
    return 'Effective policy details will appear once this profile reloads from the policy-aware API.'
  }
  return [
    `${policy.allowed_tools.length} allowed tool${policy.allowed_tools.length === 1 ? '' : 's'}`,
    `${policy.blocked_tools.length} blocked tool${policy.blocked_tools.length === 1 ? '' : 's'}`,
    `${policy.allowed_actions.length} allowed action${policy.allowed_actions.length === 1 ? '' : 's'}`,
    `${policy.blocked_actions.length} blocked action${policy.blocked_actions.length === 1 ? '' : 's'}`,
  ].join(' · ')
}

function formatOrchestrationPattern(pattern: AssistantAgentOrchestrationPattern | null): string {
  switch (pattern) {
    case 'MANAGER':
      return 'Manager'
    case 'TRIAGE':
      return 'Triage'
    case 'PARALLEL':
      return 'Parallel'
    case 'EVALUATOR':
      return 'Evaluator'
    case 'SINGLE':
      return 'Single'
    default:
      return 'Platform foundation'
  }
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

function comparableAgentName(agent: ComparableAgent): string {
  return agent?.name ?? 'Platform Foundation'
}

function comparableAgentBestFor(agent: ComparableAgent): string {
  if (!agent) {
    return 'General operator questions, prompt review, and broad shared application context.'
  }
  return agent.specialization_summary ?? agent.description
}

function comparableAgentAvoidWhen(agent: ComparableAgent): string {
  if (!agent) {
    return 'Avoid when you need a named specialization, fixed tool subset, hierarchy, or governed action posture.'
  }
  if (agent.status !== 'ACTIVE') {
    return `Avoid when you need an active profile; this agent is currently ${agent.status.toLowerCase()}.`
  }
  if (!agent.capabilities.includes('ACTION')) {
    return 'Avoid when you need review-gated mutations or action staging.'
  }
  if (agent.allowed_action_types.length === 0) {
    return 'Avoid when you need specific governed actions; none are explicitly pinned.'
  }
  if (agent.allowed_tools.length === 0) {
    return 'Avoid when you need live tool access; this profile answers from prompt context only.'
  }
  return 'Avoid when another profile owns a narrower workflow or a safer authority ceiling for the task.'
}

function comparableAgentSkillLabels(
  agent: ComparableAgent,
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null,
  definitionsByName: ReadonlyMap<AssistantAgentSkillKey, AssistantAgentSkillDefinition>,
): string {
  if (!agent) {
    return runtimeSettings?.available_skills.length
      ? 'No named skill bundle pinned'
      : 'No reusable skills published'
  }
  return agent.skills.length > 0
    ? agent.skills.map((skill) => formatSkillLabel(skill, definitionsByName)).join(' · ')
    : 'No explicit skill bundle'
}

function comparableAgentActionLabels(
  agent: ComparableAgent,
  definitionsByName: ReadonlyMap<AssistantActionType, AssistantActionDefinition>,
): string {
  if (!agent) {
    return 'No named governed action grant'
  }
  return agent.allowed_action_types.length > 0
    ? agent.allowed_action_types.map((action) => formatActionLabel(action, definitionsByName)).join(' · ')
    : 'No governed actions granted'
}

function comparableAgentToolLabels(
  agent: ComparableAgent,
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null,
): string {
  if (!agent) {
    return runtimeSettings?.available_tools.length
      ? runtimeSettings.available_tools.map((tool) => tool.name).join(' · ')
      : 'No published live tools'
  }
  return agent.allowed_tools.length > 0 ? agent.allowed_tools.join(' · ') : 'No live tools granted'
}

function comparableAgentWorkspaceLabels(agent: ComparableAgent): string {
  if (!agent) {
    return 'Assistant'
  }
  return agent.allowed_workspaces.length > 0
    ? agent.allowed_workspaces.map((workspace) => formatWorkspaceLabel(workspace)).join(' · ')
    : 'No workspaces scoped'
}

function comparableAgentBudgetLabel(agent: ComparableAgent): string {
  if (!agent) {
    return 'Shared runtime'
  }
  return `${assistantBudgetSignalLabel(agent.token_budget)} · ${describeAssistantTokenBudget(agent.token_budget)}`
}

function comparableAgentEvalLabel(agent: ComparableAgent): string {
  if (!agent) {
    return 'No named eval gate'
  }
  const gate = agent.eval_gate
  if (!gate) {
    return 'Eval gate pending reload'
  }
  if (gate.status === 'PASS') {
    return `PASS · ${gate.covered_cases.length} covered`
  }
  if (gate.status === 'BLOCKED') {
    return `BLOCKED · ${gate.missing_cases.join(' · ') || 'Coverage missing'}`
  }
  return 'NOT REQUIRED'
}

function comparableAgentPolicyLabel(agent: ComparableAgent): string {
  return formatEffectivePolicySummary(agent)
}

function comparisonHeadline(primary: ComparableAgent, comparison: ComparableAgent): string {
  const primaryName = comparableAgentName(primary)
  const comparisonName = comparableAgentName(comparison)
  const primaryActionCapable = Boolean(primary?.capabilities.includes('ACTION'))
  const comparisonActionCapable = Boolean(comparison?.capabilities.includes('ACTION'))
  const notes: string[] = []

  if (primaryActionCapable !== comparisonActionCapable) {
    notes.push(
      primaryActionCapable
        ? `${primaryName} can stage governed actions while ${comparisonName} stays read/explain focused.`
        : `${comparisonName} can stage governed actions while ${primaryName} stays read/explain focused.`,
    )
  }

  const primaryPattern = formatOrchestrationPattern(primary?.orchestration_pattern ?? null)
  const comparisonPattern = formatOrchestrationPattern(comparison?.orchestration_pattern ?? null)
  if (primaryPattern !== comparisonPattern) {
    notes.push(
      `${primaryName} runs ${primaryPattern.toLowerCase()} orchestration while ${comparisonName} runs ${comparisonPattern.toLowerCase()}.`,
    )
  }

  const primarySkillCount = primary?.skills.length ?? 0
  const comparisonSkillCount = comparison?.skills.length ?? 0
  if (primarySkillCount !== comparisonSkillCount) {
    notes.push(
      primarySkillCount > comparisonSkillCount
        ? `${primaryName} carries a broader pinned skill bundle (${primarySkillCount} vs ${comparisonSkillCount}).`
        : `${comparisonName} carries a broader pinned skill bundle (${comparisonSkillCount} vs ${primarySkillCount}).`,
    )
  }

  const primaryWorkspaceCount = primary?.allowed_workspaces.length ?? 1
  const comparisonWorkspaceCount = comparison?.allowed_workspaces.length ?? 1
  if (primaryWorkspaceCount !== comparisonWorkspaceCount) {
    notes.push(
      primaryWorkspaceCount > comparisonWorkspaceCount
        ? `${primaryName} spans more workspaces (${primaryWorkspaceCount} vs ${comparisonWorkspaceCount}).`
        : `${comparisonName} spans more workspaces (${comparisonWorkspaceCount} vs ${primaryWorkspaceCount}).`,
    )
  }

  return (
    notes.slice(0, 2).join(' ') ||
    'Both profiles are similarly scoped, so the main differences are mission wording, hierarchy, and current governance posture.'
  )
}

function buildAssistantAgentComparisonSummary({
  primaryAgent,
  comparisonAgent,
  runtimeSettings,
  skillDefinitionsByName,
  actionDefinitionsByName,
}: {
  primaryAgent: ComparableAgent
  comparisonAgent: ComparableAgent
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null
  skillDefinitionsByName: ReadonlyMap<AssistantAgentSkillKey, AssistantAgentSkillDefinition>
  actionDefinitionsByName: ReadonlyMap<AssistantActionType, AssistantActionDefinition>
}): AssistantAgentComparisonSummary {
  const primaryName = comparableAgentName(primaryAgent)
  const comparisonName = comparableAgentName(comparisonAgent)

  const primaryScope = primaryAgent?.scope ?? 'Shared runtime'
  const comparisonScope = comparisonAgent?.scope ?? 'Shared runtime'
  const primaryRole = primaryAgent ? formatRoleKey(primaryAgent.role_key) : 'No named role pinned'
  const comparisonRole = comparisonAgent ? formatRoleKey(comparisonAgent.role_key) : 'No named role pinned'
  const primaryProfileKind = primaryAgent ? formatProfileKind(primaryAgent.profile_kind) : 'Foundation'
  const comparisonProfileKind = comparisonAgent
    ? formatProfileKind(comparisonAgent.profile_kind)
    : 'Foundation'
  const primaryAuthority = primaryAgent?.authority_ceiling ?? 'Prompt only'
  const comparisonAuthority = comparisonAgent?.authority_ceiling ?? 'Prompt only'
  const primaryPattern = formatOrchestrationPattern(primaryAgent?.orchestration_pattern ?? null)
  const comparisonPattern = formatOrchestrationPattern(comparisonAgent?.orchestration_pattern ?? null)
  const primaryCapabilities = primaryAgent?.capabilities.join(' · ') || 'READ · EXPLAIN'
  const comparisonCapabilities = comparisonAgent?.capabilities.join(' · ') || 'READ · EXPLAIN'
  const primarySkills = comparableAgentSkillLabels(
    primaryAgent,
    runtimeSettings,
    skillDefinitionsByName,
  )
  const comparisonSkills = comparableAgentSkillLabels(
    comparisonAgent,
    runtimeSettings,
    skillDefinitionsByName,
  )
  const primaryWorkspaces = comparableAgentWorkspaceLabels(primaryAgent)
  const comparisonWorkspaces = comparableAgentWorkspaceLabels(comparisonAgent)
  const primaryTools = comparableAgentToolLabels(primaryAgent, runtimeSettings)
  const comparisonTools = comparableAgentToolLabels(comparisonAgent, runtimeSettings)
  const primaryActions = comparableAgentActionLabels(primaryAgent, actionDefinitionsByName)
  const comparisonActions = comparableAgentActionLabels(comparisonAgent, actionDefinitionsByName)
  const primaryBudget = comparableAgentBudgetLabel(primaryAgent)
  const comparisonBudget = comparableAgentBudgetLabel(comparisonAgent)
  const primaryEval = comparableAgentEvalLabel(primaryAgent)
  const comparisonEval = comparableAgentEvalLabel(comparisonAgent)
  const primaryPolicy = comparableAgentPolicyLabel(primaryAgent)
  const comparisonPolicy = comparableAgentPolicyLabel(comparisonAgent)

  return {
    headline: comparisonHeadline(primaryAgent, comparisonAgent),
    primaryName,
    primaryBestFor: comparableAgentBestFor(primaryAgent),
    primaryAvoidWhen: comparableAgentAvoidWhen(primaryAgent),
    comparisonName,
    comparisonBestFor: comparableAgentBestFor(comparisonAgent),
    comparisonAvoidWhen: comparableAgentAvoidWhen(comparisonAgent),
    rows: [
      {
        label: 'Scope',
        primary: primaryScope,
        comparison: comparisonScope,
        different: primaryScope !== comparisonScope,
      },
      {
        label: 'Role profile',
        primary: primaryRole,
        comparison: comparisonRole,
        different: primaryRole !== comparisonRole,
      },
      {
        label: 'Profile kind',
        primary: primaryProfileKind,
        comparison: comparisonProfileKind,
        different: primaryProfileKind !== comparisonProfileKind,
      },
      {
        label: 'Authority ceiling',
        primary: primaryAuthority,
        comparison: comparisonAuthority,
        different: primaryAuthority !== comparisonAuthority,
      },
      {
        label: 'Orchestration',
        primary: primaryPattern,
        comparison: comparisonPattern,
        different: primaryPattern !== comparisonPattern,
      },
      {
        label: 'Capabilities',
        primary: primaryCapabilities,
        comparison: comparisonCapabilities,
        different: primaryCapabilities !== comparisonCapabilities,
      },
      {
        label: 'Skills',
        primary: primarySkills,
        comparison: comparisonSkills,
        different: primarySkills !== comparisonSkills,
      },
      {
        label: 'Workspaces',
        primary: primaryWorkspaces,
        comparison: comparisonWorkspaces,
        different: primaryWorkspaces !== comparisonWorkspaces,
      },
      {
        label: 'Live tools',
        primary: primaryTools,
        comparison: comparisonTools,
        different: primaryTools !== comparisonTools,
      },
      {
        label: 'Governed actions',
        primary: primaryActions,
        comparison: comparisonActions,
        different: primaryActions !== comparisonActions,
      },
      {
        label: 'Budget posture',
        primary: primaryBudget,
        comparison: comparisonBudget,
        different: primaryBudget !== comparisonBudget,
      },
      {
        label: 'Eval gate',
        primary: primaryEval,
        comparison: comparisonEval,
        different: primaryEval !== comparisonEval,
      },
      {
        label: 'Effective policy',
        primary: primaryPolicy,
        comparison: comparisonPolicy,
        different: primaryPolicy !== comparisonPolicy,
      },
    ],
  }
}

export function AssistantAgentDirectoryPanel({
  agents,
  runtimeSettings,
  selectedAgentId,
  onSelectAgent,
  initialComparisonAgentId = '',
}: AssistantAgentDirectoryPanelProps) {
  const [comparisonAgentId, setComparisonAgentId] = useState(initialComparisonAgentId)
  const selectedAgent = agents.find((agent) => agent.agent_id === selectedAgentId) ?? null
  const budgetClass = assistantBudgetSignalClass(selectedAgent?.token_budget)
  const selectedAgentAccessSummary = buildAssistantAgentAccessSummary(selectedAgent, runtimeSettings)
  const parentAgent =
    selectedAgent?.parent_agent_id?.trim()
      ? agents.find((agent) => agent.agent_id === selectedAgent.parent_agent_id) ?? null
      : null
  const managedAgents = selectedAgent
    ? selectedAgent.managed_agent_ids
        .map((agentId) => agents.find((agent) => agent.agent_id === agentId) ?? null)
        .filter((agent): agent is AssistantAgent => agent !== null)
    : []
  const skillDefinitionsByName = new Map(
    (runtimeSettings?.available_skills ?? []).map((definition) => [definition.name, definition]),
  )
  const actionDefinitionsByName = new Map(
    (runtimeSettings?.available_action_types ?? []).map((definition) => [definition.name, definition]),
  )
  const selectedSkillLabels = selectedAgent
    ? selectedAgent.skills.map((skill) => formatSkillLabel(skill, skillDefinitionsByName))
    : (runtimeSettings?.available_skills ?? []).map((skill) => skill.label)
  const selectedActionLabels = selectedAgent
    ? selectedAgent.allowed_action_types.map((action) => formatActionLabel(action, actionDefinitionsByName))
    : (runtimeSettings?.available_action_types ?? []).map((action) => action.label)
  const selectedWorkspaceLabels = selectedAgent
    ? selectedAgent.allowed_workspaces.map((workspace) => formatWorkspaceLabel(workspace))
    : ['Assistant']
  const selectedCapabilityLabels = selectedAgent?.capabilities ?? ['READ', 'EXPLAIN']
  const selectedToolLabels = selectedAgent
    ? selectedAgent.allowed_tools
    : (runtimeSettings?.available_tools ?? []).map((tool) => tool.name)
  const selectedStatusTone = formatAgentStatusTone(selectedAgent?.status ?? 'FOUNDATION')
  const resolvedComparisonAgentId = useMemo(() => {
    if (!comparisonAgentId) {
      return ''
    }
    if (comparisonAgentId === FOUNDATION_COMPARE_TARGET) {
      return selectedAgentId ? FOUNDATION_COMPARE_TARGET : ''
    }
    if (comparisonAgentId === selectedAgentId) {
      return ''
    }
    return agents.some((agent) => agent.agent_id === comparisonAgentId) ? comparisonAgentId : ''
  }, [agents, comparisonAgentId, selectedAgentId])
  const comparisonAgent =
    resolvedComparisonAgentId === FOUNDATION_COMPARE_TARGET
      ? null
      : resolvedComparisonAgentId.trim()
        ? agents.find((agent) => agent.agent_id === resolvedComparisonAgentId) ?? null
        : undefined
  const comparisonSummary =
    comparisonAgent !== undefined
      ? buildAssistantAgentComparisonSummary({
          primaryAgent: selectedAgent,
          comparisonAgent,
          runtimeSettings,
          skillDefinitionsByName,
          actionDefinitionsByName,
        })
      : null
  const directoryDescription = selectedAgent
    ? 'Review the exact construction recipe, hierarchy, and guardrails that shape this managed agent before you send a request.'
    : 'Review the shared platform foundation or pick a named agent to inspect its construction recipe and boundaries.'

  return (
    <section className="assistant-agent-directory">
      <div className="assistant-agent-directory-head">
        <div>
          <span className="eyebrow">Agent Directory</span>
          <h4>{selectedAgent ? selectedAgent.name : 'Platform Foundation'}</h4>
        </div>
        <p>{directoryDescription}</p>
      </div>

      <div className="assistant-agent-compare-bar">
        <div className="assistant-agent-compare-copy">
          <strong>Compare agents</strong>
          <p>
            Pick a second profile to see mission, access, hierarchy, and governance differences
            side by side before you choose which one to use.
          </p>
        </div>
        <div className="assistant-agent-compare-controls">
          <label className="field">
            <span>Compare with</span>
            <select
              className="control"
              value={resolvedComparisonAgentId}
              onChange={(event) => setComparisonAgentId(event.target.value)}
            >
              <option value="">No comparison</option>
              {selectedAgentId ? (
                <option value={FOUNDATION_COMPARE_TARGET}>Platform Foundation</option>
              ) : null}
              {agents
                .filter((agent) => agent.agent_id !== selectedAgentId)
                .map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.name}
                  </option>
                ))}
            </select>
          </label>
          {comparisonSummary ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setComparisonAgentId('')}
            >
              Clear compare
            </button>
          ) : null}
        </div>
      </div>

      <div className="assistant-agent-grid">
        <button
          type="button"
          className={`assistant-agent-card ${selectedAgentId ? '' : 'is-selected'}`}
          onClick={() => onSelectAgent('')}
        >
          <div className="assistant-provider-head">
            <strong>Platform Foundation</strong>
            <span className="status-pill status-pill-active">Default</span>
          </div>
          <p>Use the shared org, user, data, and world context without a named agent override.</p>
          <small>Good for general operator questions, prompt review, and baseline assistant behavior.</small>
        </button>

        {agents.map((agent) => {
          const cardBudgetClass = assistantBudgetSignalClass(agent.token_budget)
          return (
            <button
              key={agent.agent_id}
              type="button"
              className={[
                'assistant-agent-card',
                selectedAgentId === agent.agent_id ? 'is-selected' : '',
                budgetCardToneClass(cardBudgetClass),
              ].join(' ')}
              onClick={() => onSelectAgent(agent.agent_id)}
            >
              <div className="assistant-provider-head">
                <strong>{agent.name}</strong>
                <span className={`assistant-budget-signal ${cardBudgetClass}`}>
                  {assistantBudgetSignalLabel(agent.token_budget)}
                </span>
              </div>
              <p>{agent.description}</p>
              <div className="assistant-agent-budget-row">
                <span>{agent.scope}</span>
                <span>{formatBudgetPercent(agent.token_budget)} used</span>
              </div>
              <div className={`assistant-budget-meter ${cardBudgetClass}`} aria-hidden="true">
                <span style={{ width: budgetMeterWidth(agent.token_budget) }} />
              </div>
              <small>{describeAssistantTokenBudget(agent.token_budget)}</small>
              <small>
                {agent.role_key ? `${formatRoleKey(agent.role_key)} · ` : ''}
                {agent.skills.length > 0 ? `${agent.skills.length} skills` : 'No pinned skills'}
                {agent.allowed_tools.length > 0 ? ` · ${agent.allowed_tools.length} tools` : ''}
                {agent.allowed_action_types.length > 0 ? ` · ${agent.allowed_action_types.length} actions` : ''}
              </small>
            </button>
          )
        })}
      </div>

      {comparisonSummary ? (
        <div className="assistant-agent-compare-shell">
          <div className="assistant-agent-compare-head">
            <strong>Compare with {comparisonSummary.comparisonName}</strong>
            <p>{comparisonSummary.headline}</p>
          </div>

          <div className="assistant-agent-compare-summary-grid">
            <article className="assistant-agent-detail-card">
              <div className="assistant-provider-head">
                <strong>{comparisonSummary.primaryName}</strong>
                <span className={`status-pill status-pill-${selectedStatusTone}`}>
                  {selectedAgent ? selectedAgent.status : 'FOUNDATION'}
                </span>
              </div>
              <div className="assistant-agent-detail-stack">
                <div>
                  <strong>Best for</strong>
                  <small>{comparisonSummary.primaryBestFor}</small>
                </div>
                <div>
                  <strong>Avoid when</strong>
                  <small>{comparisonSummary.primaryAvoidWhen}</small>
                </div>
              </div>
            </article>

            <article className="assistant-agent-detail-card">
              <div className="assistant-provider-head">
                <strong>{comparisonSummary.comparisonName}</strong>
                <span
                  className={`status-pill status-pill-${
                    formatAgentStatusTone(
                      resolvedComparisonAgentId === FOUNDATION_COMPARE_TARGET
                        ? 'FOUNDATION'
                        : comparisonAgent?.status ?? 'FOUNDATION',
                    )
                  }`}
                >
                  {resolvedComparisonAgentId === FOUNDATION_COMPARE_TARGET
                    ? 'FOUNDATION'
                    : comparisonAgent?.status ?? 'FOUNDATION'}
                </span>
              </div>
              <div className="assistant-agent-detail-stack">
                <div>
                  <strong>Best for</strong>
                  <small>{comparisonSummary.comparisonBestFor}</small>
                </div>
                <div>
                  <strong>Avoid when</strong>
                  <small>{comparisonSummary.comparisonAvoidWhen}</small>
                </div>
              </div>
            </article>
          </div>

          <div className="assistant-agent-compare-table">
            {comparisonSummary.rows.map((row) => (
              <article
                key={row.label}
                className={`assistant-agent-compare-row ${row.different ? 'is-different' : ''}`}
              >
                <strong>{row.label}</strong>
                <div className="assistant-agent-compare-cell">
                  <span>{comparisonSummary.primaryName}</span>
                  <p>{row.primary}</p>
                </div>
                <div className="assistant-agent-compare-cell">
                  <span>{comparisonSummary.comparisonName}</span>
                  <p>{row.comparison}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="assistant-agent-detail-grid">
          <article className="assistant-agent-detail-card">
            <div className="assistant-provider-head">
              <strong>Profile</strong>
              <span className={`status-pill status-pill-${selectedStatusTone}`}>
                {selectedAgent ? selectedAgent.status : 'FOUNDATION'}
              </span>
            </div>
            <p>
              {selectedAgent?.description ??
                'The shared assistant foundation layers in authenticated org, user, and application context before any named agent override is selected.'}
            </p>
            <div className="assistant-agent-field-list">
              <div className="assistant-agent-field">
                <span>Scope</span>
                <strong>{selectedAgent?.scope ?? 'Shared runtime'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Profile kind</span>
                <strong>{selectedAgent ? formatProfileKind(selectedAgent.profile_kind) : 'Foundation'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Role profile</span>
                <strong>{selectedAgent ? formatRoleKey(selectedAgent.role_key) : 'No named role pinned'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Owner role</span>
                <strong>{selectedAgent?.human_owner_role ?? 'Shared operator context'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Authority ceiling</span>
                <strong>{selectedAgent?.authority_ceiling ?? 'Prompt only'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Budget posture</span>
                <strong>{selectedAgent ? assistantBudgetSignalLabel(selectedAgent.token_budget) : 'Shared runtime'}</strong>
              </div>
            </div>
          </article>

          <article className="assistant-agent-detail-card">
            <div className="assistant-provider-head">
              <strong>Construction Recipe</strong>
              <span>{selectedAgent ? formatOrchestrationPattern(selectedAgent.orchestration_pattern) : 'Shared'}</span>
            </div>
            <p>
              {selectedAgent?.specialization_summary ??
                'No named role or specialization is pinned, so requests use the platform foundation prompt and the current runtime defaults.'}
            </p>
            <div className="assistant-agent-field-list">
              <div className="assistant-agent-field">
                <span>Provider</span>
                <strong>{selectedAgent?.provider ?? 'Runtime default'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Model</span>
                <strong>{selectedAgent?.model ?? 'Provider default'}</strong>
              </div>
              <div className="assistant-agent-field">
                <span>Capabilities</span>
                <strong>{selectedCapabilityLabels.join(' · ')}</strong>
              </div>
            </div>
            <small>
              {selectedAgent?.activation_notes ??
                'Shared foundation behavior can still be narrowed by provider choice, prompt preview, and live-tool toggles.'}
            </small>
          </article>

          <article className="assistant-agent-detail-card">
            <div className="assistant-provider-head">
              <strong>Skills</strong>
              <span>{selectedSkillLabels.length}</span>
            </div>
            <p>
              {selectedAgent
                ? 'Pinned reusable specialties that shape how this agent reasons, delegates, and frames work.'
                : 'Published reusable specialties are available to named agents as the managed roster grows.'}
            </p>
            <AssistantAgentChipList
              values={selectedSkillLabels}
              emptyLabel={
                selectedAgent
                  ? 'No explicit skill bundle is pinned for this profile.'
                  : 'No reusable skills are published yet.'
              }
            />
          </article>

          <article className="assistant-agent-detail-card">
            <div className="assistant-provider-head">
              <strong>Access Envelope</strong>
              <span>{selectedToolLabels.length} tools</span>
            </div>
            <p>{selectedAgentAccessSummary.summary}</p>
            <div className="assistant-agent-detail-stack">
              <div>
                <strong>Workspaces</strong>
                <AssistantAgentChipList
                  values={selectedWorkspaceLabels}
                  emptyLabel="No workspaces are currently scoped."
                />
              </div>
              <div>
                <strong>Live tools</strong>
                <AssistantAgentChipList
                  values={selectedToolLabels}
                  emptyLabel={selectedAgent ? 'No live tools granted.' : 'No published live tools are available.'}
                />
              </div>
              <div>
                <strong>Governed actions</strong>
                <AssistantAgentChipList
                  values={selectedActionLabels}
                  emptyLabel={
                    selectedAgent
                      ? 'No governed actions granted.'
                      : 'No governed action catalog is published yet.'
                  }
                />
              </div>
            </div>
          </article>

          <article className="assistant-agent-detail-card">
            <div className="assistant-provider-head">
              <strong>Hierarchy</strong>
              <span>{selectedAgent ? formatOrchestrationPattern(selectedAgent.orchestration_pattern) : 'Standalone'}</span>
            </div>
            <p>
              {selectedAgent
                ? selectedAgent.delegation_guidance?.trim() ||
                  'No explicit delegation guidance is pinned for this profile yet.'
                : 'No named parent or subordinate hierarchy applies while the platform foundation is selected.'}
            </p>
            <div className="assistant-agent-detail-stack">
              <div>
                <strong>Reports to</strong>
                {parentAgent ? (
                  <div className="assistant-agent-link-row">
                    <button
                      type="button"
                      className="assistant-run-link"
                      onClick={() => onSelectAgent(parentAgent.agent_id)}
                    >
                      {parentAgent.name}
                    </button>
                  </div>
                ) : (
                  <small>{selectedAgent ? 'No parent agent is wired to this profile.' : 'No parent agent applies.'}</small>
                )}
              </div>
              <div>
                <strong>Managed subordinates</strong>
                {managedAgents.length > 0 ? (
                  <div className="assistant-agent-link-row">
                    {managedAgents.map((agent) => (
                      <button
                        key={agent.agent_id}
                        type="button"
                        className="assistant-run-link"
                        onClick={() => onSelectAgent(agent.agent_id)}
                      >
                        {agent.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <small>
                    {selectedAgent
                      ? 'No subordinate agents are currently wired to this profile.'
                      : 'No subordinate agents apply.'}
                  </small>
                )}
              </div>
            </div>
          </article>

          <article className="assistant-agent-detail-card">
            <div className="assistant-provider-head">
              <strong>Governance</strong>
              <span className={`status-pill status-pill-${formatEvalGateTone(selectedAgent?.eval_gate?.status)}`}>
                {selectedAgent?.eval_gate?.status ?? 'FOUNDATION'}
              </span>
            </div>
            <p>{formatEvalGateSummary(selectedAgent)}</p>
            {selectedAgent ? (
              <>
                <div className={`assistant-budget-meter ${budgetClass}`} aria-hidden="true">
                  <span style={{ width: budgetMeterWidth(selectedAgent.token_budget) }} />
                </div>
                <small>{describeAssistantTokenBudget(selectedAgent.token_budget)}</small>
              </>
            ) : (
              <small>Platform foundation requests use the shared runtime budget rather than a named agent allocation.</small>
            )}
            <div className="assistant-agent-detail-stack">
              <div>
                <strong>Effective policy</strong>
                <small>{formatEffectivePolicySummary(selectedAgent)}</small>
              </div>
              {selectedAgent?.eval_gate ? (
                <div>
                  <strong>Eval coverage</strong>
                  <small>
                    {selectedAgent.eval_gate.missing_cases.length > 0
                      ? selectedAgent.eval_gate.missing_cases.join(' · ')
                      : selectedAgent.eval_gate.covered_cases.join(' · ') || 'No specific eval cases listed.'}
                  </small>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
