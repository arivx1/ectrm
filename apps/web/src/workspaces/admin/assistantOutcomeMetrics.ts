import type {
  AssistantActionDefinition,
  AssistantActionTypeOutcomeMetricRow,
  AssistantAgentOutcomeMetricRow,
  AssistantOutcomeMetricRecommendationAction,
  AssistantPromptNavigationOutcomeInsight,
  AssistantPromptNavigationSignal,
  AssistantPromptNavigationTargetMetricRow,
  AssistantProfileOutcomeMetricRow,
  AssistantRoleOutcomeMetricRow,
  AssistantWorkspaceFeedbackMetricRow,
} from '../../shared/models'
import {
  formatAssistantActionTypeLabel as formatCatalogActionTypeLabel,
  type AssistantActionDefinitionMap,
} from '../../entities/assistant/actionCatalog'
import { workspaceLabel } from '../../entities/app/appViews'

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

export type AssistantPromptNavigationOutcomeDisplayRow = {
  key: string
  title: string
  subtitle: string
  tone: AssistantOutcomeMetricTone
  detail: string
  meta: string[]
}

export function formatAssistantActionTypeLabel(
  actionType: string,
  definitionsByName?: AssistantActionDefinitionMap,
): string {
  return formatCatalogActionTypeLabel(actionType, definitionsByName)
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

export function assistantPromptNavigationSignalLabel(signal: AssistantPromptNavigationSignal): string {
  switch (signal) {
    case 'CANDIDATE_FOR_RULE':
      return 'Rule candidate'
    case 'NARROW':
      return 'Narrow route'
    case 'RETIRE':
      return 'Pause route'
    case 'OBSERVE':
    default:
      return 'Observe'
  }
}

export function assistantPromptNavigationSignalTone(
  signal: AssistantPromptNavigationSignal,
): AssistantOutcomeMetricTone {
  switch (signal) {
    case 'CANDIDATE_FOR_RULE':
      return 'success'
    case 'NARROW':
      return 'attention'
    case 'RETIRE':
      return 'danger'
    case 'OBSERVE':
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

function promptNavigationOutcomeTone(
  outcome: AssistantPromptNavigationOutcomeInsight['outcome'],
): AssistantOutcomeMetricTone {
  switch (outcome) {
    case 'ACCEPTED':
      return 'success'
    case 'DISMISSED':
      return 'attention'
    case 'FAILED':
      return 'danger'
    default:
      return 'neutral'
  }
}

function promptNavigationOutcomeLabel(
  outcome: AssistantPromptNavigationOutcomeInsight['outcome'],
): string {
  switch (outcome) {
    case 'ACCEPTED':
      return 'Accepted handoff'
    case 'DISMISSED':
      return 'Dismissed handoff'
    case 'FAILED':
      return 'Failed handoff'
    default:
      return 'Prompt handoff'
  }
}

function promptNavigationTargetLabel(row: AssistantPromptNavigationTargetMetricRow): string {
  return row.target_label?.trim() || (row.target_view ? workspaceLabel(row.target_view) : 'Invalid handoff payload')
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
        { label: 'Tool errors', value: `${row.tool_error_count} (${formatAssistantOutcomeRate(row.tool_error_rate)})` },
        {
          label: 'Feedback',
          value: formatFeedbackCounts(row.helpful_feedback_count, row.needs_work_feedback_count),
        },
        { label: 'Needs work', value: String(row.needs_work_feedback_count) },
        { label: 'Staged actions', value: String(row.staged_action_count) },
        { label: 'Approval rate', value: formatAssistantOutcomeRate(row.approval_rate) },
        { label: 'Rejected', value: formatAssistantOutcomeRate(row.rejection_rate) },
        { label: 'Failed', value: formatAssistantOutcomeRate(row.failed_execution_rate) },
        {
          label: 'Corrections',
          value: `${row.correction_count} (${formatAssistantOutcomeRate(row.correction_rate)})`,
        },
        { label: 'Stale', value: formatAssistantOutcomeRate(row.stale_action_rate) },
        { label: 'Unsupported', value: String(row.unsupported_attempt_count) },
        { label: 'Policy drift', value: String(row.policy_drift_count) },
        { label: 'Pending age', value: formatAssistantOutcomeDuration(row.oldest_pending_age_seconds) },
      ],
    }
  })
}

