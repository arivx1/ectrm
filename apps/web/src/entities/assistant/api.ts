import {
  createApiError,
  fetchJson,
  getResponseCorrelationId,
  patchJson,
  postFormData,
  postJson,
  putJson,
  requestOk,
} from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import type {
  AssistantActionRequest,
  AssistantActionRequestAdminPage,
  AssistantActionRequestStatus,
  AssistantActionType,
  AssistantAdminAgent,
  AssistantAgent,
  AssistantAgentHealthReview,
  AssistantAgentRevision,
  AssistantAgentSelfUpdateDraft,
  AssistantAgentWorkPackage,
  AssistantAgentWorkPackageStatus,
  AssistantAgentEval,
  AssistantAgentEvalRun,
  AssistantAutonomyReviewBrief,
  AssistantActionReviewOutcome,
  AssistantAgentProfileRequest,
  AssistantAgentRoleArchetype,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantControlTowerSummary,
  AssistantOutcomeMetrics,
  AssistantPolicySimulation,
  AssistantPolicySimulationPhase,
  AssistantPromptNavigationOutcome,
  AssistantPromptNavigationOutcomeStatus,
  AssistantPromptRouteRecommendation,
  AssistantPromptNavigationSurface,
  AssistantPromptContext,
  AssistantPromptContextRequest,
  AssistantPromptRequest,
  AssistantPromptResponse,
  AssistantProvider,
  AssistantRunFeedback,
  AssistantRunFeedbackRating,
  AssistantRun,
  AssistantRunAuditTrace,
  AssistantRunSummary,
  AssistantRuntimeSettings,
  AssistantVoiceTranscription,
  ViewKey,
} from '../../shared/models'

export type CreateAssistantAgentInput = {
  agent_id: string
  name: string
  description: string
  status: AssistantAdminAgent['status']
  scope: AssistantAdminAgent['scope']
  provider: AssistantAdminAgent['provider']
  model: AssistantAdminAgent['model']
  role_key?: AssistantAdminAgent['role_key']
  profile_kind?: AssistantAdminAgent['profile_kind']
  specialization_summary?: AssistantAdminAgent['specialization_summary']
  human_owner_role?: AssistantAdminAgent['human_owner_role']
  authority_ceiling?: AssistantAdminAgent['authority_ceiling']
  activation_notes?: AssistantAdminAgent['activation_notes']
  orchestration_pattern?: AssistantAdminAgent['orchestration_pattern']
  parent_agent_id?: AssistantAdminAgent['parent_agent_id']
  managed_agent_ids?: AssistantAdminAgent['managed_agent_ids']
  delegation_guidance?: AssistantAdminAgent['delegation_guidance']
  profile_request_id?: AssistantAdminAgent['profile_request_id']
  allowed_workspaces: AssistantAdminAgent['allowed_workspaces']
  capabilities: AssistantAdminAgent['capabilities']
  skills: AssistantAdminAgent['skills']
  allowed_tools: AssistantAdminAgent['allowed_tools']
  allowed_action_types: AssistantAdminAgent['allowed_action_types']
  daily_token_allocation?: AssistantAdminAgent['daily_token_allocation']
  system_prompt: string
}

export type UpdateAssistantAgentInput = Omit<CreateAssistantAgentInput, 'agent_id'>

export type CreateAssistantAgentProfileRequestInput = {
  requested_agent_id?: string | null
  business_problem: string
  proposed_mission: string
  human_owner_role: string
  requested_workspaces: AssistantAdminAgent['allowed_workspaces']
  work_objects: string[]
  requested_inputs_tools: string[]
  expected_outputs: string[]
  requested_authority_ceiling: NonNullable<AssistantAdminAgent['authority_ceiling']>
  stop_conditions: string[]
  success_metrics: string[]
  proposed_eval_cases: string[]
}

export type DecideAssistantAgentProfileRequestInput = {
  reviewed_by?: string
  approval_notes?: string
  rejection_reason?: string
}

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
    skills?: AssistantAdminAgent['skills']
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

export type GenerateAssistantAgentSelfUpdateDraftInput = {
  brief?: string
}

export type PublishAssistantAgentRevisionInput = {
  revisionId: number
}

export type AssistantStreamEvent = {
  event: string
  data: Record<string, unknown>
}

export type SubmitAssistantRunFeedbackInput = {
  rating: AssistantRunFeedbackRating
  comment?: string
}

