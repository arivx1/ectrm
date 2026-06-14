import { useCallback, useEffect, useState } from 'react'

import {
  approveDocumentActionApprovalRequest,
  listDocumentActionApprovalRequests,
  rejectDocumentActionApprovalRequest,
} from '../../entities/documents/api'
import { DocumentGmailInboxBrowser } from '../../features/documents/DocumentGmailInboxBrowser'
import { DocumentIngestionDocumentCard } from '../../features/documents/DocumentIngestionDocumentCard'
import { DocumentIngestionUploadForm } from '../../features/documents/DocumentIngestionUploadForm'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import { appConfig } from '../../shared/config'
import type { DocumentActionApprovalRequestRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type DocumentIngestionPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  compact?: boolean
}

function formatApprovalValue(value: string | null | undefined): string {
  const cleaned = value?.trim()
  if (!cleaned) {
    return 'Not resolved'
  }
  return cleaned
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase())
}

function approvalTargetLabel(request: DocumentActionApprovalRequestRecord): string {
  if (!request.target_record_type) {
    return 'No target resolved'
  }
  return `${formatApprovalValue(request.target_record_type)}${request.target_record_id ? ` ${request.target_record_id}` : ''}`
}

type DocumentActionApprovalQueueProps = {
  authSession: StoredAuthSession
  formatDate: (value: string | null | undefined) => string
  compact: boolean
}

