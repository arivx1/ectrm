import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
} from 'react'

import {
  attachSelectedDocumentRecordCandidate,
  executeDocumentActionPlan,
  executeDocumentWorkflow,
  fetchDocumentSource,
  listDocumentWorkflows,
  stageDocumentActionApprovalRequest,
  stageSelectedDocumentRecordCandidateApprovalRequest,
} from '../../entities/documents/api'
import { DocumentFacetEditor } from '../../features/documents/DocumentFacetEditor'
import {
  activeDocumentFacetValues,
  documentFacetDisplayValues,
  documentNeedsProcessing,
  documentStatusTone,
  dominantDocumentKind,
  dominantDocumentKindCode,
  formatDocumentFacetLabel,
  formatDocumentKindLabel,
  formatBytes,
  pageClassificationCorrected,
  pageLearningApplied,
  pageLearningExampleCount,
  pageProcessorTrace,
  pageSystemClassification,
  pageTextSourceLabel,
  pageTextSourceTone,
  processorLabel,
  reviewReady,
  reviewedPageCount,
} from '../../features/documents/documentIngestionUtils'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'
import { appConfig } from '../../shared/config'
import type {
  DocumentActionRecordRefRecord,
  DocumentFacetAssignmentRecord,
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentLinkageCandidateRecord,
  DocumentWorkflowExecutionRecord,
  DocumentWorkflowListRecord,
  DocumentWorkflowRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildDocumentLibraryCollectionCounts,
  canRequestDocumentActionApproval,
  canExecuteDocumentActionPlanWorkflow,
  canExecuteWorkflowAction,
  documentCanBeVerified,
  documentHasErrors,
  documentHasExecutedWorkflows,
  documentIsLinked,
  DOCUMENT_LIBRARY_COLLECTIONS,
  filterDocumentLibraryDocuments,
  formatDocumentLibraryLabel,
  sortDocumentLibraryKindOptions,
  workflowActionButtonLabel,
  workflowDisabledReason,
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

type LibraryDocumentActivityEntry = {
  key: string
  label: string
  detail: string
  timestamp: string | null | undefined
}

const LIBRARY_UPLOAD_CARD_PANEL_ID = 'library-upload-card-panel'
const LIBRARY_DOCUMENT_LIST_CARD_PANEL_ID = 'library-document-list-card-panel'
const LIBRARY_FILE_COLUMNS = [
  { key: 'name', label: 'Name', minWidth: 240, defaultWidth: 320 },
  { key: 'type', label: 'Type', minWidth: 150, defaultWidth: 180 },
  { key: 'tags', label: 'Tags', minWidth: 210, defaultWidth: 260 },
  { key: 'review', label: 'Review', minWidth: 130, defaultWidth: 160 },
  { key: 'owner', label: 'Owner', minWidth: 130, defaultWidth: 160 },
  { key: 'modified', label: 'Modified', minWidth: 120, defaultWidth: 140 },
  { key: 'size', label: 'Size', minWidth: 88, defaultWidth: 104 },
  { key: 'actions', label: 'Actions', minWidth: 340, defaultWidth: 380 },
] as const
const LIBRARY_TAG_PREVIEW_LIMIT = 5

type LibraryFileColumn = (typeof LIBRARY_FILE_COLUMNS)[number]
type LibraryFileColumnKey = (typeof LIBRARY_FILE_COLUMNS)[number]['key']
type LibraryFileColumnWidths = Partial<Record<LibraryFileColumnKey, number>>

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

function formatWorkflowValue(value: string | null | undefined, fallback = 'None'): string {
  const cleaned = value?.trim()
  if (!cleaned) {
    return fallback
  }
  return cleaned
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase())
}

function formatWorkflowPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0%'
  }
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

function workflowStatusTone(status: string | null | undefined): string {
  switch ((status ?? '').trim().toUpperCase()) {
    case 'READY':
    case 'ATTACH_READY':
    case 'AUTO_EXECUTION_ELIGIBLE':
      return 'active'
    case 'REVIEW':
    case 'ATTACH_REVIEW':
    case 'CREATE_CANDIDATE':
    case 'HUMAN_CONFIRMATION_REQUIRED':
      return 'in-progress'
    case 'BLOCKED':
    case 'OWNER_REQUIRED':
    case 'MANUAL_REVIEW':
    case 'MANUAL_REVIEW_REQUIRED':
      return 'blocked'
    case 'EXECUTED':
    case 'ALREADY_LINKED':
    case 'ALREADY_APPLIED':
      return 'shipped'
    default:
      return 'planned'
  }
}

function workflowRecordLabel(record: DocumentActionRecordRefRecord | null | undefined): string {
  if (!record) {
    return 'Not resolved'
  }
  const typeLabel = formatWorkflowValue(record.record_type)
  const idLabel = record.record_id ? ` ${record.record_id}` : ''
  return `${typeLabel}${idLabel} • ${record.record_label}`
}

function workflowCandidateLabel(candidate: DocumentLinkageCandidateRecord): string {
  const stateLabel = formatWorkflowValue(candidate.candidate_state)
  const scoreLabel = formatWorkflowPercent(candidate.score)
  return `${candidate.record_label} • ${stateLabel} • ${scoreLabel}`
}

function workflowCandidateKey(candidate: DocumentLinkageCandidateRecord): string {
  return `${candidate.record_type}:${candidate.record_id ?? candidate.record_label}`
}

function canAttachSelectedWorkflowCandidate(candidate: DocumentLinkageCandidateRecord): boolean {
  return (
    candidate.existing_record &&
    Boolean(candidate.record_id) &&
    candidate.candidate_state === 'ATTACH_READY' &&
    candidate.score >= 0.9
  )
}

function canRequestSelectedWorkflowCandidateApproval(candidate: DocumentLinkageCandidateRecord): boolean {
  return (
    (candidate.existing_record &&
      Boolean(candidate.record_id) &&
      candidate.candidate_state !== 'ALREADY_LINKED') ||
    (!candidate.existing_record &&
      candidate.create_if_missing &&
      candidate.candidate_state === 'CREATE_CANDIDATE')
  )
}