export type SubmitAssistantPromptNavigationOutcomeInput = {
  surface?: AssistantPromptNavigationSurface
  outcome: AssistantPromptNavigationOutcomeStatus
  intentKey: string
  targetView?: ViewKey
  targetLabel?: string
  targetRationale?: string
  focusType?: 'trade' | 'workflow_item' | 'document' | 'invoice' | 'payment' | 'reference_record' | 'report'
  focusId?: string
  focusLabel?: string
  detail?: string
}

export type AssistantActionDecisionInput = {
  reviewOutcome?: AssistantActionReviewOutcome
  decisionNote?: string
  correctionSummary?: string
  correctionFields?: string[]
}

export type SimulateAssistantAgentPolicyInput = {
  workspace: ViewKey
  prompt?: string
  context?: string
  actorRole?: string
  phase?: AssistantPolicySimulationPhase
}

export type CreateAssistantAgentEvalInput = {
  agent_id: string
  name: string
  workspace: ViewKey
  prompt: string
  context?: string | null
  use_live_tools: boolean
  expected_substrings: string[]
  expected_tool_names: string[]
  expected_action_types: AssistantActionType[]
}

export type UpdateAssistantAgentEvalInput = Omit<CreateAssistantAgentEvalInput, 'agent_id'>

export type AcceptAssistantAgentWorkPackageInput = {
  acceptedBy?: string
  notes?: string
  createdAfter?: string
  createdBefore?: string
}

export type UpdateAssistantAgentWorkPackageInput = {
  status: AssistantAgentWorkPackageStatus
  updatedBy?: string
  notes?: string
  implementationEvidence?: {
    prUrl?: string
    commitSha?: string
    evalIds?: number[]
    testNames?: string[]
    docPaths?: string[]
    owner?: string
  }
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
  actionType?: string
  agentId?: string
  roleKey?: string
  profileKind?: string
  userId?: string
  decidedBy?: string
  search?: string
  createdAfter?: string
  createdBefore?: string
  decidedAfter?: string
  decidedBefore?: string
  limit?: number
  offset?: number
}): string {
  const params = new URLSearchParams()
  if (init?.status) {
    params.set('status', init.status)
  }
  if (init?.actionType?.trim()) {
    params.set('action_type', init.actionType.trim())
  }
  if (init?.agentId?.trim()) {
    params.set('agent_id', init.agentId.trim())
  }
  if (init?.roleKey?.trim()) {
    params.set('role_key', init.roleKey.trim())
  }
  if (init?.profileKind?.trim()) {
    params.set('profile_kind', init.profileKind.trim())
  }
  if (init?.userId?.trim()) {
    params.set('user_id', init.userId.trim())
  }
  if (init?.decidedBy?.trim()) {
    params.set('decided_by', init.decidedBy.trim())
  }
  if (init?.search?.trim()) {
    params.set('search', init.search.trim())
  }
  if (init?.createdAfter?.trim()) {
    params.set('created_after', init.createdAfter.trim())
  }
  if (init?.createdBefore?.trim()) {
    params.set('created_before', init.createdBefore.trim())
  }
  if (init?.decidedAfter?.trim()) {
    params.set('decided_after', init.decidedAfter.trim())
  }
  if (init?.decidedBefore?.trim()) {
    params.set('decided_before', init.decidedBefore.trim())
  }
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  if (typeof init?.offset === 'number') {
    params.set('offset', String(init.offset))
  }
  return params.size > 0 ? `?${params.toString()}` : ''
}

function outcomeMetricsQuery(init?: {
  agentId?: string
  actionType?: string
  roleKey?: string
  profileKind?: string
  createdAfter?: string
  createdBefore?: string
}): string {
  const params = new URLSearchParams()
  if (init?.agentId?.trim()) {
    params.set('agent_id', init.agentId.trim())
  }
  if (init?.actionType?.trim()) {
    params.set('action_type', init.actionType.trim())
  }
  if (init?.roleKey?.trim()) {
    params.set('role_key', init.roleKey.trim())
  }
  if (init?.profileKind?.trim()) {
    params.set('profile_kind', init.profileKind.trim())
  }
  if (init?.createdAfter?.trim()) {
    params.set('created_after', init.createdAfter.trim())
  }
  if (init?.createdBefore?.trim()) {
    params.set('created_before', init.createdBefore.trim())
  }
  return params.size > 0 ? `?${params.toString()}` : ''
}

