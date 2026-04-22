import { DataSheet } from '../../../shared/ui/DataSheet'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataPortfoliosDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredPortfolios, selectedPortfolioCode, startEditPortfolio } = controller

  return (
    <DataSheet
      label="Portfolios"
      description="Use the sheet to scan portfolio ownership context before making controlled updates in the editor."
      columns={[
        { id: 'code', label: 'Code', width: '10rem', renderCell: (portfolio) => portfolio.code },
        { id: 'name', label: 'Name', width: '18rem', renderCell: (portfolio) => portfolio.name },
        { id: 'book', label: 'Book', width: '8rem', renderCell: (portfolio) => portfolio.book_code },
        { id: 'strategy', label: 'Strategy', width: '12rem', renderCell: (portfolio) => portfolio.strategy ?? '—' },
        createStatusColumn<(typeof filteredPortfolios)[number]>(),
      ]}
      rows={filteredPortfolios}
      getRowId={(portfolio) => portfolio.code}
      getRowLabel={(portfolio) => `${portfolio.code} ${portfolio.name}`}
      selectedRowId={selectedPortfolioCode}
      onSelectRow={(portfolio) => startEditPortfolio(portfolio.code)}
      emptyMessage="No portfolios match the current filter."
    />
  )
}

export function ReferenceDataPortfoliosEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedPortfolio,
    portfolioFormMode,
    portfolioForm,
    setPortfolioForm,
    startCreatePortfolio,
    handleSavePortfolio,
    handleTogglePortfolio,
    activeBooks,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreatePortfolio}>
          New Portfolio
        </button>
        {selectedPortfolio && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleTogglePortfolio(selectedPortfolio)}
            disabled={savingReference}
          >
            {selectedPortfolio.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      <form className="stack-form" onSubmit={handleSavePortfolio}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={portfolioForm.code}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={portfolioFormMode === 'edit' || savingReference}
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={portfolioForm.name}
              onChange={(event) => setPortfolioForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
          </label>
        </div>

        <label className="field">
          <span>Book</span>
          <select
            className="control"
            value={portfolioForm.book_code}
            onChange={(event) => setPortfolioForm((current) => ({ ...current, book_code: event.target.value }))}
            disabled={savingReference || activeBooks.length === 0}
          >
            {activeBooks.map((book) => (
              <option key={book.code} value={book.code}>
                {book.code} • {book.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mini-grid">
          <label className="field">
            <span>Owner</span>
            <input
              className="control"
              value={portfolioForm.owner}
              onChange={(event) => setPortfolioForm((current) => ({ ...current, owner: event.target.value }))}
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Strategy</span>
            <input
              className="control"
              value={portfolioForm.strategy}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, strategy: event.target.value }))
              }
              disabled={savingReference}
            />
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={portfolioForm.description}
            onChange={(event) =>
              setPortfolioForm((current) => ({ ...current, description: event.target.value }))
            }
            disabled={savingReference}
          />
        </label>

        <button type="submit" className="button button-primary" disabled={savingReference || activeBooks.length === 0}>
          {savingReference ? 'Saving...' : portfolioFormMode === 'create' ? 'Create Portfolio' : 'Save Changes'}
        </button>
      </form>

      {selectedPortfolio && portfolioFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedPortfolio.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Book</span>
            <strong>{selectedPortfolio.book_code}</strong>
          </div>
          <div className="detail-row">
            <span>Owner</span>
            <strong>{selectedPortfolio.owner ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedPortfolio.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
