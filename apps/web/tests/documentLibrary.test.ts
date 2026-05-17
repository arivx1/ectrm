import { describe, expect, it } from 'vitest'

import type { DocumentIngestionRecord, DocumentIngestionUnderstandingRecord } from '../src/shared/models'
import {
  buildDocumentLibraryCollectionCounts,
  buildDocumentLibraryFolderDescendantIds,
  buildDocumentLibraryFolderCounts,
  buildDocumentLibraryFolderTree,
  filterDocumentLibraryDocuments,
} from '../src/workspaces/library/libraryWorkspaceSupport'

function buildDocumentUnderstanding(
  overrides: Partial<DocumentIngestionUnderstandingRecord> = {},
): DocumentIngestionUnderstandingRecord {
  return {
    bundle_version: 'document-understanding-v1',
    page_count: 2,
    text_stats: {
      pages_with_text: 2,
      source_counts: { none: 0, pdf_text: 2, ocr: 0 },
      total_character_count: 64,
      total_line_count: 4,
      total_token_count: 12,
      total_numeric_token_count: 2,
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
      content_features: ['trade', 'confirmation'],
      content_feature_count: 2,
      learning_version: 'content-similarity-v1',
    },
    deterministic_assessment: {
      assessment_version: 'deterministic-score-v1',
      document_kind: 'TRADE_CONFIRMATION',
      document_subtype: null,
      confidence: 0.8,
      matched_by: 'page_consensus:trade_confirmation',
      supporting_evidence: ['2 of 2 pages scored as Trade Confirmation deterministically.'],
      conflicts: [],
    },
    ...overrides,
  }
}

function buildDocument(overrides: Partial<DocumentIngestionRecord> = {}): DocumentIngestionRecord {
  return {
    document_id: 'DOC-1',
    original_filename: 'trade-confirmation.pdf',
    display_name: 'Trade Confirmation',
    content_type: 'application/pdf',
    storage_key: 'documents/DOC-1.pdf',
    sha256: '0'.repeat(64),
    size_bytes: 4096,
    page_count: 2,
    source_available: true,
    status: 'ANALYZED',
    processor_provider: 'openai',
    processor_model: 'gpt-5-mini',
    classifier_version: 'classifier-v1',
    extractor_version: 'extractor-v1',
    analysis_summary: {
      dominant_document_kind: 'CONFIRMATION',
      reviewed_page_count: 1,
      review_ready: false,
    },
    processing_errors: [],
    review_status: 'IN_REVIEW',
    review_notes: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-05-10T10:00:00Z',
    created_by: 'ops.docs',
    updated_at: '2026-05-10T11:00:00Z',
    updated_by: 'ops.docs',
    version: 1,
    processor_trace: null,
    routing_assessment: null,
    linkage_assessment: null,
    action_plan: null,
    record_links: [],
    pages: [],
    understanding: buildDocumentUnderstanding(),
    ...overrides,
  }
}

describe('document library helpers', () => {
  it('builds collection counts from review, linkage, processing, and error state', () => {
    const documents = [
      buildDocument(),
      buildDocument({
        document_id: 'DOC-2',
        display_name: 'Invoice Packet',
        original_filename: 'invoice-packet.pdf',
        review_status: 'VERIFIED',
        analysis_summary: {
          dominant_document_kind: 'INVOICE',
          reviewed_page_count: 3,
          review_ready: true,
        },
        record_links: [
          {
            record_type: 'trade_invoice',
            record_id: 'INV-100',
            record_label: 'Invoice INV-100',
            linked_at: '2026-05-10T11:30:00Z',
            linked_by: 'ops.docs',
          },
        ],
      }),
      buildDocument({
        document_id: 'DOC-3',
        display_name: 'Broker Statement',
        original_filename: 'broker-statement.pdf',
        status: 'PROCESSING',
        processing_errors: ['OCR fallback required.'],
      }),
    ]

    expect(buildDocumentLibraryCollectionCounts(documents)).toEqual({
      all: 3,
      review: 2,
      ready: 1,
      linked: 1,
      processing: 1,
      errors: 1,
    })
  })

  it('filters and sorts documents for the active library collection', () => {
    const documents = [
      buildDocument({
        document_id: 'DOC-2',
        display_name: 'Invoice Packet',
        original_filename: 'invoice-packet.pdf',
        updated_at: '2026-05-10T12:00:00Z',
        review_notes: 'Invoice ready for cash review',
        analysis_summary: {
          dominant_document_kind: 'INVOICE',
          reviewed_page_count: 3,
          review_ready: true,
        },
      }),
      buildDocument({
        document_id: 'DOC-3',
        display_name: 'Gas Confirmation',
        original_filename: 'gas-confirmation.pdf',
        updated_at: '2026-05-10T13:00:00Z',
      }),
      buildDocument({
        document_id: 'DOC-4',
        display_name: 'Alpha Packet',
        original_filename: 'alpha-packet.pdf',
        updated_at: '2026-05-10T09:00:00Z',
      }),
    ]

    expect(
      filterDocumentLibraryDocuments({
        documents,
        collectionKey: 'all',
        query: '',
        sortMode: 'updated',
      }).map((document) => document.document_id),
    ).toEqual(['DOC-3', 'DOC-2', 'DOC-4'])

    expect(
      filterDocumentLibraryDocuments({
        documents,
        collectionKey: 'ready',
        query: 'invoice',
        sortMode: 'name',
      }).map((document) => document.document_id),
    ).toEqual(['DOC-2'])
  })

  it('counts and filters documents inside custom folders', () => {
    const documents = [
      buildDocument({
        document_id: 'DOC-2',
        display_name: 'Invoice Packet',
        original_filename: 'invoice-packet.pdf',
      }),
      buildDocument({
        document_id: 'DOC-3',
        display_name: 'Letter Credit',
        original_filename: 'letter-credit.pdf',
      }),
      buildDocument({
        document_id: 'DOC-4',
        display_name: 'Unfiled Packet',
        original_filename: 'unfiled-packet.pdf',
      }),
    ]

    const folderAssignments = {
      'DOC-2': 'folder-credit',
      'DOC-3': 'folder-lc',
    }

    const folders = [
      {
        id: 'folder-credit',
        name: 'Credit Docs',
        createdAt: '2026-05-15T10:00:00Z',
        parentFolderId: null,
      },
      {
        id: 'folder-lc',
        name: 'Letters Of Credit',
        createdAt: '2026-05-15T10:05:00Z',
        parentFolderId: 'folder-credit',
      },
    ]

    expect(buildDocumentLibraryFolderTree(folders)).toEqual([
      {
        id: 'folder-credit',
        name: 'Credit Docs',
        parentFolderId: null,
        depth: 0,
        pathIds: ['folder-credit'],
        pathLabel: 'Credit Docs',
      },
      {
        id: 'folder-lc',
        name: 'Letters Of Credit',
        parentFolderId: 'folder-credit',
        depth: 1,
        pathIds: ['folder-credit', 'folder-lc'],
        pathLabel: 'Credit Docs / Letters Of Credit',
      },
    ])

    expect(buildDocumentLibraryFolderCounts(documents, folderAssignments, folders)).toEqual({
      'folder-credit': 2,
      'folder-lc': 1,
    })

    expect(
      filterDocumentLibraryDocuments({
        documents,
        folderAssignments,
        folderMatchIds: buildDocumentLibraryFolderDescendantIds('folder-credit', folders),
        query: 'letter',
        sortMode: 'name',
      }).map((document) => document.document_id),
    ).toEqual(['DOC-3'])
  })
})
