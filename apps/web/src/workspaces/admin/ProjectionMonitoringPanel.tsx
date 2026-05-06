import { useEffect, useMemo, useState } from 'react'

import {
  loadTradeProjectionMonitoring,
  runTradeProjectionMonitoring,
  saveTradeProjectionMonitoring,
  type ProjectionAlertChannel,
  type ProjectionAutoCleanMode,
  type ProjectionMonitoringDeliveryStatus,
  type ProjectionMonitoringHealthStatus,
  type TradeProjectionMonitoringAdminRecord,
  type TradeProjectionMonitoringDocument,
  type TradeProjectionMonitoringRunResult,
} from '../../entities/app/adminApi'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type ProjectionMonitoringPanelProps = {
  authSession: StoredAuthSession | null
  onOpenSettings: () => void
  onRefreshData: () => Promise<void>
  formatDate: (value: string | null | undefined) => string
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

const CHANNEL_OPTIONS: Array<{ value: ProjectionAlertChannel; label: string }> = [
  { value: 'ADMIN_WORKSPACE', label: 'Admin Workspace' },
  { value: 'EMAIL', label: 'Email Digest' },
  { value: 'SLACK', label: 'Slack / Chat' },
  { value: 'INCIDENT_QUEUE', label: 'Incident Queue' },
]

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function cloneMonitoringDocument(document: TradeProjectionMonitoringDocument): TradeProjectionMonitoringDocument {
  return JSON.parse(JSON.stringify(document)) as TradeProjectionMonitoringDocument
}

function cadenceLabel(intervalMinutes: number): string {
  if (intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60
    return hours === 1 ? 'Hourly' : `Every ${hours}h`
  }
  return `Every ${intervalMinutes}m`
}

function autoCleanLabel(mode: ProjectionAutoCleanMode): string {
  return mode === 'clean_auto_cleanable' ? 'Clean Auto-cleanable' : 'Manual Only'
}

function monitoringTone(
  health: ProjectionMonitoringHealthStatus,
): 'active' | 'blocked' | 'cancelled' | 'planned' {
  switch (health) {
    case 'healthy':
      return 'active'
    case 'critical':
      return 'cancelled'
    case 'disabled':
      return 'planned'
    default:
      return 'blocked'
  }
}

function monitoringLabel(health: ProjectionMonitoringHealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'Healthy'
    case 'critical':
      return 'Critical'
    case 'attention':
      return 'Attention'
    case 'disabled':
      return 'Disabled'
    default:
      return 'Unknown'
  }
}

function summarizeRunResult(result: TradeProjectionMonitoringRunResult): string {
  if (!result.executed) {
    return result.summary
  }
  if (result.emitted_deliveries.length > 0) {
    return `${result.summary} ${result.emitted_deliveries.length} delivery outcome${result.emitted_deliveries.length === 1 ? '' : 's'} recorded.`
  }
  if (result.issue_count_after === 0) {
    return result.summary
  }
  return `${result.summary} Last cycle finished ${result.evaluated_at}.`
}

function deliveryStatusLabel(status: ProjectionMonitoringDeliveryStatus): string {
  switch (status) {
    case 'delivered':
      return 'Delivered'
    case 'failed':
      return 'Failed'
    case 'queued':
      return 'Queued'
    case 'skipped':
      return 'Skipped'
    default:
      return status
  }
}

