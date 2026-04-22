import assert from 'node:assert/strict'
import { test } from 'vitest'

import type {
  AssistantActionTypeOutcomeMetricRow,
  AssistantAgentOutcomeMetricRow,
} from '../src/shared/models'
import {
  assistantOutcomeRecommendationLabel,
  assistantOutcomeRecommendationTone,
  buildAssistantActionTypeOutcomeRows,
  buildAssistantAgentOutcomeRows,
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
  decided_action_count: 12,
  stale_action_count: 0,
  approval_rate: 0.8333,
  rejection_rate: 0.0833,
  failed_execution_rate: 0.0833,
  stale_action_rate: 0,
  avg_decision_seconds: 5400,
  oldest_pending_age_seconds: null,
}

test('assistant outcome metric formatting keeps rates and durations compact', () => {
  assert.equal(formatAssistantActionTypeLabel('issue_trade_invoice'), 'issue trade invoice')
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

  const [displayRow] = buildAssistantActionTypeOutcomeRows([row])

  assert.equal(displayRow?.key, 'update_trade_workflow_item')
  assert.equal(displayRow?.title, 'update trade workflow item')
  assert.equal(displayRow?.subtitle, '12 decided of 12 staged')
  assert.equal(displayRow?.recommendationTone, 'danger')
  assert.deepEqual(
    displayRow?.metrics.find((metric) => metric.label === 'Avg decision'),
    { label: 'Avg decision', value: '1.5h' },
  )
})
