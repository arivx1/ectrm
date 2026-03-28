import { useEffect, useMemo, useRef, useState } from 'react'

import {
  approveAssistantActionRequest,
  listAdminAssistantActionRequests,
  rejectAssistantActionRequest,
} from '../../entities/assistant/api'
import { AssistantActionRequestList } from '../../entities/assistant/AssistantActionRequestList'
import { appConfig } from '../../shared/config'
import type { AssistantActionRequest } from '../../shared/models'
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

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

export function AssistantApprovalInboxPanel({
  authSession,
  formatDate,
  onOpenSettings,
  onRefreshData,
}: AssistantApprovalInboxPanelProps) {
  const requestSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [actionRequests, setActionRequests] = useState<AssistantActionRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [actionRequestIdsInFlight, setActionRequestIdsInFlight] = useState<number[]>([])

  const oldestPendingRequest = useMemo(
    () => actionRequests[actionRequests.length - 1] ?? null,
    [actionRequests],
  )

  async function refreshActionRequests() {
    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current

    if (!adminEnabled) {
      setActionRequests([])
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = await listAdminAssistantActionRequests(appConfig.apiBase, {
        status: 'PENDING',
        limit: 12,
      })
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setActionRequests(payload)
    } catch (nextError) {
      if (requestSequenceRef.current !== requestId) {
        return
      }
      setActionRequests([])
      setError(nextError instanceof Error ? nextError.message : 'Could not load assistant approvals.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    setFlash(null)
    void refreshActionRequests()
  }, [adminEnabled, authSession])

  async function handleDecision(actionRequestId: number, decision: 'approve' | 'reject') {
    setFlash(null)
    setActionRequestIdsInFlight((current) => [...current, actionRequestId])

    try {
      const updatedActionRequest =
        decision === 'approve'
          ? await approveAssistantActionRequest(appConfig.apiBase, actionRequestId)
          : await rejectAssistantActionRequest(appConfig.apiBase, actionRequestId)

      await refreshActionRequests()
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
              <span>Pending requests</span>
              <strong>{actionRequests.length}</strong>
              <small>{loading ? 'Refreshing queue...' : 'Cross-user approvals waiting in the inbox.'}</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Oldest pending</span>
              <strong>{oldestPendingRequest ? formatDate(oldestPendingRequest.created_at) : 'No backlog'}</strong>
              <small>{oldestPendingRequest ? oldestPendingRequest.summary : 'Nothing is waiting for review.'}</small>
            </article>
            <article className="assistant-run-summary-card">
              <span>Coverage</span>
              <strong>{actionRequests.length > 0 ? 'Live queue' : 'Clear'}</strong>
              <small>Approvals remain recoverable even after the chat session ends.</small>
            </article>
          </div>

          {flash ? (
            <div className={`feedback-banner feedback-banner-${flash.tone}`}>
              {flash.message}
            </div>
          ) : null}

          <div className="assistant-sidebar-block">
            <strong>Queue status</strong>
            <p>
              {loading
                ? 'Refreshing pending assistant approvals.'
                : error
                  ? error
                  : actionRequests.length > 0
                    ? `${actionRequests.length} pending assistant action request${actionRequests.length === 1 ? '' : 's'} require review.`
                    : 'No assistant action requests are currently waiting for approval.'}
            </p>
          </div>

          <AssistantActionRequestList
            actionRequests={actionRequests}
            actionRequestIdsInFlight={actionRequestIdsInFlight}
            formatDate={formatDate}
            onDecision={handleDecision}
            showUserId
          />
        </>
      )}
    </section>
  )
}
