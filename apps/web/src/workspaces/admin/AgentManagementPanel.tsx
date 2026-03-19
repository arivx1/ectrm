import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createAssistantAgent,
  listAdminAssistantAgents,
  loadAssistantRuntimeSettings,
  updateAssistantAgent,
  type CreateAssistantAgentInput,
  type UpdateAssistantAgentInput,
} from '../../entities/assistant/api'
import { appConfig } from '../../shared/config'
import type {
  AssistantAdminAgent,
  AssistantAgentCapability,
  AssistantAgentScope,
  AssistantAgentStatus,
  AssistantProvider,
  ViewKey,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type AgentManagementPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AgentForm = {
  agent_id: string
  name: string
  description: string
  status: AssistantAgentStatus
  scope: AssistantAgentScope
  provider: AssistantProvider | ''
  model: string
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  allowed_tools: string[]
  system_prompt: string
}

const STATUS_OPTIONS: AssistantAgentStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED']
const SCOPE_OPTIONS: AssistantAgentScope[] = ['PERSONAL', 'TEAM', 'ORGANIZATION']
const PROVIDER_OPTIONS: Array<AssistantProvider | ''> = ['', 'openai', 'anthropic', 'google']
const WORKSPACE_OPTIONS: ViewKey[] = [
  'dashboard',
  'guide',
  'trades',
  'events',
  'positions',
  'reference',
  'admin',
  'settings',
  'assistant',
]
const CAPABILITY_OPTIONS: AssistantAgentCapability[] = ['READ', 'EXPLAIN', 'DRAFT', 'ACTION']

const EMPTY_AGENT_FORM: AgentForm = {
  agent_id: '',
  name: '',
  description: '',
  status: 'DRAFT',
  scope: 'TEAM',
  provider: '',
  model: '',
  allowed_workspaces: ['assistant'],
  capabilities: ['READ', 'EXPLAIN'],
  allowed_tools: [],
  system_prompt: '',
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
    system_prompt: agent.system_prompt,
  }
}

function normalizeAgentPayload(form: AgentForm): CreateAssistantAgentInput {
  const normalizedProvider = form.provider || null
  const normalizedModel = form.model.trim() ? form.model.trim() : null

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
    system_prompt: form.system_prompt.trim(),
  }
}

function toggleSelection<T extends string>(current: T[], value: T): T[] {
  if (current.includes(value)) {
    return current.length === 1 ? current : current.filter((entry) => entry !== value)
  }
  return [...current, value]
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
  const [createForm, setCreateForm] = useState<AgentForm>(EMPTY_AGENT_FORM)
  const [editForm, setEditForm] = useState<AgentForm>(EMPTY_AGENT_FORM)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [savingAgent, setSavingAgent] = useState(false)

  const selectedAgent = useMemo(
    () => agentRecords.find((agent) => agent.agent_id === selectedAgentId) ?? null,
    [agentRecords, selectedAgentId],
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
  const createCanUseLiveTools = createForm.capabilities.includes('READ')
  const editCanUseLiveTools = editForm.capabilities.includes('READ')

  async function refreshAgents(preferredAgentId: string | null = null) {
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
      setSelectedAgentId(null)
      setAgentsError(error instanceof Error ? error.message : 'Could not load assistant agents.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setAgentsLoading(false)
      }
    }
  }

  useEffect(() => {
    requestSequenceRef.current += 1
    setAgentFlash(null)

    if (!adminEnabled) {
      setAgentRecords([])
      setAvailableTools([])
      setAgentsError('')
      setAgentsLoading(false)
      setSelectedAgentId(null)
      setCreateForm(EMPTY_AGENT_FORM)
      setEditForm(EMPTY_AGENT_FORM)
      return
    }

    void refreshAgents()
  }, [adminEnabled])

  useEffect(() => {
    if (!selectedAgent) {
      setEditForm(EMPTY_AGENT_FORM)
      return
    }
    setEditForm(toAgentForm(selectedAgent))
  }, [selectedAgent])

  async function handleCreateAgent(event: React.FormEvent) {
    event.preventDefault()
    setCreatingAgent(true)
    setAgentFlash(null)

    try {
      const payload = normalizeAgentPayload(createForm)
      const created = await createAssistantAgent(appConfig.apiBase, payload)
      setCreateForm(EMPTY_AGENT_FORM)
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
                  agentRecords.map((agent) => (
                    <button
                      key={agent.agent_id}
                      type="button"
                      className={`assistant-admin-agent-card ${selectedAgent?.agent_id === agent.agent_id ? 'is-selected' : ''}`}
                      onClick={() => {
                        setAgentFlash(null)
                        setSelectedAgentId(agent.agent_id)
                      }}
                    >
                      <div className="assistant-provider-head">
                        <strong>{agent.name}</strong>
                        <span className={`status-pill status-pill-${statusTone(agent.status)}`}>{agent.status}</span>
                      </div>
                      <p>{agent.description}</p>
                      <small>
                        {agent.scope}
                        {agent.provider ? ` · ${agent.provider}` : ' · inherited provider'}
                        {agent.model ? ` · ${agent.model}` : ''}
                        {agent.allowed_tools.length > 0 ? ` · ${agent.allowed_tools.length} live tools` : ''}
                      </small>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Create</span>
                  <h4>New Agent</h4>
                </div>
                <span>Draft first, publish when ready</span>
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
                  </label>
                  <label className="field">
                    <span>Name</span>
                    <input
                      className="control"
                      value={createForm.name}
                      onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
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
                          onClick={() =>
                            setCreateForm((current) => ({
                              ...current,
                              allowed_workspaces: toggleSelection(current.allowed_workspaces, workspace),
                            }))
                          }
                        >
                          {workspace}
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
                          onClick={() =>
                            setCreateForm((current) => ({
                              ...current,
                              capabilities: toggleSelection(current.capabilities, capability),
                            }))
                          }
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

                </div>

                <label className="field">
                  <span>System prompt</span>
                  <textarea
                    className="control assistant-admin-prompt"
                    value={createForm.system_prompt}
                    onChange={(event) => setCreateForm((current) => ({ ...current, system_prompt: event.target.value }))}
                    placeholder="Define the agent's operating instructions, tone, and boundaries."
                  />
                </label>

                <div className="toolbar settings-actions">
                  <button type="submit" className="button button-primary" disabled={creatingAgent}>
                    {creatingAgent ? 'Creating Agent...' : 'Create Agent'}
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
                  ? `Updated ${formatDate(selectedAgent.updated_at)} by ${selectedAgent.updated_by}`
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
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              allowed_workspaces: toggleSelection(current.allowed_workspaces, workspace),
                            }))
                          }
                        >
                          {workspace}
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
                          onClick={() =>
                            setEditForm((current) => ({
                              ...current,
                              capabilities: toggleSelection(current.capabilities, capability),
                            }))
                          }
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
