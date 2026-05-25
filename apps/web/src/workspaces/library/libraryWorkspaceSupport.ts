import {
  documentFacetDisplayValues,
  documentNeedsProcessing,
  dominantDocumentKind,
  formatDocumentFacetLabel,
  reviewReady,
} from '../../features/documents/documentIngestionUtils'
import type { DocumentIngestionRecord, DocumentKindSchemaRecord, DocumentWorkflowRecord } from '../../shared/models'
import type { DocumentLibraryCustomFolder } from './libraryFolderState'

export const DOCUMENT_LIBRARY_COLLECTIONS = [
  {
    key: 'all',
    label: 'All Files',
    description: 'Everything uploaded into the document library.',
  },
  {
    key: 'review',
    label: 'Review Queue',
    description: 'Files that still need human review before they are verified.',
  },
  {
    key: 'ready',
    label: 'Ready',
    description: 'Files whose extracted content is ready for final verification.',
  },
  {
    key: 'linked',
    label: 'Linked',
    description: 'Files that are already connected to a trade or downstream record.',
  },
  {
    key: 'processing',
    label: 'Processing',
    description: 'Files still being parsed or analyzed in the background.',
  },
  {
    key: 'errors',
    label: 'Needs Attention',
    description: 'Files carrying processing errors or warnings that need follow-up.',
  },
] as const

export type DocumentLibraryCollectionKey = (typeof DOCUMENT_LIBRARY_COLLECTIONS)[number]['key']
export type DocumentLibraryViewMode = 'grid' | 'list'
export type DocumentLibrarySortMode = 'updated' | 'name'
const EXECUTABLE_DOCUMENT_WORKFLOW_IDS = new Set(['process_prices'])

export type DocumentLibraryCollectionCounts = Record<DocumentLibraryCollectionKey, number>
export type DocumentLibraryFolderCounts = Record<string, number>
export type DocumentLibraryFolderTreeItem = {
  id: string
  name: string
  parentFolderId: string | null
  depth: number
  pathIds: string[]
  pathLabel: string
}

export function canExecuteDocumentWorkflow(workflow: DocumentWorkflowRecord): boolean {
  return (
    EXECUTABLE_DOCUMENT_WORKFLOW_IDS.has(workflow.workflow_id) &&
    workflow.status === 'READY' &&
    !workflow.approval_required &&
    !workflow.disabled_reason
  )
}

export function canExecuteDocumentActionPlanWorkflow(workflow: DocumentWorkflowRecord): boolean {
  return (
    workflow.workflow_id === 'match_existing_record' &&
    workflow.status === 'READY' &&
    workflow.action_type === 'ATTACH_EXISTING_RECORD' &&
    workflow.operation_type === 'link_document_to_record' &&
    workflow.candidate_state === 'ATTACH_READY' &&
    workflow.governance_status === 'AUTO_EXECUTION_ELIGIBLE' &&
    workflow.target?.existing_record === true &&
    Boolean(workflow.target.record_id) &&
    !workflow.approval_required &&
    !workflow.disabled_reason
  )
}

export function canExecuteWorkflowAction(workflow: DocumentWorkflowRecord): boolean {
  return canExecuteDocumentWorkflow(workflow) || canExecuteDocumentActionPlanWorkflow(workflow)
}

export function canRequestDocumentActionApproval(workflow: DocumentWorkflowRecord): boolean {
  return (
    workflow.recommended &&
    workflow.status === 'READY' &&
    workflow.approval_required &&
    Boolean(workflow.operation_type)
  )
}

export function workflowActionButtonLabel(workflow: DocumentWorkflowRecord): string {
  if (canExecuteDocumentActionPlanWorkflow(workflow)) {
    return 'Attach'
  }
  if (canExecuteDocumentWorkflow(workflow)) {
    return 'Execute'
  }
  if (workflow.status === 'EXECUTED') {
    return 'Executed'
  }
  if (workflow.status === 'BLOCKED') {
    return 'Blocked'
  }
  if (workflow.approval_required) {
    return 'Approval Required'
  }
  return 'Review'
}

