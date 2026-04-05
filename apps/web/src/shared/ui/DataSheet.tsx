import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type DataSheetInputType = 'text' | 'textarea'
type CellFocusableElement = HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement

type DataSheetEditableConfig<Row> = {
  inputType?: DataSheetInputType
  value: (row: Row) => string
  onChange: (row: Row, value: string) => void
  placeholder?: string
  disabled?: (row: Row) => boolean
  isDirty?: (row: Row) => boolean
  error?: (row: Row) => string | null
}

type DataSheetColumnBase = {
  id: string
  label: string
  align?: 'start' | 'center' | 'end'
  width?: string
}

export type DataSheetColumn<Row> =
  | (DataSheetColumnBase & {
      renderCell: (row: Row) => ReactNode
      editable?: never
    })
  | (DataSheetColumnBase & {
      renderCell?: never
      editable: DataSheetEditableConfig<Row>
    })

type ActiveCell = {
  rowIndex: number
  columnIndex: number
}

type DataSheetProps<Row> = {
  label: string
  description: string
  columns: DataSheetColumn<Row>[]
  rows: Row[]
  getRowId: (row: Row) => string
  getRowLabel: (row: Row) => string
  selectedRowId: string | null
  onSelectRow: (row: Row) => void
  emptyMessage: string
}

function clampIndex(value: number, maxIndex: number): number {
  if (maxIndex < 0) {
    return -1
  }

  return Math.min(Math.max(value, 0), maxIndex)
}

function columnAddress(index: number): string {
  if (index < 0) {
    return '—'
  }

  let value = index + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }

  return label
}

function resolveActiveCell(
  current: ActiveCell,
  options: {
    rowCount: number
    columnCount: number
    rowIds: string[]
    selectedRowId: string | null
  },
): ActiveCell {
  const { rowCount, columnCount, rowIds, selectedRowId } = options
  if (rowCount === 0 || columnCount === 0) {
    return { rowIndex: -1, columnIndex: -1 }
  }

  const selectedIndex = selectedRowId ? rowIds.indexOf(selectedRowId) : -1
  return {
    rowIndex: selectedIndex >= 0 ? selectedIndex : clampIndex(current.rowIndex, rowCount - 1),
    columnIndex: clampIndex(current.columnIndex, columnCount - 1),
  }
}

function isEditableColumn<Row>(column: DataSheetColumn<Row>): column is Extract<DataSheetColumn<Row>, { editable: DataSheetEditableConfig<Row> }> {
  return 'editable' in column
}

