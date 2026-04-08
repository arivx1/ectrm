import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react'
import {
  listDocumentIngestions,
  listDocumentSchemaRegistry,
  reprocessDocumentIngestion,
  updateDocumentIngestion,
  updateDocumentPage,
  uploadPdfDocument,
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
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildBlankRow,
  buildBlankTableBlock,
  documentNeedsProcessing,
  isPdfFile,
  normalizeKey,
  reindexTableBlocks,
  toDocumentUpdatePayload,
  toPageUpdatePayload,
  uniqueCustomFieldKey,
} from './documentIngestionUtils'
import { useDocumentPagePreviewCache } from './useDocumentPagePreviewCache'

type DocumentDraftUpdater = (document: DocumentIngestionRecord) => DocumentIngestionRecord
type PageDraftUpdater = (page: DocumentIngestionPageRecord) => DocumentIngestionPageRecord

export type DocumentIngestionController = {
  documents: DocumentIngestionRecord[]
  schemaRegistry: DocumentSchemaRegistryRecord | null
  schemaByKind: Record<string, DocumentKindSchemaRecord>
  loading: boolean
  loadError: string
  uploading: boolean
  uploadError: string
  displayName: string
  selectedFile: File | null
  isDragActive: boolean
  expandedDocumentIds: Record<string, boolean>
  savingTarget: string | null
  saveErrors: Record<string, string>
  pagePreviewUrls: Record<number, string>
  pagePreviewLoading: Record<number, boolean>
  pagePreviewErrors: Record<number, string>
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  setDisplayName: (value: string) => void
  toggleDocumentExpanded: (documentId: string) => void
  updateSelectedFile: (file: File | null) => void
  openFilePicker: () => void
  handleDropzoneKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  handleDropzoneDragEnter: (event: DragEvent<HTMLDivElement>) => void
  handleDropzoneDragOver: (event: DragEvent<HTMLDivElement>) => void
  handleDropzoneDragLeave: (event: DragEvent<HTMLDivElement>) => void
  handleDropzoneDrop: (event: DragEvent<HTMLDivElement>) => void
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  updateDocumentDraft: (documentId: string, updater: DocumentDraftUpdater) => void
  updatePageDraft: (documentId: string, pageId: number, updater: PageDraftUpdater) => void
  handleSaveDocument: (document: DocumentIngestionRecord) => Promise<void>
  handleSavePage: (document: DocumentIngestionRecord, page: DocumentIngestionPageRecord) => Promise<void>
  handleReprocessDocument: (documentId: string) => Promise<void>
  setSchemaFieldValue: (documentId: string, pageId: number, fieldKey: string, label: string, nextValue: string) => void
  addCustomField: (documentId: string, pageId: number) => void
  updateCustomField: (documentId: string, pageId: number, fieldKey: string, patch: Partial<DocumentExtractedFieldRecord>) => void
  removeField: (documentId: string, pageId: number, fieldKey: string) => void
  addTableBlock: (documentId: string, pageId: number, schema: DocumentKindSchemaRecord | null) => void
  removeTableBlock: (documentId: string, pageId: number, tableIndex: number) => void
  setTableTemplate: (documentId: string, pageId: number, tableIndex: number, templateKey: string, schema: DocumentKindSchemaRecord | null) => void
  updateTableTitle: (documentId: string, pageId: number, tableIndex: number, title: string) => void
  addTableColumn: (documentId: string, pageId: number, tableIndex: number) => void
  renameTableColumn: (documentId: string, pageId: number, tableIndex: number, columnIndex: number, nextValue: string) => void
  removeTableColumn: (documentId: string, pageId: number, tableIndex: number, columnIndex: number) => void
  addTableRow: (documentId: string, pageId: number, tableIndex: number) => void
  removeTableRow: (documentId: string, pageId: number, tableIndex: number, rowIndex: number) => void
  updateTableCell: (documentId: string, pageId: number, tableIndex: number, rowIndex: number, column: string, value: string) => void
}

type UseDocumentIngestionControllerArgs = {
  authSession: StoredAuthSession | null
}

export function useDocumentIngestionController({
  authSession,
}: UseDocumentIngestionControllerArgs): DocumentIngestionController {
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)

  const schemaByKind = useMemo(() => {
    const entries = schemaRegistry?.document_kinds ?? []
    return Object.fromEntries(entries.map((schema) => [schema.document_kind, schema])) as Record<string, DocumentKindSchemaRecord>
  }, [schemaRegistry])

  const hasProcessingDocuments = useMemo(
    () => documents.some((document) => documentNeedsProcessing(document)),
    [documents],
  )

  const {
    pagePreviewUrls,
    pagePreviewLoading,
    pagePreviewErrors,
    clearPagePreviewsForDocument,
  } = useDocumentPagePreviewCache({
    authSession,
    documents,
    expandedDocumentIds,
  })

  useEffect(() => {
    if (!authSession) {
      setDocuments([])
      setSchemaRegistry(null)
      setExpandedDocumentIds({})
      setLoadError('')
      setLoading(false)
      setUploadError('')
      setUploading(false)
      setSavingTarget(null)
      setSaveErrors({})
      setDisplayName('')
      setSelectedFile(null)
      setIsDragActive(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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

  function updateDocumentDraft(documentId: string, updater: DocumentDraftUpdater) {
    setDocuments((current) =>
      current.map((document) => (document.document_id === documentId ? updater(document) : document)),
    )
  }

  function updatePageDraft(documentId: string, pageId: number, updater: PageDraftUpdater) {
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

  function toggleDocumentExpanded(documentId: string) {
    setExpandedDocumentIds((current) => ({
      ...current,
      [documentId]: !current[documentId],
    }))
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
      const nextFields = [...page.header_fields]
      const existingIndex = nextFields.findIndex((field) => field.field_key === fieldKey)
      if (nextValue.trim()) {
        const nextField: DocumentExtractedFieldRecord = {
          field_key: fieldKey,
          label,
          value: nextValue,
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

  return {
    documents,
    schemaRegistry,
    schemaByKind,
    loading,
    loadError,
    uploading,
    uploadError,
    displayName,
    selectedFile,
    isDragActive,
    expandedDocumentIds,
    savingTarget,
    saveErrors,
    pagePreviewUrls,
    pagePreviewLoading,
    pagePreviewErrors,
    fileInputRef,
    setDisplayName,
    toggleDocumentExpanded,
    updateSelectedFile,
    openFilePicker,
    handleDropzoneKeyDown,
    handleDropzoneDragEnter,
    handleDropzoneDragOver,
    handleDropzoneDragLeave,
    handleDropzoneDrop,
    handleSubmit,
    updateDocumentDraft,
    updatePageDraft,
    handleSaveDocument,
    handleSavePage,
    handleReprocessDocument,
    setSchemaFieldValue,
    addCustomField,
    updateCustomField,
    removeField,
    addTableBlock,
    removeTableBlock,
    setTableTemplate,
    updateTableTitle,
    addTableColumn,
    renameTableColumn,
    removeTableColumn,
    addTableRow,
    removeTableRow,
    updateTableCell,
  }
}
