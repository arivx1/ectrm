import type { AssistantActionRequest } from '../../shared/models'

type AssistantActionRequestListProps = {
  actionRequests: AssistantActionRequest[]
  actionRequestIdsInFlight?: number[]
  formatDate: (value: string | null | undefined) => string
  onDecision?: (actionRequestId: number, decision: 'approve' | 'reject') => void
  onOpenRun?: (runId: number) => void
  showUserId?: boolean
}

function actionToneForStatus(
  status: AssistantActionRequest['status'],
): 'planned' | 'active' | 'blocked' | 'cancelled' {
  switch (status) {
    case 'EXECUTED':
      return 'active'
    case 'FAILED':
      return 'blocked'
    case 'REJECTED':
      return 'cancelled'
    default:
      return 'planned'
  }
}

export function AssistantActionRequestList({
  actionRequests,
  actionRequestIdsInFlight = [],
  formatDate,
  onDecision,
  onOpenRun,
  showUserId = false,
}: AssistantActionRequestListProps) {
  if (actionRequests.length === 0) {
    return null
  }

  return (
    <div className="assistant-action-list">
      {actionRequests.map((actionRequest) => {
        const actionPending = actionRequest.status === 'PENDING'
        const actionBusy = actionRequestIdsInFlight.includes(actionRequest.action_request_id)

        return (
          <article key={actionRequest.action_request_id} className="assistant-action-card">
            <div className="assistant-tool-head">
              <strong>{actionRequest.summary}</strong>
              <span className={`status-pill status-pill-${actionToneForStatus(actionRequest.status)}`}>
                {actionRequest.status}
              </span>
            </div>

            <div className="assistant-message-meta assistant-action-meta">
              {showUserId ? <span>Requester: {actionRequest.user_id}</span> : null}
              <span>Created: {formatDate(actionRequest.created_at)}</span>
              <span>Workspace: {actionRequest.workspace ?? 'n/a'}</span>
              <span>Agent: {actionRequest.agent_name ?? 'Platform foundation'}</span>
              <span>Type: {actionRequest.action_type}</span>
              <span>Run #{actionRequest.run_id}</span>
              {onOpenRun ? (
                <button
                  type="button"
                  className="assistant-run-link"
                  onClick={() => onOpenRun(actionRequest.run_id)}
                >
                  Open trace
                </button>
              ) : null}
            </div>

            <p>{actionRequest.description}</p>

            {Object.keys(actionRequest.payload).length > 0 ? (
              <code>{JSON.stringify(actionRequest.payload)}</code>
            ) : null}

            {actionRequest.result ? (
              <div className="assistant-message-meta assistant-action-meta">
                {Object.entries(actionRequest.result).map(([key, value]) => (
                  <span key={`${actionRequest.action_request_id}-${key}`}>
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            ) : null}

            {actionRequest.error_detail ? (
              <div className="assistant-message-meta assistant-action-meta">
                <span>{actionRequest.error_detail}</span>
              </div>
            ) : null}

            {actionRequest.decided_at ? (
              <div className="assistant-message-meta assistant-action-meta">
                <span>Decided: {formatDate(actionRequest.decided_at)}</span>
                <span>Decided by: {actionRequest.decided_by ?? 'n/a'}</span>
              </div>
            ) : null}

            {actionPending && onDecision ? (
              <div className="assistant-action-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={actionBusy}
                  onClick={() => onDecision(actionRequest.action_request_id, 'approve')}
                >
                  {actionBusy ? 'Working...' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={actionBusy}
                  onClick={() => onDecision(actionRequest.action_request_id, 'reject')}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
