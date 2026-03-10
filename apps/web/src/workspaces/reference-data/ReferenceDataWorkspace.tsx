import type { Dispatch, SetStateAction } from 'react'

type ReferenceTab = 'books' | 'commodities' | 'price-indices' | 'currencies' | 'units' | 'locations'

type ReferenceRecord = {
  code: string
  name: string
  description?: string | null
  is_active: boolean
  updated_at?: string
  version?: number
  commodity_class?: string
}

type PriceIndexRecord = ReferenceRecord & {
  commodity_code: string
  currency_code: string
  unit_code: string
  provider: string
  market?: string | null
  location_code?: string | null
  calendar_code?: string | null
}

type CurrencyRecord = ReferenceRecord & {
  symbol?: string | null
}

type UnitRecord = ReferenceRecord & {
  commodity_class?: string | null
  dimension: string
  base_unit_code?: string | null
  conversion_factor?: number | null
  precision: number
}

type LocationRecord = ReferenceRecord & {
  location_type: string
  market?: string | null
  country_code?: string | null
  region?: string | null
  timezone?: string | null
}

type BookForm = {
  code: string
  name: string
  description: string
}

type CommodityForm = {
  code: string
  name: string
  description: string
  commodity_class: string
}

type PriceIndexForm = {
  code: string
  name: string
  description: string
  commodity_code: string
  currency_code: string
  unit_code: string
  provider: string
  market: string
  location_code: string
  calendar_code: string
}

type CurrencyForm = {
  code: string
  name: string
  symbol: string
  description: string
}

type UnitForm = {
  code: string
  name: string
  commodity_class: string
  dimension: string
  base_unit_code: string
  conversion_factor: string
  precision: string
  description: string
}

type LocationForm = {
  code: string
  name: string
  location_type: string
  market: string
  country_code: string
  region: string
  timezone: string
  description: string
}

type ReferenceDataWorkspaceProps = {
  referenceTab: ReferenceTab
  setReferenceTab: (tab: ReferenceTab) => void
  referenceSearch: string
  setReferenceSearch: (value: string) => void
  filteredBooks: ReferenceRecord[]
  selectedBookCode: string | null
  startEditBook: (code: string) => void
  referenceCommodityGroups: Array<{ commodityClass: string; items: ReferenceRecord[] }>
  selectedCommodityCode: string | null
  startEditCommodity: (code: string) => void
  filteredPriceIndices: PriceIndexRecord[]
  selectedPriceIndexCode: string | null
  startEditPriceIndex: (code: string) => void
  filteredCurrencies: CurrencyRecord[]
  selectedCurrencyCode: string | null
  startEditCurrency: (code: string) => void
  filteredUnits: UnitRecord[]
  selectedUnitCode: string | null
  startEditUnit: (code: string) => void
  filteredLocations: LocationRecord[]
  selectedLocationCode: string | null
  startEditLocation: (code: string) => void
  referenceActionError: string
  referenceActionSuccess: string
  savingReference: boolean
  selectedBook: ReferenceRecord | null
  bookFormMode: 'create' | 'edit'
  bookForm: BookForm
  setBookForm: Dispatch<SetStateAction<BookForm>>
  startCreateBook: () => void
  handleSaveBook: (event: React.FormEvent) => void
  handleToggleBook: (record: ReferenceRecord) => void
  selectedCommodity: ReferenceRecord | null
  commodityFormMode: 'create' | 'edit'
  commodityForm: CommodityForm
  setCommodityForm: Dispatch<SetStateAction<CommodityForm>>
  startCreateCommodity: () => void
  handleSaveCommodity: (event: React.FormEvent) => void
  handleToggleCommodity: (record: ReferenceRecord) => void
  selectedPriceIndex: PriceIndexRecord | null
  priceIndexFormMode: 'create' | 'edit'
  priceIndexForm: PriceIndexForm
  setPriceIndexForm: Dispatch<SetStateAction<PriceIndexForm>>
  startCreatePriceIndex: () => void
  handleSavePriceIndex: (event: React.FormEvent) => void
  handleTogglePriceIndex: (record: PriceIndexRecord) => void
  activeCommodities: ReferenceRecord[]
  activeCurrencies: CurrencyRecord[]
  selectablePriceIndexUnits: UnitRecord[]
  activeLocations: LocationRecord[]
  selectedCurrency: CurrencyRecord | null
  currencyFormMode: 'create' | 'edit'
  currencyForm: CurrencyForm
  setCurrencyForm: Dispatch<SetStateAction<CurrencyForm>>
  startCreateCurrency: () => void
  handleSaveCurrency: (event: React.FormEvent) => void
  handleToggleCurrency: (record: CurrencyRecord) => void
  selectedUnit: UnitRecord | null
  unitFormMode: 'create' | 'edit'
  unitForm: UnitForm
  setUnitForm: Dispatch<SetStateAction<UnitForm>>
  startCreateUnit: () => void
  handleSaveUnit: (event: React.FormEvent) => void
  handleToggleUnit: (record: UnitRecord) => void
  selectedLocation: LocationRecord | null
  locationFormMode: 'create' | 'edit'
  locationForm: LocationForm
  setLocationForm: Dispatch<SetStateAction<LocationForm>>
  startCreateLocation: () => void
  handleSaveLocation: (event: React.FormEvent) => void
  handleToggleLocation: (record: LocationRecord) => void
  commodityClassOrder: readonly string[]
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
}

