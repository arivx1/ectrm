import { useEffect, useState } from 'react'

import type { OperationalResourceDescriptor } from '../../entities/app/api'
import {
  type CreateTradeConfirmationInput,
  type IssueTradeConfirmationInput,
  type RespondTradeConfirmationInput,
  type UpdateTradeConfirmationInput,
} from '../../entities/confirmations/api'
import { listDocumentIngestions } from '../../entities/documents/api'
import { appConfig } from '../../shared/config'
import type { StoredAuthSession } from '../../shared/mutation'
import type {
  DocumentIngestionRecord,
  Trade,
  TradeConfirmationRecord,
  TradeWorkflowItemRecord,
} from '../../shared/models'
import { confirmationStatusOptions } from '../../shared/trading'
import {
  OperationalFormActions,
  OperationalFormActionsCopy,
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

type ConfirmationLedgerBoardProps = {
  authSession: StoredAuthSession | null
  trades: Trade[]
  confirmations: TradeConfirmationRecord[]
  confirmationWorkItems: TradeWorkflowItemRecord[]
  saveError: string
  savingKey: string | null
  operationalResourceDescriptor?: OperationalResourceDescriptor | null
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onCreateConfirmation: (tradeId: string, payload: CreateTradeConfirmationInput) => Promise<void>
  onIssueConfirmation: (confirmationId: number, payload: IssueTradeConfirmationInput) => Promise<void>
  onRespondConfirmation: (confirmationId: number, payload: RespondTradeConfirmationInput) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onSaveConfirmation: (confirmationId: number, payload: UpdateTradeConfirmationInput) => Promise<void>
}

type ConfirmationDraft = {
  confirmationNumber: string
  sourceDocumentId: string
  status: string
  sentAt: string
  confirmedAt: string
  receivedAt: string
  issueMethod: string
  issueRecipient: string
  issueNote: string
  responseMethod: string
  responseReference: string
  responseNote: string
  notes: string
  disputeReason: string
  comparisonWaiverNote: string
}

function updateIsoDate(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null
}

function defaultConfirmationNumber(trade: Trade, confirmationCount: number): string {
  return `CONF-${trade.trade_id}-${String(confirmationCount + 1).padStart(2, '0')}`
}

function buildDraft(
  trade: Trade,
  currentConfirmation: TradeConfirmationRecord | undefined,
  confirmationCount: number,
): ConfirmationDraft {
  return {
    confirmationNumber:
      currentConfirmation?.confirmation_number ?? defaultConfirmationNumber(trade, confirmationCount),
    sourceDocumentId: currentConfirmation?.source_document_id ?? '',
    status: currentConfirmation?.status ?? trade.confirmation_status ?? 'SENT',
    sentAt: currentConfirmation?.sent_at?.slice(0, 10) ?? '',
    confirmedAt: currentConfirmation?.confirmed_at?.slice(0, 10) ?? '',
    receivedAt: currentConfirmation?.received_at?.slice(0, 10) ?? '',
    issueMethod: currentConfirmation?.last_issue_method ?? 'EMAIL',
    issueRecipient: currentConfirmation?.last_issue_recipient ?? '',
    issueNote: currentConfirmation?.last_issue_note ?? '',
    responseMethod: currentConfirmation?.response_method ?? 'EMAIL',
    responseReference: currentConfirmation?.response_reference ?? '',
    responseNote: currentConfirmation?.response_note ?? '',
    notes: currentConfirmation?.notes ?? '',
    disputeReason: currentConfirmation?.dispute_reason ?? '',
    comparisonWaiverNote: currentConfirmation?.comparison_waiver_note ?? '',
  }
}

function emptyDraft(trade: Trade, confirmationCount: number): ConfirmationDraft {
  return buildDraft(trade, undefined, confirmationCount)
}

function documentFieldValue(document: DocumentIngestionRecord, fieldKey: string): string | null {
  const normalizedFieldKey = fieldKey.trim().toLowerCase()
  for (const page of document.pages) {
    for (const field of page.header_fields) {
      if (field.field_key.trim().toLowerCase() === normalizedFieldKey && field.value.trim()) {
        return field.value.trim()
      }
    }
  }
  return null
}

function isVerifiedTradeConfirmationDocument(document: DocumentIngestionRecord): boolean {
  if (document.review_status !== 'VERIFIED') {
    return false
  }

  return document.pages.some(
    (page) => page.document_kind === 'TRADE_CONFIRMATION' && page.review_status === 'REVIEWED',
  )
}

function candidateDocumentsForTrade(
  trade: Trade,
  documents: DocumentIngestionRecord[],
  currentConfirmation: TradeConfirmationRecord | undefined,
): DocumentIngestionRecord[] {
  return documents.filter((document) => {
    if (!isVerifiedTradeConfirmationDocument(document)) {
      return false
    }
    if (currentConfirmation?.source_document_id === document.document_id) {
      return true
    }
    return documentFieldValue(document, 'trade_id') === trade.trade_id
  })
}

function buildCreatePayload(
  trade: Trade,
  draft: ConfirmationDraft,
  currentConfirmation: TradeConfirmationRecord | undefined,
): CreateTradeConfirmationInput {
  const payload: CreateTradeConfirmationInput = { trade_id: trade.trade_id }
  const confirmationNumber = draft.confirmationNumber.trim()
  const sourceDocumentId = draft.sourceDocumentId.trim()
  const status = draft.status.trim().toUpperCase()
  const notes = draft.notes.trim()
  const disputeReason = draft.disputeReason.trim()
  const comparisonWaiverNote = draft.comparisonWaiverNote.trim()

  if (sourceDocumentId && sourceDocumentId !== currentConfirmation?.source_document_id) {
    payload.source_document_id = sourceDocumentId
  }
  if (confirmationNumber && confirmationNumber !== currentConfirmation?.confirmation_number) {
    payload.confirmation_number = confirmationNumber
  }
  if (status) {
    payload.status = status
  }
  if (draft.sentAt) {
    payload.sent_at = updateIsoDate(draft.sentAt)
  }
  if (draft.confirmedAt) {
    payload.confirmed_at = updateIsoDate(draft.confirmedAt)
  }
  if (notes) {
    payload.notes = notes
  }
  if (disputeReason) {
    payload.dispute_reason = disputeReason
  }
  if (comparisonWaiverNote) {
    payload.comparison_waiver_note = comparisonWaiverNote
  }

  return payload
}

function buildUpdatePayload(
  confirmation: TradeConfirmationRecord,
  draft: ConfirmationDraft,
  nextStatus?: string,
): UpdateTradeConfirmationInput {
  const payload: UpdateTradeConfirmationInput = {}
  const confirmationNumber = draft.confirmationNumber.trim()
  const sourceDocumentId = draft.sourceDocumentId.trim()
  const sentAt = draft.sentAt
  const confirmedAt = draft.confirmedAt
  const notes = draft.notes.trim()
  const disputeReason = draft.disputeReason.trim()
  const comparisonWaiverNote = draft.comparisonWaiverNote.trim()
  const status = (nextStatus ?? draft.status).trim().toUpperCase()

  if (confirmationNumber && confirmationNumber !== confirmation.confirmation_number) {
    payload.confirmation_number = confirmationNumber
  }
  if (sourceDocumentId !== (confirmation.source_document_id ?? '')) {
    payload.source_document_id = sourceDocumentId || null
  }
  if (status && status !== confirmation.status) {
    payload.status = status
  }
  if (sentAt !== (confirmation.sent_at?.slice(0, 10) ?? '')) {
    payload.sent_at = updateIsoDate(sentAt)
  }
  if (confirmedAt !== (confirmation.confirmed_at?.slice(0, 10) ?? '')) {
    payload.confirmed_at = updateIsoDate(confirmedAt)
  }
  if (notes !== (confirmation.notes ?? '')) {
    payload.notes = notes || null
  }
  if (disputeReason !== (confirmation.dispute_reason ?? '')) {
    payload.dispute_reason = disputeReason || null
  }
  if (comparisonWaiverNote !== (confirmation.comparison_waiver_note ?? '')) {
    payload.comparison_waiver_note = comparisonWaiverNote || null
  }

  return payload
}

function buildIssuePayload(draft: ConfirmationDraft): IssueTradeConfirmationInput {
  const payload: IssueTradeConfirmationInput = {}
  const issueMethod = draft.issueMethod.trim().toUpperCase()
  const issueRecipient = draft.issueRecipient.trim()
  const issueNote = draft.issueNote.trim()

  if (issueMethod) {
    payload.issue_method = issueMethod
  }
  if (issueRecipient) {
    payload.issue_recipient = issueRecipient
  }
  if (issueNote) {
    payload.issue_note = issueNote
  }
  return payload
}

function buildResponsePayload(
  action: RespondTradeConfirmationInput['action'],
  draft: ConfirmationDraft,
): RespondTradeConfirmationInput {
  const payload: RespondTradeConfirmationInput = { action }
  const responseMethod = draft.responseMethod.trim().toUpperCase()
  const responseReference = draft.responseReference.trim()
  const responseNote = draft.responseNote.trim()
  const disputeReason = draft.disputeReason.trim()

  if (draft.receivedAt) {
    payload.received_at = updateIsoDate(draft.receivedAt)
  }
  if (responseMethod) {
    payload.response_method = responseMethod
  }
  if (responseReference) {
    payload.response_reference = responseReference
  }
  if (responseNote) {
    payload.response_note = responseNote
  }
  if (action === 'COUNTERPARTY_DISPUTED' && disputeReason) {
    payload.dispute_reason = disputeReason
  }
  return payload
}

function confirmationTone(
  trade: Trade,
  currentConfirmation: TradeConfirmationRecord | undefined,
): 'active' | 'in-progress' | 'blocked' {
  if (trade.credit_hold_active) {
    return 'blocked'
  }
  if (
    trade.confirmation_status === 'DISPUTED' ||
    currentConfirmation?.status === 'DISPUTED' ||
    currentConfirmation?.comparison_status === 'MISMATCHED'
  ) {
    return 'blocked'
  }
  if (currentConfirmation) {
    return currentConfirmation.status === 'CONFIRMED' ? 'in-progress' : 'active'
  }
  return trade.confirmation_status === 'CONFIRMED' ? 'in-progress' : 'active'
}

function confirmationPriority(
  trade: Trade,
  currentConfirmation: TradeConfirmationRecord | undefined,
): number {
  if (
    trade.credit_hold_active ||
    trade.confirmation_status === 'DISPUTED' ||
    currentConfirmation?.status === 'DISPUTED' ||
    currentConfirmation?.receipt_status === 'COUNTERPARTY_DISPUTED' ||
    currentConfirmation?.comparison_status === 'MISMATCHED'
  ) {
    return 0
  }
  if (currentConfirmation?.receipt_status === 'RECEIVED') {
    return 1
  }
  if (currentConfirmation?.receipt_status === 'ISSUED_AWAITING_RESPONSE') {
    return 2
  }
  if (!currentConfirmation && trade.confirmation_status !== 'CONFIRMED') {
    return 3
  }
  if (!currentConfirmation) {
    return 4
  }
  if (currentConfirmation.issue_count <= 0 && ['PENDING', 'SENT'].includes(currentConfirmation.status)) {
    return 5
  }
  if (trade.confirmation_status !== 'CONFIRMED') {
    return 6
  }
  return 7
}

function comparisonStatusTone(status: string): 'active' | 'in-progress' | 'blocked' {
  if (status === 'MISMATCHED') {
    return 'blocked'
  }
  if (status === 'WAIVED' || status === 'MANUAL') {
    return 'in-progress'
  }
  return 'active'
}

function comparisonStatusLabel(status: string): string {
  switch (status) {
    case 'MATCHED':
      return 'Matched'
    case 'MISMATCHED':
      return 'Mismatch'
    case 'WAIVED':
      return 'Waived'
    case 'MANUAL':
      return 'Manual'
    default:
      return status.replaceAll('_', ' ')
  }
}

function dispatchStateLabel(confirmation: TradeConfirmationRecord): string {
  if (confirmation.issue_count <= 0) {
    return 'Not issued'
  }
  return confirmation.issue_count === 1 ? 'Issued once' : `Reissued ${confirmation.issue_count}x`
}

function receiptStatusTone(status: string): 'active' | 'in-progress' | 'blocked' {
  if (status === 'COUNTERPARTY_DISPUTED') {
    return 'blocked'
  }
  if (status === 'RECEIVED' || status === 'COUNTERPARTY_CONFIRMED') {
    return 'in-progress'
  }
  return 'active'
}

function receiptStatusLabel(status: string): string {
  switch (status) {
    case 'NOT_ISSUED':
      return 'Not Issued'
    case 'ISSUED_AWAITING_RESPONSE':
      return 'Awaiting Response'
    case 'RECEIVED':
      return 'Received'
    case 'COUNTERPARTY_CONFIRMED':
      return 'Counterparty Confirmed'
    case 'COUNTERPARTY_DISPUTED':
      return 'Counterparty Disputed'
    default:
      return status.replaceAll('_', ' ')
  }
}

function mismatchSummary(mismatchType: string): string {
  if (mismatchType === 'MISSING_DOCUMENT_VALUE') {
    return 'Missing from the linked document review.'
  }
  if (mismatchType === 'UNPARSEABLE_DOCUMENT_VALUE') {
    return 'Document value could not be normalized against the booked trade.'
  }
  return 'Document value does not match the booked trade.'
}

export function ConfirmationLedgerBoard({
  authSession,
  trades,
  confirmations,
  confirmationWorkItems,
  saveError,
  savingKey,
  operationalResourceDescriptor = null,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  onCreateConfirmation,
  onIssueConfirmation,
  onRespondConfirmation,
  onOpenTrade,
  onSaveConfirmation,
}: ConfirmationLedgerBoardProps) {
  const [documents, setDocuments] = useState<DocumentIngestionRecord[]>([])
  const [documentLoadError, setDocumentLoadError] = useState('')
  const permissionMessage =
    resolveOperationalResourcePermissionMessage(operationalResourceDescriptor) ??
    'Sign in to create, issue, respond to, and revise confirmation records.'

  useEffect(() => {
    if (!authSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear stale document state immediately when the session disappears.
      setDocuments([])
      setDocumentLoadError('')
      return
    }

    let cancelled = false
    const session = authSession

    async function loadDocuments() {
      setDocumentLoadError('')
      try {
        const nextDocuments = await listDocumentIngestions(appConfig.apiBase, session)
        if (!cancelled) {
          setDocuments(nextDocuments)
        }
      } catch (nextError) {
        if (!cancelled) {
          setDocumentLoadError(
            nextError instanceof Error ? nextError.message : 'Unable to load confirmation document candidates.',
          )
        }
      }
    }

    void loadDocuments()
    return () => {
      cancelled = true
    }
  }, [authSession])

  const currentConfirmationByTradeId = new Map(
    confirmations.filter((confirmation) => confirmation.is_current).map((confirmation) => [confirmation.trade_id, confirmation]),
  )
  const confirmationsByTradeId = new Map<string, TradeConfirmationRecord[]>()
  for (const confirmation of confirmations) {
    const tradeConfirmations = confirmationsByTradeId.get(confirmation.trade_id) ?? []
    tradeConfirmations.push(confirmation)
    confirmationsByTradeId.set(confirmation.trade_id, tradeConfirmations)
  }

  const confirmationWorkItemByTradeId = new Map(
    confirmationWorkItems.map((item) => [item.trade_id, item]),
  )

  const queueTrades = [...trades]
    .sort((left, right) => {
      const priority =
        confirmationPriority(left, currentConfirmationByTradeId.get(left.trade_id)) -
        confirmationPriority(right, currentConfirmationByTradeId.get(right.trade_id))
      if (priority !== 0) {
        return priority
      }
      return left.trade_id.localeCompare(right.trade_id)
    })

  const [drafts, setDrafts] = useState<Record<string, ConfirmationDraft>>(() =>
    Object.fromEntries(
      queueTrades.map((trade) => {
        const tradeConfirmations = confirmationsByTradeId.get(trade.trade_id) ?? []
        return [
          trade.trade_id,
          buildDraft(trade, currentConfirmationByTradeId.get(trade.trade_id), tradeConfirmations.length),
        ]
      }),
    ),
  )

  function updateDraft(tradeId: string, patch: Partial<ConfirmationDraft>) {
    const trade = queueTrades.find((candidate) => candidate.trade_id === tradeId)
    if (!trade) {
      return
    }
    const confirmationCount = (confirmationsByTradeId.get(tradeId) ?? []).length
    setDrafts((current) => ({
      ...current,
      [tradeId]: {
        ...(current[tradeId] ?? emptyDraft(trade, confirmationCount)),
        ...patch,
      },
    }))
  }

  function handleSourceDocumentChange(trade: Trade, sourceDocumentId: string) {
    const tradeConfirmations = confirmationsByTradeId.get(trade.trade_id) ?? []
    const currentConfirmation = currentConfirmationByTradeId.get(trade.trade_id)
    const selectedDocument = documents.find((document) => document.document_id === sourceDocumentId)

    if (sourceDocumentId && selectedDocument && !currentConfirmation) {
      updateDraft(trade.trade_id, {
        sourceDocumentId,
        confirmationNumber:
          documentFieldValue(selectedDocument, 'confirmation_number') ??
          defaultConfirmationNumber(trade, tradeConfirmations.length),
        status: 'SENT',
        sentAt: selectedDocument.reviewed_at?.slice(0, 10) ?? '',
        confirmedAt: '',
      })
      return
    }

    if (!sourceDocumentId && !currentConfirmation) {
      updateDraft(trade.trade_id, {
        sourceDocumentId: '',
        status: 'SENT',
        confirmedAt: '',
      })
      return
    }

    updateDraft(trade.trade_id, { sourceDocumentId })
  }

  async function handleCreate(trade: Trade, currentConfirmation: TradeConfirmationRecord | undefined) {
    const draft =
      drafts[trade.trade_id] ??
      buildDraft(trade, currentConfirmation, (confirmationsByTradeId.get(trade.trade_id) ?? []).length)
    await onCreateConfirmation(trade.trade_id, buildCreatePayload(trade, draft, currentConfirmation))
  }

  async function handleSave(confirmation: TradeConfirmationRecord, trade: Trade, nextStatus?: string) {
    const draft =
      drafts[trade.trade_id] ??
      buildDraft(trade, confirmation, (confirmationsByTradeId.get(trade.trade_id) ?? []).length)
    const payload = buildUpdatePayload(confirmation, draft, nextStatus)
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSaveConfirmation(confirmation.confirmation_id, payload)
  }

  async function handleIssue(confirmation: TradeConfirmationRecord, trade: Trade) {
    const draft =
      drafts[trade.trade_id] ??
      buildDraft(trade, confirmation, (confirmationsByTradeId.get(trade.trade_id) ?? []).length)
    await onIssueConfirmation(confirmation.confirmation_id, buildIssuePayload(draft))
  }

  async function handleResponse(
    confirmation: TradeConfirmationRecord,
    trade: Trade,
    action: RespondTradeConfirmationInput['action'],
  ) {
    const draft =
      drafts[trade.trade_id] ??
      buildDraft(trade, confirmation, (confirmationsByTradeId.get(trade.trade_id) ?? []).length)
    await onRespondConfirmation(confirmation.confirmation_id, buildResponsePayload(action, draft))
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">
          {permissionMessage}
        </p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      {documentLoadError ? <p className="field-error">{documentLoadError}</p> : null}
      <div className="position-list">
        {queueTrades.map((trade) => {
          const tradeConfirmations = confirmationsByTradeId.get(trade.trade_id) ?? []
          const currentConfirmation = currentConfirmationByTradeId.get(trade.trade_id)
          const workflowItem = confirmationWorkItemByTradeId.get(trade.trade_id)
          const draft =
            drafts[trade.trade_id] ?? buildDraft(trade, currentConfirmation, tradeConfirmations.length)
          const statusLockedToResponseWorkflow = (currentConfirmation?.issue_count ?? 0) > 0
          const statusOptions = statusLockedToResponseWorkflow
            ? confirmationStatusOptions.filter((option) => option === draft.status)
            : confirmationStatusOptions
          const candidateDocuments = candidateDocumentsForTrade(trade, documents, currentConfirmation)
          const selectedDocumentMissing =
            !!draft.sourceDocumentId &&
            !candidateDocuments.some((document) => document.document_id === draft.sourceDocumentId)
          const pendingKeys = currentConfirmation
            ? [
                `confirmation:${currentConfirmation.confirmation_id}`,
                `confirmation:${currentConfirmation.confirmation_id}:issue`,
                `confirmation:${currentConfirmation.confirmation_id}:response:RECEIVED`,
                `confirmation:${currentConfirmation.confirmation_id}:response:COUNTERPARTY_CONFIRMED`,
                `confirmation:${currentConfirmation.confirmation_id}:response:COUNTERPARTY_DISPUTED`,
                `trade:${trade.trade_id}:confirmation:new`,
              ]
            : [`trade:${trade.trade_id}:confirmation:new`]
          const isSaving = savingKey !== null && pendingKeys.includes(savingKey)
          const savePayload = currentConfirmation ? buildUpdatePayload(currentConfirmation, draft) : null
          const comparisonMismatchCount = currentConfirmation?.blocking_mismatch_count ?? 0
          const comparisonWaiverDraftNote = draft.comparisonWaiverNote.trim()
          const effectiveDraftStatus =
            draft.status.trim().toUpperCase() ||
            currentConfirmation?.status ||
            trade.confirmation_status ||
            'SENT'
          const saveBlockedByComparison =
            comparisonMismatchCount > 0 &&
            effectiveDraftStatus === 'CONFIRMED' &&
            !comparisonWaiverDraftNote
          const responseActionBlocked =
            !currentConfirmation ||
            currentConfirmation.status !== 'SENT' ||
            currentConfirmation.issue_count <= 0
          const responseDisputeNeedsComment =
            !responseActionBlocked && !draft.disputeReason.trim() && !draft.responseNote.trim()
          const responseDisputeBlocked =
            responseActionBlocked || responseDisputeNeedsComment
          const confirmationForm = resolveOperationalFormDefinition('confirmationLedgerRecord', {
            candidateDocuments,
            comparisonMismatchCount,
            currentConfirmation,
            draft,
            hasAuthenticatedSession: Boolean(authSession),
            isSaving,
            onSourceDocumentChange: (value) => handleSourceDocumentChange(trade, value),
            responseDisputeNeedsComment,
            selectedDocumentMissing,
            statusOptions,
            updateDraft: (patch) => updateDraft(trade.trade_id, patch),
            workflowOwner: workflowItem?.owner ?? '',
          })
          const confirmationActionSet = resolveOperationalFormActionSet('confirmationLedgerActions', {
            actionStates: currentConfirmation?.action_states ?? [],
            currentConfirmation,
            hasAuthenticatedSession: Boolean(authSession),
            isSaving,
            onCounterpartyConfirmed: () =>
              handleResponse(currentConfirmation!, trade, 'COUNTERPARTY_CONFIRMED'),
            onCounterpartyDisputed: () =>
              handleResponse(currentConfirmation!, trade, 'COUNTERPARTY_DISPUTED'),
            onCreateVersion: () => handleCreate(trade, currentConfirmation),
            onIssue: () => handleIssue(currentConfirmation!, trade),
            onMarkReceived: () => handleResponse(currentConfirmation!, trade, 'RECEIVED'),
            onOpenTrade: () => onOpenTrade(trade.trade_id),
            onSaveCurrent: () => handleSave(currentConfirmation!, trade),
            responseDisputeBlocked,
            responseDisputeNeedsComment,
            saveBlockedByComparison,
            savePayloadEmpty: Object.keys(savePayload ?? {}).length === 0,
          }, operationalResourceDescriptor)

          return (
            <article key={trade.trade_id} className="position-card shipment-card workflow-item-card settlement-invoice-card">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{trade.trade_id}</strong>
                  <span>
                    {trade.commodity} • {trade.counterparty ?? 'Counterparty TBD'} • {trade.book}
                  </span>
                </div>
                <span className={`status-pill status-pill-${confirmationTone(trade, currentConfirmation)}`}>
                  {(currentConfirmation?.status ?? trade.confirmation_status).replaceAll('_', ' ')}
                </span>
              </div>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{formatCommodityClass(trade.commodity_class)}</span>
                {workflowItem ? (
                  <span className="entity-chip entity-chip-soft">
                    {workflowItem.owner ? `Owner ${workflowItem.owner}` : 'Unassigned'}
                  </span>
                ) : null}
                {workflowItem?.due_at ? (
                  <span className="entity-chip entity-chip-soft">Due {formatDateOnly(workflowItem.due_at)}</span>
                ) : null}
                <span className="entity-chip entity-chip-soft">
                  {tradeConfirmations.length} record{tradeConfirmations.length === 1 ? '' : 's'}
                </span>
                {currentConfirmation ? (
                  <span className={`status-pill status-pill-${comparisonStatusTone(currentConfirmation.comparison_status)}`}>
                    {comparisonStatusLabel(currentConfirmation.comparison_status)}
                  </span>
                ) : null}
                {currentConfirmation?.blocking_mismatch_count ? (
                  <span className="entity-chip entity-chip-soft">
                    {currentConfirmation.blocking_mismatch_count} mismatch
                    {currentConfirmation.blocking_mismatch_count === 1 ? '' : 'es'}
                  </span>
                ) : null}
                {currentConfirmation ? (
                  <span className="entity-chip entity-chip-soft">
                    {dispatchStateLabel(currentConfirmation)}
                  </span>
                ) : null}
                {currentConfirmation ? (
                  <span className={`status-pill status-pill-${receiptStatusTone(currentConfirmation.receipt_status)}`}>
                    {receiptStatusLabel(currentConfirmation.receipt_status)}
                  </span>
                ) : null}
                {currentConfirmation?.last_issue_method ? (
                  <span className="entity-chip entity-chip-soft">
                    {currentConfirmation.last_issue_method}
                  </span>
                ) : null}
                {currentConfirmation?.last_issued_at ? (
                  <span className="entity-chip entity-chip-soft">
                    Last issued {formatDate(currentConfirmation.last_issued_at)}
                  </span>
                ) : null}
                {currentConfirmation?.received_at ? (
                  <span className="entity-chip entity-chip-soft">
                    Received {formatDate(currentConfirmation.received_at)}
                  </span>
                ) : null}
                {currentConfirmation?.source_document_display_name ? (
                  <span className="entity-chip entity-chip-soft">
                    {currentConfirmation.source_document_display_name}
                  </span>
                ) : null}
                {trade.credit_hold_active ? <span className="status-pill status-pill-blocked">Credit Hold</span> : null}
              </div>
              <div className="shipment-card-copy">
                <p>
                  {currentConfirmation
                    ? `Current record ${currentConfirmation.confirmation_number} • Updated ${formatDate(currentConfirmation.updated_at)}`
                    : 'Create the first managed confirmation record to move this trade out of status-only confirmation tracking.'}
                </p>
              </div>
              <OperationalDescriptorForm className="settlement-invoice-grid" form={confirmationForm} />
              <OperationalDescriptorFormFeedback form={confirmationForm} />
              {trade.credit_hold_active ? (
                <p className="field-error">
                  {trade.credit_hold_reason ?? 'Credit approval is pending review.'}
                </p>
              ) : null}
              {currentConfirmation?.comparison_status === 'WAIVED' && currentConfirmation.comparison_waiver_note ? (
                <p className="workflow-editor-note">
                  Comparison waived by {currentConfirmation.comparison_waived_by ?? 'an operator'}
                  {currentConfirmation.comparison_waived_at ? ` on ${formatDate(currentConfirmation.comparison_waived_at)}` : ''}.
                  Note: {currentConfirmation.comparison_waiver_note}
                </p>
              ) : null}
              {!currentConfirmation && draft.sourceDocumentId ? (
                <p className="workflow-editor-note">
                  The linked document will be checked against booked economics when the record is created. Leave the
                  status at `SENT` until any mismatches are resolved, or add a waiver note if the desk plans to accept
                  the exception.
                </p>
              ) : null}
              {currentConfirmation && currentConfirmation.issue_count <= 0 ? (
                <p className="workflow-editor-note">
                  This record is the current confirmation version, but it has not been issued outbound yet. Use
                  `Issue Confirmation` once the desk is ready to send it.
                </p>
              ) : null}
              {currentConfirmation?.receipt_status === 'ISSUED_AWAITING_RESPONSE' ? (
                <p className="workflow-editor-note">
                  The confirmation is out with the counterparty and still awaiting a response. Record receipt,
                  confirmation, or dispute here as soon as the desk hears back.
                </p>
              ) : null}
              {statusLockedToResponseWorkflow ? (
                <p className="workflow-editor-note">
                  Status is now managed by the response actions for this issued record. Use `Mark Received`,
                  `Counterparty Confirmed`, or `Counterparty Disputed` to advance the lifecycle.
                </p>
              ) : null}
              {currentConfirmation?.receipt_status === 'RECEIVED' ? (
                <p className="workflow-editor-note">
                  The counterparty acknowledged receipt. Use `Counterparty Confirmed` or `Counterparty Disputed`
                  once the desk completes its review conversation.
                </p>
              ) : null}
              {currentConfirmation?.mismatches.length ? (
                <div className="stack">
                  {currentConfirmation.mismatches.map((mismatch) => (
                    <article
                      key={`${currentConfirmation.confirmation_id}-${mismatch.field_key}`}
                      className="workflow-item-card workflow-item-card-compact workflow-step-card workflow-step-card-blocked"
                    >
                      <div className="shipment-card-head workflow-step-card-head">
                        <div className="shipment-card-copy">
                          <div className="workflow-step-card-heading">
                            <strong>{mismatch.label}</strong>
                            <span className="status-pill status-pill-blocked">
                              {mismatch.mismatch_type === 'MISSING_DOCUMENT_VALUE'
                                ? 'Missing'
                                : mismatch.mismatch_type === 'UNPARSEABLE_DOCUMENT_VALUE'
                                  ? 'Unparsed'
                                  : 'Mismatch'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="shipment-card-copy">
                        <p>{mismatchSummary(mismatch.mismatch_type)}</p>
                      </div>
                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">
                          Expected {mismatch.expected_value ?? 'Not captured'}
                        </span>
                        <span className="entity-chip entity-chip-soft">
                          Document {mismatch.actual_value ?? 'Not captured'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <OperationalFormActions>
                <OperationalFormActionsCopy>
                  <p>{confirmationForm.helpText}</p>
                </OperationalFormActionsCopy>
                <OperationalDescriptorActionRow actionSet={confirmationActionSet} />
              </OperationalFormActions>
              {tradeConfirmations.length > 0 ? (
                <div className="timeline">
                  {tradeConfirmations.slice(0, 3).map((confirmation) => (
                    <article key={confirmation.confirmation_id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <strong>
                            {confirmation.confirmation_number}
                            {confirmation.is_current ? ' • current' : ''}
                          </strong>
                          <span>{formatDate(confirmation.updated_at)}</span>
                        </div>
                        <p>
                          {confirmation.status.replaceAll('_', ' ')}
                          {confirmation.comparison_status !== 'MANUAL'
                            ? ` • ${comparisonStatusLabel(confirmation.comparison_status)}`
                            : ''}
                          {confirmation.issue_count > 0 ? ` • ${dispatchStateLabel(confirmation)}` : ''}
                          {confirmation.receipt_status !== 'NOT_ISSUED'
                            ? ` • ${receiptStatusLabel(confirmation.receipt_status)}`
                            : ''}
                          {confirmation.source_document_display_name
                            ? ` • ${confirmation.source_document_display_name}`
                            : ''}
                        </p>
                        <p>
                          {confirmation.response_note?.trim() ||
                            confirmation.last_issue_note?.trim() ||
                            confirmation.notes?.trim() ||
                            confirmation.dispute_reason?.trim() ||
                            `Created by ${confirmation.created_by}`}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
