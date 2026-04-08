import type { DocumentIngestionPageRecord, DocumentKindSchemaRecord, DocumentIngestionRecord } from '../../shared/models'
import type { DocumentIngestionController } from './useDocumentIngestionController'

type DocumentIngestionHeaderFieldsEditorProps = {
  controller: DocumentIngestionController
  document: DocumentIngestionRecord
  page: DocumentIngestionPageRecord
  schema: DocumentKindSchemaRecord | null
}

export function DocumentIngestionHeaderFieldsEditor({
  controller,
  document,
  page,
  schema,
}: DocumentIngestionHeaderFieldsEditorProps) {
  const schemaFieldKeys = new Set(schema?.header_fields.map((field) => field.field_key) ?? [])
  const customFields = page.header_fields.filter((field) => !schemaFieldKeys.has(field.field_key))

  return (
    <div className="document-section">
      <div className="document-section-head">
        <strong>Header Fields</strong>
        <span className="workflow-editor-note">
          Required fields: {schema?.header_fields.filter((field) => field.required).map((field) => field.label).join(', ') || 'None'}
        </span>
      </div>
      {schema && schema.header_fields.length > 0 ? (
        <div className="document-editor-grid">
          {schema.header_fields.map((field) => {
            const existing = page.header_fields.find((candidate) => candidate.field_key === field.field_key)
            return (
              <label key={`${page.page_id}-${field.field_key}`}>
                <span>
                  {field.label}
                  {field.required ? ' *' : ''}
                </span>
                <input
                  className="control"
                  type="text"
                  value={existing?.value ?? ''}
                  placeholder={field.description ?? field.label}
                  onChange={(event) =>
                    controller.setSchemaFieldValue(
                      document.document_id,
                      page.page_id,
                      field.field_key,
                      field.label,
                      event.target.value,
                    )
                  }
                />
              </label>
            )
          })}
        </div>
      ) : (
        <p className="workflow-editor-note">No schema-defined header fields for this document kind yet.</p>
      )}

      <div className="document-extra-field-list">
        {customFields.map((field) => (
          <div key={`${page.page_id}-${field.field_key}`} className="document-extra-field">
            <input
              className="control"
              type="text"
              value={field.label}
              placeholder="Field label"
              onChange={(event) =>
                controller.updateCustomField(document.document_id, page.page_id, field.field_key, {
                  label: event.target.value,
                })
              }
            />
            <input
              className="control"
              type="text"
              value={field.value}
              placeholder="Field value"
              onChange={(event) =>
                controller.updateCustomField(document.document_id, page.page_id, field.field_key, {
                  value: event.target.value,
                })
              }
            />
            <button
              type="button"
              className="button button-ghost"
              onClick={() => controller.removeField(document.document_id, page.page_id, field.field_key)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => controller.addCustomField(document.document_id, page.page_id)}
        >
          Add Custom Field
        </button>
      </div>
    </div>
  )
}
