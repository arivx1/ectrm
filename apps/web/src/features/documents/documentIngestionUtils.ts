import type {
  DocumentExtractedFieldRecord,
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentTableBlockRecord,
  DocumentTableTemplateSchemaRecord,
} from '../../shared/models'
import type { UpdateDocumentIngestionInput, UpdateDocumentPageInput } from '../../entities/documents/api'

export const DOCUMENT_REVIEW_STATUS_OPTIONS = ['UNREVIEWED', 'IN_REVIEW', 'VERIFIED'] as const
export const PAGE_REVIEW_STATUS_OPTIONS = ['UNREVIEWED', 'REVIEWED'] as const

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

export function isPdfFile(file: File): boolean {
  const normalizedName = file.name.trim().toLowerCase()
  const normalizedType = file.type.trim().toLowerCase()
  return normalizedName.endsWith('.pdf') || normalizedType === 'application/pdf'
}

export function normalizeKey(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) {
    return ''
  }
  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`.slice(0, 64)
}

export function humanizeKey(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function dominantDocumentKind(document: DocumentIngestionRecord): string {
  const candidate = document.analysis_summary.dominant_document_kind
  return typeof candidate === 'string' && candidate.trim() ? candidate.replaceAll('_', ' ') : 'UNKNOWN'
}

export function reviewedPageCount(document: DocumentIngestionRecord): number {
  const candidate = document.analysis_summary.reviewed_page_count
  return typeof candidate === 'number' ? candidate : 0
}

export function reviewReady(document: DocumentIngestionRecord): boolean {
  return document.analysis_summary.review_ready === true
}

export function documentNeedsProcessing(document: DocumentIngestionRecord): boolean {
  return document.status === 'UPLOADED' || document.status === 'PROCESSING'
}

export function documentStatusTone(status: string): 'active' | 'blocked' | 'in-progress' | 'planned' {
  if (status === 'FAILED') {
    return 'blocked'
  }
  if (status === 'PROCESSING') {
    return 'in-progress'
  }
  if (status === 'UPLOADED') {
    return 'planned'
  }
  return 'active'
}

export function documentStatusCopy(document: DocumentIngestionRecord): string {
  if (document.status === 'UPLOADED') {
    return 'Analysis is queued. Page stubs are ready now, and this panel will refresh automatically when extraction finishes.'
  }
  if (document.status === 'PROCESSING') {
    return 'Analysis is running in the background. Review controls unlock again once classification and extraction complete.'
  }
  return (
    'This review surface is schema-driven: page kinds define required header fields and expected table templates, ' +
    'and verification only succeeds once every page has been reviewed against that contract.'
  )
}

export function pageTextSourceLabel(page: DocumentIngestionPageRecord): string {
  if (page.text_source === 'ocr') {
    return 'OCR Text'
  }
  if (page.text_source === 'pdf_text') {
    return 'PDF Text'
  }
  return 'No Text Captured'
}

export function pageTextSourceTone(page: DocumentIngestionPageRecord): 'active' | 'planned' {
  return page.text_source === 'none' ? 'planned' : 'active'
}

export function reindexTableBlocks(blocks: DocumentTableBlockRecord[]): DocumentTableBlockRecord[] {
  return blocks.map((block, index) => ({ ...block, table_index: index + 1 }))
}

export function buildBlankRow(columns: string[]): Record<string, string | null> {
  return Object.fromEntries(columns.map((column) => [column, ''])) as Record<string, string | null>
}

export function buildBlankTableBlock(template?: DocumentTableTemplateSchemaRecord): DocumentTableBlockRecord {
  const columns = template?.columns.map((column) => column.column_key) ?? ['column_1']
  return {
    table_index: 1,
    template_key: template?.template_key ?? null,
    title: template?.label ?? null,
    columns,
    rows: [buildBlankRow(columns)],
    header_row_detected: false,
    source: 'review',
  }
}

export function uniqueCustomFieldKey(fields: DocumentExtractedFieldRecord[]): string {
  let index = 1
  while (fields.some((field) => field.field_key === `custom_field_${index}`)) {
    index += 1
  }
  return `custom_field_${index}`
}

export function toDocumentUpdatePayload(document: DocumentIngestionRecord): UpdateDocumentIngestionInput {
  return {
    display_name: document.display_name,
    review_status: document.review_status,
    review_notes: document.review_notes,
  }
}

export function toPageUpdatePayload(page: DocumentIngestionPageRecord): UpdateDocumentPageInput {
  return {
    document_kind: page.document_kind,
    document_subtype: page.document_subtype,
    header_fields: page.header_fields.map((field) => ({
      field_key: field.field_key,
      label: field.label,
      value: field.value,
      confidence: field.confidence,
      source: field.source,
    })),
    table_blocks: page.table_blocks.map((table) => ({
      template_key: table.template_key,
      title: table.title,
      columns: table.columns,
      rows: table.rows,
      header_row_detected: table.header_row_detected,
      source: table.source,
    })),
    review_status: page.review_status,
    review_notes: page.review_notes,
  }
}