function selectedWorkflowCandidateActionLabel(candidate: DocumentLinkageCandidateRecord): string {
  if (canAttachSelectedWorkflowCandidate(candidate)) {
    return 'Attach Selected'
  }
  if (!candidate.existing_record && candidate.create_if_missing) {
    return 'Create Via Approval'
  }
  return 'Request Approval'
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
  const backendEntries: LibraryDocumentActivityEntry[] = (document.activity ?? []).map((entry) => ({
    key: entry.activity_id,
    label: entry.label,
    detail: entry.detail,
    timestamp: entry.occurred_at,
  }))
  if (backendEntries.length > 0) {
    const supplementalEntries = buildSupplementalDocumentActivityLog(document, backendEntries)
    return [...backendEntries, ...supplementalEntries].sort((left, right) => {
      const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0
      const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0
      return rightTime - leftTime
    })
  }

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

function buildSupplementalDocumentActivityLog(
  document: DocumentIngestionRecord,
  backendEntries: LibraryDocumentActivityEntry[],
): LibraryDocumentActivityEntry[] {
  const entries: LibraryDocumentActivityEntry[] = []
  const hasBackendEventAtUpdated = backendEntries.some((entry) => sameTimestamp(entry.timestamp, document.updated_at))

  if (document.reviewed_at && !backendEntries.some((entry) => entry.label === 'Review Updated')) {
    entries.push({
      key: 'reviewed',
      label: 'Reviewed',
      detail: `${document.reviewed_by || 'system'} marked the file ${formatDocumentLibraryLabel(document.review_status)}.`,
      timestamp: document.reviewed_at,
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

  if (!backendEntries.some((entry) => entry.label === 'Processing Failed')) {
    document.processing_errors.forEach((error, index) => {
      entries.push({
        key: `error-${index}`,
        label: 'Needs Attention',
        detail: error,
        timestamp: document.updated_at,
      })
    })
  }

  if (!sameTimestamp(document.created_at, document.updated_at) && !hasBackendEventAtUpdated) {
    entries.push({
      key: 'updated',
      label: 'Updated',
      detail: `${document.updated_by || 'system'} updated the file record.`,
      timestamp: document.updated_at,
    })
  }

  return entries
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

type LibraryTagChipListProps = {
  values: DocumentFacetAssignmentRecord[]
  limit?: number
  emptyLabel?: string
  showFacetLabel?: boolean
  compact?: boolean
}

function LibraryTagChipList({
  values,
  limit,
  emptyLabel = 'No tags',
  showFacetLabel = false,
  compact = false,
}: LibraryTagChipListProps) {
  const visibleValues = typeof limit === 'number' ? values.slice(0, limit) : values
  const hiddenCount = Math.max(values.length - visibleValues.length, 0)

  if (values.length === 0) {
    return <span className="library-tag-empty">{emptyLabel}</span>
  }

  return (
    <div className={`library-tag-chip-row${compact ? ' library-tag-chip-row-compact' : ''}`}>
      {visibleValues.map((value) => (
        <span
          key={`${value.page_id ?? 'document'}-${value.facet_key}-${value.value_code}`}
          className={`entity-chip entity-chip-soft library-tag-chip document-facet-chip-${value.review_status.toLowerCase()}`}
          title={`${formatDocumentFacetLabel(value)} / ${formatDocumentLibraryLabel(value.review_status)}`}
        >
          {showFacetLabel ? formatDocumentFacetLabel(value) : value.value_label}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="entity-chip entity-chip-soft library-tag-chip library-tag-overflow">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  )
}

function formatClassificationConfidence(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}% confidence` : 'No confidence'
}

function formatPageClassificationLabel(
  documentKind: string | null | undefined,
  documentSubtype: string | null | undefined = null,
): string {
  const kindLabel = formatDocumentKindLabel(documentKind || 'UNKNOWN')
  return documentSubtype?.trim() ? `${kindLabel} / ${documentSubtype.trim()}` : kindLabel
}

function formatClassificationSourceLabel(value: string | null | undefined): string {
  const normalized = value?.trim()
  if (!normalized) {
    return 'System Evidence'
  }
  if (normalized.startsWith('processor:')) {
    return `${formatDocumentLibraryLabel(normalized.slice('processor:'.length))} Processor`
  }
  return formatDocumentLibraryLabel(normalized.replaceAll(':', '_'))
}

function buildPageClassificationSummary(page: DocumentIngestionPageRecord): string {
  const deterministicAssessment = page.understanding.deterministic_assessment
  const deterministicLabel = formatPageClassificationLabel(
    deterministicAssessment.document_kind,
    deterministicAssessment.document_subtype,
  )
  const finalLabel = formatPageClassificationLabel(page.document_kind, page.document_subtype)
  const systemClassification = pageSystemClassification(page)
  const sourceLabel = formatClassificationSourceLabel(systemClassification.source)
  const confidence = deterministicAssessment.confidence ?? page.classification_confidence

  if (pageClassificationCorrected(page)) {
    return `A reviewer changed this page from ${formatPageClassificationLabel(
      systemClassification.documentKind,
      systemClassification.documentSubtype,
    )} to ${finalLabel}. The saved correction is now visible as review provenance for this page.`
  }

  if (pageLearningApplied(page)) {
    return `The page was classified as ${finalLabel} after matching ${pageLearningExampleCount(page)} reviewed example${
      pageLearningExampleCount(page) === 1 ? '' : 's'
    } with similar extracted content.`
  }

  if (deterministicAssessment.document_kind) {
    return `Deterministic scoring classified this page as ${deterministicLabel} with ${formatClassificationConfidence(
      confidence,
    ).toLowerCase()}.`
  }

  return `The system classified this page as ${finalLabel} from ${sourceLabel.toLowerCase()}.`
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
    systemAiConfidenceThresholdPercent,
    aiConfidenceThresholdOverridePercent,
    effectiveAiConfidenceThresholdPercent,
    gmailImporting,
    gmailImportError,
    gmailImportSummary,
    displayName,
    selectedProcessorProvider,
    selectedProcessorModel,
    selectedFile,
    isDragActive,
    expandedDocumentIds,
    pagePreviewUrls,
    pagePreviewLoading,
    pagePreviewErrors,
    clearPagePreviewsForDocument,
    fileInputRef,
    setDisplayName,
    setSelectedProcessorProvider,
    setSelectedProcessorModel,
    setAiConfidenceThresholdOverridePercent,
    updateSelectedFile,
    openFilePicker,
    handleDropzoneKeyDown,
    handleDropzoneDragEnter,
    handleDropzoneDragOver,
    handleDropzoneDragLeave,
    handleDropzoneDrop,
    handleSubmit,
    handleImportGmailInbox: importGmailInbox,
    updateDocumentDraft,
    updatePageDraft,
    handleSaveDocument,
    handleSavePage,
    handleVerifyDocument: verifyDocument,
    handleSetDocumentKind,
    handleReprocessDocument,
    toggleDocumentExpanded,
    saveErrors,
    savingTarget,
  } = useDocumentIngestionController({ authSession })
  const [viewMode, setViewMode] = useState<DocumentLibraryViewMode>('list')
  const [sortMode, setSortMode] = useState<DocumentLibrarySortMode>('updated')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [localActiveDocumentId, setLocalActiveDocumentId] = useState<string | null>(null)
  const [selectedDetailPageId, setSelectedDetailPageId] = useState<number | null>(null)
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [openDocumentError, setOpenDocumentError] = useState('')
  const [kindDraftByDocumentId, setKindDraftByDocumentId] = useState<Record<string, string>>({})
  const [fileColumnWidths, setFileColumnWidths] = useState<LibraryFileColumnWidths>({})
  const [fileTableScrollWidth, setFileTableScrollWidth] = useState(0)
  const [workflowDialogDocumentId, setWorkflowDialogDocumentId] = useState<string | null>(null)
  const [workflowList, setWorkflowList] = useState<DocumentWorkflowListRecord | null>(null)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState('')
  const [workflowExecution, setWorkflowExecution] = useState<DocumentWorkflowExecutionRecord | null>(null)
  const [workflowActionMessage, setWorkflowActionMessage] = useState('')
  const [executingWorkflowId, setExecutingWorkflowId] = useState<string | null>(null)
  const [selectedWorkflowCandidateKey, setSelectedWorkflowCandidateKey] = useState<string | null>(null)
  const [executedWorkflowDocumentIds, setExecutedWorkflowDocumentIds] = useState<Record<string, boolean>>({})
  const [pendingReprocessDocumentId, setPendingReprocessDocumentId] = useState<string | null>(null)
  const [editingTagScope, setEditingTagScope] = useState<'document' | 'page' | null>(null)
  const fileTableScrollRef = useRef<HTMLDivElement | null>(null)
  const fileTableScrollbarRef = useRef<HTMLDivElement | null>(null)
  const uploadCardState = usePersistentCollapsibleCardState('library.upload-card', false)
  const setUploadCardExpanded = uploadCardState.setExpanded
  const showUploadComposer = uploadCardState.expanded
  const documentListCardState = usePersistentCollapsibleCardState('library.document-list-card', false)
  const setDocumentListCardExpanded = documentListCardState.setExpanded
  const showDocumentList = documentListCardState.expanded
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const scopedDocuments = filterDocumentLibraryDocuments({
    documents,
    collectionKey: 'all',
    query: '',
    sortMode: 'updated',
  })
  const scopedCollectionCounts = buildDocumentLibraryCollectionCounts(scopedDocuments)
  const searchedDocuments = filterDocumentLibraryDocuments({
    documents,
    collectionKey: 'all',
    query: deferredSearchQuery,
    sortMode,
  })
  const visibleDocuments = searchedDocuments
  const visibleStoredBytes = visibleDocuments.reduce((sum, document) => sum + document.size_bytes, 0)
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
  const aiConfidenceThresholdIsOverride = aiConfidenceThresholdOverridePercent !== null
  const shouldShowAiThresholdControl = selectedProcessorProvider !== '' && selectedProcessorProvider !== 'builtin'
  const resolvedSelectedDocumentId =
    visibleDocuments.length === 0
      ? null
      : selectedDocumentId && visibleDocuments.some((document) => document.document_id === selectedDocumentId)
        ? selectedDocumentId
        : visibleDocuments[0]?.document_id ?? null
  const activeLocationLabel = DOCUMENT_LIBRARY_COLLECTIONS[0].label
  const documentPageActivity = documentPage
    ? buildDocumentActivityLog(documentPage)
    : []
  const documentPageDisplayFacetValues = documentPage ? documentFacetDisplayValues(documentPage) : []
  const documentPageLevelFacetValues = documentPage
    ? (documentPage.facet_values ?? []).filter((value) => value.page_id === null)
    : []
  const documentPageFacetCount = documentPageDisplayFacetValues.filter(
    (value) => value.review_status !== 'REJECTED',
  ).length
  const workflowDialogDocument = workflowDialogDocumentId
    ? documents.find((document) => document.document_id === workflowDialogDocumentId) ?? null
    : null
  const recommendedWorkflow =
    workflowList?.workflows.find((workflow) => workflow.recommended) ?? workflowList?.workflows[0] ?? null
  const workflowPrimaryCandidate = workflowList?.linkage_assessment?.candidates?.[0] ?? null
  const workflowExistingLinkCount = workflowList?.record_links?.length ?? 0
  const workflowPendingApprovalRequest = workflowList?.pending_approval_request ?? null
  const selectedWorkflowCandidate =
    workflowList?.linkage_assessment?.candidates.find(
      (candidate) => workflowCandidateKey(candidate) === selectedWorkflowCandidateKey,
    ) ?? null
  const pendingReprocessDocument = pendingReprocessDocumentId
    ? documents.find((document) => document.document_id === pendingReprocessDocumentId) ?? null
    : null
  const selectedDetailPage =
    documentPage?.pages.find((page) => page.page_id === selectedDetailPageId) ?? documentPage?.pages[0] ?? null
  const selectedDetailPagePreviewUrl = selectedDetailPage ? pagePreviewUrls[selectedDetailPage.page_id] ?? '' : ''
  const selectedDetailPagePreviewLoading = selectedDetailPage
    ? pagePreviewLoading[selectedDetailPage.page_id] === true
    : false
  const selectedDetailPagePreviewError = selectedDetailPage ? pagePreviewErrors[selectedDetailPage.page_id] ?? '' : ''
  const selectedDetailPageSystemClassification = selectedDetailPage ? pageSystemClassification(selectedDetailPage) : null
  const selectedDetailPageProcessorTrace = selectedDetailPage ? pageProcessorTrace(selectedDetailPage) : null
  const selectedDetailPageDeterministicAssessment = selectedDetailPage?.understanding.deterministic_assessment ?? null
  const selectedDetailPageDeterministicEvidence =
    selectedDetailPageDeterministicAssessment?.supporting_evidence.filter((value) => value.trim()) ?? []
  const selectedDetailPageDeterministicConflicts =
    selectedDetailPageDeterministicAssessment?.conflicts.filter((value) => value.trim()) ?? []
  const selectedDetailPageClassificationSummary = selectedDetailPage
    ? buildPageClassificationSummary(selectedDetailPage)
    : ''
  const selectedDetailPageFacetValues = selectedDetailPage
    ? activeDocumentFacetValues(selectedDetailPage.facet_values)
    : []
  const fileColumnTemplate = LIBRARY_FILE_COLUMNS.map(
    (column) => `${fileColumnWidths[column.key] ?? column.defaultWidth}px`,
  ).join(' ')
  const fileTableStyle = {
    '--library-file-table-columns': fileColumnTemplate,
  } as CSSProperties
  const emptyStateTitle = loadError
    ? 'Unable to load uploaded documents'
    : documents.length === 0
      ? 'No uploaded documents yet'
      : 'No files match this view'
  const emptyStateMessage = loadError
    ? loadError
    : documents.length === 0
      ? 'Open the uploader card to add the first PDF into the library.'
      : 'Try another workflow view, clear the search box, or change the type filter.'

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
    if (loadError) {
      setDocumentListCardExpanded(true)
    }
  }, [loadError, setDocumentListCardExpanded])

  useEffect(() => {
    if (documentPageId) {
      setSelectedDocumentId(documentPageId)
    }
  }, [documentPageId])

  useEffect(() => {
    setEditingTagScope(null)
  }, [documentPageId, selectedDetailPage?.page_id])

  useEffect(() => {
    if (!documentPageId || expandedDocumentIds[documentPageId]) {
      return
    }
    toggleDocumentExpanded(documentPageId)
  }, [documentPageId, expandedDocumentIds, toggleDocumentExpanded])

  useEffect(() => {
    if (!selectedWorkflowCandidateKey || !workflowList) {
      return
    }
    const candidateStillVisible = workflowList.linkage_assessment?.candidates.some(
      (candidate) => workflowCandidateKey(candidate) === selectedWorkflowCandidateKey,
    )
    if (!candidateStillVisible) {
      setSelectedWorkflowCandidateKey(null)
    }
  }, [selectedWorkflowCandidateKey, workflowList])

  useEffect(() => {
    if (!documentPage) {
      setSelectedDetailPageId(null)
      return
    }

    setSelectedDetailPageId((current) => {
      if (current && documentPage.pages.some((page) => page.page_id === current)) {
        return current
      }
      return documentPage.pages[0]?.page_id ?? null
    })
  }, [documentPage])

  useEffect(() => {
    if (!showDocumentList || viewMode !== 'list') {
      return undefined
    }

    const scrollContainer = fileTableScrollRef.current
    if (!scrollContainer) {
      return undefined
    }

    const updateScrollWidth = () => {
      setFileTableScrollWidth(scrollContainer.scrollWidth)
      if (fileTableScrollbarRef.current) {
        fileTableScrollbarRef.current.scrollLeft = scrollContainer.scrollLeft
      }
    }

    updateScrollWidth()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => updateScrollWidth())

    resizeObserver?.observe(scrollContainer)
    if (scrollContainer.firstElementChild) {
      resizeObserver?.observe(scrollContainer.firstElementChild)
    }
    window.addEventListener('resize', updateScrollWidth)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateScrollWidth)
    }
  }, [fileColumnTemplate, showDocumentList, viewMode, visibleDocuments.length])

  function handleOpenDocumentPage(documentId: string) {
    setSelectedDocumentId(documentId)
    setLocalActiveDocumentId(documentId)
    const targetDocument = documents.find((document) => document.document_id === documentId)
    setSelectedDetailPageId(targetDocument?.pages[0]?.page_id ?? null)
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

  function shouldWarnBeforeDocumentReprocess(document: DocumentIngestionRecord): boolean {
    return documentHasExecutedWorkflows(document) || executedWorkflowDocumentIds[document.document_id] === true
  }

  async function reprocessLibraryDocument(document: DocumentIngestionRecord) {
    setSelectedDocumentId(document.document_id)
    await handleReprocessDocument(document)
  }

  function handleLibraryDocumentReprocess(document: DocumentIngestionRecord) {
    setSelectedDocumentId(document.document_id)
    if (shouldWarnBeforeDocumentReprocess(document)) {
      setPendingReprocessDocumentId(document.document_id)
      return
    }

    void reprocessLibraryDocument(document)
  }

  function handleCancelDocumentReprocess() {
    setPendingReprocessDocumentId(null)
  }

  async function handleConfirmDocumentReprocess() {
    if (!pendingReprocessDocument) {
      setPendingReprocessDocumentId(null)
      return
    }

    const document = pendingReprocessDocument
    setPendingReprocessDocumentId(null)
    await reprocessLibraryDocument(document)
  }

  async function handleLibraryDocumentVerify(document: DocumentIngestionRecord) {
    if (!documentCanBeVerified(document)) {
      return
    }
    setSelectedDocumentId(document.document_id)
    await verifyDocument(document)
  }

  async function handleOpenWorkflowDialog(document: DocumentIngestionRecord) {
    setSelectedDocumentId(document.document_id)
    setWorkflowDialogDocumentId(document.document_id)
    setWorkflowList(null)
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    setSelectedWorkflowCandidateKey(null)
    setWorkflowError('')
    if (!authSession) {
      setWorkflowError('Sign in before opening document workflows.')
      return
    }

    setWorkflowLoading(true)
    try {
      const nextWorkflows = await listDocumentWorkflows(appConfig.apiBase, authSession, document.document_id)
      setWorkflowList(nextWorkflows)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to load document workflows.')
    } finally {
      setWorkflowLoading(false)
    }
  }

  function handleCloseWorkflowDialog() {
    setWorkflowDialogDocumentId(null)
    setWorkflowList(null)
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    setSelectedWorkflowCandidateKey(null)
    setWorkflowError('')
    setExecutingWorkflowId(null)
  }

  async function handleRequestWorkflowApproval(workflow: DocumentWorkflowRecord) {
    if (!authSession || !workflowDialogDocumentId) {
      setWorkflowError('Sign in before requesting document action approval.')
      return
    }

    const documentId = workflowDialogDocumentId
    setExecutingWorkflowId(workflow.workflow_id)
    setWorkflowError('')
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    try {
      const approvalRequest = await stageDocumentActionApprovalRequest(
        appConfig.apiBase,
        authSession,
        documentId,
        {
          request_comment: `Requested from Library workflow: ${workflow.label}`,
        },
      )
      setWorkflowActionMessage(`Approval request ${approvalRequest.request_id} is pending.`)
      const nextWorkflows = await listDocumentWorkflows(appConfig.apiBase, authSession, documentId)
      setWorkflowList(nextWorkflows)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to request document action approval.')
    } finally {
      setExecutingWorkflowId((current) =>
        current === workflow.workflow_id ? null : current,
      )
    }
  }

  async function handleAttachSelectedWorkflowCandidate(candidate: DocumentLinkageCandidateRecord) {
    if (!authSession || !workflowDialogDocumentId || !candidate.record_id) {
      setWorkflowError('Select a concrete record candidate before attaching.')
      return
    }

    const documentId = workflowDialogDocumentId
    const actionKey = `candidate:${workflowCandidateKey(candidate)}`
    setExecutingWorkflowId(actionKey)
    setWorkflowError('')
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    try {
      const updated = await attachSelectedDocumentRecordCandidate(
        appConfig.apiBase,
        authSession,
        documentId,
        {
          record_type: candidate.record_type,
          record_id: candidate.record_id,
        },
      )
      updateDocumentDraft(documentId, () => updated)
      setWorkflowActionMessage(`Attached document to ${candidate.record_label}.`)
      setExecutedWorkflowDocumentIds((current) => ({
        ...current,
        [documentId]: true,
      }))
      const nextWorkflows = await listDocumentWorkflows(appConfig.apiBase, authSession, documentId)
      setWorkflowList(nextWorkflows)
      setSelectedWorkflowCandidateKey(null)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to attach the selected record candidate.')
    } finally {
      setExecutingWorkflowId((current) => (current === actionKey ? null : current))
    }
  }

  async function handleRequestSelectedWorkflowCandidateApproval(candidate: DocumentLinkageCandidateRecord) {
    if (!authSession || !workflowDialogDocumentId) {
      setWorkflowError('Select a record candidate before requesting approval.')
      return
    }

    const documentId = workflowDialogDocumentId
    const actionKey = `candidate:${workflowCandidateKey(candidate)}`
    setExecutingWorkflowId(actionKey)
    setWorkflowError('')
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    try {
      const approvalRequest = await stageSelectedDocumentRecordCandidateApprovalRequest(
        appConfig.apiBase,
        authSession,
        documentId,
        {
          record_type: candidate.record_type,
          ...(candidate.record_id ? { record_id: candidate.record_id } : {}),
          request_comment: `Requested from Library candidate selection: ${candidate.record_label}`,
        },
      )
      setWorkflowActionMessage(`Approval request ${approvalRequest.request_id} is pending for ${candidate.record_label}.`)
      const nextWorkflows = await listDocumentWorkflows(appConfig.apiBase, authSession, documentId)
      setWorkflowList(nextWorkflows)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to request approval for the selected candidate.')
    } finally {
      setExecutingWorkflowId((current) => (current === actionKey ? null : current))
    }
  }

  async function handleExecuteActionPlanWorkflow(workflow: DocumentWorkflowRecord) {
    if (!authSession || !workflowDialogDocumentId) {
      setWorkflowError('Sign in before executing document workflows.')
      return
    }

    const documentId = workflowDialogDocumentId
    setExecutingWorkflowId(workflow.workflow_id)
    setWorkflowError('')
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    try {
      const updated = await executeDocumentActionPlan(
        appConfig.apiBase,
        authSession,
        documentId,
      )
      updateDocumentDraft(documentId, () => updated)
      setWorkflowActionMessage(`Attached document to ${workflow.target?.record_label ?? 'the selected record'}.`)
      setExecutedWorkflowDocumentIds((current) => ({
        ...current,
        [documentId]: true,
      }))
      const nextWorkflows = await listDocumentWorkflows(appConfig.apiBase, authSession, documentId)
      setWorkflowList(nextWorkflows)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to attach the document to the matched record.')
    } finally {
      setExecutingWorkflowId((current) =>
        current === workflow.workflow_id ? null : current,
      )
    }
  }

  async function handleExecuteWorkflow(workflow: DocumentWorkflowRecord) {
    if (canExecuteDocumentActionPlanWorkflow(workflow)) {
      await handleExecuteActionPlanWorkflow(workflow)
      return
    }

    if (!authSession || !workflowDialogDocumentId) {
      setWorkflowError('Sign in before executing document workflows.')
      return
    }

    setExecutingWorkflowId(workflow.workflow_id)
    setWorkflowError('')
    setWorkflowExecution(null)
    setWorkflowActionMessage('')
    try {
      const result = await executeDocumentWorkflow(
        appConfig.apiBase,
        authSession,
        workflowDialogDocumentId,
        workflow.workflow_id,
      )
      setWorkflowExecution(result)
      setExecutedWorkflowDocumentIds((current) => ({
        ...current,
        [result.document_id]: true,
      }))
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to execute the document workflow.')
    } finally {
      setExecutingWorkflowId((current) =>
        current === workflow.workflow_id ? null : current,
      )
    }
  }

  function handleFileTableScroll(event: ReactUIEvent<HTMLDivElement>) {
    const scrollbar = fileTableScrollbarRef.current
    if (!scrollbar || scrollbar.scrollLeft === event.currentTarget.scrollLeft) {
      return
    }

    scrollbar.scrollLeft = event.currentTarget.scrollLeft
  }

  function handleFileTableScrollbarScroll(event: ReactUIEvent<HTMLDivElement>) {
    const scrollContainer = fileTableScrollRef.current
    if (!scrollContainer || scrollContainer.scrollLeft === event.currentTarget.scrollLeft) {
      return
    }

    scrollContainer.scrollLeft = event.currentTarget.scrollLeft
  }

  function handleFileColumnResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    column: LibraryFileColumn,
  ) {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth =
      event.currentTarget.parentElement?.getBoundingClientRect().width ??
      fileColumnWidths[column.key] ??
      column.defaultWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(column.minWidth, Math.round(startWidth + moveEvent.clientX - startX))
      setFileColumnWidths((current) => ({
        ...current,
        [column.key]: nextWidth,
      }))
    }

    const handlePointerEnd = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
  }

  function handleFileColumnResizeKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    column: LibraryFileColumn,
  ) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const step = event.shiftKey ? 32 : 16
    const currentWidth =
      fileColumnWidths[column.key] ??
      event.currentTarget.parentElement?.getBoundingClientRect().width ??
      column.defaultWidth
    setFileColumnWidths((current) => ({
      ...current,
      [column.key]: Math.max(column.minWidth, Math.round(currentWidth + direction * step)),
    }))
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
                    {documentPage.review_status !== 'VERIFIED' ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={
                          !documentCanBeVerified(documentPage) ||
                          savingTarget === `document:${documentPage.document_id}`
                        }
                        onClick={() => void handleLibraryDocumentVerify(documentPage)}
                      >
                        {savingTarget === `document:${documentPage.document_id}` ? 'Verifying...' : 'Verify'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={
                        !documentPage.source_available ||
                        documentNeedsProcessing(documentPage) ||
                        savingTarget === `reprocess:${documentPage.document_id}`
                      }
                      onClick={() => handleLibraryDocumentReprocess(documentPage)}
                    >
                      {savingTarget === `reprocess:${documentPage.document_id}` ? 'Reprocessing...' : 'Reprocess'}
                    </button>
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
                {saveErrors[`reprocess:${documentPage.document_id}`] ? (
                  <p className="field-error">{saveErrors[`reprocess:${documentPage.document_id}`]}</p>
                ) : null}
                {saveErrors[`document:${documentPage.document_id}`] ? (
                  <p className="field-error">{saveErrors[`document:${documentPage.document_id}`]}</p>
                ) : null}

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

                <section className="library-document-page-section library-document-tags-section">
                  <div className="library-section-head">
                    <span className="eyebrow">Tags</span>
                    <small>
                      {documentPageFacetCount} tag{documentPageFacetCount === 1 ? '' : 's'}
                    </small>
                  </div>
                  <div className="library-document-tags-summary">
                    <LibraryTagChipList
                      values={documentPageDisplayFacetValues}
                      emptyLabel="No tags assigned yet"
                      showFacetLabel
                    />
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        setEditingTagScope((current) => current === 'document' ? null : 'document')
                      }
                    >
                      {editingTagScope === 'document' ? 'Close Tag Editor' : 'Edit Document Tags'}
                    </button>
                  </div>
                  {editingTagScope === 'document' ? (
                    <div className="library-document-tag-editor">
                      <DocumentFacetEditor
                        documentId={documentPage.document_id}
                        pageId={null}
                        title="Document Tags"
                        values={documentPageLevelFacetValues}
                        facetSchemas={schemaRegistry?.document_facets}
                        onChange={(nextValues) =>
                          updateDocumentDraft(documentPage.document_id, (current) => ({
                            ...current,
                            facet_values: [
                              ...(current.facet_values ?? []).filter((value) => value.page_id !== null),
                              ...nextValues,
                            ],
                          }))
                        }
                      />
                      <div className="library-document-tags-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={savingTarget === `document:${documentPage.document_id}`}
                          onClick={() => void handleSaveDocument(documentPage)}
                        >
                          {savingTarget === `document:${documentPage.document_id}` ? 'Saving Tags...' : 'Save Tags'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="library-document-page-section library-document-pages-section">
                  <div className="library-section-head">
                    <span className="eyebrow">Pages</span>
                    <small>{documentPage.pages.length} page{documentPage.pages.length === 1 ? '' : 's'}</small>
                  </div>

                  {documentPage.pages.length > 0 ? (
                    <div className="library-document-pages-layout">
                      <div className="library-document-page-list" role="list" aria-label="Document pages">
                        {documentPage.pages.map((page) => {
                          const isSelected = selectedDetailPage?.page_id === page.page_id
                          const confidence =
                            typeof page.classification_confidence === 'number'
                              ? `${Math.round(page.classification_confidence * 100)}%`
                              : 'No confidence'
                          return (
                            <button
                              key={page.page_id}
                              type="button"
                              className={`library-document-page-button${isSelected ? ' is-active' : ''}`}
                              aria-pressed={isSelected}
                              onClick={() => setSelectedDetailPageId(page.page_id)}
                            >
                              <span className="library-document-page-button-index">
                                Page {page.page_number}
                              </span>
                              <strong>{formatDocumentKindLabel(page.document_kind)}</strong>
                              <span>
                                {formatDocumentLibraryLabel(page.review_status)} / {confidence}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="library-document-page-detail">
                        {selectedDetailPage ? (
                          <>
                            <div className="library-document-page-detail-head">
                              <div>
                                <span className="eyebrow">Selected Page</span>
                                <strong>Page {selectedDetailPage.page_number}</strong>
                              </div>
                              <div className="library-document-page-detail-badges">
                                <span className={`status-pill status-pill-${pageTextSourceTone(selectedDetailPage)}`}>
                                  {pageTextSourceLabel(selectedDetailPage)}
                                </span>
                                <span className="entity-chip entity-chip-soft">
                                  {formatDocumentKindLabel(selectedDetailPage.document_kind)}
                                </span>
                              </div>
                            </div>

                            <div className="library-page-tags-summary">
                              <LibraryTagChipList
                                values={selectedDetailPageFacetValues}
                                emptyLabel="No page tags"
                                showFacetLabel
                                compact
                              />
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() =>
                                  setEditingTagScope((current) => current === 'page' ? null : 'page')
                                }
                              >
                                {editingTagScope === 'page' ? 'Close Page Tags' : 'Edit Page Tags'}
                              </button>
                            </div>

                            {editingTagScope === 'page' ? (
                              <div className="library-document-tag-editor">
                                <DocumentFacetEditor
                                  documentId={documentPage.document_id}
                                  pageId={selectedDetailPage.page_id}
                                  title={`Page ${selectedDetailPage.page_number} Tags`}
                                  values={selectedDetailPage.facet_values ?? []}
                                  facetSchemas={schemaRegistry?.document_facets}
                                  onChange={(nextValues) =>
                                    updatePageDraft(
                                      documentPage.document_id,
                                      selectedDetailPage.page_id,
                                      (current) => ({
                                        ...current,
                                        facet_values: nextValues,
                                      }),
                                    )
                                  }
                                />
                                <div className="library-document-tags-actions">
                                  <button
                                    type="button"
                                    className="button button-primary"
                                    disabled={savingTarget === `page:${selectedDetailPage.page_id}`}
                                    onClick={() => void handleSavePage(documentPage, selectedDetailPage)}
                                  >
                                    {savingTarget === `page:${selectedDetailPage.page_id}` ? 'Saving Page Tags...' : 'Save Page Tags'}
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            <div className="library-document-page-preview-frame">
                              {selectedDetailPage.preview_available ? (
                                selectedDetailPagePreviewUrl ? (
                                  <img
                                    src={selectedDetailPagePreviewUrl}
                                    alt={`Preview for page ${selectedDetailPage.page_number}`}
                                  />
                                ) : selectedDetailPagePreviewLoading ? (
                                  <p>Loading page preview...</p>
                                ) : selectedDetailPagePreviewError ? (
                                  <div className="library-document-page-preview-error">
                                    <p className="field-error">{selectedDetailPagePreviewError}</p>
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => clearPagePreviewsForDocument(documentPage.document_id)}
                                    >
                                      Retry Preview
                                    </button>
                                  </div>
                                ) : (
                                  <p>Preview is ready and will load shortly.</p>
                                )
                              ) : (
                                <p>Preview is not available for this page yet.</p>
                              )}
                            </div>

                            <div className="library-document-page-detail-grid">
                              <div>
                                <span>Review</span>
                                <strong>{formatDocumentLibraryLabel(selectedDetailPage.review_status)}</strong>
                              </div>
                              <div>
                                <span>Classification</span>
                                <strong>{formatDocumentLibraryLabel(selectedDetailPage.classification_status)}</strong>
                              </div>
                              <div>
                                <span>Fields</span>
                                <strong>{selectedDetailPage.header_fields.length}</strong>
                              </div>
                              <div>
                                <span>Tables</span>
                                <strong>{selectedDetailPage.table_blocks.length}</strong>
                              </div>
                            </div>

                            <div className="library-document-classification-explanation">
                              <div className="library-document-classification-head">
                                <div>
                                  <span className="eyebrow">Classification Explanation</span>
                                  <strong>
                                    {formatPageClassificationLabel(
                                      selectedDetailPage.document_kind,
                                      selectedDetailPage.document_subtype,
                                    )}
                                  </strong>
                                </div>
                                <div className="library-document-page-detail-badges">
                                  <span
                                    className={`status-pill status-pill-${
                                      selectedDetailPageDeterministicConflicts.length > 0 ? 'in-progress' : 'active'
                                    }`}
                                  >
                                    {selectedDetailPageDeterministicAssessment?.document_kind
                                      ? 'DETERMINISTIC'
                                      : 'SYSTEM'}
                                  </span>
                                  <span className="entity-chip entity-chip-soft">
                                    {formatClassificationConfidence(selectedDetailPage.classification_confidence)}
                                  </span>
                                </div>
                              </div>

                              <p>{selectedDetailPageClassificationSummary}</p>

                              <div className="library-document-classification-grid">
                                <div>
                                  <span>System Starting Point</span>
                                  <strong>
                                    {formatPageClassificationLabel(
                                      selectedDetailPageSystemClassification?.documentKind,
                                      selectedDetailPageSystemClassification?.documentSubtype,
                                    )}
                                  </strong>
                                  <small>
                                    {formatClassificationSourceLabel(
                                      selectedDetailPageSystemClassification?.matchedBy ??
                                        selectedDetailPageSystemClassification?.source,
                                    )}
                                  </small>
                                </div>
                                <div>
                                  <span>Deterministic Match</span>
                                  <strong>
                                    {formatPageClassificationLabel(
                                      selectedDetailPageDeterministicAssessment?.document_kind,
                                      selectedDetailPageDeterministicAssessment?.document_subtype,
                                    )}
                                  </strong>
                                  <small>
                                    {formatClassificationConfidence(selectedDetailPageDeterministicAssessment?.confidence)}
                                  </small>
                                </div>
                              </div>

                              {selectedDetailPageDeterministicEvidence.length > 0 ? (
                                <div className="library-document-classification-evidence">
                                  <span className="eyebrow">Evidence</span>
                                  <ul>
                                    {selectedDetailPageDeterministicEvidence.map((evidence) => (
                                      <li key={evidence}>{evidence}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="library-muted-copy">
                                  No detailed classification evidence was recorded for this page.
                                </p>
                              )}

                              {selectedDetailPageDeterministicConflicts.length > 0 ? (
                                <div className="library-document-classification-evidence library-document-classification-conflicts">
                                  <span className="eyebrow">Review Flags</span>
                                  <ul>
                                    {selectedDetailPageDeterministicConflicts.map((conflict) => (
                                      <li key={conflict}>{conflict}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {selectedDetailPageProcessorTrace ? (
                                <div className="library-document-classification-processor">
                                  <span className="entity-chip entity-chip-soft">
                                    {processorLabel(selectedDetailPageProcessorTrace.provider)}
                                    {selectedDetailPageProcessorTrace.model
                                      ? ` / ${selectedDetailPageProcessorTrace.model}`
                                      : ''}
                                  </span>
                                  {selectedDetailPageProcessorTrace.overrode_heuristics ? (
                                    <span className="entity-chip entity-chip-soft">
                                      Processor Updated Heuristics
                                    </span>
                                  ) : null}
                                  {selectedDetailPageProcessorTrace.partial ? (
                                    <span className="entity-chip entity-chip-soft">Partial Processor Result</span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="library-document-page-excerpt">
                              <span className="eyebrow">Extracted Text</span>
                              <p>
                                {selectedDetailPage.raw_text_excerpt ||
                                  'No extractable text has been captured for this page yet.'}
                              </p>
                            </div>

                            {selectedDetailPage.processing_warnings.length > 0 ||
                            selectedDetailPage.processing_errors.length > 0 ? (
                              <div className="library-document-page-notes">
                                {[...selectedDetailPage.processing_errors, ...selectedDetailPage.processing_warnings].map(
                                  (message) => (
                                    <p key={message}>{message}</p>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <p>No page is selected.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="library-muted-copy">No page records are available for this file.</p>
                  )}
                </section>

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
              <span>Uploaded documents</span>
              <span className="library-breadcrumb-separator">/</span>
              <span>{activeLocationLabel}</span>
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

                    {shouldShowAiThresholdControl ? (
                      <div className="library-upload-field library-upload-threshold-field">
                        <div className="document-threshold-control-head">
                          <span>AI Assist Below {effectiveAiConfidenceThresholdPercent}%</span>
                          {aiConfidenceThresholdIsOverride ? (
                            <button
                              type="button"
                              className="button button-ghost document-threshold-reset"
                              onClick={() => setAiConfidenceThresholdOverridePercent(null)}
                              disabled={uploading}
                            >
                              Use System Default
                            </button>
                          ) : null}
                        </div>
                        <input
                          className="document-threshold-slider"
                          type="range"
                          name="ai_confidence_threshold_percent"
                          min="0"
                          max="100"
                          step="1"
                          value={effectiveAiConfidenceThresholdPercent}
                          onChange={(event) =>
                            setAiConfidenceThresholdOverridePercent(Number(event.target.value))
                          }
                          disabled={uploading}
                        />
                        <span className="library-upload-threshold-note">
                          {aiConfidenceThresholdIsOverride
                            ? 'Temporary session override. It clears when you log out.'
                            : `Using the system default of ${systemAiConfidenceThresholdPercent}%.`}
                        </span>
                      </div>
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
                          ? `${selectedProvider.label}${selectedProcessorModel ? ` (${selectedProcessorModel})` : ''} will handle document analysis when classifier confidence is below ${effectiveAiConfidenceThresholdPercent}%.`
                          : 'The built-in parser will be used until an external provider is configured.'}
                      {aiConfidenceThresholdIsOverride && shouldShowAiThresholdControl
                        ? ' This temporary Library setting is active until logout.'
                        : ''}
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

        <article className="library-document-list-card prompt-home-document-upload-card">
          <div className="prompt-home-document-upload-card-head">
            <div className="prompt-home-document-upload-card-copy">
              <span className="eyebrow">Files</span>
              <strong>Document list</strong>
            </div>

            <div className="prompt-home-document-upload-card-side library-document-list-card-side">
              <div className="library-document-list-card-summary" aria-label="Document list summary">
                <span>{visibleDocuments.length} visible</span>
                <span>{formatBytes(visibleStoredBytes)}</span>
                <span>{viewMode === 'list' ? 'List view' : 'Grid view'}</span>
              </div>
              <button
                type="button"
                className="prompt-home-document-upload-card-toggle"
                aria-label={showDocumentList ? 'Hide document list card' : 'Show document list card'}
                aria-expanded={showDocumentList}
                aria-controls={LIBRARY_DOCUMENT_LIST_CARD_PANEL_ID}
                onClick={() => setDocumentListCardExpanded((current) => !current)}
              >
                <div className="prompt-home-document-upload-card-toggle-meta">
                  <small>{showDocumentList ? 'Hide card' : 'Show card'}</small>
                  <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                    {showDocumentList ? '−' : '+'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div
            id={LIBRARY_DOCUMENT_LIST_CARD_PANEL_ID}
            className="prompt-home-document-upload-card-body library-document-list-card-body"
            hidden={!showDocumentList}
          >
            {showDocumentList ? (
              <section className="library-browser-main" aria-label="Document list">
            {visibleDocuments.length === 0 ? (
              <div className="empty-state library-empty-state">
                <strong>{emptyStateTitle}</strong>
                <p>{emptyStateMessage}</p>
              </div>
            ) : viewMode === 'list' ? (
              <>
                <div
                  ref={fileTableScrollRef}
                  className="library-file-table-scroll"
                  onScroll={handleFileTableScroll}
                >
                  <div className="library-file-table" role="list" style={fileTableStyle}>
                    <div className="library-file-table-head">
                      {LIBRARY_FILE_COLUMNS.map((column) => (
                        <div
                          key={column.key}
                          className="library-file-column-head"
                          data-library-column={column.key}
                        >
                          <span className="library-file-column-label">{column.label}</span>
                          <button
                            type="button"
                            className="library-file-column-resizer"
                            aria-label={`Resize ${column.label} column`}
                            title={`Drag or use left and right arrow keys to resize ${column.label}`}
                            onPointerDown={(event) => handleFileColumnResizePointerDown(event, column)}
                            onKeyDown={(event) => handleFileColumnResizeKeyDown(event, column)}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="library-file-table-body">
                      {visibleDocuments.map((document) => {
                        const facetDisplayValues = documentFacetDisplayValues(document)

                        return (
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
                            <div className="library-file-tags-cell">
                              <LibraryTagChipList
                                values={facetDisplayValues}
                                limit={LIBRARY_TAG_PREVIEW_LIMIT}
                                compact
                              />
                            </div>
                            <span>
                              <span className={`status-pill status-pill-${documentStatusTone(document.status)}`}>
                                {fileStatusSummary(document)}
                              </span>
                            </span>
                            <span>{ownerLabel(document)}</span>
                            <span>{formatDate(document.updated_at)}</span>
                            <span>{formatBytes(document.size_bytes)}</span>
                            <div
                              className="library-file-actions-cell"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              {document.review_status !== 'VERIFIED' ? (
                                <button
                                  type="button"
                                  className="button button-secondary library-file-action-button"
                                  aria-label={`Verify ${document.display_name || document.original_filename}`}
                                  disabled={
                                    !documentCanBeVerified(document) ||
                                    savingTarget === `document:${document.document_id}`
                                  }
                                  onClick={() => void handleLibraryDocumentVerify(document)}
                                >
                                  {savingTarget === `document:${document.document_id}` ? 'Verifying...' : 'Verify'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="button button-secondary library-file-action-button"
                                aria-label={`Reprocess ${document.display_name || document.original_filename}`}
                                disabled={
                                  !document.source_available ||
                                  documentNeedsProcessing(document) ||
                                  savingTarget === `reprocess:${document.document_id}`
                                }
                                onClick={() => handleLibraryDocumentReprocess(document)}
                              >
                                {savingTarget === `reprocess:${document.document_id}` ? 'Reprocessing...' : 'Reprocess'}
                              </button>
                              <button
                                type="button"
                                className="button button-secondary library-file-action-button"
                                aria-label={`Open workflows for ${document.display_name || document.original_filename}`}
                                onClick={() => void handleOpenWorkflowDialog(document)}
                              >
                                Workflows
                              </button>
                              {saveErrors[`reprocess:${document.document_id}`] ? (
                                <small className="field-error">{saveErrors[`reprocess:${document.document_id}`]}</small>
                              ) : null}
                              {saveErrors[`document:${document.document_id}`] ? (
                                <small className="field-error">{saveErrors[`document:${document.document_id}`]}</small>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div
                  ref={fileTableScrollbarRef}
                  className="library-file-table-scrollbar"
                  aria-label="Scroll library columns horizontally"
                  role="region"
                  onScroll={handleFileTableScrollbarScroll}
                >
                  <div
                    className="library-file-table-scrollbar-spacer"
                    style={{ width: fileTableScrollWidth }}
                  />
                </div>
              </>
            ) : (
              <div className="library-document-grid">
                {visibleDocuments.map((document) => {
                  const facetDisplayValues = documentFacetDisplayValues(document)

                  return (
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
                      <LibraryTagChipList
                        values={facetDisplayValues}
                        limit={LIBRARY_TAG_PREVIEW_LIMIT}
                        emptyLabel="No tags"
                        compact
                      />
                    </button>
                  )
                })}
              </div>
            )}
              </section>
            ) : null}
          </div>
        </article>
          </>
        )}
      </div>
      {pendingReprocessDocument ? (
        <div className="library-workflow-overlay" role="presentation">
          <button
            type="button"
            className="library-workflow-backdrop"
            aria-label="Cancel reprocess"
            onClick={handleCancelDocumentReprocess}
          />
          <section
            className="library-workflow-dialog library-reprocess-warning-dialog surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-reprocess-warning-title"
          >
            <header className="library-workflow-dialog-head">
              <div>
                <span className="eyebrow">Reprocess Warning</span>
                <h3 id="library-reprocess-warning-title">Workflow outputs already exist</h3>
                <p>{pendingReprocessDocument.display_name || pendingReprocessDocument.original_filename}</p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancelDocumentReprocess}
              >
                Cancel
              </button>
            </header>
            <p className="library-reprocess-warning-copy">
              Reprocessing will reset the document analysis and review state. Workflows have already been executed
              for this document, so downstream records created from the earlier extraction may need follow-up.
            </p>
            <div className="library-reprocess-warning-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancelDocumentReprocess}
              >
                Don't Reprocess
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void handleConfirmDocumentReprocess()}
              >
                Reprocess Document
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {workflowDialogDocument ? (
        <div className="library-workflow-overlay" role="presentation">
          <button
            type="button"
            className="library-workflow-backdrop"
            aria-label="Cancel workflows"
            onClick={handleCloseWorkflowDialog}
          />
          <section
            className="library-workflow-dialog surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-workflow-title"
          >
            <header className="library-workflow-dialog-head">
              <div>
                <span className="eyebrow">Workflows</span>
                <h3 id="library-workflow-title">{workflowDialogDocument.display_name || workflowDialogDocument.original_filename}</h3>
                <p>{workflowList?.document_type_label ?? dominantDocumentKind(workflowDialogDocument)}</p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCloseWorkflowDialog}
              >
                Cancel
              </button>
            </header>

            {workflowLoading ? (
              <p className="library-muted-copy">Loading workflows...</p>
            ) : workflowList && workflowList.workflows.length === 0 ? (
              <p className="library-muted-copy">{workflowList.empty_message}</p>
            ) : workflowList ? (
              <>
                <section className="library-workflow-summary" aria-label="Record resolution summary">
                  <div className="library-workflow-summary-main">
                    <span className="eyebrow">Recommended Action</span>
                    <strong>{recommendedWorkflow?.label ?? 'Manual Review'}</strong>
                    <p>{workflowList.action_plan?.description ?? recommendedWorkflow?.description ?? workflowList.empty_message}</p>
                  </div>
                  <div className="library-workflow-chip-row">
                    <span className={`status-pill status-pill-${workflowStatusTone(workflowList.action_plan?.status)}`}>
                      {formatWorkflowValue(workflowList.action_plan?.status, 'Review')}
                    </span>
                    <span className={`status-pill status-pill-${workflowStatusTone(workflowList.governance?.status)}`}>
                      {formatWorkflowValue(workflowList.governance?.status, 'Governance Pending')}
                    </span>
                    <span className="entity-chip entity-chip-soft">
                      {formatWorkflowPercent(workflowList.linkage_assessment?.confidence)} confidence
                    </span>
                  </div>
                  <dl className="library-workflow-summary-grid">
                    <div>
                      <dt>Target</dt>
                      <dd>{workflowRecordLabel(workflowList.action_plan?.target)}</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{workflowRecordLabel(workflowList.action_plan?.owner)}</dd>
                    </div>
                    <div>
                      <dt>Primary Match</dt>
                      <dd>{workflowPrimaryCandidate ? workflowCandidateLabel(workflowPrimaryCandidate) : 'No candidate yet'}</dd>
                    </div>
                    <div>
                      <dt>Existing Links</dt>
                      <dd>{workflowExistingLinkCount}</dd>
                    </div>
                  </dl>
                  {(workflowList.action_plan?.missing_evidence ?? []).length ? (
                    <div className="library-workflow-token-section">
                      <span>Missing Evidence</span>
                      <div className="library-workflow-token-list">
                        {(workflowList.action_plan?.missing_evidence ?? []).map((item) => (
                          <small key={item}>{formatWorkflowValue(item)}</small>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {workflowPendingApprovalRequest ? (
                    <div className="library-workflow-token-section">
                      <span>Pending Approval</span>
                      <div className="library-workflow-token-list">
                        <small>Request {workflowPendingApprovalRequest.request_id}</small>
                        <small>{formatWorkflowValue(workflowPendingApprovalRequest.governance_status)}</small>
                        <small>{formatDate(workflowPendingApprovalRequest.requested_at)}</small>
                      </div>
                    </div>
                  ) : null}
                </section>

                {(workflowList.linkage_assessment?.candidates ?? []).length ? (
                  <section className="library-workflow-candidates" aria-label="Record candidates">
                    <div className="library-workflow-section-head">
                      <strong>Record Candidates</strong>
                      <span>{workflowList.linkage_assessment?.candidates?.length ?? 0}</span>
                    </div>
                    <div className="library-workflow-candidate-list">
                      {(workflowList.linkage_assessment?.candidates ?? []).slice(0, 4).map((candidate) => {
                        const candidateKey = workflowCandidateKey(candidate)
                        const isSelectable = canRequestSelectedWorkflowCandidateApproval(candidate)
                        const isSelected = selectedWorkflowCandidateKey === candidateKey

                        return (
                          <article
                            key={candidateKey}
                            className={`library-workflow-candidate${isSelected ? ' is-selected' : ''}`}
                          >
                            <div>
                              <strong>{candidate.record_label}</strong>
                              <span>{candidate.summary}</span>
                            </div>
                            <div className="library-workflow-chip-row">
                              <span className={`status-pill status-pill-${workflowStatusTone(candidate.candidate_state)}`}>
                                {formatWorkflowValue(candidate.candidate_state)}
                              </span>
                              <span className="entity-chip entity-chip-soft">
                                {formatWorkflowPercent(candidate.score)}
                              </span>
                              {isSelectable ? (
                                <button
                                  type="button"
                                  className="button button-secondary library-workflow-candidate-select"
                                  onClick={() => setSelectedWorkflowCandidateKey(candidateKey)}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </button>
                              ) : null}
                            </div>
                            {(candidate.matched_keys ?? []).length || (candidate.missing_keys ?? []).length ? (
                              <div className="library-workflow-candidate-evidence">
                                {(candidate.matched_keys ?? []).length ? (
                                  <span>Matched {(candidate.matched_keys ?? []).map((item) => formatWorkflowValue(item)).join(', ')}</span>
                                ) : null}
                                {(candidate.missing_keys ?? []).length ? (
                                  <span>Missing {(candidate.missing_keys ?? []).map((item) => formatWorkflowValue(item)).join(', ')}</span>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                    {selectedWorkflowCandidate ? (
                      <div className="library-workflow-selected-candidate">
                        <div>
                          <strong>{selectedWorkflowCandidate.record_label}</strong>
                          <span>
                            {formatWorkflowPercent(selectedWorkflowCandidate.score)} confidence /{' '}
                            {formatWorkflowValue(selectedWorkflowCandidate.candidate_state)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={executingWorkflowId !== null || Boolean(workflowPendingApprovalRequest)}
                          onClick={() =>
                            canAttachSelectedWorkflowCandidate(selectedWorkflowCandidate)
                              ? void handleAttachSelectedWorkflowCandidate(selectedWorkflowCandidate)
                              : void handleRequestSelectedWorkflowCandidateApproval(selectedWorkflowCandidate)
                          }
                        >
                          {executingWorkflowId === `candidate:${workflowCandidateKey(selectedWorkflowCandidate)}`
                            ? 'Working...'
                            : workflowPendingApprovalRequest
                              ? 'Approval Pending'
                              : selectedWorkflowCandidateActionLabel(selectedWorkflowCandidate)}
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className="library-workflow-list">
                  {workflowList.workflows.map((workflow) => {
                    const disabledReason = workflowDisabledReason(workflow)
                    const canExecute = canExecuteWorkflowAction(workflow)
                    const canRequestApproval =
                      canRequestDocumentActionApproval(workflow) && !workflowPendingApprovalRequest
                    const buttonEnabled = canExecute || canRequestApproval
                    const buttonLabel = workflowPendingApprovalRequest && workflow.approval_required
                      ? 'Approval Pending'
                      : canRequestApproval
                        ? 'Request Approval'
                        : workflowActionButtonLabel(workflow)
                    const requiredOwnerTypes = workflow.required_owner_record_types ?? []
                    const missingEvidence = workflow.missing_evidence ?? []
                    const riskFlags = workflow.risk_flags ?? []
                    const reasons = workflow.reasons ?? []

                    return (
                      <article
                        key={workflow.workflow_id}
                        className={`library-workflow-card${workflow.recommended ? ' is-recommended' : ''}`}
                      >
                        <div className="library-workflow-card-head">
                          <div>
                            <strong>{workflow.label}</strong>
                            <span>{workflow.description}</span>
                          </div>
                          <div className="library-workflow-card-badges">
                            {workflow.recommended ? <span className="entity-chip entity-chip-soft">Recommended</span> : null}
                            <span className={`status-pill status-pill-${workflowStatusTone(workflow.status)}`}>
                              {formatWorkflowValue(workflow.status)}
                            </span>
                            {workflow.candidate_state ? (
                              <span className="entity-chip entity-chip-soft">
                                {formatWorkflowValue(workflow.candidate_state)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <dl className="library-workflow-card-grid">
                          <div>
                            <dt>Effect</dt>
                            <dd>{workflow.record_effect ?? 'Review only'}</dd>
                          </div>
                          <div>
                            <dt>Target</dt>
                            <dd>{workflowRecordLabel(workflow.target)}</dd>
                          </div>
                          <div>
                            <dt>Owner</dt>
                            <dd>{workflowRecordLabel(workflow.owner)}</dd>
                          </div>
                          <div>
                            <dt>Governance</dt>
                            <dd>{formatWorkflowValue(workflow.governance_status, 'Not evaluated')}</dd>
                          </div>
                        </dl>

                        {requiredOwnerTypes.length ? (
                          <div className="library-workflow-token-section">
                            <span>Required Owner</span>
                            <div className="library-workflow-token-list">
                              {requiredOwnerTypes.map((item) => (
                                <small key={item}>{formatWorkflowValue(item)}</small>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {missingEvidence.length ? (
                          <div className="library-workflow-token-section">
                            <span>Missing Evidence</span>
                            <div className="library-workflow-token-list">
                              {missingEvidence.map((item) => (
                                <small key={item}>{formatWorkflowValue(item)}</small>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {riskFlags.length ? (
                          <div className="library-workflow-token-section">
                            <span>Risk Flags</span>
                            <div className="library-workflow-token-list">
                              {riskFlags.map((item) => (
                                <small key={item}>{formatWorkflowValue(item)}</small>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {reasons.length ? (
                          <ul className="library-workflow-reasons">
                            {reasons.slice(0, 3).map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}

                        {disabledReason ? (
                          <p className="library-workflow-disabled-reason">{disabledReason}</p>
                        ) : null}

                        <div className="library-workflow-card-actions">
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={executingWorkflowId !== null || !buttonEnabled}
                            onClick={() =>
                              canRequestApproval
                                ? void handleRequestWorkflowApproval(workflow)
                                : void handleExecuteWorkflow(workflow)
                            }
                          >
                            {executingWorkflowId === workflow.workflow_id ? 'Working...' : buttonLabel}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            ) : null}

            {workflowExecution ? (
              <div className="library-workflow-result">
                <strong>{workflowExecution.label}</strong>
                <p>{workflowExecution.message}</p>
                <span>
                  {workflowExecution.created_count} created / {workflowExecution.updated_count} updated /{' '}
                  {workflowExecution.unchanged_count} unchanged
                </span>
              </div>
            ) : null}

            {workflowActionMessage ? (
              <div className="library-workflow-result">
                <strong>Attach complete</strong>
                <p>{workflowActionMessage}</p>
              </div>
            ) : null}

            {workflowError ? <p className="field-error">{workflowError}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
