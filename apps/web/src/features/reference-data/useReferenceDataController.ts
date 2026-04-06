import { useMemo, useState } from 'react'

import { submitReferenceMutation } from '../../entities/reference-data/api'
import type {
  BookForm,
  CounterpartyRecord,
  CounterpartyStandards,
  CurrencyRecord,
  LocationRecord,
  LocationStandards,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  UnitRecord,
} from '../../shared/models'
import { getMutationContext } from '../../shared/mutation'
import { emptyBookForm, useReferenceDataWorkspace } from './useReferenceDataWorkspace'

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? '').trim() === (right ?? '').trim()
}

type BookSheetField = 'name' | 'description'

type BookSheetRow = ReferenceRecord & {
  description: string
  sheet_mode: 'create' | 'update'
  sheet_dirty: boolean
  sheet_error: string
}

type BookPasteIssue = {
  row_number: number
  code: string | null
  message: string
}

type BookPasteSummary = {
  total_rows: number
  staged_rows: number
  new_rows: number
  updated_rows: number
  invalid_rows: number
  unchanged_rows: number
  blocked_rows: number
  issues: BookPasteIssue[]
  used_header: boolean
  delimiter: 'tab' | 'comma'
}

function buildBookForm(record: ReferenceRecord): BookForm {
  return {
    code: record.code,
    name: record.name,
    description: record.description ?? '',
  }
}

function normalizePasteHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function parseDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === delimiter && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += character
  }

  values.push(current)
  return values
}

function parsePastedGrid(input: string): { rows: string[][]; delimiter: 'tab' | 'comma' } {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  const delimiter: '\t' | ',' = lines.some((line) => line.includes('\t')) ? '\t' : ','
  return {
    rows: lines.map((line) => parseDelimitedLine(line, delimiter)),
    delimiter: delimiter === '\t' ? 'tab' : 'comma',
  }
}

function resolveBookPasteMapping(rows: string[][]):
  | { codeIndex: number; nameIndex: number; descriptionIndex: number; startIndex: number; usedHeader: boolean }
  | { error: string } {
  if (rows.length === 0) {
    return { error: 'Paste at least one row containing Code and Name.' }
  }

  const firstRowHeaders = rows[0].map(normalizePasteHeader)
  const codeHeaderIndex = firstRowHeaders.findIndex((value) => value === 'code' || value === 'bookcode' || value === 'book')
  const nameHeaderIndex = firstRowHeaders.findIndex((value) => value === 'name' || value === 'bookname')
  const descriptionHeaderIndex = firstRowHeaders.findIndex(
    (value) => value === 'description' || value === 'desc' || value === 'details' || value === 'notes',
  )

  const usedHeader = codeHeaderIndex >= 0 || nameHeaderIndex >= 0 || descriptionHeaderIndex >= 0
  if (usedHeader) {
    if (codeHeaderIndex < 0 || nameHeaderIndex < 0) {
      return { error: 'Header rows must include Code and Name columns. Description is optional.' }
    }

    return {
      codeIndex: codeHeaderIndex,
      nameIndex: nameHeaderIndex,
      descriptionIndex: descriptionHeaderIndex,
      startIndex: 1,
      usedHeader: true,
    }
  }

  if ((rows[0]?.length ?? 0) < 2) {
    return { error: 'Paste Code and Name columns, with optional Description as the third column.' }
  }

  return {
    codeIndex: 0,
    nameIndex: 1,
    descriptionIndex: 2,
    startIndex: 0,
    usedHeader: false,
  }
}

type UseReferenceDataControllerArgs = {
  apiBase: string
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
  locationStandards: LocationStandards
  counterpartyStandards: CounterpartyStandards
  commodityClassOrder: readonly string[]
}

