import type { DocumentIngestionRecord } from '../../shared/models'
import {
  actionPlanExecutable,
  actionPlanPrimaryLabel,
  actionPlanTone,
  correctedPageCount,
  documentActionPlan,
  documentActionAlreadyApplied,
  documentLinkageAssessment,
  documentProcessorTrace,
  documentRecordLinks,
  DOCUMENT_REVIEW_STATUS_OPTIONS,
  documentRoutingAssessment,
  documentNeedsProcessing,
  documentStatusCopy,
  documentStatusTone,
  dominantDocumentKind,
  formatBytes,
  linkagePrimaryLabel,
  linkageStatusTone,
  processorLabel,
  processorTraceTone,
  reviewReady,
  routingPrimaryLabel,
  routingStatusTone,
  routingStrategyLabel,
  learnedPageCount,
  reviewedPageCount,
} from './documentIngestionUtils'
import { DocumentIngestionPageEditor } from './DocumentIngestionPageEditor'
import type { DocumentIngestionController } from './useDocumentIngestionController'

type DocumentIngestionDocumentCardProps = {
  controller: DocumentIngestionController
  document: DocumentIngestionRecord
  formatDate: (value: string | null | undefined) => string
}

export function DocumentIngestionDocumentCard({
  controller,
  document,
  formatDate,
}: DocumentIngestionDocumentCardProps) {
  const configuredProviders = controller.processorSettings?.providers.filter((provider) => provider.configured) ?? []
  const reprocessProviderValue =
    controller.reprocessProviderByDocument[document.document_id] ||
    document.processor_provider ||
    controller.processorSettings?.effective_default_provider ||
    ''
  const isExpanded = controller.expandedDocumentIds[document.document_id] ?? false
  const documentSaveTarget = `document:${document.document_id}`
  const reprocessTarget = `reprocess:${document.document_id}`
  const executeTarget = `execute:${document.document_id}`
  const documentError =
    controller.saveErrors[documentSaveTarget] ??
    controller.saveErrors[reprocessTarget] ??
    controller.saveErrors[executeTarget] ??
    ''
  const isDocumentProcessing = documentNeedsProcessing(document)
  const routingAssessment = documentRoutingAssessment(document)
  const linkageAssessment = documentLinkageAssessment(document)
  const actionPlan = documentActionPlan(document)
  const processorTrace = documentProcessorTrace(document)
  const linkedRecords = documentRecordLinks(document)
  const actionApplied = documentActionAlreadyApplied(document)
  const canExecuteAction = actionPlanExecutable(actionPlan) && !actionApplied && !isDocumentProcessing
  const correctedPages = correctedPageCount(document)
  const learnedPages = learnedPageCount(document)

  return (
    <article className="position-card shipment-card workflow-item-card document-ingestion-card">
      <div className="shipment-card-head">
        <div className="shipment-card-copy">
          <strong>{document.display_name}</strong>
          <span>
            {document.original_filename} • {formatBytes(document.size_bytes)} • Uploaded {formatDate(document.created_at)}
          </span>
        </div>
        <div className="document-ingestion-header-actions">
          <span className={`status-pill status-pill-${documentStatusTone(document.status)}`}>{document.status}</span>
          <button
            type="button"
            className="button button-secondary"
            disabled={isDocumentProcessing || controller.savingTarget === reprocessTarget}
            onClick={() => void controller.handleReprocessDocument(document)}
          >
            {controller.savingTarget === reprocessTarget ? 'Queueing…' : 'Reprocess'}
          </button>
          {actionPlan ? (
            <button
              type="button"
              className="button button-primary"
              disabled={!canExecuteAction || controller.savingTarget === executeTarget}
              onClick={() => void controller.handleExecuteActionPlan(document)}
            >
              {controller.savingTarget === executeTarget
                ? 'Applying…'
                : actionApplied
                  ? 'Action Applied'
                  : 'Apply Action'}
            </button>
          ) : null}
          <button
            type="button"
            className="button button-ghost"
            onClick={() => controller.toggleDocumentExpanded(document.document_id)}
          >
            {isExpanded ? 'Hide Review' : 'Review Document'}
          </button>
        </div>
      </div>
      <div className="shipment-card-meta">
        <span className="entity-chip entity-chip-soft">{document.page_count} page{document.page_count === 1 ? '' : 's'}</span>
        <span className="entity-chip entity-chip-soft">{dominantDocumentKind(document)}</span>
        {document.processor_provider ? (
          <span className="entity-chip entity-chip-soft">
            {processorLabel(document.processor_provider)}
            {document.processor_model ? ` • ${document.processor_model}` : ''}
          </span>
        ) : (
          <span className="entity-chip entity-chip-soft">Built-in Parser</span>
        )}
        {processorTrace ? (
          <>
            <span className={`status-pill status-pill-${processorTraceTone(processorTrace)}`}>
              {processorTrace.partial ? 'AI PARTIAL' : processorTrace.applied ? 'AI APPLIED' : 'AI READY'}
            </span>
            {processorTrace.overrode_heuristics ? (
              <span className="entity-chip entity-chip-soft">Heuristics Overridden</span>
            ) : null}
          </>
        ) : null}
        <span className="entity-chip entity-chip-soft">{document.review_status.replaceAll('_', ' ')}</span>
        <span className="entity-chip entity-chip-soft">
          {reviewedPageCount(document)}/{document.page_count} pages reviewed
        </span>
        <span className="entity-chip entity-chip-soft">
          {reviewReady(document) ? 'Ready To Verify' : 'Review Incomplete'}
        </span>
        {correctedPages > 0 ? (
          <span className="entity-chip entity-chip-soft">
            {correctedPages} corrected page{correctedPages === 1 ? '' : 's'}
          </span>
        ) : null}
        {learnedPages > 0 ? (
          <span className="entity-chip entity-chip-soft">
            {learnedPages} learned match{learnedPages === 1 ? '' : 'es'}
          </span>
        ) : null}
        {routingAssessment ? (
          <>
            <span className={`status-pill status-pill-${routingStatusTone(routingAssessment)}`}>
              {routingAssessment.status.replaceAll('_', ' ')}
            </span>
            <span className="entity-chip entity-chip-soft">{routingStrategyLabel(routingAssessment)}</span>
            <span className="entity-chip entity-chip-soft">{routingPrimaryLabel(routingAssessment)}</span>
          </>
        ) : null}
        {linkageAssessment ? (
          <>
            <span className={`status-pill status-pill-${linkageStatusTone(linkageAssessment)}`}>
              {linkageAssessment.status.replaceAll('_', ' ')}
            </span>
            <span className="entity-chip entity-chip-soft">{linkageAssessment.recommended_action.replaceAll('_', ' ')}</span>
            <span className="entity-chip entity-chip-soft">{linkagePrimaryLabel(linkageAssessment)}</span>
          </>
        ) : null}
        {actionPlan ? (
          <>
            <span className={`status-pill status-pill-${actionPlanTone(actionPlan)}`}>
              {actionPlan.status.replaceAll('_', ' ')}
            </span>
            <span className="entity-chip entity-chip-soft">{actionPlan.action_type.replaceAll('_', ' ')}</span>
            <span className="entity-chip entity-chip-soft">{actionPlanPrimaryLabel(actionPlan)}</span>
          </>
        ) : null}
      </div>
      <div className="document-ingestion-summary">
        <p>{documentStatusCopy(document)}</p>
        {processorTrace ? (
          <p>
            {processorTrace.applied
              ? `${processorLabel(processorTrace.provider)} processed ${processorTrace.applied_page_count}/${document.page_count} pages.`
              : `${processorLabel(processorTrace.provider)} was selected for document processing.`}
            {processorTrace.overrode_heuristics
              ? ` Heuristics were overridden on ${processorTrace.overridden_page_count} page${processorTrace.overridden_page_count === 1 ? '' : 's'}.`
              : ''}
            {processorTrace.partial
              ? ` Partial AI results or warnings were recorded on ${processorTrace.partial_page_count} page${processorTrace.partial_page_count === 1 ? '' : 's'}.`
              : ''}
          </p>
        ) : null}
        {routingAssessment?.reasons?.[0] ? <p>{routingAssessment.reasons[0]}</p> : null}
        {linkageAssessment?.reasons?.[0] ? <p>{linkageAssessment.reasons[0]}</p> : null}
        {actionPlan?.description ? <p>{actionPlan.description}</p> : null}
        {linkedRecords[0] ? <p>{`Linked to ${linkedRecords[0].record_label}.`}</p> : null}
        {correctedPages > 0 ? (
          <p>
            {correctedPages} page{correctedPages === 1 ? '' : 's'} ha{correctedPages === 1 ? 's' : 've'} a saved
            classification correction. Future uploads with similar extracted content can reuse that saved choice.
          </p>
        ) : null}
        {document.processing_errors.length > 0 ? <p className="field-error">{document.processing_errors.join(' ')}</p> : null}
      </div>

      {isExpanded ? (
        <div className="document-review-editor">
          {isDocumentProcessing ? (
            <p className="workflow-editor-note">
              Review fields are temporarily locked while the background processor refreshes page classifications and extracted data.
            </p>
          ) : null}
          <fieldset className="document-review-fieldset" disabled={isDocumentProcessing}>
            <div className="document-editor-grid">
              <label>
                <span>Display Name</span>
                <input
                  className="control"
                  type="text"
                  value={document.display_name}
                  onChange={(event) =>
                    controller.updateDocumentDraft(document.document_id, (current) => ({
                      ...current,
                      display_name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Document Review Status</span>
                <select
                  className="control"
                  value={document.review_status}
                  onChange={(event) =>
                    controller.updateDocumentDraft(document.document_id, (current) => ({
                      ...current,
                      review_status: event.target.value,
                    }))
                  }
                >
                  {DOCUMENT_REVIEW_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {configuredProviders.length > 0 ? (
                <label>
                  <span>Reprocess With</span>
                  <select
                    className="control"
                    value={reprocessProviderValue}
                    onChange={(event) =>
                      controller.setDocumentReprocessProvider(
                        document.document_id,
                        event.target.value as 'builtin' | 'openai' | 'anthropic' | 'google' | '',
                      )
                    }
                  >
                    <option value="builtin">Built-in Parser Only</option>
                    {configuredProviders.map((provider) => (
                      <option key={provider.provider} value={provider.provider}>
                        {provider.label} ({provider.default_model})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <label>
              <span>Document Review Notes</span>
              <textarea
                className="control control-textarea"
                value={document.review_notes ?? ''}
                onChange={(event) =>
                  controller.updateDocumentDraft(document.document_id, (current) => ({
                    ...current,
                    review_notes: event.target.value,
                  }))
                }
              />
            </label>
            <div className="document-editor-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={controller.savingTarget === documentSaveTarget}
                onClick={() => void controller.handleSaveDocument(document)}
              >
                {controller.savingTarget === documentSaveTarget ? 'Saving…' : 'Save Document Review'}
              </button>
              <span className="workflow-editor-note">
                Use `VERIFIED` only after every page is reviewed and required fields or tables are complete.
              </span>
              {configuredProviders.length > 0 ? (
                <span className="workflow-editor-note">
                  Reprocess will use {processorLabel((reprocessProviderValue || null) as DocumentIngestionRecord['processor_provider'])}.
                </span>
              ) : null}
            </div>
            {documentError ? <p className="field-error">{documentError}</p> : null}

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
                  <span className="entity-chip entity-chip-soft">
                    {processorTrace.applied_page_count}/{document.page_count} pages processed
                  </span>
                  {processorTrace.overrode_heuristics ? (
                    <span className="entity-chip entity-chip-soft">
                      {processorTrace.overridden_page_count} heuristic override{processorTrace.overridden_page_count === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                {processorTrace.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            {linkageAssessment ? (
              <div className="document-schema-note">
                <div className="document-ingestion-chip-row">
                  <span className={`status-pill status-pill-${linkageStatusTone(linkageAssessment)}`}>
                    {linkageAssessment.status.replaceAll('_', ' ')}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    {linkageAssessment.recommended_action.replaceAll('_', ' ')}
                  </span>
                  <span className="entity-chip entity-chip-soft">{linkagePrimaryLabel(linkageAssessment)}</span>
                </div>
                {linkageAssessment.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {linkageAssessment.candidates.slice(0, 3).map((candidate) => (
                  <p key={`${candidate.record_type}-${candidate.record_id ?? candidate.record_label}`}>
                    <strong>{candidate.record_label}</strong>
                    {` • ${candidate.summary}`}
                    {candidate.matched_keys.length > 0 ? ` • matched ${candidate.matched_keys.join(', ')}` : ''}
                  </p>
                ))}
              </div>
            ) : null}

            {actionPlan ? (
              <div className="document-schema-note">
                <div className="document-ingestion-chip-row">
                  <span className={`status-pill status-pill-${actionPlanTone(actionPlan)}`}>
                    {actionPlan.status.replaceAll('_', ' ')}
                  </span>
                  <span className="entity-chip entity-chip-soft">{actionPlan.action_type.replaceAll('_', ' ')}</span>
                  {actionPlan.operation_type ? (
                    <span className="entity-chip entity-chip-soft">{actionPlan.operation_type.replaceAll('_', ' ')}</span>
                  ) : null}
                </div>
                <p>
                  <strong>{actionPlan.title}</strong>
                  {` • ${actionPlan.description}`}
                </p>
                {actionPlan.target ? (
                  <p>
                    <strong>Target</strong>
                    {` • ${actionPlan.target.record_label}`}
                  </p>
                ) : null}
                {actionPlan.owner ? (
                  <p>
                    <strong>Owner</strong>
                    {` • ${actionPlan.owner.record_label}`}
                  </p>
                ) : null}
                {actionPlan.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            ) : null}

            {linkedRecords.length > 0 ? (
              <div className="document-schema-note">
                <div className="document-ingestion-chip-row">
                  <span className="status-pill status-pill-active">Linked Records</span>
                  <span className="entity-chip entity-chip-soft">{linkedRecords.length} linked</span>
                </div>
                {linkedRecords.map((link) => (
                  <p key={`${link.record_type}-${link.record_id}`}>
                    <strong>{link.record_label}</strong>
                    {` • ${link.summary}`}
                    {` • ${link.role.replaceAll('_', ' ')}`}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="document-ingestion-page-grid">
              {document.pages.map((page) => (
                <DocumentIngestionPageEditor
                  key={page.page_id}
                  controller={controller}
                  document={document}
                  page={page}
                  schema={controller.schemaByKind[page.document_kind] ?? null}
                  schemaRegistry={controller.schemaRegistry}
                />
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </article>
  )
}
