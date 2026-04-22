import { useEffect, useMemo, useState } from 'react'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import type { CreateTradeWorkflowItemInput, UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type { Trade, TradeCreditApprovalDecisionRecord, TradeWorkflowItemRecord } from '../../shared/models'
import {
  allocationStatusOptions,
  actualizationStatusOptions,
  buildCreditApprovalFreshnessBlockerSummary,
  buildTradeCreditHoldSummary,
  confirmationStatusOptions,
  creditApprovalStatusOptions,
  invoiceStatusOptions,
  nominationStatusOptions,
  optionSettlementStatusOptions,
  paymentStatusOptions,
} from '../../shared/trading'
import {
  OperationalFormActions,
} from './operationalFormPrimitives'
import {
  OperationalDescriptorForm,
  OperationalDescriptorFormFeedback,
  resolveOperationalFormDefinition,
} from './operationalFormRegistry'
import {
  OperationalDescriptorActionRow,
  resolveOperationalResourcePermissionMessage,
  resolveOperationalFormActionSet,
} from './operationalFormActionRegistry'

type WorkflowQueueEditorProps = {
  authSession: StoredAuthSession | null
  activeTrades: Trade[]
  items: TradeWorkflowItemRecord[]
  managedConfirmationTradeIds: string[]
  creationPendingTradeId: string | null
  savingItemId: number | null
  saveError: string
  operationalResourceDescriptor?: OperationalResourceDescriptor | null
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onCreateItem: (
    tradeId: string,
    payload: Omit<CreateTradeWorkflowItemInput, 'trade_id'>,
  ) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onBookUnderlyingTrade: (itemId: number) => Promise<void>
  onSaveItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

type WorkflowDraft = {
  status: string
  owner: string
  dueAt: string
  notes: string
}

type WorkflowTradeGroup = {
  tradeId: string
  leadItem: TradeWorkflowItemRecord
  summaryItem: TradeWorkflowItemRecord
  items: TradeWorkflowItemRecord[]
  tone: 'active' | 'in-progress' | 'blocked'
  blockedCount: number
  unassignedCount: number
  earliestDueAt: string | null
  latestUpdatedAt: string
}

type CreateWorkflowDraft = {
  tradeId: string
  workflowType: string
  owner: string
  dueAt: string
  notes: string
}

const WORKFLOW_STATUS_OPTIONS = {
  CONFIRMATION: confirmationStatusOptions,
  NOMINATION: nominationStatusOptions,
  ALLOCATION: allocationStatusOptions,
  ACTUALIZATION: actualizationStatusOptions,
  CREDIT_APPROVAL: creditApprovalStatusOptions,
  OPTION_SETTLEMENT: optionSettlementStatusOptions,
  INVOICE: invoiceStatusOptions,
  PAYMENT: paymentStatusOptions,
} as const

const WORKFLOW_TYPE_ORDER: TradeWorkflowItemRecord['workflow_type'][] = [
  'CONFIRMATION',
  'NOMINATION',
  'ALLOCATION',
  'ACTUALIZATION',
  'OPTION_SETTLEMENT',
  'CREDIT_APPROVAL',
  'INVOICE',
  'PAYMENT',
]

const MANUAL_OPERATIONS_WORKFLOW_OPTIONS: Array<{
  value: 'ACTUALIZATION' | 'CREDIT_APPROVAL' | 'OPTION_SETTLEMENT'
  label: string
  detail: string
}> = [
  {
    value: 'ACTUALIZATION',
    label: 'Actualization',
    detail: 'Open a manual actualization handoff when executed quantity capture needs explicit ownership.',
  },
  {
    value: 'CREDIT_APPROVAL',
    label: 'Credit Approval',
    detail: 'Create or reopen a credit review handoff for a trade that needs exception handling.',
  },
  {
    value: 'OPTION_SETTLEMENT',
    label: 'Option Settlement',
    detail: 'Open the resulting-underlying booking handoff for an exercised or assigned option.',
  },
] as const

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

function availableManualWorkflowOptions(trade: Trade): typeof MANUAL_OPERATIONS_WORKFLOW_OPTIONS {
  return MANUAL_OPERATIONS_WORKFLOW_OPTIONS.filter((option) => {
    if (option.value === 'ACTUALIZATION') {
      return trade.trade_nature === 'PHYSICAL'
    }
    if (option.value === 'OPTION_SETTLEMENT') {
      return trade.instrument_type === 'OPTION'
    }
    return true
  })
}

function buildCreateDraft(activeTrades: Trade[]): CreateWorkflowDraft {
  const leadTrade = activeTrades[0]
  const leadWorkflowType = leadTrade ? availableManualWorkflowOptions(leadTrade)[0]?.value ?? '' : ''

  return {
    tradeId: leadTrade?.trade_id ?? '',
    workflowType: leadWorkflowType,
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
  if (item.workflow_type === 'ACTUALIZATION') {
    return item.notes?.trim() || 'Capture executed quantity and actual delivery timestamp for this obligation.'
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

function workflowTypeRank(value: TradeWorkflowItemRecord['workflow_type']): number {
  const index = WORKFLOW_TYPE_ORDER.indexOf(value)
  return index === -1 ? WORKFLOW_TYPE_ORDER.length : index
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function compareOptionalDates(left: string | null | undefined, right: string | null | undefined): number {
  const leftTimestamp = parseTimestamp(left)
  const rightTimestamp = parseTimestamp(right)

  if (leftTimestamp === null && rightTimestamp === null) {
    return 0
  }
  if (leftTimestamp === null) {
    return 1
  }
  if (rightTimestamp === null) {
    return -1
  }
  return leftTimestamp - rightTimestamp
}

function compareWorkflowItems(left: TradeWorkflowItemRecord, right: TradeWorkflowItemRecord): number {
  const typeDifference = workflowTypeRank(left.workflow_type) - workflowTypeRank(right.workflow_type)
  if (typeDifference !== 0) {
    return typeDifference
  }

  const dueDifference = compareOptionalDates(left.due_at, right.due_at)
  if (dueDifference !== 0) {
    return dueDifference
  }

  return left.item_id - right.item_id
}

function workflowTradeTone(items: TradeWorkflowItemRecord[]): 'active' | 'in-progress' | 'blocked' {
  const tones = items.map(workflowTone)
  if (tones.includes('blocked')) {
    return 'blocked'
  }
  if (tones.includes('in-progress')) {
    return 'in-progress'
  }
  return 'active'
}

function earliestDueAt(items: TradeWorkflowItemRecord[]): string | null {
  return (
    items
      .map((item) => item.due_at)
      .filter((value): value is string => parseTimestamp(value) !== null)
      .sort(compareOptionalDates)[0] ?? null
  )
}

function latestUpdatedAt(items: TradeWorkflowItemRecord[]): string {
  return items.reduce((latestValue, item) => {
    const latestTimestamp = parseTimestamp(latestValue)
    const itemTimestamp = parseTimestamp(item.updated_at)

    if (itemTimestamp === null) {
      return latestValue
    }
    if (latestTimestamp === null || itemTimestamp > latestTimestamp) {
      return item.updated_at
    }
    return latestValue
  }, items[0]?.updated_at ?? '')
}

function summaryWorkflowItem(items: TradeWorkflowItemRecord[]): TradeWorkflowItemRecord {
  return items.find((item) => item.delivery_start || item.delivery_end || item.trade_date) ?? items[0]
}

function buildWorkflowTradeGroups(items: TradeWorkflowItemRecord[]): WorkflowTradeGroup[] {
  const tradeIds: string[] = []
  const itemsByTradeId = new Map<string, TradeWorkflowItemRecord[]>()

  for (const item of items) {
    if (!itemsByTradeId.has(item.trade_id)) {
      itemsByTradeId.set(item.trade_id, [])
      tradeIds.push(item.trade_id)
    }

    itemsByTradeId.get(item.trade_id)?.push(item)
  }

  return tradeIds.map((tradeId) => {
    const tradeItems = [...(itemsByTradeId.get(tradeId) ?? [])].sort(compareWorkflowItems)
    const leadItem = tradeItems[0]

    return {
      tradeId,
      leadItem,
      summaryItem: summaryWorkflowItem(tradeItems),
      items: tradeItems,
      tone: workflowTradeTone(tradeItems),
      blockedCount: tradeItems.filter((item) => workflowTone(item) === 'blocked').length,
      unassignedCount: tradeItems.filter((item) => !item.owner?.trim()).length,
      earliestDueAt: earliestDueAt(tradeItems),
      latestUpdatedAt: latestUpdatedAt(tradeItems),
    }
  })
}

function workflowTradeStatusLabel(group: WorkflowTradeGroup): string {
  if (group.blockedCount > 0) {
    return `${group.blockedCount} blocked`
  }
  if (group.unassignedCount > 0) {
    return `${group.unassignedCount} unassigned`
  }
  return `${group.items.length} open step${group.items.length === 1 ? '' : 's'}`
}

export function WorkflowQueueEditor({
  authSession,
  activeTrades,
  items,
  managedConfirmationTradeIds,
  creationPendingTradeId,
  savingItemId,
  saveError,
  operationalResourceDescriptor = null,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  onCreateItem,
  onOpenTrade,
  onBookUnderlyingTrade,
  onSaveItem,
}: WorkflowQueueEditorProps) {
  const [drafts, setDrafts] = useState<Record<number, WorkflowDraft>>(() =>
    Object.fromEntries(items.map((item) => [item.item_id, buildDraft(item)])),
  )
  const [createDraft, setCreateDraft] = useState<CreateWorkflowDraft>(() => buildCreateDraft(activeTrades))
  const permissionMessage =
    resolveOperationalResourcePermissionMessage(operationalResourceDescriptor) ??
    'Sign in to edit workflow ownership, due dates, and statuses.'
  const creditApprovalAuthorized = hasCreditApprovalAccess(authSession)
  const managedConfirmationTradeIdSet = new Set(managedConfirmationTradeIds)
  const groupedItems = buildWorkflowTradeGroups(items)
  const selectedCreateTrade = useMemo(
    () => activeTrades.find((trade) => trade.trade_id === createDraft.tradeId) ?? activeTrades[0] ?? null,
    [activeTrades, createDraft.tradeId],
  )
  const createWorkflowOptions = useMemo(
    () => (selectedCreateTrade ? availableManualWorkflowOptions(selectedCreateTrade) : []),
    [selectedCreateTrade],
  )

  useEffect(() => {
    if (!selectedCreateTrade) {
      return
    }

    if (createWorkflowOptions.length === 0) {
      return
    }

    if (createDraft.tradeId !== selectedCreateTrade.trade_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the create draft when the selected trade changes or becomes invalid.
      setCreateDraft((current) => ({
        ...current,
        tradeId: selectedCreateTrade.trade_id,
        workflowType: createWorkflowOptions[0].value,
      }))
      return
    }

    if (!createWorkflowOptions.some((option) => option.value === createDraft.workflowType)) {
      setCreateDraft((current) => ({
        ...current,
        workflowType: createWorkflowOptions[0].value,
      }))
    }
  }, [createDraft.tradeId, createDraft.workflowType, createWorkflowOptions, selectedCreateTrade])

  function updateDraft(itemId: number, patch: Partial<WorkflowDraft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? emptyDraft()),
        ...patch,
      },
    }))
  }

  function updateCreateDraft(patch: Partial<CreateWorkflowDraft>) {
    setCreateDraft((current) => ({
      ...current,
      ...patch,
    }))
  }

  async function handleCreate() {
    const tradeId = createDraft.tradeId.trim()
    const workflowType = createDraft.workflowType.trim()
    if (!tradeId || !workflowType) {
      return
    }

    await onCreateItem(tradeId, {
      workflow_type: workflowType,
      owner: createDraft.owner.trim() || null,
      due_at: createDraft.dueAt ? `${createDraft.dueAt}T12:00:00.000Z` : null,
      notes: createDraft.notes.trim() || null,
    })
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

  function renderWorkflowStep(item: TradeWorkflowItemRecord) {
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
    const confirmationStatusManaged =
      item.workflow_type === 'CONFIRMATION' && managedConfirmationTradeIdSet.has(item.trade_id)
    const creditStatusLocked = item.workflow_type === 'CREDIT_APPROVAL' && !creditApprovalAuthorized
    const creditDecisionNoteAvailable = Boolean(draft.notes.trim() || item.notes?.trim())
    const creditDecisionCommentRequired =
      item.workflow_type === 'CREDIT_APPROVAL' &&
      draft.status !== item.status &&
      (draft.status === 'APPROVED' || draft.status === 'REJECTED') &&
      !creditDecisionNoteAvailable
    const creditApprovalFreshnessSummary = buildCreditApprovalFreshnessBlockerSummary(item.credit_approval_freshness)
    const creditApprovalFreshnessBlocked =
      item.workflow_type === 'CREDIT_APPROVAL' &&
      draft.status === 'APPROVED' &&
      draft.status !== item.status &&
      Boolean(item.credit_approval_freshness?.approval_blocked)
    const approvePayload =
      item.workflow_type === 'CREDIT_APPROVAL' ? buildPayload(item, { ...draft, status: 'APPROVED' }) : null
    const rejectPayload =
      item.workflow_type === 'CREDIT_APPROVAL' ? buildPayload(item, { ...draft, status: 'REJECTED' }) : null
    const statusOptions = WORKFLOW_STATUS_OPTIONS[item.workflow_type]
    const workflowEditForm = resolveOperationalFormDefinition('workflowItemEdit', {
      creditApprovalFreshnessSummary,
      creditDecisionCommentRequired,
      creditStatusLocked,
      draft,
      hasAuthenticatedSession: Boolean(authSession),
      item,
      lifecycleStatusLocked,
      lockReason: creditHoldSummary.credit_hold_reason ?? 'Credit approval is pending review.',
      savingItemId,
      statusOptions,
      updateDraft: (patch) => updateDraft(item.item_id, patch),
      workflowStatusManaged: confirmationStatusManaged,
    })
    const workflowActionSet = resolveOperationalFormActionSet('workflowItemActions', {
      actionStates: item.action_states ?? [],
      approvePayloadEmpty: !approvePayload || Object.keys(approvePayload).length === 0,
      creditApprovalAuthorized,
      creditDecisionCommentRequired,
      creditDecisionNoteAvailable,
      currentUserId: authSession?.user.user_id ?? null,
      hasAuthenticatedSession: Boolean(authSession),
      isSaving: savingItemId === item.item_id,
      item,
      itemOwner: item.owner ?? null,
      onApprove: () => {
        if (approvePayload) {
          void onSaveItem(item.item_id, approvePayload)
        }
      },
      onAssignSelf: () => handleAssignSelf(item),
      onBookUnderlying: () => onBookUnderlyingTrade(item.item_id),
      onOpenUnderlying: () => onOpenTrade(item.linked_trade_id!),
      onReject: () => {
        if (rejectPayload) {
          void onSaveItem(item.item_id, rejectPayload)
        }
      },
      onSave: () => handleSave(item),
      rejectPayloadEmpty: !rejectPayload || Object.keys(rejectPayload).length === 0,
      savePayloadEmpty: Object.keys(buildPayload(item, draft)).length === 0,
    }, operationalResourceDescriptor)

    return (
      <section
        key={item.item_id}
        className={`workflow-item-card workflow-item-card-compact workflow-step-card workflow-step-card-${workflowTone(item)}`}
      >
        <div className="shipment-card-head workflow-step-card-head">
          <div className="shipment-card-copy">
            <div className="workflow-step-card-heading">
              <strong>{workflowTypeLabel(item.workflow_type)}</strong>
              <span className={`status-pill status-pill-${workflowTone(item)}`}>
                {item.status.replaceAll('_', ' ')}
              </span>
            </div>
          </div>
          <span className="workflow-step-card-updated">Updated {formatDate(item.updated_at)}</span>
        </div>
        <div className="shipment-card-meta workflow-step-card-meta">
          <span className="entity-chip entity-chip-soft">{item.owner ? `Owner ${item.owner}` : 'Unassigned'}</span>
          <span className="entity-chip entity-chip-soft">
            {item.due_at ? `Due ${formatDateOnly(item.due_at)}` : 'No due date'}
          </span>
          {item.is_overdue ? <span className="entity-chip entity-chip-soft">Overdue</span> : null}
          {item.workflow_type === 'OPTION_SETTLEMENT' && item.linked_trade_id ? (
            <span className="entity-chip entity-chip-soft">
              Underlying {item.linked_trade_id} {item.linked_trade_status ? `• ${item.linked_trade_status}` : ''}
            </span>
          ) : null}
        </div>
        {item.workflow_type === 'CREDIT_APPROVAL' && item.credit_approval_freshness ? (
          <div className="shipment-card-meta">
            <span className="entity-chip entity-chip-soft">
              Review due {formatDateOnly(item.credit_approval_freshness.review_due_at)}
            </span>
            <span className="entity-chip entity-chip-soft">
              {item.credit_approval_freshness.latest_external_snapshot_provider
                ? `${item.credit_approval_freshness.latest_external_snapshot_provider} as of ${formatDateOnly(item.credit_approval_freshness.latest_external_snapshot_as_of_date)}`
                : 'No external credit snapshot'}
            </span>
            <span className="entity-chip entity-chip-soft">
              {item.credit_approval_freshness.latest_external_snapshot_age_days !== null
                ? `${item.credit_approval_freshness.latest_external_snapshot_age_days} days old`
                : 'Snapshot age unavailable'}
            </span>
          </div>
        ) : null}
        <OperationalDescriptorForm form={workflowEditForm} />
        <OperationalDescriptorFormFeedback form={workflowEditForm} />
        {creditApprovalFreshnessBlocked ? (
          <p className="field-error">
            Status cannot be saved as APPROVED until the stale credit blockers above are cleared.
          </p>
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
            <span className="entity-chip entity-chip-soft">
              {item.active_credit_exception.revalidation_required
                ? `Revalidate ${decisionLabel(item.active_credit_exception.revalidation_reason ?? 'REQUIRED')}`
                : 'Within approved envelope'}
            </span>
          </div>
        ) : null}
        <OperationalFormActions className="workflow-step-card-actions">
          <OperationalDescriptorActionRow actionSet={workflowActionSet} />
        </OperationalFormActions>
      </section>
    )
  }

  const workflowCreateForm = resolveOperationalFormDefinition('workflowItemCreate', {
    createWorkflowOptions,
    creationPending: creationPendingTradeId !== null,
    draft: createDraft,
    initialWorkflowTypeForTrade: (trade) =>
      trade ? availableManualWorkflowOptions(trade)[0]?.value ?? '' : '',
    selectedTrade: selectedCreateTrade,
    trades: activeTrades,
    updateDraft: (patch) => updateCreateDraft(patch),
  })
  const workflowCreateActionSet = resolveOperationalFormActionSet('workflowCreateActions', {
    creationPending: creationPendingTradeId !== null,
    hasAuthenticatedSession: Boolean(authSession),
    onCreate: () => handleCreate(),
    tradeId: createDraft.tradeId,
    workflowType: createDraft.workflowType,
  }, operationalResourceDescriptor)

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">{permissionMessage}</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      {activeTrades.length > 0 ? (
        <article className="position-card shipment-card workflow-item-card workflow-item-card-compact">
          <div className="shipment-card-head">
            <div className="shipment-card-copy">
              <strong>Create Manual Work Item</strong>
              <span>Open an actualization, credit, or option-settlement handoff when the workflow projection needs a manual nudge.</span>
            </div>
          </div>
          <OperationalDescriptorForm form={workflowCreateForm} />
          <OperationalFormActions className="shipment-card-actions">
            <span>{workflowCreateForm.helpText}</span>
            <OperationalDescriptorActionRow actionSet={workflowCreateActionSet} />
          </OperationalFormActions>
        </article>
      ) : null}
      <div className="position-list operations-workflow-list">
        {groupedItems.length > 0 ? (
          groupedItems.map((group) => (
            <article key={group.tradeId} className="position-card shipment-card workflow-trade-card">
              <div className="shipment-card-head workflow-trade-card-head">
                <div className="shipment-card-copy">
                  <strong>{group.tradeId}</strong>
                  <span>
                    {group.leadItem.commodity} • {group.leadItem.counterparty ?? 'Counterparty TBD'} • {group.leadItem.book}
                  </span>
                  <p>{workflowSummary(group.summaryItem, formatDateOnly)}</p>
                </div>
                <div className="workflow-trade-card-side">
                  <span className={`status-pill status-pill-${group.tone}`}>{workflowTradeStatusLabel(group)}</span>
                  <button type="button" className="button button-ghost" onClick={() => onOpenTrade(group.tradeId)}>
                    Open Trade
                  </button>
                </div>
              </div>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{formatCommodityClass(group.leadItem.commodity_class)}</span>
                <span className="entity-chip entity-chip-soft">
                  {group.items.length} workflow step{group.items.length === 1 ? '' : 's'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {group.unassignedCount > 0 ? `${group.unassignedCount} unassigned` : 'All assigned'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {group.earliestDueAt ? `Earliest due ${formatDateOnly(group.earliestDueAt)}` : 'No due dates'}
                </span>
                {group.blockedCount > 0 ? (
                  <span className="entity-chip entity-chip-soft">{group.blockedCount} blocked</span>
                ) : null}
                <span className="entity-chip entity-chip-soft">Updated {formatDate(group.latestUpdatedAt)}</span>
              </div>
              <div className="workflow-trade-step-list">{group.items.map((item) => renderWorkflowStep(item))}</div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <strong>No open operational work queue</strong>
            <p>Use the create form above to open a manual handoff when the desk needs an ad hoc workflow item.</p>
          </div>
        )}
      </div>
    </div>
  )
}