function agentWorkPackageQuery(init?: {
  status?: AssistantAgentWorkPackageStatus
  hasPr?: boolean
  hasCommit?: boolean
  hasEval?: boolean
  hasTests?: boolean
  hasDocs?: boolean
}): string {
  const params = new URLSearchParams()
  if (init?.status) {
    params.set('status', init.status)
  }
  if (typeof init?.hasPr === 'boolean') {
    params.set('has_pr', String(init.hasPr))
  }
  if (typeof init?.hasCommit === 'boolean') {
    params.set('has_commit', String(init.hasCommit))
  }
  if (typeof init?.hasEval === 'boolean') {
    params.set('has_eval', String(init.hasEval))
  }
  if (typeof init?.hasTests === 'boolean') {
    params.set('has_tests', String(init.hasTests))
  }
  if (typeof init?.hasDocs === 'boolean') {
    params.set('has_docs', String(init.hasDocs))
  }
  return params.size > 0 ? `?${params.toString()}` : ''
}

function agentEvalQuery(init?: {
  agentId?: string
  limit?: number
  offset?: number
}): string {
  const params = new URLSearchParams()
  if (init?.agentId?.trim()) {
    params.set('agent_id', init.agentId.trim())
  }
  if (typeof init?.limit === 'number') {
    params.set('limit', String(init.limit))
  }
  if (typeof init?.offset === 'number') {
    params.set('offset', String(init.offset))
  }
  return params.size > 0 ? `?${params.toString()}` : ''
}

function assistantActionDecisionPayload(payload: AssistantActionDecisionInput): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (payload.reviewOutcome) {
    body.review_outcome = payload.reviewOutcome
  }
  if (payload.decisionNote?.trim()) {
    body.decision_note = payload.decisionNote.trim()
  }
  if (payload.correctionSummary?.trim()) {
    body.correction_summary = payload.correctionSummary.trim()
  }
  const correctionFields = (payload.correctionFields ?? [])
    .map((field) => field.trim())
    .filter(Boolean)
  if (correctionFields.length > 0) {
    body.correction_fields = Array.from(new Set(correctionFields))
  }
  return body
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

export async function submitAssistantRunFeedback(
  apiBase: string,
  runId: number,
  payload: SubmitAssistantRunFeedbackInput,
  init?: { accessToken?: string },
): Promise<AssistantRunFeedback> {
  const normalizedComment = payload.comment?.trim()
  return postJson<AssistantRunFeedback>(
    `${apiBase}/assistant/runs/${encodeURIComponent(String(runId))}/feedback`,
    {
      rating: payload.rating,
      ...(normalizedComment ? { comment: normalizedComment } : {}),
    },
    { headers: assistantReadHeaders(init?.accessToken) },
  )
}

export async function submitAssistantPromptNavigationOutcome(
  apiBase: string,
  runId: number | null | undefined,
  payload: SubmitAssistantPromptNavigationOutcomeInput,
  init?: { accessToken?: string },
): Promise<AssistantPromptNavigationOutcome> {
  const normalizedTargetLabel = payload.targetLabel?.trim()
  const normalizedTargetRationale = payload.targetRationale?.trim()
  const normalizedFocusId = payload.focusId?.trim()
  const normalizedFocusLabel = payload.focusLabel?.trim()
  const normalizedDetail = payload.detail?.trim()
  const endpoint =
    typeof runId === 'number' && Number.isFinite(runId)
      ? `${apiBase}/assistant/runs/${encodeURIComponent(String(runId))}/prompt-navigation-outcomes`
      : `${apiBase}/assistant/prompt-navigation-outcomes`
  return postJson<AssistantPromptNavigationOutcome>(
    endpoint,
    {
      surface: payload.surface ?? 'PROMPT_HOME',
      outcome: payload.outcome,
      intent_key: payload.intentKey.trim(),
      ...(payload.targetView ? { target_view: payload.targetView } : {}),
      ...(normalizedTargetLabel ? { target_label: normalizedTargetLabel } : {}),
      ...(normalizedTargetRationale ? { target_rationale: normalizedTargetRationale } : {}),
      ...(payload.focusType ? { focus_type: payload.focusType } : {}),
      ...(normalizedFocusId ? { focus_id: normalizedFocusId } : {}),
      ...(normalizedFocusLabel ? { focus_label: normalizedFocusLabel } : {}),
      ...(normalizedDetail ? { detail: normalizedDetail } : {}),
    },
    { headers: assistantReadHeaders(init?.accessToken) },
  )
}

