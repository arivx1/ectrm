import { useState } from 'react'
import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type { TradeWorkflowItemRecord } from '../../shared/models'
import {
  allocationStatusOptions,
  confirmationStatusOptions,
  invoiceStatusOptions,
  nominationStatusOptions,
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
  if (item.is_overdue || item.status === 'DISPUTED' || item.status === 'OVERDUE') {
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

function workflowSummary(
  item: TradeWorkflowItemRecord,
  formatDateOnly: WorkflowQueueEditorProps['formatDateOnly'],
): string {
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
          const saveDisabled =
            savingItemId === item.item_id ||
            !authSession ||
            Object.keys(buildPayload(item, draft)).length === 0
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
                    disabled={savingItemId === item.item_id}
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
                    placeholder="Add an operational handoff note or settlement comment."
                    rows={2}
                    disabled={savingItemId === item.item_id}
                  />
                </label>
              </div>
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
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
