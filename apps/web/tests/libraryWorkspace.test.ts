import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentIngestionController } from '../src/features/documents/useDocumentIngestionController'
import type { DocumentIngestionRecord, DocumentIngestionUnderstandingRecord } from '../src/shared/models'
import { LibraryWorkspace } from '../src/workspaces/library/LibraryWorkspace'

const {
  usePersistentCollapsibleCardStateMock,
  useDocumentIngestionControllerMock,
  useDocumentLibraryFolderStateMock,
} = vi.hoisted(() => ({
  usePersistentCollapsibleCardStateMock: vi.fn(),
  useDocumentIngestionControllerMock: vi.fn(),
  useDocumentLibraryFolderStateMock: vi.fn(),
}))

vi.mock('../src/shared/collapsibleCardState', () => ({
  usePersistentCollapsibleCardState: usePersistentCollapsibleCardStateMock,
}))

vi.mock('../src/features/documents/useDocumentIngestionController', () => ({
  useDocumentIngestionController: useDocumentIngestionControllerMock,
}))

vi.mock('../src/workspaces/library/libraryFolderState', () => ({
  useDocumentLibraryFolderState: useDocumentLibraryFolderStateMock,
}))

function buildDocumentUnderstanding(
  overrides: Partial<DocumentIngestionUnderstandingRecord> = {},
): DocumentIngestionUnderstandingRecord {
  return {
    bundle_version: 'document-understanding-v1',
    page_count: 1,
    text_stats: {
      pages_with_text: 1,
      source_counts: { none: 0, pdf_text: 1, ocr: 0 },
      total_character_count: 32,
      total_line_count: 2,
      total_token_count: 5,
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
      filename_signature: 'vessel nomination',
      content_features: ['vessel', 'nomination'],
      content_feature_count: 2,
      learning_version: 'content-similarity-v1',
    },
    deterministic_assessment: {
      assessment_version: 'deterministic-score-v1',
      document_kind: 'UNKNOWN',
      document_subtype: null,
      confidence: 0.12,
      matched_by: 'fallback:unknown',
      supporting_evidence: ['No stable document-specific signals were found in the extracted content.'],
      conflicts: ['Deterministic evidence stayed low-confidence, so manual review is recommended.'],
    },
    ...overrides,
  }
}

function buildDocument(overrides: Partial<DocumentIngestionRecord> = {}): DocumentIngestionRecord {
  return {
    document_id: 'DOC-225186',
    original_filename: '225186 VESSEL NOMINATION.pdf',
    display_name: '225186 VESSEL NOMINATION',
    content_type: 'application/pdf',
    storage_key: 'documents/DOC-225186.pdf',
    sha256: '0'.repeat(64),
    size_bytes: 228 * 1024,
    page_count: 1,
    source_available: true,
    status: 'ANALYZED',
    processor_provider: 'builtin',
    processor_model: null,
    classifier_version: 'classifier-v1',
    extractor_version: 'extractor-v1',
    analysis_summary: {
      dominant_document_kind: 'UNKNOWN',
      reviewed_page_count: 0,
      review_ready: false,
    },
    processing_errors: [],
    review_status: 'UNREVIEWED',
    review_notes: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-05-15T21:28:00Z',
    created_by: 'document_processor',
    updated_at: '2026-05-15T21:28:00Z',
    updated_by: 'document_processor',
    version: 1,
    processor_trace: null,
    routing_assessment: null,
    linkage_assessment: null,
    action_plan: null,
    record_links: [],
    pages: [
      {
        page_id: 1,
        page_number: 1,
        classification_status: 'ANALYZED',
        extraction_status: 'ANALYZED',
        document_kind: 'UNKNOWN',
        document_subtype: null,
        classification_confidence: 0.12,
        classification_payload: {},
        header_fields: [],
        table_blocks: [],
        raw_text_excerpt: null,
        text_source: 'none',
        preview_available: false,
        processing_warnings: [],
        processing_errors: [],
        review_status: 'UNREVIEWED',
        review_notes: null,
        reviewed_at: null,
        reviewed_by: null,
        processed_at: '2026-05-15T21:28:00Z',
        processor_trace: null,
        routing_assessment: null,
        understanding: {
          bundle_version: 'document-understanding-v1',
          text_stats: {
            source: 'none',
            text_available: false,
            character_count: 0,
            line_count: 0,
            token_count: 0,
            numeric_token_count: 0,
            date_like_value_count: 0,
            currency_marker_count: 0,
          },
          layout_hints: {
            non_empty_line_count: 0,
            short_line_count: 0,
            uppercase_line_count: 0,
            key_value_line_count: 0,
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
            filename_signature: 'vessel nomination',
            content_features: [],
            content_feature_count: 0,
            learning_version: 'content-similarity-v1',
          },
          classification_evidence: {
            system_document_kind: 'UNKNOWN',
            system_document_subtype: null,
            system_classification_source: 'heuristic',
            system_classification_confidence: 0.12,
            matched_by: 'fallback',
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
            document_kind: 'UNKNOWN',
            document_subtype: null,
            confidence: 0.12,
            matched_by: 'fallback:unknown',
            supporting_evidence: ['No stable document-specific signals were found in the extracted content.'],
            conflicts: ['Deterministic evidence stayed low-confidence, so manual review is recommended.'],
          },
        },
      },
    ],
    understanding: buildDocumentUnderstanding(),
    ...overrides,
  }
}

