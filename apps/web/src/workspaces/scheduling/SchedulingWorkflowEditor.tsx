import { useEffect, useState } from 'react'

import type { CreateTradeWorkflowItemInput, UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { DeliveryRecord, DeliverySchedulingWorkflowItemRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  allocationStatusOptions,
  confirmationStatusOptions,
  nominationStatusOptions,
} from '../../shared/trading'

type SchedulingWorkflowEditorProps = {
  authSession: StoredAuthSession | null
  delivery: DeliveryRecord
  items: DeliverySchedulingWorkflowItemRecord[]
  creationPendingTradeId: string | null
  savingItemId: number | null
  saveError: string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onCreateItem: (
    tradeId: string,
    payload: Omit<CreateTradeWorkflowItemInput, 'trade_id'>,
  ) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onSaveItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

type WorkflowDraft = {
  status: string
  owner: string
  dueAt: string
  notes: string
}

type CreateWorkflowDraft = {
  workflowType: DeliverySchedulingWorkflowItemRecord['workflow_type']
  owner: string
  dueAt: string
  notes: string
}

const STATUS_OPTIONS = {
  CONFIRMATION: confirmationStatusOptions,
  NOMINATION: nominationStatusOptions,
  ALLOCATION: allocationStatusOptions,
} as const

const CREATE_WORKFLOW_OPTIONS: Array<{
  value: DeliverySchedulingWorkflowItemRecord['workflow_type']
  label: string
  detail: string
}> = [
  {
    value: 'CONFIRMATION',
    label: 'Confirmation',
    detail: 'Create a confirmation handoff when commercial terms still need scheduler visibility.',
  },
  {
    value: 'NOMINATION',
    label: 'Nomination',
    detail: 'Create a nomination task when the row needs an explicit schedule submission owner.',
  },
  {
    value: 'ALLOCATION',
    label: 'Allocation',
    detail: 'Create downstream allocation follow-up after the schedule is in motion.',
  },
]

function buildDraft(item: DeliverySchedulingWorkflowItemRecord): WorkflowDraft {
  return {
    status: item.status,
    owner: item.owner ?? '',
    dueAt: item.due_at ? item.due_at.slice(0, 10) : '',
    notes: item.notes ?? '',
  }
}

function workflowTone(item: DeliverySchedulingWorkflowItemRecord): 'active' | 'in-progress' | 'blocked' {
  if (item.is_overdue || item.status === 'DISPUTED') {
    return 'blocked'
  }
  if (item.owner || item.due_at) {
    return 'in-progress'
  }
  return 'active'
}

function workflowTypeLabel(value: DeliverySchedulingWorkflowItemRecord['workflow_type']): string {
  return value.replaceAll('_', ' ')
}

function buildPayload(
  item: DeliverySchedulingWorkflowItemRecord,
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

export function SchedulingWorkflowEditor({
  authSession,
  delivery,
  items,
  creationPendingTradeId,
  savingItemId,
  saveError,
  formatDate,
  formatDateOnly,
  onCreateItem,
  onOpenTrade,
  onSaveItem,
}: SchedulingWorkflowEditorProps) {
  const [drafts, setDrafts] = useState<Record<number, WorkflowDraft>>(() =>
    Object.fromEntries(items.map((item) => [item.item_id, buildDraft(item)])),
  )
  const [createDraft, setCreateDraft] = useState<CreateWorkflowDraft>({
    workflowType: delivery.next_scheduling_workflow_type ?? 'CONFIRMATION',
    owner: '',
    dueAt: delivery.scheduling_due_at ? delivery.scheduling_due_at.slice(0, 10) : '',
    notes: '',
  })

  useEffect(() => {
    setDrafts(Object.fromEntries(items.map((item) => [item.item_id, buildDraft(item)])))
  }, [items])

  useEffect(() => {
    setCreateDraft({
      workflowType: delivery.next_scheduling_workflow_type ?? 'CONFIRMATION',
      owner: '',
      dueAt: delivery.scheduling_due_at ? delivery.scheduling_due_at.slice(0, 10) : '',
      notes: '',
    })
  }, [delivery])

  function updateDraft(itemId: number, patch: Partial<WorkflowDraft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? buildDraft(items.find((item) => item.item_id === itemId) ?? items[0])),
        ...patch,
      },
    }))
  }

  async function handleSave(item: DeliverySchedulingWorkflowItemRecord) {
    const draft = drafts[item.item_id] ?? buildDraft(item)
    const payload = buildPayload(item, draft)
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSaveItem(item.item_id, payload)
  }

  async function handleAssignSelf(item: DeliverySchedulingWorkflowItemRecord) {
    if (!authSession) {
      return
    }
    await onSaveItem(item.item_id, { owner: authSession.user.user_id })
  }

  async function handleCreate() {
    await onCreateItem(delivery.trade_id, {
      workflow_type: createDraft.workflowType,
      owner: createDraft.owner.trim() || null,
      due_at: createDraft.dueAt ? `${createDraft.dueAt}T12:00:00.000Z` : null,
      notes: createDraft.notes.trim() || null,
    })
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">Sign in from Settings to edit scheduler workflow ownership, due dates, and statuses.</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      <article className="position-card shipment-card workflow-item-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Create Scheduler Work Item</strong>
            <span>Open a confirmation, nomination, or allocation handoff when this delivery row needs explicit scheduler ownership.</span>
          </div>
        </div>
        <div className="workflow-item-grid">
          <label className="field">
            <span>Workflow Type</span>
            <select
              className="control control-compact"
              value={createDraft.workflowType}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  workflowType: event.target.value as DeliverySchedulingWorkflowItemRecord['workflow_type'],
                }))
              }
              disabled={creationPendingTradeId === delivery.trade_id}
            >
              {CREATE_WORKFLOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Owner</span>
            <input
              className="control control-compact"
              value={createDraft.owner}
              onChange={(event) => setCreateDraft((current) => ({ ...current, owner: event.target.value }))}
              placeholder="Unassigned"
              disabled={creationPendingTradeId === delivery.trade_id}
            />
          </label>
          <label className="field">
            <span>Due</span>
            <input
              type="date"
              className="control control-compact"
              value={createDraft.dueAt}
              onChange={(event) => setCreateDraft((current) => ({ ...current, dueAt: event.target.value }))}
              disabled={creationPendingTradeId === delivery.trade_id}
            />
          </label>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea
              className="control control-textarea"
              value={createDraft.notes}
              onChange={(event) => setCreateDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder={
                CREATE_WORKFLOW_OPTIONS.find((option) => option.value === createDraft.workflowType)?.detail ??
                'Add scheduler context for the desk.'
              }
              rows={1}
              disabled={creationPendingTradeId === delivery.trade_id}
            />
          </label>
        </div>
        <div className="shipment-card-actions workflow-item-actions">
          <span>
            {delivery.commodity} • {delivery.location_code ?? 'Location TBD'} •{' '}
            {delivery.delivery_start || delivery.delivery_end
              ? `Delivery ${formatDateOnly(delivery.delivery_start)} to ${formatDateOnly(delivery.delivery_end)}`
              : 'Window TBD'}
          </span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void handleCreate()}
            disabled={!authSession || creationPendingTradeId === delivery.trade_id}
          >
            {creationPendingTradeId === delivery.trade_id ? 'Creating…' : 'Create Work Item'}
          </button>
        </div>
      </article>
      {items.length > 0 ? (
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
          const statusOptions = STATUS_OPTIONS[item.workflow_type]

          return (
            <article key={item.item_id} className="position-card shipment-card workflow-item-card workflow-item-card-compact">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{workflowTypeLabel(item.workflow_type)}</strong>
                  <span>
                    {delivery.commodity} • {delivery.location_code ?? 'Location TBD'} •{' '}
                    {delivery.delivery_start || delivery.delivery_end
                      ? `Delivery ${formatDateOnly(delivery.delivery_start)} to ${formatDateOnly(delivery.delivery_end)}`
                      : 'Window TBD'}
                  </span>
                </div>
                <span className={`status-pill status-pill-${workflowTone(item)}`}>
                  {item.status.replaceAll('_', ' ')}
                </span>
              </div>

              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">
                  {item.owner ? `Owner ${item.owner}` : 'Unassigned'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {item.due_at ? `Due ${formatDateOnly(item.due_at)}` : 'No due date'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {item.is_closed ? 'Closed' : item.is_overdue ? 'Overdue' : 'Open'}
                </span>
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
                    placeholder="Add a scheduler handoff note or operational context."
                    rows={1}
                    disabled={savingItemId === item.item_id}
                  />
                </label>
              </div>

              {item.is_overdue ? (
                <p className="field-error">This workflow item is overdue and should be cleared or reassigned now.</p>
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
                  <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
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
      ) : (
        <div className="empty-state">
          <strong>No open scheduling workflow items</strong>
          <p>Create a scheduler handoff above if this row needs confirmation, nomination, or allocation follow-up.</p>
        </div>
      )}
    </div>
  )
}
