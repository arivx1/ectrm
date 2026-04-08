import type { DocumentIngestionRecord } from '../../shared/models'
import {
  DOCUMENT_REVIEW_STATUS_OPTIONS,
  documentNeedsProcessing,
  documentStatusCopy,
  documentStatusTone,
  dominantDocumentKind,
  formatBytes,
  reviewReady,
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
  const isExpanded = controller.expandedDocumentIds[document.document_id] ?? false
  const documentSaveTarget = `document:${document.document_id}`
  const reprocessTarget = `reprocess:${document.document_id}`
  const documentError = controller.saveErrors[documentSaveTarget] ?? controller.saveErrors[reprocessTarget] ?? ''
  const isDocumentProcessing = documentNeedsProcessing(document)

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
            onClick={() => void controller.handleReprocessDocument(document.document_id)}
          >
            {controller.savingTarget === reprocessTarget ? 'Queueing…' : 'Reprocess'}
          </button>
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
        <span className="entity-chip entity-chip-soft">{document.review_status.replaceAll('_', ' ')}</span>
        <span className="entity-chip entity-chip-soft">
          {reviewedPageCount(document)}/{document.page_count} pages reviewed
        </span>
        <span className="entity-chip entity-chip-soft">
          {reviewReady(document) ? 'Ready To Verify' : 'Review Incomplete'}
        </span>
      </div>
      <div className="document-ingestion-summary">
        <p>{documentStatusCopy(document)}</p>
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
            </div>
            {documentError ? <p className="field-error">{documentError}</p> : null}

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
