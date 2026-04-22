import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getAdminAssistantControlTowerSummary } from '../../entities/assistant/api'
import { formatAssistantActionTypeLabel } from '../../entities/assistant/actionCatalog'
import { appConfig } from '../../shared/config'
import {
  type AssistantControlTowerAgentTrustSignal,
  type AssistantControlTowerSummary,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type AssistantControlTowerPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
  initialSummary?: AssistantControlTowerSummary | null
}

type ControlTowerCard = {
  label: string
  value: string | number
  note: string
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function formatAgeSeconds(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'No age available'
  }
  if (value < 60) {
    return `${Math.max(1, Math.round(value))}s waiting`
  }

  const minutes = value / 60
  if (minutes < 60) {
    return `${Math.round(minutes)}m waiting`
  }

  const hours = minutes / 60
  if (hours < 48) {
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h waiting`
  }

  return `${(hours / 24).toFixed(1)}d waiting`
}

function signalTypeLabel(signal: AssistantControlTowerAgentTrustSignal['signal_type']): string {
  switch (signal) {
    case 'MISSING_EVAL_COVERAGE':
      return 'Missing eval coverage'
    case 'POLICY_WARNING':
      return 'Policy warning'
    case 'RUN_WARNING':
      return 'Run warning'
    case 'ACTION_BACKLOG':
      return 'Action backlog'
    case 'FAILED_ACTIONS':
      return 'Failed actions'
    default:
      return signal
  }
}

function signalTone(signal: AssistantControlTowerAgentTrustSignal['severity']): 'blocked' | 'planned' | 'in-progress' {
  switch (signal) {
    case 'danger':
      return 'blocked'
    case 'warning':
      return 'planned'
    default:
      return 'in-progress'
  }
}

function signalCardTone(signal: AssistantControlTowerAgentTrustSignal['severity']): 'danger' | 'attention' | 'neutral' {
  switch (signal) {
    case 'danger':
      return 'danger'
    case 'warning':
      return 'attention'
    default:
      return 'neutral'
  }
}

function trustSignalSortKey(signal: AssistantControlTowerAgentTrustSignal): string {
  const severityRank = signal.severity === 'danger' ? '0' : signal.severity === 'warning' ? '1' : '2'
  return `${severityRank}:${signal.agent_id}:${signal.signal_type}`
}

function summaryCards(summary: AssistantControlTowerSummary): ControlTowerCard[] {
  return [
    {
      label: 'Agent Roster',
      value: summary.roster.total_count,
      note: `${summary.roster.active_count} active · ${summary.roster.paused_count} paused · ${summary.roster.draft_count} draft`,
    },
    {
      label: 'Action Capable',
      value: summary.roster.action_capable_count,
      note: `${summary.roster.missing_eval_coverage_count} eval gap${summary.roster.missing_eval_coverage_count === 1 ? '' : 's'} · ${summary.roster.policy_warning_count} policy warning${summary.roster.policy_warning_count === 1 ? '' : 's'}`,
    },
    {
      label: 'Recent Runs',
      value: summary.runs.total_count,
      note: `${summary.runs.completed_count} completed · ${summary.runs.failed_count} failed · ${summary.runs.warning_count} warning${summary.runs.warning_count === 1 ? '' : 's'}`,
    },
    {
      label: 'Pending Actions',
      value: summary.actions.pending_count,
      note: `${summary.actions.failed_count} failed · ${summary.actions.rejected_count} rejected · ${summary.actions.preview_blocked_count} blocked preview${summary.actions.preview_blocked_count === 1 ? '' : 's'}`,
    },
  ]
}

export function AssistantControlTowerPanel({
  authSession,
  formatDate,
  onOpenSettings,
  initialSummary = null,
}: AssistantControlTowerPanelProps) {
  const requestSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)
  const [summary, setSummary] = useState<AssistantControlTowerSummary | null>(initialSummary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshSummary = useCallback(async () => {
    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current

    if (!adminEnabled) {
      setSummary(null)
      setLoading(false)
      setError('')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = await getAdminAssistantControlTowerSummary(appConfig.apiBase)
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setSummary(payload)
    } catch (nextError) {
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setError(nextError instanceof Error ? nextError.message : 'Could not load assistant control tower summary.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [adminEnabled])

  useEffect(() => {
    void refreshSummary()
  }, [authSession, refreshSummary])

  const cards = useMemo(() => (summary ? summaryCards(summary) : []), [summary])
  const trustSignals = useMemo(
    () => [...(summary?.trust_signals ?? [])].sort((left, right) => trustSignalSortKey(left).localeCompare(trustSignalSortKey(right))),
    [summary],
  )
  const oldestPendingAction = summary?.actions.oldest_pending_action ?? null
  const latestRunLabel = summary?.runs.latest_run_at ? formatDate(summary.runs.latest_run_at) : 'No run history yet'

  return (
    <section className="surface feature-panel assistant-control-tower-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Agent Control Tower</span>
          <h3>Human Watch Floor</h3>
        </div>
        <p>
          One supervisory readout for agent posture, staged actions, recent failures, and governance signals.
        </p>
      </div>

      {!authSession ? (
        <div className="empty-state assistant-empty-state">
          <strong>Sign in to view the control tower</strong>
          <p>Agent operating posture is protected and requires an authenticated admin session.</p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      ) : !adminEnabled ? (
        <div className="empty-state assistant-empty-state">
          <strong>Administrative access required</strong>
          <p>Only OPS_ADMIN or ADMIN users can inspect protected agent control data.</p>
        </div>
      ) : (
        <>
          <div className="assistant-control-tower-banner">
            <div>
              <strong>Phase 1 autonomy posture</strong>
              <p>
                These are supervisory signals, not automatic enforcement. Humans still approve staged actions,
                pause or narrow agents, and decide when deterministic rules are ready to graduate.
              </p>
            </div>
            <div className="assistant-control-tower-actions">
              <a className="button button-secondary" href="#assistant-agent-management">
                Agent Registry
              </a>
              <a className="button button-secondary" href="#assistant-approval-inbox">
                Approval Inbox
              </a>
              <button type="button" className="button button-primary" onClick={() => void refreshSummary()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh Tower'}
              </button>
            </div>
          </div>

          {error ? <div className="feedback-banner feedback-banner-error">{error}</div> : null}

          {loading && !summary ? (
            <div className="assistant-admin-summary-grid">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : summary ? (
            <>
              <div className="assistant-admin-summary-grid">
                {cards.map((card) => (
                  <article key={card.label} className="admin-summary-card">
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    <p>{card.note}</p>
                  </article>
                ))}
              </div>

              <div className="assistant-control-tower-grid">
                <article className="assistant-control-tower-highlight">
                  <div>
                    <span className="eyebrow">Oldest Pending Action</span>
                    <h4>{oldestPendingAction ? oldestPendingAction.summary : 'No pending action backlog'}</h4>
                  </div>
                  {oldestPendingAction ? (
                    <>
                      <p>
                        {formatAssistantActionTypeLabel(oldestPendingAction.action_type)} staged by{' '}
                        {oldestPendingAction.agent_name ?? oldestPendingAction.agent_id ?? 'Unassigned agent'} for{' '}
                        {oldestPendingAction.user_id}.
                      </p>
                      <div className="assistant-control-tower-meta">
                        <span>{formatAgeSeconds(oldestPendingAction.age_seconds)}</span>
                        <span>{formatDate(oldestPendingAction.created_at)}</span>
                      </div>
                    </>
                  ) : (
                    <p>Nothing is waiting for approval right now. Keep the inbox clean before expanding authority.</p>
                  )}
                  <a className="button button-secondary" href="#assistant-approval-inbox">
                    Open Approval Inbox
                  </a>
                </article>

                <article className="assistant-control-tower-highlight">
                  <div>
                    <span className="eyebrow">Run Posture</span>
                    <h4>{formatCount(summary.runs.failed_count, 'failed run')}</h4>
                  </div>
                  <p>
                    Latest run: {latestRunLabel}. Agents made {formatCount(summary.runs.tool_call_count, 'tool call')}{' '}
                    across the current summary window.
                  </p>
                  <div className="assistant-control-tower-meta">
                    <span>{formatCount(summary.runs.warning_count, 'warning')}</span>
                    <span>{formatCount(summary.actions.failed_count, 'failed action')}</span>
                    <span>{formatCount(summary.actions.rejected_count, 'rejected action')}</span>
                  </div>
                  <a className="button button-secondary" href="#assistant-outcome-metrics">
                    Review Outcome Metrics
                  </a>
                </article>
              </div>

              <div className="assistant-control-tower-trust-section">
                <div className="assistant-admin-section-head">
                  <div>
                    <span className="eyebrow">Trust Signals</span>
                    <h4>What supervisors should look at first</h4>
                  </div>
                  <span>{formatCount(trustSignals.length, 'signal')}</span>
                </div>

                {trustSignals.length === 0 ? (
                  <div className="empty-state">
                    <strong>No trust signals in this snapshot</strong>
                    <p>There are no policy warnings, eval gaps, failed actions, run warnings, or pending backlogs.</p>
                  </div>
                ) : (
                  <div className="assistant-control-tower-signal-list">
                    {trustSignals.slice(0, 8).map((signal) => (
                      <article
                        key={`${signal.agent_id}-${signal.signal_type}`}
                        className={`assistant-control-tower-signal is-${signalCardTone(signal.severity)}`}
                      >
                        <div className="assistant-control-tower-signal-head">
                          <div>
                            <strong>{signal.agent_name}</strong>
                            <span>
                              {signal.role_key ?? signal.profile_kind ?? 'Custom agent'} · {signal.status}
                            </span>
                          </div>
                          <span className={`status-pill status-pill-${signalTone(signal.severity)}`}>
                            {signalTypeLabel(signal.signal_type)}
                          </span>
                        </div>
                        <p>{signal.summary}</p>
                        {signal.details.length > 0 ? (
                          <ul className="assistant-control-tower-detail-list">
                            {signal.details.slice(0, 2).map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="assistant-control-tower-meta">
                          <span>{formatCount(signal.pending_action_count, 'pending action')}</span>
                          <span>{formatCount(signal.failed_action_count, 'failed action')}</span>
                          <span>{signal.eval_status ?? 'Eval n/a'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state assistant-empty-state">
              <strong>No control tower summary loaded</strong>
              <p>Refresh the tower to load current agent posture from the admin API.</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
