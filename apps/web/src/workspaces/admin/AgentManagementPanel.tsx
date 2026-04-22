import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildAssistantAgentDraft,
  createAssistantAgent,
  listAdminAssistantAgents,
  loadAssistantRuntimeSettings,
  updateAssistantAgent,
  type CreateAssistantAgentInput,
  type UpdateAssistantAgentInput,
} from '../../entities/assistant/api'
import {
  assistantBudgetSignalClass,
  assistantBudgetSignalLabel,
  budgetMeterWidth,
  describeAssistantTokenBudget,
  formatBudgetPercent,
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
  AssistantAgentCapability,
  AssistantAgentScope,
  AssistantAgentStatus,
  AssistantProvider,
  AssistantProviderStatus,
  ViewKey,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  AGENT_BUILDER_TEMPLATES,
  AGENT_BUILDER_WORKSPACE_OPTIONS,
  buildAgentBuilderDraft,
  createEmptyAgentBuilderDraft,
  getAgentBuilderTemplate,
  suggestAgentBuilderAgentId,
  type AgentBuilderDraft,
  type AgentBuilderTemplateKey,
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

const STATUS_OPTIONS: AssistantAgentStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED']
const SCOPE_OPTIONS: AssistantAgentScope[] = ['PERSONAL', 'TEAM', 'ORGANIZATION']
const PROVIDER_OPTIONS: Array<AssistantProvider | ''> = ['', 'openai', 'anthropic', 'google']
const WORKSPACE_OPTIONS: ViewKey[] = AGENT_BUILDER_WORKSPACE_OPTIONS
const CAPABILITY_OPTIONS: AssistantAgentCapability[] = ['READ', 'EXPLAIN', 'DRAFT', 'ACTION']
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
  if (availableTools.length > 0) {
    return 'No subset pinned, so the agent can inherit the full published read-only tool catalog.'
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
  return 'No subset pinned, so this agent can inherit the full published approval-gated action catalog.'
}

export function AgentManagementPanel({
  authSession,
  formatDate,
  onOpenSettings,
}: AgentManagementPanelProps) {
  const requestSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [agentRecords, setAgentRecords] = useState<AssistantAdminAgent[]>([])
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const [agentFlash, setAgentFlash] = useState<FlashMessage | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedCreateTemplateKey, setSelectedCreateTemplateKey] =
    useState<AgentBuilderTemplateKey | null>(null)
  const [createForm, setCreateForm] = useState<AgentForm>(() => createEmptyAgentBuilderDraft())
  const [editForm, setEditForm] = useState<AgentForm>(() => createEmptyAgentBuilderDraft())
  const [builderBrief, setBuilderBrief] = useState('')
  const [builderWarnings, setBuilderWarnings] = useState<string[]>([])
  const [openAiProviderStatus, setOpenAiProviderStatus] = useState<AssistantProviderStatus | null>(null)
  const [buildingAgentDraft, setBuildingAgentDraft] = useState(false)
  const [seedingRecommendedAgents, setSeedingRecommendedAgents] = useState(false)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [savingAgent, setSavingAgent] = useState(false)

  const selectedAgent = useMemo(
    () => agentRecords.find((agent) => agent.agent_id === selectedAgentId) ?? null,
    [agentRecords, selectedAgentId],
  )
  const selectedCreateTemplate = useMemo(
    () => (selectedCreateTemplateKey ? getAgentBuilderTemplate(selectedCreateTemplateKey) : null),
    [selectedCreateTemplateKey],
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
        const [nextAgents, runtimeSettings] = await Promise.all([
          listAdminAssistantAgents(appConfig.apiBase),
          loadAssistantRuntimeSettings(appConfig.apiBase),
        ])
        if (requestSequenceRef.current !== requestId) {
          return
        }
        setAgentRecords(nextAgents)
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
      } catch (error) {
        if (requestSequenceRef.current !== requestId) {
          return
        }
        setAgentRecords([])
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
      setAvailableTools([])
      setAgentsError('')
      setAgentsLoading(false)
      setSelectedAgentId(null)
      setSelectedCreateTemplateKey(null)
      setCreateForm(createEmptyAgentBuilderDraft())
      setEditForm(createEmptyAgentBuilderDraft())
      setBuilderBrief('')
      setBuilderWarnings([])
      setOpenAiProviderStatus(null)
      setBuildingAgentDraft(false)
      setSeedingRecommendedAgents(false)
      return
    }

    void refreshAgents()
  }, [adminEnabled, refreshAgents])

  useEffect(() => {
    if (!selectedAgent) {
      setEditForm(createEmptyAgentBuilderDraft())
      return
    }
    setEditForm(toAgentForm(selectedAgent))
  }, [selectedAgent])

  function handleApplyCreateTemplate(templateKey: AgentBuilderTemplateKey) {
    setAgentFlash(null)
    setBuilderWarnings([])
    setSelectedCreateTemplateKey(templateKey)
    setCreateForm(buildAgentBuilderDraft(templateKey, availableTools))
    setBuilderBrief((current) =>
      current.trim()
        ? current
        : `Build a managed agent for ${getAgentBuilderTemplate(templateKey).best_for.toLowerCase()}.`,
    )
  }

  function handleResetCreateForm() {
    setAgentFlash(null)
    setSelectedCreateTemplateKey(null)
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

  async function handleCreateAgent(event: React.FormEvent) {
    event.preventDefault()
    setCreatingAgent(true)
    setAgentFlash(null)

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

    setSavingAgent(true)
    setAgentFlash(null)

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
          </div>

          {agentsLoading ? <div className="feedback-banner feedback-banner-success">Loading assistant agents from Admin...</div> : null}
          {agentsError ? <div className="feedback-banner feedback-banner-error">{agentsError}</div> : null}
          {agentFlash ? (
            <div className={`feedback-banner ${agentFlash.tone === 'error' ? 'feedback-banner-error' : 'feedback-banner-success'}`}>
              {agentFlash.message}
            </div>
          ) : null}

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
                          {agent.provider ? ` · ${agent.provider}` : ' · inherited provider'}
                          {agent.model ? ` · ${agent.model}` : ''}
                          {agent.allowed_tools.length > 0 ? ` · ${agent.allowed_tools.length} live tools` : ''}
                          {agent.allowed_action_types.length > 0 ? ` · ${agent.allowed_action_types.length} actions` : ''}
                        </small>
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
                                ? 'Full published read-only catalog'
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
                                ? 'Full approval-gated action catalog on save'
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
                      Leave blank to inherit the platform default; set 0 to hold the agent in the red.
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
                        ? 'Choose a subset or leave blank to allow the full published read-only tool catalog.'
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
                  <button type="submit" className="button button-primary" disabled={creatingAgent}>
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
                      Leave blank to inherit the platform default; set 0 to stop this agent immediately.
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
                        ? 'Choose a subset or leave blank to allow the full published read-only tool catalog.'
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
                  <button type="submit" className="button button-primary" disabled={savingAgent}>
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
