import { useState } from 'react'
import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type { TradeCreditApprovalDecisionRecord, TradeWorkflowItemRecord } from '../../shared/models'
import {
  allocationStatusOptions,
  buildTradeCreditHoldSummary,
  confirmationStatusOptions,
  creditApprovalStatusOptions,
  invoiceStatusOptions,
  nominationStatusOptions,
  optionSettlementStatusOptions,
  paymentStatusOptions,
} from '../../shared/trading'

type WorkflowQueueEditorProps = {
  authSession: StoredAuthSession | null
  items: TradeWorkflowItemRecord[]
  savingItemId: number | null
  saveError: string
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
  onSaveItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

type WorkflowDraft = {
  status: string
  owner: string
  dueAt: string
  notes: string
}

const WORKFLOW_STATUS_OPTIONS = {
  CONFIRMATION: confirmationStatusOptions,
  NOMINATION: nominationStatusOptions,
  ALLOCATION: allocationStatusOptions,
  CREDIT_APPROVAL: creditApprovalStatusOptions,
  OPTION_SETTLEMENT: optionSettlementStatusOptions,
  INVOICE: invoiceStatusOptions,
  PAYMENT: paymentStatusOptions,
} as const

function buildDraft(item: TradeWorkflowItemRecord): WorkflowDraft {
  return {
    status: item.status,
    owner: item.owner ?? '',
    dueAt: item.due_at ? item.due_at.slice(0, 10) : '',
    notes: item.notes ?? '',
  }
}

function emptyDraft(): WorkflowDraft {
  return {
    status: '',
    owner: '',
    dueAt: '',
    notes: '',
  }
}

function workflowTone(item: TradeWorkflowItemRecord): 'active' | 'in-progress' | 'blocked' {
  if (
    item.credit_hold_active ||
    item.is_overdue ||
    item.status === 'DISPUTED' ||
    item.status === 'OVERDUE' ||
    item.status === 'PENDING_REVIEW' ||
    item.status === 'REJECTED'
  ) {
    return 'blocked'
  }
  if (item.owner || item.due_at) {
    return 'in-progress'
  }
  return 'active'
}

function workflowTypeLabel(value: TradeWorkflowItemRecord['workflow_type']): string {
  return value.replaceAll('_', ' ')
}

function decisionLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function hasCreditApprovalAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'CREDIT_APPROVER' || role === 'OPS_ADMIN' || role === 'ADMIN'
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function snapshotNumber(snapshot: Record<string, unknown>, key: string): number | null {
  const value = snapshot[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatSnapshotNumber(value: number, digits = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function creditDecisionExposureSummary(decision: TradeCreditApprovalDecisionRecord): string | null {
  const currency = snapshotText(decision.breach_snapshot, 'limit_currency_code')
  const projected = snapshotNumber(decision.breach_snapshot, 'projected_exposure_amount')
  const limit = snapshotNumber(decision.breach_snapshot, 'limit_amount')
  const utilization = snapshotNumber(decision.breach_snapshot, 'projected_utilization_percent')
  if (currency && projected !== null && limit !== null) {
    const utilizationText = utilization !== null ? ` at ${formatSnapshotNumber(utilization)}% utilization` : ''
    return `Projected ${currency} ${formatSnapshotNumber(projected, 2)} versus limit ${currency} ${formatSnapshotNumber(limit, 2)}${utilizationText}.`
  }
  const comparisonReason = snapshotText(decision.breach_snapshot, 'comparison_reason')
  return comparisonReason ? `Snapshot basis: ${comparisonReason.replaceAll('_', ' ')}.` : null
}

function workflowSummary(
  item: TradeWorkflowItemRecord,
  formatDateOnly: WorkflowQueueEditorProps['formatDateOnly'],
): string {
  if (item.workflow_type === 'OPTION_SETTLEMENT') {
    return item.notes?.trim() || 'Book the resulting underlying trade or mark the handoff not required.'
  }
  if (item.delivery_start || item.delivery_end) {
    return `Delivery ${formatDateOnly(item.delivery_start)} to ${formatDateOnly(item.delivery_end)}`
  }
  return `Trade date ${formatDateOnly(item.trade_date)}`
}

function buildPayload(
  item: TradeWorkflowItemRecord,
  draft: WorkflowDraft,
): UpdateTradeWorkflowItemInput {
  const payload: UpdateTradeWorkflowItemInput = {}
  const normalizedOwner = draft.owner.trim()
  const normalizedNotes = draft.notes.trim()
  const currentDueDate = item.due_at ? item.due_at.slice(0, 10) : ''

  if (draft.status !== item.status) {
    payload.status = draft.status
  }
  if (normalizedOwner !== (item.owner ?? '')) {
    payload.owner = normalizedOwner || null
  }
  if (draft.dueAt !== currentDueDate) {
    payload.due_at = draft.dueAt ? `${draft.dueAt}T12:00:00.000Z` : null
  }
  if (normalizedNotes !== (item.notes ?? '')) {
    payload.notes = normalizedNotes || null
  }

  return payload
}

export function WorkflowQueueEditor({
  authSession,
  items,
  savingItemId,
  saveError,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  onOpenTrade,
  onSaveItem,
}: WorkflowQueueEditorProps) {
  const [drafts, setDrafts] = useState<Record<number, WorkflowDraft>>(() =>
    Object.fromEntries(items.map((item) => [item.item_id, buildDraft(item)])),
  )
  const creditApprovalAuthorized = hasCreditApprovalAccess(authSession)

  function updateDraft(itemId: number, patch: Partial<WorkflowDraft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? emptyDraft()),
        ...patch,
      },
    }))
  }

  async function handleSave(item: TradeWorkflowItemRecord) {
    const draft = drafts[item.item_id] ?? buildDraft(item)
    const payload = buildPayload(item, draft)
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSaveItem(item.item_id, payload)
  }

  async function handleAssignSelf(item: TradeWorkflowItemRecord) {
    if (!authSession) {
      return
    }
    await onSaveItem(item.item_id, { owner: authSession.user.user_id })
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">Sign in from Settings to edit workflow ownership, due dates, and statuses.</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      <div className="position-list">
        {items.map((item) => {
          const draft = drafts[item.item_id] ?? buildDraft(item)
          const creditHoldSummary = buildTradeCreditHoldSummary(
            item.credit_approval_status
              ? {
                  status: item.credit_approval_status ?? '',
                  notes: item.credit_hold_reason ?? null,
                }
              : null,
          )
          const lifecycleStatusLocked = item.workflow_type !== 'CREDIT_APPROVAL' && creditHoldSummary.credit_hold_active
          const creditStatusLocked = item.workflow_type === 'CREDIT_APPROVAL' && !creditApprovalAuthorized
          const creditDecisionNoteAvailable = Boolean(draft.notes.trim() || item.notes?.trim())
          const creditDecisionCommentRequired =
            item.workflow_type === 'CREDIT_APPROVAL' &&
            draft.status !== item.status &&
            (draft.status === 'APPROVED' || draft.status === 'REJECTED') &&
            !creditDecisionNoteAvailable
          const approvePayload =
            item.workflow_type === 'CREDIT_APPROVAL'
              ? buildPayload(item, { ...draft, status: 'APPROVED' })
              : null
          const rejectPayload =
            item.workflow_type === 'CREDIT_APPROVAL'
              ? buildPayload(item, { ...draft, status: 'REJECTED' })
              : null
          const saveDisabled =
            savingItemId === item.item_id ||
            !authSession ||
            Object.keys(buildPayload(item, draft)).length === 0 ||
            creditDecisionCommentRequired
          const assignSelfDisabled =
            !authSession ||
            authSession.user.user_id === (item.owner ?? '') ||
            savingItemId === item.item_id
          const statusOptions = WORKFLOW_STATUS_OPTIONS[item.workflow_type]

          return (
            <article key={item.item_id} className="position-card shipment-card workflow-item-card">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{item.trade_id}</strong>
                  <span>
                    {item.commodity} • {item.counterparty ?? 'Counterparty TBD'} • {item.book}
                  </span>
                </div>
                <span className={`status-pill status-pill-${workflowTone(item)}`}>
                  {item.status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{workflowTypeLabel(item.workflow_type)}</span>
                <span className="entity-chip entity-chip-soft">{formatCommodityClass(item.commodity_class)}</span>
                <span className="entity-chip entity-chip-soft">
                  {item.owner ? `Owner ${item.owner}` : 'Unassigned'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {item.due_at ? `Due ${formatDateOnly(item.due_at)}` : 'No due date'}
                </span>
              </div>
              <div className="shipment-card-copy">
                <p>{workflowSummary(item, formatDateOnly)}</p>
              </div>
              <div className="workflow-item-grid">
                <label className="field">
                  <span>Status</span>
                  <select
                    className="control control-compact"
                    value={draft.status}
                    onChange={(event) => updateDraft(item.item_id, { status: event.target.value })}
                    disabled={savingItemId === item.item_id || lifecycleStatusLocked || creditStatusLocked}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Owner</span>
                  <input
                    className="control control-compact"
                    value={draft.owner}
                    onChange={(event) => updateDraft(item.item_id, { owner: event.target.value })}
                    placeholder="Unassigned"
                    disabled={savingItemId === item.item_id}
                  />
                </label>
                <label className="field">
                  <span>Due</span>
                  <input
                    type="date"
                    className="control control-compact"
                    value={draft.dueAt}
                    onChange={(event) => updateDraft(item.item_id, { dueAt: event.target.value })}
                    disabled={savingItemId === item.item_id}
                  />
                </label>
                <label className="field field-wide">
                  <span>Notes</span>
                  <textarea
                    className="control control-textarea"
                    value={draft.notes}
                    onChange={(event) => updateDraft(item.item_id, { notes: event.target.value })}
                    placeholder={
                      item.workflow_type === 'OPTION_SETTLEMENT'
                        ? 'Track the resulting underlying booking or settlement handoff.'
                        : 'Add an operational handoff note or settlement comment.'
                    }
                    rows={2}
                    disabled={savingItemId === item.item_id}
                  />
                </label>
              </div>
              {lifecycleStatusLocked ? (
                <p className="field-error">
                  {creditHoldSummary.credit_hold_reason ?? 'Credit approval is pending review.'}
                </p>
              ) : null}
              {creditStatusLocked && authSession ? (
                <p className="workflow-editor-note">
                  Only `CREDIT_APPROVER`, `OPS_ADMIN`, or `ADMIN` sessions can change credit approval status.
                </p>
              ) : null}
              {creditDecisionCommentRequired ? (
                <p className="field-error">Approval and rejection decisions require a comment in notes.</p>
              ) : null}
              {item.workflow_type === 'CREDIT_APPROVAL' && item.credit_decision_history.length > 0 ? (
                <div className="timeline">
                  {item.credit_decision_history.map((decision) => (
                    <article key={decision.decision_id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <strong>{decisionLabel(decision.decision)}</strong>
                          <span>{formatDate(decision.decided_at)}</span>
                        </div>
                        <p>{decision.decision_comment}</p>
                        <p>
                          {decision.decided_by}
                          {creditDecisionExposureSummary(decision)
                            ? ` • ${creditDecisionExposureSummary(decision)}`
                            : ''}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {item.active_credit_exception ? (
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">
                    Exception expires {formatDateOnly(item.active_credit_exception.expires_at)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    Headroom{' '}
                    {item.active_credit_exception.remaining_headroom_amount !== null
                      ? `${item.active_credit_exception.limit_currency_code} ${formatSnapshotNumber(item.active_credit_exception.remaining_headroom_amount, 2)}`
                      : '—'}
                  </span>
                  <span className={`entity-chip entity-chip-soft`}>
                    {item.active_credit_exception.revalidation_required
                      ? `Revalidate ${decisionLabel(item.active_credit_exception.revalidation_reason ?? 'REQUIRED')}`
                      : 'Within approved envelope'}
                  </span>
                </div>
              ) : null}
              <div className="shipment-card-actions workflow-item-actions">
                <span>Updated {formatDate(item.updated_at)}</span>
                <div className="workflow-item-button-row">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => void handleAssignSelf(item)}
                    disabled={assignSelfDisabled}
                  >
                    Assign Me
                  </button>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => onOpenTrade(item.trade_id)}
                  >
                    Open Trade
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void handleSave(item)}
                    disabled={saveDisabled}
                  >
                    {savingItemId === item.item_id ? 'Saving…' : 'Save'}
                  </button>
                  {item.workflow_type === 'CREDIT_APPROVAL' ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        if (approvePayload) {
                          void onSaveItem(item.item_id, approvePayload)
                        }
                      }}
                      disabled={
                        !authSession ||
                        !creditApprovalAuthorized ||
                        savingItemId === item.item_id ||
                        !approvePayload ||
                        Object.keys(approvePayload).length === 0 ||
                        !creditDecisionNoteAvailable
                      }
                    >
                      Approve With Comment
                    </button>
                  ) : null}
                  {item.workflow_type === 'CREDIT_APPROVAL' ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        if (rejectPayload) {
                          void onSaveItem(item.item_id, rejectPayload)
                        }
                      }}
                      disabled={
                        !authSession ||
                        !creditApprovalAuthorized ||
                        savingItemId === item.item_id ||
                        !rejectPayload ||
                        Object.keys(rejectPayload).length === 0 ||
                        !creditDecisionNoteAvailable
                      }
                    >
                      Reject With Comment
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