export async function getAdminAssistantRunAuditTrace(
  apiBase: string,
  runId: number,
): Promise<AssistantRunAuditTrace> {
  return fetchJson<AssistantRunAuditTrace>(
    `${apiBase}/admin/assistant/runs/${encodeURIComponent(String(runId))}/audit-trace`,
    {
      headers: assistantMutationHeaders(),
    },
  )
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

export async function transcribeAssistantVoice(
  apiBase: string,
  file: Blob,
  init: { accessToken?: string; filename?: string },
): Promise<AssistantVoiceTranscription> {
  const formData = new FormData()
  formData.append('file', file, init.filename?.trim() || 'voice-note.webm')
  return postFormData<AssistantVoiceTranscription>(
    `${apiBase}/assistant/voice/transcriptions`,
    formData,
    { headers: assistantReadHeaders(init.accessToken) },
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

export async function listAssistantPromptRouteRecommendations(
  apiBase: string,
  init?: { accessToken?: string },
): Promise<AssistantPromptRouteRecommendation[]> {
  try {
    return await fetchJson<AssistantPromptRouteRecommendation[]>(
      `${apiBase}/assistant/prompt-route-recommendations`,
      {
        headers: assistantReadHeaders(init?.accessToken),
      },
    )
  } catch (error) {
    // Prompt Home should degrade gracefully while an older API worker is still
    // running without the promoted-route endpoint.
    if (isNotFoundApiError(error)) {
      return []
    }
    throw error
  }
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

function isNotFoundApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && status === 404
}

export async function approveAssistantActionRequest(
  apiBase: string,
  actionRequestId: number,
  payload: AssistantActionDecisionInput = {},
): Promise<AssistantActionRequest> {
  return postJson<AssistantActionRequest>(
    `${apiBase}/assistant/action-requests/${actionRequestId}/approve`,
    assistantActionDecisionPayload(payload),
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function rejectAssistantActionRequest(
  apiBase: string,
  actionRequestId: number,
  payload: AssistantActionDecisionInput = {},
): Promise<AssistantActionRequest> {
  return postJson<AssistantActionRequest>(
    `${apiBase}/assistant/action-requests/${actionRequestId}/reject`,
    assistantActionDecisionPayload(payload),
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantActionRequests(
  apiBase: string,
  init?: {
    status?: AssistantActionRequestStatus
    actionType?: string
    agentId?: string
    roleKey?: string
    profileKind?: string
    userId?: string
    decidedBy?: string
    search?: string
    createdAfter?: string
    createdBefore?: string
    decidedAfter?: string
    decidedBefore?: string
    limit?: number
    offset?: number
  },
): Promise<AssistantActionRequestAdminPage> {
  return fetchJson<AssistantActionRequestAdminPage>(
    `${apiBase}/admin/assistant/action-requests${actionRequestQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function getAdminAssistantOutcomeMetrics(
  apiBase: string,
  init?: {
    agentId?: string
    actionType?: string
    roleKey?: string
    profileKind?: string
    createdAfter?: string
    createdBefore?: string
  },
): Promise<AssistantOutcomeMetrics> {
  return fetchJson<AssistantOutcomeMetrics>(
    `${apiBase}/admin/assistant/outcome-metrics${outcomeMetricsQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function getAdminAssistantControlTowerSummary(
  apiBase: string,
  init?: {
    createdAfter?: string
    createdBefore?: string
  },
): Promise<AssistantControlTowerSummary> {
  return fetchJson<AssistantControlTowerSummary>(
    `${apiBase}/admin/assistant/control-tower/summary${outcomeMetricsQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function getAdminAssistantAgentHealthReview(
  apiBase: string,
  init?: {
    createdAfter?: string
    createdBefore?: string
  },
): Promise<AssistantAgentHealthReview> {
  return fetchJson<AssistantAgentHealthReview>(
    `${apiBase}/admin/assistant/agent-health-review${outcomeMetricsQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantAgentWorkPackages(
  apiBase: string,
  init?: {
    status?: AssistantAgentWorkPackageStatus
    hasPr?: boolean
    hasCommit?: boolean
    hasEval?: boolean
    hasTests?: boolean
    hasDocs?: boolean
  },
): Promise<AssistantAgentWorkPackage[]> {
  return fetchJson<AssistantAgentWorkPackage[]>(
    `${apiBase}/admin/assistant/agent-work-packages${agentWorkPackageQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function acceptAdminAssistantAgentHealthWorkPackage(
  apiBase: string,
  workPackageId: string,
  payload: AcceptAssistantAgentWorkPackageInput = {},
): Promise<AssistantAgentWorkPackage> {
  const body: Record<string, unknown> = {}
  if (payload.acceptedBy?.trim()) {
    body.accepted_by = payload.acceptedBy.trim()
  }
  if (payload.notes?.trim()) {
    body.notes = payload.notes.trim()
  }
  return postJson<AssistantAgentWorkPackage>(
    `${apiBase}/admin/assistant/agent-health-review/work-packages/${encodeURIComponent(workPackageId.trim())}/accept${outcomeMetricsQuery(payload)}`,
    body,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function updateAdminAssistantAgentWorkPackage(
  apiBase: string,
  workPackageId: string,
  payload: UpdateAssistantAgentWorkPackageInput,
): Promise<AssistantAgentWorkPackage> {
  const body: Record<string, unknown> = {
    status: payload.status,
  }
  if (payload.updatedBy?.trim()) {
    body.updated_by = payload.updatedBy.trim()
  }
  if (payload.notes?.trim()) {
    body.notes = payload.notes.trim()
  }
  const evidence = payload.implementationEvidence
  if (evidence) {
    const evidencePayload: Record<string, unknown> = {}
    if (evidence.prUrl?.trim()) {
      evidencePayload.pr_url = evidence.prUrl.trim()
    }
    if (evidence.commitSha?.trim()) {
      evidencePayload.commit_sha = evidence.commitSha.trim()
    }
    if (typeof evidence.owner === 'string' && evidence.owner.trim()) {
      evidencePayload.owner = evidence.owner.trim()
    }
    if (Array.isArray(evidence.evalIds)) {
      evidencePayload.eval_ids = evidence.evalIds
    }
    if (Array.isArray(evidence.testNames)) {
      evidencePayload.test_names = evidence.testNames
    }
    if (Array.isArray(evidence.docPaths)) {
      evidencePayload.doc_paths = evidence.docPaths
    }
    if (Object.keys(evidencePayload).length > 0) {
      body.implementation_evidence = evidencePayload
    }
  }
  return patchJson<AssistantAgentWorkPackage>(
    `${apiBase}/admin/assistant/agent-work-packages/${encodeURIComponent(workPackageId.trim())}`,
    body,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function getAdminAssistantAutonomyReview(
  apiBase: string,
  agentId: string,
  init?: {
    createdAfter?: string
    createdBefore?: string
  },
): Promise<AssistantAutonomyReviewBrief> {
  return fetchJson<AssistantAutonomyReviewBrief>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId.trim())}/autonomy-review${outcomeMetricsQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantRoleArchetypes(
  apiBase: string,
): Promise<AssistantAgentRoleArchetype[]> {
  return fetchJson<AssistantAgentRoleArchetype[]>(
    `${apiBase}/admin/assistant/role-archetypes`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantProfileRequests(
  apiBase: string,
): Promise<AssistantAgentProfileRequest[]> {
  return fetchJson<AssistantAgentProfileRequest[]>(
    `${apiBase}/admin/assistant/profile-requests`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantAgentEvals(
  apiBase: string,
  init?: { agentId?: string; limit?: number; offset?: number },
): Promise<AssistantAgentEval[]> {
  return fetchJson<AssistantAgentEval[]>(
    `${apiBase}/admin/assistant/agent-evals${agentEvalQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function createAssistantAgentEval(
  apiBase: string,
  payload: CreateAssistantAgentEvalInput,
): Promise<AssistantAgentEval> {
  const { actorId } = getMutationContext()

  return postJson<AssistantAgentEval>(
    `${apiBase}/admin/assistant/agent-evals`,
    {
      ...payload,
      agent_id: payload.agent_id.trim(),
      created_by: actorId,
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function updateAssistantAgentEval(
  apiBase: string,
  evalId: number,
  payload: UpdateAssistantAgentEvalInput,
): Promise<AssistantAgentEval> {
  const { actorId } = getMutationContext()

  return putJson<AssistantAgentEval>(
    `${apiBase}/admin/assistant/agent-evals/${encodeURIComponent(String(evalId))}`,
    {
      ...payload,
      updated_by: actorId,
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function deleteAssistantAgentEval(apiBase: string, evalId: number): Promise<void> {
  await requestOk(`${apiBase}/admin/assistant/agent-evals/${encodeURIComponent(String(evalId))}`, {
    method: 'DELETE',
    headers: assistantMutationHeaders(),
  })
}

export async function listAdminAssistantAgentEvalRuns(
  apiBase: string,
  evalId: number,
  init?: { limit?: number; offset?: number },
): Promise<AssistantAgentEvalRun[]> {
  return fetchJson<AssistantAgentEvalRun[]>(
    `${apiBase}/admin/assistant/agent-evals/${encodeURIComponent(String(evalId))}/runs${agentEvalQuery(init)}`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function runAssistantAgentEval(
  apiBase: string,
  evalId: number,
): Promise<AssistantAgentEvalRun> {
  return postJson<AssistantAgentEvalRun>(
    `${apiBase}/admin/assistant/agent-evals/${encodeURIComponent(String(evalId))}/run`,
    {},
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function runAssistantAgentEvalSuite(
  apiBase: string,
  agentId: string,
): Promise<AssistantAgentEvalRun[]> {
  return postJson<AssistantAgentEvalRun[]>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId.trim())}/evals/run`,
    {},
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function createAssistantAgentProfileRequest(
  apiBase: string,
  payload: CreateAssistantAgentProfileRequestInput,
): Promise<AssistantAgentProfileRequest> {
  const { actorId } = getMutationContext()

  return postJson<AssistantAgentProfileRequest>(
    `${apiBase}/admin/assistant/profile-requests`,
    {
      ...payload,
      requested_by: actorId,
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function approveAssistantAgentProfileRequest(
  apiBase: string,
  requestId: number,
  payload: DecideAssistantAgentProfileRequestInput,
): Promise<AssistantAgentProfileRequest> {
  const { actorId } = getMutationContext()

  return postJson<AssistantAgentProfileRequest>(
    `${apiBase}/admin/assistant/profile-requests/${requestId}/approve`,
    {
      reviewed_by: payload.reviewed_by || actorId,
      approval_notes: payload.approval_notes,
    },
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function rejectAssistantAgentProfileRequest(
  apiBase: string,
  requestId: number,
  payload: DecideAssistantAgentProfileRequestInput,
): Promise<AssistantAgentProfileRequest> {
  const { actorId } = getMutationContext()

  return postJson<AssistantAgentProfileRequest>(
    `${apiBase}/admin/assistant/profile-requests/${requestId}/reject`,
    {
      reviewed_by: payload.reviewed_by || actorId,
      rejection_reason: payload.rejection_reason,
    },
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

export async function simulateAssistantAgentPolicy(
  apiBase: string,
  agentId: string,
  payload: SimulateAssistantAgentPolicyInput,
): Promise<AssistantPolicySimulation> {
  const normalizedPrompt = payload.prompt?.trim()
  const normalizedContext = payload.context?.trim()
  const normalizedActorRole = payload.actorRole?.trim()

  return postJson<AssistantPolicySimulation>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId)}/policy-simulation`,
    {
      workspace: payload.workspace,
      phase: payload.phase ?? 'stage',
      ...(normalizedPrompt ? { prompt: normalizedPrompt } : {}),
      ...(normalizedContext ? { context: normalizedContext } : {}),
      ...(normalizedActorRole ? { actor_role: normalizedActorRole } : {}),
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
        skills: payload.current_draft.skills ?? [],
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

export async function generateAssistantAgentSelfUpdateDraft(
  apiBase: string,
  agentId: string,
  payload?: GenerateAssistantAgentSelfUpdateDraftInput,
): Promise<AssistantAgentSelfUpdateDraft> {
  const normalizedBrief = payload?.brief?.trim()
  return postJson<AssistantAgentSelfUpdateDraft>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId)}/self-update-draft`,
    normalizedBrief ? { brief: normalizedBrief } : {},
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function listAdminAssistantAgentRevisions(
  apiBase: string,
  agentId: string,
): Promise<AssistantAgentRevision[]> {
  return fetchJson<AssistantAgentRevision[]>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId)}/revisions`,
    {
      headers: assistantMutationHeaders(),
    },
  )
}

export async function publishAssistantAgentRevision(
  apiBase: string,
  agentId: string,
  revisionId: number,
): Promise<AssistantAdminAgent> {
  return postJson<AssistantAdminAgent>(
    `${apiBase}/admin/assistant/agents/${encodeURIComponent(agentId)}/revisions/${revisionId}/publish`,
    {},
    {
      headers: assistantMutationHeaders(),
    },
  )
}