export function ProjectionMonitoringPanel({
  authSession,
  onOpenSettings,
  onRefreshData,
  formatDate,
}: ProjectionMonitoringPanelProps) {
  const [monitoringRecord, setMonitoringRecord] = useState<TradeProjectionMonitoringAdminRecord | null>(null)
  const [monitoringDraft, setMonitoringDraft] = useState<TradeProjectionMonitoringDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)

  const adminEnabled = hasAdministrativeAccess(authSession)

  useEffect(() => {
    if (!adminEnabled || !authSession) {
      setMonitoringRecord(null)
      setMonitoringDraft(null)
      setLoading(false)
      setSaving(false)
      setRunning(false)
      setError('')
      setFlash(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    loadTradeProjectionMonitoring(appConfig.apiBase, authSession.accessToken)
      .then((payload) => {
        if (!cancelled) {
          setMonitoringRecord(payload)
          setMonitoringDraft(cloneMonitoringDocument(payload.document))
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load projection monitoring.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [adminEnabled, authSession, loadVersion])

  const hasUnsavedChanges = useMemo(() => {
    if (!monitoringRecord || !monitoringDraft) {
      return false
    }
    return JSON.stringify(monitoringRecord.document) !== JSON.stringify(monitoringDraft)
  }, [monitoringDraft, monitoringRecord])

  function updateDraft(
    updater: (current: TradeProjectionMonitoringDocument) => TradeProjectionMonitoringDocument,
  ) {
    setFlash(null)
    setMonitoringDraft((current) => (current ? updater(current) : current))
  }

  async function handleSave() {
    if (!authSession || !monitoringDraft) {
      return
    }

    setSaving(true)
    setError('')
    setFlash(null)

    try {
      const payload = await saveTradeProjectionMonitoring(
        appConfig.apiBase,
        authSession.accessToken,
        monitoringDraft,
        authSession.user.user_id,
      )
      setMonitoringRecord(payload)
      setMonitoringDraft(cloneMonitoringDocument(payload.document))
      setFlash({
        tone: 'success',
        message: `Saved projection monitoring policy version ${payload.version}.`,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not save projection monitoring.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRunNow() {
    if (!authSession) {
      return
    }

    setRunning(true)
    setError('')
    setFlash(null)

    try {
      const result = await runTradeProjectionMonitoring(appConfig.apiBase, { force: true })
      setFlash({
        tone: 'success',
        message: summarizeRunResult(result),
      })
      setLoadVersion((current) => current + 1)
      await onRefreshData().catch(() => undefined)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not run projection monitoring.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="surface feature-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Operations</span>
          <h3>Projection Monitoring</h3>
        </div>
        <p>Run projection integrity checks on a saved cadence, auto-clean safe orphan rows, and route sustained drift into an alert trail.</p>
      </div>

      {!adminEnabled && (
        <div className="empty-state empty-state-tall">
          <strong>Administrative session required</strong>
          <p>
            {authSession
              ? `Signed in as ${authSession.user.display_name} with role ${authSession.user.role}. Use Sign Out, then sign back in with an OPS_ADMIN or ADMIN account to manage projection monitoring.`
              : 'Sign in with an OPS_ADMIN or ADMIN account to configure projection monitoring and run the scheduler manually.'}
          </p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      )}

      {adminEnabled && (
        <>
          <div className="roadmap-admin-toolbar">
            <div className="stack">
              <span className={`status-pill status-pill-${monitoringTone(monitoringRecord?.live_status.health_status ?? 'disabled')}`}>
                {monitoringRecord ? monitoringLabel(monitoringRecord.live_status.health_status) : 'Loading'}
              </span>
              <p className="roadmap-admin-note">
                {monitoringRecord?.is_default
                  ? 'Using the built-in monitoring defaults until the first admin save.'
                  : `Last saved ${formatDate(monitoringRecord?.updated_at)} by ${monitoringRecord?.updated_by ?? 'unknown'}.`}
              </p>
            </div>
            <div className="toolbar">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setLoadVersion((current) => current + 1)}
                disabled={loading || saving || running}
              >
                Refresh Status
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void handleRunNow()}
                disabled={loading || saving || running}
              >
                {running ? 'Running Monitor...' : 'Run Monitor Now'}
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void handleSave()}
                disabled={!monitoringDraft || !hasUnsavedChanges || loading || saving || running}
              >
                {saving ? 'Saving Policy...' : 'Save Monitoring'}
              </button>
            </div>
          </div>

          {loading ? <div className="feedback-banner feedback-banner-success">Loading projection monitoring from Admin...</div> : null}
          {error ? <div className="feedback-banner feedback-banner-error">{error}</div> : null}
          {flash ? (
            <div className={`feedback-banner ${flash.tone === 'error' ? 'feedback-banner-error' : 'feedback-banner-success'}`}>
              {flash.message}
            </div>
          ) : null}
          {monitoringDraft?.alerting.channels.includes('EMAIL') ? (
            <div className="feedback-banner feedback-banner-success">
              Email digests use the server SMTP/runtime settings from Settings. If SMTP is not configured, deliveries stay in the local archive instead of going to an external inbox.
            </div>
          ) : null}

          <div className="admin-grid">
            <article className="admin-card">
              <strong>Current Drift</strong>
              <p>
                {monitoringRecord
                  ? `${monitoringRecord.live_status.live_issue_count} active issue${monitoringRecord.live_status.live_issue_count === 1 ? '' : 's'} across ${monitoringRecord.live_status.live_impacted_trade_count} trade${monitoringRecord.live_status.live_impacted_trade_count === 1 ? '' : 's'}.`
                  : 'Loading current projection drift.'}
              </p>
              <span>
                {monitoringRecord
                  ? `${monitoringRecord.live_status.live_structural_issue_count} structural · ${monitoringRecord.live_status.live_invariant_issue_count} invariant.`
                  : 'Current findings are below the configured alert threshold.'}
              </span>
            </article>
            <article className="admin-card">
              <strong>Cadence</strong>
              <p>
                {monitoringDraft?.schedule.enabled
                  ? `${cadenceLabel(monitoringDraft.schedule.cadence_minutes)} cadence with ${autoCleanLabel(monitoringDraft.schedule.auto_clean_mode)}.`
                  : 'Scheduled projection monitoring is currently disabled.'}
              </p>
              <span>
                {monitoringRecord?.live_status.next_evaluation_at
                  ? `Next run due ${formatDate(monitoringRecord.live_status.next_evaluation_at)}`
                  : monitoringDraft?.schedule.enabled
                    ? 'Run the monitor once to establish the first scheduled checkpoint.'
                    : 'No next run while scheduling is disabled.'}
              </span>
            </article>
            <article className="admin-card">
              <strong>Last Cycle</strong>
              <p>
                {monitoringRecord?.runtime.last_evaluated_at
                  ? `Last evaluated ${formatDate(monitoringRecord.runtime.last_evaluated_at)} by ${monitoringRecord.runtime.last_evaluated_by ?? 'unknown'}.`
                  : 'No monitoring cycle has been recorded yet.'}
              </p>
              <span>
                {monitoringRecord
                  ? `${monitoringRecord.runtime.last_structural_issue_count} structural · ${monitoringRecord.runtime.last_invariant_issue_count} invariant · ${monitoringRecord.runtime.last_auto_cleaned_trade_count} auto-cleaned trade${monitoringRecord.runtime.last_auto_cleaned_trade_count === 1 ? '' : 's'} in the last cycle.`
                  : 'Awaiting monitoring runtime.'}
              </span>
            </article>
            <article className="admin-card">
              <strong>Last Alert</strong>
              <p>
                {monitoringRecord?.runtime.last_alert_at
                  ? `Last alert ${formatDate(monitoringRecord.runtime.last_alert_at)} (${monitoringRecord.runtime.last_alert_severity ?? 'unknown'}).`
                  : 'No monitoring alert has been emitted yet.'}
              </p>
              <span>{monitoringRecord?.runtime.last_alert_reason ?? 'No alert reason recorded.'}</span>
            </article>
          </div>

          <div className="admin-grid">
            <article className="admin-card">
              <strong>Policy</strong>
              <p>Save the cadence, alert threshold, and auto-clean scope that the scheduler should follow.</p>
              {monitoringDraft ? (
                <div className="stack-form">
                  <div className="mini-grid">
                    <label className="field">
                      <span>
                        <input
                          type="checkbox"
                          checked={monitoringDraft.schedule.enabled}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              schedule: {
                                ...current.schedule,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                        />{' '}
                        Schedule enabled
                      </span>
                    </label>
                    <label className="field">
                      <span>
                        <input
                          type="checkbox"
                          checked={monitoringDraft.alerting.enabled}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              alerting: {
                                ...current.alerting,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                        />{' '}
                        Alert routing enabled
                      </span>
                    </label>
                  </div>

                  <div className="mini-grid">
                    <label className="field">
                      <span>Cadence Minutes</span>
                      <input
                        className="control"
                        type="number"
                        min={15}
                        step={15}
                        value={monitoringDraft.schedule.cadence_minutes}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            schedule: {
                              ...current.schedule,
                              cadence_minutes: Math.max(15, Number.parseInt(event.target.value || '0', 10) || 15),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Auto-clean Mode</span>
                      <select
                        className="control"
                        value={monitoringDraft.schedule.auto_clean_mode}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            schedule: {
                              ...current.schedule,
                              auto_clean_mode: event.target.value as ProjectionAutoCleanMode,
                            },
                          }))
                        }
                      >
                        <option value="clean_auto_cleanable">Clean Auto-cleanable</option>
                        <option value="disabled">Manual Only</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Max Cleanup Trades</span>
                      <input
                        className="control"
                        type="number"
                        min={1}
                        max={500}
                        value={monitoringDraft.schedule.max_cleanup_trades_per_run}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            schedule: {
                              ...current.schedule,
                              max_cleanup_trades_per_run: Math.min(
                                500,
                                Math.max(1, Number.parseInt(event.target.value || '0', 10) || 1),
                              ),
                            },
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="mini-grid">
                    <label className="field">
                      <span>Issue Threshold</span>
                      <input
                        className="control"
                        type="number"
                        min={0}
                        value={monitoringDraft.alerting.issue_count_threshold}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            alerting: {
                              ...current.alerting,
                              issue_count_threshold: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Impacted Trade Threshold</span>
                      <input
                        className="control"
                        type="number"
                        min={0}
                        value={monitoringDraft.alerting.impacted_trade_threshold}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            alerting: {
                              ...current.alerting,
                              impacted_trade_threshold: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Alert Cooldown Minutes</span>
                      <input
                        className="control"
                        type="number"
                        min={0}
                        value={monitoringDraft.alerting.minimum_alert_interval_minutes}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            alerting: {
                              ...current.alerting,
                              minimum_alert_interval_minutes: Math.max(
                                0,
                                Number.parseInt(event.target.value || '0', 10) || 0,
                              ),
                            },
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="stack">
                    <strong>Alert Channels</strong>
                    {CHANNEL_OPTIONS.map((option) => {
                      const enabled = monitoringDraft.alerting.channels.includes(option.value)
                      return (
                        <label key={option.value} className="field">
                          <span>
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  alerting: {
                                    ...current.alerting,
                                    channels: event.target.checked
                                      ? [...current.alerting.channels, option.value]
                                      : current.alerting.channels.filter((channel) => channel !== option.value),
                                  },
                                }))
                              }
                            />{' '}
                            {option.label}
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  <label className="field">
                    <span>Routing Note</span>
                    <textarea
                      className="control"
                      rows={4}
                      value={monitoringDraft.alerting.routing_note}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          alerting: {
                            ...current.alerting,
                            routing_note: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
            </article>

            <article className="admin-card">
              <strong>Live Alert Preview</strong>
              <p>
                {monitoringRecord?.live_status.alert_messages.length
                  ? 'These are the messages the monitoring service currently considers operationally relevant.'
                  : 'No live alert messages are active right now.'}
              </p>
              <div className="stack">
                {(monitoringRecord?.live_status.alert_messages ?? []).map((message) => (
                  <div key={message} className="feedback-banner">
                    {message}
                  </div>
                ))}
                {monitoringRecord && monitoringRecord.live_status.alert_messages.length === 0 ? (
                  <div className="feedback-banner feedback-banner-success">Current drift is below the configured alert threshold.</div>
                ) : null}
              </div>
            </article>

            <article className="admin-card">
              <strong>Recent Alerts</strong>
              <p>Recent routed alerts stay here even when the scheduler is running outside the app shell.</p>
              <div className="stack">
                {(monitoringRecord?.recent_alerts ?? []).slice(0, 5).map((alert) => (
                  <div key={alert.alert_id} className="detail-row">
                    <div className="stack">
                      <strong>{alert.reason.replaceAll('_', ' ')}</strong>
                      <span>{alert.messages.join(' ')}</span>
                    </div>
                    <div className="stack">
                      <span>{formatDate(alert.created_at)}</span>
                      <span>{alert.channels.join(' · ')}</span>
                    </div>
                  </div>
                ))}
                {monitoringRecord && monitoringRecord.recent_alerts.length === 0 ? (
                  <span>No recent projection monitoring alerts.</span>
                ) : null}
              </div>
            </article>

            <article className="admin-card">
              <strong>Recent Deliveries</strong>
              <p>Channel outcomes show whether alert routing reached the workspace, a local archive, or a live external transport.</p>
              <div className="stack">
                {(monitoringRecord?.recent_deliveries ?? []).slice(0, 6).map((delivery) => (
                  <div key={delivery.delivery_id} className="detail-row">
                    <div className="stack">
                      <strong>
                        {delivery.channel.replaceAll('_', ' ')} · {deliveryStatusLabel(delivery.status)}
                      </strong>
                      <span>{delivery.title}</span>
                      <span>
                        Target {delivery.target}
                        {delivery.recipients.length > 0 ? ` · ${delivery.recipients.join(', ')}` : ''}
                      </span>
                      {delivery.error ? <span>{delivery.error}</span> : null}
                    </div>
                    <div className="stack">
                      <span>{formatDate(delivery.created_at)}</span>
                      <span>{delivery.delivered_at ? `Completed ${formatDate(delivery.delivered_at)}` : 'Awaiting transport'}</span>
                    </div>
                  </div>
                ))}
                {monitoringRecord && monitoringRecord.recent_deliveries.length === 0 ? (
                  <span>No projection monitoring deliveries have been recorded yet.</span>
                ) : null}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
