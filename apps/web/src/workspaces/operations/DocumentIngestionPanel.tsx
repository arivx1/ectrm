import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import {
  fetchDocumentPagePreview,
  listDocumentIngestions,
  listDocumentSchemaRegistry,
  reprocessDocumentIngestion,
  updateDocumentIngestion,
  updateDocumentPage,
  uploadPdfDocument,
  type UpdateDocumentIngestionInput,
  type UpdateDocumentPageInput,
} from '../../entities/documents/api'
import { ApiError } from '../../shared/api'
import { appConfig } from '../../shared/config'
import type {
  DocumentExtractedFieldRecord,
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentKindSchemaRecord,
  DocumentSchemaRegistryRecord,
  DocumentTableBlockRecord,
  DocumentTableTemplateSchemaRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type DocumentIngestionPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
}

const DOCUMENT_REVIEW_STATUS_OPTIONS = ['UNREVIEWED', 'IN_REVIEW', 'VERIFIED'] as const
const PAGE_REVIEW_STATUS_OPTIONS = ['UNREVIEWED', 'REVIEWED'] as const

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

function isPdfFile(file: File): boolean {
  const normalizedName = file.name.trim().toLowerCase()
  const normalizedType = file.type.trim().toLowerCase()
  return normalizedName.endsWith('.pdf') || normalizedType === 'application/pdf'
}

