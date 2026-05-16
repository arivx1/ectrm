import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, test, vi } from 'vitest'

import type { DocumentIngestionController } from '../src/features/documents/useDocumentIngestionController'
import type { DocumentIngestionRecord } from '../src/shared/models'
import { PromptHomeDocumentUploadCard } from '../src/workspaces/prompt/PromptHomeDocumentUploadCard'

const { usePersistentCollapsibleCardStateMock, useDocumentIngestionControllerMock } = vi.hoisted(() => ({
  usePersistentCollapsibleCardStateMock: vi.fn(),
  useDocumentIngestionControllerMock: vi.fn(),
}))

vi.mock('../src/shared/collapsibleCardState', () => ({
  usePersistentCollapsibleCardState: usePersistentCollapsibleCardStateMock,
}))

vi.mock('../src/features/documents/useDocumentIngestionController', () => ({
  useDocumentIngestionController: useDocumentIngestionControllerMock,
}))

function buildDocument(
  overrides: Partial<DocumentIngestionRecord> = {},
): DocumentIngestionRecord {
  return {
    document_id: 'DOC-1001',
    original_filename: 'trade-confirmation.pdf',
    display_name: 'Trade Confirmation',
    content_type: 'application/pdf',
    storage_key: 'documents/DOC-1001.pdf',
    sha256: '0'.repeat(64),
    size_bytes: 4096,
    page_count: 2,
    source_available: true,
    status: 'ANALYZED',
    processor_provider: 'openai',
    processor_model: 'gpt-5-mini',
    classifier_version: 'test-classifier',
    extractor_version: 'test-extractor',
    analysis_summary: {
      dominant_document_kind: 'CONFIRMATION',
      reviewed_page_count: 0,
      review_ready: false,
    },
    processing_errors: [],
    review_status: 'UNREVIEWED',
    review_notes: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-05-10T10:00:00Z',
    created_by: 'ops.docs',
    updated_at: '2026-05-10T10:00:00Z',
    updated_by: 'ops.docs',
    version: 1,
    processor_trace: null,
    routing_assessment: null,
    linkage_assessment: null,
    action_plan: null,
    action_governance: null,
    action_decision_history: [],
    record_links: [],
    pages: [],
    ...overrides,
  }
}

function buildController(
  overrides: Partial<DocumentIngestionController> = {},
): DocumentIngestionController {
  return {
    documents: [],
    processorSettings: null,
    reprocessProviderByDocument: {},
    schemaRegistry: null,
    schemaByKind: {},
    loading: false,
    loadError: '',
    uploading: false,
    uploadError: '',
    gmailImporting: false,
    gmailImportError: '',
    gmailImportSummary: '',
    gmailMessageQuery: '',
    gmailMessages: [],
    gmailMessagesLoading: false,
    gmailMessagesError: '',
    gmailNextPageToken: null,
    selectedGmailMessageId: null,
    selectedGmailMessage: null,
    selectedGmailMessageLoading: false,
    selectedGmailMessageError: '',
    displayName: '',
    selectedProcessorProvider: 'builtin',
    selectedProcessorModel: '',
    selectedFile: null,
    isDragActive: false,
    expandedDocumentIds: {},
    savingTarget: null,
    saveErrors: {},
    pagePreviewUrls: {},
    pagePreviewLoading: {},
    pagePreviewErrors: {},
    fileInputRef: { current: null },
    setDisplayName: () => undefined,
    setSelectedProcessorProvider: () => undefined,
    setSelectedProcessorModel: () => undefined,
    setDocumentReprocessProvider: () => undefined,
    toggleDocumentExpanded: () => undefined,
    updateSelectedFile: () => undefined,
    openFilePicker: () => undefined,
    handleDropzoneKeyDown: () => undefined,
    handleDropzoneDragEnter: () => undefined,
    handleDropzoneDragOver: () => undefined,
    handleDropzoneDragLeave: () => undefined,
    handleDropzoneDrop: () => undefined,
    handleSubmit: async () => undefined,
    handleImportGmailInbox: async () => undefined,
    setGmailMessageQuery: () => undefined,
    handleRefreshGmailMessages: async () => undefined,
    handleLoadMoreGmailMessages: async () => undefined,
    handleSelectGmailMessage: async () => undefined,
    updateDocumentDraft: () => undefined,
    updatePageDraft: () => undefined,
    handleSaveDocument: async () => undefined,
    handleSavePage: async () => undefined,
    handleReprocessDocument: async () => undefined,
    handleExecuteActionPlan: async () => undefined,
    setSchemaFieldValue: () => undefined,
    addCustomField: () => undefined,
    updateCustomField: () => undefined,
    removeField: () => undefined,
    addTableBlock: () => undefined,
    removeTableBlock: () => undefined,
    setTableTemplate: () => undefined,
    updateTableTitle: () => undefined,
    addTableColumn: () => undefined,
    renameTableColumn: () => undefined,
    removeTableColumn: () => undefined,
    addTableRow: () => undefined,
    removeTableRow: () => undefined,
    updateTableCell: () => undefined,
    ...overrides,
  }
}