function buildController(overrides: Partial<DocumentIngestionController> = {}): DocumentIngestionController {
  return {
    documents: [buildDocument()],
    processorSettings: null,
    reprocessProviderByDocument: {},
    schemaRegistry: {
      version: 'doc-schema-v1',
      document_kinds: [
        {
          document_kind: 'UNKNOWN',
          label: 'Unknown',
          document_family: 'GENERAL',
          description: 'Unclassified',
          review_guidance: 'Review manually.',
          linkage_summary: 'Manual review',
          record_targets: [],
          matching_keys: [],
          header_fields: [],
          table_templates: [],
        },
        {
          document_kind: 'DELIVERY_CONFIRMATION',
          label: 'Delivery Confirmation',
          document_family: 'LOGISTICS',
          description: 'Delivery confirmation',
          review_guidance: 'Review delivery references.',
          linkage_summary: 'Link to delivery',
          record_targets: [],
          matching_keys: [],
          header_fields: [],
          table_templates: [],
        },
      ],
    },
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
    lastUploadedDocumentId: null,
    lastImportedDocumentIds: [],
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

describe('LibraryWorkspace', () => {
  beforeEach(() => {
    usePersistentCollapsibleCardStateMock.mockReset()
    useDocumentIngestionControllerMock.mockReset()
    useDocumentLibraryFolderStateMock.mockReset()

    usePersistentCollapsibleCardStateMock.mockReturnValue({
      expanded: false,
      setExpanded: () => undefined,
    })
    useDocumentLibraryFolderStateMock.mockReturnValue({
      folders: [],
      assignments: {},
      createFolder: () => ({ ok: true }),
      moveFolder: () => ({ ok: true }),
      copyFolder: () => ({ ok: true }),
      renameFolder: () => ({ ok: true }),
      deleteFolder: () => ({ ok: true }),
      assignDocumentToFolder: () => undefined,
      assignDocumentsToFolder: () => undefined,
    })
  })

  it('renders an inline type picker in the library list for uploaded documents', () => {
    useDocumentIngestionControllerMock.mockReturnValue(buildController())

    const markup = renderToStaticMarkup(
      createElement(LibraryWorkspace, {
        authSession: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: '2026-05-16T22:00:00Z',
          user: {
            id: 'doc_admin',
            email: 'doc_admin@example.com',
            name: 'Doc Admin',
            role: 'OPS_ADMIN',
          },
        },
        formatDate: (value: string | null | undefined) => value ?? '',
        onOpenOperationsWorkspace: () => undefined,
      }),
    )

    expect(markup).toContain('Set document type for 225186 VESSEL NOMINATION')
    expect(markup).toContain('Delivery Confirmation')
    expect(markup).toContain('<option value="UNKNOWN" selected="">Unknown</option>')
  })

  it('renders a per-folder action menu trigger for custom library folders', () => {
    useDocumentIngestionControllerMock.mockReturnValue(buildController())
    useDocumentLibraryFolderStateMock.mockReturnValue({
      folders: [
        {
          id: 'credit-docs',
          name: 'Credit Docs',
          createdAt: '2026-05-15T10:00:00Z',
          parentFolderId: null,
        },
      ],
      assignments: {
        'DOC-225186': 'credit-docs',
      },
      createFolder: () => ({ ok: true }),
      moveFolder: () => ({ ok: true }),
      copyFolder: () => ({ ok: true }),
      renameFolder: () => ({ ok: true }),
      deleteFolder: () => ({ ok: true }),
      assignDocumentToFolder: () => undefined,
      assignDocumentsToFolder: () => undefined,
    })

    const markup = renderToStaticMarkup(
      createElement(LibraryWorkspace, {
        authSession: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: '2026-05-16T22:00:00Z',
          user: {
            id: 'doc_admin',
            email: 'doc_admin@example.com',
            name: 'Doc Admin',
            role: 'OPS_ADMIN',
          },
        },
        formatDate: (value: string | null | undefined) => value ?? '',
        onOpenOperationsWorkspace: () => undefined,
      }),
    )

    expect(markup).toContain('Credit Docs')
    expect(markup).toContain('Open folder menu for Credit Docs')
    expect(markup).toContain('aria-haspopup="menu"')
  })

  it('renders a selected file page with upload provenance and activity', () => {
    useDocumentIngestionControllerMock.mockReturnValue(
      buildController({
        documents: [
          buildDocument({
            created_by: 'ops_admin',
            updated_by: 'ops_reviewer',
            updated_at: '2026-05-16T18:00:00Z',
            review_status: 'VERIFIED',
            reviewed_at: '2026-05-16T18:00:00Z',
            reviewed_by: 'ops_reviewer',
          }),
        ],
      }),
    )

    const markup = renderToStaticMarkup(
      createElement(LibraryWorkspace, {
        authSession: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: '2026-05-16T22:00:00Z',
          user: {
            id: 'doc_admin',
            email: 'doc_admin@example.com',
            name: 'Doc Admin',
            role: 'OPS_ADMIN',
          },
        },
        activeDocumentId: 'DOC-225186',
        formatDate: (value: string | null | undefined) => value ?? '',
        onOpenOperationsWorkspace: () => undefined,
      }),
    )

    expect(markup).toContain('Back to Library')
    expect(markup).toContain('Activity Log')
    expect(markup).toContain('Authenticated PDF upload')
    expect(markup).toContain('Uploaded By')
    expect(markup).toContain('ops_admin')
    expect(markup).toContain('Open Source PDF')
  })
})
