import {
  useDeferredValue,
  useEffect,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from 'react'

import {
  documentNeedsProcessing,
  documentStatusTone,
  dominantDocumentKind,
  formatBytes,
  reviewReady,
} from '../../features/documents/documentIngestionUtils'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'
import type { DocumentIngestionRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildDocumentLibraryCollectionCounts,
  buildDocumentLibraryFolderDescendantIds,
  buildDocumentLibraryFolderCounts,
  buildDocumentLibraryFolderTree,
  documentHasAiAssist,
  documentHasErrors,
  documentIsLinked,
  DOCUMENT_LIBRARY_COLLECTIONS,
  filterDocumentLibraryDocuments,
  formatDocumentLibraryLabel,
  type DocumentLibraryFolderTreeItem,
  type DocumentLibraryCollectionKey,
  type DocumentLibrarySortMode,
  type DocumentLibraryViewMode,
} from './libraryWorkspaceSupport'
import { useDocumentLibraryFolderState } from './libraryFolderState'

type LibraryWorkspaceProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenOperationsWorkspace: () => void
}

type LibraryKindFolder = {
  label: string
  count: number
}

type LibraryLocation =
  | {
      scope: 'collection'
      key: DocumentLibraryCollectionKey
    }
  | {
      scope: 'folder'
      key: string
    }

