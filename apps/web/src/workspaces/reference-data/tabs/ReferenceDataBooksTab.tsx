import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataBooksToolbar({ controller }: ReferenceDataTabProps) {
  const {
    bookSheetRows,
    bookSheetDirtyCount,
    bookSheetInvalidCount,
    selectedBookCode,
    savingReference,
    applyBookSheetChanges,
    resetBookSheetRow,
    resetAllBookSheetChanges,
  } = controller

  const selectedBookSheetRow = bookSheetRows.find((row) => row.code === selectedBookCode) ?? null

  return (
    <>
      <span className="entity-chip entity-chip-soft">
        {bookSheetDirtyCount} staged row{bookSheetDirtyCount === 1 ? '' : 's'}
      </span>
      {bookSheetDirtyCount > 0 && (
        <span className={`entity-chip ${bookSheetInvalidCount > 0 ? '' : 'entity-chip-soft'}`}>
          {bookSheetInvalidCount} blocked
        </span>
      )}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => applyBookSheetChanges(selectedBookCode ? [selectedBookCode] : undefined)}
        disabled={savingReference || !selectedBookSheetRow?.sheet_dirty}
      >
        Apply Selected
      </button>
      <button
        type="button"
        className="button button-ghost"
        onClick={() => selectedBookCode && resetBookSheetRow(selectedBookCode)}
        disabled={savingReference || !selectedBookSheetRow?.sheet_dirty}
      >
        Reset Selected
      </button>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => applyBookSheetChanges()}
        disabled={savingReference || bookSheetDirtyCount === 0}
      >
        Apply Staged
      </button>
      <button
        type="button"
        className="button button-ghost"
        onClick={resetAllBookSheetChanges}
        disabled={savingReference || bookSheetDirtyCount === 0}
      >
        Reset Staged
      </button>
    </>
  )
}

