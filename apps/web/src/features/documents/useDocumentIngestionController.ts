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
  executeDocumentActionPlan,
  getGmailInboxMessageDetail,
  getDocumentProcessorSettings,
  importGmailInboxDocuments,
  listGmailInboxMessages,
  listDocumentIngestions,
  listDocumentSchemaRegistry,
  reprocessDocumentIngestion,
  updateDocumentIngestion,
  updateDocumentPage,
  uploadPdfDocument,
} from '../../entities/documents/api'
import { ApiError } from '../../shared/api'
import {
  getCollapsibleCardStateValue,
  saveCollapsibleCardStateValue,
} from '../../shared/collapsibleCardState'
import { appConfig } from '../../shared/config'
import type {
  DocumentExtractedFieldRecord,
  DocumentGmailInboxMessageDetailRecord,
  DocumentGmailInboxMessageSummaryRecord,
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentKindSchemaRecord,
  DocumentProcessorRuntimeSettingsRecord,
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
type DocumentProcessorSelectionValue = 'builtin' | 'openai' | 'anthropic' | 'google' | ''

function resolveProcessorModelOptions(
  settings: DocumentProcessorRuntimeSettingsRecord | null,
  provider: DocumentProcessorSelectionValue,
): string[] {
  if (!settings || provider === '' || provider === 'builtin') {
    return []
  }

  const configuredProvider = settings.providers.find(
    (candidate) => candidate.provider === provider,
  )
  if (!configuredProvider) {
    return []
  }

  const modelOptions = configuredProvider.available_models ?? []
  if (modelOptions.length > 0) {
    return modelOptions
  }

  return configuredProvider.default_model ? [configuredProvider.default_model] : []
}

function isSelectableProcessorProvider(
  settings: DocumentProcessorRuntimeSettingsRecord | null,
  provider: DocumentProcessorSelectionValue,
): boolean {
  if (provider === '' || provider === 'builtin') {
    return true
  }

  return settings?.providers.some((candidate) => candidate.provider === provider && candidate.configured) ?? false
}

function resolveDefaultProcessorModel(
  settings: DocumentProcessorRuntimeSettingsRecord | null,
  provider: DocumentProcessorSelectionValue,
): string {
  return resolveProcessorModelOptions(settings, provider)[0] ?? ''
}

export type DocumentIngestionController = {
  documents: DocumentIngestionRecord[]
  processorSettings: DocumentProcessorRuntimeSettingsRecord | null
  reprocessProviderByDocument: Record<string, DocumentProcessorSelectionValue>
  schemaRegistry: DocumentSchemaRegistryRecord | null
  schemaByKind: Record<string, DocumentKindSchemaRecord>
  loading: boolean
  loadError: string
  uploading: boolean
  uploadError: string
  gmailImporting: boolean
  gmailImportError: string
  gmailImportSummary: string
  gmailMessageQuery: string
  gmailMessages: DocumentGmailInboxMessageSummaryRecord[]
  gmailMessagesLoading: boolean
  gmailMessagesError: string
  gmailNextPageToken: string | null
  selectedGmailMessageId: string | null
  selectedGmailMessage: DocumentGmailInboxMessageDetailRecord | null
  selectedGmailMessageLoading: boolean
  selectedGmailMessageError: string
  displayName: string
  selectedProcessorProvider: DocumentProcessorSelectionValue
  selectedProcessorModel: string
  selectedFile: File | null
  isDragActive: boolean
  lastUploadedDocumentId: string | null
  lastImportedDocumentIds: string[]
  expandedDocumentIds: Record<string, boolean>
  savingTarget: string | null
  saveErrors: Record<string, string>
  pagePreviewUrls: Record<number, string>
  pagePreviewLoading: Record<number, boolean>
  pagePreviewErrors: Record<number, string>
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  setDisplayName: (value: string) => void
  setSelectedProcessorProvider: (value: DocumentProcessorSelectionValue) => void
  setSelectedProcessorModel: (value: string) => void
  setDocumentReprocessProvider: (documentId: string, value: DocumentProcessorSelectionValue) => void
  toggleDocumentExpanded: (documentId: string) => void
  updateSelectedFile: (file: File | null) => void
  openFilePicker: () => void
  handleDropzoneKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  handleDropzoneDragEnter: (event: DragEvent<HTMLDivElement>) => void
  handleDropzoneDragOver: (event: DragEvent<HTMLDivElement>) => void
  handleDropzoneDragLeave: (event: DragEvent<HTMLDivElement>) => void
  handleDropzoneDrop: (event: DragEvent<HTMLDivElement>) => void
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleImportGmailInbox: () => Promise<void>
  setGmailMessageQuery: (value: string) => void
  handleRefreshGmailMessages: () => Promise<void>
  handleLoadMoreGmailMessages: () => Promise<void>
  handleSelectGmailMessage: (messageId: string) => Promise<void>
  updateDocumentDraft: (documentId: string, updater: DocumentDraftUpdater) => void
  updatePageDraft: (documentId: string, pageId: number, updater: PageDraftUpdater) => void
  handleSaveDocument: (document: DocumentIngestionRecord) => Promise<void>
  handleSetDocumentKind: (document: DocumentIngestionRecord, documentKind: string) => Promise<void>
  handleSavePage: (document: DocumentIngestionRecord, page: DocumentIngestionPageRecord) => Promise<void>
  handleReprocessDocument: (document: DocumentIngestionRecord) => Promise<void>
  handleExecuteActionPlan: (document: DocumentIngestionRecord) => Promise<void>
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
  const [processorSettings, setProcessorSettings] = useState<DocumentProcessorRuntimeSettingsRecord | null>(null)
  const [reprocessProviderByDocument, setReprocessProviderByDocument] = useState<
    Record<string, 'builtin' | 'openai' | 'anthropic' | 'google' | ''>
  >({})
  const [schemaRegistry, setSchemaRegistry] = useState<DocumentSchemaRegistryRecord | null>(null)
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [gmailImporting, setGmailImporting] = useState(false)
  const [gmailImportError, setGmailImportError] = useState('')
  const [gmailImportSummary, setGmailImportSummary] = useState('')
  const [gmailMessageQuery, setGmailMessageQuery] = useState('')
  const [gmailMessages, setGmailMessages] = useState<DocumentGmailInboxMessageSummaryRecord[]>([])
  const [gmailMessagesLoading, setGmailMessagesLoading] = useState(false)
  const [gmailMessagesError, setGmailMessagesError] = useState('')
  const [gmailNextPageToken, setGmailNextPageToken] = useState<string | null>(null)
  const [selectedGmailMessageId, setSelectedGmailMessageId] = useState<string | null>(null)
  const [selectedGmailMessage, setSelectedGmailMessage] = useState<DocumentGmailInboxMessageDetailRecord | null>(null)
  const [selectedGmailMessageLoading, setSelectedGmailMessageLoading] = useState(false)
  const [selectedGmailMessageError, setSelectedGmailMessageError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [selectedProcessorProviderState, setSelectedProcessorProviderState] =
    useState<DocumentProcessorSelectionValue>('')
  const [selectedProcessorModel, setSelectedProcessorModelState] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [lastUploadedDocumentId, setLastUploadedDocumentId] = useState<string | null>(null)
  const [lastImportedDocumentIds, setLastImportedDocumentIds] = useState<string[]>([])
  const [savingTarget, setSavingTarget] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const selectedProcessorProvider = selectedProcessorProviderState

  function documentExpansionCardKey(documentId: string): string {
    return `document-ingestion.review.${documentId}`
  }

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

  async function loadSelectedGmailMessage(session: StoredAuthSession, messageId: string) {
    setSelectedGmailMessageId(messageId)
    setSelectedGmailMessageLoading(true)
    setSelectedGmailMessageError('')
    try {
      const detail = await getGmailInboxMessageDetail(appConfig.apiBase, session, messageId)
      setSelectedGmailMessage(detail)
    } catch (error) {
      setSelectedGmailMessage(null)
      if (error instanceof ApiError || error instanceof Error) {
        setSelectedGmailMessageError(error.message)
      } else {
        setSelectedGmailMessageError('Unable to load the Gmail message.')
      }
    } finally {
      setSelectedGmailMessageLoading(false)
    }
  }

  async function refreshGmailMessages(
    session: StoredAuthSession,
    options: {
      query?: string | null
      pageToken?: string | null
      append?: boolean
      preserveSelection?: boolean
      reloadSelection?: boolean
    } = {},
  ) {
    const resolvedQuery =
      options.query?.trim() ||
      gmailMessageQuery.trim() ||
      processorSettings?.gmail_inbox?.query?.trim() ||
      ''

    setGmailMessagesLoading(true)
    setGmailMessagesError('')
    try {
      const result = await listGmailInboxMessages(appConfig.apiBase, session, {
        query: resolvedQuery,
        page_size: 20,
        page_token: options.pageToken ?? null,
      })
      setGmailMessageQuery(resolvedQuery)
      setGmailNextPageToken(result.next_page_token)
      setGmailMessages((current) => {
        if (!options.append) {
          return result.messages
        }
        const merged = [...current]
        for (const message of result.messages) {
          if (!merged.some((existing) => existing.message_id === message.message_id)) {
            merged.push(message)
          }
        }
        return merged
      })

      if (options.append) {
        return
      }

      const selectedMessageId =
        options.preserveSelection && selectedGmailMessageId
          ? result.messages.some((message) => message.message_id === selectedGmailMessageId)
            ? selectedGmailMessageId
            : null
          : null

      const nextSelectedMessageId = selectedMessageId ?? result.messages[0]?.message_id ?? null
      if (!nextSelectedMessageId) {
        setSelectedGmailMessageId(null)
        setSelectedGmailMessage(null)
        setSelectedGmailMessageError('')
        return
      }

      if (!options.reloadSelection && nextSelectedMessageId === selectedGmailMessageId) {
        setSelectedGmailMessageId(nextSelectedMessageId)
        return
      }

      await loadSelectedGmailMessage(session, nextSelectedMessageId)
    } catch (error) {
      if (error instanceof ApiError || error instanceof Error) {
        setGmailMessagesError(error.message)
      } else {
        setGmailMessagesError('Unable to load Gmail inbox messages.')
      }
    } finally {
      setGmailMessagesLoading(false)
    }
  }

  useEffect(() => {
    if (!authSession) {
      setDocuments([])
      setProcessorSettings(null)
      setReprocessProviderByDocument({})
      setSchemaRegistry(null)
      setLoadError('')
      setLoading(false)
      setUploadError('')
      setUploading(false)
      setGmailImporting(false)
      setGmailImportError('')
      setGmailImportSummary('')
      setGmailMessageQuery('')
      setGmailMessages([])
      setGmailMessagesLoading(false)
      setGmailMessagesError('')
      setGmailNextPageToken(null)
      setSelectedGmailMessageId(null)
      setSelectedGmailMessage(null)
      setSelectedGmailMessageLoading(false)
      setSelectedGmailMessageError('')
      setSavingTarget(null)
      setSaveErrors({})
      setDisplayName('')
      setSelectedProcessorProviderState('')
      setSelectedProcessorModelState('')
      setSelectedFile(null)
      setIsDragActive(false)
      setLastUploadedDocumentId(null)
      setLastImportedDocumentIds([])
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
        const [nextProcessorSettings, nextRegistry, nextDocuments] = await Promise.all([
          getDocumentProcessorSettings(appConfig.apiBase, session),
          listDocumentSchemaRegistry(appConfig.apiBase, session),
          listDocumentIngestions(appConfig.apiBase, session),
        ])
        const configuredGmailInbox = nextProcessorSettings.gmail_inbox?.configured
          ? nextProcessorSettings.gmail_inbox
          : null
        const nextGmailQuery = configuredGmailInbox?.query?.trim() ?? ''
        let nextGmailMessages: DocumentGmailInboxMessageSummaryRecord[] = []
        let nextGmailPageToken: string | null = null
        let nextSelectedGmailMessage: DocumentGmailInboxMessageDetailRecord | null = null
        let nextSelectedGmailMessageId: string | null = null
        let nextGmailMessagesError = ''
        let nextSelectedGmailMessageError = ''

        if (configuredGmailInbox && nextGmailQuery) {
          try {
            const gmailBrowseResult = await listGmailInboxMessages(appConfig.apiBase, session, {
              query: nextGmailQuery,
              page_size: 20,
            })
            nextGmailMessages = gmailBrowseResult.messages
            nextGmailPageToken = gmailBrowseResult.next_page_token
            nextSelectedGmailMessageId = gmailBrowseResult.messages[0]?.message_id ?? null
            if (nextSelectedGmailMessageId) {
              try {
                nextSelectedGmailMessage = await getGmailInboxMessageDetail(
                  appConfig.apiBase,
                  session,
                  nextSelectedGmailMessageId,
                )
              } catch (error) {
                nextSelectedGmailMessageError =
                  error instanceof Error ? error.message : 'Unable to load the Gmail message.'
              }
            }
          } catch (error) {
            nextGmailMessagesError =
              error instanceof Error ? error.message : 'Unable to load Gmail inbox messages.'
          }
        }
        if (!cancelled) {
          setProcessorSettings(nextProcessorSettings)
          setSchemaRegistry(nextRegistry)
          setDocuments(nextDocuments)
          setGmailMessageQuery(nextGmailQuery)
          setGmailMessages(nextGmailMessages)
          setGmailMessagesError(nextGmailMessagesError)
          setGmailNextPageToken(nextGmailPageToken)
          setSelectedGmailMessageId(nextSelectedGmailMessageId)
          setSelectedGmailMessage(nextSelectedGmailMessage)
          setSelectedGmailMessageError(nextSelectedGmailMessageError)
          setExpandedDocumentIds((current) => ({
            ...current,
            ...Object.fromEntries(
              nextDocuments.map((document) => [
                document.document_id,
                getCollapsibleCardStateValue(
                  documentExpansionCardKey(document.document_id),
                  current[document.document_id] ?? false,
                ),
              ]),
            ),
          }))
          setSelectedProcessorProviderState((current) => {
            const configuredProviders = new Set(
              nextProcessorSettings.providers.filter((provider) => provider.configured).map((provider) => provider.provider),
            )
            if (
              current === 'builtin' ||
              (current !== '' && configuredProviders.has(current as 'openai' | 'anthropic' | 'google'))
            ) {
              return current
            }
            return nextProcessorSettings.effective_default_provider ?? ''
          })
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        setLoadError(error instanceof Error ? error.message : 'Unable to load document intake records.')
      } finally {
        if (!cancelled) {
          setLoading(false)
          setGmailMessagesLoading(false)
          setSelectedGmailMessageLoading(false)
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

  useEffect(() => {
    if (selectedProcessorProvider === '' || selectedProcessorProvider === 'builtin') {
      if (selectedProcessorModel) {
        setSelectedProcessorModelState('')
      }
      return
    }

    const modelOptions = resolveProcessorModelOptions(processorSettings, selectedProcessorProvider)
    if (modelOptions.length === 0) {
      if (selectedProcessorModel) {
        setSelectedProcessorModelState('')
      }
      return
    }

    if (!selectedProcessorModel || !modelOptions.includes(selectedProcessorModel)) {
      setSelectedProcessorModelState(modelOptions[0] ?? '')
    }
  }, [processorSettings, selectedProcessorModel, selectedProcessorProvider])

  function replaceDocument(nextDocument: DocumentIngestionRecord) {
    setReprocessProviderByDocument((current) => {
      if (!(nextDocument.document_id in current)) {
        return current
      }
      const nextState = { ...current }
      delete nextState[nextDocument.document_id]
      return nextState
    })
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

  function setSelectedProcessorProvider(value: DocumentProcessorSelectionValue) {
    const nextValue = isSelectableProcessorProvider(processorSettings, value) ? value : 'builtin'
    setSelectedProcessorProviderState(nextValue)
    setSelectedProcessorModelState((current) => {
      if (nextValue === '' || nextValue === 'builtin') {
        return ''
      }
      const modelOptions = resolveProcessorModelOptions(processorSettings, nextValue)
      if (current && modelOptions.includes(current)) {
        return current
      }
      return resolveDefaultProcessorModel(processorSettings, nextValue)
    })
  }

  function setSelectedProcessorModel(value: string) {
    setSelectedProcessorModelState(value)
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
    setExpandedDocumentIds((current) => {
      const nextExpanded = !current[documentId]
      saveCollapsibleCardStateValue(documentExpansionCardKey(documentId), nextExpanded)
      return {
        ...current,
        [documentId]: nextExpanded,
      }
    })
  }

  function setDocumentReprocessProvider(
    documentId: string,
    value: 'builtin' | 'openai' | 'anthropic' | 'google' | '',
  ) {
    setReprocessProviderByDocument((current) => {
      if (!value) {
        if (!(documentId in current)) {
          return current
        }
        const nextState = { ...current }
        delete nextState[documentId]
        return nextState
      }
      return { ...current, [documentId]: value }
    })
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
      setUploadError('Sign in before uploading protected documents.')
      return
    }
    const session = authSession
    if (!selectedFile) {
      setUploadError('Choose a PDF before uploading.')
      return
    }

    setUploading(true)
    setUploadError('')
    setLastUploadedDocumentId(null)
    try {
      const uploaded = await uploadPdfDocument(
        appConfig.apiBase,
        session,
        selectedFile,
        displayName,
        selectedProcessorProvider || null,
        selectedProcessorProvider === 'builtin' ? null : selectedProcessorModel || null,
      )
      replaceDocument(uploaded)
      setExpandedDocumentIds((current) => ({ ...current, [uploaded.document_id]: true }))
      setSelectedFile(null)
      setDisplayName('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      formElement.reset()
      setLastUploadedDocumentId(uploaded.document_id)
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

  async function handleImportGmailInbox() {
    if (!authSession) {
      setGmailImportError('Sign in before importing Gmail inbox attachments.')
      return
    }

    setGmailImporting(true)
    setGmailImportError('')
    setGmailImportSummary('')
    setLastImportedDocumentIds([])
    try {
      const result = await importGmailInboxDocuments(appConfig.apiBase, authSession)
      const refreshedDocuments = await listDocumentIngestions(appConfig.apiBase, authSession)
      setDocuments(refreshedDocuments)
      setLastImportedDocumentIds(
        result.imported_documents.map((document) => document.document_id),
      )
      if (result.imported_documents.length > 0) {
        setExpandedDocumentIds((current) => ({
          ...current,
          ...Object.fromEntries(result.imported_documents.map((document) => [document.document_id, true])),
        }))
      }
      const warningSuffix = result.warnings.length > 0 ? ` ${result.warnings.length} warning(s) recorded.` : ''
      setGmailImportSummary(
        `Imported ${result.imported_count} Gmail PDF attachment${result.imported_count === 1 ? '' : 's'} and skipped ${result.skipped_count}.${warningSuffix}`,
      )
      if (processorSettings?.gmail_inbox?.configured) {
        await refreshGmailMessages(authSession, {
          preserveSelection: true,
          reloadSelection: true,
        })
      }
    } catch (error) {
      if (error instanceof ApiError || error instanceof Error) {
        setGmailImportError(error.message)
      } else {
        setGmailImportError('Unable to import Gmail inbox attachments.')
      }
    } finally {
      setGmailImporting(false)
    }
  }

  async function handleRefreshGmailMessages() {
    if (!authSession) {
      setGmailMessagesError('Sign in before browsing Gmail inbox messages.')
      return
    }
    await refreshGmailMessages(authSession, {
      query: gmailMessageQuery,
      preserveSelection: true,
      reloadSelection: true,
    })
  }

  async function handleLoadMoreGmailMessages() {
    if (!authSession || !gmailNextPageToken) {
      return
    }
    await refreshGmailMessages(authSession, {
      query: gmailMessageQuery,
      pageToken: gmailNextPageToken,
      append: true,
      preserveSelection: true,
      reloadSelection: false,
    })
  }

  async function handleSelectGmailMessage(messageId: string) {
    if (!authSession) {
      setSelectedGmailMessageError('Sign in before opening Gmail inbox messages.')
      return
    }
    await loadSelectedGmailMessage(authSession, messageId)
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

  async function handleSetDocumentKind(document: DocumentIngestionRecord, documentKind: string) {
    if (!authSession) {
      return
    }
    const target = `document-kind:${document.document_id}`
    clearSaveError(target)
    setSavingTarget(target)
    try {
      const updated = await updateDocumentIngestion(
        appConfig.apiBase,
        authSession,
        document.document_id,
        { document_kind: documentKind },
      )
      replaceDocument(updated)
    } catch (error) {
      setSaveError(target, error instanceof Error ? error.message : 'Unable to save the document type.')
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

  async function handleReprocessDocument(document: DocumentIngestionRecord) {
    if (!authSession) {
      return
    }
    const documentId = document.document_id
    const target = `reprocess:${documentId}`
    clearSaveError(target)
    setSavingTarget(target)
    try {
      clearPagePreviewsForDocument(documentId)
      const reprocessProvider =
        reprocessProviderByDocument[documentId] || document.processor_provider || processorSettings?.effective_default_provider || null
      const updated = await reprocessDocumentIngestion(
        appConfig.apiBase,
        authSession,
        documentId,
        reprocessProvider,
      )
      replaceDocument(updated)
      setExpandedDocumentIds((current) => ({ ...current, [documentId]: true }))
    } catch (error) {
      setSaveError(target, error instanceof Error ? error.message : 'Unable to reprocess the document.')
    } finally {
      setSavingTarget(null)
    }
  }

  async function handleExecuteActionPlan(document: DocumentIngestionRecord) {
    if (!authSession) {
      return
    }
    const target = `execute:${document.document_id}`
    clearSaveError(target)
    setSavingTarget(target)
    try {
      const updated = await executeDocumentActionPlan(
        appConfig.apiBase,
        authSession,
        document.document_id,
      )
      replaceDocument(updated)
      setExpandedDocumentIds((current) => ({ ...current, [document.document_id]: true }))
    } catch (error) {
      setSaveError(target, error instanceof Error ? error.message : 'Unable to execute the document action plan.')
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
    processorSettings,
    reprocessProviderByDocument,
    schemaRegistry,
    schemaByKind,
    loading,
    loadError,
    uploading,
    uploadError,
    gmailImporting,
    gmailImportError,
    gmailImportSummary,
    gmailMessageQuery,
    gmailMessages,
    gmailMessagesLoading,
    gmailMessagesError,
    gmailNextPageToken,
    selectedGmailMessageId,
    selectedGmailMessage,
    selectedGmailMessageLoading,
    selectedGmailMessageError,
    displayName,
    selectedProcessorProvider,
    selectedProcessorModel,
    selectedFile,
    isDragActive,
    lastUploadedDocumentId,
    lastImportedDocumentIds,
    expandedDocumentIds,
    savingTarget,
    saveErrors,
    pagePreviewUrls,
    pagePreviewLoading,
    pagePreviewErrors,
    fileInputRef,
    setDisplayName,
    setSelectedProcessorProvider,
    setSelectedProcessorModel,
    setDocumentReprocessProvider,
    toggleDocumentExpanded,
    updateSelectedFile,
    openFilePicker,
    handleDropzoneKeyDown,
    handleDropzoneDragEnter,
    handleDropzoneDragOver,
    handleDropzoneDragLeave,
    handleDropzoneDrop,
    handleSubmit,
    handleImportGmailInbox,
    setGmailMessageQuery,
    handleRefreshGmailMessages,
    handleLoadMoreGmailMessages,
    handleSelectGmailMessage,
    updateDocumentDraft,
    updatePageDraft,
    handleSaveDocument,
    handleSetDocumentKind,
    handleSavePage,
    handleReprocessDocument,
    handleExecuteActionPlan,
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
