import type {
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentKindSchemaRecord,
  DocumentSchemaRegistryRecord,
} from '../../shared/models'
import {
  formatDocumentKindLabel,
  pageProcessorTrace,
  pageClassificationCorrected,
  pageLearningApplied,
  pageLearningExampleCount,
  PAGE_REVIEW_STATUS_OPTIONS,
  pageSystemClassification,
  processorLabel,
  processorTraceTone,
  pageRoutingAssessment,
  pageTextSourceLabel,
  pageTextSourceTone,
  routingPrimaryLabel,
  routingStatusTone,
  routingStrategyLabel,
} from './documentIngestionUtils'
import { DocumentIngestionHeaderFieldsEditor } from './DocumentIngestionHeaderFieldsEditor'
import { DocumentIngestionTableBlocksEditor } from './DocumentIngestionTableBlocksEditor'
import type { DocumentIngestionController } from './useDocumentIngestionController'

type DocumentIngestionPageEditorProps = {
  controller: DocumentIngestionController
  document: DocumentIngestionRecord
  page: DocumentIngestionPageRecord
  schema: DocumentKindSchemaRecord | null
  schemaRegistry: DocumentSchemaRegistryRecord | null
}

export function DocumentIngestionPageEditor({
  controller,
  document,
  page,
  schema,
  schemaRegistry,
}: DocumentIngestionPageEditorProps) {
  const pageSaveTarget = `page:${page.page_id}`
  const pageError = controller.saveErrors[pageSaveTarget] ?? ''
  const pagePreviewUrl = controller.pagePreviewUrls[page.page_id] ?? ''
  const pagePreviewError = controller.pagePreviewErrors[page.page_id] ?? ''
  const pagePreviewIsLoading = controller.pagePreviewLoading[page.page_id] === true
  const routingAssessment = pageRoutingAssessment(page)
  const processorTrace = pageProcessorTrace(page)
  const systemClassification = pageSystemClassification(page)
  const classificationCorrected = pageClassificationCorrected(page)
  const learningApplied = pageLearningApplied(page)
  const learningExampleCount = pageLearningExampleCount(page)
  const deterministicAssessment = page.understanding.deterministic_assessment
  const deterministicSupportingEvidence = deterministicAssessment.supporting_evidence.filter((value) => value.trim())
  const deterministicConflicts = deterministicAssessment.conflicts.filter((value) => value.trim())
  const nonProcessorWarnings = page.processing_warnings.filter((warning) => !processorTrace?.warnings.includes(warning))

  return (
    <section className="document-ingestion-page document-ingestion-page-editor">
      <div className="document-ingestion-page-head">
        <strong>Page {page.page_number}</strong>
        <span className="entity-chip entity-chip-soft">{page.review_status.replaceAll('_', ' ')}</span>
      </div>

      <div className="document-editor-grid">
        <label>
          <span>Document Kind</span>
          <select
            className="control"
            value={page.document_kind}
            onChange={(event) =>
              controller.updatePageDraft(document.document_id, page.page_id, (current) => ({
                ...current,
                document_kind: event.target.value,
              }))
            }
          >
            {(schemaRegistry?.document_kinds ?? []).map((entry) => (
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
            value={page.document_subtype ?? ''}
            onChange={(event) =>
              controller.updatePageDraft(document.document_id, page.page_id, (current) => ({
                ...current,
                document_subtype: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>Page Review Status</span>
          <select
            className="control"
            value={page.review_status}
            onChange={(event) =>
              controller.updatePageDraft(document.document_id, page.page_id, (current) => ({
                ...current,
                review_status: event.target.value,
              }))
            }
          >
            {PAGE_REVIEW_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="document-schema-note">
        <div className="document-ingestion-chip-row">
          <span className={`status-pill status-pill-${learningApplied ? 'active' : 'planned'}`}>
            {learningApplied ? 'LEARNED' : 'SYSTEM'}
          </span>
          <span className="entity-chip entity-chip-soft">
            {formatDocumentKindLabel(systemClassification.documentKind)}
            {systemClassification.documentSubtype ? ` • ${systemClassification.documentSubtype}` : ''}
          </span>
          {systemClassification.confidence !== null ? (
            <span className="entity-chip entity-chip-soft">
              {Math.round(systemClassification.confidence * 100)}% confidence
            </span>
          ) : null}
        </div>
        {classificationCorrected ? (
          <p>
            Corrected from {formatDocumentKindLabel(systemClassification.documentKind)}
            {systemClassification.documentSubtype ? ` • ${systemClassification.documentSubtype}` : ''}
            {' to '}
            {formatDocumentKindLabel(page.document_kind)}
            {page.document_subtype ? ` • ${page.document_subtype}` : ''}. Future uploads with similar extracted
            content can reuse this saved classification.
          </p>
        ) : (
          <p>
            Change the kind or subtype if the upload was classified incorrectly. Saved corrections become a deterministic
            learning signal for future uploads with similar document content.
          </p>
        )}
        {learningApplied ? (
          <p>
            This page reused {learningExampleCount} prior correction{learningExampleCount === 1 ? '' : 's'} before the
            review step.
          </p>
        ) : null}
        {systemClassification.matchedBy ? <p>System evidence: {systemClassification.matchedBy.replaceAll('_', ' ')}.</p> : null}
        {deterministicAssessment.document_kind ? (
          <div className="document-schema-note">
            <div className="document-ingestion-chip-row">
              <span className={`status-pill status-pill-${deterministicConflicts.length > 0 ? 'in-progress' : 'active'}`}>
                DETERMINISTIC
              </span>
              <span className="entity-chip entity-chip-soft">
                {formatDocumentKindLabel(deterministicAssessment.document_kind)}
                {deterministicAssessment.document_subtype ? ` • ${deterministicAssessment.document_subtype}` : ''}
              </span>
              {deterministicAssessment.confidence !== null ? (
                <span className="entity-chip entity-chip-soft">
                  {Math.round(deterministicAssessment.confidence * 100)}% confidence
                </span>
              ) : null}
            </div>
            {deterministicAssessment.document_kind !== systemClassification.documentKind ? (
              <p>
                The final system classification differs because a later AI or learned override changed the review
                starting point.
              </p>
            ) : null}
            {deterministicSupportingEvidence.map((evidence) => (
              <p key={evidence}>{evidence}</p>
            ))}
            {deterministicConflicts.map((conflict) => (
              <p key={conflict}>Watch for: {conflict}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="document-page-evidence">
        <div className="document-page-preview-panel">
          <div className="document-page-preview-head">
            <strong>Page Preview</strong>
            <span className={`status-pill status-pill-${page.preview_available ? 'active' : 'planned'}`}>
              {page.preview_available ? 'READY' : 'PENDING'}
            </span>
          </div>
          {page.preview_available ? (
            pagePreviewUrl ? (
              <img
                className="document-page-preview-image"
                src={pagePreviewUrl}
                alt={`Preview for document page ${page.page_number}`}
              />
            ) : pagePreviewIsLoading ? (
              <p className="workflow-editor-note">Rendering the page preview for review…</p>
            ) : pagePreviewError ? (
              <p className="field-error">{pagePreviewError}</p>
            ) : (
              <p className="workflow-editor-note">Preview ready. Loading the rendered page…</p>
            )
          ) : (
            <p className="workflow-editor-note">
              The page preview will appear after background rendering completes for this page.
            </p>
          )}
        </div>

        <div className="document-page-evidence-copy">
          <div className="document-ingestion-chip-row">
            <span className={`status-pill status-pill-${pageTextSourceTone(page)}`}>
              {pageTextSourceLabel(page)}
            </span>
            {page.text_source === 'ocr' ? <span className="entity-chip entity-chip-soft">OCR Fallback Used</span> : null}
          </div>
          <p className="document-ingestion-page-copy">
            {page.raw_text_excerpt || 'No extractable text yet. This page will need OCR or image-based parsing.'}
          </p>
          {schema ? (
            <div className="document-schema-note">
              <strong>{schema.label}</strong>
              <p>{schema.review_guidance}</p>
            </div>
          ) : null}
          {routingAssessment ? (
            <div className="document-schema-note">
              <div className="document-ingestion-chip-row">
                <span className={`status-pill status-pill-${routingStatusTone(routingAssessment)}`}>
                  {routingAssessment.status.replaceAll('_', ' ')}
                </span>
                <span className="entity-chip entity-chip-soft">{routingStrategyLabel(routingAssessment)}</span>
                <span className="entity-chip entity-chip-soft">{routingPrimaryLabel(routingAssessment)}</span>
              </div>
              {routingAssessment.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          ) : null}
          {processorTrace ? (
            <div className="document-schema-note">
              <div className="document-ingestion-chip-row">
                <span className={`status-pill status-pill-${processorTraceTone(processorTrace)}`}>
                  {processorTrace.partial ? 'AI PARTIAL' : processorTrace.applied ? 'AI APPLIED' : 'AI READY'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {processorLabel(processorTrace.provider)}
                  {processorTrace.model ? ` • ${processorTrace.model}` : ''}
                </span>
                {processorTrace.overrode_heuristics ? (
                  <span className="entity-chip entity-chip-soft">Heuristic Classification Overridden</span>
                ) : null}
              </div>
              {processorTrace.heuristic_document_kind ? (
                <p>
                  Heuristic classification started at {processorTrace.heuristic_document_kind.replaceAll('_', ' ')}
                  {processorTrace.heuristic_document_subtype ? ` • ${processorTrace.heuristic_document_subtype}` : ''}
                  {processorTrace.overrode_heuristics
                    ? ` and was updated to ${page.document_kind.replaceAll('_', ' ')}${page.document_subtype ? ` • ${page.document_subtype}` : ''}.`
                    : '.'}
                </p>
              ) : null}
              {processorTrace.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <DocumentIngestionHeaderFieldsEditor
        controller={controller}
        document={document}
        page={page}
        schema={schema}
      />

      <DocumentIngestionTableBlocksEditor
        controller={controller}
        document={document}
        page={page}
        schema={schema}
      />

      <label>
        <span>Page Review Notes</span>
        <textarea
          className="control control-textarea"
          value={page.review_notes ?? ''}
          onChange={(event) =>
            controller.updatePageDraft(document.document_id, page.page_id, (current) => ({
              ...current,
              review_notes: event.target.value,
            }))
          }
        />
      </label>

      {nonProcessorWarnings.length > 0 ? (
        <p className="workflow-editor-note">{nonProcessorWarnings.join(' ')}</p>
      ) : null}
      {page.processing_errors.length > 0 ? <p className="field-error">{page.processing_errors.join(' ')}</p> : null}
      {pageError ? <p className="field-error">{pageError}</p> : null}

      <div className="document-editor-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={controller.savingTarget === pageSaveTarget}
          onClick={() => void controller.handleSavePage(document, page)}
        >
          {controller.savingTarget === pageSaveTarget ? 'Saving…' : `Save Page ${page.page_number}`}
        </button>
        <span className="workflow-editor-note">
          Saving a page revalidates required fields and table templates when the page is marked `REVIEWED`.
        </span>
      </div>
    </section>
  )
}