export function buildAssistantRoleOutcomeRows(
  rows: AssistantRoleOutcomeMetricRow[],
): AssistantOutcomeMetricDisplayRow[] {
  return rows.map((row) => ({
    key: row.agent_role_key ?? 'unknown-role',
    title: row.agent_role_key ?? 'Unknown role',
    subtitle: `${row.completed_run_count}/${row.run_count} completed runs`,
    recommendationLabel: assistantOutcomeRecommendationLabel(row.recommendation.recommended_action),
    recommendationTone: assistantOutcomeRecommendationTone(row.recommendation.recommended_action),
    reasons: recommendationReasons(row.recommendation.reasons),
    metrics: [
      { label: 'Runs', value: `${row.completed_run_count}/${row.run_count}` },
      { label: 'Warnings', value: `${row.warning_count} (${formatAssistantOutcomeRate(row.warning_rate)})` },
      { label: 'Tool errors', value: `${row.tool_error_count} (${formatAssistantOutcomeRate(row.tool_error_rate)})` },
      { label: 'Staged actions', value: String(row.staged_action_count) },
      { label: 'Approval rate', value: formatAssistantOutcomeRate(row.approval_rate) },
      { label: 'Rejected', value: formatAssistantOutcomeRate(row.rejection_rate) },
      { label: 'Failed', value: formatAssistantOutcomeRate(row.failed_execution_rate) },
      { label: 'Stale', value: formatAssistantOutcomeRate(row.stale_action_rate) },
      { label: 'Unsupported', value: String(row.unsupported_attempt_count) },
      { label: 'Policy drift', value: String(row.policy_drift_count) },
      { label: 'Pending age', value: formatAssistantOutcomeDuration(row.oldest_pending_age_seconds) },
    ],
  }))
}

