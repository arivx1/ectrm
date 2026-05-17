import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DocumentGmailInboxBrowser } from '../src/features/documents/DocumentGmailInboxBrowser'
import { DocumentIngestionDocumentCard } from '../src/features/documents/DocumentIngestionDocumentCard'
import { DocumentIngestionUploadForm } from '../src/features/documents/DocumentIngestionUploadForm'
import type { DocumentIngestionController } from '../src/features/documents/useDocumentIngestionController'
import type {
  DocumentIngestionPageUnderstandingRecord,
  DocumentIngestionUnderstandingRecord,
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentProcessorRuntimeSettingsRecord,
} from '../src/shared/models'

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
      available_models: ['gpt-5-mini', 'gpt-5', 'gpt-5-nano'],
      base_url: 'https://api.openai.com/v1',
      setup_env_var: 'OPENAI_API_KEY',
    },
    {
      provider: 'anthropic',
      label: 'Claude',
      enabled: false,
      configured: false,
      is_default: false,
      default_model: '',
      available_models: ['claude-sonnet-4-0', 'claude-opus-4-0'],
      base_url: 'https://api.anthropic.com',
      setup_env_var: 'ANTHROPIC_API_KEY',
    },
    {
      provider: 'google',
      label: 'Gemini',
      enabled: false,
      configured: false,
      is_default: false,
      default_model: '',
      available_models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      base_url: 'https://generativelanguage.googleapis.com',
      setup_env_var: 'GOOGLE_API_KEY',
    },
  ],
} satisfies DocumentProcessorRuntimeSettingsRecord

function buildDocumentUnderstanding(
  overrides: Partial<DocumentIngestionUnderstandingRecord> = {},
): DocumentIngestionUnderstandingRecord {
  return {
    bundle_version: 'document-understanding-v1',
    page_count: 1,
    text_stats: {
      pages_with_text: 1,
      source_counts: { none: 0, pdf_text: 1, ocr: 0 },
      total_character_count: 24,
      total_line_count: 1,
      total_token_count: 3,
      total_numeric_token_count: 1,
      total_date_like_value_count: 0,
      total_currency_marker_count: 0,
    },
    structure_signals: {
      header_candidate_count: 0,
      header_candidate_keys: [],
      table_candidate_count: 0,
      table_template_keys: [],
      table_column_count: 0,
      table_column_keys: [],
      table_row_count: 0,
    },
    visual_signals: {
      preview_generated_page_count: 0,
      preview_available_page_count: 0,
      visible_content_page_count: 0,
    },
    content_fingerprint: {
      filename_signature: 'trade confirmation',
      content_features: ['invoice', 'number'],
      content_feature_count: 2,
      learning_version: 'content-similarity-v1',
    },
    deterministic_assessment: {
      assessment_version: 'deterministic-score-v1',
      document_kind: 'INVOICE',
      document_subtype: null,
      confidence: 0.72,
      matched_by: 'filename:invoice',
      supporting_evidence: ['Filename also hints at invoice (invoice).'],
      conflicts: [],
    },
    ...overrides,
  }
}

function buildPageUnderstanding(
  overrides: Partial<DocumentIngestionPageUnderstandingRecord> = {},
): DocumentIngestionPageUnderstandingRecord {
  return {
    bundle_version: 'document-understanding-v1',
    text_stats: {
      source: 'pdf_text',
      text_available: true,
      character_count: 24,
      line_count: 1,
      token_count: 3,
      numeric_token_count: 1,
      date_like_value_count: 0,
      currency_marker_count: 0,
    },
    layout_hints: {
      non_empty_line_count: 1,
      short_line_count: 1,
      uppercase_line_count: 0,
      key_value_line_count: 1,
      table_like_line_count: 0,
    },
    structure_signals: {
      header_candidate_count: 0,
      header_candidate_keys: [],
      table_candidate_count: 0,
      table_template_keys: [],
      table_column_count: 0,
      table_column_keys: [],
      table_row_count: 0,
    },
    visual_signals: {
      preview_generated: false,
      preview_available: false,
      image_has_visible_content: false,
      ocr_used: false,
    },
    content_fingerprint: {
      filename_signature: 'invoice',
      content_features: ['invoice', 'number'],
      content_feature_count: 2,
      learning_version: 'content-similarity-v1',
    },
    classification_evidence: {
      system_document_kind: 'INVOICE',
      system_document_subtype: null,
      system_classification_source: 'heuristic',
      system_classification_confidence: 0.72,
      matched_by: 'filename:invoice',
      corrected: false,
      correction_count: 0,
      corrected_document_kind: null,
      corrected_document_subtype: null,
      learning_applied: false,
      learning_source: null,
      learning_similarity: null,
      learning_example_count: 0,
      automated_document_kind: null,
      automated_document_subtype: null,
    },
    deterministic_assessment: {
      assessment_version: 'deterministic-score-v1',
      document_kind: 'INVOICE',
      document_subtype: null,
      confidence: 0.72,
      matched_by: 'filename:invoice',
      supporting_evidence: ['Filename also hints at invoice (invoice).'],
      conflicts: [],
    },
    ...overrides,
  }
}

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
    understanding: buildDocumentUnderstanding(),
    ...overrides,
  }
}

