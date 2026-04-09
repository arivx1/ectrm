import { useEffect, useState } from 'react'

import {
  type CreateTradeConfirmationInput,
  type IssueTradeConfirmationInput,
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

type ConfirmationLedgerBoardProps = {
  authSession: StoredAuthSession | null
  trades: Trade[]
  confirmations: TradeConfirmationRecord[]
  confirmationWorkItems: TradeWorkflowItemRecord[]
  saveError: string
  savingKey: string | null
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onCreateConfirmation: (tradeId: string, payload: CreateTradeConfirmationInput) => Promise<void>
  onIssueConfirmation: (confirmationId: number, payload: IssueTradeConfirmationInput) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onSaveConfirmation: (confirmationId: number, payload: UpdateTradeConfirmationInput) => Promise<void>
}

type ConfirmationDraft = {
  confirmationNumber: string
  sourceDocumentId: string
  status: string
  sentAt: string
  confirmedAt: string
  issueMethod: string
  issueRecipient: string
  issueNote: string
  notes: string
  disputeReason: string
  comparisonWaiverNote: string
}

const confirmationIssueMethodOptions = ['EMAIL', 'EDI', 'PORTAL', 'MANUAL', 'OTHER'] as const

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
    issueMethod: currentConfirmation?.last_issue_method ?? 'EMAIL',
    issueRecipient: currentConfirmation?.last_issue_recipient ?? '',
    issueNote: currentConfirmation?.last_issue_note ?? '',
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
    currentConfirmation?.comparison_status === 'MISMATCHED'
  ) {
    return 0
  }
  if (!currentConfirmation && trade.confirmation_status !== 'CONFIRMED') {
    return 1
  }
  if (!currentConfirmation) {
    return 2
  }
  if (trade.confirmation_status !== 'CONFIRMED') {
    return 3
  }
  return 4
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
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  onCreateConfirmation,
  onIssueConfirmation,
  onOpenTrade,
  onSaveConfirmation,
}: ConfirmationLedgerBoardProps) {
  const [documents, setDocuments] = useState<DocumentIngestionRecord[]>([])
  const [documentLoadError, setDocumentLoadError] = useState('')

  useEffect(() => {
    if (!authSession) {
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

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">
          Sign in from Settings to issue, confirm, dispute, or amend confirmation records.
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
          const candidateDocuments = candidateDocumentsForTrade(trade, documents, currentConfirmation)
          const selectedDocumentMissing =
            !!draft.sourceDocumentId &&
            !candidateDocuments.some((document) => document.document_id === draft.sourceDocumentId)
          const pendingKeys = currentConfirmation
            ? [
                `confirmation:${currentConfirmation.confirmation_id}`,
                `confirmation:${currentConfirmation.confirmation_id}:issue`,
                `trade:${trade.trade_id}:confirmation:new`,
              ]
            : [`trade:${trade.trade_id}:confirmation:new`]
          const isSaving = savingKey !== null && pendingKeys.includes(savingKey)
          const savePayload = currentConfirmation ? buildUpdatePayload(currentConfirmation, draft) : null
          const confirmPayload = currentConfirmation
            ? buildUpdatePayload(currentConfirmation, draft, 'CONFIRMED')
            : null
          const disputePayload = currentConfirmation
            ? buildUpdatePayload(currentConfirmation, draft, 'DISPUTED')
            : null
          const disputeBlocked =
            draft.status === 'DISPUTED' || (currentConfirmation?.status === 'DISPUTED')
              ? !draft.disputeReason.trim()
              : false
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
          const confirmBlockedByComparison =
            comparisonMismatchCount > 0 && !comparisonWaiverDraftNote

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
              <div className="workflow-item-grid settlement-invoice-grid">
                <label className="field">
                  <span>Confirmation Number</span>
                  <input
                    className="control control-compact"
                    value={draft.confirmationNumber}
                    onChange={(event) => updateDraft(trade.trade_id, { confirmationNumber: event.target.value })}
                    disabled={isSaving}
                  />
                </label>
                <label className="field">
                  <span>Source Document</span>
                  <select
                    className="control control-compact"
                    value={draft.sourceDocumentId}
                    onChange={(event) => handleSourceDocumentChange(trade, event.target.value)}
                    disabled={isSaving || !authSession}
                  >
                    <option value="">Manual / no linked document</option>
                    {selectedDocumentMissing ? (
                      <option value={draft.sourceDocumentId}>
                        {currentConfirmation?.source_document_display_name ?? draft.sourceDocumentId}
                      </option>
                    ) : null}
                    {candidateDocuments.map((document) => (
                      <option key={document.document_id} value={document.document_id}>
                        {document.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    className="control control-compact"
                    value={draft.status}
                    onChange={(event) => updateDraft(trade.trade_id, { status: event.target.value })}
                    disabled={isSaving}
                  >
                    {confirmationStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Sent</span>
                  <input
                    className="control control-compact"
                    type="date"
                    value={draft.sentAt}
                    onChange={(event) => updateDraft(trade.trade_id, { sentAt: event.target.value })}
                    disabled={isSaving}
                  />
                </label>
                <label className="field">
                  <span>Confirmed</span>
                  <input
                    className="control control-compact"
                    type="date"
                    value={draft.confirmedAt}
                    onChange={(event) => updateDraft(trade.trade_id, { confirmedAt: event.target.value })}
                    disabled={isSaving}
                  />
                </label>
                <label className="field">
                  <span>Workflow Owner</span>
                  <input
                    className="control control-compact"
                    value={workflowItem?.owner ?? ''}
                    disabled
                  />
                </label>
                <label className="field">
                  <span>Issue Method</span>
                  <select
                    className="control control-compact"
                    value={draft.issueMethod}
                    onChange={(event) => updateDraft(trade.trade_id, { issueMethod: event.target.value })}
                    disabled={isSaving}
                  >
                    {confirmationIssueMethodOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Recipient</span>
                  <input
                    className="control control-compact"
                    value={draft.issueRecipient}
                    onChange={(event) => updateDraft(trade.trade_id, { issueRecipient: event.target.value })}
                    placeholder="email, portal user, or counterparty contact"
                    disabled={isSaving}
                  />
                </label>
                <label className="field field-wide">
                  <span>Latest Issue Note</span>
                  <textarea
                    className="control control-compact"
                    rows={2}
                    value={draft.issueNote}
                    onChange={(event) => updateDraft(trade.trade_id, { issueNote: event.target.value })}
                    placeholder="Optional dispatch note for the latest issue or resend."
                    disabled={isSaving}
                  />
                </label>
                <label className="field field-wide">
                  <span>Notes</span>
                  <textarea
                    className="control control-compact"
                    rows={3}
                    value={draft.notes}
                    onChange={(event) => updateDraft(trade.trade_id, { notes: event.target.value })}
                    disabled={isSaving}
                  />
                </label>
                <label className="field field-wide">
                  <span>Dispute Reason</span>
                  <textarea
                    className="control control-compact"
                    rows={2}
                    value={draft.disputeReason}
                    onChange={(event) => updateDraft(trade.trade_id, { disputeReason: event.target.value })}
                    disabled={isSaving}
                  />
                </label>
                <label className="field field-wide">
                  <span>Comparison Waiver Note</span>
                  <textarea
                    className="control control-compact"
                    rows={2}
                    value={draft.comparisonWaiverNote}
                    onChange={(event) => updateDraft(trade.trade_id, { comparisonWaiverNote: event.target.value })}
                    placeholder="Required only when confirming a linked document that still has unresolved mismatches."
                    disabled={isSaving}
                  />
                </label>
              </div>
              {trade.credit_hold_active ? (
                <p className="field-error">
                  {trade.credit_hold_reason ?? 'Credit approval is pending review.'}
                </p>
              ) : null}
              {currentConfirmation?.comparison_status === 'MISMATCHED' ? (
                <p className="field-error">
                  Linked confirmation economics do not match the booked trade. `Mark Confirmed` stays blocked until the
                  mismatches are resolved or a comparison waiver note is recorded.
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
              <div className="workflow-item-actions">
                <div className="shipment-card-copy">
                  <p>
                    {currentConfirmation
                      ? currentConfirmation.comparison_status === 'MISMATCHED'
                        ? 'Resolve the mismatches, record a waiver, or log a new version when a reissued confirmation arrives. Trade amendments that change booked economics now auto-open a fresh SENT version.'
                        : 'Save the latest record in place, or log a new confirmation record when a reissued confirm arrives. Trade amendments that change booked economics now auto-open a fresh SENT version.'
                      : 'Manual confirmations can be logged directly, or linked to a verified TRADE_CONFIRMATION document from document intake.'}
                  </p>
                </div>
                <div className="workflow-item-button-row">
                  {!currentConfirmation ? (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void handleCreate(trade, currentConfirmation)}
                      disabled={!authSession || isSaving}
                    >
                      {isSaving ? 'Creating...' : 'Create Confirmation'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void handleIssue(currentConfirmation, trade)}
                        disabled={!authSession || isSaving || currentConfirmation.status !== 'SENT'}
                      >
                        {isSaving
                          ? 'Issuing...'
                          : currentConfirmation.issue_count > 0
                            ? 'Reissue Confirmation'
                            : 'Issue Confirmation'}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => void handleSave(currentConfirmation, trade)}
                        disabled={
                          !authSession ||
                          isSaving ||
                          saveBlockedByComparison ||
                          Object.keys(savePayload ?? {}).length === 0
                        }
                      >
                        {isSaving ? 'Saving...' : 'Save Current'}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void handleSave(currentConfirmation, trade, 'CONFIRMED')}
                        disabled={
                          !authSession ||
                          isSaving ||
                          confirmBlockedByComparison ||
                          Object.keys(confirmPayload ?? {}).length === 0
                        }
                      >
                        Mark Confirmed
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void handleSave(currentConfirmation, trade, 'DISPUTED')}
                        disabled={
                          !authSession ||
                          isSaving ||
                          disputeBlocked ||
                          Object.keys(disputePayload ?? {}).length === 0
                        }
                      >
                        Mark Disputed
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void handleCreate(trade, currentConfirmation)}
                        disabled={!authSession || isSaving}
                      >
                        Log New Version
                      </button>
                    </>
                  )}
                  <button type="button" className="button button-ghost" onClick={() => onOpenTrade(trade.trade_id)}>
                    Open Trade
                  </button>
                </div>
              </div>
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
                          {confirmation.source_document_display_name
                            ? ` • ${confirmation.source_document_display_name}`
                            : ''}
                        </p>
                        <p>
                          {confirmation.last_issue_note?.trim() ||
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
