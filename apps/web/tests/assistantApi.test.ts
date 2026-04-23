import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import type { AssistantPromptRequest } from '../src/shared/models.ts'

const { fetchJsonMock, patchJsonMock, postJsonMock, putJsonMock, requestOkMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  patchJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
  putJsonMock: vi.fn(),
  requestOkMock: vi.fn(),
}))

vi.mock('../src/shared/mutation.ts', () => ({
  buildMutationHeaders: (headers?: HeadersInit) => {
    const merged = new Headers(headers)
    merged.set('Authorization', 'Bearer mutation-token')
    return merged
  },
  getMutationContext: () => ({
    actorId: 'assistant_user',
    accessToken: 'mutation-token',
    role: 'OPS_ADMIN',
  }),
}))

vi.mock('../src/shared/api.ts', () => ({
  createApiError: (message: string, init?: { status?: number; correlationId?: string | null }) =>
    Object.assign(new Error(message), init),
  fetchJson: fetchJsonMock,
  getResponseCorrelationId: (response: Pick<Response, 'headers'>) => response.headers.get('x-correlation-id'),
  patchJson: patchJsonMock,
  postJson: postJsonMock,
  putJson: putJsonMock,
  requestOk: requestOkMock,
}))

import {
  approveAssistantActionRequest,
  acceptAdminAssistantAgentHealthWorkPackage,
  approveAssistantAgentProfileRequest,
  buildAssistantAgentDraft,
  createAssistantAgentEval,
  createAssistantAgentProfileRequest,
  deleteAssistantAgentEval,
  getAdminAssistantAgentHealthReview,
  getAdminAssistantAutonomyReview,
  getAdminAssistantControlTowerSummary,
  getAdminAssistantOutcomeMetrics,
  getAdminAssistantRunAuditTrace,
  getAssistantConversation,
  listAdminAssistantAgentWorkPackages,
  listAdminAssistantAgentEvals,
  listAdminAssistantAgentEvalRuns,
  listAdminAssistantActionRequests,
  listAdminAssistantProfileRequests,
  listAdminAssistantRoleArchetypes,
  listAssistantActionRequests,
  listAssistantConversations,
  previewAssistantPromptContext,
  rejectAssistantActionRequest,
  rejectAssistantAgentProfileRequest,
  runAssistantAgentEval,
  runAssistantAgentEvalSuite,
  simulateAssistantAgentPolicy,
  streamAssistantResponse,
  updateAdminAssistantAgentWorkPackage,
  updateAssistantAgentEval,
} from '../src/entities/assistant/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
  patchJsonMock.mockReset()
  postJsonMock.mockReset()
  putJsonMock.mockReset()
  requestOkMock.mockReset()
})

