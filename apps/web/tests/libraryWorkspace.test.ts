import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentIngestionController } from '../src/features/documents/useDocumentIngestionController'
import type {
  DocumentFacetAssignmentRecord,
  DocumentIngestionRecord,
  DocumentIngestionUnderstandingRecord,
  DocumentProcessorRuntimeSettingsRecord,
  DocumentWorkflowRecord,
} from '../src/shared/models'
import { LibraryWorkspace } from '../src/workspaces/library/LibraryWorkspace'
import {
  canExecuteDocumentActionPlanWorkflow,
  canRequestDocumentActionApproval,
  canRequestDocumentRecordCreation,
  workflowActionButtonLabel,
} from '../src/workspaces/library/libraryWorkspaceSupport'

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

const PROCESSOR_SETTINGS = {
  enabled: true,
  default_provider: 'openai',
  effective_default_provider: 'openai',
  configured_provider_count: 1,
  ai_processing_confidence_threshold: 0.62,
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
      available_models: ['gpt-5-mini', 'gpt-5'],
      base_url: 'https://api.openai.com/v1',
      setup_env_var: 'OPENAI_API_KEY',
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
    activity: [],
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

function buildFacetValue(overrides: Partial<DocumentFacetAssignmentRecord> = {}): DocumentFacetAssignmentRecord {
  return {
    facet_value_id: 1,
    document_id: 'DOC-225186',
    page_id: null,
    facet_key: 'commodity',
    facet_label: 'Commodity',
    value_code: 'NATURAL_GAS',
    value_label: 'Natural Gas',
    source: 'MANUAL',
    confidence: null,
    review_status: 'CONFIRMED',
    evidence: [],
    created_at: '2026-05-15T21:28:00Z',
    created_by: 'ops.docs',
    updated_at: '2026-05-15T21:28:00Z',
    updated_by: 'ops.docs',
    version: 1,
    ...overrides,
  }
}

function buildWorkflow(overrides: Partial<DocumentWorkflowRecord> = {}): DocumentWorkflowRecord {
  return {
    workflow_id: 'match_existing_record',
    label: 'Match Existing Record',
    document_kind: 'INVOICE',
    document_type_label: 'Invoice',
    description: 'Attach this document to a matched invoice.',
    status: 'READY',
    recommended: true,
    action_type: 'ATTACH_EXISTING_RECORD',
    operation_type: 'link_document_to_record',
    candidate_state: 'ATTACH_READY',
    record_effect: 'Attach document evidence to existing trade invoice.',
    target: {
      record_type: 'TRADE_INVOICE',
      record_id: '42',
      record_label: 'Invoice INV-42',
      existing_record: true,
    },
    owner: {
      record_type: 'TRADE',
      record_id: 'TRD-42',
      record_label: 'Trade TRD-42',
      existing_record: true,
    },
    required_owner_record_types: [],
    missing_evidence: [],
    governance_status: 'AUTO_EXECUTION_ELIGIBLE',
    recommended_execution_mode: 'AUTO',
    approval_required: false,
    risk_flags: [],
    disabled_reason: null,
    reasons: ['The document is verified and linked to a high-confidence existing record.'],
    ...overrides,
  }
}

function buildController(overrides: Partial<DocumentIngestionController> = {}): DocumentIngestionController {
  return {
    documents: [buildDocument()],
    processorSettings: null,
    reprocessProviderByDocument: {},
    systemAiConfidenceThresholdPercent: 46,
    aiConfidenceThresholdOverridePercent: null,
    effectiveAiConfidenceThresholdPercent: 46,
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
          facets: [],
          extraction_schema_code: null,
          deep_extraction_required: false,
          extraction_objects: [],
          validation_rules: [],
          review_rules: [],
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
          facets: [],
          extraction_schema_code: null,
          deep_extraction_required: false,
          extraction_objects: [],
          validation_rules: [],
          review_rules: [],
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
    clearPagePreviewsForDocument: () => undefined,
    fileInputRef: { current: null },
    setDisplayName: () => undefined,
    setSelectedProcessorProvider: () => undefined,
    setSelectedProcessorModel: () => undefined,
    setAiConfidenceThresholdOverridePercent: () => undefined,
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
    handleVerifyDocument: async () => undefined,
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

function mockLibraryCollapsibleCards(expandedByKey: Record<string, boolean> = {}) {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string, defaultExpanded: boolean) => ({
    expanded: expandedByKey[cardKey] ?? defaultExpanded,
    hasPersistedValue: Object.prototype.hasOwnProperty.call(expandedByKey, cardKey),
    setExpanded: () => undefined,
  }))
}

describe('LibraryWorkspace', () => {
  beforeEach(() => {
    usePersistentCollapsibleCardStateMock.mockReset()
    useDocumentIngestionControllerMock.mockReset()
    useDocumentLibraryFolderStateMock.mockReset()

    mockLibraryCollapsibleCards()
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

  it('labels only high-confidence existing-record action plans as attachable', () => {
    const attachWorkflow = buildWorkflow()
    const approvalWorkflow = buildWorkflow({
      workflow_id: 'create_invoice_from_document',
      label: 'Create Invoice From Document',
      action_type: 'CREATE_RECORD_FROM_DOCUMENT',
      operation_type: 'issue_trade_invoice',
      candidate_state: 'CREATE_CANDIDATE',
      governance_status: 'HUMAN_CONFIRMATION_REQUIRED',
      recommended_execution_mode: 'MANUAL',
      approval_required: true,
      risk_flags: ['CREATES_NEW_RECORD', 'FINANCIAL_MUTATION'],
      disabled_reason: 'Human approval is required before this workflow can mutate records.',
    })

    expect(canExecuteDocumentActionPlanWorkflow(attachWorkflow)).toBe(true)
    expect(workflowActionButtonLabel(attachWorkflow)).toBe('Attach')
    expect(canExecuteDocumentActionPlanWorkflow(approvalWorkflow)).toBe(false)
    expect(canRequestDocumentActionApproval(approvalWorkflow)).toBe(true)
    expect(workflowActionButtonLabel(approvalWorkflow)).toBe('Approval Required')
  })

  it('labels missing-record intake workflows as creation requests', () => {
    const intakeWorkflow = buildWorkflow({
      workflow_id: 'request_missing_record_creation',
      label: 'Request Missing Record Creation',
      action_type: 'MANUAL_REVIEW',
      operation_type: 'stage_record_creation_request',
      candidate_state: 'OWNER_REQUIRED',
      status: 'READY',
      target: {
        record_type: 'TRADE_INVOICE',
        record_id: null,
        record_label: 'Create Trade Invoice',
        existing_record: false,
      },
      owner: null,
      required_owner_record_types: ['TRADE'],
      governance_status: 'MANUAL_REVIEW_REQUIRED',
      approval_required: false,
      risk_flags: ['WORK_INTAKE'],
      disabled_reason: null,
    })

    expect(canRequestDocumentRecordCreation(intakeWorkflow)).toBe(true)
    expect(workflowActionButtonLabel(intakeWorkflow)).toBe('Request Creation')
  })

  it('surfaces document load failures in the main empty state', () => {
    mockLibraryCollapsibleCards({ 'library.document-list-card': true })
    useDocumentIngestionControllerMock.mockReturnValue(
      buildController({
        documents: [],
        loadError: 'Unexpected server error.',
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
        formatDate: (value: string | null | undefined) => value ?? '',
        onOpenOperationsWorkspace: () => undefined,
      }),
    )

    expect(markup).toContain('Unable to load uploaded documents')
    expect(markup).toContain('Unexpected server error.')
    expect(markup).not.toContain('Open the uploader card to add the first PDF into the library.')
  })

  it('hides the document list behind a collapsed card by default', () => {
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

    expect(markup).toContain('Document list')
    expect(markup).toContain('library-document-list-card-panel')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Set document type for 225186 VESSEL NOMINATION')
    expect(markup).not.toContain('Resize Name column')
  })

  it('renders the temporary session threshold setting in the upload card', () => {
    mockLibraryCollapsibleCards({ 'library.upload-card': true })
    useDocumentIngestionControllerMock.mockReturnValue(
      buildController({
        processorSettings: PROCESSOR_SETTINGS,
        selectedProcessorProvider: 'openai',
        selectedProcessorModel: 'gpt-5-mini',
        systemAiConfidenceThresholdPercent: 62,
        aiConfidenceThresholdOverridePercent: 74,
        effectiveAiConfidenceThresholdPercent: 74,
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
        formatDate: (value: string | null | undefined) => value ?? '',
        onOpenOperationsWorkspace: () => undefined,
      }),
    )

    expect(markup).toContain('AI Assist Below 74%')
    expect(markup).toContain('Temporary session override. It clears when you log out.')
    expect(markup).toContain('Use System Default')
    expect(markup).toContain('OpenAI API (gpt-5-mini) will handle document analysis when classifier confidence is below 74%.')
  })

  it('renders an inline type picker in the library list for uploaded documents', () => {
    mockLibraryCollapsibleCards({ 'library.document-list-card': true })
    useDocumentIngestionControllerMock.mockReturnValue(
      buildController({
        documents: [
          buildDocument({
            facet_values: [
              buildFacetValue(),
              buildFacetValue({
                facet_value_id: 2,
                facet_key: 'commercial_side',
                facet_label: 'Purchase or Sale',
                value_code: 'BUY',
                value_label: 'Purchase',
              }),
              buildFacetValue({
                facet_value_id: 3,
                facet_key: 'transport_mode',
                facet_label: 'Mode of Transportation',
                value_code: 'PIPELINE',
                value_label: 'Pipeline',
              }),
              buildFacetValue({
                facet_value_id: 4,
                facet_key: 'asset',
                facet_label: 'Asset',
                value_code: 'UPSTREAM',
                value_label: 'Upstream',
              }),
              buildFacetValue({
                facet_value_id: 5,
                facet_key: 'commodity',
                facet_label: 'Commodity',
                value_code: 'CRUDE_OIL',
                value_label: 'Crude',
              }),
              buildFacetValue({
                facet_value_id: 6,
                facet_key: 'transport_mode',
                facet_label: 'Mode of Transportation',
                value_code: 'VESSEL',
                value_label: 'Vessel',
              }),
            ],
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
        formatDate: (value: string | null | undefined) => value ?? '',
        onOpenOperationsWorkspace: () => undefined,
      }),
    )

    expect(markup).toContain('Set document type for 225186 VESSEL NOMINATION')
    expect(markup).toContain('Tags')
    expect(markup).toContain('Natural Gas')
    expect(markup).toContain('Purchase')
    expect(markup).toContain('+1')
    expect(markup).toContain('Actions')
    expect(markup).toContain('Verify 225186 VESSEL NOMINATION')
    expect(markup).toContain('Reprocess 225186 VESSEL NOMINATION')
    expect(markup).toContain('Open workflows for 225186 VESSEL NOMINATION')
    expect(markup).toContain('Workflows')
    expect(markup).toContain('Verify')
    expect(markup).toContain('Reprocess')
    expect(markup).toContain('Delivery Confirmation')
    expect(markup).toContain('<option value="UNKNOWN" selected="">Unknown</option>')
    expect(markup).toContain('Resize Name column')
    expect(markup).toContain('Resize Size column')
    expect(markup).toContain('Resize Actions column')
  })

  it('does not render custom library folders while folders are disabled', () => {
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

    expect(markup).not.toContain('Credit Docs')
    expect(markup).not.toContain('Open folder menu for Credit Docs')
    expect(markup).not.toContain('New Folder')
    expect(markup).not.toContain('Destination Folder')
    expect(markup).not.toContain('Workflow Views')
    expect(markup).not.toContain('Document Types')
    expect(markup).not.toContain('Storage')
  })

  it('renders a selected file page with upload provenance and activity', () => {
    const baseDocument = buildDocument({
      created_by: 'ops_admin',
      updated_by: 'ops_reviewer',
      updated_at: '2026-05-16T18:00:00Z',
      review_status: 'VERIFIED',
      reviewed_at: '2026-05-16T18:00:00Z',
      reviewed_by: 'ops_reviewer',
      facet_values: [
        buildFacetValue({
          facet_key: 'commodity',
          facet_label: 'Commodity',
          value_code: 'NATURAL_GAS',
          value_label: 'Natural Gas',
        }),
        buildFacetValue({
          facet_value_id: 2,
          facet_key: 'asset',
          facet_label: 'Asset',
          value_code: 'PIPELINE',
          value_label: 'Pipeline',
        }),
        buildFacetValue({
          facet_value_id: 3,
          page_id: 1,
          facet_key: 'transport_mode',
          facet_label: 'Mode of Transportation',
          value_code: 'VESSEL',
          value_label: 'Vessel',
          source: 'SYSTEM_DERIVED',
          confidence: 0.76,
          review_status: 'SUGGESTED',
          evidence: ['Matched text pattern: vessel'],
        }),
      ],
    })
    const firstPage = baseDocument.pages[0]
    useDocumentIngestionControllerMock.mockReturnValue(
      buildController({
        documents: [
          {
            ...baseDocument,
            page_count: 2,
            analysis_summary: {
              ...baseDocument.analysis_summary,
              dominant_document_kind: 'MIXED',
              document_classification_scope: 'PAGE',
              page_level_classification_required: true,
            },
            pages: [
              {
                ...firstPage,
                raw_text_excerpt: 'Vessel nomination details for review.',
                text_source: 'pdf_text',
                preview_available: true,
                facet_values: [
                  buildFacetValue({
                    facet_value_id: 3,
                    page_id: 1,
                    facet_key: 'transport_mode',
                    facet_label: 'Mode of Transportation',
                    value_code: 'VESSEL',
                    value_label: 'Vessel',
                    source: 'SYSTEM_DERIVED',
                    confidence: 0.76,
                    review_status: 'SUGGESTED',
                    evidence: ['Matched text pattern: vessel'],
                  }),
                ],
              },
              {
                ...firstPage,
                page_id: 2,
                page_number: 2,
                document_kind: 'DELIVERY_CONFIRMATION',
                classification_confidence: 0.93,
                raw_text_excerpt: 'Delivery confirmation received at terminal.',
                text_source: 'pdf_text',
                preview_available: true,
                header_fields: [
                  {
                    field_key: 'delivery_number',
                    label: 'Delivery Number',
                    value: 'DEL-100',
                    confidence: 0.91,
                    source: 'system',
                  },
                ],
                table_blocks: [
                  {
                    table_index: 0,
                    template_key: null,
                    title: 'Delivery Lines',
                    columns: ['product', 'quantity'],
                    rows: [{ product: 'ULSD', quantity: '100 bbl' }],
                    header_row_detected: true,
                    source: 'system',
                  },
                ],
              },
            ],
          },
        ],
        pagePreviewUrls: {
          1: 'blob:page-1',
        },
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
    expect(markup).toContain('Reprocess')
    expect(markup).toContain('Open Source PDF')
    expect(markup).toContain('Commodity: Natural Gas')
    expect(markup).toContain('Asset: Pipeline')
    expect(markup).toContain('Mode of Transportation: Vessel')
    expect(markup).toContain('Edit Document Tags')
    expect(markup).toContain('Edit Page Tags')
    expect(markup).toContain('Pages')
    expect(markup).toContain('Page 1')
    expect(markup).toContain('Page 2')
    expect(markup).toContain('DELIVERY CONFIRMATION')
    expect(markup).toContain('Selected Page')
    expect(markup).toContain('Classification Explanation')
    expect(markup).toContain('Deterministic scoring classified this page as UNKNOWN with 12% confidence.')
    expect(markup).toContain('No stable document-specific signals were found in the extracted content.')
    expect(markup).toContain('Review Flags')
    expect(markup).toContain('Extracted Text')
    expect(markup).toContain('Vessel nomination details for review.')
    expect(markup).toContain('Preview for page 1')
  })

  it('renders persisted document audit activity with original classification and reprocess history', () => {
    const baseDocument = buildDocument({
      activity: [
        {
          activity_id: 'evt-reclassified',
          event_type: 'DocumentClassified',
          label: 'Reclassified',
          detail: 'Reclassified as TRADE CONFIRMATION across 1/1 pages by GPT / gpt-5-mini with 96% average confidence.',
          occurred_at: '2026-05-16T19:05:00Z',
          actor_id: 'document_processor',
          payload: {},
        },
        {
          activity_id: 'evt-reprocess',
          event_type: 'DocumentReprocessRequested',
          label: 'Reprocessed',
          detail: 'ops_reviewer queued reprocessing with GPT / gpt-5-mini. Prior classification: INVOICE.',
          occurred_at: '2026-05-16T19:04:00Z',
          actor_id: 'ops_reviewer',
          payload: {},
        },
        {
          activity_id: 'evt-original',
          event_type: 'DocumentClassified',
          label: 'Original Classification',
          detail: 'Originally classified as INVOICE across 1/1 pages by deterministic scoring with 92% average confidence.',
          occurred_at: '2026-05-16T18:55:00Z',
          actor_id: 'document_processor',
          payload: {},
        },
      ],
      updated_at: '2026-05-16T19:05:00Z',
    })
    useDocumentIngestionControllerMock.mockReturnValue(
      buildController({
        documents: [baseDocument],
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

    expect(markup).toContain('Original Classification')
    expect(markup).toContain('Originally classified as INVOICE')
    expect(markup).toContain('Reprocessed')
    expect(markup).toContain('Prior classification: INVOICE')
    expect(markup).toContain('Reclassified as TRADE CONFIRMATION')
  })
})
