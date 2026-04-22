import type {
  AssistantActionTypeOutcomeMetricRow,
  AssistantAgentOutcomeMetricRow,
  AssistantOutcomeMetricRecommendationAction,
  AssistantWorkspaceFeedbackMetricRow,
} from '../../shared/models'

export type AssistantOutcomeMetricTone = 'success' | 'attention' | 'danger' | 'neutral'

export type AssistantOutcomeMetricDisplayMetric = {
  label: string
  value: string
}

export type AssistantOutcomeMetricDisplayRow = {
  key: string
  title: string
  subtitle: string
  recommendationLabel: string
  recommendationTone: AssistantOutcomeMetricTone
  reasons: string[]
  metrics: AssistantOutcomeMetricDisplayMetric[]
}

export type AssistantWorkspaceFeedbackDisplayRow = {
  key: string
  title: string
  subtitle: string
  tone: AssistantOutcomeMetricTone
  metrics: AssistantOutcomeMetricDisplayMetric[]
}

export function formatAssistantActionTypeLabel(actionType: string): string {
  return actionType.replace(/_/g, ' ')
}

export function formatAssistantOutcomeRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a'
  }

  const percent = value * 100
  if (percent > 0 && percent < 10) {
    return `${percent.toFixed(1)}%`
  }

  return `${Math.round(percent)}%`
}

export function formatAssistantOutcomeDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return 'n/a'
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }

  const minutes = seconds / 60
  if (minutes < 60) {
    return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)}m`
  }

  const hours = minutes / 60
  if (hours < 48) {
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`
  }

  return `${(hours / 24).toFixed(1)}d`
}

export function assistantOutcomeRecommendationLabel(
  action: AssistantOutcomeMetricRecommendationAction,
): string {
  switch (action) {
    case 'ELIGIBLE_FOR_BOUNDED_REVIEW':
      return 'Bounded review candidate'
    case 'RECOMMEND_PAUSE':
      return 'Pause recommended'
    case 'KEEP_STAGED':
      return 'Keep staged'
    case 'INSUFFICIENT_DATA':
    default:
      return 'Needs more evidence'
  }
}

export function assistantOutcomeRecommendationTone(
  action: AssistantOutcomeMetricRecommendationAction,
): AssistantOutcomeMetricTone {
  switch (action) {
    case 'ELIGIBLE_FOR_BOUNDED_REVIEW':
      return 'success'
    case 'RECOMMEND_PAUSE':
      return 'danger'
    case 'KEEP_STAGED':
      return 'attention'
    case 'INSUFFICIENT_DATA':
    default:
      return 'neutral'
  }
}

function recommendationReasons(reasons: string[]): string[] {
  return reasons.length > 0 ? reasons : ['No recommendation details returned.']
}

function formatFeedbackCounts(helpfulCount: number, needsWorkCount: number): string {
  const totalCount = helpfulCount + needsWorkCount
  return `${helpfulCount}/${totalCount} helpful`
}

function feedbackTone(row: {
  feedback_count: number
  needs_work_feedback_count: number
}): AssistantOutcomeMetricTone {
  if (row.feedback_count === 0) {
    return 'neutral'
  }
  if (row.needs_work_feedback_count > 0) {
    return 'attention'
  }
  return 'success'
}

