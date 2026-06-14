import { describe, expect, it } from 'vitest'

import {
  documentPagePreviewCacheKey,
  resolveDocumentPagePreviewTargets,
} from '../src/features/documents/useDocumentPagePreviewCache'
import type { DocumentIngestionPageRecord, DocumentIngestionRecord } from '../src/shared/models'

function buildPage(overrides: Partial<DocumentIngestionPageRecord> = {}): DocumentIngestionPageRecord {
  return {
    page_id: 10,
    preview_available: true,
    ...overrides,
  } as DocumentIngestionPageRecord
}

function buildDocument(overrides: Partial<DocumentIngestionRecord> = {}): DocumentIngestionRecord {
  return {
    document_id: 'DOC-100',
    status: 'ANALYZED',
    pages: [buildPage()],
    ...overrides,
  } as DocumentIngestionRecord
}

describe('document page preview cache', () => {
  it('does not schedule a duplicate preview request while a page is already in flight', () => {
    const documents = [buildDocument()]

    expect(
      resolveDocumentPagePreviewTargets({
        documents,
        expandedDocumentIds: { 'DOC-100': true },
        pagePreviewUrls: {},
        pagePreviewLoading: {},
        pagePreviewErrors: {},
        inFlightPagePreviewKeys: new Set(),
      }),
    ).toEqual([{ documentId: 'DOC-100', pageId: 10 }])

    expect(
      resolveDocumentPagePreviewTargets({
        documents,
        expandedDocumentIds: { 'DOC-100': true },
        pagePreviewUrls: {},
        pagePreviewLoading: {},
        pagePreviewErrors: {},
        inFlightPagePreviewKeys: new Set([documentPagePreviewCacheKey('DOC-100', 10)]),
      }),
    ).toEqual([])
  })

  it('only schedules previews for expanded, analyzed pages without cached results', () => {
    const documents = [
      buildDocument(),
      buildDocument({
        document_id: 'DOC-200',
        status: 'PROCESSING',
        pages: [buildPage({ page_id: 20, preview_available: true })],
      }),
      buildDocument({
        document_id: 'DOC-300',
        pages: [buildPage({ page_id: 30, preview_available: false })],
      }),
      buildDocument({
        document_id: 'DOC-400',
        pages: [buildPage({ page_id: 40, preview_available: true })],
      }),
    ]

    expect(
      resolveDocumentPagePreviewTargets({
        documents,
        expandedDocumentIds: {
          'DOC-100': true,
          'DOC-200': true,
          'DOC-300': true,
          'DOC-400': false,
        },
        pagePreviewUrls: {},
        pagePreviewLoading: {},
        pagePreviewErrors: {},
        inFlightPagePreviewKeys: new Set(),
      }),
    ).toEqual([{ documentId: 'DOC-100', pageId: 10 }])
  })
})
