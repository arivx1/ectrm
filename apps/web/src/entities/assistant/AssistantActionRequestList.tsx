import { useState } from 'react'

import type {
  AssistantActionPreview,
  AssistantActionRequest,
  AssistantActionReviewContext,
  AssistantActionReviewObjectRef,
  AssistantActionReviewOutcome,
  AssistantActionType,
  AssistantActionRequestLifecycleTone,
} from '../../shared/models'

export type AssistantActionDecisionPayload = {
  reviewOutcome?: AssistantActionReviewOutcome
  decisionNote?: string
  correctionSummary?: string
  correctionFields?: string[]
}

type AssistantActionRequestListProps = {
  actionRequests: AssistantActionRequest[]
  actionRequestIdsInFlight?: number[]
  formatDate: (value: string | null | undefined) => string
  onDecision?: (
    actionRequestId: number,
    decision: 'approve' | 'reject',
    payload: AssistantActionDecisionPayload,
  ) => void
  onOpenRun?: (runId: number) => void
  showUserId?: boolean
}

type DecisionDraft = {
  reviewOutcome: Exclude<AssistantActionReviewOutcome, 'REJECTED'>
  decisionNote: string
  correctionSummary: string
  correctionFields: string
  error: string
}

const DEFAULT_DECISION_DRAFT: DecisionDraft = {
  reviewOutcome: 'APPROVED_AS_IS',
  decisionNote: '',
  correctionSummary: '',
  correctionFields: '',
  error: '',
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

function formatReviewOutcome(value: AssistantActionReviewOutcome): string {
  switch (value) {
    case 'APPROVED_WITH_CORRECTIONS':
      return 'Approved with corrections'
    case 'APPROVED_AS_IS':
      return 'Approved as-is'
    case 'REJECTED':
    default:
      return 'Rejected'
  }
}

function formatReviewValue(value: unknown): string {
  if (value === undefined) {
    return 'n/a'
  }
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function parseCorrectionFields(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean),
    ),
  )
}

function formatReviewFieldLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
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

