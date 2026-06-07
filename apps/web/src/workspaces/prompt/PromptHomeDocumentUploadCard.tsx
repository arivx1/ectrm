import { useState } from 'react'
import { fetchDocumentSource } from '../../entities/documents/api'
import { DocumentIngestionUploadForm } from '../../features/documents/DocumentIngestionUploadForm'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import { appConfig } from '../../shared/config'
import type { DocumentIngestionRecord } from '../../shared/models'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  mergePromptHomeClassNames,
  usePromptHomeCardDragHandle,
} from './promptHomeCardDrag.ts'

type PromptHomeDocumentUploadCardProps = {
  instanceId?: string
  authSession: StoredAuthSession | null
  onOpenLibraryWorkspace: () => void
  onSignIn: () => void
}

const PROMPT_HOME_DOCUMENT_UPLOAD_PANEL_ID = 'prompt-home-document-upload-panel'
const PROMPT_HOME_DOCUMENT_HISTORY_PANEL_ID = 'prompt-home-document-history-panel'

function promptHomeSafeDomIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'app'
}

function promptHomeInstanceScopedId(
  baseId: string,
  instanceId: string,
  baseInstanceId: string,
): string {
  return instanceId === baseInstanceId
    ? baseId
    : `${baseId}-${promptHomeSafeDomIdPart(instanceId)}`
}

function promptHomeInstanceStorageKey(
  baseKey: string,
  instanceId: string,
  baseInstanceId: string,
): string {
  return instanceId === baseInstanceId
    ? baseKey
    : `${baseKey}.${instanceId}`
}

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
    return `${formatDocumentCount(args.documentCount)} available in the library.`
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
  instanceId = 'documents',
  authSession,
  onOpenLibraryWorkspace,
  onSignIn,
}: PromptHomeDocumentUploadCardProps) {
  const historyPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_DOCUMENT_HISTORY_PANEL_ID,
    instanceId,
    'documents',
  )
  const controller = useDocumentIngestionController({ authSession })
  const historyExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      'prompt-home.document-upload-history-card',
      instanceId,
      'documents',
    ),
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

      <section className="prompt-home-document-upload-history-card">
        <div className="prompt-home-document-upload-history-card-head">
          <div className="prompt-home-document-upload-history-card-copy">
            <span className="eyebrow">History</span>
            <strong>Document history</strong>
            <p>
              {historyExpandedState.expanded
                ? 'Review the latest uploaded documents here, then open the library for full preview, search, and page-by-page review.'
                : historySummary}
            </p>
          </div>

          <div className="prompt-home-document-upload-history-card-side">
            <button
              type="button"
              className="prompt-home-document-upload-history-card-toggle"
              aria-expanded={historyExpandedState.expanded}
              aria-controls={historyPanelId}
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
          id={historyPanelId}
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
            onClick={onOpenLibraryWorkspace}
          >
            Open Library
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
  instanceId = 'documents',
  authSession,
  onOpenLibraryWorkspace,
  onSignIn,
}: PromptHomeDocumentUploadCardProps) {
  const uploadPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_DOCUMENT_UPLOAD_PANEL_ID,
    instanceId,
    'documents',
  )
  const expandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      'prompt-home.document-upload-card',
      instanceId,
      'documents',
    ),
    false,
  )
  const {
    className: dragHandleClassName,
    ...dragHandleAttributes
  } = usePromptHomeCardDragHandle<HTMLDivElement>()

  return (
    <section
      className={`prompt-home-document-upload-card ${
        expandedState.expanded ? 'is-expanded' : 'is-collapsed'
      }`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          'prompt-home-document-upload-card-head',
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-document-upload-card-copy">
          <span className="eyebrow">Documents</span>
          <strong>Upload documents</strong>
        </div>

        <div className="prompt-home-document-upload-card-side">
          <button
            type="button"
            className="prompt-home-document-upload-card-toggle"
            aria-label={
              expandedState.expanded
                ? 'Collapse Upload documents'
                : 'Expand Upload documents'
            }
            aria-expanded={expandedState.expanded}
            aria-controls={uploadPanelId}
            onClick={() => expandedState.setExpanded((current) => !current)}
          >
            <div className="prompt-home-document-upload-card-toggle-meta">
              <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                {expandedState.expanded ? '−' : '+'}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={uploadPanelId}
        className="prompt-home-document-upload-card-body"
        hidden={!expandedState.expanded}
      >
        {expandedState.expanded ? (
          <PromptHomeDocumentUploadCardContent
            instanceId={instanceId}
            authSession={authSession}
            onOpenLibraryWorkspace={onOpenLibraryWorkspace}
            onSignIn={onSignIn}
          />
        ) : null}
      </div>
    </section>
  )
}
