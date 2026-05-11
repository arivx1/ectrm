import { useState } from 'react'
import { fetchDocumentSource } from '../../entities/documents/api'
import { DocumentIngestionUploadForm } from '../../features/documents/DocumentIngestionUploadForm'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import { appConfig } from '../../shared/config'
import type { DocumentIngestionRecord } from '../../shared/models'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'
import type { StoredAuthSession } from '../../shared/mutation'

type PromptHomeDocumentUploadCardProps = {
  authSession: StoredAuthSession | null
  onOpenOperationsWorkspace: () => void
  onSignIn: () => void
}

const PROMPT_HOME_DOCUMENT_UPLOAD_PANEL_ID = 'prompt-home-document-upload-panel'
const PROMPT_HOME_DOCUMENT_HISTORY_PANEL_ID = 'prompt-home-document-history-panel'

function formatDocumentCount(count: number): string {
  return `${count} document${count === 1 ? '' : 's'}`
}

function formatDocumentStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatDocumentHistorySummary(args: {
  loading: boolean
  loadError: string
  documentCount: number
}): string {
  if (args.loadError) {
    return args.loadError
  }
  if (args.loading) {
    return 'Loading document history.'
  }
  if (args.documentCount > 0) {
    return `${formatDocumentCount(args.documentCount)} available in the work queue.`
  }
  return 'No uploaded documents yet.'
}

function openDocumentButtonLabel(document: DocumentIngestionRecord, opening: boolean): string {
  if (!document.source_available) {
    return 'Source Missing'
  }
  return opening ? 'Opening PDF…' : 'Open PDF'
}

function revokeDocumentSourceUrlLater(sourceUrl: string): void {
  if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
    return
  }
  window.setTimeout(() => URL.revokeObjectURL(sourceUrl), 60_000)
}

