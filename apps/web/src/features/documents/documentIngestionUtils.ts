import type {
  DocumentActionPlanRecord,
  DocumentFacetAssignmentRecord,
  DocumentExtractedFieldRecord,
  DocumentLinkageAssessmentRecord,
  DocumentProcessorDocumentTraceRecord,
  DocumentProcessorPageTraceRecord,
  DocumentRecordLinkRecord,
  DocumentRoutingAssessmentRecord,
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

export function dominantDocumentKindCode(document: DocumentIngestionRecord): string {
  const candidate = document.analysis_summary.dominant_document_kind
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate
  }
  const pageCandidate = document.pages.find((page) => page.document_kind?.trim())?.document_kind
  return pageCandidate?.trim() ? pageCandidate : 'UNKNOWN'
}

export function dominantDocumentKind(document: DocumentIngestionRecord): string {
  return formatDocumentKindLabel(dominantDocumentKindCode(document))
}

export function reviewedPageCount(document: DocumentIngestionRecord): number {
  const candidate = document.analysis_summary.reviewed_page_count
  return typeof candidate === 'number' ? candidate : 0
}

export function correctedPageCount(document: DocumentIngestionRecord): number {
  const candidate = document.analysis_summary.corrected_page_count
  return typeof candidate === 'number' ? candidate : 0
}

export function learnedPageCount(document: DocumentIngestionRecord): number {
  const candidate = document.analysis_summary.learning_applied_page_count
  return typeof candidate === 'number' ? candidate : 0
}

export function documentRoutingAssessment(document: DocumentIngestionRecord): DocumentRoutingAssessmentRecord | null {
  return document.routing_assessment
}

export function documentLinkageAssessment(document: DocumentIngestionRecord): DocumentLinkageAssessmentRecord | null {
  return document.linkage_assessment
}

export function documentActionPlan(document: DocumentIngestionRecord): DocumentActionPlanRecord | null {
  return document.action_plan
}

export function documentRecordLinks(document: DocumentIngestionRecord): DocumentRecordLinkRecord[] {
  return document.record_links
}

export function activeDocumentFacetValues(values: DocumentFacetAssignmentRecord[] | null | undefined): DocumentFacetAssignmentRecord[] {
  const seen = new Set<string>()
  const activeValues: DocumentFacetAssignmentRecord[] = []
  for (const value of values ?? []) {
    if (value.review_status === 'REJECTED') {
      continue
    }
    const key = `${value.page_id ?? 'document'}:${value.facet_key}:${value.value_code}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    activeValues.push(value)
  }
  return activeValues
}

export function documentFacetDisplayValues(document: DocumentIngestionRecord): DocumentFacetAssignmentRecord[] {
  const seen = new Set<string>()
  const values: DocumentFacetAssignmentRecord[] = []
  for (const value of activeDocumentFacetValues(document.facet_values)) {
    const key = `${value.facet_key}:${value.value_code}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    values.push(value)
  }
  return values
}

export function formatDocumentFacetLabel(value: DocumentFacetAssignmentRecord): string {
  return `${value.facet_label}: ${value.value_label}`
}

export function documentProcessorTrace(document: DocumentIngestionRecord): DocumentProcessorDocumentTraceRecord | null {
  return document.processor_trace
}

export function pageProcessorTrace(page: DocumentIngestionPageRecord): DocumentProcessorPageTraceRecord | null {
  return page.processor_trace
}

export function pageRoutingAssessment(page: DocumentIngestionPageRecord): DocumentRoutingAssessmentRecord | null {
  return page.routing_assessment
}

export function formatDocumentKindLabel(value: string | null | undefined): string {
  const normalized = value?.trim()
  if (!normalized) {
    return 'UNKNOWN'
  }
  if (normalized.toUpperCase() === 'MIXED') {
    return 'Mixed / Page-level'
  }
  return normalized.replaceAll('_', ' ')
}

export function pageSystemClassification(page: DocumentIngestionPageRecord): {
  documentKind: string
  documentSubtype: string | null
  confidence: number | null
  source: string | null
  matchedBy: string | null
} {
  const payload = page.classification_payload
  return {
    documentKind:
      typeof payload.system_document_kind === 'string' && payload.system_document_kind.trim()
        ? payload.system_document_kind
        : page.document_kind,
    documentSubtype:
      typeof payload.system_document_subtype === 'string' && payload.system_document_subtype.trim()
        ? payload.system_document_subtype
        : null,
    confidence: typeof payload.system_classification_confidence === 'number' ? payload.system_classification_confidence : null,
    source:
      typeof payload.system_classification_source === 'string' && payload.system_classification_source.trim()
        ? payload.system_classification_source
        : null,
    matchedBy:
      typeof payload.system_matched_by === 'string' && payload.system_matched_by.trim()
        ? payload.system_matched_by
        : null,
  }
}