export function ReferenceDataBooksDirectory({ controller }: ReferenceDataTabProps) {
  const {
    bookSheetRows,
    bookPasteInput,
    setBookPasteInput,
    bookPasteSummary,
    selectedBookCode,
    startEditBook,
    updateBookSheetField,
    stageBooksFromPaste,
    clearBookPasteState,
    savingReference,
  } = controller

  return (
    <div className="stack">
      <section className="reference-paste-card">
        <div className="reference-paste-head">
          <div>
            <span className="eyebrow">Paste From Spreadsheet</span>
            <h4>Books Import Staging</h4>
          </div>
          <div className="chip-row">
            <span className="entity-chip entity-chip-soft">Code</span>
            <span className="entity-chip entity-chip-soft">Name</span>
            <span className="entity-chip entity-chip-soft">Description optional</span>
          </div>
        </div>
        <p>
          Paste rows from Excel or Sheets using either a `Code / Name / Description` header row or that column
          order without headers. Unknown codes become staged new books, while existing codes stage as updates.
        </p>
        <textarea
          className="control control-textarea reference-paste-textarea"
          value={bookPasteInput}
          onChange={(event) => setBookPasteInput(event.target.value)}
          placeholder={'Code\tName\tDescription\nCRUDE01\tPrimary Crude Book\tWest desk prompt barrel book'}
          spellCheck={false}
        />
        <div className="toolbar">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => stageBooksFromPaste(bookPasteInput)}
            disabled={savingReference || !bookPasteInput.trim()}
          >
            Stage Pasted Rows
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={clearBookPasteState}
            disabled={savingReference || (!bookPasteInput.trim() && !bookPasteSummary)}
          >
            Clear Paste
          </button>
        </div>
        {bookPasteSummary && (
          <div className="reference-paste-summary">
            <div className="chip-row">
              <span className="entity-chip entity-chip-soft">{bookPasteSummary.total_rows} pasted</span>
              <span className="entity-chip entity-chip-soft">{bookPasteSummary.staged_rows} staged</span>
              <span className="entity-chip entity-chip-soft">{bookPasteSummary.new_rows} new</span>
              <span className="entity-chip entity-chip-soft">
                {bookPasteSummary.updated_rows} update{bookPasteSummary.updated_rows === 1 ? '' : 's'}
              </span>
              <span className={`entity-chip ${bookPasteSummary.invalid_rows > 0 ? '' : 'entity-chip-soft'}`}>
                {bookPasteSummary.invalid_rows} invalid
              </span>
              <span className={`entity-chip ${bookPasteSummary.blocked_rows > 0 ? '' : 'entity-chip-soft'}`}>
                {bookPasteSummary.blocked_rows} blocked
              </span>
              <span className="entity-chip entity-chip-soft">{bookPasteSummary.unchanged_rows} unchanged</span>
              <span className="entity-chip entity-chip-soft">
                {bookPasteSummary.used_header ? 'Header row used' : 'No header row'}
              </span>
            </div>
            {bookPasteSummary.issues.length > 0 && (
              <div className="reference-paste-issues">
                <strong>Import issues</strong>
                <ul>
                  {bookPasteSummary.issues.slice(0, 6).map((issue) => (
                    <li key={`${issue.row_number}:${issue.code ?? 'none'}:${issue.message}`}>
                      Row {issue.row_number}
                      {issue.code ? ` (${issue.code})` : ''}: {issue.message}
                    </li>
                  ))}
                </ul>
                {bookPasteSummary.issues.length > 6 && (
                  <p>
                    {bookPasteSummary.issues.length - 6} additional issue
                    {bookPasteSummary.issues.length - 6 === 1 ? '' : 's'} are hidden from this summary.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <DataSheet
        label="Books"
        description="Stage book updates and pasted new books directly in the grid, then apply them through the normal reference-data write path once the highlighted rows look clean."
        columns={[
          { id: 'code', label: 'Code', width: '8rem', renderCell: (book) => book.code },
          {
            id: 'name',
            label: 'Name',
            width: '18rem',
            editable: {
              value: (book) => book.name,
              onChange: (book, value) => updateBookSheetField(book.code, 'name', value),
              isDirty: (book) => book.sheet_dirty,
              error: (book) => book.sheet_error,
            },
          },
          {
            id: 'description',
            label: 'Description',
            width: '20rem',
            editable: {
              value: (book) => book.description,
              onChange: (book, value) => updateBookSheetField(book.code, 'description', value),
              isDirty: (book) => book.sheet_dirty,
            },
          },
          createStatusColumn<(typeof bookSheetRows)[number]>(),
          {
            id: 'draft-state',
            label: 'Draft State',
            width: '11rem',
            renderCell: (book) => (
              <span className={`entity-chip ${book.sheet_error ? '' : 'entity-chip-soft'}`}>
                {book.sheet_error
                  ? 'Needs attention'
                  : book.sheet_mode === 'create'
                    ? 'New'
                    : book.sheet_dirty
                      ? 'Staged'
                      : 'Saved'}
              </span>
            ),
          },
        ]}
        rows={bookSheetRows}
        getRowId={(book) => book.code}
        getRowLabel={(book) => `${book.code} ${book.name}`}
        selectedRowId={selectedBookCode}
        onSelectRow={(book) => startEditBook(book.code)}
        emptyMessage="No books match the current filter."
      />
    </div>
  )
}

export function ReferenceDataBooksEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedBook,
    selectedBookUsage,
    bookFormMode,
    bookForm,
    setBookForm,
    startCreateBook,
    handleSaveBook,
    handleToggleBook,
    bookFieldErrors,
    bookFormDirty,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateBook}>
          New Book
        </button>
        {selectedBook && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleBook(selectedBook)}
            disabled={savingReference}
          >
            {selectedBook.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {selectedBook && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Usage</strong>
            <EditorStateBadge isDirty={bookFormDirty} />
          </div>
          <p>
            Used by {selectedBookUsage?.activeTrades ?? 0} active trade
            {selectedBookUsage?.activeTrades === 1 ? '' : 's'} and {selectedBookUsage?.totalTrades ?? 0} total
            trade{selectedBookUsage?.totalTrades === 1 ? '' : 's'}.
          </p>
          {selectedBook.is_active && (selectedBookUsage?.activeTrades ?? 0) > 0 && (
            <p className="field-error">Deactivate is blocked while active trades still reference this book.</p>
          )}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSaveBook}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={bookForm.code}
              onChange={(event) => setBookForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              disabled={bookFormMode === 'edit' || savingReference}
            />
            {bookFieldErrors.code && <small className="field-error">{bookFieldErrors.code}</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={bookForm.name}
              onChange={(event) => setBookForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {bookFieldErrors.name && <small className="field-error">{bookFieldErrors.name}</small>}
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={bookForm.description}
            onChange={(event) => setBookForm((current) => ({ ...current, description: event.target.value }))}
            disabled={savingReference}
          />
        </label>

        <button
          type="submit"
          className="button button-primary"
          disabled={savingReference || Boolean(bookFieldErrors.code || bookFieldErrors.name) || !bookFormDirty}
        >
          {savingReference ? 'Saving...' : bookFormMode === 'create' ? 'Create Book' : 'Save Changes'}
        </button>
      </form>

      {selectedBook && bookFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedBook.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedBook.updated_at)}</strong>
          </div>
          <div className="detail-row">
            <span>Version</span>
            <strong>{selectedBook.version ?? '—'}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
