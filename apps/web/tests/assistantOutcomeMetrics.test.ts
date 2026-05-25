import assert from 'node:assert/strict'
import { test } from 'vitest'

import type {
  AssistantActionTypeOutcomeMetricRow,
  AssistantAgentOutcomeMetricRow,
  AssistantPromptNavigationOutcomeInsight,
  AssistantPromptNavigationTargetMetricRow,
  AssistantProfileOutcomeMetricRow,
  AssistantRoleOutcomeMetricRow,
  AssistantWorkspaceFeedbackMetricRow,
} from '../src/shared/models'
import {
  assistantPromptNavigationSignalLabel,
  assistantPromptNavigationSignalTone,
  assistantOutcomeRecommendationLabel,
  assistantOutcomeRecommendationTone,
  buildAssistantActionTypeOutcomeRows,
  buildAssistantAgentOutcomeRows,
  buildAssistantPromptNavigationOutcomeRows,
  buildAssistantPromptNavigationTargetRows,
  buildAssistantProfileOutcomeRows,
  buildAssistantRoleOutcomeRows,
  buildAssistantWorkspaceFeedbackRows,
  formatAssistantActionTypeLabel,
  formatAssistantOutcomeDuration,
  formatAssistantOutcomeRate,
} from '../src/workspaces/admin/assistantOutcomeMetrics'

const baseCounters = {
  staged_action_count: 12,
  pending_action_count: 0,
  executed_action_count: 10,
  rejected_action_count: 1,
  failed_action_count: 1,
  approved_as_is_count: 9,
  approved_with_corrections_count: 1,
  correction_count: 1,
  decided_action_count: 12,
  stale_action_count: 0,
  duplicate_action_count: 1,
  invalid_action_payload_count: 1,
  unsupported_attempt_count: 1,
  policy_drift_count: 0,
  approval_rate: 0.8333,
  rejection_rate: 0.0833,
  failed_execution_rate: 0.0833,
  correction_rate: 0.0833,
  stale_action_rate: 0,
  avg_decision_seconds: 5400,
  oldest_pending_age_seconds: null,
}

test('assistant outcome metric formatting keeps rates and durations compact', () => {
  assert.equal(formatAssistantActionTypeLabel('issue_trade_invoice'), 'issue trade invoice')
  assert.equal(
    formatAssistantActionTypeLabel(
      'issue_trade_invoice',
      new Map([
        [
          'issue_trade_invoice',
          {
            name: 'issue_trade_invoice' as const,
            label: 'Issue invoice',
            description: 'Catalog label supplied by the assistant runtime settings endpoint.',
          },
        ],
      ]),
    ),
    'Issue invoice',
  )
  assert.equal(formatAssistantOutcomeRate(0.095), '9.5%')
  assert.equal(formatAssistantOutcomeRate(0.8333), '83%')
  assert.equal(formatAssistantOutcomeRate(null), 'n/a')
  assert.equal(formatAssistantOutcomeDuration(42), '42s')
  assert.equal(formatAssistantOutcomeDuration(5400), '1.5h')
  assert.equal(assistantOutcomeRecommendationLabel('ELIGIBLE_FOR_BOUNDED_REVIEW'), 'Bounded review candidate')
  assert.equal(assistantOutcomeRecommendationTone('RECOMMEND_PAUSE'), 'danger')
})

test('assistant outcome agent rows expose recommendations and guardrail metrics', () => {
  const row: AssistantAgentOutcomeMetricRow = {
    ...baseCounters,
    agent_id: 'ops-governor',
    agent_name: 'Ops Governor',
    agent_role_key: 'trade-ops-copilot',
    agent_profile_kind: 'ROLE_DERIVED',
    run_count: 14,
    completed_run_count: 13,
    failed_run_count: 1,
    warning_count: 1,
    warning_rate: 0.0714,
    tool_call_count: 21,
    tool_error_count: 2,
    tool_error_rate: 0.0952,
    helpful_feedback_count: 7,
    needs_work_feedback_count: 1,
    feedback_helpful_rate: 0.875,
    recommendation: {
      recommended_action: 'KEEP_STAGED',
      promotion_candidate: false,
      pause_recommended: false,
      reasons: ['Pending actions must be cleared before promotion.'],
    },
  }

  const [displayRow] = buildAssistantAgentOutcomeRows([row])

  assert.equal(displayRow?.title, 'Ops Governor')
  assert.equal(displayRow?.subtitle, 'ops-governor | role trade-ops-copilot | role derived')
  assert.equal(displayRow?.recommendationLabel, 'Keep staged')
  assert.equal(displayRow?.recommendationTone, 'attention')
  assert.equal(displayRow?.reasons[0], 'Pending actions must be cleared before promotion.')
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Approval rate'),
    { label: 'Approval rate', value: '83%' },
  )
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Approved as-is'),
    { label: 'Approved as-is', value: '9' },
  )
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Tool errors'),
    { label: 'Tool errors', value: '2 (9.5%)' },
  )
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Unsupported'),
    { label: 'Unsupported', value: '1' },
  )
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Duplicate'),
    { label: 'Duplicate', value: '1' },
  )
})