export function workflowDisabledReason(workflow: DocumentWorkflowRecord): string | null {
  if (canExecuteDocumentActionPlanWorkflow(workflow)) {
    return null
  }
  if (workflow.disabled_reason) {
    return workflow.disabled_reason
  }
  if (workflow.approval_required) {
    return 'Human approval is required before this workflow can mutate records.'
  }
  if (!EXECUTABLE_DOCUMENT_WORKFLOW_IDS.has(workflow.workflow_id)) {
    return 'This workflow is staged for review and is not executable from the Library yet.'
  }
  return null
}

export function documentHasErrors(document: DocumentIngestionRecord): boolean {
  return document.processing_errors.length > 0
}

export function documentIsLinked(document: DocumentIngestionRecord): boolean {
  return document.record_links.length > 0
}

export function documentHasExecutedWorkflows(document: DocumentIngestionRecord): boolean {
  return (
    (document.activity ?? []).some((entry) => entry.event_type === 'DocumentWorkflowExecuted') ||
    document.record_links.some((link) => (link.source ?? '').trim().toUpperCase() === 'DOCUMENT_WORKFLOW')
  )
}

export function documentHasAiAssist(document: DocumentIngestionRecord): boolean {
  return Boolean(document.processor_trace) || Boolean(document.processor_provider && document.processor_provider !== 'builtin')
}

export function documentReviewQueue(document: DocumentIngestionRecord): boolean {
  return document.review_status !== 'VERIFIED'
}

export function documentCanBeVerified(document: DocumentIngestionRecord): boolean {
  return document.review_status !== 'VERIFIED' && !documentNeedsProcessing(document)
}

export function formatDocumentLibraryLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function sortDocumentLibraryKindOptions(
  documentKinds: DocumentKindSchemaRecord[],
): DocumentKindSchemaRecord[] {
  return [...documentKinds].sort((left, right) => {
    const labelComparison = left.label.localeCompare(right.label)
    if (labelComparison !== 0) {
      return labelComparison
    }
    return left.document_kind.localeCompare(right.document_kind)
  })
}

export function buildDocumentLibraryCollectionCounts(
  documents: DocumentIngestionRecord[],
): DocumentLibraryCollectionCounts {
  return {
    all: documents.length,
    review: documents.filter(documentReviewQueue).length,
    ready: documents.filter(reviewReady).length,
    linked: documents.filter(documentIsLinked).length,
    processing: documents.filter(documentNeedsProcessing).length,
    errors: documents.filter(documentHasErrors).length,
  }
}

export function buildDocumentLibraryFolderCounts(
  documents: DocumentIngestionRecord[],
  folderAssignments: Record<string, string>,
  folders: DocumentLibraryCustomFolder[],
): DocumentLibraryFolderCounts {
  const folderTree = buildDocumentLibraryFolderTree(folders)
  const folderPathIdsById = new Map(
    folderTree.map((folder) => [folder.id, folder.pathIds] as const),
  )

  return documents.reduce<DocumentLibraryFolderCounts>((counts, document) => {
    const folderId = folderAssignments[document.document_id]
    if (!folderId) {
      return counts
    }
    const pathIds = folderPathIdsById.get(folderId)
    if (!pathIds) {
      return counts
    }
    pathIds.forEach((pathId) => {
      counts[pathId] = (counts[pathId] ?? 0) + 1
    })
    return counts
  }, {})
}