function formatPreviewStatus(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function previewStatusPillTone(value: string): 'planned' | 'active' | 'blocked' | 'cancelled' {
  return value.trim().toUpperCase() === 'READY' ? 'active' : 'blocked'
}

function ActionPreview({ preview }: { preview: AssistantActionPreview }) {
  return (
    <div className="assistant-action-review-block">
      <strong>Dry-run preview</strong>
      <div className="assistant-message-meta assistant-action-meta">
        <span className={`status-pill status-pill-${previewStatusPillTone(preview.status)}`}>
          {formatPreviewStatus(preview.status)}
        </span>
        <span>{preview.preview_type}</span>
        {typeof preview.existing_invoice_count === 'number' ? (
          <span>{preview.existing_invoice_count} existing invoice(s)</span>
        ) : null}
      </div>
      <p>{preview.summary}</p>

      {preview.field_changes.length > 0 ? (
        <div className="assistant-action-field-list">
          {preview.field_changes.map((change) => (
            <span key={`preview-field-${change.field}`}>
              {change.field}: {formatReviewValue(change.current_value)} -&gt;{' '}
              {formatReviewValue(change.proposed_value)}
            </span>
          ))}
        </div>
      ) : null}

      {preview.affected_records.length > 0 ? (
        <div className="assistant-action-field-list">
          {preview.affected_records.map((record) => (
            <span key={`preview-record-${record.type}-${record.id}-${record.summary}`}>
              {formatReviewObjectRef(record)}: {record.summary}
            </span>
          ))}
        </div>
      ) : null}

      {renderReviewList('Preview side effects', preview.expected_side_effects)}
      {renderReviewList('Preview assumptions', preview.assumptions)}
      {renderReviewList('Preview warnings', preview.warnings)}
      {renderReviewList('Preview blockers', preview.blocking_reasons)}
    </div>
  )
}

function renderSettlementPresetMutation(reviewContext: AssistantActionReviewContext) {
  const proposedMutation = reviewContext.proposed_mutation
  const name = typeof proposedMutation.name === 'string' ? proposedMutation.name : null
  const scope = typeof proposedMutation.scope === 'string' ? proposedMutation.scope : null
  const filters =
    proposedMutation.filters && typeof proposedMutation.filters === 'object' && !Array.isArray(proposedMutation.filters)
      ? Object.entries(proposedMutation.filters as Record<string, unknown>)
      : []

  return (
    <div className="assistant-action-review-block">
      <strong>Preset proposal</strong>
      <div className="assistant-action-field-list">
        {name ? <span>Name: {name}</span> : null}
        {scope ? <span>Scope: {formatReviewFieldLabel(scope)}</span> : null}
        {filters.map(([key, value]) => (
          <span key={`preset-filter-${key}`}>
            {formatReviewFieldLabel(key)}: {formatReviewValue(value)}
          </span>
        ))}
      </div>
    </div>
  )
}

function renderProposedMutation(
  actionType: AssistantActionType,
  reviewContext: AssistantActionReviewContext,
) {
  const proposedMutationEntries = Object.entries(reviewContext.proposed_mutation)
  if (proposedMutationEntries.length === 0) {
    return null
  }

  if (actionType === 'create_settlement_report_preset') {
    return renderSettlementPresetMutation(reviewContext)
  }

  return (
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
  )
}

function ActionReviewContext({
  actionType,
  reviewContext,
}: {
  actionType: AssistantActionType
  reviewContext: AssistantActionReviewContext
}) {
  const staleStateEntries = Object.entries(reviewContext.stale_state_basis)

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

      {renderProposedMutation(actionType, reviewContext)}

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

      {reviewContext.action_preview ? <ActionPreview preview={reviewContext.action_preview} /> : null}

      {staleStateEntries.length > 0 ? (
        <div className="assistant-action-review-block">
          <strong>Stale-state basis</strong>
          <div className="assistant-action-field-list">
            {staleStateEntries.map(([key, value]) => (
              <span key={`stale-${key}`}>
                {formatReviewFieldLabel(key)}: {formatReviewValue(value)}
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
  const [decisionDrafts, setDecisionDrafts] = useState<Record<number, DecisionDraft>>({})

  if (actionRequests.length === 0) {
    return null
  }

  function decisionDraftFor(actionRequestId: number): DecisionDraft {
    return decisionDrafts[actionRequestId] ?? DEFAULT_DECISION_DRAFT
  }

  function updateDecisionDraft(actionRequestId: number, patch: Partial<DecisionDraft>) {
    setDecisionDrafts((current) => ({
      ...current,
      [actionRequestId]: {
        ...DEFAULT_DECISION_DRAFT,
        ...current[actionRequestId],
        ...patch,
        error: patch.error ?? '',
      },
    }))
  }

  function submitDecision(actionRequestId: number, decision: 'approve' | 'reject') {
    if (!onDecision) {
      return
    }

    const draft = decisionDraftFor(actionRequestId)
    const correctionFields = parseCorrectionFields(draft.correctionFields)
    if (
      decision === 'approve' &&
      draft.reviewOutcome === 'APPROVED_WITH_CORRECTIONS' &&
      !draft.correctionSummary.trim() &&
      correctionFields.length === 0
    ) {
      updateDecisionDraft(actionRequestId, {
        error: 'Add a correction summary or corrected field before approving with corrections.',
      })
      return
    }

    onDecision(actionRequestId, decision, {
      reviewOutcome: decision === 'approve' ? draft.reviewOutcome : 'REJECTED',
      decisionNote: draft.decisionNote,
      correctionSummary:
        decision === 'approve' && draft.reviewOutcome === 'APPROVED_WITH_CORRECTIONS'
          ? draft.correctionSummary
          : undefined,
      correctionFields:
        decision === 'approve' && draft.reviewOutcome === 'APPROVED_WITH_CORRECTIONS'
          ? correctionFields
          : undefined,
    })
  }

  return (
    <div className="assistant-action-list">
      {actionRequests.map((actionRequest) => {
        const { lifecycle } = actionRequest
        const actionBusy = actionRequestIdsInFlight.includes(actionRequest.action_request_id)
        const actionDecidable = lifecycle.can_approve || lifecycle.can_reject
        const decisionDraft = decisionDraftFor(actionRequest.action_request_id)

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
              <ActionReviewContext
                actionType={actionRequest.action_type}
                reviewContext={actionRequest.review_context}
              />
            ) : null}

            {Object.keys(actionRequest.payload).length > 0 &&
            actionRequest.action_type !== 'create_settlement_report_preset' ? (
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

            {actionRequest.review_outcome ? (
              <div className="assistant-message-meta assistant-action-meta">
                <span>Review: {formatReviewOutcome(actionRequest.review_outcome)}</span>
                {actionRequest.decision_note ? <span>Note: {actionRequest.decision_note}</span> : null}
                {actionRequest.correction_summary ? (
                  <span>Corrections: {actionRequest.correction_summary}</span>
                ) : null}
                {actionRequest.correction_fields.length > 0 ? (
                  <span>Fields: {actionRequest.correction_fields.join(', ')}</span>
                ) : null}
              </div>
            ) : null}

            {actionDecidable && onDecision ? (
              <div className="assistant-action-decision-panel">
                <div className="assistant-action-decision-grid">
                  <label className="assistant-action-decision-field">
                    <span>Approval outcome</span>
                    <select
                      className="control"
                      value={decisionDraft.reviewOutcome}
                      disabled={actionBusy}
                      onChange={(event) =>
                        updateDecisionDraft(actionRequest.action_request_id, {
                          reviewOutcome: event.target.value as DecisionDraft['reviewOutcome'],
                        })
                      }
                    >
                      <option value="APPROVED_AS_IS">Approve as-is</option>
                      <option value="APPROVED_WITH_CORRECTIONS">Approve after corrections</option>
                    </select>
                  </label>
                  <label className="assistant-action-decision-field">
                    <span>Decision note</span>
                    <input
                      className="control"
                      value={decisionDraft.decisionNote}
                      disabled={actionBusy}
                      onChange={(event) =>
                        updateDecisionDraft(actionRequest.action_request_id, {
                          decisionNote: event.target.value,
                        })
                      }
                      placeholder="Optional reviewer note"
                    />
                  </label>
                </div>

                {decisionDraft.reviewOutcome === 'APPROVED_WITH_CORRECTIONS' ? (
                  <div className="assistant-action-decision-grid">
                    <label className="assistant-action-decision-field">
                      <span>Correction summary</span>
                      <textarea
                        className="control assistant-action-decision-textarea"
                        value={decisionDraft.correctionSummary}
                        disabled={actionBusy}
                        onChange={(event) =>
                          updateDecisionDraft(actionRequest.action_request_id, {
                            correctionSummary: event.target.value,
                          })
                        }
                        placeholder="What changed before approval"
                      />
                    </label>
                    <label className="assistant-action-decision-field">
                      <span>Corrected fields</span>
                      <input
                        className="control"
                        value={decisionDraft.correctionFields}
                        disabled={actionBusy}
                        onChange={(event) =>
                          updateDecisionDraft(actionRequest.action_request_id, {
                            correctionFields: event.target.value,
                          })
                        }
                        placeholder="field_one, field_two"
                      />
                    </label>
                  </div>
                ) : null}

                {decisionDraft.error ? (
                  <p className="assistant-action-decision-error">{decisionDraft.error}</p>
                ) : null}

                <div className="assistant-action-actions">
                  {lifecycle.can_approve ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={actionBusy}
                      onClick={() => submitDecision(actionRequest.action_request_id, 'approve')}
                    >
                      {actionBusy ? 'Working...' : 'Approve'}
                    </button>
                  ) : null}
                  {lifecycle.can_reject ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={actionBusy}
                      onClick={() => submitDecision(actionRequest.action_request_id, 'reject')}
                    >
                      Reject
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
