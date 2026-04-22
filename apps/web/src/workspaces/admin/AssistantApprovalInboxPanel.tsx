import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  approveAssistantActionRequest,
  getAdminAssistantRunAuditTrace,
  listAdminAssistantActionRequests,
  rejectAssistantActionRequest,
} from '../../entities/assistant/api'
import { AssistantActionRequestList } from '../../entities/assistant/AssistantActionRequestList'
import { appConfig } from '../../shared/config'
import {
  ASSISTANT_ACTION_TYPES,
  type AssistantActionRequest,
  type AssistantActionRequestAdminSummary,
  type AssistantActionRequestStatus,
  type AssistantActionType,
  type AssistantAgentProfileKind,
  type AssistantRunAuditTrace,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type AssistantApprovalInboxPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
  onRefreshData: () => Promise<void>
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type ActionRequestStatusFilter = AssistantActionRequestStatus | 'ALL'

type ActionRequestHistoryFilters = {
  status: ActionRequestStatusFilter
  actionType: AssistantActionType | ''
  agentId: string
  roleKey: string
  profileKind: AssistantAgentProfileKind | ''
  userId: string
  decidedBy: string
  search: string
  createdAfter: string
  createdBefore: string
}

const ACTION_REQUEST_PAGE_LIMIT = 12

const EMPTY_ACTION_REQUEST_SUMMARY: AssistantActionRequestAdminSummary = {
  total_count: 0,
  pending_count: 0,
  executed_count: 0,
  rejected_count: 0,
  failed_count: 0,
  avg_decision_seconds: null,
}

const INITIAL_ACTION_REQUEST_FILTERS: ActionRequestHistoryFilters = {
  status: 'PENDING',
  actionType: '',
  agentId: '',
  roleKey: '',
  profileKind: '',
  userId: '',
  decidedBy: '',
  search: '',
  createdAfter: '',
  createdBefore: '',
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function formatActionTypeLabel(actionType: string): string {
  return actionType.replace(/_/g, ' ')
}

function formatDecisionDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return 'No decisions yet'
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

function createdAfterBoundary(dateValue: string): string | undefined {
  return dateValue ? `${dateValue}T00:00:00` : undefined
}

function createdBeforeBoundary(dateValue: string): string | undefined {
  return dateValue ? `${dateValue}T23:59:59` : undefined
}

function timelineStatusTone(status: string | null | undefined): 'planned' | 'active' | 'blocked' | 'cancelled' {
  switch (status) {
    case 'FAILED':
      return 'blocked'
    case 'REJECTED':
      return 'cancelled'
    case 'PENDING':
      return 'planned'
    default:
      return 'active'
  }
}

export function AssistantApprovalInboxPanel({
  authSession,
  formatDate,
  onOpenSettings,
  onRefreshData,
}: AssistantApprovalInboxPanelProps) {
  const requestSequenceRef = useRef(0)
  const traceSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [actionRequests, setActionRequests] = useState<AssistantActionRequest[]>([])
  const [actionRequestSummary, setActionRequestSummary] =
    useState<AssistantActionRequestAdminSummary>(EMPTY_ACTION_REQUEST_SUMMARY)
  const [pageOffset, setPageOffset] = useState(0)
  const [hasMoreActionRequests, setHasMoreActionRequests] = useState(false)
  const [filters, setFilters] = useState<ActionRequestHistoryFilters>(INITIAL_ACTION_REQUEST_FILTERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [actionRequestIdsInFlight, setActionRequestIdsInFlight] = useState<number[]>([])
  const [selectedTraceRunId, setSelectedTraceRunId] = useState<number | null>(null)
  const [selectedAuditTrace, setSelectedAuditTrace] = useState<AssistantRunAuditTrace | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState('')

  const pendingActionRequests = useMemo(
    () => actionRequests.filter((actionRequest) => actionRequest.status === 'PENDING'),
    [actionRequests],
  )
  const oldestPendingRequest = useMemo(
    () => pendingActionRequests[pendingActionRequests.length - 1] ?? null,
    [pendingActionRequests],
  )
  const hasHistoryFilters =
    filters.status !== 'PENDING' ||
    Boolean(filters.actionType) ||
    Boolean(filters.agentId.trim()) ||
    Boolean(filters.roleKey.trim()) ||
    Boolean(filters.profileKind) ||
    Boolean(filters.userId.trim()) ||
    Boolean(filters.decidedBy.trim()) ||
    Boolean(filters.search.trim()) ||
    Boolean(filters.createdAfter) ||
    Boolean(filters.createdBefore)
  const pageStart = actionRequestSummary.total_count > 0 ? pageOffset + 1 : 0
  const pageEnd = pageOffset + actionRequests.length
  const pageRangeLabel =
    actionRequestSummary.total_count > 0
      ? `${pageStart}-${pageEnd} of ${actionRequestSummary.total_count}`
      : '0 of 0'

  const refreshActionRequests = useCallback(async () => {
    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current

    if (!adminEnabled) {
      setActionRequests([])
      setActionRequestSummary(EMPTY_ACTION_REQUEST_SUMMARY)
      setHasMoreActionRequests(false)
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = await listAdminAssistantActionRequests(appConfig.apiBase, {
        status: filters.status === 'ALL' ? undefined : filters.status,
        actionType: filters.actionType || undefined,
        agentId: filters.agentId,
        roleKey: filters.roleKey,
        profileKind: filters.profileKind || undefined,
        userId: filters.userId,
        decidedBy: filters.decidedBy,
        search: filters.search,
        createdAfter: createdAfterBoundary(filters.createdAfter),
        createdBefore: createdBeforeBoundary(filters.createdBefore),
        limit: ACTION_REQUEST_PAGE_LIMIT,
        offset: pageOffset,
      })
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setActionRequests(payload.items)
      setActionRequestSummary(payload.summary)
      setHasMoreActionRequests(payload.has_more)
    } catch (nextError) {
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setActionRequests([])
      setActionRequestSummary(EMPTY_ACTION_REQUEST_SUMMARY)
      setHasMoreActionRequests(false)
      setError(nextError instanceof Error ? nextError.message : 'Could not load assistant approvals.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [adminEnabled, filters, pageOffset])

  useEffect(() => {
    setFlash(null)
    void refreshActionRequests()
  }, [authSession, refreshActionRequests])

  const refreshSelectedAuditTrace = useCallback(async () => {
    traceSequenceRef.current += 1
    const requestId = traceSequenceRef.current

    if (!adminEnabled || selectedTraceRunId === null) {
      setSelectedAuditTrace(null)
      setTraceError('')
      setTraceLoading(false)
      return
    }

    setTraceLoading(true)
    setTraceError('')

    try {
      const payload = await getAdminAssistantRunAuditTrace(appConfig.apiBase, selectedTraceRunId)
      if (traceSequenceRef.current !== requestId) {
        return
      }
      setSelectedAuditTrace(payload)
    } catch (nextError) {
      if (traceSequenceRef.current !== requestId) {
        return
      }
      setSelectedAuditTrace(null)
      setTraceError(nextError instanceof Error ? nextError.message : 'Could not load assistant audit trace.')
    } finally {
      if (traceSequenceRef.current === requestId) {
        setTraceLoading(false)
      }
    }
  }, [adminEnabled, selectedTraceRunId])

  useEffect(() => {
    void refreshSelectedAuditTrace()
  }, [refreshSelectedAuditTrace])

  function updateFilter<Key extends keyof ActionRequestHistoryFilters>(
    key: Key,
    value: ActionRequestHistoryFilters[Key],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
    setPageOffset(0)
  }

  function resetFilters() {
    setFilters(INITIAL_ACTION_REQUEST_FILTERS)
    setPageOffset(0)
  }

  function queueStatusMessage(): string {
    if (loading) {
      return 'Refreshing pending assistant approvals.'
    }
    if (error) {
      return error
    }
    if (!hasHistoryFilters) {
      return actionRequestSummary.pending_count > 0
        ? `${actionRequestSummary.pending_count} pending assistant action request${actionRequestSummary.pending_count === 1 ? '' : 's'} require review.`
        : 'No assistant action requests are currently waiting for approval.'
    }
    return actionRequestSummary.total_count > 0
      ? `Showing ${pageRangeLabel} filtered assistant action request${actionRequestSummary.total_count === 1 ? '' : 's'}.`
      : 'No assistant action requests match the current approval history filters.'
  }

  function handleOpenRunTrace(runId: number) {
    setSelectedTraceRunId(runId)
    setSelectedAuditTrace(null)
    setTraceError('')
  }

  async function handleDecision(actionRequestId: number, decision: 'approve' | 'reject') {
    setFlash(null)
    setActionRequestIdsInFlight((current) => [...current, actionRequestId])

    try {
      const updatedActionRequest =
        decision === 'approve'
          ? await approveAssistantActionRequest(appConfig.apiBase, actionRequestId)
          : await rejectAssistantActionRequest(appConfig.apiBase, actionRequestId)

      await refreshActionRequests()
      if (selectedTraceRunId === updatedActionRequest.run_id) {
        await refreshSelectedAuditTrace()
      }
      if (updatedActionRequest.status === 'EXECUTED') {
        await onRefreshData()
      }

      setFlash({
        tone: 'success',
        message:
          updatedActionRequest.status === 'EXECUTED'
            ? `${updatedActionRequest.summary} has been executed.`
            : `${updatedActionRequest.summary} has been rejected.`,
      })
    } catch (nextError) {
      setFlash({
        tone: 'error',
        message: nextError instanceof Error ? nextError.message : 'Assistant approval failed.',
      })
    } finally {
      setActionRequestIdsInFlight((current) =>
        current.filter((currentActionRequestId) => currentActionRequestId !== actionRequestId),
      )
    }
  }

  return (
    <section className="surface">
      <div className="section-head">
        <div>
          <span className="eyebrow">Assistant Operations</span>
          <h3>Pending Approvals</h3>
        </div>
        <p>Review and decide managed assistant actions even after the original chat turn is gone.</p>
      </div>

      {!authSession ? (
        <div className="empty-state assistant-empty-state">
          <strong>Sign in to review approvals</strong>
          <p>Assistant approvals are protected and require an authenticated admin session.</p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      ) : !adminEnabled ? (
        <div className="empty-state assistant-empty-state">
          <strong>Administrative access required</strong>
          <p>Only OPS_ADMIN or ADMIN users can review and execute cross-user assistant actions.</p>
        </div>
      ) : (
        <>
          <div className="assistant-admin-summary-grid">
            <article className="assistant-run-summary-card">
              <span>History matches</span>
              <strong>{actionRequestSummary.total_count}</strong>
              <small>{loading ? 'Refreshing queue...' : `${pageRangeLabel} in the current view.`}</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Pending requests</span>
              <strong>{actionRequestSummary.pending_count}</strong>
              <small>Cross-user approvals still waiting for a decision.</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Oldest pending in view</span>
              <strong>{oldestPendingRequest ? formatDate(oldestPendingRequest.created_at) : 'No backlog'}</strong>
              <small>{oldestPendingRequest ? oldestPendingRequest.summary : 'No pending item on this page.'}</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Avg decision time</span>
              <strong>{formatDecisionDuration(actionRequestSummary.avg_decision_seconds)}</strong>
              <small>
                {actionRequestSummary.executed_count} executed / {actionRequestSummary.rejected_count} rejected /{' '}
                {actionRequestSummary.failed_count} failed
              </small>
            </article>
          </div>

          {flash ? (
            <div className={`feedback-banner feedback-banner-${flash.tone}`}>
              {flash.message}
            </div>
          ) : null}

          <div className="assistant-sidebar-block">
            <strong>Approval history filters</strong>
            <p>Search the recoverable approval ledger by status, actor, agent role, profile, action type, and created date.</p>
            <div className="assistant-admin-form-grid">
              <label className="field">
                <span>Status</span>
                <select
                  className="control"
                  value={filters.status}
                  onChange={(event) => updateFilter('status', event.target.value as ActionRequestStatusFilter)}
                >
                  <option value="PENDING">Pending</option>
                  <option value="ALL">All statuses</option>
                  <option value="EXECUTED">Executed</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="FAILED">Failed</option>
                </select>
              </label>
              <label className="field">
                <span>Action type</span>
                <select
                  className="control"
                  value={filters.actionType}
                  onChange={(event) =>
                    updateFilter('actionType', event.target.value as ActionRequestHistoryFilters['actionType'])
                  }
                >
                  <option value="">All action types</option>
                  {ASSISTANT_ACTION_TYPES.map((actionType) => (
                    <option key={actionType} value={actionType}>
                      {formatActionTypeLabel(actionType)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Search</span>
                <input
                  className="control"
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder="Summary, requester, agent..."
                />
              </label>
              <label className="field">
                <span>Requester</span>
                <input
                  className="control"
                  value={filters.userId}
                  onChange={(event) => updateFilter('userId', event.target.value)}
                  placeholder="trader.alpha"
                />
              </label>
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
                    updateFilter('profileKind', event.target.value as ActionRequestHistoryFilters['profileKind'])
                  }
                >
                  <option value="">All profile kinds</option>
                  <option value="CURATED">Curated</option>
                  <option value="ROLE_DERIVED">Role derived</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>
              <label className="field">
                <span>Decided by</span>
                <input
                  className="control"
                  value={filters.decidedBy}
                  onChange={(event) => updateFilter('decidedBy', event.target.value)}
                  placeholder="ops_admin"
                />
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
            </div>
          </div>

          <div className="assistant-sidebar-block">
            <strong>Queue status</strong>
            <p>{queueStatusMessage()}</p>
            <small>{pageRangeLabel}</small>
            <div className="workspace-local-filter-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={loading || pageOffset === 0}
                onClick={() => setPageOffset((current) => Math.max(0, current - ACTION_REQUEST_PAGE_LIMIT))}
              >
                Previous
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={loading || !hasMoreActionRequests}
                onClick={() => setPageOffset((current) => current + ACTION_REQUEST_PAGE_LIMIT)}
              >
                Next
              </button>
            </div>
          </div>

          <AssistantActionRequestList
            actionRequests={actionRequests}
            actionRequestIdsInFlight={actionRequestIdsInFlight}
            formatDate={formatDate}
            onDecision={handleDecision}
            onOpenRun={handleOpenRunTrace}
            showUserId
          />

          {selectedTraceRunId !== null ? (
            <div className="assistant-sidebar-block">
              <div className="assistant-tool-head">
                <strong>Audit trace for run #{selectedTraceRunId}</strong>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setSelectedTraceRunId(null)
                    setSelectedAuditTrace(null)
                    setTraceError('')
                  }}
                >
                  Close trace
                </button>
              </div>
              <p>
                {traceLoading
                  ? `Loading audit trace for run #${selectedTraceRunId}.`
                  : traceError
                    ? traceError
                    : selectedAuditTrace
                      ? `${selectedAuditTrace.timeline.length} trace step${selectedAuditTrace.timeline.length === 1 ? '' : 's'} with ${selectedAuditTrace.mutation_event_count} mutation event${selectedAuditTrace.mutation_event_count === 1 ? '' : 's'}.`
                      : 'Select an approval action to inspect its trace.'}
              </p>

              {selectedAuditTrace ? (
                <>
                  <div className="assistant-run-list">
                    {selectedAuditTrace.timeline.map((entry, index) => (
                      <article
                        key={`audit-trace-${selectedAuditTrace.run.run_id}-${entry.entry_type}-${index}`}
                        className="assistant-run-card"
                      >
                        <div className="assistant-provider-head">
                          <strong>{entry.title}</strong>
                          {entry.status ? (
                            <span className={`status-pill status-pill-${timelineStatusTone(entry.status)}`}>
                              {entry.status}
                            </span>
                          ) : (
                            <span>{entry.entry_type}</span>
                          )}
                        </div>
                        <p>{entry.summary}</p>
                        <small>{formatDate(entry.occurred_at)}</small>
                        {Object.keys(entry.metadata).length > 0 ? (
                          <code>{JSON.stringify(entry.metadata)}</code>
                        ) : null}
                      </article>
                    ))}
                  </div>

                  {selectedAuditTrace.action_requests.length > 0 ? (
                    <div className="assistant-action-list">
                      {selectedAuditTrace.action_requests.map((trace) => (
                        <article
                          key={`audit-action-${trace.action_request.action_request_id}`}
                          className="assistant-action-card"
                        >
                          <div className="assistant-tool-head">
                            <strong>{trace.action_request.summary}</strong>
                            <span>
                              {trace.mutation_events.length} mutation event
                              {trace.mutation_events.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <p>{trace.action_request.description}</p>
                          {trace.mutation_events.map((event) => (
                            <div
                              key={event.event_id}
                              className="assistant-message-meta assistant-action-meta"
                            >
                              <span>{event.event_type}</span>
                              <span>{event.aggregate_id}</span>
                              <span>{event.event_id}</span>
                            </div>
                          ))}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