export function buildAssistantAgentOutcomeRows(
  rows: AssistantAgentOutcomeMetricRow[],
): AssistantOutcomeMetricDisplayRow[] {
  return rows.map((row) => {
    const title = row.agent_name?.trim() || row.agent_id?.trim() || 'Unassigned agent'
    const subtitleParts = [
      row.agent_name?.trim() ? row.agent_id : null,
      row.agent_role_key ? `role ${row.agent_role_key}` : null,
      row.agent_profile_kind ? row.agent_profile_kind.toLowerCase().replace(/_/g, ' ') : null,
    ].filter((part): part is string => typeof part === 'string' && part.length > 0)

    return {
      key: row.agent_id ?? title,
      title,
      subtitle: subtitleParts.join(' | ') || 'No agent metadata',
      recommendationLabel: assistantOutcomeRecommendationLabel(row.recommendation.recommended_action),
      recommendationTone: assistantOutcomeRecommendationTone(row.recommendation.recommended_action),
      reasons: recommendationReasons(row.recommendation.reasons),
      metrics: [
        { label: 'Runs', value: `${row.completed_run_count}/${row.run_count}` },
        { label: 'Warnings', value: `${row.warning_count} (${formatAssistantOutcomeRate(row.warning_rate)})` },
        {
          label: 'Feedback',
          value: formatFeedbackCounts(row.helpful_feedback_count, row.needs_work_feedback_count),
        },
        { label: 'Needs work', value: String(row.needs_work_feedback_count) },
        { label: 'Staged actions', value: String(row.staged_action_count) },
        { label: 'Approval rate', value: formatAssistantOutcomeRate(row.approval_rate) },
        { label: 'Rejected', value: formatAssistantOutcomeRate(row.rejection_rate) },
        { label: 'Failed', value: formatAssistantOutcomeRate(row.failed_execution_rate) },
        { label: 'Stale', value: formatAssistantOutcomeRate(row.stale_action_rate) },
        { label: 'Pending age', value: formatAssistantOutcomeDuration(row.oldest_pending_age_seconds) },
      ],
    }
  })
}

export function buildAssistantWorkspaceFeedbackRows(
  rows: AssistantWorkspaceFeedbackMetricRow[],
): AssistantWorkspaceFeedbackDisplayRow[] {
  return [...rows]
    .sort((left, right) => {
      const needsWorkDelta = right.needs_work_feedback_count - left.needs_work_feedback_count
      if (needsWorkDelta !== 0) {
        return needsWorkDelta
      }
      return right.feedback_count - left.feedback_count
    })
    .map((row) => ({
      key: row.workspace ?? 'unknown',
      title: row.workspace ? formatAssistantActionTypeLabel(row.workspace) : 'Unknown workspace',
      subtitle: `${row.run_count} run${row.run_count === 1 ? '' : 's'} with outcome context`,
      tone: feedbackTone(row),
      metrics: [
        {
          label: 'Feedback',
          value: formatFeedbackCounts(row.helpful_feedback_count, row.needs_work_feedback_count),
        },
        { label: 'Needs work', value: String(row.needs_work_feedback_count) },
        { label: 'Helpful rate', value: formatAssistantOutcomeRate(row.feedback_helpful_rate) },
      ],
    }))
}

export function buildAssistantActionTypeOutcomeRows(
  rows: AssistantActionTypeOutcomeMetricRow[],
): AssistantOutcomeMetricDisplayRow[] {
  return rows.map((row) => ({
    key: row.action_type,
    title: formatAssistantActionTypeLabel(row.action_type),
    subtitle: `${row.decided_action_count} decided of ${row.staged_action_count} staged`,
    recommendationLabel: assistantOutcomeRecommendationLabel(row.recommendation.recommended_action),
    recommendationTone: assistantOutcomeRecommendationTone(row.recommendation.recommended_action),
    reasons: recommendationReasons(row.recommendation.reasons),
    metrics: [
      { label: 'Staged actions', value: String(row.staged_action_count) },
      { label: 'Pending', value: String(row.pending_action_count) },
      { label: 'Approval rate', value: formatAssistantOutcomeRate(row.approval_rate) },
      { label: 'Rejected', value: formatAssistantOutcomeRate(row.rejection_rate) },
      { label: 'Failed', value: formatAssistantOutcomeRate(row.failed_execution_rate) },
      { label: 'Stale', value: formatAssistantOutcomeRate(row.stale_action_rate) },
      { label: 'Avg decision', value: formatAssistantOutcomeDuration(row.avg_decision_seconds) },
    ],
  }))
}