test('assistant outcome action rows summarize action-type readiness', () => {
  const row: AssistantActionTypeOutcomeMetricRow = {
    ...baseCounters,
    action_type: 'update_trade_workflow_item',
    recommendation: {
      recommended_action: 'RECOMMEND_PAUSE',
      promotion_candidate: false,
      pause_recommended: true,
      reasons: ['Failed execution rate exceeds the pause threshold.'],
    },
  }

  const [displayRow] = buildAssistantActionTypeOutcomeRows(
    [row],
    new Map([
      [
        'update_trade_workflow_item',
        {
          name: 'update_trade_workflow_item' as const,
          label: 'Update workflow item',
          description: 'Catalog label supplied by the assistant runtime settings endpoint.',
        },
      ],
    ]),
  )

  assert.equal(displayRow?.key, 'update_trade_workflow_item')
  assert.equal(displayRow?.title, 'Update workflow item')
  assert.equal(displayRow?.subtitle, '12 decided of 12 staged')
  assert.equal(displayRow?.recommendationTone, 'danger')
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Avg decision'),
    { label: 'Avg decision', value: '1.5h' },
  )
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Approved as-is'),
    { label: 'Approved as-is', value: '9' },
  )
})

test('assistant outcome role and profile rows expose health signals', () => {
  const roleRow: AssistantRoleOutcomeMetricRow = {
    ...baseCounters,
    agent_role_key: 'operations-coordinator',
    run_count: 4,
    completed_run_count: 4,
    failed_run_count: 0,
    warning_count: 1,
    warning_rate: 0.25,
    tool_call_count: 8,
    tool_error_count: 1,
    tool_error_rate: 0.125,
    recommendation: {
      recommended_action: 'RECOMMEND_PAUSE',
      promotion_candidate: false,
      pause_recommended: true,
      reasons: ['Unsupported tool or action attempts were observed.'],
    },
  }
  const profileRow: AssistantProfileOutcomeMetricRow = {
    ...baseCounters,
    agent_profile_kind: 'ROLE_DERIVED',
    run_count: 4,
    completed_run_count: 4,
    failed_run_count: 0,
    warning_count: 1,
    warning_rate: 0.25,
    tool_call_count: 8,
    tool_error_count: 1,
    tool_error_rate: 0.125,
    recommendation: roleRow.recommendation,
  }

  const [roleDisplayRow] = buildAssistantRoleOutcomeRows([roleRow])
  const [profileDisplayRow] = buildAssistantProfileOutcomeRows([profileRow])

  assert.equal(roleDisplayRow?.title, 'operations-coordinator')
  assert.equal(roleDisplayRow?.recommendationLabel, 'Pause recommended')
  assert.deepEqual(
    roleDisplayRow?.metrics.find((metric) => metric.label === 'Tool errors'),
    { label: 'Tool errors', value: '1 (13%)' },
  )
  assert.equal(profileDisplayRow?.title, 'role derived')
  assert.deepEqual(
    profileDisplayRow?.metrics.find((metric) => metric.label === 'Policy drift'),
    { label: 'Policy drift', value: '0' },
  )
})

test('assistant workspace feedback rows put needs-work workspaces first', () => {
  const rows: AssistantWorkspaceFeedbackMetricRow[] = [
    {
      workspace: 'trades',
      run_count: 5,
      helpful_feedback_count: 3,
      needs_work_feedback_count: 0,
      feedback_count: 3,
      feedback_helpful_rate: 1,
    },
    {
      workspace: 'assistant',
      run_count: 2,
      helpful_feedback_count: 0,
      needs_work_feedback_count: 1,
      feedback_count: 1,
      feedback_helpful_rate: 0,
    },
  ]

  const [firstRow, secondRow] = buildAssistantWorkspaceFeedbackRows(rows)

  assert.equal(firstRow?.key, 'assistant')
  assert.equal(firstRow?.tone, 'attention')
  assert.deepEqual(
    firstRow?.metrics.find((metric) => metric.label === 'Feedback'),
    { label: 'Feedback', value: '0/1 helpful' },
  )
  assert.equal(secondRow?.key, 'trades')
  assert.equal(secondRow?.tone, 'success')
})

