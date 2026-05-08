import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DocumentGmailInboxBrowser } from '../src/features/documents/DocumentGmailInboxBrowser'
import { DocumentIngestionDocumentCard } from '../src/features/documents/DocumentIngestionDocumentCard'
import { DocumentIngestionUploadForm } from '../src/features/documents/DocumentIngestionUploadForm'
import type { DocumentIngestionController } from '../src/features/documents/useDocumentIngestionController'
import type { DocumentIngestionRecord, DocumentProcessorRuntimeSettingsRecord } from '../src/shared/models'

const PROCESSOR_SETTINGS = {
  enabled: true,
  default_provider: 'openai',
  effective_default_provider: 'openai',
  configured_provider_count: 1,
  gmail_inbox: {
    enabled: true,
    configured: true,
    provider: 'gmail_api',
    account_email: 'ops-inbox@example.com',
    query: 'has:attachment filename:pdf in:inbox',
    max_messages_per_import: 10,
    auth_status: 'configured',
  },
  providers: [
    {
      provider: 'openai',
      label: 'OpenAI API',
      enabled: true,
      configured: true,
      is_default: true,
      default_model: 'gpt-5-mini',
      base_url: 'https://api.openai.com/v1',
      setup_env_var: 'OPENAI_API_KEY',
    },
  ],
} satisfies DocumentProcessorRuntimeSettingsRecord

function buildDocument(overrides: Partial<DocumentIngestionRecord> = {}): DocumentIngestionRecord {
  return {
    document_id: 'DOC-9001',
    original_filename: 'trade-confirmation.pdf',
    display_name: 'Trade Confirmation',
    content_type: 'application/pdf',
    storage_key: 'documents/DOC-9001.pdf',
    sha256: '0'.repeat(64),
    size_bytes: 4096,
    page_count: 1,
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
    created_at: '2026-04-14T12:00:00Z',
    created_by: 'ops.docs',
    updated_at: '2026-04-14T12:00:00Z',
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
  document: DocumentIngestionRecord,
  overrides: Partial<DocumentIngestionController> = {},
): DocumentIngestionController {
  return {
    documents: [document],
    processorSettings: PROCESSOR_SETTINGS,
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
    gmailMessageQuery: 'has:attachment filename:pdf in:inbox',
    gmailMessages: [],
    gmailMessagesLoading: false,
    gmailMessagesError: '',
    gmailNextPageToken: null,
    selectedGmailMessageId: null,
    selectedGmailMessage: null,
    selectedGmailMessageLoading: false,
    selectedGmailMessageError: '',
    displayName: '',
    selectedProcessorProvider: '',
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

describe('document ingestion selectors', () => {
  it('renders built-in parser copy for the upload selector', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentIngestionUploadForm, {
        compact: false,
        displayName: '',
        processorSettings: PROCESSOR_SETTINGS,
        selectedProcessorProvider: 'builtin',
        selectedFile: null,
        schemaRegistry: null,
        uploading: false,
        uploadError: '',
        gmailInboxSettings: PROCESSOR_SETTINGS.gmail_inbox,
        gmailImporting: false,
        gmailImportError: '',
        gmailImportSummary: '',
        isDragActive: false,
        fileInputRef: { current: null },
        onDisplayNameChange: () => undefined,
        onProcessorProviderChange: () => undefined,
        onFileChange: () => undefined,
        onOpenFilePicker: () => undefined,
        onDropzoneKeyDown: () => undefined,
        onDropzoneDragEnter: () => undefined,
        onDropzoneDragOver: () => undefined,
        onDropzoneDragLeave: () => undefined,
        onDropzoneDrop: () => undefined,
        onSubmit: async () => undefined,
        onImportGmailInbox: async () => undefined,
      }),
    )

    expect(markup).toContain('Built-in Parser Only')
    expect(markup).toContain('OpenAI API (gpt-5-mini)')
    expect(markup).toContain('Built-in parsing only will run for this upload.')
    expect(markup).toContain('Import Gmail PDFs')
    expect(markup).toContain('Gmail inbox import is ready for ops-inbox@example.com')
  })

  it('renders the Gmail inbox browser with message detail and attachment status', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentGmailInboxBrowser, {
        compact: false,
        gmailInboxSettings: PROCESSOR_SETTINGS.gmail_inbox,
        gmailMessageQuery: 'label:inbox newer_than:7d',
        gmailMessages: [
          {
            message_id: 'gmail-msg-1',
            thread_id: 'gmail-thread-1',
            subject: 'May Settlement Package',
            sender: 'backoffice@example.com',
            received_at: '2026-05-07T12:00:00Z',
            snippet: 'Settlement statement attached.',
            unread: true,
            attachment_count: 2,
            pdf_attachment_count: 1,
            imported_pdf_attachment_count: 1,
          },
        ],
        gmailMessagesLoading: false,
        gmailMessagesError: '',
        gmailNextPageToken: 'next-page-token',
        selectedGmailMessageId: 'gmail-msg-1',
        selectedGmailMessage: {
          message_id: 'gmail-msg-1',
          thread_id: 'gmail-thread-1',
          subject: 'May Settlement Package',
          sender: 'backoffice@example.com',
          to_recipients: 'ops-inbox@example.com',
          received_at: '2026-05-07T12:00:00Z',
          snippet: 'Settlement statement attached.',
          unread: true,
          body_text: 'Settlement statement attached.\nPlease review by EOD.',
          body_truncated: false,
          attachments: [
            {
              filename: 'settlement.pdf',
              mime_type: 'application/pdf',
              size_bytes: 2048,
              part_token: 'attachment-1',
              attachment_id: 'attachment-1',
              importable: true,
              already_imported: true,
            },
          ],
        },
        selectedGmailMessageLoading: false,
        selectedGmailMessageError: '',
        formatDate: () => 'May 7, 2026 12:00 PM',
        onGmailMessageQueryChange: () => undefined,
        onRefreshGmailMessages: async () => undefined,
        onLoadMoreGmailMessages: async () => undefined,
        onSelectGmailMessage: async () => undefined,
      }),
    )

    expect(markup).toContain('Browse Inbox')
    expect(markup).toContain('May Settlement Package')
    expect(markup).toContain('Settlement statement attached.')
    expect(markup).toContain('Already Imported')
    expect(markup).toContain('Load More')
  })

  it('keeps the current processor chip separate from a draft built-in reprocess selection', () => {
    const document = buildDocument()
    const controller = buildController(document, {
      expandedDocumentIds: { [document.document_id]: true },
      reprocessProviderByDocument: { [document.document_id]: 'builtin' },
    })

    const markup = renderToStaticMarkup(
      createElement(DocumentIngestionDocumentCard, {
        controller,
        document,
        formatDate: () => 'Apr 14, 2026',
      }),
    )

    expect(markup).toContain('Reprocess will use Built-in Parser.')
    expect(markup).toContain('Built-in Parser Only')
    expect(markup).toContain('OpenAI API (gpt-5-mini)')
    expect(markup).toContain('GPT • gpt-5-mini')
  })
})
