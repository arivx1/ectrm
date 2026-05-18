import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import { fetchDocumentSource } from '../../entities/documents/api'
import {
  documentNeedsProcessing,
  documentStatusTone,
  dominantDocumentKind,
  dominantDocumentKindCode,
  formatBytes,
  processorLabel,
  reviewReady,
  reviewedPageCount,
} from '../../features/documents/documentIngestionUtils'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'
import { appConfig } from '../../shared/config'
import type { DocumentIngestionRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildDocumentLibraryCollectionCounts,
  documentHasAiAssist,
  documentHasErrors,
  documentIsLinked,
  DOCUMENT_LIBRARY_COLLECTIONS,
  filterDocumentLibraryDocuments,
  formatDocumentLibraryLabel,
  sortDocumentLibraryKindOptions,
  type DocumentLibraryCollectionKey,
  type DocumentLibrarySortMode,
  type DocumentLibraryViewMode,
} from './libraryWorkspaceSupport'

type LibraryWorkspaceProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  activeDocumentId?: string | null
  onActiveDocumentChange?: (documentId: string | null) => void
  onOpenOperationsWorkspace: () => void
}

type LibraryKindFolder = {
  label: string
  count: number
}

type LibraryLocation =
  {
    scope: 'collection'
    key: DocumentLibraryCollectionKey
  }

type LibraryDocumentActivityEntry = {
  key: string
  label: string
  detail: string
  timestamp: string | null | undefined
}

const LIBRARY_UPLOAD_CARD_PANEL_ID = 'library-upload-card-panel'

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

function ownerLabel(document: DocumentIngestionRecord): string {
  return document.updated_by || document.created_by || 'system'
}

function uploadMethodLabel(document: DocumentIngestionRecord): string {
  const createdBy = document.created_by.trim().toLowerCase()
  if (createdBy.includes('gmail')) {
    return 'Gmail inbox import'
  }
  if (createdBy === 'document_processor' || createdBy === 'system') {
    return 'System import'
  }
  return 'Authenticated PDF upload'
}

function sameTimestamp(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && new Date(left).getTime() === new Date(right).getTime())
}

function latestProcessedAt(document: DocumentIngestionRecord): string | null {
  const timestamps = document.pages
    .map((page) => page.processed_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())

  return timestamps[0] ?? null
}

function buildDocumentActivityLog(document: DocumentIngestionRecord): LibraryDocumentActivityEntry[] {
  const processedAt = latestProcessedAt(document)
  const processedPageCount = document.pages.filter((page) => Boolean(page.processed_at)).length
  const entries: LibraryDocumentActivityEntry[] = [
    {
      key: 'uploaded',
      label: 'Uploaded',
      detail: `${document.created_by || 'system'} added ${document.original_filename}.`,
      timestamp: document.created_at,
    },
  ]

  if (document.status === 'PROCESSING') {
    entries.push({
      key: 'processing',
      label: 'Processing',
      detail: `${processorLabel(document.processor_provider)} is analyzing the source file.`,
      timestamp: document.updated_at,
    })
  } else if (processedAt) {
    entries.push({
      key: 'analyzed',
      label: 'Analyzed',
      detail: `${processorLabel(document.processor_provider)} processed ${processedPageCount}/${document.page_count} pages.`,
      timestamp: processedAt,
    })
  }

  if (dominantDocumentKindCode(document) !== 'UNKNOWN') {
    entries.push({
      key: 'classified',
      label: 'Classified',
      detail: `Classified as ${dominantDocumentKind(document)}.`,
      timestamp: processedAt ?? document.updated_at,
    })
  }

  if (document.reviewed_at) {
    entries.push({
      key: 'reviewed',
      label: 'Reviewed',
      detail: `${document.reviewed_by || 'system'} marked the file ${formatDocumentLibraryLabel(document.review_status)}.`,
      timestamp: document.reviewed_at,
    })
  } else if (document.review_status !== 'UNREVIEWED') {
    entries.push({
      key: 'review-status',
      label: 'Review Updated',
      detail: `Review status is ${formatDocumentLibraryLabel(document.review_status)}.`,
      timestamp: document.updated_at,
    })
  }

  document.record_links.forEach((link) => {
    entries.push({
      key: `linked-${link.record_type}-${link.record_id}`,
      label: 'Linked',
      detail: `${link.linked_by || 'system'} linked ${link.record_label}.`,
      timestamp: link.linked_at,
    })
  })

  document.processing_errors.forEach((error, index) => {
    entries.push({
      key: `error-${index}`,
      label: 'Needs Attention',
      detail: error,
      timestamp: document.updated_at,
    })
  })

  if (!sameTimestamp(document.created_at, document.updated_at)) {
    entries.push({
      key: 'updated',
      label: 'Updated',
      detail: `${document.updated_by || 'system'} updated the file record.`,
      timestamp: document.updated_at,
    })
  }

  return entries.sort((left, right) => {
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0
    return rightTime - leftTime
  })
}