function normalizeKey(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) {
    return ''
  }
  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`.slice(0, 64)
}

function humanizeKey(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function dominantDocumentKind(document: DocumentIngestionRecord): string {
  const candidate = document.analysis_summary.dominant_document_kind
  return typeof candidate === 'string' && candidate.trim() ? candidate.replaceAll('_', ' ') : 'UNKNOWN'
}

function reviewedPageCount(document: DocumentIngestionRecord): number {
  const candidate = document.analysis_summary.reviewed_page_count
  return typeof candidate === 'number' ? candidate : 0
}

function reviewReady(document: DocumentIngestionRecord): boolean {
  return document.analysis_summary.review_ready === true
}

function documentNeedsProcessing(document: DocumentIngestionRecord): boolean {
  return document.status === 'UPLOADED' || document.status === 'PROCESSING'
}

function documentStatusTone(status: string): 'active' | 'blocked' | 'in-progress' | 'planned' {
  if (status === 'FAILED') {
    return 'blocked'
  }
  if (status === 'PROCESSING') {
    return 'in-progress'
  }
  if (status === 'UPLOADED') {
    return 'planned'
  }
  return 'active'
}

function documentStatusCopy(document: DocumentIngestionRecord): string {
  if (document.status === 'UPLOADED') {
    return 'Analysis is queued. Page stubs are ready now, and this panel will refresh automatically when extraction finishes.'
  }
  if (document.status === 'PROCESSING') {
    return 'Analysis is running in the background. Review controls unlock again once classification and extraction complete.'
  }
  return (
    'This review surface is schema-driven: page kinds define required header fields and expected table templates, ' +
    'and verification only succeeds once every page has been reviewed against that contract.'
  )
}

function pageTextSourceLabel(page: DocumentIngestionPageRecord): string {
  if (page.text_source === 'ocr') {
    return 'OCR Text'
  }
  if (page.text_source === 'pdf_text') {
    return 'PDF Text'
  }
  return 'No Text Captured'
}

function pageTextSourceTone(page: DocumentIngestionPageRecord): 'active' | 'planned' {
  return page.text_source === 'none' ? 'planned' : 'active'
}

function reindexTableBlocks(blocks: DocumentTableBlockRecord[]): DocumentTableBlockRecord[] {
  return blocks.map((block, index) => ({ ...block, table_index: index + 1 }))
}

function buildBlankRow(columns: string[]): Record<string, string | null> {
  return Object.fromEntries(columns.map((column) => [column, ''])) as Record<string, string | null>
}

function buildBlankTableBlock(template?: DocumentTableTemplateSchemaRecord): DocumentTableBlockRecord {
  const columns = template?.columns.map((column) => column.column_key) ?? ['column_1']
  return {
    table_index: 1,
    template_key: template?.template_key ?? null,
    title: template?.label ?? null,
    columns,
    rows: [buildBlankRow(columns)],
    header_row_detected: false,
    source: 'review',
  }
}

function uniqueCustomFieldKey(fields: DocumentExtractedFieldRecord[]): string {
  let index = 1
  while (fields.some((field) => field.field_key === `custom_field_${index}`)) {
    index += 1
  }
  return `custom_field_${index}`
}

function toDocumentUpdatePayload(document: DocumentIngestionRecord): UpdateDocumentIngestionInput {
  return {
    display_name: document.display_name,
    review_status: document.review_status,
    review_notes: document.review_notes,
  }
}

function toPageUpdatePayload(page: DocumentIngestionPageRecord): UpdateDocumentPageInput {
  return {
    document_kind: page.document_kind,
    document_subtype: page.document_subtype,
    header_fields: page.header_fields.map((field) => ({
      field_key: field.field_key,
      label: field.label,
      value: field.value,
      confidence: field.confidence,
      source: field.source,
    })),
    table_blocks: page.table_blocks.map((table) => ({
      template_key: table.template_key,
      title: table.title,
      columns: table.columns,
      rows: table.rows,
      header_row_detected: table.header_row_detected,
      source: table.source,
    })),
    review_status: page.review_status,
    review_notes: page.review_notes,
  }
}

export function DocumentIngestionPanel({ authSession, formatDate }: DocumentIngestionPanelProps) {
  const [documents, setDocuments] = useState<DocumentIngestionRecord[]>([])
  const [schemaRegistry, setSchemaRegistry] = useState<DocumentSchemaRegistryRecord | null>(null)
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [savingTarget, setSavingTarget] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [pagePreviewUrls, setPagePreviewUrls] = useState<Record<number, string>>({})
  const [pagePreviewLoading, setPagePreviewLoading] = useState<Record<number, boolean>>({})
  const [pagePreviewErrors, setPagePreviewErrors] = useState<Record<number, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const pagePreviewUrlsRef = useRef<Record<number, string>>({})

  const schemaByKind = useMemo(() => {
    const entries = schemaRegistry?.document_kinds ?? []
    return Object.fromEntries(entries.map((schema) => [schema.document_kind, schema])) as Record<string, DocumentKindSchemaRecord>
  }, [schemaRegistry])

  const hasProcessingDocuments = useMemo(() => documents.some((document) => documentNeedsProcessing(document)), [documents])

  useEffect(() => {
    if (!authSession) {
      Object.values(pagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      pagePreviewUrlsRef.current = {}
      setDocuments([])
      setSchemaRegistry(null)
      setLoadError('')
      setLoading(false)
      setPagePreviewUrls({})
      setPagePreviewLoading({})
      setPagePreviewErrors({})
      return
    }
    const session = authSession

    let cancelled = false

    async function loadDocuments() {
      setLoading(true)
      setLoadError('')
      try {
        const [nextRegistry, nextDocuments] = await Promise.all([
          listDocumentSchemaRegistry(appConfig.apiBase, session),
          listDocumentIngestions(appConfig.apiBase, session),
        ])
        if (!cancelled) {
          setSchemaRegistry(nextRegistry)
          setDocuments(nextDocuments)
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        setLoadError(error instanceof Error ? error.message : 'Unable to load document intake records.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDocuments()
    return () => {
      cancelled = true
    }
  }, [authSession])

  useEffect(() => {
    pagePreviewUrlsRef.current = pagePreviewUrls
  }, [pagePreviewUrls])

  useEffect(() => {
    return () => {
      Object.values(pagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (!authSession || !hasProcessingDocuments) {
      return
    }
    const session = authSession
    let cancelled = false
    let refreshing = false

    async function refreshDocuments() {
      if (refreshing) {
        return
      }
      refreshing = true
      try {
        const nextDocuments = await listDocumentIngestions(appConfig.apiBase, session)
        if (!cancelled) {
          setDocuments(nextDocuments)
        }
      } catch {
        // Keep the current draft state when polling fails and try again on the next interval.
      } finally {
        refreshing = false
      }
    }

    void refreshDocuments()
    const intervalId = window.setInterval(() => {
      void refreshDocuments()
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [authSession, hasProcessingDocuments])

  useEffect(() => {
    if (!authSession) {
      return
    }

    const targetPages = documents.flatMap((document) => {
      if (!expandedDocumentIds[document.document_id] || documentNeedsProcessing(document)) {
        return []
      }
      return document.pages
        .filter(
          (page) =>
            page.preview_available &&
            !pagePreviewUrls[page.page_id] &&
            !pagePreviewLoading[page.page_id] &&
            !pagePreviewErrors[page.page_id],
        )
        .map((page) => ({
          documentId: document.document_id,
          pageId: page.page_id,
        }))
    })

    if (targetPages.length === 0) {
      return
    }

    let cancelled = false
    setPagePreviewLoading((current) => {
      const next = { ...current }
      for (const page of targetPages) {
        next[page.pageId] = true
      }
      return next
    })

    for (const page of targetPages) {
      void fetchDocumentPagePreview(appConfig.apiBase, authSession, page.documentId, page.pageId)
        .then((blob) => {
          if (cancelled) {
            return
          }
          const nextUrl = URL.createObjectURL(blob)
          setPagePreviewUrls((current) => {
            const previousUrl = current[page.pageId]
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl)
            }
            return { ...current, [page.pageId]: nextUrl }
          })
          setPagePreviewErrors((current) => {
            if (!(page.pageId in current)) {
              return current
            }
            const next = { ...current }
            delete next[page.pageId]
            return next
          })
        })
        .catch((error) => {
          if (cancelled) {
            return
          }
          setPagePreviewErrors((current) => ({
            ...current,
            [page.pageId]: error instanceof Error ? error.message : 'Unable to load the page preview.',
          }))
        })
        .finally(() => {
          if (cancelled) {
            return
          }
          setPagePreviewLoading((current) => {
            if (!(page.pageId in current)) {
              return current
            }
            const next = { ...current }
            delete next[page.pageId]
            return next
          })
        })
    }

    return () => {
      cancelled = true
    }
  }, [authSession, documents, expandedDocumentIds, pagePreviewErrors, pagePreviewLoading, pagePreviewUrls])

  function replaceDocument(nextDocument: DocumentIngestionRecord) {
    setDocuments((current) => {
      const index = current.findIndex((document) => document.document_id === nextDocument.document_id)
      if (index === -1) {
        return [nextDocument, ...current]
      }
      const nextDocuments = [...current]
      nextDocuments[index] = nextDocument
      return nextDocuments
    })
  }

  function updateDocumentDraft(
    documentId: string,
    updater: (document: DocumentIngestionRecord) => DocumentIngestionRecord,
  ) {
    setDocuments((current) =>
      current.map((document) => (document.document_id === documentId ? updater(document) : document)),
    )
  }

  function updatePageDraft(
    documentId: string,
    pageId: number,
    updater: (page: DocumentIngestionPageRecord) => DocumentIngestionPageRecord,
  ) {
    updateDocumentDraft(documentId, (document) => ({
      ...document,
      pages: document.pages.map((page) => (page.page_id === pageId ? updater(page) : page)),
    }))
  }

  function setSaveError(target: string, message: string) {
    setSaveErrors((current) => ({ ...current, [target]: message }))
  }

  function clearSaveError(target: string) {
    setSaveErrors((current) => {
      if (!(target in current)) {
        return current
      }
      const nextErrors = { ...current }
      delete nextErrors[target]
      return nextErrors
    })
  }

  function clearPagePreviewsForDocument(documentId: string) {
    const pageIds = documents.find((document) => document.document_id === documentId)?.pages.map((page) => page.page_id) ?? []
    if (pageIds.length === 0) {
      return
    }

    setPagePreviewUrls((current) => {
      const next = { ...current }
      for (const pageId of pageIds) {
        if (next[pageId]) {
          URL.revokeObjectURL(next[pageId])
          delete next[pageId]
        }
      }
      return next
    })
    setPagePreviewLoading((current) => {
      const next = { ...current }
      for (const pageId of pageIds) {
        delete next[pageId]
      }
      return next
    })
    setPagePreviewErrors((current) => {
      const next = { ...current }
      for (const pageId of pageIds) {
        delete next[pageId]
      }
      return next
    })
  }

  function updateSelectedFile(file: File | null) {
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!isPdfFile(file)) {
      setSelectedFile(null)
      setUploadError('Only PDF files can be uploaded.')
      return
    }
    setUploadError('')
    setSelectedFile(file)
  }

  function openFilePicker() {
    if (uploading) {
      return
    }
    fileInputRef.current?.click()
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    openFilePicker()
  }

  function handleDropzoneDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (uploading) {
      return
    }
    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  function handleDropzoneDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (uploading) {
      return
    }
    event.dataTransfer.dropEffect = 'copy'
    setIsDragActive(true)
  }

  function handleDropzoneDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (uploading) {
      return
    }
    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0)
    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }

  function handleDropzoneDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setIsDragActive(false)
    if (uploading) {
      return
    }

    const nextFile = event.dataTransfer.files?.[0] ?? null
    updateSelectedFile(nextFile)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!authSession) {
      setUploadError('Sign in from Settings before uploading protected documents.')
      return
    }
    const session = authSession
    if (!selectedFile) {
      setUploadError('Choose a PDF before uploading.')
      return
    }

    setUploading(true)
    setUploadError('')
    try {
      const uploaded = await uploadPdfDocument(appConfig.apiBase, session, selectedFile, displayName)
      replaceDocument(uploaded)
      setExpandedDocumentIds((current) => ({ ...current, [uploaded.document_id]: true }))
      setSelectedFile(null)
      setDisplayName('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      formElement.reset()
    } catch (error) {
      if (error instanceof ApiError || error instanceof Error) {
        setUploadError(error.message)
      } else {
        setUploadError('Unable to upload the PDF.')
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveDocument(document: DocumentIngestionRecord) {
    if (!authSession) {
      return
    }
    const target = `document:${document.document_id}`
    clearSaveError(target)
    setSavingTarget(target)
    try {
      const updated = await updateDocumentIngestion(
        appConfig.apiBase,
        authSession,
        document.document_id,
        toDocumentUpdatePayload(document),
      )
      replaceDocument(updated)
    } catch (error) {
      setSaveError(target, error instanceof Error ? error.message : 'Unable to save the document review state.')
    } finally {
      setSavingTarget(null)
    }
  }

  async function handleSavePage(document: DocumentIngestionRecord, page: DocumentIngestionPageRecord) {
    if (!authSession) {
      return
    }
    const target = `page:${page.page_id}`
    clearSaveError(target)
    setSavingTarget(target)
    try {
      const updated = await updateDocumentPage(
        appConfig.apiBase,
        authSession,
        document.document_id,
        page.page_id,
        toPageUpdatePayload(page),
      )
      replaceDocument(updated)
    } catch (error) {
      setSaveError(target, error instanceof Error ? error.message : 'Unable to save the page review state.')
    } finally {
      setSavingTarget(null)
    }
  }

  async function handleReprocessDocument(documentId: string) {
    if (!authSession) {
      return
    }
    const target = `reprocess:${documentId}`
    clearSaveError(target)
    setSavingTarget(target)
    try {
      clearPagePreviewsForDocument(documentId)
      const updated = await reprocessDocumentIngestion(appConfig.apiBase, authSession, documentId)
      replaceDocument(updated)
      setExpandedDocumentIds((current) => ({ ...current, [documentId]: true }))
    } catch (error) {
      setSaveError(target, error instanceof Error ? error.message : 'Unable to reprocess the document.')
    } finally {
      setSavingTarget(null)
    }
  }

  function setSchemaFieldValue(
    documentId: string,
    pageId: number,
    fieldKey: string,
    label: string,
    nextValue: string,
  ) {
    updatePageDraft(documentId, pageId, (page) => {
      const normalizedValue = nextValue
      const nextFields = [...page.header_fields]
      const existingIndex = nextFields.findIndex((field) => field.field_key === fieldKey)
      if (normalizedValue.trim()) {
        const nextField: DocumentExtractedFieldRecord = {
          field_key: fieldKey,
          label,
          value: normalizedValue,
          confidence: null,
          source: 'review',
        }
        if (existingIndex >= 0) {
          nextFields[existingIndex] = nextField
        } else {
          nextFields.push(nextField)
        }
      } else if (existingIndex >= 0) {
        nextFields.splice(existingIndex, 1)
      }
      return { ...page, header_fields: nextFields }
    })
  }

  function addCustomField(documentId: string, pageId: number) {
    updatePageDraft(documentId, pageId, (page) => ({
      ...page,
      header_fields: [
        ...page.header_fields,
        {
          field_key: uniqueCustomFieldKey(page.header_fields),
          label: 'Custom Field',
          value: '',
          confidence: null,
          source: 'review',
        },
      ],
    }))
  }

  function updateCustomField(
    documentId: string,
    pageId: number,
    fieldKey: string,
    patch: Partial<DocumentExtractedFieldRecord>,
  ) {
    updatePageDraft(documentId, pageId, (page) => ({
      ...page,
      header_fields: page.header_fields.map((field) =>
        field.field_key === fieldKey
          ? {
              ...field,
              ...patch,
              source: 'review',
            }
          : field,
      ),
    }))
  }

  function removeField(documentId: string, pageId: number, fieldKey: string) {
    updatePageDraft(documentId, pageId, (page) => ({
      ...page,
      header_fields: page.header_fields.filter((field) => field.field_key !== fieldKey),
    }))
  }

  function updateTableBlocks(
    documentId: string,
    pageId: number,
    updater: (blocks: DocumentTableBlockRecord[]) => DocumentTableBlockRecord[],
  ) {
    updatePageDraft(documentId, pageId, (page) => ({
      ...page,
      table_blocks: reindexTableBlocks(updater(page.table_blocks)),
    }))
  }

  function addTableBlock(documentId: string, pageId: number, schema: DocumentKindSchemaRecord | null) {
    const template = schema?.table_templates[0]
    updateTableBlocks(documentId, pageId, (blocks) => [...blocks, buildBlankTableBlock(template)])
  }

  function removeTableBlock(documentId: string, pageId: number, tableIndex: number) {
    updateTableBlocks(documentId, pageId, (blocks) => blocks.filter((_, index) => index !== tableIndex))
  }

  function setTableTemplate(
    documentId: string,
    pageId: number,
    tableIndex: number,
    templateKey: string,
    schema: DocumentKindSchemaRecord | null,
  ) {
    const template = schema?.table_templates.find((candidate) => candidate.template_key === templateKey) ?? null
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) => {
        if (index !== tableIndex) {
          return block
        }
        if (!template) {
          return { ...block, template_key: null, source: 'review' }
        }
        const nextColumns = template.columns.map((column) => column.column_key)
        const nextRows =
          block.rows.length > 0
            ? block.rows.map((row) => Object.fromEntries(nextColumns.map((column) => [column, row[column] ?? ''])))
            : [buildBlankRow(nextColumns)]
        return {
          ...block,
          template_key: template.template_key,
          title: block.title || template.label,
          columns: nextColumns,
          rows: nextRows,
          source: 'review',
        }
      }),
    )
  }

  function updateTableTitle(documentId: string, pageId: number, tableIndex: number, title: string) {
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) => (index === tableIndex ? { ...block, title, source: 'review' } : block)),
    )
  }

  function addTableColumn(documentId: string, pageId: number, tableIndex: number) {
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) => {
        if (index !== tableIndex) {
          return block
        }
        const nextColumn = normalizeKey(`column_${block.columns.length + 1}`) || `column_${block.columns.length + 1}`
        return {
          ...block,
          columns: [...block.columns, nextColumn],
          rows: block.rows.map((row) => ({ ...row, [nextColumn]: '' })),
          source: 'review',
        }
      }),
    )
  }

  function renameTableColumn(
    documentId: string,
    pageId: number,
    tableIndex: number,
    columnIndex: number,
    nextValue: string,
  ) {
    const normalizedColumn = normalizeKey(nextValue)
    if (!normalizedColumn) {
      return
    }

    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) => {
        if (index !== tableIndex) {
          return block
        }
        const previousColumn = block.columns[columnIndex]
        if (!previousColumn || previousColumn === normalizedColumn || block.columns.includes(normalizedColumn)) {
          return block
        }
        const nextColumns = [...block.columns]
        nextColumns[columnIndex] = normalizedColumn
        const nextRows = block.rows.map((row) => {
          const nextRow = { ...row, [normalizedColumn]: row[previousColumn] ?? '' }
          delete nextRow[previousColumn]
          return nextRow
        })
        return {
          ...block,
          columns: nextColumns,
          rows: nextRows,
          source: 'review',
        }
      }),
    )
  }

  function removeTableColumn(documentId: string, pageId: number, tableIndex: number, columnIndex: number) {
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) => {
        if (index !== tableIndex) {
          return block
        }
        const column = block.columns[columnIndex]
        if (!column) {
          return block
        }
        const nextColumns = block.columns.filter((_, nextIndex) => nextIndex !== columnIndex)
        const nextRows = block.rows.map((row) => {
          const nextRow = { ...row }
          delete nextRow[column]
          return nextRow
        })
        return {
          ...block,
          columns: nextColumns,
          rows: nextRows,
          source: 'review',
        }
      }),
    )
  }

  function addTableRow(documentId: string, pageId: number, tableIndex: number) {
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) =>
        index === tableIndex
          ? {
              ...block,
              rows: [...block.rows, buildBlankRow(block.columns)],
              source: 'review',
            }
          : block,
      ),
    )
  }

  function removeTableRow(documentId: string, pageId: number, tableIndex: number, rowIndex: number) {
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) =>
        index === tableIndex
          ? {
              ...block,
              rows: block.rows.filter((_, nextIndex) => nextIndex !== rowIndex),
              source: 'review',
            }
          : block,
      ),
    )
  }

  function updateTableCell(
    documentId: string,
    pageId: number,
    tableIndex: number,
    rowIndex: number,
    column: string,
    value: string,
  ) {
    updateTableBlocks(documentId, pageId, (blocks) =>
      blocks.map((block, index) => {
        if (index !== tableIndex) {
          return block
        }
        const nextRows = block.rows.map((row, nextRowIndex) =>
          nextRowIndex === rowIndex
            ? {
                ...row,
                [column]: value,
              }
            : row,
        )
        return {
          ...block,
          rows: nextRows,
          source: 'review',
        }
      }),
    )
  }

  if (!authSession) {
    return (
      <div className="empty-state">
        <strong>Document intake is protected</strong>
        <p>Sign in from Settings to upload and review PDFs, page classifications, and extracted header or table scaffolding.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <form className="document-ingestion-form" onSubmit={handleSubmit}>
        <div className="document-ingestion-form-grid">
          <div
            className={[
              'document-dropzone',
              isDragActive ? 'document-dropzone-active' : '',
              selectedFile ? 'document-dropzone-has-file' : '',
              uploading ? 'document-dropzone-disabled' : '',
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
            <span className="document-dropzone-eyebrow">PDF</span>
            <strong>{selectedFile ? selectedFile.name : 'Drop PDF Here'}</strong>
            <p>
              {selectedFile
                ? `Ready to upload • ${formatBytes(selectedFile.size)}`
                : 'Drag a PDF into this area, or click to browse from your machine.'}
            </p>
          </div>
          <label>
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
        </div>
        <div className="document-ingestion-form-actions">
          <button type="submit" className="button button-primary" disabled={uploading || !selectedFile}>
            {uploading ? 'Uploading…' : 'Upload PDF'}
          </button>
          <span className="workflow-editor-note">
            Upload stores the source PDF, creates one record per page, and queues background classification plus extraction.
            {schemaRegistry ? ` Review contract ${schemaRegistry.version}.` : ''}
          </span>
        </div>
        {uploadError ? <p className="field-error">{uploadError}</p> : null}
      </form>

      {loading ? (
        <div className="empty-state">
          <strong>Loading document intake</strong>
          <p>Fetching recent PDF ingestions, schema definitions, and review state.</p>
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <strong>Document intake could not load</strong>
          <p>{loadError}</p>
        </div>
      ) : documents.length > 0 ? (
        <div className="document-ingestion-list">
          {documents.map((document) => {
            const isExpanded = expandedDocumentIds[document.document_id] ?? false
            const documentSaveTarget = `document:${document.document_id}`
            const reprocessTarget = `reprocess:${document.document_id}`
            const documentError = saveErrors[documentSaveTarget] ?? saveErrors[reprocessTarget] ?? ''
            const isDocumentProcessing = documentNeedsProcessing(document)

            return (
              <article key={document.document_id} className="position-card shipment-card workflow-item-card document-ingestion-card">
                <div className="shipment-card-head">
                  <div className="shipment-card-copy">
                    <strong>{document.display_name}</strong>
                    <span>
                      {document.original_filename} • {formatBytes(document.size_bytes)} • Uploaded {formatDate(document.created_at)}
                    </span>
                  </div>
                  <div className="document-ingestion-header-actions">
                    <span className={`status-pill status-pill-${documentStatusTone(document.status)}`}>
                      {document.status}
                    </span>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={isDocumentProcessing || savingTarget === reprocessTarget}
                      onClick={() => void handleReprocessDocument(document.document_id)}
                    >
                      {savingTarget === reprocessTarget ? 'Queueing…' : 'Reprocess'}
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() =>
                        setExpandedDocumentIds((current) => ({
                          ...current,
                          [document.document_id]: !isExpanded,
                        }))
                      }
                    >
                      {isExpanded ? 'Hide Review' : 'Review Document'}
                    </button>
                  </div>
                </div>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">{document.page_count} page{document.page_count === 1 ? '' : 's'}</span>
                  <span className="entity-chip entity-chip-soft">{dominantDocumentKind(document)}</span>
                  <span className="entity-chip entity-chip-soft">{document.review_status.replaceAll('_', ' ')}</span>
                  <span className="entity-chip entity-chip-soft">
                    {reviewedPageCount(document)}/{document.page_count} pages reviewed
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    {reviewReady(document) ? 'Ready To Verify' : 'Review Incomplete'}
                  </span>
                </div>
                <div className="document-ingestion-summary">
                  <p>{documentStatusCopy(document)}</p>
                  {document.processing_errors.length > 0 ? (
                    <p className="field-error">{document.processing_errors.join(' ')}</p>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div className="document-review-editor">
                    {isDocumentProcessing ? (
                      <p className="workflow-editor-note">
                        Review fields are temporarily locked while the background processor refreshes page classifications and extracted data.
                      </p>
                    ) : null}
                    <fieldset className="document-review-fieldset" disabled={isDocumentProcessing}>
                      <div className="document-editor-grid">
                        <label>
                          <span>Display Name</span>
                          <input
                            className="control"
                            type="text"
                            value={document.display_name}
                            onChange={(event) =>
                              updateDocumentDraft(document.document_id, (current) => ({
                                ...current,
                                display_name: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Document Review Status</span>
                          <select
                            className="control"
                            value={document.review_status}
                            onChange={(event) =>
                              updateDocumentDraft(document.document_id, (current) => ({
                                ...current,
                                review_status: event.target.value,
                              }))
                            }
                          >
                            {DOCUMENT_REVIEW_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label>
                        <span>Document Review Notes</span>
                        <textarea
                          className="control control-textarea"
                          value={document.review_notes ?? ''}
                          onChange={(event) =>
                            updateDocumentDraft(document.document_id, (current) => ({
                              ...current,
                              review_notes: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="document-editor-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={savingTarget === documentSaveTarget}
                          onClick={() => void handleSaveDocument(document)}
                        >
                          {savingTarget === documentSaveTarget ? 'Saving…' : 'Save Document Review'}
                        </button>
                        <span className="workflow-editor-note">
                          Use `VERIFIED` only after every page is reviewed and required fields or tables are complete.
                        </span>
                      </div>
                      {documentError ? <p className="field-error">{documentError}</p> : null}

                      <div className="document-ingestion-page-grid">
                        {document.pages.map((page) => {
                          const schema = schemaByKind[page.document_kind] ?? null
                          const schemaFieldKeys = new Set(schema?.header_fields.map((field) => field.field_key) ?? [])
                          const customFields = page.header_fields.filter((field) => !schemaFieldKeys.has(field.field_key))
                          const pageSaveTarget = `page:${page.page_id}`
                          const pageError = saveErrors[pageSaveTarget] ?? ''
                          const pagePreviewUrl = pagePreviewUrls[page.page_id] ?? ''
                          const pagePreviewError = pagePreviewErrors[page.page_id] ?? ''
                          const pagePreviewIsLoading = pagePreviewLoading[page.page_id] === true

                          return (
                            <section key={page.page_id} className="document-ingestion-page document-ingestion-page-editor">
                              <div className="document-ingestion-page-head">
                                <strong>Page {page.page_number}</strong>
                                <span className="entity-chip entity-chip-soft">
                                  {page.review_status.replaceAll('_', ' ')}
                                </span>
                              </div>

                              <div className="document-editor-grid">
                                <label>
                                  <span>Document Kind</span>
                                  <select
                                    className="control"
                                    value={page.document_kind}
                                    onChange={(event) =>
                                      updatePageDraft(document.document_id, page.page_id, (current) => ({
                                        ...current,
                                        document_kind: event.target.value,
                                      }))
                                    }
                                  >
                                    {(schemaRegistry?.document_kinds ?? []).map((entry) => (
                                      <option key={entry.document_kind} value={entry.document_kind}>
                                        {entry.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>Subtype</span>
                                  <input
                                    className="control"
                                    type="text"
                                    value={page.document_subtype ?? ''}
                                    onChange={(event) =>
                                      updatePageDraft(document.document_id, page.page_id, (current) => ({
                                        ...current,
                                        document_subtype: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Page Review Status</span>
                                  <select
                                    className="control"
                                    value={page.review_status}
                                    onChange={(event) =>
                                      updatePageDraft(document.document_id, page.page_id, (current) => ({
                                        ...current,
                                        review_status: event.target.value,
                                      }))
                                    }
                                  >
                                    {PAGE_REVIEW_STATUS_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option.replaceAll('_', ' ')}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              <div className="document-page-evidence">
                                <div className="document-page-preview-panel">
                                  <div className="document-page-preview-head">
                                    <strong>Page Preview</strong>
                                    <span className={`status-pill status-pill-${page.preview_available ? 'active' : 'planned'}`}>
                                      {page.preview_available ? 'READY' : 'PENDING'}
                                    </span>
                                  </div>
                                  {page.preview_available ? (
                                    pagePreviewUrl ? (
                                      <img
                                        className="document-page-preview-image"
                                        src={pagePreviewUrl}
                                        alt={`Preview for document page ${page.page_number}`}
                                      />
                                    ) : pagePreviewIsLoading ? (
                                      <p className="workflow-editor-note">Rendering the page preview for review…</p>
                                    ) : pagePreviewError ? (
                                      <p className="field-error">{pagePreviewError}</p>
                                    ) : (
                                      <p className="workflow-editor-note">Preview ready. Loading the rendered page…</p>
                                    )
                                  ) : (
                                    <p className="workflow-editor-note">
                                      The page preview will appear after background rendering completes for this page.
                                    </p>
                                  )}
                                </div>

                                <div className="document-page-evidence-copy">
                                  <div className="document-ingestion-chip-row">
                                    <span className={`status-pill status-pill-${pageTextSourceTone(page)}`}>
                                      {pageTextSourceLabel(page)}
                                    </span>
                                    {page.text_source === 'ocr' ? (
                                      <span className="entity-chip entity-chip-soft">OCR Fallback Used</span>
                                    ) : null}
                                  </div>
                                  <p className="document-ingestion-page-copy">
                                    {page.raw_text_excerpt || 'No extractable text yet. This page will need OCR or image-based parsing.'}
                                  </p>
                                  {schema ? (
                                    <div className="document-schema-note">
                                      <strong>{schema.label}</strong>
                                      <p>{schema.review_guidance}</p>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="document-section">
                              <div className="document-section-head">
                                <strong>Header Fields</strong>
                                <span className="workflow-editor-note">
                                  Required fields: {schema?.header_fields.filter((field) => field.required).map((field) => field.label).join(', ') || 'None'}
                                </span>
                              </div>
                              {schema && schema.header_fields.length > 0 ? (
                                <div className="document-editor-grid">
                                  {schema.header_fields.map((field) => {
                                    const existing = page.header_fields.find((candidate) => candidate.field_key === field.field_key)
                                    return (
                                      <label key={`${page.page_id}-${field.field_key}`}>
                                        <span>
                                          {field.label}
                                          {field.required ? ' *' : ''}
                                        </span>
                                        <input
                                          className="control"
                                          type="text"
                                          value={existing?.value ?? ''}
                                          placeholder={field.description ?? field.label}
                                          onChange={(event) =>
                                            setSchemaFieldValue(
                                              document.document_id,
                                              page.page_id,
                                              field.field_key,
                                              field.label,
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="workflow-editor-note">No schema-defined header fields for this document kind yet.</p>
                              )}

                              <div className="document-extra-field-list">
                                {customFields.map((field) => (
                                  <div key={`${page.page_id}-${field.field_key}`} className="document-extra-field">
                                    <input
                                      className="control"
                                      type="text"
                                      value={field.label}
                                      placeholder="Field label"
                                      onChange={(event) =>
                                        updateCustomField(document.document_id, page.page_id, field.field_key, {
                                          label: event.target.value,
                                        })
                                      }
                                    />
                                    <input
                                      className="control"
                                      type="text"
                                      value={field.value}
                                      placeholder="Field value"
                                      onChange={(event) =>
                                        updateCustomField(document.document_id, page.page_id, field.field_key, {
                                          value: event.target.value,
                                        })
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="button button-ghost"
                                      onClick={() => removeField(document.document_id, page.page_id, field.field_key)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="button button-secondary"
                                  onClick={() => addCustomField(document.document_id, page.page_id)}
                                >
                                  Add Custom Field
                                </button>
                              </div>
                            </div>

                            <div className="document-section">
                              <div className="document-section-head">
                                <strong>Table Blocks</strong>
                                <span className="workflow-editor-note">
                                  Expected templates: {schema?.table_templates.map((template) => template.label).join(', ') || 'Custom only'}
                                </span>
                              </div>
                              {page.table_blocks.map((table, tableIndex) => (
                                <div key={`${page.page_id}-table-${tableIndex}`} className="document-table-editor">
                                  <div className="document-table-editor-head">
                                    <strong>Table {table.table_index}</strong>
                                    <button
                                      type="button"
                                      className="button button-ghost"
                                      onClick={() => removeTableBlock(document.document_id, page.page_id, tableIndex)}
                                    >
                                      Remove Table
                                    </button>
                                  </div>
                                  <div className="document-editor-grid">
                                    <label>
                                      <span>Template</span>
                                      <select
                                        className="control"
                                        value={table.template_key ?? ''}
                                        onChange={(event) =>
                                          setTableTemplate(
                                            document.document_id,
                                            page.page_id,
                                            tableIndex,
                                            event.target.value,
                                            schema,
                                          )
                                        }
                                      >
                                        <option value="">Custom table</option>
                                        {(schema?.table_templates ?? []).map((template) => (
                                          <option key={template.template_key} value={template.template_key}>
                                            {template.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      <span>Title</span>
                                      <input
                                        className="control"
                                        type="text"
                                        value={table.title ?? ''}
                                        onChange={(event) =>
                                          updateTableTitle(document.document_id, page.page_id, tableIndex, event.target.value)
                                        }
                                      />
                                    </label>
                                  </div>

                                  <div className="document-column-list">
                                    {table.columns.map((column, columnIndex) => (
                                      <div key={`${page.page_id}-table-${tableIndex}-column-${columnIndex}`} className="document-column-item">
                                        <input
                                          className="control"
                                          type="text"
                                          value={column}
                                          onChange={(event) =>
                                            renameTableColumn(
                                              document.document_id,
                                              page.page_id,
                                              tableIndex,
                                              columnIndex,
                                              event.target.value,
                                            )
                                          }
                                        />
                                        <button
                                          type="button"
                                          className="button button-ghost"
                                          onClick={() => removeTableColumn(document.document_id, page.page_id, tableIndex, columnIndex)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => addTableColumn(document.document_id, page.page_id, tableIndex)}
                                    >
                                      Add Column
                                    </button>
                                  </div>

                                  <div className="document-table-row-list">
                                    {table.rows.map((row, rowIndex) => (
                                      <div key={`${page.page_id}-table-${tableIndex}-row-${rowIndex}`} className="document-row-card">
                                        <div className="document-row-grid">
                                          {table.columns.map((column) => (
                                            <label key={`${page.page_id}-table-${tableIndex}-row-${rowIndex}-${column}`}>
                                              <span>{humanizeKey(column)}</span>
                                              <input
                                                className="control"
                                                type="text"
                                                value={row[column] ?? ''}
                                                onChange={(event) =>
                                                  updateTableCell(
                                                    document.document_id,
                                                    page.page_id,
                                                    tableIndex,
                                                    rowIndex,
                                                    column,
                                                    event.target.value,
                                                  )
                                                }
                                              />
                                            </label>
                                          ))}
                                        </div>
                                        <button
                                          type="button"
                                          className="button button-ghost"
                                          onClick={() => removeTableRow(document.document_id, page.page_id, tableIndex, rowIndex)}
                                        >
                                          Remove Row
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => addTableRow(document.document_id, page.page_id, tableIndex)}
                                    >
                                      Add Row
                                    </button>
                                  </div>
                                </div>
                              ))}

                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => addTableBlock(document.document_id, page.page_id, schema)}
                              >
                                Add Table Block
                              </button>
                            </div>

                            <label>
                              <span>Page Review Notes</span>
                              <textarea
                                className="control control-textarea"
                                value={page.review_notes ?? ''}
                                onChange={(event) =>
                                  updatePageDraft(document.document_id, page.page_id, (current) => ({
                                    ...current,
                                    review_notes: event.target.value,
                                  }))
                                }
                              />
                            </label>

                            {page.processing_warnings.length > 0 ? (
                              <p className="workflow-editor-note">{page.processing_warnings.join(' ')}</p>
                            ) : null}
                            {page.processing_errors.length > 0 ? (
                              <p className="field-error">{page.processing_errors.join(' ')}</p>
                            ) : null}
                            {pageError ? <p className="field-error">{pageError}</p> : null}

                            <div className="document-editor-actions">
                              <button
                                type="button"
                                className="button button-primary"
                                disabled={savingTarget === pageSaveTarget}
                                onClick={() => void handleSavePage(document, page)}
                              >
                                {savingTarget === pageSaveTarget ? 'Saving…' : `Save Page ${page.page_number}`}
                              </button>
                              <span className="workflow-editor-note">
                                Saving a page revalidates required fields and table templates when the page is marked `REVIEWED`.
                              </span>
                            </div>
                            </section>
                          )
                        })}
                      </div>
                    </fieldset>
                  </div>
                ) : null}
              </article>
            )
          })}
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
