import { useEffect, useMemo, useState } from 'react'

import { classForCommodity } from '../../shared/reference'
import type {
  BookForm,
  CommodityForm,
  CounterpartyForm,
  CounterpartyRecord,
  CurrencyForm,
  CurrencyRecord,
  LocationForm,
  LocationRecord,
  PortfolioForm,
  PortfolioRecord,
  PriceIndexForm,
  PriceIndexRecord,
  ReferenceRecord,
  ReferenceTab,
  UnitForm,
  UnitRecord,
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

export function emptyLocationForm(): LocationForm {
  return {
    code: '',
    name: '',
    location_type: 'HUB',
    market: '',
    country_code: '',
    region: '',
    timezone: '',
    description: '',
  }
}

export function emptyCounterpartyForm(): CounterpartyForm {
  return {
    code: '',
    name: '',
    short_name: '',
    legal_entity_name: '',
    counterparty_type: 'SUPPLIER',
    country_code: '',
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
  const [locationForm, setLocationForm] = useState(emptyLocationForm())
  const [counterpartyForm, setCounterpartyForm] = useState(emptyCounterpartyForm())
  const [portfolioForm, setPortfolioForm] = useState(emptyPortfolioForm())

  const [bookFormMode, setBookFormMode] = useState<'create' | 'edit'>('create')
  const [commodityFormMode, setCommodityFormMode] = useState<'create' | 'edit'>('create')
  const [priceIndexFormMode, setPriceIndexFormMode] = useState<'create' | 'edit'>('create')
  const [currencyFormMode, setCurrencyFormMode] = useState<'create' | 'edit'>('create')
  const [unitFormMode, setUnitFormMode] = useState<'create' | 'edit'>('create')
  const [locationFormMode, setLocationFormMode] = useState<'create' | 'edit'>('create')
  const [counterpartyFormMode, setCounterpartyFormMode] = useState<'create' | 'edit'>('create')
  const [portfolioFormMode, setPortfolioFormMode] = useState<'create' | 'edit'>('create')

  const selectedBook = useMemo(
    () => books.find((book) => book.code === selectedBookCode) ?? null,
    [books, selectedBookCode],
  )
  const selectedCommodity = useMemo(
    () => commodities.find((commodity) => commodity.code === selectedCommodityCode) ?? null,
    [commodities, selectedCommodityCode],
  )
  const selectedPriceIndex = useMemo(
    () => priceIndices.find((priceIndex) => priceIndex.code === selectedPriceIndexCode) ?? null,
    [priceIndices, selectedPriceIndexCode],
  )
  const selectedCurrency = useMemo(
    () => currencies.find((currency) => currency.code === selectedCurrencyCode) ?? null,
    [currencies, selectedCurrencyCode],
  )
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.code === selectedUnitCode) ?? null,
    [units, selectedUnitCode],
  )
  const selectedLocation = useMemo(
    () => locations.find((location) => location.code === selectedLocationCode) ?? null,
    [locations, selectedLocationCode],
  )
  const selectedCounterparty = useMemo(
    () => counterparties.find((counterparty) => counterparty.code === selectedCounterpartyCode) ?? null,
    [counterparties, selectedCounterpartyCode],
  )
  const selectedPortfolio = useMemo(
    () => portfolios.find((portfolio) => portfolio.code === selectedPortfolioCode) ?? null,
    [portfolios, selectedPortfolioCode],
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
        location.location_type.toLowerCase().includes(query) ||
        (location.market ?? '').toLowerCase().includes(query) ||
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
        counterparty.counterparty_type.toLowerCase().includes(query) ||
        (counterparty.country_code ?? '').toLowerCase().includes(query) ||
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

  const selectablePriceIndexUnits = useMemo(() => {
    if (!priceIndexForm.commodity_code) {
      return activeUnits
    }

    const commodityClass = classForCommodity(commodities, priceIndexForm.commodity_code)
    const matchingUnits = activeUnits.filter((unit) => !unit.commodity_class || unit.commodity_class === commodityClass)
    return matchingUnits.length > 0 ? matchingUnits : activeUnits
  }, [activeUnits, commodities, priceIndexForm.commodity_code])

  useEffect(() => {
    if (!selectedBookCode && books.length > 0) setSelectedBookCode(books[0].code)
  }, [books, selectedBookCode])

  useEffect(() => {
    if (!selectedCommodityCode && commodities.length > 0) setSelectedCommodityCode(commodities[0].code)
  }, [commodities, selectedCommodityCode])

  useEffect(() => {
    if (!selectedPriceIndexCode && priceIndices.length > 0) setSelectedPriceIndexCode(priceIndices[0].code)
  }, [priceIndices, selectedPriceIndexCode])

  useEffect(() => {
    if (!selectedCurrencyCode && currencies.length > 0) setSelectedCurrencyCode(currencies[0].code)
  }, [currencies, selectedCurrencyCode])

  useEffect(() => {
    if (!selectedUnitCode && units.length > 0) setSelectedUnitCode(units[0].code)
  }, [selectedUnitCode, units])

  useEffect(() => {
    if (!selectedLocationCode && locations.length > 0) setSelectedLocationCode(locations[0].code)
  }, [locations, selectedLocationCode])

  useEffect(() => {
    if (!selectedCounterpartyCode && counterparties.length > 0) setSelectedCounterpartyCode(counterparties[0].code)
  }, [counterparties, selectedCounterpartyCode])

  useEffect(() => {
    if (!selectedPortfolioCode && portfolios.length > 0) setSelectedPortfolioCode(portfolios[0].code)
  }, [portfolios, selectedPortfolioCode])

  useEffect(() => {
    if (!priceIndexForm.commodity_code && activeCommodities.length > 0) {
      setPriceIndexForm((current) => ({ ...current, commodity_code: activeCommodities[0].code }))
    }
  }, [activeCommodities, priceIndexForm.commodity_code])

  useEffect(() => {
    if (!activeCurrencies.some((currency) => currency.code === priceIndexForm.currency_code)) {
      setPriceIndexForm((current) => ({ ...current, currency_code: activeCurrencies[0]?.code ?? '' }))
    }
  }, [activeCurrencies, priceIndexForm.currency_code])

  useEffect(() => {
    if (!selectablePriceIndexUnits.some((unit) => unit.code === priceIndexForm.unit_code)) {
      setPriceIndexForm((current) => ({ ...current, unit_code: selectablePriceIndexUnits[0]?.code ?? '' }))
    }
  }, [priceIndexForm.unit_code, selectablePriceIndexUnits])

  useEffect(() => {
    if (priceIndexForm.location_code && !activeLocations.some((location) => location.code === priceIndexForm.location_code)) {
      setPriceIndexForm((current) => ({ ...current, location_code: '' }))
    }
  }, [activeLocations, priceIndexForm.location_code])

  useEffect(() => {
    if (!activeBooks.some((book) => book.code === portfolioForm.book_code)) {
      setPortfolioForm((current) => ({ ...current, book_code: activeBooks[0]?.code ?? '' }))
    }
  }, [activeBooks, portfolioForm.book_code])

  useEffect(() => {
    if (bookFormMode === 'edit' && selectedBook) {
      setBookForm({ code: selectedBook.code, name: selectedBook.name, description: selectedBook.description ?? '' })
    }
  }, [bookFormMode, selectedBook])

  useEffect(() => {
    if (commodityFormMode === 'edit' && selectedCommodity) {
      setCommodityForm({
        code: selectedCommodity.code,
        name: selectedCommodity.name,
        description: selectedCommodity.description ?? '',
        commodity_class: selectedCommodity.commodity_class ?? commodityClassOrder[0],
      })
    }
  }, [commodityClassOrder, commodityFormMode, selectedCommodity])

  useEffect(() => {
    if (priceIndexFormMode === 'edit' && selectedPriceIndex) {
      setPriceIndexForm({
        code: selectedPriceIndex.code,
        name: selectedPriceIndex.name,
        description: selectedPriceIndex.description ?? '',
        commodity_code: selectedPriceIndex.commodity_code,
        currency_code: selectedPriceIndex.currency_code,
        unit_code: selectedPriceIndex.unit_code,
        provider: selectedPriceIndex.provider,
        market: selectedPriceIndex.market ?? '',
        location_code: selectedPriceIndex.location_code ?? '',
        calendar_code: selectedPriceIndex.calendar_code ?? '',
      })
    }
  }, [priceIndexFormMode, selectedPriceIndex])

  useEffect(() => {
    if (currencyFormMode === 'edit' && selectedCurrency) {
      setCurrencyForm({
        code: selectedCurrency.code,
        name: selectedCurrency.name,
        symbol: selectedCurrency.symbol ?? '',
        description: selectedCurrency.description ?? '',
      })
    }
  }, [currencyFormMode, selectedCurrency])

  useEffect(() => {
    if (unitFormMode === 'edit' && selectedUnit) {
      setUnitForm({
        code: selectedUnit.code,
        name: selectedUnit.name,
        commodity_class: selectedUnit.commodity_class ?? commodityClassOrder[0],
        dimension: selectedUnit.dimension,
        base_unit_code: selectedUnit.base_unit_code ?? '',
        conversion_factor: selectedUnit.conversion_factor?.toString() ?? '',
        precision: selectedUnit.precision.toString(),
        description: selectedUnit.description ?? '',
      })
    }
  }, [commodityClassOrder, selectedUnit, unitFormMode])

  useEffect(() => {
    if (locationFormMode === 'edit' && selectedLocation) {
      setLocationForm({
        code: selectedLocation.code,
        name: selectedLocation.name,
        location_type: selectedLocation.location_type,
        market: selectedLocation.market ?? '',
        country_code: selectedLocation.country_code ?? '',
        region: selectedLocation.region ?? '',
        timezone: selectedLocation.timezone ?? '',
        description: selectedLocation.description ?? '',
      })
    }
  }, [locationFormMode, selectedLocation])

  useEffect(() => {
    if (counterpartyFormMode === 'edit' && selectedCounterparty) {
      setCounterpartyForm({
        code: selectedCounterparty.code,
        name: selectedCounterparty.name,
        short_name: selectedCounterparty.short_name ?? '',
        legal_entity_name: selectedCounterparty.legal_entity_name ?? '',
        counterparty_type: selectedCounterparty.counterparty_type,
        country_code: selectedCounterparty.country_code ?? '',
        description: selectedCounterparty.description ?? '',
      })
    }
  }, [counterpartyFormMode, selectedCounterparty])

  useEffect(() => {
    if (portfolioFormMode === 'edit' && selectedPortfolio) {
      setPortfolioForm({
        code: selectedPortfolio.code,
        name: selectedPortfolio.name,
        book_code: selectedPortfolio.book_code,
        owner: selectedPortfolio.owner ?? '',
        strategy: selectedPortfolio.strategy ?? '',
        description: selectedPortfolio.description ?? '',
      })
    }
  }, [portfolioFormMode, selectedPortfolio])

  function startCreateBook() {
    setBookFormMode('create')
    setBookForm(emptyBookForm())
  }

  function startEditBook(code: string) {
    setSelectedBookCode(code)
    setBookFormMode('edit')
  }

  function startCreateCommodity() {
    setCommodityFormMode('create')
    setCommodityForm(emptyCommodityForm(selectedCommodity?.commodity_class ?? commodityClassOrder[0]))
  }

  function startEditCommodity(code: string) {
    setSelectedCommodityCode(code)
    setCommodityFormMode('edit')
  }

  function startCreatePriceIndex() {
    setPriceIndexFormMode('create')
    setPriceIndexForm(emptyPriceIndexForm(activeCommodities[0]?.code ?? ''))
  }

  function startEditPriceIndex(code: string) {
    setSelectedPriceIndexCode(code)
    setPriceIndexFormMode('edit')
  }

  function startCreateCurrency() {
    setCurrencyFormMode('create')
    setCurrencyForm(emptyCurrencyForm())
  }

  function startEditCurrency(code: string) {
    setSelectedCurrencyCode(code)
    setCurrencyFormMode('edit')
  }

  function startCreateUnit() {
    setUnitFormMode('create')
    setUnitForm(emptyUnitForm(selectedCommodity?.commodity_class ?? commodityClassOrder[0]))
  }

  function startEditUnit(code: string) {
    setSelectedUnitCode(code)
    setUnitFormMode('edit')
  }

  function startCreateLocation() {
    setLocationFormMode('create')
    setLocationForm(emptyLocationForm())
  }

  function startEditLocation(code: string) {
    setSelectedLocationCode(code)
    setLocationFormMode('edit')
  }

  function startCreateCounterparty() {
    setCounterpartyFormMode('create')
    setCounterpartyForm(emptyCounterpartyForm())
  }

  function startEditCounterparty(code: string) {
    setSelectedCounterpartyCode(code)
    setCounterpartyFormMode('edit')
  }

  function startCreatePortfolio() {
    setPortfolioFormMode('create')
    setPortfolioForm(emptyPortfolioForm(activeBooks[0]?.code ?? ''))
  }

  function startEditPortfolio(code: string) {
    setSelectedPortfolioCode(code)
    setPortfolioFormMode('edit')
  }

  return {
    referenceTab,
    setReferenceTab,
    referenceSearch,
    setReferenceSearch,
    selectedBookCode,
    setSelectedBookCode,
    selectedCommodityCode,
    setSelectedCommodityCode,
    selectedPriceIndexCode,
    setSelectedPriceIndexCode,
    selectedCurrencyCode,
    setSelectedCurrencyCode,
    selectedUnitCode,
    setSelectedUnitCode,
    selectedLocationCode,
    setSelectedLocationCode,
    selectedCounterpartyCode,
    setSelectedCounterpartyCode,
    selectedPortfolioCode,
    setSelectedPortfolioCode,
    bookForm,
    setBookForm,
    commodityForm,
    setCommodityForm,
    priceIndexForm,
    setPriceIndexForm,
    currencyForm,
    setCurrencyForm,
    unitForm,
    setUnitForm,
    locationForm,
    setLocationForm,
    counterpartyForm,
    setCounterpartyForm,
    portfolioForm,
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