function revokeDocumentSourceUrlLater(sourceUrl: string): void {
  if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
    return
  }
  window.setTimeout(() => URL.revokeObjectURL(sourceUrl), 60_000)
}

function fileStatusSummary(document: DocumentIngestionRecord): string {
  if (documentHasErrors(document)) {
    return 'Needs Attention'
  }
  if (documentNeedsProcessing(document)) {
    return 'Processing'
  }
  if (reviewReady(document)) {
    return 'Ready To Verify'
  }
  if (documentIsLinked(document)) {
    return 'Linked'
  }
  return formatDocumentLibraryLabel(document.review_status)
}

function buildLibraryKindFolders(documents: DocumentIngestionRecord[]): LibraryKindFolder[] {
  const counts = new Map<string, number>()

  documents.forEach((document) => {
    const label = dominantDocumentKind(document)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  return [...counts.entries()]
    .sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
    .map(([label, count]) => ({ label, count }))
}

export function LibraryWorkspace({
  authSession,
  formatDate,
  activeDocumentId,
  onActiveDocumentChange,
  onOpenOperationsWorkspace,
}: LibraryWorkspaceProps) {
  const {
    documents,
    processorSettings,
    schemaRegistry,
    loading,
    loadError,
    uploading,
    uploadError,
    gmailImporting,
    gmailImportError,
    gmailImportSummary,
    displayName,
    selectedProcessorProvider,
    selectedProcessorModel,
    selectedFile,
    isDragActive,
    fileInputRef,
    setDisplayName,
    setSelectedProcessorProvider,
    setSelectedProcessorModel,
    updateSelectedFile,
    openFilePicker,
    handleDropzoneKeyDown,
    handleDropzoneDragEnter,
    handleDropzoneDragOver,
    handleDropzoneDragLeave,
    handleDropzoneDrop,
    handleSubmit,
    handleImportGmailInbox: importGmailInbox,
    handleSetDocumentKind,
    saveErrors,
    savingTarget,
  } = useDocumentIngestionController({ authSession })
  const [activeLocation, setActiveLocation] = useState<LibraryLocation>({
    scope: 'collection',
    key: 'all',
  })
  const [selectedKindFilter, setSelectedKindFilter] = useState('all')
  const [viewMode, setViewMode] = useState<DocumentLibraryViewMode>('list')
  const [sortMode, setSortMode] = useState<DocumentLibrarySortMode>('updated')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [localActiveDocumentId, setLocalActiveDocumentId] = useState<string | null>(null)
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [openDocumentError, setOpenDocumentError] = useState('')
  const [kindDraftByDocumentId, setKindDraftByDocumentId] = useState<Record<string, string>>({})
  const uploadCardState = usePersistentCollapsibleCardState('library.upload-card', false)
  const setUploadCardExpanded = uploadCardState.setExpanded
  const showUploadComposer = uploadCardState.expanded
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const collectionCounts = buildDocumentLibraryCollectionCounts(documents)
  const rootCollection = DOCUMENT_LIBRARY_COLLECTIONS[0]
  const workflowCollections = DOCUMENT_LIBRARY_COLLECTIONS.slice(1)
  const activeCollection =
    DOCUMENT_LIBRARY_COLLECTIONS.find((collection) => collection.key === activeLocation.key) ??
    rootCollection
  const scopedDocuments = filterDocumentLibraryDocuments({
    documents,
    collectionKey: activeCollection.key,
    query: '',
    sortMode: 'updated',
  })
  const scopedCollectionCounts = buildDocumentLibraryCollectionCounts(scopedDocuments)
  const kindFolders = buildLibraryKindFolders(scopedDocuments)
  const activeKindFilter =
    selectedKindFilter === 'all' || kindFolders.some((folder) => folder.label === selectedKindFilter)
      ? selectedKindFilter
      : 'all'
  const searchedDocuments = filterDocumentLibraryDocuments({
    documents,
    collectionKey: activeCollection.key,
    query: deferredSearchQuery,
    sortMode,
  })
  const visibleDocuments = searchedDocuments.filter(
    (document) => activeKindFilter === 'all' || dominantDocumentKind(document) === activeKindFilter,
  )
  const totalStoredBytes = documents.reduce((sum, document) => sum + document.size_bytes, 0)
  const visibleStoredBytes = visibleDocuments.reduce((sum, document) => sum + document.size_bytes, 0)
  const aiAssistedCount = documents.filter(documentHasAiAssist).length
  const verifiedCount = documents.filter((document) => document.review_status === 'VERIFIED').length
  const processingCount = documents.filter(documentNeedsProcessing).length
  const documentPageId = activeDocumentId !== undefined ? activeDocumentId : localActiveDocumentId
  const documentPage = documentPageId
    ? documents.find((document) => document.document_id === documentPageId) ?? null
    : null
  const documentKindOptions = useMemo(
    () => sortDocumentLibraryKindOptions(schemaRegistry?.document_kinds ?? []),
    [schemaRegistry],
  )
  const availableProviders = processorSettings?.providers ?? []
  const shouldShowProviderSelector = availableProviders.length > 0
  const unconfiguredProviders = availableProviders.filter((provider) => !provider.configured)
  const selectedProvider =
    availableProviders.find((provider) => provider.provider === selectedProcessorProvider) ?? null
  const selectedProviderModels =
    selectedProvider?.available_models?.length
      ? selectedProvider.available_models
      : selectedProvider?.default_model
        ? [selectedProvider.default_model]
        : []
  const placeholderProviderLabels =
    unconfiguredProviders.length <= 1
      ? (unconfiguredProviders[0]?.label ?? '')
      : unconfiguredProviders.length === 2
        ? `${unconfiguredProviders[0]?.label ?? ''} and ${unconfiguredProviders[1]?.label ?? ''}`
        : `${unconfiguredProviders.slice(0, -1).map((provider) => provider.label).join(', ')}, and ${unconfiguredProviders[unconfiguredProviders.length - 1]?.label ?? ''}`
  const gmailConfigured = Boolean(
    processorSettings?.gmail_inbox?.enabled && processorSettings?.gmail_inbox?.configured,
  )
  const uploadProviderLabel = selectedProvider ? selectedProvider.label : 'Built-in Parser'
  const resolvedSelectedDocumentId =
    visibleDocuments.length === 0
      ? null
      : selectedDocumentId && visibleDocuments.some((document) => document.document_id === selectedDocumentId)
        ? selectedDocumentId
        : visibleDocuments[0]?.document_id ?? null
  const activeLocationLabel = activeCollection.label
  const documentPageActivity = documentPage
    ? buildDocumentActivityLog(documentPage)
    : []

  useEffect(() => {
    if (
      selectedFile ||
      uploading ||
      Boolean(uploadError) ||
      Boolean(gmailImportError) ||
      Boolean(gmailImportSummary)
    ) {
      setUploadCardExpanded(true)
    }
  }, [
    gmailImportError,
    gmailImportSummary,
    selectedFile,
    setUploadCardExpanded,
    uploadError,
    uploading,
  ])

  useEffect(() => {
    if (documentPageId) {
      setSelectedDocumentId(documentPageId)
    }
  }, [documentPageId])

  function handleOpenDocumentPage(documentId: string) {
    setSelectedDocumentId(documentId)
    setLocalActiveDocumentId(documentId)
    setOpenDocumentError('')
    onActiveDocumentChange?.(documentId)
  }

  function handleCloseDocumentPage() {
    setLocalActiveDocumentId(null)
    setOpenDocumentError('')
    onActiveDocumentChange?.(null)
  }

  async function handleOpenSourceDocument(document: DocumentIngestionRecord) {
    if (!authSession || typeof window === 'undefined') {
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
        authSession,
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

  function handleDocumentRowKeyDown(event: ReactKeyboardEvent<HTMLElement>, documentId: string) {
    if (isEditableKeyboardTarget(event.target)) {
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    handleOpenDocumentPage(documentId)
  }

  async function handleLibraryDocumentKindChange(document: DocumentIngestionRecord, nextDocumentKind: string) {
    const currentDocumentKind = dominantDocumentKindCode(document)
    if (!nextDocumentKind || nextDocumentKind === currentDocumentKind) {
      setKindDraftByDocumentId((current) => {
        if (!(document.document_id in current)) {
          return current
        }
        const nextDrafts = { ...current }
        delete nextDrafts[document.document_id]
        return nextDrafts
      })
      return
    }

    setSelectedDocumentId(document.document_id)
    setKindDraftByDocumentId((current) => ({ ...current, [document.document_id]: nextDocumentKind }))
    try {
      await handleSetDocumentKind(document, nextDocumentKind)
    } finally {
      setKindDraftByDocumentId((current) => {
        if (!(document.document_id in current)) {
          return current
        }
        const nextDrafts = { ...current }
        delete nextDrafts[document.document_id]
        return nextDrafts
      })
    }
  }

  function handleSelectCollection(collectionKey: DocumentLibraryCollectionKey) {
    setActiveLocation({
      scope: 'collection',
      key: collectionKey,
    })
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    await handleSubmit(event)
  }

  async function handleImportGmailInboxClick() {
    await importGmailInbox()
  }

  if (!authSession) {
    return (
      <div className="empty-state">
        <strong>Document library is protected</strong>
        <p>Sign in to browse uploaded PDFs and review parsing status.</p>
      </div>
    )
  }

  return (
    <div className="library-workspace">
      <aside className="library-sidebar surface">
        <section className="library-sidebar-section">
          <div className="library-sidebar-section-head">
            <span className="eyebrow">Library</span>
            <small>{documents.length} files</small>
          </div>
          <div className="library-folder-list">
            <button
              type="button"
              className={`library-folder-button${
                activeLocation.key === rootCollection.key
                  ? ' is-active'
                  : ''
              }`}
              onClick={() => handleSelectCollection(rootCollection.key)}
            >
              <span className="library-folder-icon" aria-hidden="true" />
              <div className="library-folder-copy">
                <strong>{rootCollection.label}</strong>
                <small>{rootCollection.description}</small>
              </div>
              <span className="library-folder-count">{collectionCounts[rootCollection.key]}</span>
            </button>
          </div>
        </section>

        <section className="library-sidebar-section">
          <div className="library-sidebar-section-head">
            <span className="eyebrow">Workflow Views</span>
            <small>{workflowCollections.length}</small>
          </div>
          <div className="library-folder-list">
            {workflowCollections.map((collection) => (
              <button
                key={collection.key}
                type="button"
                className={`library-folder-button${
                  activeLocation.key === collection.key
                    ? ' is-active'
                    : ''
                }`}
                onClick={() => handleSelectCollection(collection.key)}
              >
                <span className="library-folder-icon" aria-hidden="true" />
                <div className="library-folder-copy">
                  <strong>{collection.label}</strong>
                  <small>{collection.description}</small>
                </div>
                <span className="library-folder-count">{collectionCounts[collection.key]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="library-sidebar-section">
          <div className="library-sidebar-section-head">
            <span className="eyebrow">Document Types</span>
            <small>{kindFolders.length}</small>
          </div>
          <div className="library-folder-list">
            <button
              type="button"
              className={`library-folder-button${activeKindFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setSelectedKindFilter('all')}
            >
              <span className="library-folder-icon library-folder-icon-outline" aria-hidden="true" />
              <div className="library-folder-copy">
                <strong>All Types</strong>
                <small>Show every document family in the selected view.</small>
              </div>
              <span className="library-folder-count">{scopedDocuments.length}</span>
            </button>
            {kindFolders.map((folder) => (
              <button
                key={folder.label}
                type="button"
                className={`library-folder-button${activeKindFilter === folder.label ? ' is-active' : ''}`}
                onClick={() => setSelectedKindFilter(folder.label)}
              >
                <span className="library-folder-icon library-folder-icon-type" aria-hidden="true" />
                <div className="library-folder-copy">
                  <strong>{folder.label}</strong>
                  <small>{folder.count} uploaded file{folder.count === 1 ? '' : 's'}</small>
                </div>
                <span className="library-folder-count">{folder.count}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="library-sidebar-section">
          <div className="library-storage-card">
            <span className="eyebrow">Storage</span>
            <strong>{formatBytes(totalStoredBytes)}</strong>
            <p>{documents.length} files stored in the uploaded documents library.</p>
            <div className="library-storage-stats">
              <span>{verifiedCount} verified</span>
              <span>{processingCount} processing</span>
              <span>{aiAssistedCount} AI-assisted</span>
            </div>
          </div>
        </section>
      </aside>

      <div className="library-browser">
        {documentPageId ? (
          <section className="library-document-page surface">
            <div className="library-document-page-bar">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCloseDocumentPage}
              >
                Back to Library
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={onOpenOperationsWorkspace}
              >
                Open Queue
              </button>
            </div>

            {documentPage ? (
              <>
                <header className="library-document-page-head">
                  <span className="library-file-icon" aria-hidden="true">
                    PDF
                  </span>
                  <div className="library-document-page-title">
                    <span className="eyebrow">File Page</span>
                    <h2>{documentPage.display_name || documentPage.original_filename}</h2>
                    <p>{documentPage.original_filename}</p>
                  </div>
                  <div className="library-document-page-actions">
                    <span className={`status-pill status-pill-${documentStatusTone(documentPage.status)}`}>
                      {fileStatusSummary(documentPage)}
                    </span>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={!documentPage.source_available || openingDocumentId === documentPage.document_id}
                      onClick={() => void handleOpenSourceDocument(documentPage)}
                    >
                      {!documentPage.source_available
                        ? 'Source Missing'
                        : openingDocumentId === documentPage.document_id
                          ? 'Opening PDF...'
                          : 'Open Source PDF'}
                    </button>
                  </div>
                </header>

                {openDocumentError ? <p className="field-error">{openDocumentError}</p> : null}

                <div className="library-document-page-grid">
                  <section className="library-document-page-section">
                    <div className="library-section-head">
                      <span className="eyebrow">File</span>
                      <small>{formatBytes(documentPage.size_bytes)}</small>
                    </div>
                    <dl className="library-document-fact-list">
                      <div>
                        <dt>Document ID</dt>
                        <dd>{documentPage.document_id}</dd>
                      </div>
                      <div>
                        <dt>Type</dt>
                        <dd>{dominantDocumentKind(documentPage)}</dd>
                      </div>
                      <div>
                        <dt>Review</dt>
                        <dd>{formatDocumentLibraryLabel(documentPage.review_status)}</dd>
                      </div>
                      <div>
                        <dt>Pages</dt>
                        <dd>
                          {reviewedPageCount(documentPage)}/{documentPage.page_count} reviewed
                        </dd>
                      </div>
                      <div>
                        <dt>Owner</dt>
                        <dd>{ownerLabel(documentPage)}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="library-document-page-section">
                    <div className="library-section-head">
                      <span className="eyebrow">Upload</span>
                      <small>{formatDate(documentPage.created_at)}</small>
                    </div>
                    <dl className="library-document-fact-list">
                      <div>
                        <dt>Method</dt>
                        <dd>{uploadMethodLabel(documentPage)}</dd>
                      </div>
                      <div>
                        <dt>Uploaded By</dt>
                        <dd>{documentPage.created_by}</dd>
                      </div>
                      <div>
                        <dt>Source PDF</dt>
                        <dd>{documentPage.source_available ? 'Available' : 'Missing from storage'}</dd>
                      </div>
                      <div>
                        <dt>Storage Key</dt>
                        <dd>{documentPage.storage_key}</dd>
                      </div>
                      <div>
                        <dt>Processor</dt>
                        <dd>
                          {processorLabel(documentPage.processor_provider)}
                          {documentPage.processor_model ? ` / ${documentPage.processor_model}` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>
                          {formatDate(documentPage.updated_at)} by {documentPage.updated_by || 'system'}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>

                <section className="library-document-page-section library-document-activity-section">
                  <div className="library-section-head">
                    <span className="eyebrow">Activity Log</span>
                    <small>{documentPageActivity.length} events</small>
                  </div>
                  <ol className="library-document-activity-list">
                    {documentPageActivity.map((entry) => (
                      <li key={entry.key}>
                        <span className="library-document-activity-dot" aria-hidden="true" />
                        <div>
                          <strong>{entry.label}</strong>
                          <p>{entry.detail}</p>
                          <small>{formatDate(entry.timestamp)}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                {documentPage.record_links.length > 0 ? (
                  <section className="library-document-page-section">
                    <div className="library-section-head">
                      <span className="eyebrow">Linked Records</span>
                      <small>{documentPage.record_links.length}</small>
                    </div>
                    <div className="library-linked-record-list">
                      {documentPage.record_links.map((link) => (
                        <article
                          key={`${link.record_type}-${link.record_id}`}
                          className="library-linked-record-card"
                        >
                          <strong>{link.record_label}</strong>
                          <span>
                            {formatDocumentLibraryLabel(link.record_type)} / {link.record_id}
                          </span>
                          <small>
                            Linked {formatDate(link.linked_at)} by {link.linked_by}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="empty-state library-empty-state">
                <strong>File not found</strong>
                <p>The selected file is not in the current document library response.</p>
              </div>
            )}
          </section>
        ) : (
          <>
        <section className="library-toolbar surface">
          <div className="library-toolbar-top">
            <div className="library-breadcrumbs" aria-label="Library location">
              <button
                type="button"
                className="library-breadcrumb-button"
                onClick={() => handleSelectCollection(rootCollection.key)}
              >
                Uploaded documents
              </button>
              <span className="library-breadcrumb-separator">/</span>
              <span>{activeLocationLabel}</span>
              {activeKindFilter !== 'all' ? (
                <>
                  <span className="library-breadcrumb-separator">/</span>
                  <strong>{activeKindFilter}</strong>
                </>
              ) : null}
            </div>

            <div className="library-toolbar-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={onOpenOperationsWorkspace}
              >
                Open Queue
              </button>
            </div>
          </div>

          <div className="library-toolbar-bottom">
            <label className="library-search-field">
              <span className="library-search-label">Search files</span>
              <input
                className="control"
                type="search"
                placeholder="Search by file name, document kind, note, or linked record"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <div className="library-toolbar-controls">
              <label className="library-sort-field">
                <span>Sort</span>
                <select
                  className="control"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as DocumentLibrarySortMode)}
                >
                  <option value="updated">Recently Updated</option>
                  <option value="name">Alphabetical</option>
                </select>
              </label>

              <div className="library-view-toggle" role="group" aria-label="Library view mode">
                <button
                  type="button"
                  className={`button ${viewMode === 'list' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  type="button"
                  className={`button ${viewMode === 'grid' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
            </div>
          </div>

          <div className="library-toolbar-summary">
            <span>{visibleDocuments.length} visible</span>
            <span>{formatBytes(visibleStoredBytes)} visible</span>
            <span>{scopedCollectionCounts.ready} ready to verify</span>
            <span>{scopedCollectionCounts.errors} need attention</span>
            {loading ? <span>Syncing library…</span> : null}
            {loadError ? <span className="field-error">{loadError}</span> : null}
          </div>
        </section>

        <article className="library-upload-card prompt-home-document-upload-card">
          <div className="prompt-home-document-upload-card-head">
            <div className="prompt-home-document-upload-card-copy">
              <span className="eyebrow">Uploader</span>
              <strong>Add files to Uploaded documents</strong>
              {showUploadComposer ? (
                <p>Add a PDF from your machine or import one from Gmail.</p>
              ) : null}
            </div>

            <div className="prompt-home-document-upload-card-side">
              <button
                type="button"
                className="prompt-home-document-upload-card-toggle"
                aria-expanded={showUploadComposer}
                aria-controls={LIBRARY_UPLOAD_CARD_PANEL_ID}
                onClick={() => setUploadCardExpanded((current) => !current)}
              >
                <div className="prompt-home-document-upload-card-toggle-meta">
                  <small>{showUploadComposer ? 'Hide card' : 'Show card'}</small>
                  <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                    {showUploadComposer ? '−' : '+'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div
            id={LIBRARY_UPLOAD_CARD_PANEL_ID}
            className="prompt-home-document-upload-card-body library-upload-card-body"
            hidden={!showUploadComposer}
          >
            {showUploadComposer ? (
              <>
                <div className="library-upload-card-support">
                  <p>
                    Files land in Uploaded documents and are ready for review as soon as processing finishes.
                  </p>
                  <div className="library-upload-card-status">
                    {gmailConfigured ? (
                      <span className="entity-chip entity-chip-soft">Gmail import ready</span>
                    ) : null}
                    <span className="entity-chip entity-chip-soft">{uploadProviderLabel}</span>
                  </div>
                </div>

                <form className="library-upload-inline-form" onSubmit={handleUploadSubmit}>
                  <div className="library-upload-inline-grid">
                    <div
                      className={[
                        'library-upload-dropzone',
                        isDragActive ? 'is-active' : '',
                        selectedFile ? 'has-file' : '',
                        uploading ? 'is-disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="button"
                      tabIndex={uploading ? -1 : 0}
                      aria-disabled={uploading}
                      aria-label="Drop a PDF here or click to browse"
                      onClick={openFilePicker}
                      onKeyDown={handleDropzoneKeyDown}
                      onDragEnter={handleDropzoneDragEnter}
                      onDragOver={handleDropzoneDragOver}
                      onDragLeave={handleDropzoneDragLeave}
                      onDrop={handleDropzoneDrop}
                    >
                      <input
                        ref={fileInputRef}
                        className="document-dropzone-input"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => updateSelectedFile(event.target.files?.[0] ?? null)}
                        disabled={uploading}
                      />
                      <span className="eyebrow">PDF</span>
                      <strong>{selectedFile ? selectedFile.name : 'Drop PDF or Choose File'}</strong>
                      <p>
                        {selectedFile
                          ? `${formatBytes(selectedFile.size)} ready for upload`
                          : 'Add one document at a time to the uploaded documents library.'}
                      </p>
                    </div>

                    <label className="library-upload-field">
                      <span>Display Name</span>
                      <input
                        className="control"
                        type="text"
                        value={displayName}
                        placeholder="Optional desk-friendly label"
                        onChange={(event) => setDisplayName(event.target.value)}
                        disabled={uploading}
                      />
                    </label>

                    {shouldShowProviderSelector ? (
                      <label className="library-upload-field">
                        <span>Processing API</span>
                        <select
                          className="control"
                          value={selectedProcessorProvider}
                          onChange={(event) =>
                            setSelectedProcessorProvider(
                              event.target.value as 'builtin' | 'openai' | 'anthropic' | 'google' | '',
                            )
                          }
                          disabled={uploading}
                        >
                          <option value="builtin">Built-in Parser Only</option>
                          {availableProviders.map((provider) => (
                            <option key={provider.provider} value={provider.provider} disabled={!provider.configured}>
                              {provider.label} ({provider.default_model || provider.available_models?.[0] || 'setup required'}{provider.configured ? '' : ' placeholder'})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="library-upload-field library-upload-field-readonly">
                        <span>Processing API</span>
                        <div className="library-upload-readonly-value">Built-in Parser</div>
                      </div>
                    )}

                    {selectedProcessorProvider !== 'builtin' && selectedProviderModels.length > 0 ? (
                      <label className="library-upload-field">
                        <span>Processing Model</span>
                        <select
                          className="control"
                          value={selectedProcessorModel}
                          onChange={(event) => setSelectedProcessorModel(event.target.value)}
                          disabled={uploading}
                        >
                          {selectedProviderModels.map((modelOption) => (
                            <option key={modelOption} value={modelOption}>
                              {modelOption}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                  </div>

                  <div className="library-upload-inline-actions">
                    <div className="library-upload-inline-buttons">
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={uploading || !selectedFile}
                      >
                        {uploading ? 'Uploading…' : 'Upload PDF'}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void handleImportGmailInboxClick()}
                        disabled={uploading || gmailImporting || !gmailConfigured}
                      >
                        {gmailImporting ? 'Importing Gmail…' : 'Import Gmail PDFs'}
                      </button>
                      {selectedFile ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => updateSelectedFile(null)}
                          disabled={uploading}
                        >
                          Clear File
                        </button>
                      ) : null}
                    </div>

                    <p className="library-upload-note">
                      {selectedProcessorProvider === 'builtin'
                        ? 'Built-in parsing only will run for this upload.'
                        : selectedProvider
                          ? `${selectedProvider.label}${selectedProcessorModel ? ` (${selectedProcessorModel})` : ''} will handle document analysis.`
                          : 'The built-in parser will be used until an external provider is configured.'}
                      {unconfiguredProviders.length > 0
                        ? ` ${placeholderProviderLabels} placeholder${unconfiguredProviders.length === 1 ? ' is' : 's are'} visible here and will unlock once those API providers are configured.`
                        : ''}
                    </p>
                  </div>

                  {uploadError ? <p className="field-error">{uploadError}</p> : null}
                  {gmailImportError ? <p className="field-error">{gmailImportError}</p> : null}
                  {gmailImportSummary ? <p className="form-note">{gmailImportSummary}</p> : null}
                </form>
              </>
            ) : null}
          </div>
        </article>

        <section className="library-browser-main surface">
            {visibleDocuments.length === 0 ? (
              <div className="empty-state library-empty-state">
                <strong>{documents.length === 0 ? 'No uploaded documents yet' : 'No files match this view'}</strong>
                <p>
                  {documents.length === 0
                    ? 'Open the uploader card to add the first PDF into the library.'
                    : 'Try another workflow view, clear the search box, or change the type filter.'}
                </p>
              </div>
            ) : viewMode === 'list' ? (
              <div className="library-file-table" role="list">
                <div className="library-file-table-head" aria-hidden="true">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Review</span>
                  <span>Owner</span>
                  <span>Modified</span>
                  <span>Size</span>
                </div>
                <div className="library-file-table-body">
                  {visibleDocuments.map((document) => (
                    <div
                      key={document.document_id}
                      role="listitem"
                      tabIndex={0}
                      className={`library-file-row${resolvedSelectedDocumentId === document.document_id ? ' is-selected' : ''}`}
                      aria-label={`Open ${document.display_name || document.original_filename}`}
                      onClick={() => handleOpenDocumentPage(document.document_id)}
                      onKeyDown={(event) => handleDocumentRowKeyDown(event, document.document_id)}
                    >
                      <div className="library-file-name">
                        <span className="library-file-icon" aria-hidden="true">
                          PDF
                        </span>
                        <div className="library-file-name-copy">
                          <strong>{document.display_name || document.original_filename}</strong>
                          <span>{document.original_filename}</span>
                        </div>
                      </div>
                      <div
                        className="library-file-kind-cell"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {schemaRegistry ? (
                          <select
                            className="control library-file-kind-select"
                            aria-label={`Set document type for ${document.display_name || document.original_filename}`}
                            value={kindDraftByDocumentId[document.document_id] ?? dominantDocumentKindCode(document)}
                            disabled={documentNeedsProcessing(document) || savingTarget === `document-kind:${document.document_id}`}
                            title={
                              document.page_count > 1
                                ? `Changing the type here applies the selected classification to all ${document.page_count} pages in the file.`
                                : 'Change the classified document type.'
                            }
                            onChange={(event) =>
                              void handleLibraryDocumentKindChange(document, event.target.value)
                            }
                          >
                            {documentKindOptions.map((entry) => (
                              <option key={entry.document_kind} value={entry.document_kind}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{dominantDocumentKind(document)}</span>
                        )}
                        {savingTarget === `document-kind:${document.document_id}` ? (
                          <small className="library-file-kind-note">Saving type…</small>
                        ) : saveErrors[`document-kind:${document.document_id}`] ? (
                          <small className="field-error">{saveErrors[`document-kind:${document.document_id}`]}</small>
                        ) : null}
                      </div>
                      <span>
                        <span className={`status-pill status-pill-${documentStatusTone(document.status)}`}>
                          {fileStatusSummary(document)}
                        </span>
                      </span>
                      <span>{ownerLabel(document)}</span>
                      <span>{formatDate(document.updated_at)}</span>
                      <span>{formatBytes(document.size_bytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="library-document-grid">
                {visibleDocuments.map((document) => (
                  <button
                    key={document.document_id}
                    type="button"
                    className={`library-document-card${resolvedSelectedDocumentId === document.document_id ? ' is-selected' : ''}`}
                    onClick={() => handleOpenDocumentPage(document.document_id)}
                  >
                    <div className="library-document-card-visual">
                      <div className="library-document-sheet">
                        <span className="library-document-card-badge">PDF</span>
                        <strong>{dominantDocumentKind(document)}</strong>
                        <small>{document.page_count} page{document.page_count === 1 ? '' : 's'}</small>
                      </div>
                    </div>
                    <div className="library-document-card-copy">
                      <strong>{document.display_name || document.original_filename}</strong>
                      <span>{document.original_filename}</span>
                    </div>
                    <div className="library-document-card-meta">
                      <span className={`status-pill status-pill-${documentStatusTone(document.status)}`}>
                        {fileStatusSummary(document)}
                      </span>
                      <span className="entity-chip entity-chip-soft">{formatBytes(document.size_bytes)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </section>
          </>
        )}
      </div>
    </div>
  )
}