test('listAssistantConversations builds limit and authorization into the helper request', async () => {
  const expected = [{ conversation_id: 1 }]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAssistantConversations('http://api.test', {
    accessToken: 'conversation-token',
    limit: 12,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/conversations?limit=12')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer conversation-token')
})

test('getAssistantConversation owns the encoded detail URL and auth headers', async () => {
  const expected = { conversation_id: 42 }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAssistantConversation('http://api.test', 42, {
    accessToken: 'detail-token',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/conversations/42')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer detail-token')
})

test('listAssistantActionRequests centralizes query-string assembly for pending approvals', async () => {
  const expected = [{ action_request_id: 7 }]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAssistantActionRequests('http://api.test', {
    accessToken: 'actions-token',
    status: 'PENDING',
    limit: 12,
    offset: 3,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/action-requests?status=PENDING&limit=12&offset=3')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer actions-token')
})

test('listAdminAssistantActionRequests includes history filters and returns the page payload', async () => {
  const expected = {
    items: [{ action_request_id: 7 }],
    total_count: 1,
    limit: 20,
    offset: 40,
    has_more: false,
    summary: {
      total_count: 1,
      pending_count: 0,
      executed_count: 0,
      rejected_count: 1,
      failed_count: 0,
      correction_count: 0,
      avg_decision_seconds: 90,
    },
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantActionRequests('http://api.test', {
    status: 'REJECTED',
    actionType: 'cancel_trade',
    agentId: 'ops-governor',
    roleKey: 'trade-ops-copilot',
    profileKind: 'ROLE_DERIVED',
    userId: 'trader.alpha',
    decidedBy: 'ops_admin',
    search: 'T-1014',
    createdAfter: '2026-04-01',
    createdBefore: '2026-04-30',
    decidedAfter: '2026-04-02',
    decidedBefore: '2026-04-29',
    limit: 20,
    offset: 40,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/action-requests?status=REJECTED&action_type=cancel_trade&agent_id=ops-governor&role_key=trade-ops-copilot&profile_kind=ROLE_DERIVED&user_id=trader.alpha&decided_by=ops_admin&search=T-1014&created_after=2026-04-01&created_before=2026-04-30&decided_after=2026-04-02&decided_before=2026-04-29&limit=20&offset=40',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantOutcomeMetrics includes advisory filters and admin auth', async () => {
  const expected = {
    generated_at: '2026-04-11T09:00:00Z',
    created_after: '2026-04-01T00:00:00',
    created_before: '2026-04-30T23:59:59',
    thresholds: {
      min_decided_actions_for_promotion: 10,
    max_rejection_rate_for_promotion: 0.1,
    max_failed_execution_rate_for_promotion: 0.02,
    max_stale_action_rate_for_promotion: 0.05,
    max_correction_rate_for_promotion: 0.1,
    max_pending_actions_for_promotion: 0,
      min_decided_actions_for_pause_signal: 5,
      rejection_rate_pause_threshold: 0.4,
      failed_execution_rate_pause_threshold: 0.1,
      stale_action_rate_pause_threshold: 0.25,
      oldest_pending_hours_pause_threshold: 72,
      repeated_failed_actions_pause_threshold: 3,
      unsupported_attempt_pause_threshold: 1,
      policy_drift_pause_threshold: 1,
    },
    total_feedback_count: 0,
    helpful_feedback_count: 0,
    needs_work_feedback_count: 0,
    feedback_helpful_rate: null,
    by_agent: [],
    by_role: [],
    by_profile: [],
    by_workspace: [],
    by_action_type: [],
    recent_feedback: [],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantOutcomeMetrics('http://api.test', {
    agentId: ' ops-governor ',
    actionType: ' cancel_trade ',
    roleKey: ' trade-ops-copilot ',
    profileKind: ' ROLE_DERIVED ',
    createdAfter: '2026-04-01T00:00:00',
    createdBefore: '2026-04-30T23:59:59',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/outcome-metrics?agent_id=ops-governor&action_type=cancel_trade&role_key=trade-ops-copilot&profile_kind=ROLE_DERIVED&created_after=2026-04-01T00%3A00%3A00&created_before=2026-04-30T23%3A59%3A59',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantControlTowerSummary owns the summary URL and admin auth', async () => {
  const expected = {
    generated_at: '2026-04-11T09:00:00Z',
    created_after: '2026-04-01T00:00:00',
    created_before: '2026-04-30T23:59:59',
    roster: {
      total_count: 5,
      active_count: 2,
      draft_count: 1,
      paused_count: 1,
      retired_count: 1,
      action_capable_count: 1,
      missing_eval_coverage_count: 1,
      policy_warning_count: 1,
    },
    runs: {
      total_count: 2,
      completed_count: 1,
      failed_count: 1,
      warning_count: 1,
      tool_call_count: 2,
      latest_run_at: '2026-04-11T08:30:00Z',
    },
    actions: {
      total_count: 4,
      pending_count: 1,
      failed_count: 1,
      rejected_count: 1,
      executed_count: 1,
      preview_blocked_count: 1,
      oldest_pending_action: {
        action_request_id: 42,
        action_type: 'issue_trade_invoice',
        summary: 'Issue invoice',
        agent_id: 'risky-agent',
        agent_name: 'Risky Agent',
        user_id: 'ops_beta',
        created_at: '2026-04-11T04:30:00Z',
        age_seconds: 18000,
      },
    },
    trust_signals: [
      {
        agent_id: 'risky-agent',
        agent_name: 'Risky Agent',
        status: 'ACTIVE',
        role_key: null,
        profile_kind: 'CUSTOM',
        signal_type: 'POLICY_WARNING',
        severity: 'danger',
        summary: 'Policy definition needs review.',
        details: [
          'Risky Agent has ACTION capability and must declare explicit allowed_action_types.',
        ],
        pending_action_count: 1,
        failed_action_count: 1,
        warning_run_count: 0,
        eval_status: 'BLOCKED',
      },
    ],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantControlTowerSummary('http://api.test', {
    createdAfter: '2026-04-01T00:00:00',
    createdBefore: '2026-04-30T23:59:59',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/control-tower/summary?created_after=2026-04-01T00%3A00%3A00&created_before=2026-04-30T23%3A59%3A59',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantAutonomyReview owns the typed review brief URL and admin auth', async () => {
  const expected = {
    generated_at: '2026-04-11T09:00:00Z',
    agent_id: 'ops-governor',
    agent_name: 'Ops Governor',
    current_status: 'ACTIVE',
    current_authority: 'STAGE',
    recommended_next_authority: 'KEEP_STAGED',
    recommendation_reasons: ['Collect more outcomes.'],
    eval_signal: {
      status: 'DECLARED',
      required_cases: ['Allowed operational action staging.'],
      proposed_cases: [],
      notes: [],
    },
    allowed_action_types: ['update_trade_workflow_item'],
    action_type_metrics: [],
    stop_conditions: [],
    knowledge_base_entries: [],
    deterministic_algorithm_candidates: [],
    review_checklist: [],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantAutonomyReview('http://api.test', ' ops-governor ', {
    createdAfter: '2026-04-01T00:00:00',
    createdBefore: '2026-04-30T23:59:59',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/agents/ops-governor/autonomy-review?created_after=2026-04-01T00%3A00%3A00&created_before=2026-04-30T23%3A59%3A59',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantAgentHealthReview owns the workflow URL and admin auth', async () => {
  const expected = {
    generated_at: '2026-04-11T09:00:00Z',
    outcome_window_created_after: '2026-04-01T00:00:00',
    outcome_window_created_before: '2026-04-30T23:59:59',
    agent_count: 2,
    pause_count: 0,
    narrow_count: 0,
    bounded_review_candidate_count: 1,
    keep_staged_count: 1,
    work_package_count: 1,
    review_items: [
      {
        agent_id: 'ops-governor',
        agent_name: 'Ops Governor',
        current_status: 'ACTIVE',
        current_authority: 'STAGE',
        recommended_next_authority: 'KEEP_STAGED',
        recommendation_reasons: ['Collect more outcomes.'],
        eval_status: 'DECLARED',
        decided_action_count: 4,
        pending_action_count: 0,
        failed_action_count: 0,
        deterministic_candidate_count: 1,
        stop_condition_count: 2,
        work_package_ids: ['policy-review-update-trade-workflow-item-12345678'],
      },
    ],
    work_packages: [
      {
        work_package_id: 'policy-review-update-trade-workflow-item-12345678',
        title: 'Policy: Review workflow blockers',
        package_type: 'POLICY',
        priority: 'P2',
        status: 'CANDIDATE',
        source_agent_ids: ['ops-governor'],
        source_agent_names: ['Ops Governor'],
        source_recommendations: ['KEEP_STAGED'],
        source_candidates: ['Review workflow blockers and promote recurring reviewer decisions.'],
        recommended_owner_role: 'Operations Lead',
        rationale: 'Autonomy review surfaced a recurring deterministic candidate.',
        acceptance_checks: ['Run policy simulation for every affected action type before rollout.'],
        knowledge_base_titles: [],
      },
    ],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantAgentHealthReview('http://api.test', {
    createdAfter: '2026-04-01T00:00:00',
    createdBefore: '2026-04-30T23:59:59',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/agent-health-review?created_after=2026-04-01T00%3A00%3A00&created_before=2026-04-30T23%3A59%3A59',
  )
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('listAdminAssistantAgentWorkPackages owns the persisted work package URL and admin auth', async () => {
  const expected = [
    {
      id: 11,
      work_package_id: 'policy-review-update-trade-workflow-item-12345678',
      title: 'Policy: Review workflow blockers',
      package_type: 'POLICY',
      priority: 'P2',
      status: 'ACCEPTED',
      source_agent_ids: ['ops-governor'],
      source_agent_names: ['Ops Governor'],
      source_recommendations: ['KEEP_STAGED'],
      source_candidates: ['Review workflow blockers and promote recurring reviewer decisions.'],
      recommended_owner_role: 'Operations Lead',
      rationale: 'Autonomy review surfaced a recurring deterministic candidate.',
      acceptance_checks: ['Run policy simulation for every affected action type before rollout.'],
      knowledge_base_titles: [],
      accepted_at: '2026-04-22T18:00:00Z',
      accepted_by: 'ops_admin',
      notes: null,
      created_at: '2026-04-22T18:00:00Z',
      created_by: 'ops_admin',
      updated_at: '2026-04-22T18:00:00Z',
      updated_by: 'ops_admin',
    },
  ]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantAgentWorkPackages('http://api.test', {
    status: 'ACCEPTED',
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/agent-work-packages?status=ACCEPTED')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('acceptAdminAssistantAgentHealthWorkPackage posts accepted candidate metadata', async () => {
  const expected = {
    id: 11,
    work_package_id: 'policy-review-update-trade-workflow-item-12345678',
    title: 'Policy: Review workflow blockers',
    package_type: 'POLICY',
    priority: 'P2',
    status: 'ACCEPTED',
    source_agent_ids: ['ops-governor'],
    source_agent_names: ['Ops Governor'],
    source_recommendations: ['KEEP_STAGED'],
    source_candidates: ['Review workflow blockers and promote recurring reviewer decisions.'],
    recommended_owner_role: 'Operations Lead',
    rationale: 'Autonomy review surfaced a recurring deterministic candidate.',
    acceptance_checks: ['Run policy simulation for every affected action type before rollout.'],
    knowledge_base_titles: [],
    accepted_at: '2026-04-22T18:00:00Z',
    accepted_by: 'ops_admin',
    notes: 'Promote into policy backlog.',
    created_at: '2026-04-22T18:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-04-22T18:00:00Z',
    updated_by: 'ops_admin',
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await acceptAdminAssistantAgentHealthWorkPackage(
    'http://api.test',
    ' policy-review-update-trade-workflow-item-12345678 ',
    {
      acceptedBy: ' ops_admin ',
      notes: ' Promote into policy backlog. ',
      createdAfter: '2026-04-01T00:00:00',
      createdBefore: '2026-04-30T23:59:59',
    },
  )

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/agent-health-review/work-packages/policy-review-update-trade-workflow-item-12345678/accept?created_after=2026-04-01T00%3A00%3A00&created_before=2026-04-30T23%3A59%3A59',
  )
  assert.deepEqual(body, {
    accepted_by: 'ops_admin',
    notes: 'Promote into policy backlog.',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('updateAdminAssistantAgentWorkPackage patches lifecycle transition metadata', async () => {
  const expected = {
    id: 11,
    work_package_id: 'policy-review-update-trade-workflow-item-12345678',
    title: 'Policy: Review workflow blockers',
    package_type: 'POLICY',
    priority: 'P2',
    status: 'IMPLEMENTED',
    source_agent_ids: ['ops-governor'],
    source_agent_names: ['Ops Governor'],
    source_recommendations: ['KEEP_STAGED'],
    source_candidates: ['Review workflow blockers and promote recurring reviewer decisions.'],
    recommended_owner_role: 'Operations Lead',
    rationale: 'Autonomy review surfaced a recurring deterministic candidate.',
    acceptance_checks: ['Run policy simulation for every affected action type before rollout.'],
    knowledge_base_titles: [],
    accepted_at: '2026-04-22T18:00:00Z',
    accepted_by: 'ops_admin',
    notes: 'Implemented checks with passing coverage.',
    created_at: '2026-04-22T18:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-04-22T19:00:00Z',
    updated_by: 'ops_admin',
  }
  patchJsonMock.mockResolvedValueOnce(expected)

  const payload = await updateAdminAssistantAgentWorkPackage(
    'http://api.test',
    ' policy-review-update-trade-workflow-item-12345678 ',
    {
      status: 'IMPLEMENTED',
      updatedBy: ' ops_admin ',
      notes: ' Implemented checks with passing coverage. ',
    },
  )

  assert.equal(payload, expected)
  const [url, body, init] = patchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'http://api.test/admin/assistant/agent-work-packages/policy-review-update-trade-workflow-item-12345678',
  )
  assert.deepEqual(body, {
    status: 'IMPLEMENTED',
    updated_by: 'ops_admin',
    notes: 'Implemented checks with passing coverage.',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('approveAssistantActionRequest posts structured reviewer correction metadata', async () => {
  const expected = { action_request_id: 7, review_outcome: 'APPROVED_WITH_CORRECTIONS' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await approveAssistantActionRequest('http://api.test', 7, {
    reviewOutcome: 'APPROVED_WITH_CORRECTIONS',
    decisionNote: 'Approved after desk correction.',
    correctionSummary: 'Adjusted reviewer owner before execution.',
    correctionFields: ['owner', ' owner ', 'notes'],
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/action-requests/7/approve')
  assert.deepEqual(body, {
    review_outcome: 'APPROVED_WITH_CORRECTIONS',
    decision_note: 'Approved after desk correction.',
    correction_summary: 'Adjusted reviewer owner before execution.',
    correction_fields: ['owner', 'notes'],
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('rejectAssistantActionRequest posts rejection notes with review outcome', async () => {
  const expected = { action_request_id: 8, review_outcome: 'REJECTED' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await rejectAssistantActionRequest('http://api.test', 8, {
    reviewOutcome: 'REJECTED',
    decisionNote: 'Evidence did not support the action.',
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/action-requests/8/reject')
  assert.deepEqual(body, {
    review_outcome: 'REJECTED',
    decision_note: 'Evidence did not support the action.',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('getAdminAssistantRunAuditTrace owns the admin trace URL and mutation auth', async () => {
  const expected = {
    run: { run_id: 701 },
    action_requests: [],
    timeline: [],
    mutation_event_count: 0,
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await getAdminAssistantRunAuditTrace('http://api.test', 701)

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/runs/701/audit-trace')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('listAdminAssistantAgentEvals scopes catalog reads by agent and admin auth', async () => {
  const expected = [{ eval_id: 12, agent_id: 'ops-governor' }]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantAgentEvals('http://api.test', {
    agentId: ' ops-governor ',
    limit: 25,
    offset: 5,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/agent-evals?agent_id=ops-governor&limit=25&offset=5')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('createAssistantAgentEval and updateAssistantAgentEval stamp reviewer provenance', async () => {
  const created = { eval_id: 12, agent_id: 'ops-governor', name: 'Allowed staging' }
  const updated = { eval_id: 12, agent_id: 'ops-governor', name: 'Allowed staging v2' }
  postJsonMock.mockResolvedValueOnce(created)
  putJsonMock.mockResolvedValueOnce(updated)

  const createPayload = {
    agent_id: ' ops-governor ',
    name: 'Allowed staging',
    workspace: 'operations',
    prompt: 'Stage the workflow update.',
    context: null,
    use_live_tools: false,
    expected_substrings: ['staged'],
    expected_tool_names: ['list_workflow_items'],
    expected_action_types: ['update_trade_workflow_item'],
  } as const
  const createResult = await createAssistantAgentEval('http://api.test', createPayload)
  const updateResult = await updateAssistantAgentEval('http://api.test', 12, {
    ...createPayload,
    name: 'Allowed staging v2',
  })

  assert.equal(createResult, created)
  assert.equal(updateResult, updated)
  const [createUrl, createBody, createInit] = postJsonMock.mock.calls[0]
  assert.equal(createUrl, 'http://api.test/admin/assistant/agent-evals')
  assert.deepEqual(createBody, {
    ...createPayload,
    agent_id: 'ops-governor',
    created_by: 'assistant_user',
  })
  assert.equal(new Headers((createInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer mutation-token')
  const [updateUrl, updateBody, updateInit] = putJsonMock.mock.calls[0]
  assert.equal(updateUrl, 'http://api.test/admin/assistant/agent-evals/12')
  assert.deepEqual(updateBody, {
    ...createPayload,
    name: 'Allowed staging v2',
    updated_by: 'assistant_user',
  })
  assert.equal(new Headers((updateInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer mutation-token')
})

test('assistant agent eval run helpers own run, suite, history, and delete routes', async () => {
  const run = { eval_run_id: 99, eval_id: 12, status: 'PASS' }
  const suite = [{ eval_run_id: 100, eval_id: 13, status: 'FAIL' }]
  const history = [run]
  postJsonMock.mockResolvedValueOnce(run).mockResolvedValueOnce(suite)
  fetchJsonMock.mockResolvedValueOnce(history)
  requestOkMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

  const runResult = await runAssistantAgentEval('http://api.test', 12)
  const suiteResult = await runAssistantAgentEvalSuite('http://api.test', ' ops-governor ')
  const historyResult = await listAdminAssistantAgentEvalRuns('http://api.test', 12, { limit: 8 })
  await deleteAssistantAgentEval('http://api.test', 12)

  assert.equal(runResult, run)
  assert.equal(suiteResult, suite)
  assert.equal(historyResult, history)
  assert.equal(postJsonMock.mock.calls[0][0], 'http://api.test/admin/assistant/agent-evals/12/run')
  assert.deepEqual(postJsonMock.mock.calls[0][1], {})
  assert.equal(postJsonMock.mock.calls[1][0], 'http://api.test/admin/assistant/agents/ops-governor/evals/run')
  assert.deepEqual(postJsonMock.mock.calls[1][1], {})
  assert.equal(fetchJsonMock.mock.calls[0][0], 'http://api.test/admin/assistant/agent-evals/12/runs?limit=8')
  const [deleteUrl, deleteInit] = requestOkMock.mock.calls[0]
  assert.equal(deleteUrl, 'http://api.test/admin/assistant/agent-evals/12')
  assert.equal((deleteInit as RequestInit | undefined)?.method, 'DELETE')
  assert.equal(new Headers((deleteInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer mutation-token')
})

test('listAdminAssistantRoleArchetypes loads the server-owned role catalog with admin auth', async () => {
  const expected = [
    {
      role_key: 'trade-ops-copilot',
      name: 'Trade Ops Copilot',
      catalog_status: 'SEEDED',
    },
  ]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantRoleArchetypes('http://api.test')

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/role-archetypes')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('listAdminAssistantProfileRequests loads the admin request queue with mutation auth', async () => {
  const expected = [{ request_id: 10, status: 'REQUESTED' }]
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await listAdminAssistantProfileRequests('http://api.test')

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/profile-requests')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('admin assistant eval helpers own catalog URLs and mutation actors', async () => {
  fetchJsonMock.mockResolvedValueOnce([{ eval_id: 21, agent_id: 'weather-dispatch-analyst' }])
  postJsonMock.mockResolvedValueOnce({ eval_id: 22, agent_id: 'weather-dispatch-analyst' })
  putJsonMock.mockResolvedValueOnce({ eval_id: 22, name: 'Updated stale evidence gate' })
  requestOkMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

  const listPayload = await listAdminAssistantAgentEvals('http://api.test', {
    agentId: ' weather-dispatch-analyst ',
    limit: 25,
    offset: 5,
  })
  const created = await createAssistantAgentEval('http://api.test', {
    agent_id: 'weather-dispatch-analyst',
    name: 'Blocks stale evidence',
    workspace: 'assistant',
    prompt: 'Handle a stale weather exception.',
    context: null,
    use_live_tools: true,
    expected_substrings: ['stale evidence'],
    expected_tool_names: ['list_workflow_items'],
    expected_action_types: ['update_trade_workflow_item'],
  })
  const updated = await updateAssistantAgentEval('http://api.test', 22, {
    name: 'Updated stale evidence gate',
    workspace: 'operations',
    prompt: 'Handle an updated stale weather exception.',
    context: 'Workflow item W-1',
    use_live_tools: false,
    expected_substrings: [],
    expected_tool_names: [],
    expected_action_types: [],
  })
  await deleteAssistantAgentEval('http://api.test', 22)

  assert.deepEqual(listPayload, [{ eval_id: 21, agent_id: 'weather-dispatch-analyst' }])
  assert.deepEqual(created, { eval_id: 22, agent_id: 'weather-dispatch-analyst' })
  assert.deepEqual(updated, { eval_id: 22, name: 'Updated stale evidence gate' })
  assert.equal(
    fetchJsonMock.mock.calls[0][0],
    'http://api.test/admin/assistant/agent-evals?agent_id=weather-dispatch-analyst&limit=25&offset=5',
  )
  assert.equal(postJsonMock.mock.calls[0][0], 'http://api.test/admin/assistant/agent-evals')
  assert.deepEqual(postJsonMock.mock.calls[0][1], {
    agent_id: 'weather-dispatch-analyst',
    name: 'Blocks stale evidence',
    workspace: 'assistant',
    prompt: 'Handle a stale weather exception.',
    context: null,
    use_live_tools: true,
    expected_substrings: ['stale evidence'],
    expected_tool_names: ['list_workflow_items'],
    expected_action_types: ['update_trade_workflow_item'],
    created_by: 'assistant_user',
  })
  assert.equal(putJsonMock.mock.calls[0][0], 'http://api.test/admin/assistant/agent-evals/22')
  assert.deepEqual(putJsonMock.mock.calls[0][1], {
    name: 'Updated stale evidence gate',
    workspace: 'operations',
    prompt: 'Handle an updated stale weather exception.',
    context: 'Workflow item W-1',
    use_live_tools: false,
    expected_substrings: [],
    expected_tool_names: [],
    expected_action_types: [],
    updated_by: 'assistant_user',
  })
  assert.equal(requestOkMock.mock.calls[0][0], 'http://api.test/admin/assistant/agent-evals/22')
  assert.equal((requestOkMock.mock.calls[0][1] as RequestInit).method, 'DELETE')
  for (const call of [
    fetchJsonMock.mock.calls[0],
    postJsonMock.mock.calls[0],
    putJsonMock.mock.calls[0],
    requestOkMock.mock.calls[0],
  ]) {
    const headers = new Headers((call[call.length - 1] as RequestInit | undefined)?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
  }
})

test('createAssistantAgentProfileRequest posts requested_by from mutation context', async () => {
  const expected = { request_id: 11, status: 'REQUESTED' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await createAssistantAgentProfileRequest('http://api.test', {
    requested_agent_id: 'weather-dispatch-analyst',
    business_problem: 'Weather exceptions need triage.',
    proposed_mission: 'Explain weather exposure and stage narrow follow-up.',
    human_owner_role: 'Operations Lead',
    requested_workspaces: ['assistant', 'operations'],
    work_objects: ['workflow item'],
    requested_inputs_tools: ['list_workflow_items'],
    expected_outputs: ['Exception summary'],
    requested_authority_ceiling: 'STAGE',
    stop_conditions: ['Evidence is stale.'],
    success_metrics: ['Reduce triage time.'],
    proposed_eval_cases: ['Blocks stale evidence.'],
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/profile-requests')
  assert.deepEqual(body, {
    requested_agent_id: 'weather-dispatch-analyst',
    business_problem: 'Weather exceptions need triage.',
    proposed_mission: 'Explain weather exposure and stage narrow follow-up.',
    human_owner_role: 'Operations Lead',
    requested_workspaces: ['assistant', 'operations'],
    work_objects: ['workflow item'],
    requested_inputs_tools: ['list_workflow_items'],
    expected_outputs: ['Exception summary'],
    requested_authority_ceiling: 'STAGE',
    stop_conditions: ['Evidence is stale.'],
    success_metrics: ['Reduce triage time.'],
    proposed_eval_cases: ['Blocks stale evidence.'],
    requested_by: 'assistant_user',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('approve and reject profile request helpers post reviewer decisions', async () => {
  postJsonMock
    .mockResolvedValueOnce({ request_id: 12, status: 'APPROVED' })
    .mockResolvedValueOnce({ request_id: 13, status: 'REJECTED' })

  await approveAssistantAgentProfileRequest('http://api.test', 12, {
    approval_notes: 'Owner and eval reviewed.',
  })
  await rejectAssistantAgentProfileRequest('http://api.test', 13, {
    reviewed_by: 'risk-owner',
    rejection_reason: 'Scope is too broad.',
  })

  assert.equal(
    postJsonMock.mock.calls[0][0],
    'http://api.test/admin/assistant/profile-requests/12/approve',
  )
  assert.deepEqual(postJsonMock.mock.calls[0][1], {
    reviewed_by: 'assistant_user',
    approval_notes: 'Owner and eval reviewed.',
  })
  assert.equal(
    postJsonMock.mock.calls[1][0],
    'http://api.test/admin/assistant/profile-requests/13/reject',
  )
  assert.deepEqual(postJsonMock.mock.calls[1][1], {
    reviewed_by: 'risk-owner',
    rejection_reason: 'Scope is too broad.',
  })
})

test('simulateAssistantAgentPolicy posts trimmed dry-run inputs with admin auth', async () => {
  const expected = {
    agent_id: 'sim-governor',
    allowed_tools: [],
    blocked_tools: [],
    allowed_actions: [],
    blocked_actions: [],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await simulateAssistantAgentPolicy('http://api.test', 'sim-governor', {
    workspace: 'assistant',
    phase: 'execute',
    actorRole: ' TRADER ',
    context: ' Selected trade:\n- trade_id: T-1022 ',
    prompt: ' Cancel the selected trade. ',
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/agents/sim-governor/policy-simulation')
  assert.deepEqual(body, {
    workspace: 'assistant',
    phase: 'execute',
    actor_role: 'TRADER',
    context: 'Selected trade:\n- trade_id: T-1022',
    prompt: 'Cancel the selected trade.',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})

test('previewAssistantPromptContext sends typed payloads with access-token-based auth', async () => {
  const request = {
    provider: 'OPENAI',
    workspace: 'assistant',
    use_live_tools: true,
  }
  const expected = { provider: 'OPENAI', model: 'gpt-5.4' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await previewAssistantPromptContext('http://api.test', request, {
    accessToken: 'preview-token',
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/context')
  assert.deepEqual(body, request)
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer preview-token')
})

test('streamAssistantResponse derives auth headers from the typed helper options', async () => {
  const payload: AssistantPromptRequest = {
    provider: 'OPENAI',
    workspace: 'assistant',
    messages: [{ role: 'user', content: 'Hello' }],
  }
  const receivedEvents: unknown[] = []
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('event: assistant.delta\ndata: {"chunk":"Hello back"}\n\n'),
      )
      controller.close()
    },
  })
  requestOkMock.mockResolvedValueOnce(
    new Response(stream, {
      status: 200,
      headers: { 'x-correlation-id': 'corr-123' },
    }),
  )

  await streamAssistantResponse('http://api.test', payload, {
    accessToken: 'stream-token',
    onEvent: (event) => {
      receivedEvents.push(event)
    },
  })

  const [url, init] = requestOkMock.mock.calls[0]
  assert.equal(url, 'http://api.test/assistant/respond/stream')
  assert.equal((init as RequestInit | undefined)?.method, 'POST')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer stream-token')
  assert.equal(headers.get('Content-Type'), 'application/json')
  assert.deepEqual(receivedEvents, [
    {
      event: 'assistant.delta',
      data: { chunk: 'Hello back' },
    },
  ])
})

test('buildAssistantAgentDraft posts the normalized current draft to the admin builder route', async () => {
  const expected = {
    agent_id: 'ops-briefing',
    name: 'Ops Briefing',
    description: 'Summarizes queue pressure.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5-mini',
    allowed_workspaces: ['assistant', 'operations'],
    capabilities: ['READ', 'EXPLAIN'],
    allowed_tools: ['list_workflow_items'],
    allowed_action_types: [],
    system_prompt: 'Summarize the queue.',
    builder_provider: 'openai',
    builder_model: 'gpt-5',
    warnings: [],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await buildAssistantAgentDraft('http://api.test', {
    brief: '  Build an operations briefing agent.  ',
    current_draft: {
      agent_id: '  ops-briefing  ',
      name: '  Ops Briefing  ',
      description: '  Summarizes queue pressure. ',
      status: 'DRAFT',
      scope: 'TEAM',
      provider: null,
      model: '  ',
      allowed_workspaces: ['assistant', 'operations'],
      capabilities: ['READ', 'EXPLAIN'],
      allowed_tools: ['list_workflow_items'],
      allowed_action_types: [],
      system_prompt: '  Summarize the queue.  ',
    },
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/assistant/agents/build')
  assert.deepEqual(body, {
    brief: 'Build an operations briefing agent.',
    current_draft: {
      agent_id: 'ops-briefing',
      name: 'Ops Briefing',
      description: 'Summarizes queue pressure.',
      status: 'DRAFT',
      scope: 'TEAM',
      allowed_workspaces: ['assistant', 'operations'],
      capabilities: ['READ', 'EXPLAIN'],
      allowed_tools: ['list_workflow_items'],
      allowed_action_types: [],
      system_prompt: 'Summarize the queue.',
    },
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mutation-token')
})