test('assistant prompt navigation target rows surface deterministic rule and narrowing signals', () => {
  const rows: AssistantPromptNavigationTargetMetricRow[] = [
    {
      target_view: 'operations',
      focus_type: 'workflow_item',
      outcome_count: 4,
      accepted_count: 4,
      dismissed_count: 0,
      failed_count: 0,
      acceptance_rate: 1,
      dismiss_rate: 0,
      failure_rate: 0,
      signal: 'CANDIDATE_FOR_RULE',
      signal_reasons: ['Repeated accepted handoffs make this destination a strong deterministic rule candidate.'],
      recent_prompt_examples: ['Where should I clear the confirmation blocker?'],
    },
    {
      target_view: 'settlement',
      focus_type: 'invoice',
      outcome_count: 3,
      accepted_count: 0,
      dismissed_count: 2,
      failed_count: 1,
      acceptance_rate: 0,
      dismiss_rate: 0.6667,
      failure_rate: 0.3333,
      signal: 'NARROW',
      signal_reasons: ['Users dismiss this destination often enough that the routing rule should narrow or ask for confirmation.'],
      recent_prompt_examples: [],
    },
  ]

  assert.equal(assistantPromptNavigationSignalLabel('CANDIDATE_FOR_RULE'), 'Rule candidate')
  assert.equal(assistantPromptNavigationSignalTone('RETIRE'), 'danger')

  const displayRows = buildAssistantPromptNavigationTargetRows(rows)
  const operationsRow = displayRows.find((row) => row.title === 'Work Queue')
  const settlementRow = displayRows.find((row) => row.title === 'Settlement')

  assert.equal(operationsRow?.recommendationLabel, 'Rule candidate')
  assert.deepEqual(
    operationsRow?.metrics.find((metric) => metric.label === 'Accepted'),
    { label: 'Accepted', value: '4 (100%)' },
  )
  assert.equal(settlementRow?.recommendationLabel, 'Narrow route')
})

test('assistant prompt navigation target rows prefer the promoted route label when present', () => {
  const displayRows = buildAssistantPromptNavigationTargetRows([
    {
      target_view: 'operations',
      target_label: 'Open confirmation',
      focus_type: 'trade',
      outcome_count: 3,
      accepted_count: 3,
      dismissed_count: 0,
      failed_count: 0,
      acceptance_rate: 1,
      dismiss_rate: 0,
      failure_rate: 0,
      signal: 'CANDIDATE_FOR_RULE',
      signal_reasons: ['Repeated accepted handoffs make this destination a strong deterministic rule candidate.'],
      recent_prompt_examples: ['Where should I handle the confirmation blocker?'],
    },
  ])

  assert.equal(displayRows[0]?.title, 'Open confirmation')
  assert.match(displayRows[0]?.subtitle ?? '', /trade focus/)
  assert.match(displayRows[0]?.subtitle ?? '', /Work Queue/)
})

test('assistant prompt navigation outcome rows distinguish accepted and failed handoffs', () => {
  const rows: AssistantPromptNavigationOutcomeInsight[] = [
    {
      outcome_id: 10,
      run_id: 8801,
      conversation_id: 601,
      agent_id: null,
      agent_name: null,
      source_workspace: 'assistant',
      user_id: 'ops_admin',
      user_role: 'OPS_ADMIN',
      surface: 'PROMPT_HOME',
      outcome: 'FAILED',
      target_view: null,
      target_label: null,
      focus_type: null,
      focus_id: null,
      focus_label: null,
      detail: 'A workspace handoff suggestion could not be applied and was ignored.',
      latest_user_message: 'Give me a broken handoff.',
      created_at: '2026-04-23T22:10:00Z',
      updated_at: '2026-04-23T22:10:00Z',
    },
    {
      outcome_id: 11,
      run_id: null,
      conversation_id: null,
      agent_id: null,
      agent_name: null,
      source_workspace: null,
      user_id: 'ops_admin',
      user_role: 'OPS_ADMIN',
      surface: 'PROMPT_HOME',
      outcome: 'ACCEPTED',
      target_view: 'operations',
      target_label: 'Open Work Queue',
      focus_type: 'trade',
      focus_id: 'T-AMEND-100',
      focus_label: 'T-AMEND-100',
      detail: null,
      latest_user_message: 'Where should I handle the confirmation blocker?',
      created_at: '2026-04-23T22:12:00Z',
      updated_at: '2026-04-23T22:12:00Z',
    },
  ]

  const [failedRow, acceptedRow] = buildAssistantPromptNavigationOutcomeRows(rows)

  assert.equal(failedRow?.title, 'Failed handoff')
  assert.equal(failedRow?.subtitle, 'Invalid handoff payload')
  assert.equal(failedRow?.tone, 'danger')
  assert.equal(acceptedRow?.title, 'Accepted handoff')
  assert.equal(acceptedRow?.subtitle, 'Open Work Queue')
  assert.equal(acceptedRow?.tone, 'success')
  assert.equal(acceptedRow?.meta[0], 'Home route')
})
