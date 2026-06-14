import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

type DataSheetInputType = 'text' | 'textarea'
type CellFocusableElement = HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
type DataSheetComparable = string | number | boolean | Date | null | undefined
const DATA_SHEET_MIN_COLUMN_WIDTH_PX = 64
const DATA_SHEET_KEYBOARD_RESIZE_STEP_PX = 16
export type DataSheetSortDirection = 'asc' | 'desc'
export type DataSheetSortState = {
  columnId: string
  direction: DataSheetSortDirection
}

export type DataSheetRowAction<Row> = {
  id: string
  label: string
  tone?: 'default' | 'danger'
  disabled?: boolean | ((row: Row) => boolean)
  onSelect: (row: Row) => void
}

type DataSheetEditableBaseConfig<Row> = {
  disabled?: (row: Row) => boolean
  isDirty?: (row: Row) => boolean
  error?: (row: Row) => string | null
}

type DataSheetEditableTextConfig<Row> = DataSheetEditableBaseConfig<Row> & {
  inputType?: DataSheetInputType
  value: (row: Row) => string
  onChange: (row: Row, value: string) => void
  onBlur?: (row: Row, value: string) => void
  placeholder?: string
}

type DataSheetEditableCheckboxConfig<Row> = DataSheetEditableBaseConfig<Row> & {
  inputType: 'checkbox'
  checked: (row: Row) => boolean
  onChange: (row: Row, value: boolean) => void
  trueLabel?: string
  falseLabel?: string
}

type DataSheetEditableConfig<Row> = DataSheetEditableTextConfig<Row> | DataSheetEditableCheckboxConfig<Row>

type DataSheetColumnBase<Row> = {
  id: string
  label: string
  align?: 'start' | 'center' | 'end'
  width?: string
  enableSort?: boolean
  enableFilter?: boolean
  filterPlaceholder?: string
  sortValue?: (row: Row, rowIndex: number) => DataSheetComparable
  filterValue?: (row: Row, rowIndex: number) => string
}

export type DataSheetColumn<Row> =
  | (DataSheetColumnBase<Row> & {
      renderCell: (row: Row, rowIndex: number) => ReactNode
      editable?: never
    })
  | (DataSheetColumnBase<Row> & {
      renderCell?: never
      editable: DataSheetEditableConfig<Row>
    })

type ActiveCell = {
  rowIndex: number
  columnIndex: number
}

type ColumnResizeState = {
  columnId: string
  startX: number
  startWidth: number
}

