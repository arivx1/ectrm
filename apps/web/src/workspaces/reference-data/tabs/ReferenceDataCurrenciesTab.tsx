import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataCurrenciesDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredCurrencies, selectedCurrencyCode, startEditCurrency } = controller

  return (
    <DataSheet
      label="Currencies"
      description="Use cell focus and row selection to move through supporting monetary reference data at spreadsheet density."
      columns={[
        { id: 'code', label: 'Code', width: '8rem', renderCell: (currency) => currency.code },
        { id: 'name', label: 'Name', width: '16rem', renderCell: (currency) => currency.name },
        { id: 'symbol', label: 'Symbol', width: '8rem', renderCell: (currency) => currency.symbol ?? '—' },
        createStatusColumn<(typeof filteredCurrencies)[number]>(),
      ]}
      rows={filteredCurrencies}
      getRowId={(currency) => currency.code}
      getRowLabel={(currency) => `${currency.code} ${currency.name}`}
      selectedRowId={selectedCurrencyCode}
      onSelectRow={(currency) => startEditCurrency(currency.code)}
      emptyMessage="No currencies match the current filter."
    />
  )
}

export function ReferenceDataCurrenciesEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedCurrency,
    currencyFormMode,
    currencyForm,
    setCurrencyForm,
    startCreateCurrency,
    handleSaveCurrency,
    handleToggleCurrency,
    selectedCurrencyUsage,
    currencyFieldErrors,
    currencyFormDirty,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateCurrency}>
          New Currency
        </button>
        {selectedCurrency && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleCurrency(selectedCurrency)}
            disabled={savingReference}
          >
            {selectedCurrency.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {selectedCurrency && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Usage</strong>
            <EditorStateBadge isDirty={currencyFormDirty} />
          </div>
          <p>
            Referenced by {selectedCurrencyUsage?.activeChildren ?? 0} active price
            {' '}{selectedCurrencyUsage?.activeChildren === 1 ? 'index' : 'indices'} and {selectedCurrencyUsage?.totalChildren ?? 0}
            {' '}total price {selectedCurrencyUsage?.totalChildren === 1 ? 'index' : 'indices'}.
          </p>
          {selectedCurrency.is_active && (selectedCurrencyUsage?.activeChildren ?? 0) > 0 && (
            <p className="field-error">
              Deactivate is blocked while active price indices still reference this currency.
            </p>
          )}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSaveCurrency}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={currencyForm.code}
              onChange={(event) =>
                setCurrencyForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={currencyFormMode === 'edit' || savingReference}
            />
            {currencyFieldErrors.code && <small className="field-error">{currencyFieldErrors.code}</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={currencyForm.name}
              onChange={(event) => setCurrencyForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {currencyFieldErrors.name && <small className="field-error">{currencyFieldErrors.name}</small>}
          </label>
        </div>

        <label className="field">
          <span>Symbol</span>
          <input
            className="control"
            value={currencyForm.symbol}
            onChange={(event) => setCurrencyForm((current) => ({ ...current, symbol: event.target.value }))}
            disabled={savingReference}
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={currencyForm.description}
            onChange={(event) =>
              setCurrencyForm((current) => ({ ...current, description: event.target.value }))
            }
            disabled={savingReference}
          />
        </label>

        <button
          type="submit"
          className="button button-primary"
          disabled={savingReference || Boolean(currencyFieldErrors.code || currencyFieldErrors.name) || !currencyFormDirty}
        >
          {savingReference ? 'Saving...' : currencyFormMode === 'create' ? 'Create Currency' : 'Save Changes'}
        </button>
      </form>

      {selectedCurrency && currencyFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedCurrency.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Symbol</span>
            <strong>{selectedCurrency.symbol ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedCurrency.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
