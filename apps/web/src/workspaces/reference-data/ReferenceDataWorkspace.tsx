import type { useReferenceDataController } from '../../features/reference-data/useReferenceDataController'

type ReferenceDataWorkspaceProps = {
  controller: ReturnType<typeof useReferenceDataController>
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
}

export function ReferenceDataWorkspace(props: ReferenceDataWorkspaceProps) {
  const { controller, formatCommodityClass, formatDate } = props
  const {
    referenceTab,
    setReferenceTab,
    referenceSearch,
    setReferenceSearch,
    filteredBooks,
    selectedBookCode,
    startEditBook,
    referenceCommodityGroups,
    selectedCommodityCode,
    startEditCommodity,
    filteredPriceIndices,
    selectedPriceIndexCode,
    startEditPriceIndex,
    filteredCurrencies,
    selectedCurrencyCode,
    startEditCurrency,
    filteredUnits,
    selectedUnitCode,
    startEditUnit,
    filteredLocations,
    selectedLocationCode,
    startEditLocation,
    filteredCounterparties,
    selectedCounterpartyCode,
    startEditCounterparty,
    filteredPortfolios,
    selectedPortfolioCode,
    startEditPortfolio,
    referenceActionError,
    referenceActionSuccess,
    savingReference,
    selectedBook,
    bookFormMode,
    bookForm,
    setBookForm,
    startCreateBook,
    handleSaveBook,
    handleToggleBook,
    selectedCommodity,
    commodityFormMode,
    commodityForm,
    setCommodityForm,
    startCreateCommodity,
    handleSaveCommodity,
    handleToggleCommodity,
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
    selectedCurrency,
    currencyFormMode,
    currencyForm,
    setCurrencyForm,
    startCreateCurrency,
    handleSaveCurrency,
    handleToggleCurrency,
    selectedUnit,
    unitFormMode,
    unitForm,
    setUnitForm,
    startCreateUnit,
    handleSaveUnit,
    handleToggleUnit,
    selectedLocation,
    locationFormMode,
    locationForm,
    setLocationForm,
    startCreateLocation,
    handleSaveLocation,
    handleToggleLocation,
    selectedCounterparty,
    counterpartyFormMode,
    counterpartyForm,
    setCounterpartyForm,
    startCreateCounterparty,
    handleSaveCounterparty,
    handleToggleCounterparty,
    selectedPortfolio,
    portfolioFormMode,
    portfolioForm,
    setPortfolioForm,
    startCreatePortfolio,
    handleSavePortfolio,
    handleTogglePortfolio,
    activeBooks,
    selectedBookUsage,
    selectedCommodityUsage,
    selectedPriceIndexUsage,
    selectedCurrencyUsage,
    selectedUnitUsage,
    selectedLocationUsage,
    bookFieldErrors,
    commodityFieldErrors,
    priceIndexFieldErrors,
    currencyFieldErrors,
    unitFieldErrors,
    locationFieldErrors,
    bookFormDirty,
    commodityFormDirty,
    priceIndexFormDirty,
    currencyFormDirty,
    unitFormDirty,
    locationFormDirty,
    commodityClassOrder,
  } = controller

  return (
    <div className="reference-workspace">
      <section className="surface reference-directory">
        <div className="section-head section-head-control">
          <div>
            <span className="eyebrow">Directory</span>
            <h3>Reference Directory</h3>
          </div>
          <div className="toolbar">
            <input
              className="control control-compact"
              value={referenceSearch}
              onChange={(event) => setReferenceSearch(event.target.value)}
              placeholder="Search codes or names"
            />
          </div>
        </div>

        <div className="tab-row">
          <button type="button" className={`tab-pill ${referenceTab === 'books' ? 'is-active' : ''}`} onClick={() => setReferenceTab('books')}>
            Books
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'commodities' ? 'is-active' : ''}`} onClick={() => setReferenceTab('commodities')}>
            Commodities
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'price-indices' ? 'is-active' : ''}`} onClick={() => setReferenceTab('price-indices')}>
            Price Indices
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'currencies' ? 'is-active' : ''}`} onClick={() => setReferenceTab('currencies')}>
            Currencies
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'units' ? 'is-active' : ''}`} onClick={() => setReferenceTab('units')}>
            Units
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'locations' ? 'is-active' : ''}`} onClick={() => setReferenceTab('locations')}>
            Locations
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'counterparties' ? 'is-active' : ''}`} onClick={() => setReferenceTab('counterparties')}>
            Counterparties
          </button>
          <button type="button" className={`tab-pill ${referenceTab === 'portfolios' ? 'is-active' : ''}`} onClick={() => setReferenceTab('portfolios')}>
            Portfolios
          </button>
        </div>

        {referenceTab === 'books' && (
          <div className="reference-stack">
            {filteredBooks.map((book) => (
              <button
                key={book.code}
                type="button"
                className={`reference-row ${selectedBookCode === book.code ? 'is-selected' : ''}`}
                onClick={() => startEditBook(book.code)}
              >
                <div>
                  <strong>{book.code}</strong>
                  <p>{book.name}</p>
                </div>
                <span className={`reference-status ${book.is_active ? 'is-active' : 'is-inactive'}`}>
                  {book.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}

        {referenceTab === 'commodities' && (
          <div className="reference-groups">
            {referenceCommodityGroups.map((group) => (
              <section key={group.commodityClass} className="reference-group">
                <div className="reference-group-head">
                  <strong>{formatCommodityClass(group.commodityClass)}</strong>
                  <span>{group.items.length}</span>
                </div>
                <div className="reference-stack">
                  {group.items.map((commodity) => (
                    <button
                      key={commodity.code}
                      type="button"
                      className={`reference-row ${selectedCommodityCode === commodity.code ? 'is-selected' : ''}`}
                      onClick={() => startEditCommodity(commodity.code)}
                    >
                      <div>
                        <strong>{commodity.code}</strong>
                        <p>{commodity.name}</p>
                      </div>
                      <span className={`reference-status ${commodity.is_active ? 'is-active' : 'is-inactive'}`}>
                        {commodity.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {referenceTab === 'price-indices' && (
          <div className="reference-stack">
            {filteredPriceIndices.map((priceIndex) => (
              <button
                key={priceIndex.code}
                type="button"
                className={`reference-row ${selectedPriceIndexCode === priceIndex.code ? 'is-selected' : ''}`}
                onClick={() => startEditPriceIndex(priceIndex.code)}
              >
                <div>
                  <strong>{priceIndex.code}</strong>
                  <p>{priceIndex.name}</p>
                  <p>
                    {priceIndex.commodity_code} • {priceIndex.provider}
                    {priceIndex.market ? ` • ${priceIndex.market}` : ''}
                  </p>
                </div>
                <span className={`reference-status ${priceIndex.is_active ? 'is-active' : 'is-inactive'}`}>
                  {priceIndex.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}

        {referenceTab === 'currencies' && (
          <div className="reference-stack">
            {filteredCurrencies.map((currency) => (
              <button
                key={currency.code}
                type="button"
                className={`reference-row ${selectedCurrencyCode === currency.code ? 'is-selected' : ''}`}
                onClick={() => startEditCurrency(currency.code)}
              >
                <div>
                  <strong>{currency.code}</strong>
                  <p>{currency.name}</p>
                </div>
                <span className={`reference-status ${currency.is_active ? 'is-active' : 'is-inactive'}`}>
                  {currency.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}

        {referenceTab === 'units' && (
          <div className="reference-stack">
            {filteredUnits.map((unit) => (
              <button
                key={unit.code}
                type="button"
                className={`reference-row ${selectedUnitCode === unit.code ? 'is-selected' : ''}`}
                onClick={() => startEditUnit(unit.code)}
              >
                <div>
                  <strong>{unit.code}</strong>
                  <p>{unit.name}</p>
                  <p>
                    {unit.dimension}
                    {unit.commodity_class ? ` • ${formatCommodityClass(unit.commodity_class)}` : ''}
                  </p>
                </div>
                <span className={`reference-status ${unit.is_active ? 'is-active' : 'is-inactive'}`}>
                  {unit.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}

        {referenceTab === 'locations' && (
          <div className="reference-stack">
            {filteredLocations.map((location) => (
              <button
                key={location.code}
                type="button"
                className={`reference-row ${selectedLocationCode === location.code ? 'is-selected' : ''}`}
                onClick={() => startEditLocation(location.code)}
              >
                <div>
                  <strong>{location.code}</strong>
                  <p>{location.name}</p>
                  <p>
                    {location.location_type}
                    {location.market ? ` • ${location.market}` : ''}
                  </p>
                </div>
                <span className={`reference-status ${location.is_active ? 'is-active' : 'is-inactive'}`}>
                  {location.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}

        {referenceTab === 'counterparties' && (
          <div className="reference-stack">
            {filteredCounterparties.map((counterparty) => (
              <button
                key={counterparty.code}
                type="button"
                className={`reference-row ${selectedCounterpartyCode === counterparty.code ? 'is-selected' : ''}`}
                onClick={() => startEditCounterparty(counterparty.code)}
              >
                <div>
                  <strong>{counterparty.code}</strong>
                  <p>{counterparty.name}</p>
                  <p>
                    {counterparty.counterparty_type}
                    {counterparty.country_code ? ` • ${counterparty.country_code}` : ''}
                  </p>
                </div>
                <span className={`reference-status ${counterparty.is_active ? 'is-active' : 'is-inactive'}`}>
                  {counterparty.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}

        {referenceTab === 'portfolios' && (
          <div className="reference-stack">
            {filteredPortfolios.map((portfolio) => (
              <button
                key={portfolio.code}
                type="button"
                className={`reference-row ${selectedPortfolioCode === portfolio.code ? 'is-selected' : ''}`}
                onClick={() => startEditPortfolio(portfolio.code)}
              >
                <div>
                  <strong>{portfolio.code}</strong>
                  <p>{portfolio.name}</p>
                  <p>
                    {portfolio.book_code}
                    {portfolio.strategy ? ` • ${portfolio.strategy}` : ''}
                  </p>
                </div>
                <span className={`reference-status ${portfolio.is_active ? 'is-active' : 'is-inactive'}`}>
                  {portfolio.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className="surface reference-editor">
        <div className="section-head">
          <div>
            <span className="eyebrow">Maintenance</span>
            <h3>
              {referenceTab === 'books'
                ? 'Book Editor'
                : referenceTab === 'commodities'
                  ? 'Commodity Editor'
                  : referenceTab === 'price-indices'
                    ? 'Price Index Editor'
                    : referenceTab === 'currencies'
                      ? 'Currency Editor'
                      : referenceTab === 'units'
                        ? 'Unit Editor'
                        : referenceTab === 'locations'
                          ? 'Location Editor'
                          : referenceTab === 'counterparties'
                            ? 'Counterparty Editor'
                            : 'Portfolio Editor'}
            </h3>
          </div>
          <p>Maintain master data directly in the app, including activation controls and basic audit context.</p>
        </div>

        {referenceActionError && <div className="error-banner reference-banner">{referenceActionError}</div>}
        {referenceActionSuccess && <div className="success-banner">{referenceActionSuccess}</div>}

        {referenceTab === 'books' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreateBook}>
                New Book
              </button>
              {selectedBook && (
                <button type="button" className="button button-ghost" onClick={() => handleToggleBook(selectedBook)} disabled={savingReference}>
                  {selectedBook.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            {selectedBook && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Usage</strong>
                  <span className={`editor-state-pill ${bookFormDirty ? 'is-dirty' : 'is-clean'}`}>
                    {bookFormDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <p>
                  Used by {selectedBookUsage?.activeTrades ?? 0} active trade{selectedBookUsage?.activeTrades === 1 ? '' : 's'}
                  {' '}and {selectedBookUsage?.totalTrades ?? 0} total trade{selectedBookUsage?.totalTrades === 1 ? '' : 's'}.
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
        )}

        {referenceTab === 'commodities' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreateCommodity}>
                New Commodity
              </button>
              {selectedCommodity && (
                <button type="button" className="button button-ghost" onClick={() => handleToggleCommodity(selectedCommodity)} disabled={savingReference}>
                  {selectedCommodity.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            {selectedCommodity && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Usage</strong>
                  <span className={`editor-state-pill ${commodityFormDirty ? 'is-dirty' : 'is-clean'}`}>
                    {commodityFormDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <p>
                  Used by {selectedCommodityUsage?.activeTrades ?? 0} active trade{selectedCommodityUsage?.activeTrades === 1 ? '' : 's'}
                  {' '}and {selectedCommodityUsage?.totalTrades ?? 0} total trade{selectedCommodityUsage?.totalTrades === 1 ? '' : 's'}.
                </p>
                {selectedCommodity.is_active && (selectedCommodityUsage?.activeTrades ?? 0) > 0 && (
                  <p className="field-error">Deactivate is blocked while active trades still reference this commodity.</p>
                )}
              </div>
            )}

            <form className="stack-form" onSubmit={handleSaveCommodity}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input
                    className="control"
                    value={commodityForm.code}
                    onChange={(event) => setCommodityForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    disabled={commodityFormMode === 'edit' || savingReference}
                  />
                  {commodityFieldErrors.code && <small className="field-error">{commodityFieldErrors.code}</small>}
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    className="control"
                    value={commodityForm.name}
                    onChange={(event) => setCommodityForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={savingReference}
                  />
                  {commodityFieldErrors.name && <small className="field-error">{commodityFieldErrors.name}</small>}
                </label>
              </div>

              <label className="field">
                <span>Commodity Class</span>
                <select
                  className="control"
                  value={commodityForm.commodity_class}
                  onChange={(event) => setCommodityForm((current) => ({ ...current, commodity_class: event.target.value }))}
                  disabled={savingReference}
                >
                  {commodityClassOrder.map((commodityClass) => (
                    <option key={commodityClass} value={commodityClass}>
                      {formatCommodityClass(commodityClass)}
                    </option>
                  ))}
                </select>
                {commodityFieldErrors.commodity_class && <small className="field-error">{commodityFieldErrors.commodity_class}</small>}
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  className="control control-textarea"
                  value={commodityForm.description}
                  onChange={(event) => setCommodityForm((current) => ({ ...current, description: event.target.value }))}
                  disabled={savingReference}
                />
              </label>

              <button
                type="submit"
                className="button button-primary"
                disabled={
                  savingReference ||
                  Boolean(commodityFieldErrors.code || commodityFieldErrors.name || commodityFieldErrors.commodity_class) ||
                  !commodityFormDirty
                }
              >
                {savingReference ? 'Saving...' : commodityFormMode === 'create' ? 'Create Commodity' : 'Save Changes'}
              </button>
            </form>

            {selectedCommodity && commodityFormMode === 'edit' && (
              <div className="detail-list">
                <div className="detail-row">
                  <span>Status</span>
                  <strong>{selectedCommodity.is_active ? 'Active' : 'Inactive'}</strong>
                </div>
                <div className="detail-row">
                  <span>Class</span>
                  <strong>{formatCommodityClass(selectedCommodity.commodity_class ?? 'OTHER')}</strong>
                </div>
                <div className="detail-row">
                  <span>Updated</span>
                  <strong>{formatDate(selectedCommodity.updated_at)}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {referenceTab === 'price-indices' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreatePriceIndex}>
                New Price Index
              </button>
              {selectedPriceIndex && (
                <button type="button" className="button button-ghost" onClick={() => handleTogglePriceIndex(selectedPriceIndex)} disabled={savingReference}>
                  {selectedPriceIndex.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            {selectedPriceIndex && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Usage</strong>
                  <span className={`editor-state-pill ${priceIndexFormDirty ? 'is-dirty' : 'is-clean'}`}>
                    {priceIndexFormDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <p>
                  Used by {selectedPriceIndexUsage?.activeTrades ?? 0} active trade{selectedPriceIndexUsage?.activeTrades === 1 ? '' : 's'}
                  {' '}and {selectedPriceIndexUsage?.totalTrades ?? 0} total trade{selectedPriceIndexUsage?.totalTrades === 1 ? '' : 's'}.
                </p>
                {selectedPriceIndex.is_active && (selectedPriceIndexUsage?.activeTrades ?? 0) > 0 && (
                  <p className="field-error">Deactivate is blocked while active trades still price off this index.</p>
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
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
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
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, commodity_code: event.target.value }))}
                    disabled={savingReference || activeCommodities.length === 0}
                  >
                    {activeCommodities.map((commodity) => (
                      <option key={commodity.code} value={commodity.code}>
                        {commodity.name}
                      </option>
                    ))}
                  </select>
                  {priceIndexFieldErrors.commodity_code && <small className="field-error">{priceIndexFieldErrors.commodity_code}</small>}
                </label>
                <label className="field">
                  <span>Provider</span>
                  <input
                    className="control"
                    value={priceIndexForm.provider}
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, provider: event.target.value }))}
                    disabled={savingReference}
                  />
                  {priceIndexFieldErrors.provider && <small className="field-error">{priceIndexFieldErrors.provider}</small>}
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Currency</span>
                  <select
                    className="control"
                    value={priceIndexForm.currency_code}
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, currency_code: event.target.value }))}
                    disabled={savingReference || activeCurrencies.length === 0}
                  >
                    {activeCurrencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code}{currency.symbol ? ` • ${currency.symbol}` : ''}
                      </option>
                    ))}
                  </select>
                  {priceIndexFieldErrors.currency_code && <small className="field-error">{priceIndexFieldErrors.currency_code}</small>}
                </label>
                <label className="field">
                  <span>Unit</span>
                  <select
                    className="control"
                    value={priceIndexForm.unit_code}
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, unit_code: event.target.value }))}
                    disabled={savingReference || selectablePriceIndexUnits.length === 0}
                  >
                    {selectablePriceIndexUnits.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.code} • {unit.dimension}
                      </option>
                    ))}
                  </select>
                  {priceIndexFieldErrors.unit_code && <small className="field-error">{priceIndexFieldErrors.unit_code}</small>}
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
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, location_code: event.target.value }))}
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
                  onChange={(event) => setPriceIndexForm((current) => ({ ...current, calendar_code: event.target.value.toUpperCase() }))}
                  disabled={savingReference}
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  className="control control-textarea"
                  value={priceIndexForm.description}
                  onChange={(event) => setPriceIndexForm((current) => ({ ...current, description: event.target.value }))}
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
                    priceIndexFieldErrors.unit_code
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
                  <strong>{selectedPriceIndex.currency_code} / {selectedPriceIndex.unit_code}</strong>
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
        )}

        {referenceTab === 'currencies' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreateCurrency}>
                New Currency
              </button>
              {selectedCurrency && (
                <button type="button" className="button button-ghost" onClick={() => handleToggleCurrency(selectedCurrency)} disabled={savingReference}>
                  {selectedCurrency.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            {selectedCurrency && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Usage</strong>
                  <span className={`editor-state-pill ${currencyFormDirty ? 'is-dirty' : 'is-clean'}`}>
                    {currencyFormDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <p>
                  Referenced by {selectedCurrencyUsage?.activeChildren ?? 0} active price {selectedCurrencyUsage?.activeChildren === 1 ? 'index' : 'indices'}
                  {' '}and {selectedCurrencyUsage?.totalChildren ?? 0} total price {selectedCurrencyUsage?.totalChildren === 1 ? 'index' : 'indices'}.
                </p>
                {selectedCurrency.is_active && (selectedCurrencyUsage?.activeChildren ?? 0) > 0 && (
                  <p className="field-error">Deactivate is blocked while active price indices still reference this currency.</p>
                )}
              </div>
            )}

            <form className="stack-form" onSubmit={handleSaveCurrency}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={currencyForm.code} onChange={(event) => setCurrencyForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={currencyFormMode === 'edit' || savingReference} />
                  {currencyFieldErrors.code && <small className="field-error">{currencyFieldErrors.code}</small>}
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={currencyForm.name} onChange={(event) => setCurrencyForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
                  {currencyFieldErrors.name && <small className="field-error">{currencyFieldErrors.name}</small>}
                </label>
              </div>

              <label className="field">
                <span>Symbol</span>
                <input className="control" value={currencyForm.symbol} onChange={(event) => setCurrencyForm((current) => ({ ...current, symbol: event.target.value }))} disabled={savingReference} />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={currencyForm.description} onChange={(event) => setCurrencyForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
              </label>

              <button type="submit" className="button button-primary" disabled={savingReference || Boolean(currencyFieldErrors.code || currencyFieldErrors.name) || !currencyFormDirty}>
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
        )}

        {referenceTab === 'units' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreateUnit}>
                New Unit
              </button>
              {selectedUnit && (
                <button type="button" className="button button-ghost" onClick={() => handleToggleUnit(selectedUnit)} disabled={savingReference}>
                  {selectedUnit.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            {selectedUnit && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Usage</strong>
                  <span className={`editor-state-pill ${unitFormDirty ? 'is-dirty' : 'is-clean'}`}>
                    {unitFormDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <p>
                  Referenced by {selectedUnitUsage?.activeChildren ?? 0} active price {selectedUnitUsage?.activeChildren === 1 ? 'index' : 'indices'}
                  {' '}and {selectedUnitUsage?.totalChildren ?? 0} total price {selectedUnitUsage?.totalChildren === 1 ? 'index' : 'indices'}.
                </p>
                {selectedUnit.is_active && (selectedUnitUsage?.activeChildren ?? 0) > 0 && (
                  <p className="field-error">Deactivate is blocked while active price indices still reference this unit.</p>
                )}
              </div>
            )}

            <form className="stack-form" onSubmit={handleSaveUnit}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={unitForm.code} onChange={(event) => setUnitForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={unitFormMode === 'edit' || savingReference} />
                  {unitFieldErrors.code && <small className="field-error">{unitFieldErrors.code}</small>}
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
                  {unitFieldErrors.name && <small className="field-error">{unitFieldErrors.name}</small>}
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Commodity Class</span>
                  <select className="control" value={unitForm.commodity_class} onChange={(event) => setUnitForm((current) => ({ ...current, commodity_class: event.target.value }))} disabled={savingReference}>
                  {commodityClassOrder.map((commodityClass) => (
                    <option key={commodityClass} value={commodityClass}>
                      {formatCommodityClass(commodityClass)}
                    </option>
                  ))}
                </select>
                {unitFieldErrors.commodity_class && <small className="field-error">{unitFieldErrors.commodity_class}</small>}
              </label>
              <label className="field">
                <span>Dimension</span>
                <select className="control" value={unitForm.dimension} onChange={(event) => setUnitForm((current) => ({ ...current, dimension: event.target.value }))} disabled={savingReference}>
                    {['VOLUME', 'MASS', 'ENERGY', 'POWER'].map((dimension) => (
                      <option key={dimension} value={dimension}>
                        {dimension}
                      </option>
                    ))}
                  </select>
                  {unitFieldErrors.dimension && <small className="field-error">{unitFieldErrors.dimension}</small>}
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Base Unit Code</span>
                  <input className="control" value={unitForm.base_unit_code} onChange={(event) => setUnitForm((current) => ({ ...current, base_unit_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Conversion Factor</span>
                  <input className="control" inputMode="decimal" value={unitForm.conversion_factor} onChange={(event) => setUnitForm((current) => ({ ...current, conversion_factor: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Precision</span>
                <input className="control" inputMode="numeric" value={unitForm.precision} onChange={(event) => setUnitForm((current) => ({ ...current, precision: event.target.value }))} disabled={savingReference} />
                {unitFieldErrors.precision && <small className="field-error">{unitFieldErrors.precision}</small>}
              </label>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={unitForm.description} onChange={(event) => setUnitForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
              </label>

              <button
                type="submit"
                className="button button-primary"
                disabled={
                  savingReference ||
                  Boolean(
                    unitFieldErrors.code ||
                    unitFieldErrors.name ||
                    unitFieldErrors.commodity_class ||
                    unitFieldErrors.dimension ||
                    unitFieldErrors.precision
                  ) ||
                  !unitFormDirty
                }
              >
                {savingReference ? 'Saving...' : unitFormMode === 'create' ? 'Create Unit' : 'Save Changes'}
              </button>
            </form>

            {selectedUnit && unitFormMode === 'edit' && (
              <div className="detail-list">
                <div className="detail-row">
                  <span>Status</span>
                  <strong>{selectedUnit.is_active ? 'Active' : 'Inactive'}</strong>
                </div>
                <div className="detail-row">
                  <span>Dimension</span>
                  <strong>{selectedUnit.dimension}</strong>
                </div>
                <div className="detail-row">
                  <span>Precision</span>
                  <strong>{selectedUnit.precision}</strong>
                </div>
                <div className="detail-row">
                  <span>Updated</span>
                  <strong>{formatDate(selectedUnit.updated_at)}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {referenceTab === 'locations' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreateLocation}>
                New Location
              </button>
              {selectedLocation && (
                <button type="button" className="button button-ghost" onClick={() => handleToggleLocation(selectedLocation)} disabled={savingReference}>
                  {selectedLocation.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            {selectedLocation && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Usage</strong>
                  <span className={`editor-state-pill ${locationFormDirty ? 'is-dirty' : 'is-clean'}`}>
                    {locationFormDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
                <p>
                  Referenced by {selectedLocationUsage?.activeChildren ?? 0} active price {selectedLocationUsage?.activeChildren === 1 ? 'index' : 'indices'}
                  {' '}and {selectedLocationUsage?.totalChildren ?? 0} total price {selectedLocationUsage?.totalChildren === 1 ? 'index' : 'indices'}.
                </p>
                {selectedLocation.is_active && (selectedLocationUsage?.activeChildren ?? 0) > 0 && (
                  <p className="field-error">Deactivate is blocked while active price indices still reference this location.</p>
                )}
              </div>
            )}

            <form className="stack-form" onSubmit={handleSaveLocation}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={locationForm.code} onChange={(event) => setLocationForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={locationFormMode === 'edit' || savingReference} />
                  {locationFieldErrors.code && <small className="field-error">{locationFieldErrors.code}</small>}
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
                  {locationFieldErrors.name && <small className="field-error">{locationFieldErrors.name}</small>}
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Location Type</span>
                  <input className="control" value={locationForm.location_type} onChange={(event) => setLocationForm((current) => ({ ...current, location_type: event.target.value.toUpperCase() }))} disabled={savingReference} />
                  {locationFieldErrors.location_type && <small className="field-error">{locationFieldErrors.location_type}</small>}
                </label>
                <label className="field">
                  <span>Market</span>
                  <input className="control" value={locationForm.market} onChange={(event) => setLocationForm((current) => ({ ...current, market: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Country</span>
                  <input className="control" value={locationForm.country_code} onChange={(event) => setLocationForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Region</span>
                  <input className="control" value={locationForm.region} onChange={(event) => setLocationForm((current) => ({ ...current, region: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Timezone</span>
                <input className="control" value={locationForm.timezone} onChange={(event) => setLocationForm((current) => ({ ...current, timezone: event.target.value }))} disabled={savingReference} />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={locationForm.description} onChange={(event) => setLocationForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
              </label>

              <button
                type="submit"
                className="button button-primary"
                disabled={savingReference || Boolean(locationFieldErrors.code || locationFieldErrors.name || locationFieldErrors.location_type) || !locationFormDirty}
              >
                {savingReference ? 'Saving...' : locationFormMode === 'create' ? 'Create Location' : 'Save Changes'}
              </button>
            </form>

            {selectedLocation && locationFormMode === 'edit' && (
              <div className="detail-list">
                <div className="detail-row">
                  <span>Status</span>
                  <strong>{selectedLocation.is_active ? 'Active' : 'Inactive'}</strong>
                </div>
                <div className="detail-row">
                  <span>Type</span>
                  <strong>{selectedLocation.location_type}</strong>
                </div>
                <div className="detail-row">
                  <span>Market</span>
                  <strong>{selectedLocation.market ?? '—'}</strong>
                </div>
                <div className="detail-row">
                  <span>Updated</span>
                  <strong>{formatDate(selectedLocation.updated_at)}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {referenceTab === 'counterparties' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreateCounterparty}>
                New Counterparty
              </button>
              {selectedCounterparty && (
                <button type="button" className="button button-ghost" onClick={() => handleToggleCounterparty(selectedCounterparty)} disabled={savingReference}>
                  {selectedCounterparty.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            <form className="stack-form" onSubmit={handleSaveCounterparty}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={counterpartyForm.code} onChange={(event) => setCounterpartyForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={counterpartyFormMode === 'edit' || savingReference} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={counterpartyForm.name} onChange={(event) => setCounterpartyForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Short Name</span>
                  <input className="control" value={counterpartyForm.short_name} onChange={(event) => setCounterpartyForm((current) => ({ ...current, short_name: event.target.value }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Type</span>
                  <input className="control" value={counterpartyForm.counterparty_type} onChange={(event) => setCounterpartyForm((current) => ({ ...current, counterparty_type: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Legal Entity Name</span>
                <input className="control" value={counterpartyForm.legal_entity_name} onChange={(event) => setCounterpartyForm((current) => ({ ...current, legal_entity_name: event.target.value }))} disabled={savingReference} />
              </label>

              <label className="field">
                <span>Country</span>
                <input className="control" value={counterpartyForm.country_code} onChange={(event) => setCounterpartyForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={counterpartyForm.description} onChange={(event) => setCounterpartyForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
              </label>

              <button type="submit" className="button button-primary" disabled={savingReference}>
                {savingReference ? 'Saving...' : counterpartyFormMode === 'create' ? 'Create Counterparty' : 'Save Changes'}
              </button>
            </form>

            {selectedCounterparty && counterpartyFormMode === 'edit' && (
              <div className="detail-list">
                <div className="detail-row">
                  <span>Status</span>
                  <strong>{selectedCounterparty.is_active ? 'Active' : 'Inactive'}</strong>
                </div>
                <div className="detail-row">
                  <span>Type</span>
                  <strong>{selectedCounterparty.counterparty_type}</strong>
                </div>
                <div className="detail-row">
                  <span>Country</span>
                  <strong>{selectedCounterparty.country_code ?? '—'}</strong>
                </div>
                <div className="detail-row">
                  <span>Updated</span>
                  <strong>{formatDate(selectedCounterparty.updated_at)}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {referenceTab === 'portfolios' && (
          <div className="stack">
            <div className="toolbar">
              <button type="button" className="button button-secondary" onClick={startCreatePortfolio}>
                New Portfolio
              </button>
              {selectedPortfolio && (
                <button type="button" className="button button-ghost" onClick={() => handleTogglePortfolio(selectedPortfolio)} disabled={savingReference}>
                  {selectedPortfolio.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>

            <form className="stack-form" onSubmit={handleSavePortfolio}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={portfolioForm.code} onChange={(event) => setPortfolioForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={portfolioFormMode === 'edit' || savingReference} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={portfolioForm.name} onChange={(event) => setPortfolioForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Book</span>
                <select className="control" value={portfolioForm.book_code} onChange={(event) => setPortfolioForm((current) => ({ ...current, book_code: event.target.value }))} disabled={savingReference || activeBooks.length === 0}>
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
                  <input className="control" value={portfolioForm.owner} onChange={(event) => setPortfolioForm((current) => ({ ...current, owner: event.target.value }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Strategy</span>
                  <input className="control" value={portfolioForm.strategy} onChange={(event) => setPortfolioForm((current) => ({ ...current, strategy: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={portfolioForm.description} onChange={(event) => setPortfolioForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
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
        )}
      </aside>
    </div>
  )
}
