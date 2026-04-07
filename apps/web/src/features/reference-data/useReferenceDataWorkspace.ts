import { useMemo, useState } from 'react'

import { classForCommodity } from '../../shared/reference'
import type {
  BookForm,
  CommodityForm,
  CounterpartyForm,
  CounterpartyRecord,
  CounterpartyStandards,
  CurrencyForm,
  CurrencyRecord,
  LocationForm,
  LocationRecord,
  LocationStandards,
  PortfolioForm,
  PortfolioRecord,
  PriceIndexForm,
  PriceIndexRecord,
  ReferenceRecord,
  ReferenceTab,
  UnitForm,
  UnitRecord,
} from '../../shared/models'
import {
  DEFAULT_COUNTERPARTY_STANDARDS as defaultCounterpartyStandards,
  DEFAULT_LOCATION_STANDARDS as defaultLocationStandards,
} from '../../shared/models'

export function emptyBookForm(): BookForm {
  return { code: '', name: '', description: '' }
}

export function emptyCommodityForm(defaultClass: string): CommodityForm {
  return { code: '', name: '', description: '', commodity_class: defaultClass }
}

export function emptyPriceIndexForm(defaultCommodityCode = ''): PriceIndexForm {
  return {
    code: '',
    name: '',
    description: '',
    commodity_code: defaultCommodityCode,
    currency_code: 'USD',
    unit_code: 'BBL',
    provider: '',
    market: '',
    location_code: '',
    calendar_code: '',
  }
}

export function emptyCurrencyForm(): CurrencyForm {
  return { code: '', name: '', symbol: '', description: '' }
}

export function emptyUnitForm(defaultCommodityClass: string): UnitForm {
  return {
    code: '',
    name: '',
    commodity_class: defaultCommodityClass,
    dimension: 'VOLUME',
    base_unit_code: '',
    conversion_factor: '',
    precision: '3',
    description: '',
  }
}

export function emptyLocationForm(locationStandards: LocationStandards = defaultLocationStandards): LocationForm {
  const defaultLocationKind = locationStandards.default_location_kind
  const defaultLocationType =
    locationStandards.default_location_type_by_kind[defaultLocationKind] ??
    locationStandards.location_types_by_kind[defaultLocationKind]?.[0] ??
    ''
  return {
    code: '',
    name: '',
    location_kind: defaultLocationKind,
    location_type: defaultLocationType,
    parent_location_code: '',
    market: '',
    city: '',
    subdivision_code: '',
    country_code: '',
    continent_code: '',
    latitude: '',
    longitude: '',
    region: '',
    timezone: '',
    description: '',
  }
}

export function emptyCounterpartyForm(
  counterpartyStandards: CounterpartyStandards = defaultCounterpartyStandards,
): CounterpartyForm {
  return {
    code: '',
    name: '',
    short_name: '',
    legal_entity_name: '',
    counterparty_type: counterpartyStandards.default_counterparty_type,
    country_code: '',
    lei_code: '',
    duns_number: '',
    ticker_symbol: '',
    credit_status: counterpartyStandards.default_counterparty_credit_status,
    description: '',
  }
}

export function emptyPortfolioForm(defaultBookCode = ''): PortfolioForm {
  return {
    code: '',
    name: '',
    book_code: defaultBookCode,
    owner: '',
    strategy: '',
    description: '',
  }
}

export function resolveSelectedCode<T extends { code: string }>(
  selectedCode: string | null,
  records: T[],
  options?: { preserveMissingSelection?: boolean },
): string | null {
  if (selectedCode !== null && (options?.preserveMissingSelection || records.some((record) => record.code === selectedCode))) {
    return selectedCode
  }

  return records[0]?.code ?? null
}

