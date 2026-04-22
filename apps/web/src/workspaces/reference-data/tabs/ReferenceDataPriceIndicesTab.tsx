import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataPriceIndicesDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredPriceIndices, selectedPriceIndexCode, startEditPriceIndex } = controller

  return (
    <DataSheet
      label="Price Indices"
      description="Use the grid to scan index metadata quickly before opening the full editor for controlled updates."
      columns={[
        { id: 'code', label: 'Code', width: '12rem', renderCell: (priceIndex) => priceIndex.code },
        { id: 'commodity', label: 'Commodity', width: '10rem', renderCell: (priceIndex) => priceIndex.commodity_code },
        { id: 'provider', label: 'Provider', width: '10rem', renderCell: (priceIndex) => priceIndex.provider },
        { id: 'market', label: 'Market', width: '10rem', renderCell: (priceIndex) => priceIndex.market ?? '—' },
        { id: 'currency', label: 'Currency', width: '8rem', renderCell: (priceIndex) => priceIndex.currency_code },
        { id: 'unit', label: 'Unit', width: '8rem', renderCell: (priceIndex) => priceIndex.unit_code },
        createStatusColumn<(typeof filteredPriceIndices)[number]>(),
      ]}
      rows={filteredPriceIndices}
      getRowId={(priceIndex) => priceIndex.code}
      getRowLabel={(priceIndex) => `${priceIndex.code} ${priceIndex.name}`}
      selectedRowId={selectedPriceIndexCode}
      onSelectRow={(priceIndex) => startEditPriceIndex(priceIndex.code)}
      emptyMessage="No price indices match the current filter."
    />
  )
}

export function ReferenceDataPriceIndicesEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedPriceIndex,
    priceIndexFormMode,
    priceIndexForm,
    setPriceIndexForm,
    startCreatePriceIndex,
    handleSavePriceIndex,
    handleTogglePriceIndex,
    activeCommodities,
    activeCurrencies,
    selectablePriceIndexUnits,
    activeLocations,
    selectedPriceIndexUsage,
    priceIndexFieldErrors,
    priceIndexFormDirty,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreatePriceIndex}>
          New Price Index
        </button>
        {selectedPriceIndex && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleTogglePriceIndex(selectedPriceIndex)}
            disabled={savingReference}
          >
            {selectedPriceIndex.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {selectedPriceIndex && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Usage</strong>
            <EditorStateBadge isDirty={priceIndexFormDirty} />
          </div>
          <p>
            Used by {selectedPriceIndexUsage?.activeTrades ?? 0} active trade
            {selectedPriceIndexUsage?.activeTrades === 1 ? '' : 's'} and {selectedPriceIndexUsage?.totalTrades ?? 0}
            {' '}total trade{selectedPriceIndexUsage?.totalTrades === 1 ? '' : 's'}.
          </p>
          {selectedPriceIndex.is_active && (selectedPriceIndexUsage?.activeTrades ?? 0) > 0 && (
            <p className="field-error">
              Deactivate is blocked while active trades still price off this index.
            </p>
          )}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSavePriceIndex}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={priceIndexForm.code}
              onChange={(event) =>
                setPriceIndexForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={priceIndexFormMode === 'edit' || savingReference}
            />
            {priceIndexFieldErrors.code && <small className="field-error">{priceIndexFieldErrors.code}</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={priceIndexForm.name}
              onChange={(event) => setPriceIndexForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {priceIndexFieldErrors.name && <small className="field-error">{priceIndexFieldErrors.name}</small>}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Commodity</span>
            <select
              className="control"
              value={priceIndexForm.commodity_code}
              onChange={(event) =>
                setPriceIndexForm((current) => ({ ...current, commodity_code: event.target.value }))
              }
              disabled={savingReference || activeCommodities.length === 0}
            >
              {activeCommodities.map((commodity) => (
                <option key={commodity.code} value={commodity.code}>
                  {commodity.name}
                </option>
              ))}
            </select>
            {priceIndexFieldErrors.commodity_code && (
              <small className="field-error">{priceIndexFieldErrors.commodity_code}</small>
            )}
          </label>
          <label className="field">
            <span>Provider</span>
            <input
              className="control"
              value={priceIndexForm.provider}
              onChange={(event) => setPriceIndexForm((current) => ({ ...current, provider: event.target.value }))}
              disabled={savingReference}
            />
            {priceIndexFieldErrors.provider && (
              <small className="field-error">{priceIndexFieldErrors.provider}</small>
            )}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Currency</span>
            <select
              className="control"
              value={priceIndexForm.currency_code}
              onChange={(event) =>
                setPriceIndexForm((current) => ({ ...current, currency_code: event.target.value }))
              }
              disabled={savingReference || activeCurrencies.length === 0}
            >
              {activeCurrencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}{currency.symbol ? ` • ${currency.symbol}` : ''}
                </option>
              ))}
            </select>
            {priceIndexFieldErrors.currency_code && (
              <small className="field-error">{priceIndexFieldErrors.currency_code}</small>
            )}
          </label>
          <label className="field">
            <span>Unit</span>
            <select
              className="control"
              value={priceIndexForm.unit_code}
              onChange={(event) =>
                setPriceIndexForm((current) => ({ ...current, unit_code: event.target.value }))
              }
              disabled={savingReference || selectablePriceIndexUnits.length === 0}
            >
              {selectablePriceIndexUnits.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code} • {unit.dimension}
                </option>
              ))}
            </select>
            {priceIndexFieldErrors.unit_code && (
              <small className="field-error">{priceIndexFieldErrors.unit_code}</small>
            )}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Market</span>
            <input
              className="control"
              value={priceIndexForm.market}
              onChange={(event) => setPriceIndexForm((current) => ({ ...current, market: event.target.value }))}
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Location Code</span>
            <select
              className="control"
              value={priceIndexForm.location_code}
              onChange={(event) =>
                setPriceIndexForm((current) => ({ ...current, location_code: event.target.value }))
              }
              disabled={savingReference || activeLocations.length === 0}
            >
              <option value="">No location</option>
              {activeLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} • {location.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Calendar Code</span>
          <input
            className="control"
            value={priceIndexForm.calendar_code}
            onChange={(event) =>
              setPriceIndexForm((current) => ({ ...current, calendar_code: event.target.value.toUpperCase() }))
            }
            disabled={savingReference}
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={priceIndexForm.description}
            onChange={(event) =>
              setPriceIndexForm((current) => ({ ...current, description: event.target.value }))
            }
            disabled={savingReference}
          />
        </label>

        <button
          type="submit"
          className="button button-primary"
          disabled={
            savingReference ||
            activeCommodities.length === 0 ||
            activeCurrencies.length === 0 ||
            selectablePriceIndexUnits.length === 0 ||
            Boolean(
              priceIndexFieldErrors.code ||
                priceIndexFieldErrors.name ||
                priceIndexFieldErrors.commodity_code ||
                priceIndexFieldErrors.provider ||
                priceIndexFieldErrors.currency_code ||
                priceIndexFieldErrors.unit_code,
            ) ||
            !priceIndexFormDirty
          }
        >
          {savingReference ? 'Saving...' : priceIndexFormMode === 'create' ? 'Create Price Index' : 'Save Changes'}
        </button>
      </form>

      {selectedPriceIndex && priceIndexFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedPriceIndex.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Commodity</span>
            <strong>{selectedPriceIndex.commodity_code}</strong>
          </div>
          <div className="detail-row">
            <span>Pricing Basis</span>
            <strong>
              {selectedPriceIndex.currency_code} / {selectedPriceIndex.unit_code}
            </strong>
          </div>
          <div className="detail-row">
            <span>Provider</span>
            <strong>{selectedPriceIndex.provider}</strong>
          </div>
          <div className="detail-row">
            <span>Location</span>
            <strong>{selectedPriceIndex.location_code ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Calendar</span>
            <strong>{selectedPriceIndex.calendar_code ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedPriceIndex.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
