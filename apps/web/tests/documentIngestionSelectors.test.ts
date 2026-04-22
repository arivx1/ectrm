import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DocumentIngestionDocumentCard } from '../src/features/documents/DocumentIngestionDocumentCard'
import { DocumentIngestionUploadForm } from '../src/features/documents/DocumentIngestionUploadForm'
import type { DocumentIngestionController } from '../src/features/documents/useDocumentIngestionController'
import type { DocumentIngestionRecord, DocumentProcessorRuntimeSettingsRecord } from '../src/shared/models'

const PROCESSOR_SETTINGS = {
  enabled: true,
  default_provider: 'openai',
  effective_default_provider: 'openai',
  configured_provider_count: 1,
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
      }),
    )

    expect(markup).toContain('Built-in Parser Only')
    expect(markup).toContain('OpenAI API (gpt-5-mini)')
    expect(markup).toContain('Built-in parsing only will run for this upload.')
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