type DataSheetProps<Row> = {
  label: string
  description: string
  toolbarActions?: ReactNode
  appendRows?: ReactNode
  columns: DataSheetColumn<Row>[]
  rows: Row[]
  pageSize?: number
  getRowId: (row: Row) => string
  getRowLabel: (row: Row) => string
  selectedRowId: string | null
  onSelectRow: (row: Row) => void
  emptyMessage: string
  defaultSort?: DataSheetSortState
  enableColumnControls?: boolean
  enableColumnResize?: boolean
  editableHelpText?: string
  rowActions?: (row: Row) => DataSheetRowAction<Row>[]
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

function isCheckboxEditableConfig<Row>(
  editable: DataSheetEditableConfig<Row>,
): editable is DataSheetEditableCheckboxConfig<Row> {
  return editable.inputType === 'checkbox'
}

function normalizeDataSheetText(value: DataSheetComparable): string {
  if (value == null) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

function resolveRenderedCellText(value: ReactNode): string {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return String(value)
    default:
      return ''
  }
}

function resolveColumnFilterText<Row>(column: DataSheetColumn<Row>, row: Row, rowIndex: number): string {
  if (column.filterValue) {
    return column.filterValue(row, rowIndex)
  }

  if (column.sortValue) {
    return normalizeDataSheetText(column.sortValue(row, rowIndex))
  }

  if (isEditableColumn(column)) {
    return isCheckboxEditableConfig(column.editable)
      ? column.editable.checked(row)
        ? (column.editable.trueLabel ?? 'TRUE')
        : (column.editable.falseLabel ?? 'FALSE')
      : column.editable.value(row)
  }

  return resolveRenderedCellText(column.renderCell(row, rowIndex))
}

function resolveColumnSortValue<Row>(column: DataSheetColumn<Row>, row: Row, rowIndex: number): DataSheetComparable {
  if (column.sortValue) {
    return column.sortValue(row, rowIndex)
  }

  return resolveColumnFilterText(column, row, rowIndex)
}

function compareDataSheetValues(left: DataSheetComparable, right: DataSheetComparable): number {
  if (left == null && right == null) {
    return 0
  }

  if (left == null) {
    return 1
  }

  if (right == null) {
    return -1
  }

  if (left instanceof Date || right instanceof Date) {
    return new Date(left as string | number | Date).getTime() - new Date(right as string | number | Date).getTime()
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right)
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function columnIsSortable<Row>(column: DataSheetColumn<Row>, enableColumnControls: boolean): boolean {
  return enableColumnControls && column.enableSort !== false
}

function columnIsFilterable<Row>(column: DataSheetColumn<Row>, enableColumnControls: boolean): boolean {
  return enableColumnControls && column.enableFilter !== false
}

function parseColumnWidthPixels(width: string | undefined): number | null {
  if (!width) {
    return null
  }

  const parsedValue = Number.parseFloat(width)
  if (!Number.isFinite(parsedValue)) {
    return null
  }

  if (width.endsWith('px')) {
    return parsedValue
  }

  if (width.endsWith('rem')) {
    const rootFontSize = Number.parseFloat(
      typeof window === 'undefined'
        ? '16'
        : window.getComputedStyle(document.documentElement).fontSize || '16',
    )
    return parsedValue * (Number.isFinite(rootFontSize) ? rootFontSize : 16)
  }

  return null
}

export function DataSheet<Row>({
  label,
  description,
  toolbarActions,
  appendRows,
  columns,
  rows,
  pageSize,
  getRowId,
  getRowLabel,
  selectedRowId,
  onSelectRow,
  emptyMessage,
  defaultSort,
  enableColumnControls = true,
  enableColumnResize = false,
  editableHelpText,
  rowActions,
}: DataSheetProps<Row>) {
  const descriptionId = useId()
  const actionMenuId = useId()
  const [sortState, setSortState] = useState<DataSheetSortState | null>(() => defaultSort ?? null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [columnResize, setColumnResize] = useState<ColumnResizeState | null>(null)
  const [rowActionMenu, setRowActionMenu] = useState<{ rowId: string; x: number; y: number } | null>(null)
  const filteredRows = useMemo(() => {
    const normalizedFilters = Object.entries(columnFilters)
      .map(([columnId, value]) => [columnId, value.trim().toLocaleLowerCase()] as const)
      .filter(([, value]) => value.length > 0)
    const indexedRows = rows.map((row, rowIndex) => ({ row, rowIndex }))
    const filteredRows =
      normalizedFilters.length > 0
        ? indexedRows.filter(({ row, rowIndex }) =>
            normalizedFilters.every(([columnId, filterValue]) => {
              const column = columns.find((candidate) => candidate.id === columnId)
              if (!column || !columnIsFilterable(column, enableColumnControls)) {
                return true
              }

              return resolveColumnFilterText(column, row, rowIndex).toLocaleLowerCase().includes(filterValue)
            }),
          )
        : indexedRows

    const sortedRows = [...filteredRows]
    if (sortState) {
      const sortedColumn = columns.find((column) => column.id === sortState.columnId)
      if (sortedColumn && columnIsSortable(sortedColumn, enableColumnControls)) {
        sortedRows.sort((left, right) => {
          const comparison = compareDataSheetValues(
            resolveColumnSortValue(sortedColumn, left.row, left.rowIndex),
            resolveColumnSortValue(sortedColumn, right.row, right.rowIndex),
          )

          if (comparison !== 0) {
            return sortState.direction === 'asc' ? comparison : -comparison
          }

          return left.rowIndex - right.rowIndex
        })
      }
    }

    return sortedRows.map(({ row }) => row)
  }, [columnFilters, columns, enableColumnControls, rows, sortState])
  const normalizedPageSize =
    typeof pageSize === 'number' && Number.isFinite(pageSize) && pageSize > 0
      ? Math.max(1, Math.floor(pageSize))
      : null
  const pageResetKey = useMemo(() => {
    const filterKey = Object.entries(columnFilters)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([columnId, value]) => `${columnId}:${value}`)
      .join('|')
    const sortKey = sortState ? `${sortState.columnId}:${sortState.direction}` : 'none'
    return `${rows.length}:${normalizedPageSize ?? 'all'}:${sortKey}:${filterKey}`
  }, [columnFilters, normalizedPageSize, rows.length, sortState])
  const [paginationState, setPaginationState] = useState<{ pageIndex: number; resetKey: string }>(() => ({
    pageIndex: 0,
    resetKey: '',
  }))
  const pageIndex = paginationState.resetKey === pageResetKey ? paginationState.pageIndex : 0
  const pageCount = normalizedPageSize ? Math.max(1, Math.ceil(filteredRows.length / normalizedPageSize)) : 1
  const currentPageIndex = normalizedPageSize ? clampIndex(pageIndex, pageCount - 1) : 0
  const pageStartIndex = normalizedPageSize ? currentPageIndex * normalizedPageSize : 0
  const visibleRows = useMemo(
    () =>
      normalizedPageSize
        ? filteredRows.slice(pageStartIndex, pageStartIndex + normalizedPageSize)
        : filteredRows,
    [filteredRows, normalizedPageSize, pageStartIndex],
  )
  const rowIds = useMemo(() => visibleRows.map((row) => getRowId(row)), [getRowId, visibleRows])
  const cellRefs = useRef(new Map<string, CellFocusableElement>())
  const rowActionMenuRef = useRef<HTMLDivElement | null>(null)
  const columnResizeCleanupRef = useRef<(() => void) | null>(null)
  const pendingFocusRef = useRef(false)
  const [requestedActiveCell, setRequestedActiveCell] = useState<ActiveCell>(() =>
    resolveActiveCell(
      {
        rowIndex: visibleRows.length > 0 ? Math.max(rowIds.indexOf(selectedRowId ?? ''), 0) : -1,
        columnIndex: columns.length > 0 ? 0 : -1,
      },
      {
        rowCount: visibleRows.length,
        columnCount: columns.length,
        rowIds,
        selectedRowId,
      },
    ),
  )
  const activeCell = useMemo(
    () =>
      resolveActiveCell(requestedActiveCell, {
        rowCount: visibleRows.length,
        columnCount: columns.length,
        rowIds,
        selectedRowId,
      }),
    [columns.length, requestedActiveCell, rowIds, selectedRowId, visibleRows.length],
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

  useEffect(() => {
    if (!rowActionMenu) {
      return
    }

    function handleDocumentPointerDown(event: globalThis.MouseEvent) {
      if (rowActionMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setRowActionMenu(null)
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setRowActionMenu(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [rowActionMenu])

  useEffect(
    () => () => {
      columnResizeCleanupRef.current?.()
    },
    [],
  )

  const activeRow = activeCell.rowIndex >= 0 ? visibleRows[activeCell.rowIndex] ?? null : null
  const activeColumn = activeCell.columnIndex >= 0 ? columns[activeCell.columnIndex] ?? null : null
  const activeActionMenuRow = rowActionMenu
    ? visibleRows.find((row) => getRowId(row) === rowActionMenu.rowId) ?? null
    : null
  const activeRowActions = activeActionMenuRow && rowActions ? rowActions(activeActionMenuRow) : []
  const activeCellAddress =
    activeRow && activeColumn ? `${columnAddress(activeCell.columnIndex)}${activeCell.rowIndex + 1}` : '—'
  const hasEditableColumns = columns.some((column) => isEditableColumn(column))
  const activeFilterCount = Object.values(columnFilters).filter((value) => value.trim().length > 0).length
  const hasColumnFilters = activeFilterCount > 0
  const sortMatchesDefault =
    (!sortState && !defaultSort) ||
    (sortState?.columnId === defaultSort?.columnId && sortState?.direction === defaultSort?.direction)
  const hasCustomSort = !sortMatchesDefault
  const hasColumnControls = enableColumnControls && columns.some((column) => columnIsSortable(column, true) || columnIsFilterable(column, true))
  const hasFilterRow = enableColumnControls && columns.some((column) => columnIsFilterable(column, true))
  const shouldRenderTable = rows.length > 0 || Boolean(appendRows)
  const pageStartOrdinal = visibleRows.length > 0 ? pageStartIndex + 1 : 0
  const pageEndOrdinal = pageStartIndex + visibleRows.length
  const shouldShowPagination = normalizedPageSize !== null && filteredRows.length > normalizedPageSize
  const rowCountLabel = normalizedPageSize
    ? filteredRows.length === rows.length
      ? `Showing ${pageStartOrdinal}-${pageEndOrdinal} of ${rows.length} rows`
      : `Showing ${pageStartOrdinal}-${pageEndOrdinal} of ${filteredRows.length} filtered rows`
    : filteredRows.length === rows.length
      ? `${rows.length} row${rows.length === 1 ? '' : 's'}`
      : `${filteredRows.length} of ${rows.length} rows`

  function moveFocus(nextRowIndex: number, nextColumnIndex: number) {
    if (visibleRows.length === 0 || columns.length === 0) {
      return
    }

    const clampedRowIndex = clampIndex(nextRowIndex, visibleRows.length - 1)
    const clampedColumnIndex = clampIndex(nextColumnIndex, columns.length - 1)
    if (clampedRowIndex < 0 || clampedColumnIndex < 0) {
      return
    }

    pendingFocusRef.current = true
    setRequestedActiveCell({ rowIndex: clampedRowIndex, columnIndex: clampedColumnIndex })

    const nextRow = visibleRows[clampedRowIndex]
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

    const row = visibleRows[rowIndex]
    if (row && getRowId(row) !== selectedRowId) {
      onSelectRow(row)
    }
  }

  function openRowActionMenu(row: Row, event: MouseEvent<HTMLElement>) {
    if (!rowActions || rowActions(row).length === 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const rowId = getRowId(row)
    if (rowId !== selectedRowId) {
      onSelectRow(row)
    }
    setRowActionMenu({
      rowId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function handleRowActionSelect(row: Row, action: DataSheetRowAction<Row>) {
    const disabled = typeof action.disabled === 'function' ? action.disabled(row) : action.disabled ?? false
    if (disabled) {
      return
    }

    action.onSelect(row)
    setRowActionMenu(null)
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
        moveFocus(visibleRows.length - 1, columnIndex)
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

  function cycleSort(column: DataSheetColumn<Row>) {
    if (!columnIsSortable(column, enableColumnControls)) {
      return
    }

    setSortState((current) => {
      if (!current || current.columnId !== column.id) {
        return { columnId: column.id, direction: 'asc' }
      }

      if (current.direction === 'asc') {
        return { columnId: column.id, direction: 'desc' }
      }

      return null
    })
  }

  function updateColumnFilter(columnId: string, value: string) {
    setColumnFilters((current) => {
      const next = { ...current }
      if (value.trim().length > 0) {
        next[columnId] = value
      } else {
        delete next[columnId]
      }

      return next
    })
  }

  function resetColumnControls() {
    setSortState(defaultSort ?? null)
    setColumnFilters({})
  }

  function resolveColumnWidth(column: DataSheetColumn<Row>): number | null {
    return columnWidths[column.id] ?? parseColumnWidthPixels(column.width)
  }

  function columnStyle(column: DataSheetColumn<Row>): CSSProperties | undefined {
    const resizedWidth = columnWidths[column.id]
    if (typeof resizedWidth === 'number') {
      return { width: `${resizedWidth}px` }
    }

    return column.width ? { width: column.width } : undefined
  }

  function columnCellStyle(column: DataSheetColumn<Row>): CSSProperties | undefined {
    const resizedWidth = columnWidths[column.id]
    if (typeof resizedWidth !== 'number') {
      return undefined
    }

    return {
      width: `${resizedWidth}px`,
      minWidth: `${resizedWidth}px`,
      maxWidth: `${resizedWidth}px`,
    }
  }

  function startColumnResize(column: DataSheetColumn<Row>, target: HTMLElement | null, clientX: number) {
    if (!enableColumnResize) {
      return
    }

    const headerCell = target?.closest('th')
    const startWidth =
      headerCell?.getBoundingClientRect().width ??
      resolveColumnWidth(column) ??
      DATA_SHEET_MIN_COLUMN_WIDTH_PX

    columnResizeCleanupRef.current?.()

    const resizeState = {
      columnId: column.id,
      startX: clientX,
      startWidth: Math.max(DATA_SHEET_MIN_COLUMN_WIDTH_PX, startWidth),
    }

    function handleDocumentMove(pointerEvent: globalThis.PointerEvent | globalThis.MouseEvent) {
      const width = Math.max(
        DATA_SHEET_MIN_COLUMN_WIDTH_PX,
        resizeState.startWidth + pointerEvent.clientX - resizeState.startX,
      )
      setColumnWidths((current) => ({
        ...current,
        [resizeState.columnId]: Math.round(width),
      }))
    }

    function cleanupColumnResize() {
      document.body.classList.remove('data-sheet-column-resize-active')
      document.removeEventListener('pointermove', handleDocumentMove)
      document.removeEventListener('mousemove', handleDocumentMove)
      document.removeEventListener('pointerup', handleDocumentPointerUp)
      document.removeEventListener('mouseup', handleDocumentPointerUp)
      document.removeEventListener('pointercancel', handleDocumentPointerUp)
      columnResizeCleanupRef.current = null
    }

    function handleDocumentPointerUp() {
      cleanupColumnResize()
      setColumnResize(null)
    }

    document.body.classList.add('data-sheet-column-resize-active')
    document.addEventListener('pointermove', handleDocumentMove)
    document.addEventListener('mousemove', handleDocumentMove)
    document.addEventListener('pointerup', handleDocumentPointerUp)
    document.addEventListener('mouseup', handleDocumentPointerUp)
    document.addEventListener('pointercancel', handleDocumentPointerUp)
    columnResizeCleanupRef.current = cleanupColumnResize
    setColumnResize(resizeState)
  }

  function handleColumnResizePointerDown(column: DataSheetColumn<Row>, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    startColumnResize(column, event.currentTarget, event.clientX)
  }

  function handleColumnResizeMouseDown(column: DataSheetColumn<Row>, event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    startColumnResize(column, event.currentTarget, event.clientX)
  }

  function nudgeColumnWidth(column: DataSheetColumn<Row>, delta: number) {
    if (!enableColumnResize) {
      return
    }

    setColumnWidths((current) => {
      const currentWidth =
        current[column.id] ??
        resolveColumnWidth(column) ??
        DATA_SHEET_MIN_COLUMN_WIDTH_PX
      return {
        ...current,
        [column.id]: Math.max(DATA_SHEET_MIN_COLUMN_WIDTH_PX, currentWidth + delta),
      }
    })
  }

  function handleColumnResizeKeyDown(column: DataSheetColumn<Row>, event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      nudgeColumnWidth(column, -DATA_SHEET_KEYBOARD_RESIZE_STEP_PX)
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      nudgeColumnWidth(column, DATA_SHEET_KEYBOARD_RESIZE_STEP_PX)
    }
  }

  function sortLabelForColumn(column: DataSheetColumn<Row>): string {
    if (sortState?.columnId !== column.id) {
      return 'Sort'
    }

    return sortState.direction === 'asc' ? 'Asc' : 'Desc'
  }

  function goToPage(nextPageIndex: number) {
    setPaginationState({
      pageIndex: clampIndex(nextPageIndex, pageCount - 1),
      resetKey: pageResetKey,
    })
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
          {toolbarActions ? <div className="data-sheet-actions">{toolbarActions}</div> : null}
          <span className="entity-chip entity-chip-soft">
            {rowCountLabel} • {columns.length} column{columns.length === 1 ? '' : 's'}
          </span>
          {shouldShowPagination ? (
            <div className="data-sheet-pagination" role="group" aria-label={`${label} pagination`}>
              <button
                type="button"
                className="button button-ghost data-sheet-pagination-button"
                onClick={() => goToPage(currentPageIndex - 1)}
                disabled={currentPageIndex === 0}
              >
                Previous
              </button>
              <span className="data-sheet-pagination-label">
                Page {currentPageIndex + 1} of {pageCount}
              </span>
              <button
                type="button"
                className="button button-ghost data-sheet-pagination-button"
                onClick={() => goToPage(currentPageIndex + 1)}
                disabled={currentPageIndex >= pageCount - 1}
              >
                Next
              </button>
            </div>
          ) : null}
          {hasColumnFilters ? (
            <span className="entity-chip entity-chip-soft">
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <span className="entity-chip entity-chip-soft">
            Active cell {activeCellAddress}
            {activeColumn ? ` • ${activeColumn.label}` : ''}
          </span>
          {hasColumnControls && (hasColumnFilters || hasCustomSort) ? (
            <button type="button" className="button button-ghost data-sheet-reset-button" onClick={resetColumnControls}>
              Reset Table
            </button>
          ) : null}
        </div>
      </div>

      {shouldRenderTable ? (
        <>
          <div className="table-shell data-sheet-table-shell">
            <table
              className={`data-table data-sheet-table ${enableColumnResize ? 'data-sheet-table-resizable' : ''} ${
                columnResize ? 'is-resizing' : ''
              }`}
              role="grid"
              aria-describedby={descriptionId}
            >
              <colgroup>
                {columns.map((column) => (
                  <col key={column.id} style={columnStyle(column)} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className={`data-sheet-column-head data-sheet-align-${column.align ?? 'start'}`}
                      style={columnCellStyle(column)}
                      scope="col"
                      aria-sort={
                        sortState?.columnId === column.id
                          ? sortState.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {columnIsSortable(column, enableColumnControls) ? (
                        <button
                          type="button"
                          className={`data-sheet-sort-button ${sortState?.columnId === column.id ? 'is-active' : ''}`}
                          onClick={() => cycleSort(column)}
                          title={`Sort by ${column.label}`}
                        >
                          <span>{column.label}</span>
                          <span className="data-sheet-sort-state">{sortLabelForColumn(column)}</span>
                        </button>
                      ) : (
                        <span className="data-sheet-static-column-label">{column.label}</span>
                      )}
                      {enableColumnResize ? (
                        <span
                          className={`data-sheet-column-resize-handle ${
                            columnResize?.columnId === column.id ? 'is-active' : ''
                          }`}
                          role="separator"
                          aria-label={`Resize ${column.label} column`}
                          aria-orientation="vertical"
                          tabIndex={0}
                          title={`Resize ${column.label} column`}
                          onPointerDown={(event) => handleColumnResizePointerDown(column, event)}
                          onMouseDown={(event) => handleColumnResizeMouseDown(column, event)}
                          onKeyDown={(event) => handleColumnResizeKeyDown(column, event)}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
                {hasFilterRow ? (
                  <tr className="data-sheet-filter-row">
                    {columns.map((column) => (
                      <th
                        key={`${column.id}-filter`}
                        className={`data-sheet-align-${column.align ?? 'start'}`}
                        style={columnCellStyle(column)}
                        scope="col"
                      >
                        {columnIsFilterable(column, enableColumnControls) ? (
                          <input
                            className="data-sheet-column-filter"
                            type="search"
                            value={columnFilters[column.id] ?? ''}
                            placeholder={column.filterPlaceholder ?? 'Filter'}
                            aria-label={`Filter ${column.label}`}
                            onChange={(event) => updateColumnFilter(column.id, event.target.value)}
                          />
                        ) : (
                          <span className="data-sheet-filter-placeholder" aria-hidden="true" />
                        )}
                      </th>
                    ))}
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="data-sheet-no-results">
                      {hasColumnFilters ? 'No rows match the current column filters.' : emptyMessage}
                    </td>
                  </tr>
                ) : null}
                {visibleRows.map((row, rowIndex) => {
                  const rowId = getRowId(row)
                  const rowSelected = rowId === selectedRowId
                  const absoluteRowIndex = pageStartIndex + rowIndex
                  return (
                    <tr
                      key={rowId}
                      className={rowSelected ? 'is-selected' : ''}
                      onContextMenu={(event) => openRowActionMenu(row, event)}
                      onDoubleClick={(event) => openRowActionMenu(row, event)}
                    >
                      {columns.map((column, columnIndex) => {
                        const cellId = `${rowId}:${column.id}`
                        const active = activeCell.rowIndex === rowIndex && activeCell.columnIndex === columnIndex

                        if (isEditableColumn(column)) {
                          const { editable } = column
                          const errorMessage = editable.error?.(row) ?? ''
                          const dirty = editable.isDirty?.(row) ?? false
                          const disabled = editable.disabled?.(row) ?? false
                          const editorClassName = `data-sheet-editor ${active ? 'is-active' : ''} ${dirty ? 'is-dirty' : ''} ${errorMessage ? 'is-error' : ''}`
                          const metaRow = (
                            <div className="data-sheet-cell-meta-row">
                              {errorMessage ? (
                                <small className="data-sheet-cell-error">{errorMessage}</small>
                              ) : dirty ? (
                                <small className="data-sheet-cell-meta">Staged</small>
                              ) : (
                                <span className="data-sheet-cell-meta-placeholder" aria-hidden="true" />
                              )}
                            </div>
                          )

                          if (isCheckboxEditableConfig(editable)) {
                            const checked = editable.checked(row)

                            return (
                              <td
                                key={column.id}
                                className={`data-sheet-align-${column.align ?? 'start'} ${dirty ? 'data-sheet-cell-is-dirty' : ''} ${errorMessage ? 'data-sheet-cell-is-error' : ''}`}
                                style={columnCellStyle(column)}
                              >
                                <div className={editorClassName}>
                                  <label className="data-sheet-checkbox-editor">
                                    <input
                                      ref={(element) => registerCellRef(cellId, element)}
                                      className="data-sheet-cell-checkbox"
                                      type="checkbox"
                                      checked={checked}
                                      disabled={disabled}
                                      tabIndex={active ? 0 : -1}
                                      aria-label={`${column.label}: ${getRowLabel(row)}`}
                                      onFocus={() => handleCellFocus(rowIndex, columnIndex)}
                                      onChange={(event) => editable.onChange(row, event.target.checked)}
                                    />
                                    <span className={`data-sheet-checkbox-value ${checked ? 'is-checked' : ''}`}>
                                      {checked ? (editable.trueLabel ?? 'TRUE') : (editable.falseLabel ?? 'FALSE')}
                                    </span>
                                  </label>
                                  {metaRow}
                                </div>
                              </td>
                            )
                          }

                          const commonProps = {
                            ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => registerCellRef(cellId, element),
                            className: 'data-sheet-cell-input',
                            value: editable.value(row),
                            placeholder: editable.placeholder,
                            disabled,
                            tabIndex: active ? 0 : -1,
                            'aria-label': `${column.label}: ${getRowLabel(row)}`,
                            onFocus: () => handleCellFocus(rowIndex, columnIndex),
                            onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                              editable.onChange(row, event.target.value),
                            onBlur: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                              editable.onBlur?.(row, event.target.value),
                          }

                          return (
                            <td
                              key={column.id}
                              className={`data-sheet-align-${column.align ?? 'start'} ${dirty ? 'data-sheet-cell-is-dirty' : ''} ${errorMessage ? 'data-sheet-cell-is-error' : ''}`}
                              style={columnCellStyle(column)}
                            >
                              <div className={editorClassName}>
                                {editable.inputType === 'textarea' ? (
                                  <textarea {...commonProps} rows={2} />
                                ) : (
                                  <input {...commonProps} type="text" />
                                )}
                                {metaRow}
                              </div>
                            </td>
                          )
                        }

                        return (
                          <td
                            key={column.id}
                            className={`data-sheet-align-${column.align ?? 'start'}`}
                            style={columnCellStyle(column)}
                          >
                            <button
                              ref={(element) => registerCellRef(cellId, element)}
                              type="button"
                              className={`data-sheet-cell-button ${active ? 'is-active' : ''}`}
                              tabIndex={active ? 0 : -1}
                              aria-label={`${column.label}: ${getRowLabel(row)}`}
                              aria-selected={rowSelected}
                              onFocus={() => handleCellFocus(rowIndex, columnIndex)}
                              onClick={() => onSelectRow(row)}
                              onKeyDown={(event) => handleReadOnlyCellKeyDown(event, rowIndex, columnIndex, row)}
                            >
                              {column.renderCell(row, absoluteRowIndex)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {appendRows}
              </tbody>
            </table>
          </div>

          {activeActionMenuRow && rowActionMenu && activeRowActions.length > 0 ? (
            <div
              ref={rowActionMenuRef}
              id={actionMenuId}
              className="data-sheet-row-action-menu"
              role="menu"
              aria-label={`Options for ${getRowLabel(activeActionMenuRow)}`}
              style={{ left: rowActionMenu.x, top: rowActionMenu.y }}
            >
              <span className="data-sheet-row-action-menu-title">Row Options</span>
              {activeRowActions.map((action) => {
                const disabled =
                  typeof action.disabled === 'function' ? action.disabled(activeActionMenuRow) : action.disabled ?? false

                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className={`data-sheet-row-action-menu-item ${
                      action.tone === 'danger' ? 'data-sheet-row-action-menu-item-danger' : ''
                    }`}
                    disabled={disabled}
                    onClick={() => handleRowActionSelect(activeActionMenuRow, action)}
                  >
                    {action.label}
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="data-sheet-footer" aria-live="polite">
            <span>{activeRow ? getRowLabel(activeRow) : 'No row selected'}</span>
            <span>
              {hasEditableColumns
                ? (editableHelpText ?? 'Tab between editable cells to stage changes. Use the surrounding toolbar to apply or reset staged rows.')
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
