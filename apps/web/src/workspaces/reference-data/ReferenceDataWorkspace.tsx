import type { ReactNode } from 'react'

import type { useReferenceDataController } from '../../features/reference-data/useReferenceDataController'
import { formatCurrencyAmount, formatDateOnly, formatNumber } from '../../shared/format'
import { DataSheet, type DataSheetColumn } from '../../shared/ui/DataSheet'
import { Tooltip } from '../../shared/ui/Tooltip'

type ReferenceTabKey =
  | 'books'
  | 'commodities'
  | 'price-indices'
  | 'currencies'
  | 'units'
  | 'locations'
  | 'counterparties'
  | 'portfolios'

const REFERENCE_TAB_TOOLTIPS: Record<ReferenceTabKey, string> = {
  books: 'Books are the trading containers used to validate and allocate captured trades.',
  commodities: 'Commodity masters define the tradable products and their class-level grouping.',
  'price-indices': 'Price indices support market-linked pricing and settlement references.',
  currencies: 'Currencies back monetary price index metadata and trade pricing outputs.',
  units: 'Units define the quantity systems used across commodities and price indices.',
  locations: 'Locations store market or delivery points used by pricing and logistics models.',
  counterparties: 'Counterparties identify external firms available for commercial activity.',
  portfolios: 'Portfolios group trades for reporting, operations, and downstream risk views.',
}

function ReferenceTabButton({
  label,
  active,
  tooltip,
  onClick,
}: {
  label: string
  active: boolean
  tooltip: string
  onClick: () => void
}) {
  return (
    <Tooltip content={tooltip} placement="bottom">
      <button type="button" className={`tab-pill ${active ? 'is-active' : ''}`} onClick={onClick}>
        {label}
      </button>
    </Tooltip>
  )
}

function ReferenceStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Tooltip
      content={
        isActive
          ? 'Active records are available to operators and validation rules throughout the product.'
          : 'Inactive records remain in history but should not be available for new operational choices.'
      }
    >
      <span className={`reference-status ${isActive ? 'is-active' : 'is-inactive'} tooltip-trigger-hint`}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </Tooltip>
  )
}

