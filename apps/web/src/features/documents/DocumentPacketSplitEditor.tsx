import { useMemo, useState } from 'react'

import type { UpdateDocumentLogicalDocumentsInput } from '../../entities/documents/api'
import type { DocumentIngestionRecord, DocumentLogicalDocumentRecord } from '../../shared/models'
import { DOCUMENT_REVIEW_STATUS_OPTIONS, formatDocumentKindLabel } from './documentIngestionUtils'
import type { DocumentIngestionController } from './useDocumentIngestionController'

type DocumentPacketSplitEditorProps = {
  controller: DocumentIngestionController
  document: DocumentIngestionRecord
}

type SplitDraftRow = {
  key: string
  documentKind: string
  documentSubtype: string
  pageText: string
  reviewStatus: string
  reviewNotes: string
}

export function DocumentPacketSplitEditor({
  controller,
  document,
}: DocumentPacketSplitEditorProps) {
  const [draftRows, setDraftRows] = useState<SplitDraftRow[]>(() => buildDraftRows(document))
  const [draftError, setDraftError] = useState('')
  const saveTarget = `logical-documents:${document.document_id}`
  const saveError = controller.saveErrors[saveTarget] ?? ''

  const pageCountByNumber = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of draftRows) {
      const parsed = parsePageSelection(row.pageText, document)
      if (parsed.error) {
        continue
      }
      for (const pageNumber of parsed.pageNumbers) {
        counts.set(pageNumber, (counts.get(pageNumber) ?? 0) + 1)
      }
    }
    return counts
  }, [document, draftRows])

  const sharedPageNumbers = [...pageCountByNumber.entries()]
    .filter(([, count]) => count > 1)
    .map(([pageNumber]) => pageNumber)
    .sort((left, right) => left - right)

  function updateRow(rowKey: string, patch: Partial<SplitDraftRow>) {
    setDraftRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    )
  }

  function addRow() {
    setDraftRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        documentKind: 'UNKNOWN',
        documentSubtype: '',
        pageText: '',
        reviewStatus: 'UNREVIEWED',
        reviewNotes: '',
      },
    ])
  }

  function removeRow(rowKey: string) {
    setDraftRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== rowKey)))
  }

  async function saveRows() {
    const payload = buildUpdatePayload(document, draftRows)
    if (!payload.ok) {
      setDraftError(payload.error)
      return
    }
    setDraftError('')
    await controller.handleSaveLogicalDocuments(document, payload.value)
  }

  return (
    <section className="library-document-page-section library-document-split-section">
      <div className="library-section-head">
        <span className="eyebrow">Packet Split</span>
        <small>
          {draftRows.length} logical document{draftRows.length === 1 ? '' : 's'}
        </small>
      </div>

      <div className="library-document-split-summary">
        {(document.logical_documents ?? []).map((logicalDocument) => {
          const splitEvidence = splitEvidenceItems(logicalDocument)
          const splitConfidence = splitConfidencePercent(logicalDocument)
          return (
            <div key={logicalDocument.logical_document_id} className="library-document-split-evidence-card">
              <div className="library-document-split-evidence-main">
                <span className="entity-chip entity-chip-soft">
                  {logicalDocument.logical_document_key} · {formatDocumentKindLabel(logicalDocument.document_kind)} ·{' '}
                  {formatPageNumbers(logicalDocument)}
                </span>
                {splitConfidence ? (
                  <span className="entity-chip entity-chip-soft">{splitConfidence} split confidence</span>
                ) : null}
              </div>
              {splitEvidence.length > 0 ? (
                <ul className="library-document-split-evidence-list">
                  {splitEvidence.slice(0, 2).map((item) => (
                    <li key={`${logicalDocument.logical_document_id}:${item.type}:${item.summary}`}>
                      {item.summary}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        })}
        {sharedPageNumbers.map((pageNumber) => (
          <span key={`shared-${pageNumber}`} className="entity-chip entity-chip-soft">
            Page {pageNumber} shared
          </span>
        ))}
      </div>

      <div className="library-document-split-editor">
        {draftRows.map((row, index) => (
          <div key={row.key} className="library-document-split-row">
            <span className="library-document-split-row-index">LD-{String(index + 1).padStart(3, '0')}</span>
            <label>
              <span>Kind</span>
              <select
                className="control"
                value={row.documentKind}
                onChange={(event) => updateRow(row.key, { documentKind: event.target.value })}
              >
                {(controller.schemaRegistry?.document_kinds ?? []).map((entry) => (
                  <option key={entry.document_kind} value={entry.document_kind}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subtype</span>
              <input
                className="control"
                type="text"
                value={row.documentSubtype}
                onChange={(event) => updateRow(row.key, { documentSubtype: event.target.value })}
              />
            </label>
            <label>
              <span>Pages</span>
              <input
                className="control"
                type="text"
                value={row.pageText}
                placeholder="1-3, 5"
                onChange={(event) => updateRow(row.key, { pageText: event.target.value })}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                className="control"
                value={row.reviewStatus}
                onChange={(event) => updateRow(row.key, { reviewStatus: event.target.value })}
              >
                {DOCUMENT_REVIEW_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-secondary"
              disabled={draftRows.length <= 1}
              onClick={() => removeRow(row.key)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {draftError ? <p className="field-error">{draftError}</p> : null}
      {saveError ? <p className="field-error">{saveError}</p> : null}

      <div className="library-document-split-actions">
        <button type="button" className="button button-secondary" onClick={addRow}>
          Add Logical Document
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={controller.savingTarget === saveTarget}
          onClick={() => void saveRows()}
        >
          {controller.savingTarget === saveTarget ? 'Saving Split...' : 'Save Split'}
        </button>
      </div>
    </section>
  )
}

function buildDraftRows(document: DocumentIngestionRecord): SplitDraftRow[] {
  const persistedLogicalDocuments = document.logical_documents ?? []
  if (persistedLogicalDocuments.length === 0) {
    return [
      {
        key: `${document.document_id}:LD-001`,
        documentKind: document.pages[0]?.document_kind ?? 'UNKNOWN',
        documentSubtype: document.pages[0]?.document_subtype ?? '',
        pageText: serializePageSelection(document.pages.map((page) => page.page_number)),
        reviewStatus: 'UNREVIEWED',
        reviewNotes: '',
      },
    ]
  }

  const pageIdByNumber = new Map(document.pages.map((page) => [page.page_number, page.page_id]))
  return persistedLogicalDocuments.map((logicalDocument) => {
    const pageNumbers =
      logicalDocument.page_memberships.length > 0
        ? logicalDocument.page_memberships.map((membership) => membership.page_number)
        : logicalDocument.page_numbers.length > 0
          ? logicalDocument.page_numbers
          : document.pages
              .filter(
                (page) =>
                  page.page_number >= logicalDocument.page_start &&
                  page.page_number <= logicalDocument.page_end,
              )
              .map((page) => page.page_number)
    const existingPageNumbers = pageNumbers.filter((pageNumber) => pageIdByNumber.has(pageNumber))
    return {
      key: logicalDocument.logical_document_id,
      documentKind: logicalDocument.document_kind || 'UNKNOWN',
      documentSubtype: logicalDocument.document_subtype ?? '',
      pageText: serializePageSelection(existingPageNumbers),
      reviewStatus: logicalDocument.review_status || 'UNREVIEWED',
      reviewNotes: logicalDocument.review_notes ?? '',
    }
  })
}

function buildUpdatePayload(
  document: DocumentIngestionRecord,
  rows: SplitDraftRow[],
): { ok: true; value: UpdateDocumentLogicalDocumentsInput } | { ok: false; error: string } {
  const allPageIds = new Set(document.pages.map((page) => page.page_id))
  const coveredPageIds = new Set<number>()
  const logicalDocuments: UpdateDocumentLogicalDocumentsInput['logical_documents'] = []

  for (const [index, row] of rows.entries()) {
    const parsed = parsePageSelection(row.pageText, document)
    if (parsed.error) {
      return { ok: false, error: `LD-${String(index + 1).padStart(3, '0')}: ${parsed.error}` }
    }
    parsed.pageIds.forEach((pageId) => coveredPageIds.add(pageId))
    logicalDocuments.push({
      document_kind: row.documentKind,
      document_subtype: row.documentSubtype.trim() || null,
      page_ids: parsed.pageIds,
      review_status: row.reviewStatus,
      review_notes: row.reviewNotes.trim() || null,
    })
  }

  const missingPages = document.pages
    .filter((page) => allPageIds.has(page.page_id) && !coveredPageIds.has(page.page_id))
    .map((page) => page.page_number)
  if (missingPages.length > 0) {
    return { ok: false, error: `Pages ${missingPages.join(', ')} are not assigned.` }
  }

  return {
    ok: true,
    value: {
      expected_document_version: document.version,
      logical_documents: logicalDocuments,
    },
  }
}

function parsePageSelection(
  value: string,
  document: DocumentIngestionRecord,
): { pageIds: number[]; pageNumbers: number[]; error: '' } | { pageIds: never[]; pageNumbers: never[]; error: string } {
  const pageByNumber = new Map(document.pages.map((page) => [page.page_number, page]))
  const pageNumbers: number[] = []
  for (const token of value.split(',')) {
    const trimmed = token.trim()
    if (!trimmed) {
      continue
    }
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed)
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10)
      const end = Number.parseInt(rangeMatch[2], 10)
      if (start > end) {
        return { pageIds: [], pageNumbers: [], error: `Page range ${trimmed} is reversed.` }
      }
      for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
        pageNumbers.push(pageNumber)
      }
      continue
    }
    const pageNumber = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(pageNumber) || String(pageNumber) !== trimmed) {
      return { pageIds: [], pageNumbers: [], error: `Page token ${trimmed} is not valid.` }
    }
    pageNumbers.push(pageNumber)
  }
  const uniquePageNumbers = [...new Set(pageNumbers)].sort((left, right) => left - right)
  if (uniquePageNumbers.length === 0) {
    return { pageIds: [], pageNumbers: [], error: 'At least one page is required.' }
  }
  const missingPageNumber = uniquePageNumbers.find((pageNumber) => !pageByNumber.has(pageNumber))
  if (missingPageNumber !== undefined) {
    return { pageIds: [], pageNumbers: [], error: `Page ${missingPageNumber} is not in this source file.` }
  }
  return {
    pageIds: uniquePageNumbers.map((pageNumber) => pageByNumber.get(pageNumber)?.page_id ?? 0),
    pageNumbers: uniquePageNumbers,
    error: '',
  }
}

function serializePageSelection(pageNumbers: number[]): string {
  const sorted = [...new Set(pageNumbers)].sort((left, right) => left - right)
  const ranges: string[] = []
  let start: number | null = null
  let previous: number | null = null
  for (const pageNumber of sorted) {
    if (start === null || previous === null) {
      start = pageNumber
      previous = pageNumber
      continue
    }
    if (pageNumber === previous + 1) {
      previous = pageNumber
      continue
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`)
    start = pageNumber
    previous = pageNumber
  }
  if (start !== null && previous !== null) {
    ranges.push(start === previous ? String(start) : `${start}-${previous}`)
  }
  return ranges.join(', ')
}

function formatPageNumbers(logicalDocument: DocumentLogicalDocumentRecord): string {
  const pageNumbers =
    logicalDocument.page_memberships.length > 0
      ? logicalDocument.page_memberships.map((membership) => membership.page_number)
      : logicalDocument.page_numbers
  return `pages ${serializePageSelection(pageNumbers)}`
}

type SplitEvidenceItem = {
  type: string
  summary: string
}

function splitConfidencePercent(logicalDocument: DocumentLogicalDocumentRecord): string {
  const rawConfidence = logicalDocument.provenance.split_confidence
  if (typeof rawConfidence !== 'number' || !Number.isFinite(rawConfidence)) {
    return ''
  }
  const normalizedConfidence = rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence
  return `${Math.round(normalizedConfidence)}%`
}

function splitEvidenceItems(logicalDocument: DocumentLogicalDocumentRecord): SplitEvidenceItem[] {
  const rawEvidence = logicalDocument.provenance.split_evidence
  if (Array.isArray(rawEvidence)) {
    return rawEvidence
      .map((item, index) => normalizeSplitEvidenceItem(item, index))
      .filter((item): item is SplitEvidenceItem => item !== null)
  }
  const splitReason = logicalDocument.provenance.split_reason
  return typeof splitReason === 'string' && splitReason.trim()
    ? [{ type: 'split_reason', summary: splitReason.trim() }]
    : []
}

function normalizeSplitEvidenceItem(item: unknown, index: number): SplitEvidenceItem | null {
  if (typeof item !== 'object' || item === null) {
    return null
  }
  const record = item as Record<string, unknown>
  const summary = typeof record.summary === 'string' ? record.summary.trim() : ''
  if (!summary) {
    return null
  }
  const type = typeof record.type === 'string' && record.type.trim()
    ? record.type.trim()
    : `evidence-${index}`
  return { type, summary }
}