export function useReferenceDataController({
  apiBase,
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
  locationStandards,
  counterpartyStandards,
  commodityClassOrder,
}: UseReferenceDataControllerArgs) {
  const [referenceActionError, setReferenceActionError] = useState('')
  const [referenceActionSuccess, setReferenceActionSuccess] = useState('')
  const [savingReference, setSavingReference] = useState(false)
  const [bookSheetDrafts, setBookSheetDrafts] = useState<Record<string, BookForm>>({})
  const [bookSheetApplyErrors, setBookSheetApplyErrors] = useState<Record<string, string>>({})
  const [bookPasteInput, setBookPasteInput] = useState('')
  const [bookPasteSummary, setBookPasteSummary] = useState<BookPasteSummary | null>(null)

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
    locationStandards,
    counterpartyStandards,
    commodityClassOrder,
  })

  const {
    referenceSearch,
    selectedBookCode,
    setSelectedBookCode,
    filteredBooks,
    bookForm,
    setBookForm,
    commodityForm,
    priceIndexForm,
    currencyForm,
    unitForm,
    locationForm,
    setBookFormMode,
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

  function resolveBookSheetForm(code: string): BookForm | null {
    const draft = bookSheetDrafts[code]
    if (draft) {
      return draft
    }

    const record = books.find((book) => book.code === code)
    if (!record) {
      return null
    }

    return buildBookForm(record)
  }

  function validateBookSheetForm(candidate: BookForm): string {
    if (!candidate.code.trim()) {
      return 'Code is required.'
    }

    if (!candidate.name.trim()) {
      return 'Name is required.'
    }

    return ''
  }

  const bookSheetRows = useMemo<BookSheetRow[]>(
    () => {
      const query = referenceSearch.trim().toLowerCase()
      const existingRows = filteredBooks.map((book) => {
        const draft = bookSheetDrafts[book.code]
        const rowForm = draft ?? buildBookForm(book)
        return {
          ...book,
          name: rowForm.name,
          description: rowForm.description,
          sheet_mode: 'update' as const,
          sheet_dirty: draft !== undefined,
          sheet_error: validateBookSheetForm(rowForm) || bookSheetApplyErrors[book.code] || '',
        }
      })
      const createdRows = Object.values(bookSheetDrafts)
        .filter((draft) => !books.some((book) => book.code === draft.code))
        .filter((draft) => {
          if (!query) {
            return true
          }

          return (
            draft.code.toLowerCase().includes(query) ||
            draft.name.toLowerCase().includes(query) ||
            draft.description.toLowerCase().includes(query)
          )
        })
        .map((draft) => ({
          code: draft.code,
          name: draft.name,
          description: draft.description,
          is_active: true,
          sheet_mode: 'create' as const,
          sheet_dirty: true,
          sheet_error: validateBookSheetForm(draft) || bookSheetApplyErrors[draft.code] || '',
        }))

      return [...createdRows, ...existingRows]
    },
    [bookSheetApplyErrors, bookSheetDrafts, books, filteredBooks, referenceSearch],
  )

  const bookSheetDirtyCount = useMemo(
    () => Object.keys(bookSheetDrafts).length,
    [bookSheetDrafts],
  )

  const bookSheetInvalidCount = useMemo(
    () =>
      Object.values(bookSheetDrafts).filter((draft) => Boolean(validateBookSheetForm(draft) || bookSheetApplyErrors[draft.code])).length,
    [bookSheetApplyErrors, bookSheetDrafts],
  )

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
    const errors: Partial<Record<'code' | 'name' | 'location_kind' | 'location_type' | 'coordinates', string>> = {}
    const normalizedLocationKind = locationForm.location_kind.trim().toUpperCase()
    const normalizedLocationType = locationForm.location_type.trim().toUpperCase()
    const allowedLocationKinds = locationStandards.location_kinds
    const allowedLocationTypes = locationStandards.location_types_by_kind[normalizedLocationKind] ?? []
    if (!locationForm.code.trim()) {
      errors.code = 'Code is required.'
    } else if (
      locationFormMode === 'create' &&
      locations.some((location) => location.code === locationForm.code.trim().toUpperCase())
    ) {
      errors.code = 'Code already exists.'
    }
    if (!locationForm.name.trim()) errors.name = 'Name is required.'
    if (!normalizedLocationKind) {
      errors.location_kind = 'Location kind is required.'
    } else if (!allowedLocationKinds.includes(normalizedLocationKind)) {
      errors.location_kind = 'Location kind is invalid.'
    }
    if (!normalizedLocationType) {
      errors.location_type = 'Location type is required.'
    } else if (allowedLocationTypes.length > 0 && !allowedLocationTypes.includes(normalizedLocationType)) {
      errors.location_type = `Location type must be one of ${allowedLocationTypes.join(', ')}.`
    }
    if ((locationForm.latitude.trim() && !locationForm.longitude.trim()) || (!locationForm.latitude.trim() && locationForm.longitude.trim())) {
      errors.coordinates = 'Latitude and longitude must be provided together.'
    }
    return errors
  }, [
    locationForm.code,
    locationForm.latitude,
    locationForm.location_kind,
    locationForm.location_type,
    locationForm.longitude,
    locationForm.name,
    locationFormMode,
    locationStandards,
    locations,
  ])

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
        !sameText(locationForm.location_kind, locationStandards.default_location_kind) ||
        !sameText(
          locationForm.location_type,
          locationStandards.default_location_type_by_kind[locationStandards.default_location_kind] ?? '',
        ) ||
        !sameText(locationForm.parent_location_code, '') ||
        !sameText(locationForm.market, '') ||
        !sameText(locationForm.city, '') ||
        !sameText(locationForm.subdivision_code, '') ||
        !sameText(locationForm.country_code, '') ||
        !sameText(locationForm.continent_code, '') ||
        !sameText(locationForm.latitude, '') ||
        !sameText(locationForm.longitude, '') ||
        !sameText(locationForm.region, '') ||
        !sameText(locationForm.timezone, '') ||
        !sameText(locationForm.description, '')
      )
    }
    if (!selectedLocation) return false
    return (
      !sameText(locationForm.code, selectedLocation.code) ||
      !sameText(locationForm.name, selectedLocation.name) ||
      !sameText(locationForm.location_kind, selectedLocation.location_kind) ||
      !sameText(locationForm.location_type, selectedLocation.location_type) ||
      !sameText(locationForm.parent_location_code, selectedLocation.parent_location_code) ||
      !sameText(locationForm.market, selectedLocation.market) ||
      !sameText(locationForm.city, selectedLocation.city) ||
      !sameText(locationForm.subdivision_code, selectedLocation.subdivision_code) ||
      !sameText(locationForm.country_code, selectedLocation.country_code) ||
      !sameText(locationForm.continent_code, selectedLocation.continent_code) ||
      !sameText(locationForm.latitude, selectedLocation.latitude?.toString()) ||
      !sameText(locationForm.longitude, selectedLocation.longitude?.toString()) ||
      !sameText(locationForm.region, selectedLocation.region) ||
      !sameText(locationForm.timezone, selectedLocation.timezone) ||
      !sameText(locationForm.description, selectedLocation.description)
    )
  }, [locationForm, locationFormMode, locationStandards, selectedLocation])

  function resetReferenceMessages() {
    setReferenceActionError('')
    setReferenceActionSuccess('')
  }

  function beginReferenceAction(action: () => void) {
    resetReferenceMessages()
    action()
  }

  function currentActorId(): string {
    return getMutationContext().actorId
  }

  function clearBookSheetDraft(code: string) {
    setBookSheetDrafts((current) => {
      if (!(code in current)) {
        return current
      }

      const next = { ...current }
      delete next[code]
      return next
    })
    setBookSheetApplyErrors((current) => {
      if (!(code in current)) {
        return current
      }

      const next = { ...current }
      delete next[code]
      return next
    })
  }

  function updateBookSheetField(code: string, field: BookSheetField, value: string) {
    const record = books.find((book) => book.code === code)
    const currentDraft = resolveBookSheetForm(code)
    if (!currentDraft) {
      return
    }

    resetReferenceMessages()
    setBookSheetApplyErrors((current) => {
      if (!(code in current)) {
        return current
      }

      const next = { ...current }
      delete next[code]
      return next
    })

    const nextDraft = {
      ...currentDraft,
      [field]: value,
    }
    const hasChanges =
      !record ||
      !sameText(nextDraft.name, record.name) ||
      !sameText(nextDraft.description, record.description)

    setBookSheetDrafts((current) => {
      const next = { ...current }
      if (hasChanges) {
        next[code] = nextDraft
      } else {
        delete next[code]
      }
      return next
    })

    if (selectedBook?.code === code && bookFormMode === 'edit') {
      setBookForm(nextDraft)
    }
  }

  function resetBookSheetRow(code: string) {
    const record = books.find((book) => book.code === code)
    resetReferenceMessages()
    clearBookSheetDraft(code)

    if (record && selectedBook?.code === code && bookFormMode === 'edit') {
      setBookForm(buildBookForm(record))
      return
    }

    if (!record && selectedBookCode === code && bookFormMode === 'create') {
      setSelectedBookCode(null)
      setBookForm(emptyBookForm())
    }
  }

  function resetAllBookSheetChanges() {
    resetReferenceMessages()
    setBookSheetDrafts({})
    setBookSheetApplyErrors({})

    if (selectedBook && bookFormMode === 'edit') {
      setBookForm(buildBookForm(selectedBook))
      return
    }

    if (selectedBookCode && !selectedBook && bookFormMode === 'create') {
      setSelectedBookCode(null)
      setBookForm(emptyBookForm())
    }
  }

  function clearBookPasteState() {
    setBookPasteInput('')
    setBookPasteSummary(null)
  }

  function stageBooksFromPaste(input: string) {
    const trimmedInput = input.trim()
    resetReferenceMessages()

    if (!trimmedInput) {
      setReferenceActionError('Paste Code and Name rows first, then stage them into the books grid.')
      setReferenceActionSuccess('')
      setBookPasteSummary(null)
      return
    }

    const { rows, delimiter } = parsePastedGrid(trimmedInput)
    const mapping = resolveBookPasteMapping(rows)
    if ('error' in mapping) {
      setReferenceActionError(mapping.error)
      setReferenceActionSuccess('')
      setBookPasteSummary(null)
      return
    }

    const nextDrafts = { ...bookSheetDrafts }
    const nextApplyErrors = { ...bookSheetApplyErrors }
    const issues: BookPasteIssue[] = []
    let stagedRows = 0
    let newRows = 0
    let updatedRows = 0
    let invalidRows = 0
    let unchangedRows = 0
    let blockedRows = 0

    for (let rowIndex = mapping.startIndex; rowIndex < rows.length; rowIndex += 1) {
      const cells = rows[rowIndex]
      const displayRowNumber = rowIndex + 1
      const rawCode = (cells[mapping.codeIndex] ?? '').trim()
      const rawName = (cells[mapping.nameIndex] ?? '').trim()
      const rawDescription =
        mapping.descriptionIndex >= 0 ? (cells[mapping.descriptionIndex] ?? '').trim() : null

      if (!rawCode) {
        issues.push({ row_number: displayRowNumber, code: null, message: 'Missing Code.' })
        blockedRows += 1
        continue
      }

      const code = rawCode.toUpperCase()
      const record = books.find((book) => book.code === code)
      const nextDraft = {
        code,
        name: rawName,
        description: rawDescription ?? (nextDrafts[code]?.description ?? record?.description ?? ''),
      }

      const hasChanges =
        !record ||
        !sameText(nextDraft.name, record.name) ||
        !sameText(nextDraft.description, record.description)
      if (!hasChanges) {
        delete nextDrafts[code]
        delete nextApplyErrors[code]
        unchangedRows += 1
        continue
      }

      nextDrafts[code] = nextDraft
      if (record) {
        updatedRows += 1
      } else {
        newRows += 1
      }
      const validationError = validateBookSheetForm(nextDraft)
      if (validationError) {
        nextApplyErrors[code] = validationError
        invalidRows += 1
      } else {
        delete nextApplyErrors[code]
      }

      stagedRows += 1
    }

    setBookSheetDrafts(nextDrafts)
    setBookSheetApplyErrors(nextApplyErrors)
    setBookPasteSummary({
      total_rows: rows.length - mapping.startIndex,
      staged_rows: stagedRows,
      new_rows: newRows,
      updated_rows: updatedRows,
      invalid_rows: invalidRows,
      unchanged_rows: unchangedRows,
      blocked_rows: blockedRows,
      issues,
      used_header: mapping.usedHeader,
      delimiter,
    })

    if (selectedBook && bookFormMode === 'edit') {
      const selectedDraft = nextDrafts[selectedBook.code]
      setBookForm(selectedDraft ?? buildBookForm(selectedBook))
    } else if (selectedBookCode && !selectedBook && bookFormMode === 'create') {
      const selectedDraft = nextDrafts[selectedBookCode]
      if (selectedDraft) {
        setBookForm(selectedDraft)
      }
    }

    if (stagedRows > 0) {
      setReferenceActionSuccess(`Staged ${stagedRows} pasted book row${stagedRows === 1 ? '' : 's'}.`)
      if (blockedRows > 0 || invalidRows > 0) {
        setReferenceActionError(
          `${blockedRows + invalidRows} pasted row${blockedRows + invalidRows === 1 ? '' : 's'} need attention before apply.`,
        )
      }
      return
    }

    if (unchangedRows > 0 && blockedRows === 0) {
      setReferenceActionSuccess(`Paste matched ${unchangedRows} existing book row${unchangedRows === 1 ? '' : 's'} but added no new staged changes.`)
      setReferenceActionError('')
      return
    }

    setReferenceActionError('No pasted rows were staged. Review the import summary and adjust the pasted data.')
    setReferenceActionSuccess('')
  }

  async function applyBookSheetChanges(targetCodes?: string[]) {
    const candidateCodes = targetCodes?.length
      ? targetCodes
      : Object.keys(bookSheetDrafts)
    const dirtyCodes = candidateCodes.filter((code, index) => candidateCodes.indexOf(code) === index && bookSheetDrafts[code])

    if (dirtyCodes.length === 0) {
      setReferenceActionError('There are no staged book changes to apply.')
      setReferenceActionSuccess('')
      return
    }

    setSavingReference(true)
    resetReferenceMessages()

    const nextDrafts = { ...bookSheetDrafts }
    const nextApplyErrors = { ...bookSheetApplyErrors }
    const actorId = currentActorId()
    let successCount = 0
    const successfulDrafts: Record<string, BookForm> = {}

    try {
      for (const code of dirtyCodes) {
        const draft = nextDrafts[code]
        if (!draft) {
          continue
        }

        const validationError = validateBookSheetForm(draft)
        if (validationError) {
          nextApplyErrors[code] = validationError
          continue
        }

        try {
          const existingRecord = books.find((book) => book.code === code)
          if (existingRecord) {
            await submitReferenceMutation(
              apiBase,
              `/reference/books/${code}`,
              'PUT',
              {
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                updated_by: actorId,
              },
            )
          } else {
            await submitReferenceMutation(
              apiBase,
              '/reference/books',
              'POST',
              {
                code,
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                created_by: actorId,
              },
            )
          }
          successfulDrafts[code] = draft
          delete nextDrafts[code]
          delete nextApplyErrors[code]
          successCount += 1
        } catch (err) {
          nextApplyErrors[code] = err instanceof Error ? err.message : 'Book update failed.'
        }
      }

      setBookSheetDrafts(nextDrafts)
      setBookSheetApplyErrors(nextApplyErrors)

      if (successCount > 0) {
        await reloadData()
        if (selectedBookCode && successfulDrafts[selectedBookCode]) {
          setSelectedBookCode(selectedBookCode)
          setBookFormMode('edit')
          setBookForm(successfulDrafts[selectedBookCode])
        }
      }

      const failureCount = Object.keys(nextApplyErrors).filter((code) => dirtyCodes.includes(code)).length
      if (successCount > 0 && failureCount === 0) {
        setReferenceActionSuccess(`Applied ${successCount} staged book ${successCount === 1 ? 'change' : 'changes'}.`)
        return
      }

      if (successCount > 0) {
        setReferenceActionSuccess(`Applied ${successCount} staged book ${successCount === 1 ? 'change' : 'changes'}.`)
        setReferenceActionError(`${failureCount} row${failureCount === 1 ? '' : 's'} still need attention before they can be applied.`)
        return
      }

      setReferenceActionError('No staged book changes were applied. Review the highlighted rows and try again.')
    } finally {
      setSavingReference(false)
    }
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
    beginReferenceAction(() => {
      setSelectedBookCode(null)
      startCreateBookBase()
    })
  }

  function startEditBook(code: string) {
    beginReferenceAction(() => {
      const draft = resolveBookSheetForm(code)
      const record = books.find((book) => book.code === code)
      if (record) {
        startEditBookBase(code)
        if (draft) {
          setBookForm(draft)
        }
        return
      }

      if (draft) {
        setSelectedBookCode(code)
        setBookFormMode('create')
        setBookForm(draft)
      }
    })
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
      const stagedDraftCode = selectedBookCode && !selectedBook ? selectedBookCode : null
      await submitReference(
        '/reference/books',
        'POST',
        { code, name: bookForm.name.trim(), description: bookForm.description.trim() || null, created_by: currentActorId() },
        `Book ${code} created.`,
      )
      if (stagedDraftCode) {
        clearBookSheetDraft(stagedDraftCode)
      }
      startEditBookBase(code)
    } else if (selectedBook) {
      await submitReference(
        `/reference/books/${selectedBook.code}`,
        'PUT',
        { name: bookForm.name.trim(), description: bookForm.description.trim() || null, updated_by: currentActorId() },
        `Book ${selectedBook.code} updated.`,
      )
      clearBookSheetDraft(selectedBook.code)
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
          created_by: currentActorId(),
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
          updated_by: currentActorId(),
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
      { updated_by: currentActorId() },
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
      { updated_by: currentActorId() },
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
      await submitReference('/reference/price-indices', 'POST', { ...payload, created_by: currentActorId() }, `Price index ${payload.code} created.`)
      startEditPriceIndexBase(payload.code)
    } else if (selectedPriceIndex) {
      await submitReference(
        `/reference/price-indices/${selectedPriceIndex.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
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
      { updated_by: currentActorId() },
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
      await submitReference('/reference/currencies', 'POST', { ...payload, created_by: currentActorId() }, `Currency ${payload.code} created.`)
      startEditCurrencyBase(payload.code)
    } else if (selectedCurrency) {
      await submitReference(
        `/reference/currencies/${selectedCurrency.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
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
      { updated_by: currentActorId() },
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
      await submitReference('/reference/units', 'POST', { ...payload, created_by: currentActorId() }, `Unit ${payload.code} created.`)
      startEditUnitBase(payload.code)
    } else if (selectedUnit) {
      await submitReference(
        `/reference/units/${selectedUnit.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
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
      { updated_by: currentActorId() },
      `Unit ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!locationForm.code.trim() || !locationForm.name.trim() || !locationForm.location_kind.trim() || !locationForm.location_type.trim()) {
      setReferenceActionError('Location code, name, kind, and location type are required.')
      return
    }

    const latitude = locationForm.latitude.trim() ? Number(locationForm.latitude) : null
    const longitude = locationForm.longitude.trim() ? Number(locationForm.longitude) : null
    if ((latitude === null) !== (longitude === null)) {
      setReferenceActionError('Latitude and longitude must be provided together.')
      return
    }
    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      setReferenceActionError('Latitude and longitude must be numeric.')
      return
    }

    const payload = {
      code: locationForm.code.trim().toUpperCase(),
      name: locationForm.name.trim(),
      location_kind: locationForm.location_kind.trim().toUpperCase(),
      location_type: locationForm.location_type.trim().toUpperCase(),
      parent_location_code: locationForm.parent_location_code.trim().toUpperCase() || null,
      market: locationForm.market.trim() || null,
      city: locationForm.city.trim() || null,
      subdivision_code: locationForm.subdivision_code.trim().toUpperCase() || null,
      country_code: locationForm.country_code.trim().toUpperCase() || null,
      continent_code: locationForm.continent_code.trim().toUpperCase() || null,
      latitude,
      longitude,
      region: locationForm.region.trim() || null,
      timezone: locationForm.timezone.trim() || null,
      description: locationForm.description.trim() || null,
    }

    if (locationFormMode === 'create') {
      await submitReference('/reference/locations', 'POST', { ...payload, created_by: currentActorId() }, `Location ${payload.code} created.`)
      startEditLocationBase(payload.code)
    } else if (selectedLocation) {
      await submitReference(
        `/reference/locations/${selectedLocation.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
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
      { updated_by: currentActorId() },
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
      credit_status: workspace.counterpartyForm.credit_status.trim() || null,
      description: workspace.counterpartyForm.description.trim() || null,
    }

    if (workspace.counterpartyFormMode === 'create') {
      await submitReference('/reference/counterparties', 'POST', { ...payload, created_by: currentActorId() }, `Counterparty ${payload.code} created.`)
      startEditCounterpartyBase(payload.code)
    } else if (selectedCounterparty) {
      await submitReference(
        `/reference/counterparties/${selectedCounterparty.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
        `Counterparty ${selectedCounterparty.code} updated.`,
      )
    }
  }

  async function handleToggleCounterparty(record: CounterpartyRecord) {
    await submitReference(
      `/reference/counterparties/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
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
      await submitReference('/reference/portfolios', 'POST', { ...payload, created_by: currentActorId() }, `Portfolio ${payload.code} created.`)
      startEditPortfolioBase(payload.code)
    } else if (selectedPortfolio) {
      await submitReference(
        `/reference/portfolios/${selectedPortfolio.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
        `Portfolio ${selectedPortfolio.code} updated.`,
      )
    }
  }

  async function handleTogglePortfolio(record: PortfolioRecord) {
    await submitReference(
      `/reference/portfolios/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
      `Portfolio ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  return {
    ...workspace,
    activeBooks,
    activeCommodities,
    activeCurrencies,
    activeLocations,
    locationStandards,
    counterpartyStandards,
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
    bookPasteInput,
    setBookPasteInput,
    bookPasteSummary,
    bookSheetRows,
    bookSheetDirtyCount,
    bookSheetInvalidCount,
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
    updateBookSheetField,
    stageBooksFromPaste,
    clearBookPasteState,
    applyBookSheetChanges,
    resetBookSheetRow,
    resetAllBookSheetChanges,
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
