import type {
  AssistantActionRequest,
  AssistantActionReviewContext,
  AssistantActionReviewObjectRef,
  AssistantActionRequestLifecycleTone,
} from '../../shared/models'

type AssistantActionRequestListProps = {
  actionRequests: AssistantActionRequest[]
  actionRequestIdsInFlight?: number[]
  formatDate: (value: string | null | undefined) => string
  onDecision?: (actionRequestId: number, decision: 'approve' | 'reject') => void
  onOpenRun?: (runId: number) => void
  showUserId?: boolean
}

function statusPillToneForLifecycle(
  tone: AssistantActionRequestLifecycleTone,
): 'planned' | 'active' | 'blocked' | 'cancelled' {
  switch (tone) {
    case 'success':
      return 'active'
    case 'danger':
      return 'blocked'
    case 'neutral':
      return 'cancelled'
    default:
      return 'planned'
  }
}

function formatLifecycleRiskFlag(flag: string): string {
  return flag
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatReviewObjectRef(ref: AssistantActionReviewObjectRef): string {
  return ref.label || `${ref.type}: ${ref.id}`
}

function formatReviewerRole(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatReviewValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function renderReviewList(title: string, items: string[]) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="assistant-action-review-block">
      <strong>{title}</strong>
      <ul className="assistant-action-field-list">
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function ActionReviewContext({ reviewContext }: { reviewContext: AssistantActionReviewContext }) {
  const staleStateEntries = Object.entries(reviewContext.stale_state_basis)
  const proposedMutationEntries = Object.entries(reviewContext.proposed_mutation)

  return (
    <div className="assistant-action-review-grid">
      <div className="assistant-action-review-block">
        <strong>Owning work object</strong>
        <p>{formatReviewObjectRef(reviewContext.owning_work_object)}</p>
      </div>
      <div className="assistant-action-review-block">
        <strong>Reviewer role</strong>
        <p>{formatReviewerRole(reviewContext.required_reviewer_role)}</p>
      </div>
      <div className="assistant-action-review-block">
        <strong>Business rationale</strong>
        <p>{reviewContext.business_rationale}</p>
      </div>

      {proposedMutationEntries.length > 0 ? (
        <div className="assistant-action-review-block">
          <strong>Proposed mutation</strong>
          <div className="assistant-action-field-list">
            {proposedMutationEntries.map(([key, value]) => (
              <span key={`mutation-${key}`}>
                {key}: {formatReviewValue(value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {reviewContext.supporting_records.length > 0 ? (
        <div className="assistant-action-review-block">
          <strong>Supporting records</strong>
          <div className="assistant-action-field-list">
            {reviewContext.supporting_records.map((record) => (
              <span key={`${record.type}-${record.id}-${record.summary}`}>
                {formatReviewObjectRef(record)}: {record.summary}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {renderReviewList('Expected downstream effects', reviewContext.expected_downstream_effects)}
      {renderReviewList('Assumptions', reviewContext.assumptions)}
      {renderReviewList('Missing evidence', reviewContext.missing_evidence)}

      {staleStateEntries.length > 0 ? (
        <div className="assistant-action-review-block">
          <strong>Stale-state basis</strong>
          <div className="assistant-action-field-list">
            {staleStateEntries.map(([key, value]) => (
              <span key={`stale-${key}`}>
                {key}: {formatReviewValue(value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
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
        const { lifecycle } = actionRequest
        const actionBusy = actionRequestIdsInFlight.includes(actionRequest.action_request_id)
        const actionDecidable = lifecycle.can_approve || lifecycle.can_reject

        return (
          <article key={actionRequest.action_request_id} className="assistant-action-card">
            <div className="assistant-tool-head">
              <strong>{actionRequest.summary}</strong>
              <span className={`status-pill status-pill-${statusPillToneForLifecycle(lifecycle.tone)}`}>
                {lifecycle.label}
              </span>
            </div>

            <div className="assistant-message-meta assistant-action-meta">
              {showUserId ? <span>Requester: {actionRequest.user_id}</span> : null}
              <span>Created: {formatDate(actionRequest.created_at)}</span>
              <span>Workspace: {actionRequest.workspace ?? 'n/a'}</span>
              <span>Agent: {actionRequest.agent_name ?? 'Platform foundation'}</span>
              <span>Type: {actionRequest.action_type}</span>
              <span>State: {lifecycle.stage}</span>
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

            {lifecycle.reviewer_action_label || lifecycle.review_risk_flags.length > 0 ? (
              <div className="assistant-message-meta assistant-action-meta">
                {lifecycle.reviewer_action_label ? <span>{lifecycle.reviewer_action_label}</span> : null}
                {lifecycle.review_risk_flags.map((flag) => (
                  <span key={`${actionRequest.action_request_id}-${flag}`}>
                    {formatLifecycleRiskFlag(flag)}
                  </span>
                ))}
              </div>
            ) : null}

            {actionRequest.review_context ? (
              <ActionReviewContext reviewContext={actionRequest.review_context} />
            ) : null}

            {Object.keys(actionRequest.payload).length > 0 ? (
              <code>{JSON.stringify(actionRequest.payload)}</code>
            ) : null}

            {actionRequest.result ? (
              <div className="assistant-message-meta assistant-action-meta">
                {Object.entries(actionRequest.result).map(([key, value]) => (
                  <span key={`${actionRequest.action_request_id}-${key}`}>
                    {key}: {formatReviewValue(value)}
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
                <span>{lifecycle.decided_label ?? `Decided by: ${actionRequest.decided_by ?? 'n/a'}`}</span>
              </div>
            ) : null}

            {actionDecidable && onDecision ? (
              <div className="assistant-action-actions">
                {lifecycle.can_approve ? (
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={actionBusy}
                    onClick={() => onDecision(actionRequest.action_request_id, 'approve')}
                  >
                    {actionBusy ? 'Working...' : 'Approve'}
                  </button>
                ) : null}
                {lifecycle.can_reject ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={actionBusy}
                    onClick={() => onDecision(actionRequest.action_request_id, 'reject')}
                  >
                    Reject
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