export function DataSheet<Row>({
  label,
  description,
  columns,
  rows,
  getRowId,
  getRowLabel,
  selectedRowId,
  onSelectRow,
  emptyMessage,
}: DataSheetProps<Row>) {
  const descriptionId = useId()
  const rowIds = useMemo(() => rows.map((row) => getRowId(row)), [getRowId, rows])
  const cellRefs = useRef(new Map<string, CellFocusableElement>())
  const pendingFocusRef = useRef(false)
  const [requestedActiveCell, setRequestedActiveCell] = useState<ActiveCell>(() =>
    resolveActiveCell(
      {
        rowIndex: rows.length > 0 ? Math.max(rowIds.indexOf(selectedRowId ?? ''), 0) : -1,
        columnIndex: columns.length > 0 ? 0 : -1,
      },
      {
        rowCount: rows.length,
        columnCount: columns.length,
        rowIds,
        selectedRowId,
      },
    ),
  )
  const activeCell = useMemo(
    () =>
      resolveActiveCell(requestedActiveCell, {
        rowCount: rows.length,
        columnCount: columns.length,
        rowIds,
        selectedRowId,
      }),
    [columns.length, requestedActiveCell, rowIds, rows.length, selectedRowId],
  )

  useEffect(() => {
    if (!pendingFocusRef.current) {
      return
    }

    pendingFocusRef.current = false
    if (activeCell.rowIndex < 0 || activeCell.columnIndex < 0) {
      return
    }

    const rowId = rowIds[activeCell.rowIndex]
    const column = columns[activeCell.columnIndex]
    if (!rowId || !column) {
      return
    }

    const cellId = `${rowId}:${column.id}`
    const cell = cellRefs.current.get(cellId)
    if (!cell) {
      return
    }

    requestAnimationFrame(() => cell.focus())
  }, [activeCell, columns, rowIds])

  const activeRow = activeCell.rowIndex >= 0 ? rows[activeCell.rowIndex] ?? null : null
  const activeColumn = activeCell.columnIndex >= 0 ? columns[activeCell.columnIndex] ?? null : null
  const activeCellAddress =
    activeRow && activeColumn ? `${columnAddress(activeCell.columnIndex)}${activeCell.rowIndex + 1}` : '—'
  const hasEditableColumns = columns.some((column) => isEditableColumn(column))

  function moveFocus(nextRowIndex: number, nextColumnIndex: number) {
    if (rows.length === 0 || columns.length === 0) {
      return
    }

    const clampedRowIndex = clampIndex(nextRowIndex, rows.length - 1)
    const clampedColumnIndex = clampIndex(nextColumnIndex, columns.length - 1)
    if (clampedRowIndex < 0 || clampedColumnIndex < 0) {
      return
    }

    pendingFocusRef.current = true
    setRequestedActiveCell({ rowIndex: clampedRowIndex, columnIndex: clampedColumnIndex })

    const nextRow = rows[clampedRowIndex]
    if (nextRow && getRowId(nextRow) !== selectedRowId) {
      onSelectRow(nextRow)
    }
  }

  function handleCellFocus(rowIndex: number, columnIndex: number) {
    setRequestedActiveCell((current) => {
      if (current.rowIndex === rowIndex && current.columnIndex === columnIndex) {
        return current
      }

      return { rowIndex, columnIndex }
    })

    const row = rows[rowIndex]
    if (row && getRowId(row) !== selectedRowId) {
      onSelectRow(row)
    }
  }

  function handleReadOnlyCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, rowIndex: number, columnIndex: number, row: Row) {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(rowIndex - 1, columnIndex)
        return
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(rowIndex + 1, columnIndex)
        return
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(rowIndex, columnIndex - 1)
        return
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(rowIndex, columnIndex + 1)
        return
      case 'Home':
        event.preventDefault()
        moveFocus(rowIndex, 0)
        return
      case 'End':
        event.preventDefault()
        moveFocus(rowIndex, columns.length - 1)
        return
      case 'PageUp':
        event.preventDefault()
        moveFocus(0, columnIndex)
        return
      case 'PageDown':
        event.preventDefault()
        moveFocus(rows.length - 1, columnIndex)
        return
      case ' ':
      case 'Enter':
        event.preventDefault()
        onSelectRow(row)
        return
      default:
        return
    }
  }

  function registerCellRef(cellId: string, element: CellFocusableElement | null) {
    if (element) {
      cellRefs.current.set(cellId, element)
      return
    }

    cellRefs.current.delete(cellId)
  }

  return (
    <div className="data-sheet-shell">
      <div className="data-sheet-toolbar">
        <div>
          <span className="eyebrow">Grid</span>
          <h4>{label}</h4>
          <p id={descriptionId}>{description}</p>
        </div>
        <div className="data-sheet-status">
          <span className="entity-chip entity-chip-soft">
            {rows.length} row{rows.length === 1 ? '' : 's'} • {columns.length} column{columns.length === 1 ? '' : 's'}
          </span>
          <span className="entity-chip entity-chip-soft">
            Active cell {activeCellAddress}
            {activeColumn ? ` • ${activeColumn.label}` : ''}
          </span>
        </div>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-shell data-sheet-table-shell">
            <table className="data-table data-sheet-table" role="grid" aria-describedby={descriptionId}>
              <colgroup>
                {columns.map((column) => (
                  <col key={column.id} style={column.width ? { width: column.width } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className={`data-sheet-column-head data-sheet-align-${column.align ?? 'start'}`}
                      scope="col"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const rowId = getRowId(row)
                  const rowSelected = rowId === selectedRowId
                  return (
                    <tr key={rowId} className={rowSelected ? 'is-selected' : ''}>
                      {columns.map((column, columnIndex) => {
                        const cellId = `${rowId}:${column.id}`
                        const active = activeCell.rowIndex === rowIndex && activeCell.columnIndex === columnIndex

                        if (isEditableColumn(column)) {
                          const { editable } = column
                          const errorMessage = editable.error?.(row) ?? ''
                          const dirty = editable.isDirty?.(row) ?? false
                          const commonProps = {
                            ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => registerCellRef(cellId, element),
                            className: 'data-sheet-cell-input',
                            value: editable.value(row),
                            placeholder: editable.placeholder,
                            disabled: editable.disabled?.(row) ?? false,
                            tabIndex: active ? 0 : -1,
                            'aria-label': `${column.label}: ${getRowLabel(row)}`,
                            onFocus: () => handleCellFocus(rowIndex, columnIndex),
                            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                              editable.onChange(row, event.target.value),
                          }

                          return (
                            <td
                              key={column.id}
                              className={`data-sheet-align-${column.align ?? 'start'} ${dirty ? 'data-sheet-cell-is-dirty' : ''} ${errorMessage ? 'data-sheet-cell-is-error' : ''}`}
                            >
                              <div className={`data-sheet-editor ${active ? 'is-active' : ''} ${dirty ? 'is-dirty' : ''} ${errorMessage ? 'is-error' : ''}`}>
                                {editable.inputType === 'textarea' ? (
                                  <textarea {...commonProps} rows={2} />
                                ) : (
                                  <input {...commonProps} type="text" />
                                )}
                                <div className="data-sheet-cell-meta-row">
                                  {errorMessage ? (
                                    <small className="data-sheet-cell-error">{errorMessage}</small>
                                  ) : dirty ? (
                                    <small className="data-sheet-cell-meta">Staged</small>
                                  ) : (
                                    <span className="data-sheet-cell-meta-placeholder" aria-hidden="true" />
                                  )}
                                </div>
                              </div>
                            </td>
                          )
                        }

                        return (
                          <td key={column.id} className={`data-sheet-align-${column.align ?? 'start'}`}>
                            <button
                              ref={(element) => registerCellRef(cellId, element)}
                              type="button"
                              className={`data-sheet-cell-button ${active ? 'is-active' : ''}`}
                              tabIndex={active ? 0 : -1}
                              aria-label={`${column.label}: ${getRowLabel(row)}`}
                              aria-selected={rowSelected}
                              onFocus={() => handleCellFocus(rowIndex, columnIndex)}
                              onKeyDown={(event) => handleReadOnlyCellKeyDown(event, rowIndex, columnIndex, row)}
                            >
                              {column.renderCell(row)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="data-sheet-footer" aria-live="polite">
            <span>{activeRow ? getRowLabel(activeRow) : 'No row selected'}</span>
            <span>
              {hasEditableColumns
                ? 'Tab between editable cells to stage changes. Use the surrounding toolbar to apply or reset staged rows.'
                : 'Arrow keys move cell focus. Enter keeps the editor synced to the active row.'}
            </span>
          </div>
        </>
      ) : (
        <div className="surface empty-state data-sheet-empty-state">
          <strong>No rows available</strong>
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  )
}