type UseReferenceDataWorkspaceArgs = {
  books: ReferenceRecord[]
  commodities: ReferenceRecord[]
  priceIndices: PriceIndexRecord[]
  currencies: CurrencyRecord[]
  units: UnitRecord[]
  locations: LocationRecord[]
  counterparties: CounterpartyRecord[]
  portfolios: PortfolioRecord[]
  activeBooks: ReferenceRecord[]
  activeCommodities: ReferenceRecord[]
  activeCurrencies: CurrencyRecord[]
  activeUnits: UnitRecord[]
  activeLocations: LocationRecord[]
  locationStandards: LocationStandards
  counterpartyStandards: CounterpartyStandards
  commodityClassOrder: readonly string[]
}

export function useReferenceDataWorkspace({
  books,
  commodities,
  priceIndices,
  currencies,
  units,
  locations,
  counterparties,
  portfolios,
  activeBooks,
  activeCommodities,
  activeCurrencies,
  activeUnits,
  activeLocations,
  locationStandards,
  counterpartyStandards,
  commodityClassOrder,
}: UseReferenceDataWorkspaceArgs) {
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>('books')
  const [referenceSearch, setReferenceSearch] = useState('')
  const [selectedBookCode, setSelectedBookCode] = useState<string | null>(null)
  const [selectedCommodityCode, setSelectedCommodityCode] = useState<string | null>(null)
  const [selectedPriceIndexCode, setSelectedPriceIndexCode] = useState<string | null>(null)
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string | null>(null)
  const [selectedUnitCode, setSelectedUnitCode] = useState<string | null>(null)
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null)
  const [selectedCounterpartyCode, setSelectedCounterpartyCode] = useState<string | null>(null)
  const [selectedPortfolioCode, setSelectedPortfolioCode] = useState<string | null>(null)

  const [bookForm, setBookForm] = useState(emptyBookForm())
  const [commodityForm, setCommodityForm] = useState(emptyCommodityForm(commodityClassOrder[0]))
  const [priceIndexForm, setPriceIndexForm] = useState(emptyPriceIndexForm())
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm())
  const [unitForm, setUnitForm] = useState(emptyUnitForm(commodityClassOrder[0]))
  const [locationForm, setLocationForm] = useState(emptyLocationForm(locationStandards))
  const [counterpartyForm, setCounterpartyForm] = useState(emptyCounterpartyForm(counterpartyStandards))
  const [portfolioForm, setPortfolioForm] = useState(emptyPortfolioForm())

  const [bookFormMode, setBookFormMode] = useState<'create' | 'edit'>('create')
  const [commodityFormMode, setCommodityFormMode] = useState<'create' | 'edit'>('create')
  const [priceIndexFormMode, setPriceIndexFormMode] = useState<'create' | 'edit'>('create')
  const [currencyFormMode, setCurrencyFormMode] = useState<'create' | 'edit'>('create')
  const [unitFormMode, setUnitFormMode] = useState<'create' | 'edit'>('create')
  const [locationFormMode, setLocationFormMode] = useState<'create' | 'edit'>('create')
  const [counterpartyFormMode, setCounterpartyFormMode] = useState<'create' | 'edit'>('create')
  const [portfolioFormMode, setPortfolioFormMode] = useState<'create' | 'edit'>('create')

  const resolvedSelectedBookCode = resolveSelectedCode(selectedBookCode, books, { preserveMissingSelection: true })
  const resolvedSelectedCommodityCode = resolveSelectedCode(selectedCommodityCode, commodities)
  const resolvedSelectedPriceIndexCode = resolveSelectedCode(selectedPriceIndexCode, priceIndices)
  const resolvedSelectedCurrencyCode = resolveSelectedCode(selectedCurrencyCode, currencies)
  const resolvedSelectedUnitCode = resolveSelectedCode(selectedUnitCode, units)
  const resolvedSelectedLocationCode = resolveSelectedCode(selectedLocationCode, locations)
  const resolvedSelectedCounterpartyCode = resolveSelectedCode(selectedCounterpartyCode, counterparties)
  const resolvedSelectedPortfolioCode = resolveSelectedCode(selectedPortfolioCode, portfolios)

  const selectedBook = useMemo(
    () => books.find((book) => book.code === resolvedSelectedBookCode) ?? null,
    [books, resolvedSelectedBookCode],
  )
  const selectedCommodity = useMemo(
    () => commodities.find((commodity) => commodity.code === resolvedSelectedCommodityCode) ?? null,
    [commodities, resolvedSelectedCommodityCode],
  )
  const selectedPriceIndex = useMemo(
    () => priceIndices.find((priceIndex) => priceIndex.code === resolvedSelectedPriceIndexCode) ?? null,
    [priceIndices, resolvedSelectedPriceIndexCode],
  )
  const selectedCurrency = useMemo(
    () => currencies.find((currency) => currency.code === resolvedSelectedCurrencyCode) ?? null,
    [currencies, resolvedSelectedCurrencyCode],
  )
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.code === resolvedSelectedUnitCode) ?? null,
    [units, resolvedSelectedUnitCode],
  )
  const selectedLocation = useMemo(
    () => locations.find((location) => location.code === resolvedSelectedLocationCode) ?? null,
    [locations, resolvedSelectedLocationCode],
  )
  const selectedCounterparty = useMemo(
    () => counterparties.find((counterparty) => counterparty.code === resolvedSelectedCounterpartyCode) ?? null,
    [counterparties, resolvedSelectedCounterpartyCode],
  )
  const selectedPortfolio = useMemo(
    () => portfolios.find((portfolio) => portfolio.code === resolvedSelectedPortfolioCode) ?? null,
    [portfolios, resolvedSelectedPortfolioCode],
  )

  const filteredBooks = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return books.filter((book) => {
      if (!query) return true
      return (
        book.code.toLowerCase().includes(query) ||
        book.name.toLowerCase().includes(query) ||
        (book.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [books, referenceSearch])

  const referenceCommodityGroups = useMemo(
    () =>
      commodityClassOrder.map((commodityClass) => ({
        commodityClass,
        items: commodities
          .filter((commodity) => commodity.commodity_class === commodityClass)
          .filter((commodity) => {
            const query = referenceSearch.trim().toLowerCase()
            if (!query) return true
            return (
              commodity.code.toLowerCase().includes(query) ||
              commodity.name.toLowerCase().includes(query) ||
              (commodity.description ?? '').toLowerCase().includes(query)
            )
          }),
      })).filter((group) => group.items.length > 0),
    [commodities, commodityClassOrder, referenceSearch],
  )

  const filteredPriceIndices = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return priceIndices.filter((priceIndex) => {
      if (!query) return true
      return (
        priceIndex.code.toLowerCase().includes(query) ||
        priceIndex.name.toLowerCase().includes(query) ||
        priceIndex.provider.toLowerCase().includes(query) ||
        (priceIndex.market ?? '').toLowerCase().includes(query) ||
        priceIndex.commodity_code.toLowerCase().includes(query) ||
        (priceIndex.location_code ?? '').toLowerCase().includes(query) ||
        (priceIndex.calendar_code ?? '').toLowerCase().includes(query) ||
        (priceIndex.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [priceIndices, referenceSearch])

  const filteredCurrencies = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return currencies.filter((currency) => {
      if (!query) return true
      return (
        currency.code.toLowerCase().includes(query) ||
        currency.name.toLowerCase().includes(query) ||
        (currency.symbol ?? '').toLowerCase().includes(query) ||
        (currency.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [currencies, referenceSearch])

  const filteredUnits = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return units.filter((unit) => {
      if (!query) return true
      return (
        unit.code.toLowerCase().includes(query) ||
        unit.name.toLowerCase().includes(query) ||
        unit.dimension.toLowerCase().includes(query) ||
        (unit.commodity_class ?? '').toLowerCase().includes(query) ||
        (unit.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [referenceSearch, units])

  const filteredLocations = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return locations.filter((location) => {
      if (!query) return true
      return (
        location.code.toLowerCase().includes(query) ||
        location.name.toLowerCase().includes(query) ||
        location.location_kind.toLowerCase().includes(query) ||
        location.location_type.toLowerCase().includes(query) ||
        (location.parent_location_code ?? '').toLowerCase().includes(query) ||
        (location.market ?? '').toLowerCase().includes(query) ||
        (location.city ?? '').toLowerCase().includes(query) ||
        (location.subdivision_code ?? '').toLowerCase().includes(query) ||
        (location.country_code ?? '').toLowerCase().includes(query) ||
        (location.continent_code ?? '').toLowerCase().includes(query) ||
        (location.region ?? '').toLowerCase().includes(query) ||
        (location.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [locations, referenceSearch])

  const filteredCounterparties = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return counterparties.filter((counterparty) => {
      if (!query) return true
      return (
        counterparty.code.toLowerCase().includes(query) ||
        counterparty.name.toLowerCase().includes(query) ||
        (counterparty.short_name ?? '').toLowerCase().includes(query) ||
        (counterparty.legal_entity_name ?? '').toLowerCase().includes(query) ||
        counterparty.counterparty_type.toLowerCase().includes(query) ||
        (counterparty.country_code ?? '').toLowerCase().includes(query) ||
        (counterparty.lei_code ?? '').toLowerCase().includes(query) ||
        (counterparty.duns_number ?? '').toLowerCase().includes(query) ||
        (counterparty.ticker_symbol ?? '').toLowerCase().includes(query) ||
        (counterparty.credit_status ?? '').toLowerCase().includes(query) ||
        (counterparty.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [counterparties, referenceSearch])

  const filteredPortfolios = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return portfolios.filter((portfolio) => {
      if (!query) return true
      return (
        portfolio.code.toLowerCase().includes(query) ||
        portfolio.name.toLowerCase().includes(query) ||
        portfolio.book_code.toLowerCase().includes(query) ||
        (portfolio.owner ?? '').toLowerCase().includes(query) ||
        (portfolio.strategy ?? '').toLowerCase().includes(query) ||
        (portfolio.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [portfolios, referenceSearch])

  const resolvedPriceIndexCommodityCode = priceIndexForm.commodity_code || activeCommodities[0]?.code || ''
  const selectablePriceIndexUnits = useMemo(() => {
    if (!resolvedPriceIndexCommodityCode) {
      return activeUnits
    }

    const commodityClass = classForCommodity(commodities, resolvedPriceIndexCommodityCode)
    const matchingUnits = activeUnits.filter((unit) => !unit.commodity_class || unit.commodity_class === commodityClass)
    return matchingUnits.length > 0 ? matchingUnits : activeUnits
  }, [activeUnits, commodities, resolvedPriceIndexCommodityCode])

  const resolvedPriceIndexForm = useMemo(
    () => ({
      ...priceIndexForm,
      commodity_code: resolvedPriceIndexCommodityCode,
      currency_code: activeCurrencies.some((currency) => currency.code === priceIndexForm.currency_code)
        ? priceIndexForm.currency_code
        : activeCurrencies[0]?.code ?? '',
      unit_code: selectablePriceIndexUnits.some((unit) => unit.code === priceIndexForm.unit_code)
        ? priceIndexForm.unit_code
        : selectablePriceIndexUnits[0]?.code ?? '',
      location_code:
        priceIndexForm.location_code && !activeLocations.some((location) => location.code === priceIndexForm.location_code)
          ? ''
          : priceIndexForm.location_code,
    }),
    [activeCurrencies, activeLocations, priceIndexForm, resolvedPriceIndexCommodityCode, selectablePriceIndexUnits],
  )

  const resolvedPortfolioForm = useMemo(
    () => ({
      ...portfolioForm,
      book_code: activeBooks.some((book) => book.code === portfolioForm.book_code)
        ? portfolioForm.book_code
        : activeBooks[0]?.code ?? '',
    }),
    [activeBooks, portfolioForm],
  )

  function startCreateBook() {
    setBookFormMode('create')
    setBookForm(emptyBookForm())
  }

  function startEditBook(code: string) {
    const record = books.find((book) => book.code === code)
    if (!record) {
      return
    }
    setSelectedBookCode(code)
    setBookFormMode('edit')
    setBookForm({ code: record.code, name: record.name, description: record.description ?? '' })
  }

  function startCreateCommodity() {
    setCommodityFormMode('create')
    setCommodityForm(emptyCommodityForm(selectedCommodity?.commodity_class ?? commodityClassOrder[0]))
  }

  function startEditCommodity(code: string) {
    const record = commodities.find((commodity) => commodity.code === code)
    if (!record) {
      return
    }
    setSelectedCommodityCode(code)
    setCommodityFormMode('edit')
    setCommodityForm({
      code: record.code,
      name: record.name,
      description: record.description ?? '',
      commodity_class: record.commodity_class ?? commodityClassOrder[0],
    })
  }

  function startCreatePriceIndex() {
    setPriceIndexFormMode('create')
    setPriceIndexForm(emptyPriceIndexForm(activeCommodities[0]?.code ?? ''))
  }

  function startEditPriceIndex(code: string) {
    const record = priceIndices.find((priceIndex) => priceIndex.code === code)
    if (!record) {
      return
    }
    setSelectedPriceIndexCode(code)
    setPriceIndexFormMode('edit')
    setPriceIndexForm({
      code: record.code,
      name: record.name,
      description: record.description ?? '',
      commodity_code: record.commodity_code,
      currency_code: record.currency_code,
      unit_code: record.unit_code,
      provider: record.provider,
      market: record.market ?? '',
      location_code: record.location_code ?? '',
      calendar_code: record.calendar_code ?? '',
    })
  }

  function startCreateCurrency() {
    setCurrencyFormMode('create')
    setCurrencyForm(emptyCurrencyForm())
  }

  function startEditCurrency(code: string) {
    const record = currencies.find((currency) => currency.code === code)
    if (!record) {
      return
    }
    setSelectedCurrencyCode(code)
    setCurrencyFormMode('edit')
    setCurrencyForm({
      code: record.code,
      name: record.name,
      symbol: record.symbol ?? '',
      description: record.description ?? '',
    })
  }

  function startCreateUnit() {
    setUnitFormMode('create')
    setUnitForm(emptyUnitForm(selectedCommodity?.commodity_class ?? commodityClassOrder[0]))
  }

  function startEditUnit(code: string) {
    const record = units.find((unit) => unit.code === code)
    if (!record) {
      return
    }
    setSelectedUnitCode(code)
    setUnitFormMode('edit')
    setUnitForm({
      code: record.code,
      name: record.name,
      commodity_class: record.commodity_class ?? commodityClassOrder[0],
      dimension: record.dimension,
      base_unit_code: record.base_unit_code ?? '',
      conversion_factor: record.conversion_factor?.toString() ?? '',
      precision: record.precision.toString(),
      description: record.description ?? '',
    })
  }

  function startCreateLocation() {
    setLocationFormMode('create')
    setLocationForm(emptyLocationForm(locationStandards))
  }

  function startEditLocation(code: string) {
    const record = locations.find((location) => location.code === code)
    if (!record) {
      return
    }
    setSelectedLocationCode(code)
    setLocationFormMode('edit')
    setLocationForm({
      code: record.code,
      name: record.name,
      location_kind: record.location_kind,
      location_type: record.location_type,
      parent_location_code: record.parent_location_code ?? '',
      market: record.market ?? '',
      city: record.city ?? '',
      subdivision_code: record.subdivision_code ?? '',
      country_code: record.country_code ?? '',
      continent_code: record.continent_code ?? '',
      latitude: record.latitude?.toString() ?? '',
      longitude: record.longitude?.toString() ?? '',
      region: record.region ?? '',
      timezone: record.timezone ?? '',
      description: record.description ?? '',
    })
  }

  function startCreateCounterparty() {
    setCounterpartyFormMode('create')
    setCounterpartyForm(emptyCounterpartyForm(counterpartyStandards))
  }

  function startEditCounterparty(code: string) {
    const record = counterparties.find((counterparty) => counterparty.code === code)
    if (!record) {
      return
    }
    setSelectedCounterpartyCode(code)
    setCounterpartyFormMode('edit')
    setCounterpartyForm({
      code: record.code,
      name: record.name,
      short_name: record.short_name ?? '',
      legal_entity_name: record.legal_entity_name ?? '',
      counterparty_type: record.counterparty_type,
      country_code: record.country_code ?? '',
      lei_code: record.lei_code ?? '',
      duns_number: record.duns_number ?? '',
      ticker_symbol: record.ticker_symbol ?? '',
      credit_status: record.credit_status ?? counterpartyStandards.default_counterparty_credit_status,
      description: record.description ?? '',
    })
  }

  function startCreatePortfolio() {
    setPortfolioFormMode('create')
    setPortfolioForm(emptyPortfolioForm(activeBooks[0]?.code ?? ''))
  }

  function startEditPortfolio(code: string) {
    const record = portfolios.find((portfolio) => portfolio.code === code)
    if (!record) {
      return
    }
    setSelectedPortfolioCode(code)
    setPortfolioFormMode('edit')
    setPortfolioForm({
      code: record.code,
      name: record.name,
      book_code: record.book_code,
      owner: record.owner ?? '',
      strategy: record.strategy ?? '',
      description: record.description ?? '',
    })
  }

  return {
    referenceTab,
    setReferenceTab,
    referenceSearch,
    setReferenceSearch,
    selectedBookCode: resolvedSelectedBookCode,
    setSelectedBookCode,
    selectedCommodityCode: resolvedSelectedCommodityCode,
    setSelectedCommodityCode,
    selectedPriceIndexCode: resolvedSelectedPriceIndexCode,
    setSelectedPriceIndexCode,
    selectedCurrencyCode: resolvedSelectedCurrencyCode,
    setSelectedCurrencyCode,
    selectedUnitCode: resolvedSelectedUnitCode,
    setSelectedUnitCode,
    selectedLocationCode: resolvedSelectedLocationCode,
    setSelectedLocationCode,
    selectedCounterpartyCode: resolvedSelectedCounterpartyCode,
    setSelectedCounterpartyCode,
    selectedPortfolioCode: resolvedSelectedPortfolioCode,
    setSelectedPortfolioCode,
    bookForm,
    setBookForm,
    commodityForm,
    setCommodityForm,
    priceIndexForm: resolvedPriceIndexForm,
    setPriceIndexForm,
    currencyForm,
    setCurrencyForm,
    unitForm,
    setUnitForm,
    locationForm,
    setLocationForm,
    counterpartyForm,
    setCounterpartyForm,
    portfolioForm: resolvedPortfolioForm,
    setPortfolioForm,
    bookFormMode,
    setBookFormMode,
    commodityFormMode,
    setCommodityFormMode,
    priceIndexFormMode,
    setPriceIndexFormMode,
    currencyFormMode,
    setCurrencyFormMode,
    unitFormMode,
    setUnitFormMode,
    locationFormMode,
    setLocationFormMode,
    counterpartyFormMode,
    setCounterpartyFormMode,
    portfolioFormMode,
    setPortfolioFormMode,
    selectedBook,
    selectedCommodity,
    selectedPriceIndex,
    selectedCurrency,
    selectedUnit,
    selectedLocation,
    selectedCounterparty,
    selectedPortfolio,
    filteredBooks,
    referenceCommodityGroups,
    filteredPriceIndices,
    filteredCurrencies,
    filteredUnits,
    filteredLocations,
    filteredCounterparties,
    filteredPortfolios,
    selectablePriceIndexUnits,
    startCreateBook,
    startEditBook,
    startCreateCommodity,
    startEditCommodity,
    startCreatePriceIndex,
    startEditPriceIndex,
    startCreateCurrency,
    startEditCurrency,
    startCreateUnit,
    startEditUnit,
    startCreateLocation,
    startEditLocation,
    startCreateCounterparty,
    startEditCounterparty,
    startCreatePortfolio,
    startEditPortfolio,
  }
}