function buildPage(overrides: Partial<DocumentIngestionPageRecord> = {}): DocumentIngestionPageRecord {
  return {
    page_id: 1,
    page_number: 1,
    classification_status: 'ANALYZED',
    extraction_status: 'ANALYZED',
    document_kind: 'INVOICE',
    document_subtype: null,
    classification_confidence: 0.72,
    classification_payload: {
      system_document_kind: 'INVOICE',
      system_document_subtype: null,
      system_classification_confidence: 0.72,
      system_classification_source: 'heuristic',
      system_matched_by: 'filename:invoice',
      classification_corrected: false,
      learning_applied: false,
      learning_example_count: 0,
      deterministic_assessment: {
        assessment_version: 'deterministic-score-v1',
        document_kind: 'INVOICE',
        document_subtype: null,
        confidence: 0.72,
        matched_by: 'filename:invoice',
        supporting_evidence: ['Filename also hints at invoice (invoice).'],
        conflicts: [],
      },
    },
    header_fields: [],
    table_blocks: [],
    raw_text_excerpt: 'Invoice number INV-9001',
    text_source: 'pdf_text',
    preview_available: false,
    processing_warnings: [],
    processing_errors: [],
    review_status: 'UNREVIEWED',
    review_notes: null,
    reviewed_at: null,
    reviewed_by: null,
    processed_at: '2026-04-14T12:00:00Z',
    processor_trace: null,
    routing_assessment: null,
    understanding: buildPageUnderstanding(),
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
    handleSetDocumentKind: async () => undefined,
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
        selectedProcessorModel: '',
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
        onProcessorModelChange: () => undefined,
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
    expect(markup).toContain('Claude (claude-sonnet-4-0 placeholder)')
    expect(markup).toContain('Gemini (gemini-2.5-pro placeholder)')
    expect(markup).not.toContain('Processing Model')
    expect(markup).toContain('Built-in parsing only will run for this upload.')
    expect(markup).toContain('Claude and Gemini placeholders are visible here and will unlock once those API providers are configured.')
    expect(markup).toContain('Import Gmail PDFs')
    expect(markup).toContain('Gmail inbox import is ready for ops-inbox@example.com')
  })

  it('renders processor model choices when an AI provider is selected', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentIngestionUploadForm, {
        compact: false,
        displayName: '',
        processorSettings: PROCESSOR_SETTINGS,
        selectedProcessorProvider: 'openai',
        selectedProcessorModel: 'gpt-5',
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
        onProcessorModelChange: () => undefined,
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

    expect(markup).toContain('Processing Model')
    expect(markup).toContain('<option value="gpt-5" selected="">gpt-5</option>')
    expect(markup).toContain('gpt-5-nano')
    expect(markup).toContain('OpenAI API (gpt-5) will be used for document processing when the background job runs.')
  })

  it('renders classification correction and learning guidance in the review editor', () => {
    const document = buildDocument({
      analysis_summary: {
        dominant_document_kind: 'TRADE_CONFIRMATION',
        reviewed_page_count: 0,
        review_ready: false,
        corrected_page_count: 1,
        learning_applied_page_count: 0,
      },
      pages: [
        buildPage({
          document_kind: 'TRADE_CONFIRMATION',
          document_subtype: 'DESK_REVIEWED',
          classification_payload: {
            system_document_kind: 'INVOICE',
            system_document_subtype: null,
            system_classification_confidence: 0.72,
            system_classification_source: 'heuristic',
            system_matched_by: 'filename:invoice',
            classification_corrected: true,
            corrected_document_kind: 'TRADE_CONFIRMATION',
            corrected_document_subtype: 'DESK_REVIEWED',
            learning_applied: false,
            learning_example_count: 0,
          },
        }),
      ],
    })
    const controller = buildController(document, {
      expandedDocumentIds: { [document.document_id]: true },
    })

    const markup = renderToStaticMarkup(
      createElement(DocumentIngestionDocumentCard, {
        controller,
        document,
        formatDate: () => 'Apr 14, 2026',
      }),
    )

    expect(markup).toContain('1 corrected page')
    expect(markup).toContain('Corrected from INVOICE to TRADE CONFIRMATION')
    expect(markup).toContain('Future uploads with similar extracted content can reuse this saved classification.')
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