export function ReferenceDataWorkspace(props: ReferenceDataWorkspaceProps) {
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
    commodityClassOrder,
    formatCommodityClass,
    formatDate,
  } = props

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
                        : 'Location Editor'}
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
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    className="control"
                    value={bookForm.name}
                    onChange={(event) => setBookForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={savingReference}
                  />
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

              <button type="submit" className="button button-primary" disabled={savingReference}>
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
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    className="control"
                    value={commodityForm.name}
                    onChange={(event) => setCommodityForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={savingReference}
                  />
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

              <button type="submit" className="button button-primary" disabled={savingReference}>
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
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    className="control"
                    value={priceIndexForm.name}
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={savingReference}
                  />
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
                </label>
                <label className="field">
                  <span>Provider</span>
                  <input
                    className="control"
                    value={priceIndexForm.provider}
                    onChange={(event) => setPriceIndexForm((current) => ({ ...current, provider: event.target.value }))}
                    disabled={savingReference}
                  />
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
                disabled={savingReference || activeCommodities.length === 0 || activeCurrencies.length === 0 || selectablePriceIndexUnits.length === 0}
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

            <form className="stack-form" onSubmit={handleSaveCurrency}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={currencyForm.code} onChange={(event) => setCurrencyForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={currencyFormMode === 'edit' || savingReference} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={currencyForm.name} onChange={(event) => setCurrencyForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
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

              <button type="submit" className="button button-primary" disabled={savingReference}>
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

            <form className="stack-form" onSubmit={handleSaveUnit}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={unitForm.code} onChange={(event) => setUnitForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={unitFormMode === 'edit' || savingReference} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
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
              </label>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={unitForm.description} onChange={(event) => setUnitForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
              </label>

              <button type="submit" className="button button-primary" disabled={savingReference}>
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

            <form className="stack-form" onSubmit={handleSaveLocation}>
              <div className="mini-grid">
                <label className="field">
                  <span>Code</span>
                  <input className="control" value={locationForm.code} onChange={(event) => setLocationForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={locationFormMode === 'edit' || savingReference} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input className="control" value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Location Type</span>
                  <input className="control" value={locationForm.location_type} onChange={(event) => setLocationForm((current) => ({ ...current, location_type: event.target.value.toUpperCase() }))} disabled={savingReference} />
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

              <button type="submit" className="button button-primary" disabled={savingReference}>
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
      </aside>
    </div>
  )
}