function EditorStateBadge({ isDirty }: { isDirty: boolean }) {
  return (
    <Tooltip
      content={
        isDirty
          ? 'You have local edits that differ from the saved reference record.'
          : 'The form currently matches the saved reference record.'
      }
      focusable
    >
      <span className={`editor-state-pill ${isDirty ? 'is-dirty' : 'is-clean'} tooltip-trigger-hint`}>
        {isDirty ? 'Unsaved changes' : 'Saved'}
      </span>
    </Tooltip>
  )
}

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
    bookSheetRows,
    bookSheetDirtyCount,
    bookSheetInvalidCount,
    bookPasteInput,
    setBookPasteInput,
    bookPasteSummary,
    selectedBookCode,
    startEditBook,
    updateBookSheetField,
    stageBooksFromPaste,
    clearBookPasteState,
    applyBookSheetChanges,
    resetBookSheetRow,
    resetAllBookSheetChanges,
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
    locationStandards,
    counterpartyStandards,
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
    counterpartyCreditProfileForm,
    setCounterpartyCreditProfileForm,
    startCreateCounterparty,
    handleSaveCounterparty,
    handleToggleCounterparty,
    handleSaveCounterpartyCreditProfile,
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
    counterpartyCreditProfileFieldErrors,
    bookFormDirty,
    commodityFormDirty,
    priceIndexFormDirty,
    currencyFormDirty,
    unitFormDirty,
    locationFormDirty,
    counterpartyCreditProfileDirty,
    commodityClassOrder,
    counterpartyCreditReportByCode,
    selectedCounterpartyCreditReport,
    selectedCounterpartyExternalCreditSnapshots,
  } = controller

  const commoditySheetRows = referenceCommodityGroups.flatMap((group) => group.items)
  const selectedBookSheetRow = bookSheetRows.find((row) => row.code === selectedBookCode) ?? null
  const normalizedLocationFormCode = locationForm.code.trim().toUpperCase()
  const locationTypeOptions = locationStandards.location_types_by_kind[locationForm.location_kind] ?? []
  const parentLocationOptions = activeLocations
    .filter((location) => location.location_kind === 'REGION' && location.code !== normalizedLocationFormCode)
    .sort((left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code))

  function formatCounterpartyExposure(counterpartyCode: string): string {
    const report = counterpartyCreditReportByCode.get(counterpartyCode)
    if (!report || report.active_trade_count === 0) {
      return '—'
    }
    if (report.exposure_amount == null || !report.exposure_currency_code) {
      return 'Mixed / pending'
    }
    return formatCurrencyAmount(report.exposure_amount, report.exposure_currency_code)
  }

  function formatCounterpartyUtilization(counterpartyCode: string): string {
    const report = counterpartyCreditReportByCode.get(counterpartyCode)
    if (!report || report.limit_utilization_percent == null) {
      return '—'
    }
    return `${formatNumber(report.limit_utilization_percent ?? null, 1)}%`
  }

  function formatCounterpartyIdentifiers(counterparty: {
    lei_code?: string | null
    duns_number?: string | null
    ticker_symbol?: string | null
  }): string {
    const parts: string[] = []
    if (counterparty.lei_code) {
      parts.push(counterparty.lei_code)
    }
    if (counterparty.duns_number) {
      parts.push(`DUNS ${counterparty.duns_number}`)
    }
    if (counterparty.ticker_symbol) {
      parts.push(counterparty.ticker_symbol)
    }
    return parts.join(' · ') || '—'
  }

  const statusColumn = <Row extends { is_active: boolean }>(): DataSheetColumn<Row> => ({
    id: 'status',
    label: 'Status',
    width: '8rem',
    renderCell: (row) => <ReferenceStatusBadge isActive={row.is_active} />,
  })

  let referenceDirectory: ReactNode = null

  switch (referenceTab) {
    case 'books':
      referenceDirectory = (
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
              Paste rows from Excel or Sheets using either a `Code / Name / Description` header row or that column order without headers.
              Unknown codes become staged new books, while existing codes stage as updates.
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
                      <p>{bookPasteSummary.issues.length - 6} additional issue{bookPasteSummary.issues.length - 6 === 1 ? '' : 's'} are hidden from this summary.</p>
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
              statusColumn<(typeof bookSheetRows)[number]>(),
              {
                id: 'draft-state',
                label: 'Draft State',
                width: '11rem',
                renderCell: (book) => (
                  <span className={`entity-chip ${book.sheet_error ? '' : 'entity-chip-soft'}`}>
                    {book.sheet_error ? 'Needs attention' : book.sheet_mode === 'create' ? 'New' : book.sheet_dirty ? 'Staged' : 'Saved'}
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
      break
    case 'commodities':
      referenceDirectory = (
        <DataSheet
          label="Commodities"
          description="Browse commodity masters as a sortable-feeling sheet with class context instead of a stacked card list."
          columns={[
            { id: 'code', label: 'Code', width: '9rem', renderCell: (commodity) => commodity.code },
            { id: 'name', label: 'Name', width: '18rem', renderCell: (commodity) => commodity.name },
            {
              id: 'commodity-class',
              label: 'Class',
              width: '10rem',
              renderCell: (commodity) => formatCommodityClass(commodity.commodity_class ?? ''),
            },
            statusColumn<(typeof commoditySheetRows)[number]>(),
          ]}
          rows={commoditySheetRows}
          getRowId={(commodity) => commodity.code}
          getRowLabel={(commodity) => `${commodity.code} ${commodity.name}`}
          selectedRowId={selectedCommodityCode}
          onSelectRow={(commodity) => startEditCommodity(commodity.code)}
          emptyMessage="No commodities match the current filter."
        />
      )
      break
    case 'price-indices':
      referenceDirectory = (
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
            statusColumn<(typeof filteredPriceIndices)[number]>(),
          ]}
          rows={filteredPriceIndices}
          getRowId={(priceIndex) => priceIndex.code}
          getRowLabel={(priceIndex) => `${priceIndex.code} ${priceIndex.name}`}
          selectedRowId={selectedPriceIndexCode}
          onSelectRow={(priceIndex) => startEditPriceIndex(priceIndex.code)}
          emptyMessage="No price indices match the current filter."
        />
      )
      break
    case 'currencies':
      referenceDirectory = (
        <DataSheet
          label="Currencies"
          description="Use cell focus and row selection to move through supporting monetary reference data at spreadsheet density."
          columns={[
            { id: 'code', label: 'Code', width: '8rem', renderCell: (currency) => currency.code },
            { id: 'name', label: 'Name', width: '16rem', renderCell: (currency) => currency.name },
            { id: 'symbol', label: 'Symbol', width: '8rem', renderCell: (currency) => currency.symbol ?? '—' },
            statusColumn<(typeof filteredCurrencies)[number]>(),
          ]}
          rows={filteredCurrencies}
          getRowId={(currency) => currency.code}
          getRowLabel={(currency) => `${currency.code} ${currency.name}`}
          selectedRowId={selectedCurrencyCode}
          onSelectRow={(currency) => startEditCurrency(currency.code)}
          emptyMessage="No currencies match the current filter."
        />
      )
      break
    case 'units':
      referenceDirectory = (
        <DataSheet
          label="Units"
          description="Inspect unit metadata in a single grid so operators can scan dimensions, class mappings, and precision together."
          columns={[
            { id: 'code', label: 'Code', width: '8rem', renderCell: (unit) => unit.code },
            { id: 'name', label: 'Name', width: '16rem', renderCell: (unit) => unit.name },
            { id: 'dimension', label: 'Dimension', width: '10rem', renderCell: (unit) => unit.dimension },
            {
              id: 'commodity-class',
              label: 'Class',
              width: '10rem',
              renderCell: (unit) => (unit.commodity_class ? formatCommodityClass(unit.commodity_class) : '—'),
            },
            { id: 'precision', label: 'Precision', align: 'end', width: '7rem', renderCell: (unit) => unit.precision },
            statusColumn<(typeof filteredUnits)[number]>(),
          ]}
          rows={filteredUnits}
          getRowId={(unit) => unit.code}
          getRowLabel={(unit) => `${unit.code} ${unit.name}`}
          selectedRowId={selectedUnitCode}
          onSelectRow={(unit) => startEditUnit(unit.code)}
          emptyMessage="No units match the current filter."
        />
      )
      break
    case 'locations':
      referenceDirectory = (
        <DataSheet
          label="Locations"
          description="Scan delivery and market locations in a grid first, then use the editor for governed changes and audit details."
          columns={[
            { id: 'code', label: 'Code', width: '10rem', renderCell: (location) => location.code },
            { id: 'name', label: 'Name', width: '18rem', renderCell: (location) => location.name },
            { id: 'kind', label: 'Kind', width: '8rem', renderCell: (location) => location.location_kind },
            { id: 'type', label: 'Type', width: '9rem', renderCell: (location) => location.location_type },
            { id: 'market', label: 'Market', width: '10rem', renderCell: (location) => location.market ?? '—' },
            { id: 'parent', label: 'Parent', width: '10rem', renderCell: (location) => location.parent_location_code ?? '—' },
            { id: 'region', label: 'Region', width: '10rem', renderCell: (location) => location.region ?? '—' },
            statusColumn<(typeof filteredLocations)[number]>(),
          ]}
          rows={filteredLocations}
          getRowId={(location) => location.code}
          getRowLabel={(location) => `${location.code} ${location.name}`}
          selectedRowId={selectedLocationCode}
          onSelectRow={(location) => startEditLocation(location.code)}
          emptyMessage="No locations match the current filter."
        />
      )
      break
    case 'counterparties':
      referenceDirectory = (
        <DataSheet
          label="Counterparties"
          description="Browse commercial party records and credit posture in a compact sheet while keeping activation and maintenance controls in the side panel."
          columns={[
            { id: 'code', label: 'Code', width: '10rem', renderCell: (counterparty) => counterparty.code },
            { id: 'name', label: 'Name', width: '18rem', renderCell: (counterparty) => counterparty.name },
            { id: 'type', label: 'Type', width: '10rem', renderCell: (counterparty) => counterparty.counterparty_type },
            { id: 'country', label: 'Country', width: '8rem', renderCell: (counterparty) => counterparty.country_code ?? '—' },
            {
              id: 'credit',
              label: 'Credit',
              width: '10rem',
              renderCell: (counterparty) =>
                counterparty.credit_status ?? counterpartyStandards.default_counterparty_credit_status,
            },
            {
              id: 'exposure',
              label: 'Exposure',
              width: '12rem',
              renderCell: (counterparty) => formatCounterpartyExposure(counterparty.code),
            },
            {
              id: 'utilization',
              label: 'Utilization',
              width: '9rem',
              renderCell: (counterparty) => formatCounterpartyUtilization(counterparty.code),
            },
            statusColumn<(typeof filteredCounterparties)[number]>(),
          ]}
          rows={filteredCounterparties}
          getRowId={(counterparty) => counterparty.code}
          getRowLabel={(counterparty) => `${counterparty.code} ${counterparty.name}`}
          selectedRowId={selectedCounterpartyCode}
          onSelectRow={(counterparty) => startEditCounterparty(counterparty.code)}
          emptyMessage="No counterparties match the current filter."
        />
      )
      break
    case 'portfolios':
      referenceDirectory = (
        <DataSheet
          label="Portfolios"
          description="Use the sheet to scan portfolio ownership context before making controlled updates in the editor."
          columns={[
            { id: 'code', label: 'Code', width: '10rem', renderCell: (portfolio) => portfolio.code },
            { id: 'name', label: 'Name', width: '18rem', renderCell: (portfolio) => portfolio.name },
            { id: 'book', label: 'Book', width: '8rem', renderCell: (portfolio) => portfolio.book_code },
            { id: 'strategy', label: 'Strategy', width: '12rem', renderCell: (portfolio) => portfolio.strategy ?? '—' },
            statusColumn<(typeof filteredPortfolios)[number]>(),
          ]}
          rows={filteredPortfolios}
          getRowId={(portfolio) => portfolio.code}
          getRowLabel={(portfolio) => `${portfolio.code} ${portfolio.name}`}
          selectedRowId={selectedPortfolioCode}
          onSelectRow={(portfolio) => startEditPortfolio(portfolio.code)}
          emptyMessage="No portfolios match the current filter."
        />
      )
      break
  }

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
            {referenceTab === 'books' && (
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
            )}
          </div>
        </div>

        <div className="tab-row">
          <ReferenceTabButton label="Books" active={referenceTab === 'books'} tooltip={REFERENCE_TAB_TOOLTIPS.books} onClick={() => setReferenceTab('books')} />
          <ReferenceTabButton label="Commodities" active={referenceTab === 'commodities'} tooltip={REFERENCE_TAB_TOOLTIPS.commodities} onClick={() => setReferenceTab('commodities')} />
          <ReferenceTabButton label="Price Indices" active={referenceTab === 'price-indices'} tooltip={REFERENCE_TAB_TOOLTIPS['price-indices']} onClick={() => setReferenceTab('price-indices')} />
          <ReferenceTabButton label="Currencies" active={referenceTab === 'currencies'} tooltip={REFERENCE_TAB_TOOLTIPS.currencies} onClick={() => setReferenceTab('currencies')} />
          <ReferenceTabButton label="Units" active={referenceTab === 'units'} tooltip={REFERENCE_TAB_TOOLTIPS.units} onClick={() => setReferenceTab('units')} />
          <ReferenceTabButton label="Locations" active={referenceTab === 'locations'} tooltip={REFERENCE_TAB_TOOLTIPS.locations} onClick={() => setReferenceTab('locations')} />
          <ReferenceTabButton label="Counterparties" active={referenceTab === 'counterparties'} tooltip={REFERENCE_TAB_TOOLTIPS.counterparties} onClick={() => setReferenceTab('counterparties')} />
          <ReferenceTabButton label="Portfolios" active={referenceTab === 'portfolios'} tooltip={REFERENCE_TAB_TOOLTIPS.portfolios} onClick={() => setReferenceTab('portfolios')} />
        </div>

        {referenceDirectory}
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
                  <EditorStateBadge isDirty={bookFormDirty} />
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
                  <EditorStateBadge isDirty={commodityFormDirty} />
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
                  <EditorStateBadge isDirty={priceIndexFormDirty} />
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
                  <EditorStateBadge isDirty={currencyFormDirty} />
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
                  <EditorStateBadge isDirty={unitFormDirty} />
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
                  <EditorStateBadge isDirty={locationFormDirty} />
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
                  <span>Location Kind</span>
                  <select
                    className="control"
                    value={locationForm.location_kind}
                    onChange={(event) => {
                      const nextLocationKind = event.target.value
                      const nextLocationTypes = locationStandards.location_types_by_kind[nextLocationKind] ?? []
                      const fallbackLocationType =
                        locationStandards.default_location_type_by_kind[nextLocationKind] ??
                        nextLocationTypes[0] ??
                        ''
                      setLocationForm((current) => ({
                        ...current,
                        location_kind: nextLocationKind,
                        location_type: nextLocationTypes.includes(current.location_type)
                          ? current.location_type
                          : fallbackLocationType,
                      }))
                    }}
                    disabled={savingReference}
                  >
                    {locationStandards.location_kinds.map((locationKind) => (
                      <option key={locationKind} value={locationKind}>
                        {locationKind}
                      </option>
                    ))}
                  </select>
                  {locationFieldErrors.location_kind && <small className="field-error">{locationFieldErrors.location_kind}</small>}
                </label>
                <label className="field">
                  <span>Location Type</span>
                  <select
                    className="control"
                    value={locationForm.location_type}
                    onChange={(event) => setLocationForm((current) => ({ ...current, location_type: event.target.value }))}
                    disabled={savingReference}
                  >
                    {locationTypeOptions.map((locationType) => (
                      <option key={locationType} value={locationType}>
                        {locationType}
                      </option>
                    ))}
                  </select>
                  {locationFieldErrors.location_type && <small className="field-error">{locationFieldErrors.location_type}</small>}
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Parent Location Code</span>
                  <select
                    className="control"
                    value={locationForm.parent_location_code}
                    onChange={(event) => setLocationForm((current) => ({ ...current, parent_location_code: event.target.value }))}
                    disabled={savingReference}
                  >
                    <option value="">None</option>
                    {parentLocationOptions.map((location) => (
                      <option key={location.code} value={location.code}>
                        {location.code} - {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Market</span>
                  <select
                    className="control"
                    value={locationForm.market}
                    onChange={(event) => setLocationForm((current) => ({ ...current, market: event.target.value }))}
                    disabled={savingReference}
                  >
                    <option value="">None</option>
                    {locationStandards.market_codes.map((marketCode) => (
                      <option key={marketCode} value={marketCode}>
                        {marketCode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>City</span>
                  <input className="control" value={locationForm.city} onChange={(event) => setLocationForm((current) => ({ ...current, city: event.target.value }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Subdivision Code</span>
                  <input className="control" value={locationForm.subdivision_code} onChange={(event) => setLocationForm((current) => ({ ...current, subdivision_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Country Code</span>
                  <input className="control" value={locationForm.country_code} onChange={(event) => setLocationForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Continent Code</span>
                  <select
                    className="control"
                    value={locationForm.continent_code}
                    onChange={(event) => setLocationForm((current) => ({ ...current, continent_code: event.target.value }))}
                    disabled={savingReference}
                  >
                    <option value="">None</option>
                    {locationStandards.continent_codes.map((continentCode) => (
                      <option key={continentCode} value={continentCode}>
                        {continentCode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>Latitude</span>
                  <input className="control" value={locationForm.latitude} onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Longitude</span>
                  <input className="control" value={locationForm.longitude} onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))} disabled={savingReference} />
                </label>
              </div>
              {locationFieldErrors.coordinates && <small className="field-error">{locationFieldErrors.coordinates}</small>}

              <div className="mini-grid">
                <label className="field">
                  <span>Region</span>
                  <input className="control" value={locationForm.region} onChange={(event) => setLocationForm((current) => ({ ...current, region: event.target.value }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input className="control" value={locationForm.timezone} onChange={(event) => setLocationForm((current) => ({ ...current, timezone: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea className="control control-textarea" value={locationForm.description} onChange={(event) => setLocationForm((current) => ({ ...current, description: event.target.value }))} disabled={savingReference} />
              </label>

              <button
                type="submit"
                className="button button-primary"
                disabled={savingReference || Boolean(locationFieldErrors.code || locationFieldErrors.name || locationFieldErrors.location_kind || locationFieldErrors.location_type || locationFieldErrors.coordinates) || !locationFormDirty}
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
                  <span>Kind</span>
                  <strong>{selectedLocation.location_kind}</strong>
                </div>
                <div className="detail-row">
                  <span>Type</span>
                  <strong>{selectedLocation.location_type}</strong>
                </div>
                <div className="detail-row">
                  <span>Parent</span>
                  <strong>{selectedLocation.parent_location_code ?? '—'}</strong>
                </div>
                <div className="detail-row">
                  <span>Market</span>
                  <strong>{selectedLocation.market ?? '—'}</strong>
                </div>
                <div className="detail-row">
                  <span>Geography</span>
                  <strong>
                    {selectedLocation.city ?? '—'}
                    {selectedLocation.subdivision_code ? ` • ${selectedLocation.subdivision_code}` : ''}
                    {selectedLocation.country_code ? ` • ${selectedLocation.country_code}` : ''}
                    {selectedLocation.continent_code ? ` • ${selectedLocation.continent_code}` : ''}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Coordinates</span>
                  <strong>
                    {selectedLocation.latitude != null && selectedLocation.longitude != null
                      ? `${selectedLocation.latitude}, ${selectedLocation.longitude}`
                      : '—'}
                  </strong>
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
                  <select
                    className="control"
                    value={counterpartyForm.counterparty_type}
                    onChange={(event) => setCounterpartyForm((current) => ({ ...current, counterparty_type: event.target.value }))}
                    disabled={savingReference}
                  >
                    {counterpartyStandards.counterparty_types.map((counterpartyType) => (
                      <option key={counterpartyType} value={counterpartyType}>
                        {counterpartyType}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Legal Entity Name</span>
                <input className="control" value={counterpartyForm.legal_entity_name} onChange={(event) => setCounterpartyForm((current) => ({ ...current, legal_entity_name: event.target.value }))} disabled={savingReference} />
              </label>

              <div className="mini-grid">
                <label className="field">
                  <span>Country Code</span>
                  <input className="control" value={counterpartyForm.country_code} onChange={(event) => setCounterpartyForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>Ticker</span>
                  <input className="control" value={counterpartyForm.ticker_symbol} onChange={(event) => setCounterpartyForm((current) => ({ ...current, ticker_symbol: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
              </div>

              <div className="mini-grid">
                <label className="field">
                  <span>LEI</span>
                  <input className="control" value={counterpartyForm.lei_code} onChange={(event) => setCounterpartyForm((current) => ({ ...current, lei_code: event.target.value.toUpperCase() }))} disabled={savingReference} />
                </label>
                <label className="field">
                  <span>DUNS</span>
                  <input className="control" value={counterpartyForm.duns_number} onChange={(event) => setCounterpartyForm((current) => ({ ...current, duns_number: event.target.value }))} disabled={savingReference} />
                </label>
              </div>

              <label className="field">
                <span>Credit Status</span>
                <select
                  className="control"
                  value={counterpartyForm.credit_status}
                  onChange={(event) => setCounterpartyForm((current) => ({ ...current, credit_status: event.target.value }))}
                  disabled={savingReference}
                >
                  {counterpartyStandards.counterparty_credit_statuses.map((creditStatus) => (
                    <option key={creditStatus} value={creditStatus}>
                      {creditStatus}
                    </option>
                  ))}
                </select>
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
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>Live Credit View</strong>
                  <EditorStateBadge isDirty={counterpartyCreditProfileDirty} />
                </div>
                {selectedCounterpartyCreditReport ? (
                  <>
                    <p>
                      Exposure is{' '}
                      {selectedCounterpartyCreditReport.exposure_amount != null && selectedCounterpartyCreditReport.exposure_currency_code
                        ? formatCurrencyAmount(
                            selectedCounterpartyCreditReport.exposure_amount,
                            selectedCounterpartyCreditReport.exposure_currency_code,
                          )
                        : selectedCounterpartyCreditReport.active_trade_count > 0
                          ? 'not directly comparable yet'
                          : 'not currently carrying active trades'}
                      {' '}across {selectedCounterpartyCreditReport.active_trade_count} active trade
                      {selectedCounterpartyCreditReport.active_trade_count === 1 ? '' : 's'}.
                    </p>
                    {selectedCounterpartyCreditReport.limit_amount != null && selectedCounterpartyCreditReport.limit_currency_code ? (
                      <p>
                        Limit is {formatCurrencyAmount(selectedCounterpartyCreditReport.limit_amount, selectedCounterpartyCreditReport.limit_currency_code)}
                        {' '}at {formatNumber(selectedCounterpartyCreditReport.limit_utilization_percent ?? null, 1)}% utilization.
                      </p>
                    ) : (
                      <p>No counterparty limit is set yet.</p>
                    )}
                    {selectedCounterpartyCreditReport.out_of_scope_trade_count > 0 && (
                      <p className="field-error">
                        {selectedCounterpartyCreditReport.out_of_scope_trade_count} active trade
                        {selectedCounterpartyCreditReport.out_of_scope_trade_count === 1 ? '' : 's'} sit outside the tracked exposure currency.
                      </p>
                    )}
                    {selectedCounterpartyCreditReport.unpriced_trade_count > 0 && (
                      <p className="field-error">
                        {selectedCounterpartyCreditReport.unpriced_trade_count} active trade
                        {selectedCounterpartyCreditReport.unpriced_trade_count === 1 ? '' : 's'} are missing price or volume and are excluded from exposure.
                      </p>
                    )}
                    {selectedCounterpartyCreditReport.limit_breached && (
                      <p className="field-error">Current exposure is above the saved counterparty limit.</p>
                    )}
                    <p className={selectedCounterpartyCreditReport.review_is_due ? 'field-error' : undefined}>
                      Review due: {formatDateOnly(selectedCounterpartyCreditReport.review_due_at)}
                    </p>
                  </>
                ) : (
                  <p>Live counterparty credit metrics will appear here after data loads.</p>
                )}
              </div>
            )}

            {selectedCounterparty && counterpartyFormMode === 'edit' && (
              <div className="reference-usage-card">
                <div className="reference-usage-head">
                  <strong>External Credit Snapshot</strong>
                </div>
                {selectedCounterpartyExternalCreditSnapshots.length > 0 ? (
                  <div className="stack">
                    {selectedCounterpartyExternalCreditSnapshots.map((snapshot) => (
                      <div key={`${snapshot.provider}-${snapshot.id}`} className="detail-list">
                        <div className="detail-row">
                          <span>Provider</span>
                          <strong>{snapshot.provider}</strong>
                        </div>
                        <div className="detail-row">
                          <span>As Of</span>
                          <strong>{formatDateOnly(snapshot.as_of_date)}</strong>
                        </div>
                        <div className="detail-row">
                          <span>Rating</span>
                          <strong>
                            {snapshot.rating_value ?? '—'}
                            {snapshot.rating_outlook ? ` · ${snapshot.rating_outlook}` : ''}
                            {snapshot.rating_scale ? ` · ${snapshot.rating_scale}` : ''}
                          </strong>
                        </div>
                        <div className="detail-row">
                          <span>Score / PD</span>
                          <strong>
                            {snapshot.credit_score != null ? formatNumber(snapshot.credit_score, 2) : '—'}
                            {snapshot.probability_of_default != null
                              ? ` · ${(snapshot.probability_of_default * 100).toFixed(2)}% PD`
                              : ''}
                          </strong>
                        </div>
                        <div className="detail-row">
                          <span>Suggested Limit</span>
                          <strong>
                            {snapshot.recommended_limit_amount != null && snapshot.recommended_limit_currency_code
                              ? formatCurrencyAmount(snapshot.recommended_limit_amount, snapshot.recommended_limit_currency_code)
                              : '—'}
                          </strong>
                        </div>
                        <div className="detail-row">
                          <span>Match</span>
                          <strong>
                            {snapshot.match_basis ?? 'Manual'}
                            {snapshot.matched_identifier_value ? ` · ${snapshot.matched_identifier_value}` : ''}
                          </strong>
                        </div>
                        <div className="detail-row">
                          <span>Imported</span>
                          <strong>{formatDate(snapshot.downloaded_at)}</strong>
                        </div>
                        {snapshot.commentary ? (
                          <div className="detail-row">
                            <span>Notes</span>
                            <strong>{snapshot.commentary}</strong>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>
                    No external credit snapshot is stored yet.
                    {!selectedCounterparty.lei_code && !selectedCounterparty.duns_number && !selectedCounterparty.ticker_symbol
                      ? ' Add an LEI, DUNS number, or ticker first so vendor matching has a stable anchor.'
                      : ' Import a vendor snapshot from the Admin workspace to populate this view.'}
                  </p>
                )}
              </div>
            )}

            {counterpartyFormMode === 'edit' && selectedCounterparty ? (
              <form className="stack-form" onSubmit={handleSaveCounterpartyCreditProfile}>
                <div className="mini-grid">
                  <label className="field">
                    <span>Credit Rating</span>
                    <input
                      className="control"
                      value={counterpartyCreditProfileForm.credit_rating}
                      onChange={(event) =>
                        setCounterpartyCreditProfileForm((current) => ({
                          ...current,
                          credit_rating: event.target.value,
                        }))
                      }
                      disabled={savingReference}
                    />
                  </label>
                  <label className="field">
                    <span>Review Due</span>
                    <input
                      type="date"
                      className="control"
                      value={counterpartyCreditProfileForm.review_due_at}
                      onChange={(event) =>
                        setCounterpartyCreditProfileForm((current) => ({
                          ...current,
                          review_due_at: event.target.value,
                        }))
                      }
                      disabled={savingReference}
                    />
                  </label>
                </div>

                <div className="mini-grid">
                  <label className="field">
                    <span>Limit Currency</span>
                    <select
                      className="control"
                      value={counterpartyCreditProfileForm.limit_currency_code}
                      onChange={(event) =>
                        setCounterpartyCreditProfileForm((current) => ({
                          ...current,
                          limit_currency_code: event.target.value,
                        }))
                      }
                      disabled={savingReference || activeCurrencies.length === 0}
                    >
                      <option value="">No limit</option>
                      {activeCurrencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.code}{currency.symbol ? ` • ${currency.symbol}` : ''}
                        </option>
                      ))}
                    </select>
                    {counterpartyCreditProfileFieldErrors.limit_currency_code && (
                      <small className="field-error">{counterpartyCreditProfileFieldErrors.limit_currency_code}</small>
                    )}
                  </label>
                  <label className="field">
                    <span>Limit Amount</span>
                    <input
                      className="control"
                      inputMode="decimal"
                      value={counterpartyCreditProfileForm.limit_amount}
                      onChange={(event) =>
                        setCounterpartyCreditProfileForm((current) => ({
                          ...current,
                          limit_amount: event.target.value,
                        }))
                      }
                      disabled={savingReference}
                    />
                    {counterpartyCreditProfileFieldErrors.limit_amount && (
                      <small className="field-error">{counterpartyCreditProfileFieldErrors.limit_amount}</small>
                    )}
                  </label>
                </div>

                <label className="field">
                  <span>Breach Action</span>
                  <select
                    className="control"
                    value={counterpartyCreditProfileForm.breach_action}
                    onChange={(event) =>
                      setCounterpartyCreditProfileForm((current) => ({
                        ...current,
                        breach_action: event.target.value,
                      }))
                    }
                    disabled={savingReference}
                  >
                    {counterpartyStandards.counterparty_credit_breach_actions.map((breachAction) => (
                      <option key={breachAction} value={breachAction}>
                        {breachAction}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Notes</span>
                  <textarea
                    className="control control-textarea"
                    value={counterpartyCreditProfileForm.notes}
                    onChange={(event) =>
                      setCounterpartyCreditProfileForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    disabled={savingReference}
                  />
                </label>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={
                    savingReference ||
                    Boolean(
                      counterpartyCreditProfileFieldErrors.limit_currency_code ||
                      counterpartyCreditProfileFieldErrors.limit_amount,
                    ) ||
                    !counterpartyCreditProfileDirty
                  }
                >
                  {savingReference ? 'Saving...' : 'Save Credit Profile'}
                </button>
              </form>
            ) : (
              <div className="reference-usage-card">
                <p>Save the counterparty first before assigning review dates, limits, or breach handling.</p>
              </div>
            )}

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
                  <span>Identifiers</span>
                  <strong>{formatCounterpartyIdentifiers(selectedCounterparty)}</strong>
                </div>
                <div className="detail-row">
                  <span>Credit Status</span>
                  <strong>{selectedCounterparty.credit_status ?? counterpartyStandards.default_counterparty_credit_status}</strong>
                </div>
                <div className="detail-row">
                  <span>Breach Action</span>
                  <strong>{selectedCounterpartyCreditReport?.breach_action ?? counterpartyStandards.default_counterparty_credit_breach_action}</strong>
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