export function pageClassificationCorrected(page: DocumentIngestionPageRecord): boolean {
  return page.classification_payload.classification_corrected === true
}

export function pageLearningApplied(page: DocumentIngestionPageRecord): boolean {
  return page.classification_payload.learning_applied === true
}

export function pageLearningExampleCount(page: DocumentIngestionPageRecord): number {
  const candidate = page.classification_payload.learning_example_count
  return typeof candidate === 'number' ? candidate : 0
}

export function processorLabel(provider: 'builtin' | 'openai' | 'anthropic' | 'google' | null | undefined): string {
  if (provider === 'builtin') {
    return 'Built-in Parser'
  }
  if (provider === 'openai') {
    return 'GPT'
  }
  if (provider === 'anthropic') {
    return 'Claude'
  }
  if (provider === 'google') {
    return 'Gemini'
  }
  return 'Built-in Parser'
}

export function processorTraceTone(
  trace: DocumentProcessorDocumentTraceRecord | DocumentProcessorPageTraceRecord | null | undefined,
): 'active' | 'in-progress' | 'planned' {
  if (trace?.partial) {
    return 'in-progress'
  }
  if (trace?.applied) {
    return 'active'
  }
  return 'planned'
}

export function routingStrategyLabel(assessment: DocumentRoutingAssessmentRecord | null | undefined): string {
  const candidate = assessment?.routing_strategy ?? 'MANUAL_REVIEW'
  return candidate.replaceAll('_', ' ')
}

export function routingStatusTone(
  assessment: DocumentRoutingAssessmentRecord | null | undefined,
): 'active' | 'in-progress' | 'planned' | 'blocked' {
  if (assessment?.status === 'READY') {
    return 'active'
  }
  if (assessment?.status === 'PARTIAL') {
    return 'in-progress'
  }
  if (assessment?.status === 'INSUFFICIENT') {
    return 'blocked'
  }
  return 'planned'
}

export function routingPrimaryLabel(assessment: DocumentRoutingAssessmentRecord | null | undefined): string {
  return assessment?.primary_label?.trim() || 'Manual Review'
}

export function linkageStatusTone(
  assessment: DocumentLinkageAssessmentRecord | null | undefined,
): 'active' | 'in-progress' | 'planned' | 'blocked' {
  if (assessment?.status === 'READY') {
    return 'active'
  }
  if (assessment?.status === 'CREATE') {
    return 'planned'
  }
  if (assessment?.status === 'CANDIDATE') {
    return 'in-progress'
  }
  return 'blocked'
}

export function linkagePrimaryLabel(assessment: DocumentLinkageAssessmentRecord | null | undefined): string {
  return assessment?.primary_record_label?.trim() || 'Manual Review'
}

export function actionPlanTone(
  plan: DocumentActionPlanRecord | null | undefined,
): 'active' | 'in-progress' | 'planned' | 'blocked' {
  if (plan?.status === 'READY') {
    return 'active'
  }
  if (plan?.status === 'REVIEW') {
    return 'in-progress'
  }
  if (plan?.status === 'BLOCKED') {
    return 'blocked'
  }
  return 'planned'
}

export function actionPlanPrimaryLabel(plan: DocumentActionPlanRecord | null | undefined): string {
  return plan?.target?.record_label?.trim() || plan?.title?.trim() || 'Manual Review Required'
}

export function actionPlanExecutable(plan: DocumentActionPlanRecord | null | undefined): boolean {
  return Boolean(
    plan &&
      plan.status === 'READY' &&
      plan.operation_type &&
      ['link_document_to_record', 'create_trade_confirmation', 'issue_trade_invoice', 'create_trade_payment'].includes(
        plan.operation_type,
      ),
  )
}

export function documentActionAlreadyApplied(document: DocumentIngestionRecord): boolean {
  const plan = document.action_plan
  const target = plan?.target
  if (!plan || !target?.record_id) {
    return false
  }
  return document.record_links.some(
    (link) => link.record_type === target.record_type && link.record_id === target.record_id,
  )
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
    facet_values: activeDocumentFacetValues(document.facet_values)
      .filter((facetValue) => facetValue.page_id === null)
      .map(toDocumentFacetAssignmentInput),
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
    facet_values: activeDocumentFacetValues(page.facet_values).map(toDocumentFacetAssignmentInput),
    review_status: page.review_status,
    review_notes: page.review_notes,
  }
}

function toDocumentFacetAssignmentInput(value: DocumentFacetAssignmentRecord) {
  return {
    facet_key: value.facet_key,
    value_code: value.value_code,
    value_label: value.value_label,
    source: value.source,
    confidence: value.confidence,
    review_status: value.review_status,
    evidence: value.evidence,
  }
}
