import type {
  BookForm,
  CommodityForm,
  CounterpartyCreditProfileForm,
  CounterpartyCreditProfileRecord,
  CounterpartyRecord,
  CounterpartyStandards,
  CurrencyForm,
  CurrencyRecord,
  LocationForm,
  LocationRecord,
  LocationStandards,
  PriceIndexForm,
  PriceIndexRecord,
  ReferenceRecord,
  UnitForm,
  UnitRecord,
} from '../../shared/models'
import { buildCounterpartyCreditProfileForm, sameText } from './referenceDataHelpers'

export function buildBookFieldErrors(
  bookForm: BookForm,
  bookFormMode: 'create' | 'edit',
  books: ReferenceRecord[],
): Partial<Record<'code' | 'name', string>> {
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
}

export function buildCommodityFieldErrors(
  commodityForm: CommodityForm,
  commodityFormMode: 'create' | 'edit',
  commodities: ReferenceRecord[],
): Partial<Record<'code' | 'name' | 'commodity_class', string>> {
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
}

export function buildPriceIndexFieldErrors(
  priceIndexForm: PriceIndexForm,
  priceIndexFormMode: 'create' | 'edit',
  priceIndices: PriceIndexRecord[],
): Partial<Record<'code' | 'name' | 'commodity_code' | 'provider' | 'currency_code' | 'unit_code', string>> {
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
}

export function buildCurrencyFieldErrors(
  currencyForm: CurrencyForm,
  currencyFormMode: 'create' | 'edit',
  currencies: CurrencyRecord[],
): Partial<Record<'code' | 'name', string>> {
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
}

export function buildUnitFieldErrors(
  unitForm: UnitForm,
  unitFormMode: 'create' | 'edit',
  units: UnitRecord[],
): Partial<Record<'code' | 'name' | 'commodity_class' | 'dimension' | 'precision', string>> {
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
}

export function buildLocationFieldErrors(
  locationForm: LocationForm,
  locationFormMode: 'create' | 'edit',
  locations: LocationRecord[],
  locationStandards: LocationStandards,
): Partial<Record<'code' | 'name' | 'location_kind' | 'location_type' | 'coordinates', string>> {
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
}

export function buildCounterpartyCreditProfileFieldErrors(
  counterpartyCreditProfileForm: CounterpartyCreditProfileForm,
): Partial<Record<'limit_currency_code' | 'limit_amount', string>> {
  const errors: Partial<Record<'limit_currency_code' | 'limit_amount', string>> = {}
  const limitCurrencyCode = counterpartyCreditProfileForm.limit_currency_code.trim().toUpperCase()
  const limitAmountText = counterpartyCreditProfileForm.limit_amount.trim()

  if (limitAmountText) {
    const parsedLimitAmount = Number(limitAmountText)
    if (Number.isNaN(parsedLimitAmount)) {
      errors.limit_amount = 'Limit amount must be numeric.'
    } else if (parsedLimitAmount <= 0) {
      errors.limit_amount = 'Limit amount must be greater than 0.'
    }
  }

  if (limitCurrencyCode && !limitAmountText) {
    errors.limit_amount = 'Limit amount is required when a limit currency is set.'
  }

  if (!limitCurrencyCode && limitAmountText) {
    errors.limit_currency_code = 'Limit currency is required when a limit amount is set.'
  }

  return errors
}

export function isBookFormDirty(
  bookForm: BookForm,
  bookFormMode: 'create' | 'edit',
  selectedBook: ReferenceRecord | null,
): boolean {
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
}

export function isCommodityFormDirty(
  commodityForm: CommodityForm,
  commodityFormMode: 'create' | 'edit',
  selectedCommodity: ReferenceRecord | null,
  commodityClassOrder: readonly string[],
): boolean {
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
}

export function isPriceIndexFormDirty(
  priceIndexForm: PriceIndexForm,
  priceIndexFormMode: 'create' | 'edit',
  selectedPriceIndex: PriceIndexRecord | null,
  activeCommodities: ReferenceRecord[],
): boolean {
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
}

export function isCurrencyFormDirty(
  currencyForm: CurrencyForm,
  currencyFormMode: 'create' | 'edit',
  selectedCurrency: CurrencyRecord | null,
): boolean {
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
}

export function isUnitFormDirty(
  unitForm: UnitForm,
  unitFormMode: 'create' | 'edit',
  selectedUnit: UnitRecord | null,
  selectedCommodity: ReferenceRecord | null,
  commodityClassOrder: readonly string[],
): boolean {
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
}

export function isLocationFormDirty(
  locationForm: LocationForm,
  locationFormMode: 'create' | 'edit',
  selectedLocation: LocationRecord | null,
  locationStandards: LocationStandards,
): boolean {
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
}

export function isCounterpartyCreditProfileDirty(
  counterpartyCreditProfileForm: CounterpartyCreditProfileForm,
  counterpartyFormMode: 'create' | 'edit',
  selectedCounterparty: CounterpartyRecord | null,
  selectedCounterpartyCreditProfile: CounterpartyCreditProfileRecord | null,
  counterpartyStandards: CounterpartyStandards,
): boolean {
  if (counterpartyFormMode !== 'edit' || !selectedCounterparty) {
    return false
  }

  const baseline = buildCounterpartyCreditProfileForm(selectedCounterpartyCreditProfile, counterpartyStandards)
  return (
    !sameText(counterpartyCreditProfileForm.credit_rating, baseline.credit_rating) ||
    !sameText(counterpartyCreditProfileForm.review_due_at, baseline.review_due_at) ||
    !sameText(counterpartyCreditProfileForm.limit_currency_code, baseline.limit_currency_code) ||
    !sameText(counterpartyCreditProfileForm.limit_amount, baseline.limit_amount) ||
    !sameText(counterpartyCreditProfileForm.breach_action, baseline.breach_action) ||
    !sameText(counterpartyCreditProfileForm.notes, baseline.notes)
  )
}