function DocumentActionApprovalQueue({
  authSession,
  formatDate,
  compact,
}: DocumentActionApprovalQueueProps) {
  const [requests, setRequests] = useState<DocumentActionApprovalRequestRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [decisionNotes, setDecisionNotes] = useState<Record<number, string>>({})

  const refreshRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextRequests = await listDocumentActionApprovalRequests(
        appConfig.apiBase,
        authSession,
        { status: 'PENDING', limit: compact ? 5 : 25 },
      )
      setRequests(nextRequests)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load document action approvals.')
    } finally {
      setLoading(false)
    }
  }, [authSession, compact])

  useEffect(() => {
    void refreshRequests()
  }, [refreshRequests])

  async function handleDecision(request: DocumentActionApprovalRequestRecord, decision: 'approve' | 'reject') {
    const targetKey = `${decision}:${request.request_id}`
    const decisionComment =
      decisionNotes[request.request_id]?.trim() ||
      (decision === 'approve'
        ? 'Approved from the document action approval queue.'
        : 'Rejected from the document action approval queue.')

    setPendingKey(targetKey)
    setError('')
    try {
      if (decision === 'approve') {
        await approveDocumentActionApprovalRequest(
          appConfig.apiBase,
          authSession,
          request.document_id,
          { decision_comment: decisionComment },
        )
      } else {
        await rejectDocumentActionApprovalRequest(
          appConfig.apiBase,
          authSession,
          request.document_id,
          { decision_comment: decisionComment },
        )
      }
      setDecisionNotes((current) => {
        const next = { ...current }
        delete next[request.request_id]
        return next
      })
      await refreshRequests()
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unable to update the document action approval.')
    } finally {
      setPendingKey((current) => (current === targetKey ? null : current))
    }
  }

  return (
    <section className="document-action-approval-queue" aria-label="Document action approvals">
      <div className="shipment-card position-card">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Document action approvals</strong>
            <span>{loading ? 'Loading pending requests...' : `${requests.length} pending request${requests.length === 1 ? '' : 's'}`}</span>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void refreshRequests()}
            disabled={loading || pendingKey !== null}
          >
            Refresh
          </button>
        </div>

        {requests.length > 0 ? (
          <div className="document-ingestion-list document-action-approval-list">
            {requests.map((request) => (
              <article key={request.request_id} className="position-card shipment-card workflow-item-card">
                <div className="shipment-card-head">
                  <div className="shipment-card-copy">
                    <strong>{request.title}</strong>
                    <span>
                      {request.document_id} • {approvalTargetLabel(request)} • requested {formatDate(request.requested_at)}
                    </span>
                  </div>
                  <span className="status-pill status-pill-in-progress">{formatApprovalValue(request.governance_status)}</span>
                </div>
                <p className="form-note">{request.description}</p>
                {request.request_comment ? <p className="form-note">{request.request_comment}</p> : null}
                <label className="document-field-editor">
                  <span>Decision note</span>
                  <input
                    className="control"
                    type="text"
                    value={decisionNotes[request.request_id] ?? ''}
                    onChange={(event) =>
                      setDecisionNotes((current) => ({
                        ...current,
                        [request.request_id]: event.target.value,
                      }))
                    }
                    placeholder="Optional note"
                    disabled={pendingKey !== null}
                  />
                </label>
                <div className="document-ingestion-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={pendingKey !== null}
                    onClick={() => void handleDecision(request, 'approve')}
                  >
                    {pendingKey === `approve:${request.request_id}` ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={pendingKey !== null}
                    onClick={() => void handleDecision(request, 'reject')}
                  >
                    {pendingKey === `reject:${request.request_id}` ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : !loading ? (
          <p className="form-note">No document action approvals are waiting.</p>
        ) : null}

        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </section>
  )
}

export function DocumentIngestionPanel({ authSession, formatDate, compact = false }: DocumentIngestionPanelProps) {
  const controller = useDocumentIngestionController({ authSession })

  if (!authSession) {
    return (
      <div className="empty-state">
        <strong>Document intake is protected</strong>
        <p>Sign in to upload and review PDFs, page classifications, and extracted header or table scaffolding.</p>
      </div>
    )
  }

  return (
    <div className={`stack document-ingestion-panel${compact ? ' document-ingestion-panel-compact' : ''}`}>
      <DocumentIngestionUploadForm
        compact={compact}
        displayName={controller.displayName}
        processorSettings={controller.processorSettings}
        selectedProcessorProvider={controller.selectedProcessorProvider}
        selectedProcessorModel={controller.selectedProcessorModel}
        selectedFile={controller.selectedFile}
        schemaRegistry={controller.schemaRegistry}
        uploading={controller.uploading}
        uploadError={controller.uploadError}
        aiConfidenceThresholdPercent={controller.effectiveAiConfidenceThresholdPercent}
        aiConfidenceThresholdIsOverride={controller.aiConfidenceThresholdOverridePercent !== null}
        gmailInboxSettings={controller.processorSettings?.gmail_inbox ?? null}
        gmailImporting={controller.gmailImporting}
        gmailImportError={controller.gmailImportError}
        gmailImportSummary={controller.gmailImportSummary}
        isDragActive={controller.isDragActive}
        fileInputRef={controller.fileInputRef}
        onDisplayNameChange={controller.setDisplayName}
        onProcessorProviderChange={controller.setSelectedProcessorProvider}
        onProcessorModelChange={controller.setSelectedProcessorModel}
        onAiConfidenceThresholdPercentChange={controller.setAiConfidenceThresholdOverridePercent}
        onAiConfidenceThresholdReset={() => controller.setAiConfidenceThresholdOverridePercent(null)}
        onFileChange={controller.updateSelectedFile}
        onOpenFilePicker={controller.openFilePicker}
        onDropzoneKeyDown={controller.handleDropzoneKeyDown}
        onDropzoneDragEnter={controller.handleDropzoneDragEnter}
        onDropzoneDragOver={controller.handleDropzoneDragOver}
        onDropzoneDragLeave={controller.handleDropzoneDragLeave}
        onDropzoneDrop={controller.handleDropzoneDrop}
        onSubmit={controller.handleSubmit}
        onImportGmailInbox={controller.handleImportGmailInbox}
      />

      <DocumentGmailInboxBrowser
        compact={compact}
        gmailInboxSettings={controller.processorSettings?.gmail_inbox ?? null}
        gmailMessageQuery={controller.gmailMessageQuery}
        gmailMessages={controller.gmailMessages}
        gmailMessagesLoading={controller.gmailMessagesLoading}
        gmailMessagesError={controller.gmailMessagesError}
        gmailNextPageToken={controller.gmailNextPageToken}
        selectedGmailMessageId={controller.selectedGmailMessageId}
        selectedGmailMessage={controller.selectedGmailMessage}
        selectedGmailMessageLoading={controller.selectedGmailMessageLoading}
        selectedGmailMessageError={controller.selectedGmailMessageError}
        formatDate={formatDate}
        onGmailMessageQueryChange={controller.setGmailMessageQuery}
        onRefreshGmailMessages={controller.handleRefreshGmailMessages}
        onLoadMoreGmailMessages={controller.handleLoadMoreGmailMessages}
        onSelectGmailMessage={controller.handleSelectGmailMessage}
      />

      <DocumentActionApprovalQueue
        authSession={authSession}
        formatDate={formatDate}
        compact={compact}
      />

      {controller.loading ? (
        <div className="empty-state">
          <strong>Loading document intake</strong>
          <p>Fetching recent PDF ingestions, schema definitions, and review state.</p>
        </div>
      ) : controller.loadError ? (
        <div className="empty-state">
          <strong>Document intake could not load</strong>
          <p>{controller.loadError}</p>
        </div>
      ) : controller.documents.length > 0 ? (
        <div className={`document-ingestion-list${compact ? ' document-ingestion-list-compact' : ''}`}>
          {controller.documents.map((document) => (
            <DocumentIngestionDocumentCard
              key={document.document_id}
              controller={controller}
              document={document}
              formatDate={formatDate}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No PDFs uploaded yet</strong>
          <p>The first upload will create the stored source file, page-level stubs, and a queued analysis job for classification plus extraction.</p>
        </div>
      )}
    </div>
  )
}