function PromptHomeDocumentUploadCardContent({
  authSession,
  onOpenOperationsWorkspace,
  onSignIn,
}: PromptHomeDocumentUploadCardProps) {
  const controller = useDocumentIngestionController({ authSession })
  const historyExpandedState = usePersistentCollapsibleCardState(
    'prompt-home.document-upload-history-card',
    false,
  )
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [openDocumentError, setOpenDocumentError] = useState('')

  if (!authSession) {
    return (
      <div className="empty-state prompt-home-document-upload-empty">
        <strong>Document intake is protected</strong>
        <p>Sign in to upload PDFs from your machine or import Gmail attachments from Home.</p>
        <div className="prompt-home-document-upload-actions">
          <button type="button" className="button button-primary" onClick={onSignIn}>
            Sign In
          </button>
        </div>
      </div>
    )
  }

  const session = authSession
  const recentDocuments = controller.documents.slice(0, 5)
  const historySummary = formatDocumentHistorySummary({
    loading: controller.loading,
    loadError: controller.loadError,
    documentCount: controller.documents.length,
  })

  async function handleOpenDocument(document: DocumentIngestionRecord) {
    if (typeof window === 'undefined') {
      return
    }

    const openedWindow = typeof window.open === 'function' ? window.open('', '_blank') : null
    if (openedWindow) {
      openedWindow.opener = null
      openedWindow.document.title = document.display_name || document.original_filename
    }

    setOpeningDocumentId(document.document_id)
    setOpenDocumentError('')
    try {
      const sourceBlob = await fetchDocumentSource(
        appConfig.apiBase,
        session,
        document.document_id,
      )
      const sourceUrl = URL.createObjectURL(sourceBlob)
      if (openedWindow && !openedWindow.closed) {
        openedWindow.location.href = sourceUrl
      } else if (typeof window.open === 'function') {
        window.open(sourceUrl, '_blank')
      }
      revokeDocumentSourceUrlLater(sourceUrl)
    } catch (error) {
      if (openedWindow && !openedWindow.closed) {
        openedWindow.close()
      }
      setOpenDocumentError(
        error instanceof Error ? error.message : 'Unable to open the uploaded PDF.',
      )
    } finally {
      setOpeningDocumentId((current) =>
        current === document.document_id ? null : current,
      )
    }
  }

  return (
    <div className="prompt-home-document-upload-stack">
      <DocumentIngestionUploadForm
        compact
        displayName={controller.displayName}
        processorSettings={controller.processorSettings}
        selectedProcessorProvider={controller.selectedProcessorProvider}
        selectedFile={controller.selectedFile}
        schemaRegistry={controller.schemaRegistry}
        uploading={controller.uploading}
        uploadError={controller.uploadError}
        gmailInboxSettings={controller.processorSettings?.gmail_inbox ?? null}
        gmailImporting={controller.gmailImporting}
        gmailImportError={controller.gmailImportError}
        gmailImportSummary={controller.gmailImportSummary}
        isDragActive={controller.isDragActive}
        fileInputRef={controller.fileInputRef}
        onDisplayNameChange={controller.setDisplayName}
        onProcessorProviderChange={controller.setSelectedProcessorProvider}
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

      <section className="prompt-home-document-upload-history-card">
        <div className="prompt-home-document-upload-history-card-head">
          <div className="prompt-home-document-upload-history-card-copy">
            <span className="eyebrow">History</span>
            <strong>Document history</strong>
            <p>
              {historyExpandedState.expanded
                ? 'Review the latest uploaded documents here, then move to the work queue for full page-by-page review.'
                : historySummary}
            </p>
          </div>

          <div className="prompt-home-document-upload-history-card-side">
            <button
              type="button"
              className="prompt-home-document-upload-history-card-toggle"
              aria-expanded={historyExpandedState.expanded}
              aria-controls={PROMPT_HOME_DOCUMENT_HISTORY_PANEL_ID}
              onClick={() => historyExpandedState.setExpanded((current) => !current)}
            >
              <div className="prompt-home-document-upload-history-card-toggle-meta">
                <small>{historyExpandedState.expanded ? 'Hide history' : 'Show history'}</small>
                <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                  {historyExpandedState.expanded ? '−' : '+'}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div
          id={PROMPT_HOME_DOCUMENT_HISTORY_PANEL_ID}
          className="prompt-home-document-upload-history-card-body"
          hidden={!historyExpandedState.expanded}
        >
          {historyExpandedState.expanded ? (
            controller.loading ? (
              <p className="form-note">Loading intake settings and recent queue activity.</p>
            ) : controller.loadError ? (
              <p className="field-error">{controller.loadError}</p>
            ) : recentDocuments.length > 0 ? (
              <div className="prompt-home-document-upload-recent">
                <div className="prompt-home-document-upload-recent-head">
                  <span className="eyebrow">Recent Uploads</span>
                  <small>{formatDocumentCount(recentDocuments.length)}</small>
                </div>
                <div className="prompt-home-document-upload-recent-list">
                  {recentDocuments.map((document) => (
                    <article
                      key={document.document_id}
                      className="prompt-home-document-upload-recent-item"
                    >
                      <strong>{document.display_name || document.original_filename}</strong>
                      <span>{document.original_filename}</span>
                      <small>
                        {formatDocumentStatus(document.status)} · {document.page_count} page
                        {document.page_count === 1 ? '' : 's'}
                      </small>
                      {!document.source_available ? (
                        <small className="field-error">
                          Source PDF is not available in local storage.
                        </small>
                      ) : null}
                      <div className="prompt-home-document-upload-recent-actions">
                        <button
                          type="button"
                          className="button button-ghost"
                          disabled={
                            openingDocumentId === document.document_id ||
                            !document.source_available
                          }
                          onClick={() => void handleOpenDocument(document)}
                        >
                          {openDocumentButtonLabel(
                            document,
                            openingDocumentId === document.document_id,
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state prompt-home-document-upload-empty">
                <strong>No documents yet</strong>
                <p>The first upload will appear here after the source PDF is stored and queued for analysis.</p>
              </div>
            )
          ) : null}
          {openDocumentError ? <p className="field-error">{openDocumentError}</p> : null}
        </div>
      </section>

      <div className="prompt-home-document-upload-footer">
        <div className="prompt-home-document-upload-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onOpenOperationsWorkspace}
          >
            Open Work Queue
          </button>
        </div>
      </div>

      {controller.uploading ? (
        <div className="prompt-home-document-upload-status">
          <p className="form-note">Uploading the selected PDF and refreshing document history.</p>
        </div>
      ) : null}
    </div>
  )
}

export function PromptHomeDocumentUploadCard({
  authSession,
  onOpenOperationsWorkspace,
  onSignIn,
}: PromptHomeDocumentUploadCardProps) {
  const expandedState = usePersistentCollapsibleCardState(
    'prompt-home.document-upload-card',
    false,
  )
  const collapsedSummary = authSession
    ? 'Upload PDFs from your machine or Gmail without leaving Home.'
    : 'Protected intake card. Sign in to upload and review PDFs.'

  return (
    <section className="prompt-home-document-upload-card">
      <div className="prompt-home-document-upload-card-head">
        <div className="prompt-home-document-upload-card-copy">
          <span className="eyebrow">Documents</span>
          <strong>Upload documents</strong>
          <p>
            {expandedState.expanded
              ? 'Store source PDFs, queue page analysis, and hand off full review to the work queue when needed.'
              : collapsedSummary}
          </p>
        </div>

        <div className="prompt-home-document-upload-card-side">
          <button
            type="button"
            className="prompt-home-document-upload-card-toggle"
            aria-expanded={expandedState.expanded}
            aria-controls={PROMPT_HOME_DOCUMENT_UPLOAD_PANEL_ID}
            onClick={() => expandedState.setExpanded((current) => !current)}
          >
            <div className="prompt-home-document-upload-card-toggle-meta">
              <small>{expandedState.expanded ? 'Hide card' : 'Show card'}</small>
              <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                {expandedState.expanded ? '−' : '+'}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={PROMPT_HOME_DOCUMENT_UPLOAD_PANEL_ID}
        className="prompt-home-document-upload-card-body"
        hidden={!expandedState.expanded}
      >
        {expandedState.expanded ? (
          <PromptHomeDocumentUploadCardContent
            authSession={authSession}
            onOpenOperationsWorkspace={onOpenOperationsWorkspace}
            onSignIn={onSignIn}
          />
        ) : null}
      </div>
    </section>
  )
}