export function buildAssistantProfileOutcomeRows(
  rows: AssistantProfileOutcomeMetricRow[],
): AssistantOutcomeMetricDisplayRow[] {
  return rows.map((row) => {
    const profileLabel = row.agent_profile_kind
      ? row.agent_profile_kind.toLowerCase().replace(/_/g, ' ')
      : 'Unknown profile'

    return {
      key: row.agent_profile_kind ?? 'unknown-profile',
      title: profileLabel,
      subtitle: `${row.completed_run_count}/${row.run_count} completed runs`,
      recommendationLabel: assistantOutcomeRecommendationLabel(row.recommendation.recommended_action),
      recommendationTone: assistantOutcomeRecommendationTone(row.recommendation.recommended_action),
      reasons: recommendationReasons(row.recommendation.reasons),
      metrics: [
        { label: 'Runs', value: `${row.completed_run_count}/${row.run_count}` },
        { label: 'Warnings', value: `${row.warning_count} (${formatAssistantOutcomeRate(row.warning_rate)})` },
        { label: 'Tool errors', value: `${row.tool_error_count} (${formatAssistantOutcomeRate(row.tool_error_rate)})` },
        { label: 'Staged actions', value: String(row.staged_action_count) },
        { label: 'Approval rate', value: formatAssistantOutcomeRate(row.approval_rate) },
        { label: 'Rejected', value: formatAssistantOutcomeRate(row.rejection_rate) },
        { label: 'Failed', value: formatAssistantOutcomeRate(row.failed_execution_rate) },
        { label: 'Stale', value: formatAssistantOutcomeRate(row.stale_action_rate) },
        { label: 'Unsupported', value: String(row.unsupported_attempt_count) },
        { label: 'Policy drift', value: String(row.policy_drift_count) },
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

export function buildAssistantPromptNavigationTargetRows(
  rows: AssistantPromptNavigationTargetMetricRow[],
): AssistantOutcomeMetricDisplayRow[] {
  return [...rows]
    .sort((left, right) => {
      const signalPriority = (signal: AssistantPromptNavigationSignal) => {
        switch (signal) {
          case 'RETIRE':
            return 3
          case 'NARROW':
            return 2
          case 'CANDIDATE_FOR_RULE':
            return 1
          case 'OBSERVE':
          default:
            return 0
        }
      }
      const priorityDelta = signalPriority(right.signal) - signalPriority(left.signal)
      if (priorityDelta !== 0) {
        return priorityDelta
      }
      return right.outcome_count - left.outcome_count
    })
    .map((row) => {
      const focusLabel = row.focus_type ? row.focus_type.replace(/_/g, ' ') : 'workspace'
      const reasons = [...row.signal_reasons]
      if (row.recent_prompt_examples.length > 0) {
        reasons.push(`Recent prompts: ${row.recent_prompt_examples.slice(0, 2).join(' | ')}`)
      }

      return {
        key: `${row.target_view ?? 'invalid'}:${row.target_label ?? 'unlabeled'}:${row.focus_type ?? 'workspace'}`,
        title: promptNavigationTargetLabel(row),
        subtitle: `${focusLabel} focus${row.target_view ? ` · ${workspaceLabel(row.target_view)}` : ''} · ${row.outcome_count} outcome${row.outcome_count === 1 ? '' : 's'}`,
        recommendationLabel: assistantPromptNavigationSignalLabel(row.signal),
        recommendationTone: assistantPromptNavigationSignalTone(row.signal),
        reasons,
        metrics: [
          { label: 'Accepted', value: `${row.accepted_count} (${formatAssistantOutcomeRate(row.acceptance_rate)})` },
          { label: 'Dismissed', value: `${row.dismissed_count} (${formatAssistantOutcomeRate(row.dismiss_rate)})` },
          { label: 'Failed', value: `${row.failed_count} (${formatAssistantOutcomeRate(row.failure_rate)})` },
        ],
      }
    })
}

export function buildAssistantPromptNavigationOutcomeRows(
  rows: AssistantPromptNavigationOutcomeInsight[],
): AssistantPromptNavigationOutcomeDisplayRow[] {
  return rows.map((row) => {
    const destinationLabel = row.target_label?.trim() || (row.target_view ? workspaceLabel(row.target_view) : 'Invalid handoff payload')
      return {
        key: String(row.outcome_id),
        title: promptNavigationOutcomeLabel(row.outcome),
        subtitle: destinationLabel,
        tone: promptNavigationOutcomeTone(row.outcome),
      detail:
        row.detail?.trim() ||
        row.latest_user_message?.trim() ||
        'Prompt-first route outcome recorded without an additional note.',
      meta: [
        typeof row.run_id === 'number' ? `Run ${row.run_id}` : 'Prompt Home route',
        ...(row.target_view ? [`Target ${workspaceLabel(row.target_view)}`] : []),
        ...(row.focus_label?.trim() ? [row.focus_label.trim()] : row.focus_id?.trim() ? [row.focus_id.trim()] : []),
      ],
    }
  })
}

export function buildAssistantActionTypeOutcomeRows(
  rows: AssistantActionTypeOutcomeMetricRow[],
  actionDefinitionsByName?: ReadonlyMap<string, AssistantActionDefinition>,
): AssistantOutcomeMetricDisplayRow[] {
  return rows.map((row) => ({
    key: row.action_type,
    title: formatAssistantActionTypeLabel(row.action_type, actionDefinitionsByName),
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
      {
        label: 'Corrections',
        value: `${row.correction_count} (${formatAssistantOutcomeRate(row.correction_rate)})`,
      },
      { label: 'Stale', value: formatAssistantOutcomeRate(row.stale_action_rate) },
      { label: 'Unsupported', value: String(row.unsupported_attempt_count) },
      { label: 'Policy drift', value: String(row.policy_drift_count) },
      { label: 'Avg decision', value: formatAssistantOutcomeDuration(row.avg_decision_seconds) },
    ],
  }))
}
