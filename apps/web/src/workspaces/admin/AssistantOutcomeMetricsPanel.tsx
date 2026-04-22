import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getAdminAssistantOutcomeMetrics } from '../../entities/assistant/api'
import { appConfig } from '../../shared/config'
import {
  ASSISTANT_ACTION_TYPES,
  type AssistantActionType,
  type AssistantAgentProfileKind,
  type AssistantOutcomeMetrics,
  type AssistantRunFeedbackInsight,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildAssistantActionTypeOutcomeRows,
  buildAssistantAgentOutcomeRows,
  buildAssistantProfileOutcomeRows,
  buildAssistantRoleOutcomeRows,
  buildAssistantWorkspaceFeedbackRows,
  formatAssistantActionTypeLabel,
  formatAssistantOutcomeDuration,
  formatAssistantOutcomeRate,
  type AssistantOutcomeMetricDisplayRow,
  type AssistantOutcomeMetricTone,
  type AssistantWorkspaceFeedbackDisplayRow,
} from './assistantOutcomeMetrics'

type AssistantOutcomeMetricsPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

type OutcomeMetricsFilters = {
  agentId: string
  roleKey: string
  profileKind: AssistantAgentProfileKind | ''
  actionType: AssistantActionType | ''
  createdAfter: string
  createdBefore: string
}