beforeEach(() => {
  usePersistentCollapsibleCardStateMock.mockReset()
  useDocumentIngestionControllerMock.mockReset()
  usePersistentCollapsibleCardStateMock.mockImplementation(
    (_cardKey: string, defaultExpanded: boolean) => ({
      expanded: defaultExpanded,
      hasPersistedValue: false,
      setExpanded: () => undefined,
    }),
  )
  useDocumentIngestionControllerMock.mockReturnValue(buildController())
})

test('document history renders as a collapsed subcard inside the home upload card', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded: cardKey === 'prompt-home.document-upload-card',
    hasPersistedValue: false,
    setExpanded: () => undefined,
  }))
  useDocumentIngestionControllerMock.mockReturnValue(
    buildController({
      documents: [
        buildDocument(),
        buildDocument({
          document_id: 'DOC-1002',
          original_filename: 'invoice-package.pdf',
          display_name: 'Invoice Package',
          page_count: 4,
          status: 'PROCESSING',
        }),
      ],
    }),
  )

  const markup = renderToStaticMarkup(
    createElement(PromptHomeDocumentUploadCard, {
      authSession: {
        sessionId: 'session-1',
        accessToken: 'token-1',
        expiresAt: '2026-05-11T00:00:00Z',
        user: {
          user_id: 'user-1',
          email: 'ops@example.com',
          display_name: 'Ops User',
          role: 'OPS_ADMIN',
        },
      },
      onOpenLibraryWorkspace: () => undefined,
      onSignIn: () => undefined,
    }),
  )

  assert.match(
    markup,
    /<div class="prompt-home-document-upload-card-copy"><span class="eyebrow">Documents<\/span><strong>Upload documents<\/strong><\/div>/,
  )
  assert.match(markup, /<strong>Document history<\/strong>/)
  assert.match(markup, /2 documents available in the library\./)
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-document-history-panel"/,
  )
  assert.match(
    markup,
    /id="prompt-home-document-history-panel" class="prompt-home-document-upload-history-card-body" hidden=""/,
  )
  assert.doesNotMatch(markup, /Invoice Package/)
})

test('document history renders recent uploads when the subcard is expanded', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded:
      cardKey === 'prompt-home.document-upload-card' ||
      cardKey === 'prompt-home.document-upload-history-card',
    hasPersistedValue: false,
    setExpanded: () => undefined,
  }))
  useDocumentIngestionControllerMock.mockReturnValue(
    buildController({
      documents: [
        buildDocument(),
        buildDocument({
          document_id: 'DOC-1002',
          original_filename: 'invoice-package.pdf',
          display_name: 'Invoice Package',
          page_count: 4,
          status: 'PROCESSING',
        }),
      ],
    }),
  )

  const markup = renderToStaticMarkup(
    createElement(PromptHomeDocumentUploadCard, {
      authSession: {
        sessionId: 'session-1',
        accessToken: 'token-1',
        expiresAt: '2026-05-11T00:00:00Z',
        user: {
          user_id: 'user-1',
          email: 'ops@example.com',
          display_name: 'Ops User',
          role: 'OPS_ADMIN',
        },
      },
      onOpenLibraryWorkspace: () => undefined,
      onSignIn: () => undefined,
    }),
  )

  assert.match(markup, /Hide history/)
  assert.match(markup, /Recent Uploads/)
  assert.match(markup, /Trade Confirmation/)
  assert.match(markup, /Invoice Package/)
  assert.match(markup, /Analyzed · 2 pages/)
  assert.match(markup, /Processing · 4 pages/)
  assert.match(markup, /Open Library/)
  assert.equal((markup.match(/>Open PDF</g) ?? []).length, 2)
})

test('document history marks missing source PDFs as unavailable', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded:
      cardKey === 'prompt-home.document-upload-card' ||
      cardKey === 'prompt-home.document-upload-history-card',
    hasPersistedValue: false,
    setExpanded: () => undefined,
  }))
  useDocumentIngestionControllerMock.mockReturnValue(
    buildController({
      documents: [
        buildDocument({
          document_id: 'DOC-4040',
          display_name: 'Missing Packet',
          original_filename: 'missing-packet.pdf',
          source_available: false,
        }),
      ],
    }),
  )

  const markup = renderToStaticMarkup(
    createElement(PromptHomeDocumentUploadCard, {
      authSession: {
        sessionId: 'session-1',
        accessToken: 'token-1',
        expiresAt: '2026-05-11T00:00:00Z',
        user: {
          user_id: 'user-1',
          email: 'ops@example.com',
          display_name: 'Ops User',
          role: 'OPS_ADMIN',
        },
      },
      onOpenLibraryWorkspace: () => undefined,
      onSignIn: () => undefined,
    }),
  )

  assert.match(markup, /Source PDF is not available in local storage\./)
  assert.match(markup, /disabled="">Source Missing<\/button>/)
})
