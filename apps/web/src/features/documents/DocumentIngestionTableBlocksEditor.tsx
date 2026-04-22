import type { DocumentIngestionPageRecord, DocumentKindSchemaRecord, DocumentIngestionRecord } from '../../shared/models'
import { humanizeKey } from './documentIngestionUtils'
import type { DocumentIngestionController } from './useDocumentIngestionController'

type DocumentIngestionTableBlocksEditorProps = {
  controller: DocumentIngestionController
  document: DocumentIngestionRecord
  page: DocumentIngestionPageRecord
  schema: DocumentKindSchemaRecord | null
}

export function DocumentIngestionTableBlocksEditor({
  controller,
  document,
  page,
  schema,
}: DocumentIngestionTableBlocksEditorProps) {
  return (
    <div className="document-section">
      <div className="document-section-head">
        <strong>Table Blocks</strong>
        <span className="workflow-editor-note">
          Expected templates: {schema?.table_templates.map((template) => template.label).join(', ') || 'Custom only'}
        </span>
      </div>
      {page.table_blocks.map((table, tableIndex) => (
        <div key={`${page.page_id}-table-${tableIndex}`} className="document-table-editor">
          <div className="document-table-editor-head">
            <strong>Table {table.table_index}</strong>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => controller.removeTableBlock(document.document_id, page.page_id, tableIndex)}
            >
              Remove Table
            </button>
          </div>
          <div className="document-editor-grid">
            <label>
              <span>Template</span>
              <select
                className="control"
                value={table.template_key ?? ''}
                onChange={(event) =>
                  controller.setTableTemplate(
                    document.document_id,
                    page.page_id,
                    tableIndex,
                    event.target.value,
                    schema,
                  )
                }
              >
                <option value="">Custom table</option>
                {(schema?.table_templates ?? []).map((template) => (
                  <option key={template.template_key} value={template.template_key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Title</span>
              <input
                className="control"
                type="text"
                value={table.title ?? ''}
                onChange={(event) =>
                  controller.updateTableTitle(document.document_id, page.page_id, tableIndex, event.target.value)
                }
              />
            </label>
          </div>

          <div className="document-column-list">
            {table.columns.map((column, columnIndex) => (
              <div key={`${page.page_id}-table-${tableIndex}-column-${columnIndex}`} className="document-column-item">
                <input
                  className="control"
                  type="text"
                  value={column}
                  onChange={(event) =>
                    controller.renameTableColumn(
                      document.document_id,
                      page.page_id,
                      tableIndex,
                      columnIndex,
                      event.target.value,
                    )
                  }
                />
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => controller.removeTableColumn(document.document_id, page.page_id, tableIndex, columnIndex)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary"
              onClick={() => controller.addTableColumn(document.document_id, page.page_id, tableIndex)}
            >
              Add Column
            </button>
          </div>

          <div className="document-table-row-list">
            {table.rows.map((row, rowIndex) => (
              <div key={`${page.page_id}-table-${tableIndex}-row-${rowIndex}`} className="document-row-card">
                <div className="document-row-grid">
                  {table.columns.map((column) => (
                    <label key={`${page.page_id}-table-${tableIndex}-row-${rowIndex}-${column}`}>
                      <span>{humanizeKey(column)}</span>
                      <input
                        className="control"
                        type="text"
                        value={row[column] ?? ''}
                        onChange={(event) =>
                          controller.updateTableCell(
                            document.document_id,
                            page.page_id,
                            tableIndex,
                            rowIndex,
                            column,
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => controller.removeTableRow(document.document_id, page.page_id, tableIndex, rowIndex)}
                >
                  Remove Row
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary"
              onClick={() => controller.addTableRow(document.document_id, page.page_id, tableIndex)}
            >
              Add Row
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="button button-secondary"
        onClick={() => controller.addTableBlock(document.document_id, page.page_id, schema)}
      >
        Add Table Block
      </button>
    </div>
  )
}
