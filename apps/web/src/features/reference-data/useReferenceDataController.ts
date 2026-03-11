import { useMemo, useState } from 'react'

import { submitReferenceMutation } from '../../entities/reference-data/api'
import type {
  CounterpartyRecord,
  CurrencyRecord,
  LocationRecord,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  UnitRecord,
} from '../../shared/models'
import { useReferenceDataWorkspace } from './useReferenceDataWorkspace'

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? '').trim() === (right ?? '').trim()
}

type UseReferenceDataControllerArgs = {
  apiBase: string
  userId: string
  reloadData: () => Promise<void>
  trades: Trade[]
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

export function useReferenceDataController({
  apiBase,
  userId,
  reloadData,
  trades,
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
}: UseReferenceDataControllerArgs) {
  const [referenceActionError, setReferenceActionError] = useState('')
  const [referenceActionSuccess, setReferenceActionSuccess] = useState('')
  const [savingReference, setSavingReference] = useState(false)

  const workspace = useReferenceDataWorkspace({
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
  })

  const {
    bookForm,
    commodityForm,
    priceIndexForm,
    currencyForm,
    unitForm,
    locationForm,
    bookFormMode,
    commodityFormMode,
    priceIndexFormMode,
    currencyFormMode,
    unitFormMode,
    locationFormMode,
    selectedBook,
    selectedCommodity,
    selectedPriceIndex,
    selectedCurrency,
    selectedUnit,
    selectedLocation,
    selectedCounterparty,
    selectedPortfolio,
    startCreateBook: startCreateBookBase,
    startEditBook: startEditBookBase,
    startCreateCommodity: startCreateCommodityBase,
    startEditCommodity: startEditCommodityBase,
    startCreatePriceIndex: startCreatePriceIndexBase,
    startEditPriceIndex: startEditPriceIndexBase,
    startCreateCurrency: startCreateCurrencyBase,
    startEditCurrency: startEditCurrencyBase,
    startCreateUnit: startCreateUnitBase,
    startEditUnit: startEditUnitBase,
    startCreateLocation: startCreateLocationBase,
    startEditLocation: startEditLocationBase,
    startCreateCounterparty: startCreateCounterpartyBase,
    startEditCounterparty: startEditCounterpartyBase,
    startCreatePortfolio: startCreatePortfolioBase,
    startEditPortfolio: startEditPortfolioBase,
  } = workspace

  const bookUsageByCode = useMemo(() => {
    const usage = new Map<string, { activeTrades: number; totalTrades: number }>()
    for (const trade of trades) {
      const current = usage.get(trade.book) ?? { activeTrades: 0, totalTrades: 0 }
      current.totalTrades += 1
      if (trade.status !== 'CANCELLED') {
        current.activeTrades += 1
      }
      usage.set(trade.book, current)
    }
    return usage
  }, [trades])

  const commodityUsageByCode = useMemo(() => {
    const usage = new Map<string, { activeTrades: number; totalTrades: number }>()
    for (const trade of trades) {
      const current = usage.get(trade.commodity) ?? { activeTrades: 0, totalTrades: 0 }
      current.totalTrades += 1
      if (trade.status !== 'CANCELLED') {
        current.activeTrades += 1
      }
      usage.set(trade.commodity, current)
    }
    return usage
  }, [trades])

  const priceIndexUsageByCode = useMemo(() => {
    const usage = new Map<string, { activeTrades: number; totalTrades: number }>()
    for (const trade of trades) {
      if (!trade.price_index_code) continue
      const current = usage.get(trade.price_index_code) ?? { activeTrades: 0, totalTrades: 0 }
      current.totalTrades += 1
      if (trade.status !== 'CANCELLED') {
        current.activeTrades += 1
      }
      usage.set(trade.price_index_code, current)
    }
    return usage
  }, [trades])

  const currencyUsageByCode = useMemo(() => {
    const usage = new Map<string, { activeChildren: number; totalChildren: number }>()
    for (const priceIndex of priceIndices) {
      const current = usage.get(priceIndex.currency_code) ?? { activeChildren: 0, totalChildren: 0 }
      current.totalChildren += 1
      if (priceIndex.is_active) {
        current.activeChildren += 1
      }
      usage.set(priceIndex.currency_code, current)
    }
    return usage
  }, [priceIndices])

  const unitUsageByCode = useMemo(() => {
    const usage = new Map<string, { activeChildren: number; totalChildren: number }>()
    for (const priceIndex of priceIndices) {
      const current = usage.get(priceIndex.unit_code) ?? { activeChildren: 0, totalChildren: 0 }
      current.totalChildren += 1
      if (priceIndex.is_active) {
        current.activeChildren += 1
      }
      usage.set(priceIndex.unit_code, current)
    }
    return usage
  }, [priceIndices])

  const locationUsageByCode = useMemo(() => {
    const usage = new Map<string, { activeChildren: number; totalChildren: number }>()
    for (const priceIndex of priceIndices) {
      if (!priceIndex.location_code) continue
      const current = usage.get(priceIndex.location_code) ?? { activeChildren: 0, totalChildren: 0 }
      current.totalChildren += 1
      if (priceIndex.is_active) {
        current.activeChildren += 1
      }
      usage.set(priceIndex.location_code, current)
    }
    return usage
  }, [priceIndices])

  const selectedBookUsage = selectedBook
    ? bookUsageByCode.get(selectedBook.code) ?? { activeTrades: 0, totalTrades: 0 }
    : null

  const selectedCommodityUsage = selectedCommodity
    ? commodityUsageByCode.get(selectedCommodity.code) ?? { activeTrades: 0, totalTrades: 0 }
    : null

  const selectedPriceIndexUsage = selectedPriceIndex
    ? priceIndexUsageByCode.get(selectedPriceIndex.code) ?? { activeTrades: 0, totalTrades: 0 }
    : null

  const selectedCurrencyUsage = selectedCurrency
    ? currencyUsageByCode.get(selectedCurrency.code) ?? { activeChildren: 0, totalChildren: 0 }
    : null

  const selectedUnitUsage = selectedUnit
    ? unitUsageByCode.get(selectedUnit.code) ?? { activeChildren: 0, totalChildren: 0 }
    : null

  const selectedLocationUsage = selectedLocation
    ? locationUsageByCode.get(selectedLocation.code) ?? { activeChildren: 0, totalChildren: 0 }
    : null

  const bookFieldErrors = useMemo(() => {
    const errors: Partial<Record<'code' | 'name', string>> = {}
    if (!bookForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (bookFormMode === 'create' && books.some((book) => book.code === bookForm.code.trim().toUpperCase())) {
      errors.code = 'Code already exists.'
    }

    if (!bookForm.name.trim()) {
      errors.name = 'Name is required.'
    }

    return errors
  }, [bookForm.code, bookForm.name, bookFormMode, books])

  const commodityFieldErrors = useMemo(() => {
    const errors: Partial<Record<'code' | 'name' | 'commodity_class', string>> = {}
    if (!commodityForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (
      commodityFormMode === 'create' &&
      commodities.some((commodity) => commodity.code === commodityForm.code.trim().toUpperCase())
    ) {
      errors.code = 'Code already exists.'
    }

    if (!commodityForm.name.trim()) {
      errors.name = 'Name is required.'
    }

    if (!commodityForm.commodity_class) {
      errors.commodity_class = 'Commodity class is required.'
    }

    return errors
  }, [commodities, commodityForm.code, commodityForm.commodity_class, commodityForm.name, commodityFormMode])

  const priceIndexFieldErrors = useMemo(() => {
    const errors: Partial<Record<'code' | 'name' | 'commodity_code' | 'provider' | 'currency_code' | 'unit_code', string>> = {}
    if (!priceIndexForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (
      priceIndexFormMode === 'create' &&
      priceIndices.some((priceIndex) => priceIndex.code === priceIndexForm.code.trim().toUpperCase())
    ) {
      errors.code = 'Code already exists.'
    }
    if (!priceIndexForm.name.trim()) errors.name = 'Name is required.'
    if (!priceIndexForm.commodity_code) errors.commodity_code = 'Commodity is required.'
    if (!priceIndexForm.provider.trim()) errors.provider = 'Provider is required.'
    if (!priceIndexForm.currency_code) errors.currency_code = 'Currency is required.'
    if (!priceIndexForm.unit_code) errors.unit_code = 'Unit is required.'
    return errors
  }, [
    priceIndexForm.code,
    priceIndexForm.commodity_code,
    priceIndexForm.currency_code,
    priceIndexForm.name,
    priceIndexForm.provider,
    priceIndexForm.unit_code,
    priceIndexFormMode,
    priceIndices,
  ])

  const currencyFieldErrors = useMemo(() => {
    const errors: Partial<Record<'code' | 'name', string>> = {}
    if (!currencyForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (
      currencyFormMode === 'create' &&
      currencies.some((currency) => currency.code === currencyForm.code.trim().toUpperCase())
    ) {
      errors.code = 'Code already exists.'
    }
    if (!currencyForm.name.trim()) errors.name = 'Name is required.'
    return errors
  }, [currencies, currencyForm.code, currencyForm.name, currencyFormMode])

  const unitFieldErrors = useMemo(() => {
    const errors: Partial<Record<'code' | 'name' | 'commodity_class' | 'dimension' | 'precision', string>> = {}
    if (!unitForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (
      unitFormMode === 'create' &&
      units.some((unit) => unit.code === unitForm.code.trim().toUpperCase())
    ) {
      errors.code = 'Code already exists.'
    }
    if (!unitForm.name.trim()) errors.name = 'Name is required.'
    if (!unitForm.commodity_class) errors.commodity_class = 'Commodity class is required.'
    if (!unitForm.dimension.trim()) errors.dimension = 'Dimension is required.'
    if (!unitForm.precision.trim()) errors.precision = 'Precision is required.'
    return errors
  }, [unitForm.code, unitForm.commodity_class, unitForm.dimension, unitForm.name, unitForm.precision, unitFormMode, units])

  const locationFieldErrors = useMemo(() => {
    const errors: Partial<Record<'code' | 'name' | 'location_type', string>> = {}
    if (!locationForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (
      locationFormMode === 'create' &&
      locations.some((location) => location.code === locationForm.code.trim().toUpperCase())
    ) {
      errors.code = 'Code already exists.'
    }
    if (!locationForm.name.trim()) errors.name = 'Name is required.'
    if (!locationForm.location_type.trim()) errors.location_type = 'Location type is required.'
    return errors
  }, [locationForm.code, locationForm.location_type, locationForm.name, locationFormMode, locations])

  const bookFormDirty = useMemo(() => {
    if (bookFormMode === 'create') {
      return !sameText(bookForm.code, '') || !sameText(bookForm.name, '') || !sameText(bookForm.description, '')
    }

    if (!selectedBook) {
      return false
    }

    return (
      !sameText(bookForm.code, selectedBook.code) ||
      !sameText(bookForm.name, selectedBook.name) ||
      !sameText(bookForm.description, selectedBook.description)
    )
  }, [bookForm.code, bookForm.description, bookForm.name, bookFormMode, selectedBook])

  const commodityFormDirty = useMemo(() => {
    if (commodityFormMode === 'create') {
      return (
        !sameText(commodityForm.code, '') ||
        !sameText(commodityForm.name, '') ||
        !sameText(commodityForm.description, '') ||
        commodityForm.commodity_class !== (selectedCommodity?.commodity_class ?? commodityClassOrder[0])
      )
    }

    if (!selectedCommodity) {
      return false
    }

    return (
      !sameText(commodityForm.code, selectedCommodity.code) ||
      !sameText(commodityForm.name, selectedCommodity.name) ||
      !sameText(commodityForm.description, selectedCommodity.description) ||
      commodityForm.commodity_class !== (selectedCommodity.commodity_class ?? commodityClassOrder[0])
    )
  }, [
    commodityClassOrder,
    commodityForm.code,
    commodityForm.commodity_class,
    commodityForm.description,
    commodityForm.name,
    commodityFormMode,
    selectedCommodity,
  ])

  const priceIndexFormDirty = useMemo(() => {
    if (priceIndexFormMode === 'create') {
      return (
        !sameText(priceIndexForm.code, '') ||
        !sameText(priceIndexForm.name, '') ||
        !sameText(priceIndexForm.description, '') ||
        !sameText(priceIndexForm.commodity_code, activeCommodities[0]?.code ?? '') ||
        !sameText(priceIndexForm.currency_code, 'USD') ||
        !sameText(priceIndexForm.unit_code, 'BBL') ||
        !sameText(priceIndexForm.provider, '') ||
        !sameText(priceIndexForm.market, '') ||
        !sameText(priceIndexForm.location_code, '') ||
        !sameText(priceIndexForm.calendar_code, '')
      )
    }
    if (!selectedPriceIndex) return false
    return (
      !sameText(priceIndexForm.code, selectedPriceIndex.code) ||
      !sameText(priceIndexForm.name, selectedPriceIndex.name) ||
      !sameText(priceIndexForm.description, selectedPriceIndex.description) ||
      !sameText(priceIndexForm.commodity_code, selectedPriceIndex.commodity_code) ||
      !sameText(priceIndexForm.currency_code, selectedPriceIndex.currency_code) ||
      !sameText(priceIndexForm.unit_code, selectedPriceIndex.unit_code) ||
      !sameText(priceIndexForm.provider, selectedPriceIndex.provider) ||
      !sameText(priceIndexForm.market, selectedPriceIndex.market) ||
      !sameText(priceIndexForm.location_code, selectedPriceIndex.location_code) ||
      !sameText(priceIndexForm.calendar_code, selectedPriceIndex.calendar_code)
    )
  }, [activeCommodities, priceIndexForm, priceIndexFormMode, selectedPriceIndex])

  const currencyFormDirty = useMemo(() => {
    if (currencyFormMode === 'create') {
      return !sameText(currencyForm.code, '') || !sameText(currencyForm.name, '') || !sameText(currencyForm.symbol, '') || !sameText(currencyForm.description, '')
    }
    if (!selectedCurrency) return false
    return (
      !sameText(currencyForm.code, selectedCurrency.code) ||
      !sameText(currencyForm.name, selectedCurrency.name) ||
      !sameText(currencyForm.symbol, selectedCurrency.symbol) ||
      !sameText(currencyForm.description, selectedCurrency.description)
    )
  }, [currencyForm, currencyFormMode, selectedCurrency])

  const unitFormDirty = useMemo(() => {
    if (unitFormMode === 'create') {
      return (
        !sameText(unitForm.code, '') ||
        !sameText(unitForm.name, '') ||
        !sameText(unitForm.commodity_class, selectedCommodity?.commodity_class ?? commodityClassOrder[0]) ||
        !sameText(unitForm.dimension, 'VOLUME') ||
        !sameText(unitForm.base_unit_code, '') ||
        !sameText(unitForm.conversion_factor, '') ||
        !sameText(unitForm.precision, '3') ||
        !sameText(unitForm.description, '')
      )
    }
    if (!selectedUnit) return false
    return (
      !sameText(unitForm.code, selectedUnit.code) ||
      !sameText(unitForm.name, selectedUnit.name) ||
      !sameText(unitForm.commodity_class, selectedUnit.commodity_class) ||
      !sameText(unitForm.dimension, selectedUnit.dimension) ||
      !sameText(unitForm.base_unit_code, selectedUnit.base_unit_code) ||
      !sameText(unitForm.conversion_factor, selectedUnit.conversion_factor?.toString()) ||
      !sameText(unitForm.precision, String(selectedUnit.precision)) ||
      !sameText(unitForm.description, selectedUnit.description)
    )
  }, [commodityClassOrder, selectedCommodity, selectedUnit, unitForm, unitFormMode])

  const locationFormDirty = useMemo(() => {
    if (locationFormMode === 'create') {
      return (
        !sameText(locationForm.code, '') ||
        !sameText(locationForm.name, '') ||
        !sameText(locationForm.location_type, 'HUB') ||
        !sameText(locationForm.market, '') ||
        !sameText(locationForm.country_code, '') ||
        !sameText(locationForm.region, '') ||
        !sameText(locationForm.timezone, '') ||
        !sameText(locationForm.description, '')
      )
    }
    if (!selectedLocation) return false
    return (
      !sameText(locationForm.code, selectedLocation.code) ||
      !sameText(locationForm.name, selectedLocation.name) ||
      !sameText(locationForm.location_type, selectedLocation.location_type) ||
      !sameText(locationForm.market, selectedLocation.market) ||
      !sameText(locationForm.country_code, selectedLocation.country_code) ||
      !sameText(locationForm.region, selectedLocation.region) ||
      !sameText(locationForm.timezone, selectedLocation.timezone) ||
      !sameText(locationForm.description, selectedLocation.description)
    )
  }, [locationForm, locationFormMode, selectedLocation])

  function resetReferenceMessages() {
    setReferenceActionError('')
    setReferenceActionSuccess('')
  }

  function beginReferenceAction(action: () => void) {
    resetReferenceMessages()
    action()
  }

  async function submitReference(
    path: string,
    method: 'POST' | 'PUT',
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setSavingReference(true)
    resetReferenceMessages()

    try {
      await submitReferenceMutation(apiBase, path, method, payload)
      await reloadData()
      setReferenceActionSuccess(successMessage)
    } catch (err) {
      setReferenceActionError(err instanceof Error ? err.message : 'Reference update failed.')
    } finally {
      setSavingReference(false)
    }
  }

  function startCreateBook() {
    beginReferenceAction(startCreateBookBase)
  }

  function startEditBook(code: string) {
    beginReferenceAction(() => startEditBookBase(code))
  }

  function startCreateCommodity() {
    beginReferenceAction(startCreateCommodityBase)
  }

  function startEditCommodity(code: string) {
    beginReferenceAction(() => startEditCommodityBase(code))
  }

  function startCreatePriceIndex() {
    beginReferenceAction(startCreatePriceIndexBase)
  }

  function startEditPriceIndex(code: string) {
    beginReferenceAction(() => startEditPriceIndexBase(code))
  }

  function startCreateCurrency() {
    beginReferenceAction(startCreateCurrencyBase)
  }

  function startEditCurrency(code: string) {
    beginReferenceAction(() => startEditCurrencyBase(code))
  }

  function startCreateUnit() {
    beginReferenceAction(startCreateUnitBase)
  }

  function startEditUnit(code: string) {
    beginReferenceAction(() => startEditUnitBase(code))
  }

  function startCreateLocation() {
    beginReferenceAction(startCreateLocationBase)
  }

  function startEditLocation(code: string) {
    beginReferenceAction(() => startEditLocationBase(code))
  }

  function startCreateCounterparty() {
    beginReferenceAction(startCreateCounterpartyBase)
  }

  function startEditCounterparty(code: string) {
    beginReferenceAction(() => startEditCounterpartyBase(code))
  }

  function startCreatePortfolio() {
    beginReferenceAction(startCreatePortfolioBase)
  }

  function startEditPortfolio(code: string) {
    beginReferenceAction(() => startEditPortfolioBase(code))
  }

  async function handleSaveBook(e: React.FormEvent) {
    e.preventDefault()
    if (!bookForm.code.trim() || !bookForm.name.trim()) {
      setReferenceActionError('Book code and name are required.')
      return
    }

    if (bookFormMode === 'create') {
      const code = bookForm.code.trim().toUpperCase()
      await submitReference(
        '/reference/books',
        'POST',
        { code, name: bookForm.name.trim(), description: bookForm.description.trim() || null, created_by: userId },
        `Book ${code} created.`,
      )
      startEditBookBase(code)
    } else if (selectedBook) {
      await submitReference(
        `/reference/books/${selectedBook.code}`,
        'PUT',
        { name: bookForm.name.trim(), description: bookForm.description.trim() || null, updated_by: userId },
        `Book ${selectedBook.code} updated.`,
      )
    }
  }

  async function handleSaveCommodity(e: React.FormEvent) {
    e.preventDefault()
    if (!commodityForm.code.trim() || !commodityForm.name.trim() || !commodityForm.commodity_class) {
      setReferenceActionError('Commodity code, name, and commodity class are required.')
      return
    }

    if (commodityFormMode === 'create') {
      const code = commodityForm.code.trim().toUpperCase()
      await submitReference(
        '/reference/commodities',
        'POST',
        {
          code,
          name: commodityForm.name.trim(),
          description: commodityForm.description.trim() || null,
          commodity_class: commodityForm.commodity_class,
          created_by: userId,
        },
        `Commodity ${code} created.`,
      )
      startEditCommodityBase(code)
    } else if (selectedCommodity) {
      await submitReference(
        `/reference/commodities/${selectedCommodity.code}`,
        'PUT',
        {
          name: commodityForm.name.trim(),
          description: commodityForm.description.trim() || null,
          commodity_class: commodityForm.commodity_class,
          updated_by: userId,
        },
        `Commodity ${selectedCommodity.code} updated.`,
      )
    }
  }

  async function handleToggleBook(record: ReferenceRecord) {
    const usage = bookUsageByCode.get(record.code) ?? { activeTrades: 0, totalTrades: 0 }
    if (record.is_active && usage.activeTrades > 0) {
      setReferenceActionError(
        `Book ${record.code} is used by ${usage.activeTrades} active trade${usage.activeTrades === 1 ? '' : 's'}. Reassign or cancel them before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }

    await submitReference(
      `/reference/books/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Book ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleToggleCommodity(record: ReferenceRecord) {
    const usage = commodityUsageByCode.get(record.code) ?? { activeTrades: 0, totalTrades: 0 }
    if (record.is_active && usage.activeTrades > 0) {
      setReferenceActionError(
        `Commodity ${record.code} is used by ${usage.activeTrades} active trade${usage.activeTrades === 1 ? '' : 's'}. Reassign or cancel them before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }

    await submitReference(
      `/reference/commodities/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Commodity ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSavePriceIndex(e: React.FormEvent) {
    e.preventDefault()
    if (
      !priceIndexForm.code.trim() ||
      !priceIndexForm.name.trim() ||
      !priceIndexForm.commodity_code ||
      !priceIndexForm.currency_code.trim() ||
      !priceIndexForm.unit_code.trim() ||
      !priceIndexForm.provider.trim()
    ) {
      setReferenceActionError('Price index code, name, commodity, currency, unit, and provider are required.')
      return
    }

    const payload = {
      code: priceIndexForm.code.trim().toUpperCase(),
      name: priceIndexForm.name.trim(),
      description: priceIndexForm.description.trim() || null,
      commodity_code: priceIndexForm.commodity_code,
      currency_code: priceIndexForm.currency_code.trim().toUpperCase(),
      unit_code: priceIndexForm.unit_code.trim().toUpperCase(),
      provider: priceIndexForm.provider.trim(),
      market: priceIndexForm.market.trim() || null,
      location_code: priceIndexForm.location_code.trim().toUpperCase() || null,
      calendar_code: priceIndexForm.calendar_code.trim().toUpperCase() || null,
    }

    if (priceIndexFormMode === 'create') {
      await submitReference('/reference/price-indices', 'POST', { ...payload, created_by: userId }, `Price index ${payload.code} created.`)
      startEditPriceIndexBase(payload.code)
    } else if (selectedPriceIndex) {
      await submitReference(
        `/reference/price-indices/${selectedPriceIndex.code}`,
        'PUT',
        { ...payload, updated_by: userId },
        `Price index ${selectedPriceIndex.code} updated.`,
      )
    }
  }

  async function handleTogglePriceIndex(record: PriceIndexRecord) {
    const usage = priceIndexUsageByCode.get(record.code) ?? { activeTrades: 0, totalTrades: 0 }
    if (record.is_active && usage.activeTrades > 0) {
      setReferenceActionError(
        `Price index ${record.code} is used by ${usage.activeTrades} active trade${usage.activeTrades === 1 ? '' : 's'}. Move those trades before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }
    await submitReference(
      `/reference/price-indices/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Price index ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveCurrency(e: React.FormEvent) {
    e.preventDefault()
    if (!currencyForm.code.trim() || !currencyForm.name.trim()) {
      setReferenceActionError('Currency code and name are required.')
      return
    }

    const payload = {
      code: currencyForm.code.trim().toUpperCase(),
      name: currencyForm.name.trim(),
      symbol: currencyForm.symbol.trim() || null,
      description: currencyForm.description.trim() || null,
    }

    if (currencyFormMode === 'create') {
      await submitReference('/reference/currencies', 'POST', { ...payload, created_by: userId }, `Currency ${payload.code} created.`)
      startEditCurrencyBase(payload.code)
    } else if (selectedCurrency) {
      await submitReference(
        `/reference/currencies/${selectedCurrency.code}`,
        'PUT',
        { ...payload, updated_by: userId },
        `Currency ${selectedCurrency.code} updated.`,
      )
    }
  }

  async function handleToggleCurrency(record: CurrencyRecord) {
    const usage = currencyUsageByCode.get(record.code) ?? { activeChildren: 0, totalChildren: 0 }
    if (record.is_active && usage.activeChildren > 0) {
      setReferenceActionError(
        `Currency ${record.code} is referenced by ${usage.activeChildren} active price ${usage.activeChildren === 1 ? 'index' : 'indices'}. Reassign them before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }
    await submitReference(
      `/reference/currencies/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Currency ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveUnit(e: React.FormEvent) {
    e.preventDefault()
    if (!unitForm.code.trim() || !unitForm.name.trim() || !unitForm.dimension.trim()) {
      setReferenceActionError('Unit code, name, and dimension are required.')
      return
    }

    const payload = {
      code: unitForm.code.trim().toUpperCase(),
      name: unitForm.name.trim(),
      commodity_class: unitForm.commodity_class || null,
      dimension: unitForm.dimension.trim().toUpperCase(),
      base_unit_code: unitForm.base_unit_code.trim().toUpperCase() || null,
      conversion_factor: unitForm.conversion_factor.trim() ? Number(unitForm.conversion_factor) : null,
      precision: Number(unitForm.precision || '3'),
      description: unitForm.description.trim() || null,
    }

    if (Number.isNaN(payload.precision) || (payload.conversion_factor !== null && Number.isNaN(payload.conversion_factor))) {
      setReferenceActionError('Unit precision and conversion factor must be numeric.')
      return
    }

    if (unitFormMode === 'create') {
      await submitReference('/reference/units', 'POST', { ...payload, created_by: userId }, `Unit ${payload.code} created.`)
      startEditUnitBase(payload.code)
    } else if (selectedUnit) {
      await submitReference(
        `/reference/units/${selectedUnit.code}`,
        'PUT',
        { ...payload, updated_by: userId },
        `Unit ${selectedUnit.code} updated.`,
      )
    }
  }

  async function handleToggleUnit(record: UnitRecord) {
    const usage = unitUsageByCode.get(record.code) ?? { activeChildren: 0, totalChildren: 0 }
    if (record.is_active && usage.activeChildren > 0) {
      setReferenceActionError(
        `Unit ${record.code} is referenced by ${usage.activeChildren} active price ${usage.activeChildren === 1 ? 'index' : 'indices'}. Reassign them before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }
    await submitReference(
      `/reference/units/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Unit ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!locationForm.code.trim() || !locationForm.name.trim() || !locationForm.location_type.trim()) {
      setReferenceActionError('Location code, name, and location type are required.')
      return
    }

    const payload = {
      code: locationForm.code.trim().toUpperCase(),
      name: locationForm.name.trim(),
      location_type: locationForm.location_type.trim().toUpperCase(),
      market: locationForm.market.trim() || null,
      country_code: locationForm.country_code.trim().toUpperCase() || null,
      region: locationForm.region.trim() || null,
      timezone: locationForm.timezone.trim() || null,
      description: locationForm.description.trim() || null,
    }

    if (locationFormMode === 'create') {
      await submitReference('/reference/locations', 'POST', { ...payload, created_by: userId }, `Location ${payload.code} created.`)
      startEditLocationBase(payload.code)
    } else if (selectedLocation) {
      await submitReference(
        `/reference/locations/${selectedLocation.code}`,
        'PUT',
        { ...payload, updated_by: userId },
        `Location ${selectedLocation.code} updated.`,
      )
    }
  }

  async function handleToggleLocation(record: LocationRecord) {
    const usage = locationUsageByCode.get(record.code) ?? { activeChildren: 0, totalChildren: 0 }
    if (record.is_active && usage.activeChildren > 0) {
      setReferenceActionError(
        `Location ${record.code} is referenced by ${usage.activeChildren} active price ${usage.activeChildren === 1 ? 'index' : 'indices'}. Reassign them before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }
    await submitReference(
      `/reference/locations/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Location ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveCounterparty(e: React.FormEvent) {
    e.preventDefault()
    if (!workspace.counterpartyForm.code.trim() || !workspace.counterpartyForm.name.trim() || !workspace.counterpartyForm.counterparty_type.trim()) {
      setReferenceActionError('Counterparty code, name, and type are required.')
      return
    }

    const payload = {
      code: workspace.counterpartyForm.code.trim().toUpperCase(),
      name: workspace.counterpartyForm.name.trim(),
      short_name: workspace.counterpartyForm.short_name.trim() || null,
      legal_entity_name: workspace.counterpartyForm.legal_entity_name.trim() || null,
      counterparty_type: workspace.counterpartyForm.counterparty_type.trim().toUpperCase(),
      country_code: workspace.counterpartyForm.country_code.trim().toUpperCase() || null,
      description: workspace.counterpartyForm.description.trim() || null,
    }

    if (workspace.counterpartyFormMode === 'create') {
      await submitReference('/reference/counterparties', 'POST', { ...payload, created_by: userId }, `Counterparty ${payload.code} created.`)
      startEditCounterpartyBase(payload.code)
    } else if (selectedCounterparty) {
      await submitReference(
        `/reference/counterparties/${selectedCounterparty.code}`,
        'PUT',
        { ...payload, updated_by: userId },
        `Counterparty ${selectedCounterparty.code} updated.`,
      )
    }
  }

  async function handleToggleCounterparty(record: CounterpartyRecord) {
    await submitReference(
      `/reference/counterparties/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Counterparty ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSavePortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!workspace.portfolioForm.code.trim() || !workspace.portfolioForm.name.trim() || !workspace.portfolioForm.book_code.trim()) {
      setReferenceActionError('Portfolio code, name, and book are required.')
      return
    }

    const payload = {
      code: workspace.portfolioForm.code.trim().toUpperCase(),
      name: workspace.portfolioForm.name.trim(),
      book_code: workspace.portfolioForm.book_code.trim().toUpperCase(),
      owner: workspace.portfolioForm.owner.trim() || null,
      strategy: workspace.portfolioForm.strategy.trim() || null,
      description: workspace.portfolioForm.description.trim() || null,
    }

    if (workspace.portfolioFormMode === 'create') {
      await submitReference('/reference/portfolios', 'POST', { ...payload, created_by: userId }, `Portfolio ${payload.code} created.`)
      startEditPortfolioBase(payload.code)
    } else if (selectedPortfolio) {
      await submitReference(
        `/reference/portfolios/${selectedPortfolio.code}`,
        'PUT',
        { ...payload, updated_by: userId },
        `Portfolio ${selectedPortfolio.code} updated.`,
      )
    }
  }

  async function handleTogglePortfolio(record: PortfolioRecord) {
    await submitReference(
      `/reference/portfolios/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: userId },
      `Portfolio ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  return {
    ...workspace,
    activeBooks,
    activeCommodities,
    activeCurrencies,
    activeLocations,
    commodityClassOrder,
    referenceActionError,
    referenceActionSuccess,
    savingReference,
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
    handleSaveBook,
    handleSaveCommodity,
    handleToggleBook,
    handleToggleCommodity,
    handleSavePriceIndex,
    handleTogglePriceIndex,
    handleSaveCurrency,
    handleToggleCurrency,
    handleSaveUnit,
    handleToggleUnit,
    handleSaveLocation,
    handleToggleLocation,
    handleSaveCounterparty,
    handleToggleCounterparty,
    handleSavePortfolio,
    handleTogglePortfolio,
  }
}