const LIBRARY_UPLOAD_CARD_PANEL_ID = 'library-upload-card-panel'
const LIBRARY_ROOT_DROP_TARGET_KEY = 'root'
const LIBRARY_DOCUMENT_DRAG_MIME = 'application/x-ectrm-library-document'
const LIBRARY_FOLDER_DRAG_MIME = 'application/x-ectrm-library-folder'

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
  onOpenOperationsWorkspace,
}: LibraryWorkspaceProps) {
  const controller = useDocumentIngestionController({ authSession })
  const [activeLocation, setActiveLocation] = useState<LibraryLocation>({
    scope: 'collection',
    key: 'all',
  })
  const [selectedKindFilter, setSelectedKindFilter] = useState('all')
  const [viewMode, setViewMode] = useState<DocumentLibraryViewMode>('list')
  const [sortMode, setSortMode] = useState<DocumentLibrarySortMode>('updated')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [showFolderComposer, setShowFolderComposer] = useState(false)
  const [folderDraftName, setFolderDraftName] = useState('')
  const [folderDraftError, setFolderDraftError] = useState('')
  const [folderActionNotice, setFolderActionNotice] = useState('')
  const [folderActionError, setFolderActionError] = useState('')
  const [folderClipboard, setFolderClipboard] = useState<{
    folderId: string
    folderName: string
  } | null>(null)
  const [uploadFolderId, setUploadFolderId] = useState('')
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState<string | null | undefined>(undefined)
  const [pendingImportFolderId, setPendingImportFolderId] = useState<string | null | undefined>(undefined)
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [documentDragOverTargetKey, setDocumentDragOverTargetKey] = useState<string | null>(null)
  const [folderDragOverTargetKey, setFolderDragOverTargetKey] = useState<string | null>(null)
  const uploadCardState = usePersistentCollapsibleCardState('library.upload-card', false)
  const setUploadCardExpanded = uploadCardState.setExpanded
  const showUploadComposer = uploadCardState.expanded
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const {
    folders: customFolders,
    assignments: folderAssignments,
    createFolder,
    moveFolder,
    copyFolder,
    assignDocumentToFolder,
    assignDocumentsToFolder,
  } = useDocumentLibraryFolderState()

  const documents = controller.documents
  const collectionCounts = buildDocumentLibraryCollectionCounts(documents)
  const folderTree = buildDocumentLibraryFolderTree(customFolders)
  const folderNodeById = Object.fromEntries(
    folderTree.map((folder) => [folder.id, folder]),
  ) as Record<string, DocumentLibraryFolderTreeItem>
  const folderCounts = buildDocumentLibraryFolderCounts(documents, folderAssignments, customFolders)
  const rootCollection = DOCUMENT_LIBRARY_COLLECTIONS[0]
  const workflowCollections = DOCUMENT_LIBRARY_COLLECTIONS.slice(1)
  const activeCollection =
    activeLocation.scope === 'collection'
      ? DOCUMENT_LIBRARY_COLLECTIONS.find((collection) => collection.key === activeLocation.key) ??
        rootCollection
      : null
  const activeCustomFolder =
    activeLocation.scope === 'folder'
      ? folderNodeById[activeLocation.key] ?? null
      : null
  const activeFolderMatchIds = activeCustomFolder
    ? buildDocumentLibraryFolderDescendantIds(activeCustomFolder.id, customFolders)
    : null
  const scopedDocuments = filterDocumentLibraryDocuments({
    documents,
    collectionKey: activeCollection?.key ?? null,
    folderAssignments,
    folderMatchIds: activeFolderMatchIds,
    query: '',
    sortMode: 'updated',
  })
  const scopedCollectionCounts = buildDocumentLibraryCollectionCounts(scopedDocuments)
  const kindFolders = buildLibraryKindFolders(scopedDocuments)
  const searchedDocuments = filterDocumentLibraryDocuments({
    documents,
    collectionKey: activeCollection?.key ?? null,
    folderAssignments,
    folderMatchIds: activeFolderMatchIds,
    query: deferredSearchQuery,
    sortMode,
  })
  const visibleDocuments = searchedDocuments.filter(
    (document) => selectedKindFilter === 'all' || dominantDocumentKind(document) === selectedKindFilter,
  )
  const totalStoredBytes = documents.reduce((sum, document) => sum + document.size_bytes, 0)
  const visibleStoredBytes = visibleDocuments.reduce((sum, document) => sum + document.size_bytes, 0)
  const aiAssistedCount = documents.filter(documentHasAiAssist).length
  const verifiedCount = documents.filter((document) => document.review_status === 'VERIFIED').length
  const processingCount = documents.filter(documentNeedsProcessing).length
  const availableProviders = controller.processorSettings?.providers ?? []
  const shouldShowProviderSelector = availableProviders.length > 0
  const unconfiguredProviders = availableProviders.filter((provider) => !provider.configured)
  const selectedProvider =
    availableProviders.find((provider) => provider.provider === controller.selectedProcessorProvider) ?? null
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
    controller.processorSettings?.gmail_inbox?.enabled && controller.processorSettings?.gmail_inbox?.configured,
  )
  const uploadProviderLabel = selectedProvider ? selectedProvider.label : 'Built-in Parser'
  const selectedDocument =
    visibleDocuments.find((document) => document.document_id === selectedDocumentId) ?? null
  const selectedDocumentFolderId = selectedDocument
    ? folderAssignments[selectedDocument.document_id] ?? ''
    : ''
  const activeLocationLabel = activeCustomFolder?.pathLabel ?? activeCollection?.label ?? rootCollection.label
  const uploadFolder = uploadFolderId ? folderNodeById[uploadFolderId] ?? null : null
  const folderNameById = Object.fromEntries(
    folderTree.map((folder) => [folder.id, folder.pathLabel]),
  ) as Record<string, string>
  const activeFolderPath = activeCustomFolder
    ? activeCustomFolder.pathIds
        .map((folderId) => folderNodeById[folderId])
        .filter((folder): folder is DocumentLibraryFolderTreeItem => Boolean(folder))
    : []
  const draggingFolderDescendantIds = draggingFolderId
    ? buildDocumentLibraryFolderDescendantIds(draggingFolderId, customFolders)
    : null
  const clipboardFolder =
    folderClipboard && customFolders.some((folder) => folder.id === folderClipboard.folderId)
      ? folderNodeById[folderClipboard.folderId] ?? null
      : null
  const folderPasteTargetId = activeLocation.scope === 'folder' ? activeLocation.key : null
  const folderPasteActionLabel = activeCustomFolder ? 'Paste Here' : 'Paste to Root'
  const folderShortcutModifierLabel =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'

  useEffect(() => {
    if (selectedKindFilter === 'all') {
      return
    }

    if (!kindFolders.some((folder) => folder.label === selectedKindFilter)) {
      setSelectedKindFilter('all')
    }
  }, [kindFolders, selectedKindFilter])

  useEffect(() => {
    if (
      controller.selectedFile ||
      controller.uploading ||
      Boolean(controller.uploadError) ||
      Boolean(controller.gmailImportError) ||
      Boolean(controller.gmailImportSummary)
    ) {
      setUploadCardExpanded(true)
    }
  }, [
    controller.gmailImportError,
    controller.gmailImportSummary,
    controller.selectedFile,
    controller.uploadError,
    controller.uploading,
    setUploadCardExpanded,
  ])

  useEffect(() => {
    if (activeLocation.scope === 'folder' && !activeCustomFolder) {
      setActiveLocation({
        scope: 'collection',
        key: rootCollection.key,
      })
    }
  }, [activeCustomFolder, activeLocation, rootCollection.key])

  useEffect(() => {
    if (activeLocation.scope === 'folder') {
      setUploadFolderId(activeLocation.key)
    }
  }, [activeLocation])

  useEffect(() => {
    if (uploadFolderId && !customFolders.some((folder) => folder.id === uploadFolderId)) {
      setUploadFolderId('')
    }
  }, [customFolders, uploadFolderId])

  useEffect(() => {
    if (folderClipboard && !customFolders.some((folder) => folder.id === folderClipboard.folderId)) {
      setFolderClipboard(null)
      setFolderActionNotice('')
    }
  }, [customFolders, folderClipboard])

  useEffect(() => {
    if (visibleDocuments.length === 0) {
      if (selectedDocumentId !== null) {
        setSelectedDocumentId(null)
      }
      return
    }

    if (!selectedDocumentId || !visibleDocuments.some((document) => document.document_id === selectedDocumentId)) {
      setSelectedDocumentId(visibleDocuments[0].document_id)
    }
  }, [selectedDocumentId, visibleDocuments])

  useEffect(() => {
    if (pendingUploadFolderId === undefined || controller.uploading) {
      return
    }

    if (controller.lastUploadedDocumentId) {
      assignDocumentToFolder(controller.lastUploadedDocumentId, pendingUploadFolderId)
      setSelectedDocumentId(controller.lastUploadedDocumentId)
    }
    setPendingUploadFolderId(undefined)
  }, [
    assignDocumentToFolder,
    controller.lastUploadedDocumentId,
    controller.uploading,
    pendingUploadFolderId,
  ])

  useEffect(() => {
    if (pendingImportFolderId === undefined || controller.gmailImporting) {
      return
    }

    if (controller.lastImportedDocumentIds.length > 0) {
      assignDocumentsToFolder(controller.lastImportedDocumentIds, pendingImportFolderId)
      setSelectedDocumentId(controller.lastImportedDocumentIds[0])
    }
    setPendingImportFolderId(undefined)
  }, [
    assignDocumentsToFolder,
    controller.gmailImporting,
    controller.lastImportedDocumentIds,
    pendingImportFolderId,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target) || event.altKey || event.shiftKey) {
        return
      }

      const modifierPressed = event.metaKey || event.ctrlKey
      if (!modifierPressed) {
        return
      }

      const normalizedKey = event.key.toLowerCase()
      if (normalizedKey === 'c' && activeCustomFolder) {
        event.preventDefault()
        setFolderClipboard({
          folderId: activeCustomFolder.id,
          folderName: activeCustomFolder.pathLabel,
        })
        setFolderActionError('')
        setFolderActionNotice(
          `Copied ${activeCustomFolder.pathLabel}. Paste duplicates the folder structure while files stay in their original folder.`,
        )
      }

      if (normalizedKey === 'v' && clipboardFolder) {
        event.preventDefault()
        const result = copyFolder(clipboardFolder.id, folderPasteTargetId)
        if (!result.ok) {
          setFolderActionError(result.error)
          setFolderActionNotice('')
          return
        }

        setFolderActionError('')
        setFolderActionNotice(
          `Pasted ${result.folder.name} into ${folderPasteTargetId ? folderNodeById[folderPasteTargetId]?.pathLabel ?? 'that folder' : 'Uploaded documents'}.`,
        )
        setUploadFolderId(result.folder.id)
        setActiveLocation({
          scope: 'folder',
          key: result.folder.id,
        })
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [activeCustomFolder, clipboardFolder, copyFolder, folderNodeById, folderPasteTargetId])

  function handleSelectDocument(documentId: string) {
    setSelectedDocumentId(documentId)
  }

  function handleSelectCollection(collectionKey: DocumentLibraryCollectionKey) {
    setActiveLocation({
      scope: 'collection',
      key: collectionKey,
    })
  }

  function handleSelectCustomFolder(folderId: string) {
    setActiveLocation({
      scope: 'folder',
      key: folderId,
    })
  }

  function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = createFolder(folderDraftName, activeCustomFolder?.id ?? null)
    if (!result.ok) {
      setFolderDraftError(result.error)
      return
    }

    setFolderDraftName('')
    setFolderDraftError('')
    setFolderActionError('')
    setFolderActionNotice(`Created ${result.folder.name}.`)
    setShowFolderComposer(false)
    setUploadFolderId(result.folder.id)
    handleSelectCustomFolder(result.folder.id)
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    setPendingUploadFolderId(uploadFolderId || null)
    await controller.handleSubmit(event)
  }

  async function handleImportGmailInbox() {
    setPendingImportFolderId(uploadFolderId || null)
    await controller.handleImportGmailInbox()
  }

  function folderDropTargetKey(folderId: string | null): string {
    return folderId ?? LIBRARY_ROOT_DROP_TARGET_KEY
  }

  function canMoveFolderToTarget(parentFolderId: string | null): boolean {
    if (!draggingFolderId) {
      return false
    }

    if (parentFolderId === draggingFolderId) {
      return false
    }

    if (parentFolderId && draggingFolderDescendantIds?.has(parentFolderId)) {
      return false
    }

    return true
  }

  function handleFileDragStart(
    event: ReactDragEvent<HTMLElement>,
    documentId: string,
  ) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(LIBRARY_DOCUMENT_DRAG_MIME, documentId)
    event.dataTransfer.setData('text/plain', documentId)
    setDraggingDocumentId(documentId)
    setSelectedDocumentId(documentId)
  }

  function handleFileDragEnd() {
    setDraggingDocumentId(null)
    setDocumentDragOverTargetKey(null)
  }

  function handleFolderDragStart(
    event: ReactDragEvent<HTMLElement>,
    folderId: string,
  ) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(LIBRARY_FOLDER_DRAG_MIME, folderId)
    event.dataTransfer.setData('text/plain', folderId)
    setDraggingFolderId(folderId)
    setFolderActionError('')
    setFolderActionNotice('')
    handleSelectCustomFolder(folderId)
  }

  function handleFolderDragEnd() {
    setDraggingFolderId(null)
    setFolderDragOverTargetKey(null)
  }

  function handleLibraryTargetDragOver(
    event: ReactDragEvent<HTMLElement>,
    folderId: string | null,
  ) {
    if (draggingDocumentId) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDocumentDragOverTargetKey(folderDropTargetKey(folderId))
      return
    }

    if (!canMoveFolderToTarget(folderId)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setFolderDragOverTargetKey(folderDropTargetKey(folderId))
  }

  function handleLibraryTargetDragLeave(folderId: string | null) {
    const targetKey = folderDropTargetKey(folderId)
    setDocumentDragOverTargetKey((current) => (current === targetKey ? null : current))
    setFolderDragOverTargetKey((current) => (current === targetKey ? null : current))
  }

  function handleLibraryTargetDrop(
    event: ReactDragEvent<HTMLElement>,
    folderId: string | null,
  ) {
    event.preventDefault()

    const droppedDocumentId =
      event.dataTransfer.getData(LIBRARY_DOCUMENT_DRAG_MIME) || draggingDocumentId
    if (droppedDocumentId) {
      assignDocumentToFolder(droppedDocumentId, folderId)
      setSelectedDocumentId(droppedDocumentId)
      setDraggingDocumentId(null)
      setDocumentDragOverTargetKey(null)
      setFolderActionError('')
      setFolderActionNotice('')
      if (folderId) {
        handleSelectCustomFolder(folderId)
        return
      }
      handleSelectCollection(rootCollection.key)
      return
    }

    const droppedFolderId =
      event.dataTransfer.getData(LIBRARY_FOLDER_DRAG_MIME) || draggingFolderId
    if (!droppedFolderId || !canMoveFolderToTarget(folderId)) {
      return
    }

    const result = moveFolder(droppedFolderId, folderId)
    setDraggingFolderId(null)
    setFolderDragOverTargetKey(null)

    if (!result.ok) {
      setFolderActionError(result.error)
      setFolderActionNotice('')
      return
    }

    setFolderActionError('')
    setFolderActionNotice(
      `Moved ${result.folder.name} to ${folderId ? folderNodeById[folderId]?.pathLabel ?? 'that folder' : 'Uploaded documents'}.`,
    )
    setUploadFolderId(result.folder.id)
    handleSelectCustomFolder(result.folder.id)
  }

  function handleCopyFolderSelection() {
    if (!activeCustomFolder) {
      return
    }

    setFolderClipboard({
      folderId: activeCustomFolder.id,
      folderName: activeCustomFolder.pathLabel,
    })
    setFolderActionError('')
    setFolderActionNotice(
      `Copied ${activeCustomFolder.pathLabel}. Paste duplicates the folder structure while files stay in their original folder.`,
    )
  }

  function handlePasteFolderSelection() {
    if (!clipboardFolder) {
      return
    }

    const result = copyFolder(clipboardFolder.id, folderPasteTargetId)
    if (!result.ok) {
      setFolderActionError(result.error)
      setFolderActionNotice('')
      return
    }

    setFolderActionError('')
    setFolderActionNotice(
      `Pasted ${result.folder.name} into ${folderPasteTargetId ? folderNodeById[folderPasteTargetId]?.pathLabel ?? 'that folder' : 'Uploaded documents'}.`,
    )
    setUploadFolderId(result.folder.id)
    handleSelectCustomFolder(result.folder.id)
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
                activeLocation.scope === 'collection' && activeLocation.key === rootCollection.key
                  ? ' is-active'
                  : ''
              }${
                documentDragOverTargetKey === LIBRARY_ROOT_DROP_TARGET_KEY ||
                folderDragOverTargetKey === LIBRARY_ROOT_DROP_TARGET_KEY
                  ? ' is-drop-target'
                  : ''
              }`}
              onDragOver={(event) => handleLibraryTargetDragOver(event, null)}
              onDragLeave={() => handleLibraryTargetDragLeave(null)}
              onDrop={(event) => handleLibraryTargetDrop(event, null)}
              aria-dropeffect={draggingDocumentId || draggingFolderId ? 'move' : undefined}
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
          <div className="library-sidebar-section-head library-sidebar-section-head-actions">
            <span className="eyebrow">Folders</span>
            <div className="library-sidebar-section-head-meta">
              <small>{customFolders.length}</small>
            </div>
          </div>

          <div className="library-folder-management">
            <div className="library-folder-management-actions">
              <button
                type="button"
                className="button button-ghost library-sidebar-inline-action"
                onClick={handleCopyFolderSelection}
                disabled={!activeCustomFolder}
              >
                Copy Folder
              </button>
              <button
                type="button"
                className="button button-ghost library-sidebar-inline-action"
                onClick={handlePasteFolderSelection}
                disabled={!clipboardFolder}
              >
                {folderPasteActionLabel}
              </button>
              <button
                type="button"
                className="button button-ghost library-sidebar-inline-action"
                onClick={() => {
                  setShowFolderComposer((current) => !current)
                  setFolderDraftError('')
                  setFolderActionError('')
                }}
              >
                {showFolderComposer ? 'Cancel' : 'New Folder'}
              </button>
            </div>

            {folderActionNotice ? (
              <p className="form-note">{folderActionNotice}</p>
            ) : clipboardFolder ? (
              <p className="form-note">
                Clipboard: {clipboardFolder.pathLabel}. Use {folderPasteActionLabel.toLowerCase()} or
                press {folderShortcutModifierLabel}+V.
              </p>
            ) : null}

            {folderActionError ? <p className="field-error">{folderActionError}</p> : null}
          </div>

          {showFolderComposer ? (
            <form className="library-folder-composer" onSubmit={handleCreateFolder}>
              <p className="form-note">
                {activeCustomFolder
                  ? `Create inside ${activeCustomFolder.pathLabel}.`
                  : 'Create a top-level folder in the library rail.'}
              </p>
              <label className="library-upload-field">
                <span>Folder Name</span>
                <input
                  className="control"
                  type="text"
                  value={folderDraftName}
                  placeholder="Examples: Letters of Credit"
                  onChange={(event) => {
                    setFolderDraftName(event.target.value)
                    if (folderDraftError) {
                      setFolderDraftError('')
                    }
                  }}
                />
              </label>

              <div className="library-folder-composer-actions">
                <button type="submit" className="button button-primary">
                  Create Folder
                </button>
              </div>

              {folderDraftError ? <p className="field-error">{folderDraftError}</p> : null}
            </form>
          ) : null}

          <div className="library-folder-list">
            {customFolders.length === 0 ? (
              <div className="library-sidebar-empty-card">
                <strong>No folders yet</strong>
                <p>Create a folder to organize uploaded documents beyond the built-in workflow views.</p>
              </div>
            ) : (
              folderTree.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`library-folder-button${
                    activeCustomFolder?.id === folder.id ? ' is-active' : ''
                  }${
                    documentDragOverTargetKey === folder.id || folderDragOverTargetKey === folder.id
                      ? ' is-drop-target'
                      : ''
                  }${draggingFolderId === folder.id ? ' is-dragging' : ''}`}
                  style={
                    {
                      '--library-folder-depth': `${folder.depth}`,
                    } as CSSProperties
                  }
                  draggable
                  onDragStart={(event) => handleFolderDragStart(event, folder.id)}
                  onDragEnd={handleFolderDragEnd}
                  onDragOver={(event) => handleLibraryTargetDragOver(event, folder.id)}
                  onDragLeave={() => handleLibraryTargetDragLeave(folder.id)}
                  onDrop={(event) => handleLibraryTargetDrop(event, folder.id)}
                  aria-dropeffect={draggingDocumentId || draggingFolderId ? 'move' : undefined}
                  aria-grabbed={draggingFolderId === folder.id ? true : undefined}
                  onClick={() => handleSelectCustomFolder(folder.id)}
                >
                  <span className="library-folder-icon" aria-hidden="true" />
                  <div className="library-folder-copy">
                    <strong>{folder.name}</strong>
                    <small>
                      {folderCounts[folder.id] ?? 0} uploaded file
                      {(folderCounts[folder.id] ?? 0) === 1 ? '' : 's'}
                    </small>
                  </div>
                  <span className="library-folder-count">{folderCounts[folder.id] ?? 0}</span>
                </button>
              ))
            )}
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
                  activeLocation.scope === 'collection' && activeLocation.key === collection.key
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
              className={`library-folder-button${selectedKindFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setSelectedKindFilter('all')}
            >
              <span className="library-folder-icon library-folder-icon-outline" aria-hidden="true" />
              <div className="library-folder-copy">
                <strong>All Types</strong>
                <small>Show every document family in the selected folder.</small>
              </div>
              <span className="library-folder-count">{scopedDocuments.length}</span>
            </button>
            {kindFolders.map((folder) => (
              <button
                key={folder.label}
                type="button"
                className={`library-folder-button${selectedKindFilter === folder.label ? ' is-active' : ''}`}
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
              {activeLocation.scope === 'folder'
                ? activeFolderPath.map((folder) => (
                    <span key={folder.id} className="library-breadcrumb-cluster">
                      <span className="library-breadcrumb-separator">/</span>
                      <button
                        type="button"
                        className={`library-breadcrumb-button${
                          activeCustomFolder?.id === folder.id ? ' is-active' : ''
                        }`}
                        onClick={() => handleSelectCustomFolder(folder.id)}
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))
                : (
                    <>
                      <span className="library-breadcrumb-separator">/</span>
                      <span>{activeLocationLabel}</span>
                    </>
                  )}
              {selectedKindFilter !== 'all' ? (
                <>
                  <span className="library-breadcrumb-separator">/</span>
                  <strong>{selectedKindFilter}</strong>
                </>
              ) : null}
            </div>

            <div className="library-toolbar-actions">
              {customFolders.length > 0 ? (
                <label className="library-selected-folder-field">
                  <span>Move selected</span>
                  <select
                    className="control"
                    value={selectedDocumentFolderId}
                    onChange={(event) =>
                      selectedDocument
                        ? assignDocumentToFolder(
                            selectedDocument.document_id,
                            event.target.value || null,
                          )
                        : undefined
                    }
                    disabled={!selectedDocument}
                  >
                    <option value="">Unfiled</option>
                    {folderTree.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.pathLabel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
            <span>{formatBytes(visibleStoredBytes)} in this folder</span>
            <span>{scopedCollectionCounts.ready} ready to verify</span>
            <span>{scopedCollectionCounts.errors} need attention</span>
            {controller.loading ? <span>Syncing library…</span> : null}
            {controller.loadError ? <span className="field-error">{controller.loadError}</span> : null}
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
                    Files land in `{uploadFolder?.pathLabel ?? 'Uploaded documents'}` and can be kept
                    organized from the moment they arrive.
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
                        controller.isDragActive ? 'is-active' : '',
                        controller.selectedFile ? 'has-file' : '',
                        controller.uploading ? 'is-disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="button"
                      tabIndex={controller.uploading ? -1 : 0}
                      aria-disabled={controller.uploading}
                      aria-label="Drop a PDF here or click to browse"
                      onClick={controller.openFilePicker}
                      onKeyDown={controller.handleDropzoneKeyDown}
                      onDragEnter={controller.handleDropzoneDragEnter}
                      onDragOver={controller.handleDropzoneDragOver}
                      onDragLeave={controller.handleDropzoneDragLeave}
                      onDrop={controller.handleDropzoneDrop}
                    >
                      <input
                        ref={controller.fileInputRef}
                        className="document-dropzone-input"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => controller.updateSelectedFile(event.target.files?.[0] ?? null)}
                        disabled={controller.uploading}
                      />
                      <span className="eyebrow">PDF</span>
                      <strong>{controller.selectedFile ? controller.selectedFile.name : 'Drop PDF or Choose File'}</strong>
                      <p>
                        {controller.selectedFile
                          ? `${formatBytes(controller.selectedFile.size)} ready for upload`
                          : 'Add one document at a time to the uploaded documents library.'}
                      </p>
                    </div>

                    <label className="library-upload-field">
                      <span>Display Name</span>
                      <input
                        className="control"
                        type="text"
                        value={controller.displayName}
                        placeholder="Optional desk-friendly label"
                        onChange={(event) => controller.setDisplayName(event.target.value)}
                        disabled={controller.uploading}
                      />
                    </label>

                    {shouldShowProviderSelector ? (
                      <label className="library-upload-field">
                        <span>Processing API</span>
                        <select
                          className="control"
                          value={controller.selectedProcessorProvider}
                          onChange={(event) =>
                            controller.setSelectedProcessorProvider(
                              event.target.value as 'builtin' | 'openai' | 'anthropic' | 'google' | '',
                            )
                          }
                          disabled={controller.uploading}
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

                    {controller.selectedProcessorProvider !== 'builtin' && selectedProviderModels.length > 0 ? (
                      <label className="library-upload-field">
                        <span>Processing Model</span>
                        <select
                          className="control"
                          value={controller.selectedProcessorModel}
                          onChange={(event) => controller.setSelectedProcessorModel(event.target.value)}
                          disabled={controller.uploading}
                        >
                          {selectedProviderModels.map((modelOption) => (
                            <option key={modelOption} value={modelOption}>
                              {modelOption}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label className="library-upload-field">
                      <span>Destination Folder</span>
                      <select
                        className="control"
                        value={uploadFolderId}
                        onChange={(event) => setUploadFolderId(event.target.value)}
                        disabled={controller.uploading || controller.gmailImporting}
                      >
                        <option value="">Unfiled in Library</option>
                        {folderTree.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.pathLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="library-upload-inline-actions">
                    <div className="library-upload-inline-buttons">
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={controller.uploading || !controller.selectedFile}
                      >
                        {controller.uploading ? 'Uploading…' : 'Upload PDF'}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void handleImportGmailInbox()}
                        disabled={controller.uploading || controller.gmailImporting || !gmailConfigured}
                      >
                        {controller.gmailImporting ? 'Importing Gmail…' : 'Import Gmail PDFs'}
                      </button>
                      {controller.selectedFile ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => controller.updateSelectedFile(null)}
                          disabled={controller.uploading}
                        >
                          Clear File
                        </button>
                      ) : null}
                    </div>

                    <p className="library-upload-note">
                      {controller.selectedProcessorProvider === 'builtin'
                        ? 'Built-in parsing only will run for this upload.'
                        : selectedProvider
                          ? `${selectedProvider.label}${controller.selectedProcessorModel ? ` (${controller.selectedProcessorModel})` : ''} will handle document analysis.`
                          : 'The built-in parser will be used until an external provider is configured.'}
                      {unconfiguredProviders.length > 0
                        ? ` ${placeholderProviderLabels} placeholder${unconfiguredProviders.length === 1 ? ' is' : 's are'} visible here and will unlock once those API providers are configured.`
                        : ''}
                    </p>
                  </div>

                  {controller.uploadError ? <p className="field-error">{controller.uploadError}</p> : null}
                  {controller.gmailImportError ? <p className="field-error">{controller.gmailImportError}</p> : null}
                  {controller.gmailImportSummary ? <p className="form-note">{controller.gmailImportSummary}</p> : null}
                </form>
              </>
            ) : null}
          </div>
        </article>

        <section className="library-browser-main surface">
            {visibleDocuments.length === 0 ? (
              <div className="empty-state library-empty-state">
                <strong>{documents.length === 0 ? 'No uploaded documents yet' : 'No files match this folder'}</strong>
                <p>
                  {documents.length === 0
                    ? 'Open the uploader card to add the first PDF into the library.'
                    : activeLocation.scope === 'folder'
                      ? 'Move a file into this folder or open the uploader card to add one here.'
                      : 'Try another folder, clear the search box, or change the type filter.'}
                </p>
              </div>
            ) : viewMode === 'list' ? (
              <div className="library-file-table" role="list">
                <div className="library-file-table-head" aria-hidden="true">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Folder</span>
                  <span>Review</span>
                  <span>Owner</span>
                  <span>Modified</span>
                  <span>Size</span>
                </div>
                <div className="library-file-table-body">
                  {visibleDocuments.map((document) => (
                    <button
                      key={document.document_id}
                      type="button"
                      role="listitem"
                      className={`library-file-row${selectedDocumentId === document.document_id ? ' is-selected' : ''}${
                        draggingDocumentId === document.document_id ? ' is-dragging' : ''
                      }`}
                      draggable
                      onDragStart={(event) => handleFileDragStart(event, document.document_id)}
                      onDragEnd={handleFileDragEnd}
                      onClick={() => handleSelectDocument(document.document_id)}
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
                      <span>{dominantDocumentKind(document)}</span>
                      <span>{folderNameById[folderAssignments[document.document_id] ?? ''] ?? '—'}</span>
                      <span>
                        <span className={`status-pill status-pill-${documentStatusTone(document.status)}`}>
                          {fileStatusSummary(document)}
                        </span>
                      </span>
                      <span>{ownerLabel(document)}</span>
                      <span>{formatDate(document.updated_at)}</span>
                      <span>{formatBytes(document.size_bytes)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="library-document-grid">
                {visibleDocuments.map((document) => (
                  <button
                    key={document.document_id}
                    type="button"
                    className={`library-document-card${selectedDocumentId === document.document_id ? ' is-selected' : ''}${
                      draggingDocumentId === document.document_id ? ' is-dragging' : ''
                    }`}
                    draggable
                    onDragStart={(event) => handleFileDragStart(event, document.document_id)}
                    onDragEnd={handleFileDragEnd}
                    onClick={() => handleSelectDocument(document.document_id)}
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
                      {folderAssignments[document.document_id] ? (
                        <span className="entity-chip entity-chip-soft">
                          {folderNameById[folderAssignments[document.document_id] ?? '']}
                        </span>
                      ) : null}
                      <span className="entity-chip entity-chip-soft">{formatBytes(document.size_bytes)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </section>
      </div>
    </div>
  )
}