export function buildDocumentLibraryFolderTree(
  folders: DocumentLibraryCustomFolder[],
): DocumentLibraryFolderTreeItem[] {
  const folderById = new Map(folders.map((folder) => [folder.id, folder] as const))
  const childrenByParent = new Map<string | null, DocumentLibraryCustomFolder[]>()

  folders.forEach((folder) => {
    const parentFolderId =
      folder.parentFolderId && folderById.has(folder.parentFolderId)
        ? folder.parentFolderId
        : null
    const siblings = childrenByParent.get(parentFolderId) ?? []
    siblings.push({
      ...folder,
      parentFolderId,
    })
    childrenByParent.set(parentFolderId, siblings)
  })

  childrenByParent.forEach((children) => {
    children.sort((left, right) => left.name.localeCompare(right.name))
  })

  const orderedFolders: DocumentLibraryFolderTreeItem[] = []

  function visit(
    parentFolderId: string | null,
    depth: number,
    ancestorIds: string[],
    ancestorNames: string[],
  ) {
    const children = childrenByParent.get(parentFolderId) ?? []
    children.forEach((folder) => {
      if (ancestorIds.includes(folder.id)) {
        return
      }

      const pathIds = [...ancestorIds, folder.id]
      const pathNames = [...ancestorNames, folder.name]
      orderedFolders.push({
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        depth,
        pathIds,
        pathLabel: pathNames.join(' / '),
      })

      visit(folder.id, depth + 1, pathIds, pathNames)
    })
  }

  visit(null, 0, [], [])
  return orderedFolders
}

export function buildDocumentLibraryFolderDescendantIds(
  folderId: string,
  folders: DocumentLibraryCustomFolder[],
): Set<string> {
  const childrenByParent = new Map<string | null, string[]>()
  folders.forEach((folder) => {
    const children = childrenByParent.get(folder.parentFolderId ?? null) ?? []
    children.push(folder.id)
    childrenByParent.set(folder.parentFolderId ?? null, children)
  })

  const descendantIds = new Set<string>()
  const queue = [folderId]
  while (queue.length > 0) {
    const nextFolderId = queue.shift()
    if (!nextFolderId || descendantIds.has(nextFolderId)) {
      continue
    }
    descendantIds.add(nextFolderId)
    ;(childrenByParent.get(nextFolderId) ?? []).forEach((childId) => {
      if (!descendantIds.has(childId)) {
        queue.push(childId)
      }
    })
  }

  return descendantIds
}

export function matchesDocumentLibraryCollection(
  document: DocumentIngestionRecord,
  collectionKey: DocumentLibraryCollectionKey,
): boolean {
  switch (collectionKey) {
    case 'review':
      return documentReviewQueue(document)
    case 'ready':
      return reviewReady(document)
    case 'linked':
      return documentIsLinked(document)
    case 'processing':
      return documentNeedsProcessing(document)
    case 'errors':
      return documentHasErrors(document)
    case 'all':
    default:
      return true
  }
}

function documentSearchIndex(document: DocumentIngestionRecord): string {
  const facetTokens = documentFacetDisplayValues(document).flatMap((value) => [
    value.facet_key,
    value.facet_label,
    value.value_code,
    value.value_label,
    formatDocumentFacetLabel(value),
  ])

  return [
    document.display_name,
    document.original_filename,
    dominantDocumentKind(document),
    document.review_status,
    document.review_notes ?? '',
    ...document.record_links.map((link) => link.record_label),
    ...facetTokens,
  ]
    .join(' ')
    .toLowerCase()
}

function documentSortValue(document: DocumentIngestionRecord): number {
  const parsedTimestamp = Date.parse(document.updated_at || document.created_at)
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
}

export function filterDocumentLibraryDocuments(args: {
  documents: DocumentIngestionRecord[]
  collectionKey?: DocumentLibraryCollectionKey | null
  folderAssignments?: Record<string, string>
  folderMatchIds?: Set<string> | null
  query: string
  sortMode: DocumentLibrarySortMode
}): DocumentIngestionRecord[] {
  const normalizedQuery = args.query.trim().toLowerCase()
  const folderAssignments = args.folderAssignments ?? {}

  return [...args.documents]
    .filter((document) => {
      if (args.folderMatchIds) {
        const folderId = folderAssignments[document.document_id]
        return Boolean(folderId && args.folderMatchIds.has(folderId))
      }

      return matchesDocumentLibraryCollection(document, args.collectionKey ?? 'all')
    })
    .filter((document) => !normalizedQuery || documentSearchIndex(document).includes(normalizedQuery))
    .sort((left, right) => {
      if (args.sortMode === 'name') {
        return (left.display_name || left.original_filename).localeCompare(
          right.display_name || right.original_filename,
        )
      }

      return documentSortValue(right) - documentSortValue(left)
    })
}
