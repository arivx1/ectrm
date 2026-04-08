import type {
  DocumentIngestionPageRecord,
  DocumentIngestionRecord,
  DocumentKindSchemaRecord,
  DocumentSchemaRegistryRecord,
} from '../../shared/models'
import { PAGE_REVIEW_STATUS_OPTIONS, pageTextSourceLabel, pageTextSourceTone } from './documentIngestionUtils'
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

      {page.processing_warnings.length > 0 ? (
        <p className="workflow-editor-note">{page.processing_warnings.join(' ')}</p>
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
