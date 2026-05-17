import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  listAssistantProfileRequests,
  submitAssistantAgentProfileRequest,
} from '../../entities/assistant/api'
import { workspaceLabel } from '../../entities/app/appViews'
import { appConfig } from '../../shared/config'
import type {
  AssistantActionType,
  AssistantAgent,
  AssistantAgentAuthorityLevel,
  AssistantAgentProfileRequest,
  AssistantAgentProfileRequestKind,
  AssistantAgentSkillKey,
  AssistantRuntimeSettings,
  ViewKey,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type AssistantAgentChangeRequestPanelProps = {
  authSession: StoredAuthSession | null
  agents: AssistantAgent[]
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
}

type ChangeRequestForm = {
  request_kind: AssistantAgentProfileRequestKind
  target_agent_id: string
  requested_agent_id: string
  change_summary: string
  business_problem: string
  proposed_mission: string
  human_owner_role: string
  requested_workspaces: ViewKey[]
  requested_inputs_tools: string[]
  requested_action_types: AssistantActionType[]
  requested_skills: AssistantAgentSkillKey[]
  work_objects: string
  expected_outputs: string
  requested_authority_ceiling: AssistantAgentAuthorityLevel
  stop_conditions: string
  success_metrics: string
  proposed_eval_cases: string
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
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

function requestKindLabel(kind: AssistantAgentProfileRequestKind): string {
  if (kind === 'EDIT_EXISTING') {
    return 'Edit existing agent'
  }
  if (kind === 'NARROW_ACCESS') {
    return 'Narrow access'
  }
  return 'New specialization'
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

function createFormFromAgent(
  selectedAgent: AssistantAgent | null,
  requestKind: AssistantAgentProfileRequestKind,
): ChangeRequestForm {
  if (!selectedAgent || requestKind === 'NEW_SPECIALIZATION') {
    return {
      request_kind: 'NEW_SPECIALIZATION',
      target_agent_id: '',
      requested_agent_id: '',
      change_summary: 'Request a new managed specialization for a workflow the current roster does not cover well.',
      business_problem: '',
      proposed_mission: '',
      human_owner_role: selectedAgent?.human_owner_role ?? '',
      requested_workspaces: ['assistant'],
      requested_inputs_tools: [],
      requested_action_types: [],
      requested_skills: [],
      work_objects: 'assistant agent profile',
      expected_outputs: 'Reviewed specialization brief\nDraft builder-ready mission',
      requested_authority_ceiling: 'DRAFT',
      stop_conditions:
        'Stop if the mission belongs in an existing role archetype.\nStop if ownership or authority is unclear.',
      success_metrics:
        'Clarify why a new specialization is needed.\nKeep the request reviewable before any activation.',
      proposed_eval_cases:
        'Confirms the requested specialization stays inside its proposed authority boundary.',
    }
  }

  const narrow = requestKind === 'NARROW_ACCESS'
  return {
    request_kind: requestKind,
    target_agent_id: selectedAgent.agent_id,
    requested_agent_id: '',
    change_summary: narrow
      ? `Narrow ${selectedAgent.name}'s scope, access, or authority to a safer reviewed envelope.`
      : `Adjust ${selectedAgent.name}'s mission, access, or construction recipe through the governed review lane.`,
    business_problem: narrow
      ? `${selectedAgent.name} currently has broader access than this workflow needs.`
      : `${selectedAgent.name} needs a reviewed change to better fit the operator workflow.`,
    proposed_mission: selectedAgent.specialization_summary ?? selectedAgent.description,
    human_owner_role: selectedAgent.human_owner_role ?? '',
    requested_workspaces: [...selectedAgent.allowed_workspaces],
    requested_inputs_tools: [...selectedAgent.allowed_tools],
    requested_action_types: [...selectedAgent.allowed_action_types],
    requested_skills: [...selectedAgent.skills],
    work_objects: 'assistant agent profile',
    expected_outputs: narrow
      ? `Reduced access envelope for ${selectedAgent.name}\nReview-ready change summary`
      : `Reviewed update plan for ${selectedAgent.name}\nBuilder-ready or revision-ready diff summary`,
    requested_authority_ceiling: selectedAgent.authority_ceiling ?? 'DRAFT',
    stop_conditions:
      'Stop if the requested change would exceed current reviewed authority.\nStop if the target agent mission or ownership is unclear.',
    success_metrics:
      'Keep agent changes reviewable through the managed-agent queue.\nReduce confusion about what this agent should do or access.',
    proposed_eval_cases:
      'Confirms the requested agent change still respects reviewed authority and stop conditions.',
  }
}

export function AssistantAgentChangeRequestPanel({
  authSession,
  agents,
  runtimeSettings,
  selectedAgentId,
  onSelectAgent,
}: AssistantAgentChangeRequestPanelProps) {
  const selectedAgent = agents.find((agent) => agent.agent_id === selectedAgentId) ?? null
  const [requests, setRequests] = useState<AssistantAgentProfileRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<ChangeRequestForm>(() =>
    createFormFromAgent(selectedAgent, selectedAgent ? 'EDIT_EXISTING' : 'NEW_SPECIALIZATION'),
  )

  const availableSkills = runtimeSettings?.available_skills ?? []
  const availableTools = runtimeSettings?.available_tools ?? []
  const availableActions = runtimeSettings?.available_action_types ?? []
  const pendingCount = requests.filter((request) => request.status === 'REQUESTED').length

  const refreshRequests = useCallback(async () => {
    if (!authSession) {
      setRequests([])
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const payload = await listAssistantProfileRequests(appConfig.apiBase, {
        accessToken: authSession.accessToken,
        limit: 12,
      })
      setRequests(payload)
      setError('')
    } catch (requestError) {
      setRequests([])
      setError(requestError instanceof Error ? requestError.message : 'Could not load change requests.')
    } finally {
      setLoading(false)
    }
  }, [authSession])

  useEffect(() => {
    void refreshRequests()
  }, [refreshRequests])

  useEffect(() => {
    if (form.request_kind === 'NEW_SPECIALIZATION') {
      return
    }
    if (selectedAgent && !form.target_agent_id) {
      setForm(createFormFromAgent(selectedAgent, form.request_kind))
    }
  }, [form.request_kind, form.target_agent_id, selectedAgent])

  const requestReady = useMemo(() => {
    return Boolean(
      authSession &&
        form.change_summary.trim() &&
        form.business_problem.trim() &&
        form.proposed_mission.trim() &&
        (form.request_kind === 'NEW_SPECIALIZATION' || form.target_agent_id.trim()) &&
        form.human_owner_role.trim(),
    )
  }, [authSession, form])

  function setRequestKind(nextKind: AssistantAgentProfileRequestKind) {
    const targetAgent =
      nextKind === 'NEW_SPECIALIZATION'
        ? null
        : agents.find((agent) => agent.agent_id === (form.target_agent_id || selectedAgentId)) ?? selectedAgent
    setForm(createFormFromAgent(targetAgent, nextKind))
    setFlash(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!requestReady) {
      setFlash({
        tone: 'error',
        message: 'Complete the change summary, business problem, mission, owner, and target selection before submitting.',
      })
      return
    }

    setSubmitting(true)
    setFlash(null)
    try {
      const created = await submitAssistantAgentProfileRequest(appConfig.apiBase, {
        request_kind: form.request_kind,
        target_agent_id: form.target_agent_id.trim() || null,
        requested_agent_id: form.requested_agent_id.trim() || null,
        change_summary: form.change_summary,
        business_problem: form.business_problem,
        proposed_mission: form.proposed_mission,
        human_owner_role: form.human_owner_role,
        requested_workspaces: form.requested_workspaces,
        work_objects: splitLines(form.work_objects),
        requested_inputs_tools: form.requested_inputs_tools,
        requested_action_types: form.requested_action_types,
        requested_skills: form.requested_skills,
        expected_outputs: splitLines(form.expected_outputs),
        requested_authority_ceiling: form.requested_authority_ceiling,
        stop_conditions: splitLines(form.stop_conditions),
        success_metrics: splitLines(form.success_metrics),
        proposed_eval_cases: splitLines(form.proposed_eval_cases),
      })
      setForm(
        createFormFromAgent(
          selectedAgent,
          form.request_kind === 'NEW_SPECIALIZATION' ? 'NEW_SPECIALIZATION' : form.request_kind,
        ),
      )
      await refreshRequests()
      setFlash({
        tone: 'success',
        message: `Change request #${created.request_id} is queued for admin review.`,
      })
    } catch (submitError) {
      setFlash({
        tone: 'error',
        message: submitError instanceof Error ? submitError.message : 'Could not submit change request.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function toggleSelection<T extends string>(values: readonly T[], value: T): T[] {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
  }

  return (
    <section className="assistant-agent-change-panel">
      <div className="assistant-agent-directory-head">
        <div>
          <span className="eyebrow">Governed Requests</span>
          <h4>Suggest agent changes</h4>
        </div>
        <p>
          Submit reviewable requests for new specializations, existing-agent edits, or narrower access
          without needing admin mutation rights.
        </p>
      </div>

      {!authSession ? (
        <div className="assistant-agent-change-empty">
          <strong>Sign in to submit governed change requests</strong>
          <p>The request queue is tied to the authenticated operator and reviewed through the admin agent workflow.</p>
        </div>
      ) : (
        <div className="assistant-agent-change-grid">
          <form className="assistant-agent-change-form" onSubmit={handleSubmit}>
            <div className="assistant-agent-change-kind-row">
              {(['EDIT_EXISTING', 'NARROW_ACCESS', 'NEW_SPECIALIZATION'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`button ${form.request_kind === kind ? 'button-secondary' : 'button-ghost'}`}
                  onClick={() => setRequestKind(kind)}
                >
                  {requestKindLabel(kind)}
                </button>
              ))}
            </div>

            <div className="assistant-agent-change-form-grid">
              <label className="field">
                <span>Request type</span>
                <select
                  className="control"
                  value={form.request_kind}
                  onChange={(event) =>
                    setRequestKind(event.target.value as AssistantAgentProfileRequestKind)
                  }
                >
                  <option value="EDIT_EXISTING">Edit existing agent</option>
                  <option value="NARROW_ACCESS">Narrow access</option>
                  <option value="NEW_SPECIALIZATION">New specialization</option>
                </select>
              </label>

              {form.request_kind === 'NEW_SPECIALIZATION' ? (
                <label className="field">
                  <span>Requested Agent ID</span>
                  <input
                    className="control"
                    value={form.requested_agent_id}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, requested_agent_id: event.target.value }))
                    }
                    placeholder="weather-dispatch-analyst"
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Target agent</span>
                  <select
                    className="control"
                    value={form.target_agent_id}
                    onChange={(event) => {
                      const nextAgent =
                        agents.find((agent) => agent.agent_id === event.target.value) ?? null
                      setForm(createFormFromAgent(nextAgent, form.request_kind))
                    }}
                  >
                    <option value="" disabled>
                      Select managed agent
                    </option>
                    {agents.map((agent) => (
                      <option key={agent.agent_id} value={agent.agent_id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="field">
                <span>Human owner role</span>
                <input
                  className="control"
                  value={form.human_owner_role}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, human_owner_role: event.target.value }))
                  }
                  placeholder="Operations Lead"
                />
              </label>

              <label className="field">
                <span>Requested authority</span>
                <select
                  className="control"
                  value={form.requested_authority_ceiling}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      requested_authority_ceiling: event.target.value as AssistantAgentAuthorityLevel,
                    }))
                  }
                >
                  {['OBSERVE', 'EXPLAIN', 'DRAFT', 'STAGE', 'EXECUTE', 'EXTERNAL_COMMIT'].map((authority) => (
                    <option key={authority} value={authority}>
                      {authority}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Change summary</span>
              <textarea
                className="control"
                value={form.change_summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, change_summary: event.target.value }))
                }
                placeholder="Describe the reviewed change you want an admin to consider."
              />
            </label>

            <label className="field">
              <span>Business problem</span>
              <textarea
                className="control"
                value={form.business_problem}
                onChange={(event) =>
                  setForm((current) => ({ ...current, business_problem: event.target.value }))
                }
                placeholder="What workflow problem or trust issue should this request solve?"
              />
            </label>

            <label className="field">
              <span>Proposed mission</span>
              <textarea
                className="control"
                value={form.proposed_mission}
                onChange={(event) =>
                  setForm((current) => ({ ...current, proposed_mission: event.target.value }))
                }
                placeholder="What should the resulting agent do, and where should it stop?"
              />
            </label>

            <div className="assistant-agent-change-option-grid">
              <div className="assistant-agent-change-option-group">
                <strong>Workspaces</strong>
                <div className="assistant-agent-chip-list">
                  {(['assistant', 'guide', 'dashboard', 'trades', 'events', 'positions', 'reference', 'operations', 'settlement', 'admin', 'settings'] as ViewKey[]).map(
                    (workspace) => (
                      <button
                        key={workspace}
                        type="button"
                        className={`entity-chip ${
                          form.requested_workspaces.includes(workspace) ? '' : 'entity-chip-soft'
                        }`}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            requested_workspaces: toggleSelection(current.requested_workspaces, workspace),
                          }))
                        }
                      >
                        {workspaceLabel(workspace)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="assistant-agent-change-option-group">
                <strong>Live tools</strong>
                <div className="assistant-agent-chip-list">
                  {availableTools.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      className={`entity-chip ${
                        form.requested_inputs_tools.includes(tool.name) ? '' : 'entity-chip-soft'
                      }`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          requested_inputs_tools: toggleSelection(current.requested_inputs_tools, tool.name),
                        }))
                      }
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="assistant-agent-change-option-group">
                <strong>Skills</strong>
                <div className="assistant-agent-chip-list">
                  {availableSkills.map((skill) => (
                    <button
                      key={skill.name}
                      type="button"
                      className={`entity-chip ${
                        form.requested_skills.includes(skill.name) ? '' : 'entity-chip-soft'
                      }`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          requested_skills: toggleSelection(current.requested_skills, skill.name),
                        }))
                      }
                    >
                      {skill.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="assistant-agent-change-option-group">
                <strong>Governed actions</strong>
                <div className="assistant-agent-chip-list">
                  {availableActions.map((action) => (
                    <button
                      key={action.name}
                      type="button"
                      className={`entity-chip ${
                        form.requested_action_types.includes(action.name) ? '' : 'entity-chip-soft'
                      }`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          requested_action_types: toggleSelection(current.requested_action_types, action.name),
                        }))
                      }
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="assistant-agent-change-form-grid">
              <label className="field">
                <span>Work objects</span>
                <textarea
                  className="control"
                  value={form.work_objects}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, work_objects: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Expected outputs</span>
                <textarea
                  className="control"
                  value={form.expected_outputs}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expected_outputs: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Stop conditions</span>
                <textarea
                  className="control"
                  value={form.stop_conditions}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, stop_conditions: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Success metrics</span>
                <textarea
                  className="control"
                  value={form.success_metrics}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, success_metrics: event.target.value }))
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>Proposed eval cases</span>
              <textarea
                className="control"
                value={form.proposed_eval_cases}
                onChange={(event) =>
                  setForm((current) => ({ ...current, proposed_eval_cases: event.target.value }))
                }
              />
            </label>

            {flash ? (
              <p className={`form-note ${flash.tone === 'error' ? 'form-note-error' : ''}`}>
                {flash.message}
              </p>
            ) : null}

            <div className="toolbar settings-actions">
              <button
                type="submit"
                className="button button-secondary"
                disabled={!requestReady || submitting}
              >
                {submitting ? 'Submitting request...' : 'Submit request'}
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() =>
                  setForm(
                    createFormFromAgent(
                      selectedAgent,
                      form.request_kind === 'NEW_SPECIALIZATION' ? 'NEW_SPECIALIZATION' : form.request_kind,
                    ),
                  )
                }
              >
                Reset form
              </button>
            </div>
          </form>

          <div className="assistant-agent-request-list">
            <div className="assistant-provider-head">
              <strong>My requests</strong>
              <span>{pendingCount} pending</span>
            </div>
            {loading ? <p>Loading your governed change requests.</p> : null}
            {error ? <p>{error}</p> : null}
            {!loading && !error && requests.length === 0 ? (
              <div className="assistant-agent-change-empty">
                <strong>No governed requests yet</strong>
                <p>Your submitted change requests will appear here for follow-up and review status.</p>
              </div>
            ) : null}
            {requests.map((request) => (
              <article key={request.request_id} className="assistant-agent-request-card">
                <div className="assistant-provider-head">
                  <strong>
                    #{request.request_id} {titleFromAgentId(request.requested_agent_id || request.target_agent_id)}
                  </strong>
                  <span className={`status-pill status-pill-${profileRequestStatusTone(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                <small>{requestKindLabel(request.request_kind)}</small>
                {request.change_summary ? <p>{request.change_summary}</p> : null}
                <small>
                  {request.requested_workspaces.map((workspace) => workspaceLabel(workspace)).join(' · ')}
                </small>
                <small>
                  {request.requested_inputs_tools.length} tool · {request.requested_action_types.length} action ·{' '}
                  {request.requested_skills.length} skill
                </small>
                <small>
                  {request.rejection_reason || request.approval_notes || 'Awaiting admin review.'}
                </small>
                {request.linked_revision_id ? (
                  <small>
                    Applied to {titleFromAgentId(request.linked_agent_id)} through reviewed revision #
                    {request.linked_revision_id}.
                  </small>
                ) : request.status === 'APPROVED' ? (
                  <small>Approved. Admin must save a linked agent revision before marking it applied.</small>
                ) : null}
                {request.linked_agent_id || request.target_agent_id ? (
                  <div className="toolbar">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => onSelectAgent(request.linked_agent_id || request.target_agent_id || '')}
                    >
                      Open agent
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