const INITIAL_OUTCOME_FILTERS: OutcomeMetricsFilters = {
  agentId: '',
  roleKey: '',
  profileKind: '',
  actionType: '',
  createdAfter: '',
  createdBefore: '',
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function createdAfterBoundary(dateValue: string): string | undefined {
  return dateValue ? `${dateValue}T00:00:00` : undefined
}

function createdBeforeBoundary(dateValue: string): string | undefined {
  return dateValue ? `${dateValue}T23:59:59` : undefined
}

function statusClassForTone(tone: AssistantOutcomeMetricTone): string {
  switch (tone) {
    case 'success':
      return 'status-pill-active'
    case 'danger':
      return 'status-pill-blocked'
    case 'attention':
      return 'status-pill-planned'
    case 'neutral':
    default:
      return 'status-pill-in-progress'
  }
}

function formatFeedbackRating(rating: AssistantRunFeedbackInsight['rating']): string {
  return rating === 'HELPFUL' ? 'Helpful' : 'Needs work'
}

function renderOutcomeRows(
  rows: AssistantOutcomeMetricDisplayRow[],
  loading: boolean,
  emptyTitle: string,
  emptyMessage: string,
) {
  if (loading && rows.length === 0) {
    return (
      <>
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <strong>{emptyTitle}</strong>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return rows.map((row) => (
    <article key={row.key} className={`assistant-outcome-card is-${row.recommendationTone}`}>
      <div className="assistant-outcome-card-head">
        <div>
          <strong>{row.title}</strong>
          <p>{row.subtitle}</p>
        </div>
        <span className={`status-pill ${statusClassForTone(row.recommendationTone)}`}>
          {row.recommendationLabel}
        </span>
      </div>
      <div className="assistant-outcome-metric-grid">
        {row.metrics.map((metric) => (
          <div key={metric.label} className="assistant-outcome-metric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <ul className="assistant-outcome-reason-list">
        {row.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </article>
  ))
}

function renderWorkspaceFeedbackRows(rows: AssistantWorkspaceFeedbackDisplayRow[], loading: boolean) {
  if (loading && rows.length === 0) {
    return (
      <>
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <strong>No workspace feedback yet</strong>
        <p>User response feedback will appear here once assistant runs receive ratings.</p>
      </div>
    )
  }

  return rows.map((row) => (
    <article key={row.key} className={`assistant-outcome-card is-${row.tone}`}>
      <div className="assistant-outcome-card-head">
        <div>
          <strong>{row.title}</strong>
          <p>{row.subtitle}</p>
        </div>
        <span className={`status-pill ${statusClassForTone(row.tone)}`}>
          {row.tone === 'attention' ? 'Needs review' : row.tone === 'success' ? 'Positive' : 'No signal'}
        </span>
      </div>
      <div className="assistant-outcome-metric-grid assistant-outcome-metric-grid-compact">
        {row.metrics.map((metric) => (
          <div key={metric.label} className="assistant-outcome-metric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
    </article>
  ))
}

function renderRecentFeedbackRows(
  rows: AssistantRunFeedbackInsight[],
  loading: boolean,
  formatDate: (value: string | null | undefined) => string,
) {
  if (loading && rows.length === 0) {
    return (
      <>
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <strong>No recent feedback</strong>
        <p>Rated assistant responses will appear here with run, agent, and workspace context.</p>
      </div>
    )
  }

  return rows.map((row) => {
    const ratingTone: AssistantOutcomeMetricTone = row.rating === 'NEEDS_WORK' ? 'attention' : 'success'
    const agentLabel = row.agent_name?.trim() || row.agent_id?.trim() || 'Unassigned agent'
    const workspaceLabel = row.workspace ? formatAssistantActionTypeLabel(row.workspace) : 'Unknown workspace'

    return (
      <article key={row.feedback_id} className={`assistant-feedback-insight is-${ratingTone}`}>
        <div className="assistant-feedback-insight-head">
          <div>
            <strong>{formatFeedbackRating(row.rating)}</strong>
            <span>{agentLabel}</span>
          </div>
          <span className={`status-pill ${statusClassForTone(ratingTone)}`}>{workspaceLabel}</span>
        </div>
        {row.comment ? <p>{row.comment}</p> : <p>No note provided.</p>}
        <div className="assistant-feedback-insight-meta">
          <span>Run {row.run_id}</span>
          <span>{row.user_id}</span>
          <span>{formatDate(row.updated_at)}</span>
        </div>
      </article>
    )
  })
}

export function AssistantOutcomeMetricsPanel({
  authSession,
  formatDate,
  onOpenSettings,
}: AssistantOutcomeMetricsPanelProps) {
  const requestSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [metrics, setMetrics] = useState<AssistantOutcomeMetrics | null>(null)
  const [filters, setFilters] = useState<OutcomeMetricsFilters>(INITIAL_OUTCOME_FILTERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const agentRows = useMemo(
    () => buildAssistantAgentOutcomeRows(metrics?.by_agent ?? []),
    [metrics],
  )
  const actionTypeRows = useMemo(
    () => buildAssistantActionTypeOutcomeRows(metrics?.by_action_type ?? []),
    [metrics],
  )
  const roleRows = useMemo(
    () => buildAssistantRoleOutcomeRows(metrics?.by_role ?? []),
    [metrics],
  )
  const profileRows = useMemo(
    () => buildAssistantProfileOutcomeRows(metrics?.by_profile ?? []),
    [metrics],
  )
  const workspaceFeedbackRows = useMemo(
    () => buildAssistantWorkspaceFeedbackRows(metrics?.by_workspace ?? []),
    [metrics],
  )
  const recentFeedbackRows = metrics?.recent_feedback ?? []
  const advisoryRows = useMemo(
    () => [
      ...(metrics?.by_agent ?? []),
      ...(metrics?.by_role ?? []),
      ...(metrics?.by_profile ?? []),
      ...(metrics?.by_action_type ?? []),
    ],
    [metrics],
  )
  const totalStagedActions = useMemo(
    () =>
      (metrics?.by_action_type ?? []).reduce(
        (total, row) => total + row.staged_action_count,
        0,
      ),
    [metrics],
  )
  const pendingActions = useMemo(
    () =>
      (metrics?.by_action_type ?? []).reduce(
        (total, row) => total + row.pending_action_count,
        0,
      ),
    [metrics],
  )
  const promotionCandidates = advisoryRows.filter((row) => row.recommendation.promotion_candidate).length
  const pauseRecommendations = advisoryRows.filter((row) => row.recommendation.pause_recommended).length
  const totalFeedbackCount = metrics?.total_feedback_count ?? 0
  const helpfulFeedbackCount = metrics?.helpful_feedback_count ?? 0
  const needsWorkFeedbackCount = metrics?.needs_work_feedback_count ?? 0
  const oldestPendingAgeSeconds = advisoryRows.reduce<number | null>((currentMax, row) => {
    const nextAge = row.oldest_pending_age_seconds
    if (typeof nextAge !== 'number' || !Number.isFinite(nextAge)) {
      return currentMax
    }
    return currentMax === null ? nextAge : Math.max(currentMax, nextAge)
  }, null)
  const hasFilters =
    Boolean(filters.agentId.trim()) ||
    Boolean(filters.roleKey.trim()) ||
    Boolean(filters.profileKind) ||
    Boolean(filters.actionType) ||
    Boolean(filters.createdAfter) ||
    Boolean(filters.createdBefore)

  const refreshMetrics = useCallback(async () => {
    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current

    if (!adminEnabled) {
      setMetrics(null)
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = await getAdminAssistantOutcomeMetrics(appConfig.apiBase, {
        agentId: filters.agentId,
        roleKey: filters.roleKey,
        profileKind: filters.profileKind || undefined,
        actionType: filters.actionType || undefined,
        createdAfter: createdAfterBoundary(filters.createdAfter),
        createdBefore: createdBeforeBoundary(filters.createdBefore),
      })
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setMetrics(payload)
    } catch (nextError) {
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setMetrics(null)
      setError(nextError instanceof Error ? nextError.message : 'Could not load assistant outcome metrics.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [adminEnabled, filters])

  useEffect(() => {
    void refreshMetrics()
  }, [authSession, refreshMetrics])

  function updateFilter<Key extends keyof OutcomeMetricsFilters>(
    key: Key,
    value: OutcomeMetricsFilters[Key],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function resetFilters() {
    setFilters(INITIAL_OUTCOME_FILTERS)
  }

  return (
    <section className="surface">
      <div className="section-head">
        <div>
          <span className="eyebrow">Assistant Governance</span>
          <h3>Outcome Metrics</h3>
        </div>
        <p>Advisory promotion and pause signals based on approved, rejected, failed, and stale staged actions.</p>
      </div>

      {!authSession ? (
        <div className="empty-state assistant-empty-state">
          <strong>Sign in to view outcome metrics</strong>
          <p>Assistant autonomy recommendations are protected and require an authenticated admin session.</p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      ) : !adminEnabled ? (
        <div className="empty-state assistant-empty-state">
          <strong>Administrative access required</strong>
          <p>Only OPS_ADMIN or ADMIN users can inspect assistant promotion and pause recommendations.</p>
        </div>
      ) : (
        <>
          <div className="assistant-admin-summary-grid">
            <article className="assistant-run-summary-card">
              <span>Generated</span>
              <strong>{metrics ? formatDate(metrics.generated_at) : loading ? 'Refreshing' : 'No metrics'}</strong>
              <small>{hasFilters ? 'Filtered outcome window.' : 'All recorded assistant outcomes.'}</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Staged actions</span>
              <strong>{totalStagedActions}</strong>
              <small>{pendingActions} pending action{pendingActions === 1 ? '' : 's'} remain open.</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>User feedback</span>
              <strong>{helpfulFeedbackCount}/{totalFeedbackCount}</strong>
              <small>{formatAssistantOutcomeRate(metrics?.feedback_helpful_rate)} helpful response rate.</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Needs work</span>
              <strong>{needsWorkFeedbackCount}</strong>
              <small>Responses flagged for prompt, evidence, or product follow-up.</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Bounded-review candidates</span>
              <strong>{promotionCandidates}</strong>
              <small>Rows that pass the deterministic promotion thresholds.</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Pause signals</span>
              <strong>{pauseRecommendations}</strong>
              <small>Oldest pending age: {formatAssistantOutcomeDuration(oldestPendingAgeSeconds)}.</small>
            </article>
          </div>

          <div className="assistant-sidebar-block assistant-outcome-toolbar">
            <strong>Outcome filters</strong>
            <p>Narrow the advisory signals by agent, governed action type, and staged action creation date.</p>
            <div className="assistant-admin-form-grid">
              <label className="field">
                <span>Agent ID</span>
                <input
                  className="control"
                  value={filters.agentId}
                  onChange={(event) => updateFilter('agentId', event.target.value)}
                  placeholder="ops-governor"
                />
              </label>
              <label className="field">
                <span>Role key</span>
                <input
                  className="control"
                  value={filters.roleKey}
                  onChange={(event) => updateFilter('roleKey', event.target.value)}
                  placeholder="operations-coordinator"
                />
              </label>
              <label className="field">
                <span>Profile kind</span>
                <select
                  className="control"
                  value={filters.profileKind}
                  onChange={(event) =>
                    updateFilter('profileKind', event.target.value as OutcomeMetricsFilters['profileKind'])
                  }
                >
                  <option value="">All profile kinds</option>
                  <option value="CURATED">Curated</option>
                  <option value="ROLE_DERIVED">Role derived</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>
              <label className="field">
                <span>Action type</span>
                <select
                  className="control"
                  value={filters.actionType}
                  onChange={(event) =>
                    updateFilter('actionType', event.target.value as OutcomeMetricsFilters['actionType'])
                  }
                >
                  <option value="">All action types</option>
                  {ASSISTANT_ACTION_TYPES.map((actionType) => (
                    <option key={actionType} value={actionType}>
                      {formatAssistantActionTypeLabel(actionType)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Created after</span>
                <input
                  className="control"
                  type="date"
                  value={filters.createdAfter}
                  onChange={(event) => updateFilter('createdAfter', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Created before</span>
                <input
                  className="control"
                  type="date"
                  value={filters.createdBefore}
                  onChange={(event) => updateFilter('createdBefore', event.target.value)}
                />
              </label>
            </div>
            <div className="workspace-local-filter-actions">
              <button type="button" className="button button-secondary" onClick={resetFilters} disabled={loading}>
                Reset filters
              </button>
              <button type="button" className="button button-secondary" onClick={refreshMetrics} disabled={loading}>
                Refresh
              </button>
            </div>
          </div>

          {error ? <div className="feedback-banner feedback-banner-error">{error}</div> : null}

          <div className="assistant-outcome-feedback-grid">
            <div className="assistant-outcome-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Feedback</span>
                  <h4>Workspace Signals</h4>
                </div>
                <span>{workspaceFeedbackRows.length} row{workspaceFeedbackRows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="assistant-outcome-list">
                {renderWorkspaceFeedbackRows(workspaceFeedbackRows, loading)}
              </div>
            </div>

            <div className="assistant-outcome-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Feedback</span>
                  <h4>Recent Run Notes</h4>
                </div>
                <span>{recentFeedbackRows.length} item{recentFeedbackRows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="assistant-feedback-insight-list">
                {renderRecentFeedbackRows(recentFeedbackRows, loading, formatDate)}
              </div>
            </div>
          </div>

          <div className="assistant-outcome-grid">
            <div className="assistant-outcome-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Agents</span>
                  <h4>Autonomy Readiness</h4>
                </div>
                <span>{agentRows.length} row{agentRows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="assistant-outcome-list">
                {renderOutcomeRows(
                  agentRows,
                  loading,
                  'No agent outcome rows',
                  'No managed assistant has staged actions in the current outcome window.',
                )}
              </div>
            </div>

            <div className="assistant-outcome-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Roles</span>
                  <h4>Role Health</h4>
                </div>
                <span>{roleRows.length} row{roleRows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="assistant-outcome-list">
                {renderOutcomeRows(
                  roleRows,
                  loading,
                  'No role outcome rows',
                  'No agent role has staged actions in the current outcome window.',
                )}
              </div>
            </div>

            <div className="assistant-outcome-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Profiles</span>
                  <h4>Profile Health</h4>
                </div>
                <span>{profileRows.length} row{profileRows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="assistant-outcome-list">
                {renderOutcomeRows(
                  profileRows,
                  loading,
                  'No profile outcome rows',
                  'No agent profile kind has staged actions in the current outcome window.',
                )}
              </div>
            </div>

            <div className="assistant-outcome-column">
              <div className="assistant-admin-section-head">
                <div>
                  <span className="eyebrow">Action Types</span>
                  <h4>Deterministic Action Signals</h4>
                </div>
                <span>{actionTypeRows.length} row{actionTypeRows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="assistant-outcome-list">
                {renderOutcomeRows(
                  actionTypeRows,
                  loading,
                  'No action-type outcome rows',
                  'No governed action type has staged actions in the current outcome window.',
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
