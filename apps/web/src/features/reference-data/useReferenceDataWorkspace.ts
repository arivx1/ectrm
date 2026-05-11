import { useMemo, useState } from 'react'

import { combineTextFilters } from '../../shared/filtering'
import { classForCommodity } from '../../shared/reference'
import type {
  AssetForm,
  AssetRecord,
  AssetStandards,
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
  RailRouteForm,
  RailRouteRecord,
  ReferenceRecord,
  ReferenceTab,
  SpatialFeatureForm,
  SpatialFeatureRecord,
  SpatialFeatureStandards,
  UnitForm,
  UnitRecord,
} from '../../shared/models'
import {
  DEFAULT_ASSET_STANDARDS as defaultAssetStandards,
  DEFAULT_COUNTERPARTY_STANDARDS as defaultCounterpartyStandards,
  DEFAULT_LOCATION_STANDARDS as defaultLocationStandards,
  DEFAULT_SPATIAL_FEATURE_STANDARDS as defaultSpatialFeatureStandards,
} from '../../shared/models'
import { formatAssetGeometryInput } from './referenceDataFormState'

export function emptyBookForm(): BookForm {
  return { code: '', name: '', description: '' }
}

export function emptyCommodityForm(defaultClass: string): CommodityForm {
  return { code: '', name: '', description: '', commodity_class: defaultClass }
}

export function emptyAssetForm(assetStandards: AssetStandards = defaultAssetStandards): AssetForm {
  const defaultAssetClass = assetStandards.default_asset_class
  const defaultAssetType =
    assetStandards.default_asset_type_by_class[defaultAssetClass] ??
    assetStandards.asset_types_by_class[defaultAssetClass]?.[0] ??
    ''
  return {
    code: '',
    name: '',
    asset_class: defaultAssetClass,
    asset_type: defaultAssetType,
    asset_reality: assetStandards.default_asset_reality,
    commodity_code: '',
    location_code: '',
    latitude: '',
    longitude: '',
    geometry_geojson: '',
    capacity_value: '',
    capacity_unit_code: '',
    operator_name: '',
    operating_status: assetStandards.default_operating_status,
    description: '',
  }
}

export function emptySpatialFeatureForm(
  spatialFeatureStandards: SpatialFeatureStandards = defaultSpatialFeatureStandards,
): SpatialFeatureForm {
  return {
    code: '',
    name: '',
    feature_kind: spatialFeatureStandards.default_feature_kind,
    entity_type: '',
    entity_code: '',
    label_latitude: '',
    label_longitude: '',
    is_primary: false,
    geometry_geojson: '',
    description: '',
  }
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

export function emptyRailRouteForm(): RailRouteForm {
  return {
    code: '',
    name: '',
    rail_line_code: '',
    origin_location_code: '',
    destination_location_code: '',
    service_calendar_code: '',
    route_direction: 'BIDIRECTIONAL',
    schedule_timezone: '',
    placement_cutoff_time_local: '',
    release_cutoff_time_local: '',
    placement_free_time_hours: '',
    release_free_time_hours: '',
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
  assets: AssetRecord[]
  commodities: ReferenceRecord[]
  priceIndices: PriceIndexRecord[]
  currencies: CurrencyRecord[]
  units: UnitRecord[]
  locations: LocationRecord[]
  railRoutes: RailRouteRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  assetStandards: AssetStandards
  spatialFeatureStandards: SpatialFeatureStandards
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
  externalReferenceSearch?: string
}

export function useReferenceDataWorkspace({
  books,
  assets,
  commodities,
  priceIndices,
  currencies,
  units,
  locations,
  railRoutes,
  spatialFeatures,
  assetStandards,
  spatialFeatureStandards,
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
  externalReferenceSearch,
}: UseReferenceDataWorkspaceArgs) {
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>('books')
  const [referenceSearch, setReferenceSearch] = useState('')
  const [selectedBookCode, setSelectedBookCode] = useState<string | null>(null)
  const [selectedAssetCode, setSelectedAssetCode] = useState<string | null>(null)
  const [selectedCommodityCode, setSelectedCommodityCode] = useState<string | null>(null)
  const [selectedPriceIndexCode, setSelectedPriceIndexCode] = useState<string | null>(null)
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string | null>(null)
  const [selectedUnitCode, setSelectedUnitCode] = useState<string | null>(null)
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null)
  const [selectedRailRouteCode, setSelectedRailRouteCode] = useState<string | null>(null)
  const [selectedSpatialFeatureCode, setSelectedSpatialFeatureCode] = useState<string | null>(null)
  const [selectedCounterpartyCode, setSelectedCounterpartyCode] = useState<string | null>(null)
  const [selectedPortfolioCode, setSelectedPortfolioCode] = useState<string | null>(null)

  const [bookForm, setBookForm] = useState(emptyBookForm())
  const [assetForm, setAssetForm] = useState(emptyAssetForm(assetStandards))
  const [commodityForm, setCommodityForm] = useState(emptyCommodityForm(commodityClassOrder[0]))
  const [priceIndexForm, setPriceIndexForm] = useState(emptyPriceIndexForm())
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm())
  const [unitForm, setUnitForm] = useState(emptyUnitForm(commodityClassOrder[0]))
  const [locationForm, setLocationForm] = useState(emptyLocationForm(locationStandards))
  const [railRouteForm, setRailRouteForm] = useState(emptyRailRouteForm())
  const [spatialFeatureForm, setSpatialFeatureForm] = useState(emptySpatialFeatureForm(spatialFeatureStandards))
  const [counterpartyForm, setCounterpartyForm] = useState(emptyCounterpartyForm(counterpartyStandards))
  const [portfolioForm, setPortfolioForm] = useState(emptyPortfolioForm())

  const [bookFormMode, setBookFormMode] = useState<'create' | 'edit'>('create')
  const [assetFormMode, setAssetFormMode] = useState<'create' | 'edit'>('create')
  const [commodityFormMode, setCommodityFormMode] = useState<'create' | 'edit'>('create')
  const [priceIndexFormMode, setPriceIndexFormMode] = useState<'create' | 'edit'>('create')
  const [currencyFormMode, setCurrencyFormMode] = useState<'create' | 'edit'>('create')
  const [unitFormMode, setUnitFormMode] = useState<'create' | 'edit'>('create')
  const [locationFormMode, setLocationFormMode] = useState<'create' | 'edit'>('create')
  const [railRouteFormMode, setRailRouteFormMode] = useState<'create' | 'edit'>('create')
  const [spatialFeatureFormMode, setSpatialFeatureFormMode] = useState<'create' | 'edit'>('create')
  const [counterpartyFormMode, setCounterpartyFormMode] = useState<'create' | 'edit'>('create')
  const [portfolioFormMode, setPortfolioFormMode] = useState<'create' | 'edit'>('create')
  const effectiveReferenceSearch = combineTextFilters(referenceSearch, externalReferenceSearch)

  const resolvedSelectedBookCode = resolveSelectedCode(selectedBookCode, books, { preserveMissingSelection: true })
  const resolvedSelectedAssetCode = resolveSelectedCode(selectedAssetCode, assets)
  const resolvedSelectedCommodityCode = resolveSelectedCode(selectedCommodityCode, commodities)
  const resolvedSelectedPriceIndexCode = resolveSelectedCode(selectedPriceIndexCode, priceIndices)
  const resolvedSelectedCurrencyCode = resolveSelectedCode(selectedCurrencyCode, currencies)
  const resolvedSelectedUnitCode = resolveSelectedCode(selectedUnitCode, units)
  const resolvedSelectedLocationCode = resolveSelectedCode(selectedLocationCode, locations)
  const resolvedSelectedRailRouteCode = resolveSelectedCode(selectedRailRouteCode, railRoutes)
  const resolvedSelectedSpatialFeatureCode = resolveSelectedCode(selectedSpatialFeatureCode, spatialFeatures)
  const resolvedSelectedCounterpartyCode = resolveSelectedCode(selectedCounterpartyCode, counterparties)
  const resolvedSelectedPortfolioCode = resolveSelectedCode(selectedPortfolioCode, portfolios)

  const selectedBook = useMemo(
    () => books.find((book) => book.code === resolvedSelectedBookCode) ?? null,
    [books, resolvedSelectedBookCode],
  )
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.code === resolvedSelectedAssetCode) ?? null,
    [assets, resolvedSelectedAssetCode],
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
  const selectedRailRoute = useMemo(
    () => railRoutes.find((route) => route.code === resolvedSelectedRailRouteCode) ?? null,
    [railRoutes, resolvedSelectedRailRouteCode],
  )
  const selectedSpatialFeature = useMemo(
    () => spatialFeatures.find((feature) => feature.code === resolvedSelectedSpatialFeatureCode) ?? null,
    [resolvedSelectedSpatialFeatureCode, spatialFeatures],
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
    const query = effectiveReferenceSearch.trim().toLowerCase()
    return books.filter((book) => {
      if (!query) return true
      return (
        book.code.toLowerCase().includes(query) ||
        book.name.toLowerCase().includes(query) ||
        (book.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [books, effectiveReferenceSearch])

  const filteredAssets = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
    return assets.filter((asset) => {
      if (!query) return true
      return (
        asset.code.toLowerCase().includes(query) ||
        asset.name.toLowerCase().includes(query) ||
        asset.asset_class.toLowerCase().includes(query) ||
        asset.asset_type.toLowerCase().includes(query) ||
        asset.asset_reality.toLowerCase().includes(query) ||
        asset.operating_status.toLowerCase().includes(query) ||
        (asset.commodity_code ?? '').toLowerCase().includes(query) ||
        (asset.location_code ?? '').toLowerCase().includes(query) ||
        (asset.latitude?.toString() ?? '').toLowerCase().includes(query) ||
        (asset.longitude?.toString() ?? '').toLowerCase().includes(query) ||
        formatAssetGeometryInput(asset.geometry_geojson).toLowerCase().includes(query) ||
        (asset.capacity_unit_code ?? '').toLowerCase().includes(query) ||
        (asset.operator_name ?? '').toLowerCase().includes(query) ||
        (asset.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [assets, effectiveReferenceSearch])

  const referenceCommodityGroups = useMemo(
    () =>
      commodityClassOrder.map((commodityClass) => ({
        commodityClass,
        items: commodities
          .filter((commodity) => commodity.commodity_class === commodityClass)
          .filter((commodity) => {
            const query = effectiveReferenceSearch.trim().toLowerCase()
            if (!query) return true
            return (
              commodity.code.toLowerCase().includes(query) ||
              commodity.name.toLowerCase().includes(query) ||
              (commodity.description ?? '').toLowerCase().includes(query)
            )
          }),
      })).filter((group) => group.items.length > 0),
    [commodities, commodityClassOrder, effectiveReferenceSearch],
  )

  const filteredPriceIndices = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
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
  }, [effectiveReferenceSearch, priceIndices])

  const filteredCurrencies = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
    return currencies.filter((currency) => {
      if (!query) return true
      return (
        currency.code.toLowerCase().includes(query) ||
        currency.name.toLowerCase().includes(query) ||
        (currency.symbol ?? '').toLowerCase().includes(query) ||
        (currency.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [currencies, effectiveReferenceSearch])

  const filteredUnits = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
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
  }, [effectiveReferenceSearch, units])

  const filteredLocations = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
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
  }, [effectiveReferenceSearch, locations])

  const filteredRailRoutes = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
    return railRoutes.filter((route) => {
      if (!query) return true
      return (
        route.code.toLowerCase().includes(query) ||
        route.name.toLowerCase().includes(query) ||
        route.rail_line_code.toLowerCase().includes(query) ||
        (route.origin_location_code ?? '').toLowerCase().includes(query) ||
        (route.destination_location_code ?? '').toLowerCase().includes(query) ||
        (route.service_calendar_code ?? '').toLowerCase().includes(query) ||
        route.route_direction.toLowerCase().includes(query) ||
        (route.schedule_timezone ?? '').toLowerCase().includes(query) ||
        (route.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [effectiveReferenceSearch, railRoutes])

  const filteredSpatialFeatures = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
    return spatialFeatures.filter((feature) => {
      if (!query) return true
      return (
        feature.code.toLowerCase().includes(query) ||
        feature.name.toLowerCase().includes(query) ||
        feature.feature_kind.toLowerCase().includes(query) ||
        feature.geometry_type.toLowerCase().includes(query) ||
        (feature.entity_type ?? '').toLowerCase().includes(query) ||
        (feature.entity_code ?? '').toLowerCase().includes(query) ||
        formatAssetGeometryInput(feature.geometry_geojson).toLowerCase().includes(query) ||
        (feature.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [effectiveReferenceSearch, spatialFeatures])

  const filteredCounterparties = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
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
  }, [counterparties, effectiveReferenceSearch])

  const filteredPortfolios = useMemo(() => {
    const query = effectiveReferenceSearch.trim().toLowerCase()
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
  }, [effectiveReferenceSearch, portfolios])

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

  const activeAssets = useMemo(() => assets.filter((asset) => asset.is_active), [assets])
  const activeRailRoutes = useMemo(() => railRoutes.filter((route) => route.is_active), [railRoutes])

  function startCreateBook() {
    setBookFormMode('create')
    setBookForm(emptyBookForm())
  }

  function startCreateAsset() {
    setAssetFormMode('create')
    setAssetForm(emptyAssetForm(assetStandards))
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

  function startEditAsset(code: string) {
    const record = assets.find((asset) => asset.code === code)
    if (!record) {
      return
    }
    setSelectedAssetCode(code)
    setAssetFormMode('edit')
    setAssetForm({
      code: record.code,
      name: record.name,
      asset_class: record.asset_class,
      asset_type: record.asset_type,
      asset_reality: record.asset_reality,
      commodity_code: record.commodity_code ?? '',
      location_code: record.location_code ?? '',
      latitude: record.latitude?.toString() ?? '',
      longitude: record.longitude?.toString() ?? '',
      geometry_geojson: formatAssetGeometryInput(record.geometry_geojson),
      capacity_value: record.capacity_value?.toString() ?? '',
      capacity_unit_code: record.capacity_unit_code ?? '',
      operator_name: record.operator_name ?? '',
      operating_status: record.operating_status,
      description: record.description ?? '',
    })
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

  function startCreateRailRoute() {
    setRailRouteFormMode('create')
    setRailRouteForm(emptyRailRouteForm())
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

  function startEditRailRoute(code: string) {
    const record = railRoutes.find((route) => route.code === code)
    if (!record) {
      return
    }
    setSelectedRailRouteCode(code)
    setRailRouteFormMode('edit')
    setRailRouteForm({
      code: record.code,
      name: record.name,
      rail_line_code: record.rail_line_code,
      origin_location_code: record.origin_location_code ?? '',
      destination_location_code: record.destination_location_code ?? '',
      service_calendar_code: record.service_calendar_code ?? '',
      route_direction: record.route_direction,
      schedule_timezone: record.schedule_timezone ?? '',
      placement_cutoff_time_local: record.placement_cutoff_time_local ?? '',
      release_cutoff_time_local: record.release_cutoff_time_local ?? '',
      placement_free_time_hours: record.placement_free_time_hours?.toString() ?? '',
      release_free_time_hours: record.release_free_time_hours?.toString() ?? '',
      description: record.description ?? '',
    })
  }

  function startCreateSpatialFeature() {
    setSpatialFeatureFormMode('create')
    setSpatialFeatureForm(emptySpatialFeatureForm(spatialFeatureStandards))
  }

  function startEditSpatialFeature(code: string) {
    const record = spatialFeatures.find((feature) => feature.code === code)
    if (!record) {
      return
    }
    setSelectedSpatialFeatureCode(code)
    setSpatialFeatureFormMode('edit')
    setSpatialFeatureForm({
      code: record.code,
      name: record.name,
      feature_kind: record.feature_kind,
      entity_type: record.entity_type ?? '',
      entity_code: record.entity_code ?? '',
      label_latitude: record.label_latitude?.toString() ?? '',
      label_longitude: record.label_longitude?.toString() ?? '',
      is_primary: record.is_primary,
      geometry_geojson: formatAssetGeometryInput(record.geometry_geojson),
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
    assets,
    locations,
    railRoutes,
    spatialFeatures,
    selectedBookCode: resolvedSelectedBookCode,
    setSelectedBookCode,
    selectedAssetCode: resolvedSelectedAssetCode,
    setSelectedAssetCode,
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
    selectedRailRouteCode: resolvedSelectedRailRouteCode,
    setSelectedRailRouteCode,
    selectedSpatialFeatureCode: resolvedSelectedSpatialFeatureCode,
    setSelectedSpatialFeatureCode,
    selectedCounterpartyCode: resolvedSelectedCounterpartyCode,
    setSelectedCounterpartyCode,
    selectedPortfolioCode: resolvedSelectedPortfolioCode,
    setSelectedPortfolioCode,
    bookForm,
    setBookForm,
    assetForm,
    setAssetForm,
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
    railRouteForm,
    setRailRouteForm,
    spatialFeatureForm,
    setSpatialFeatureForm,
    counterpartyForm,
    setCounterpartyForm,
    portfolioForm: resolvedPortfolioForm,
    setPortfolioForm,
    bookFormMode,
    setBookFormMode,
    assetFormMode,
    setAssetFormMode,
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
    railRouteFormMode,
    setRailRouteFormMode,
    spatialFeatureFormMode,
    setSpatialFeatureFormMode,
    counterpartyFormMode,
    setCounterpartyFormMode,
    portfolioFormMode,
    setPortfolioFormMode,
    selectedBook,
    selectedAsset,
    selectedCommodity,
    selectedPriceIndex,
    selectedCurrency,
    selectedUnit,
    selectedLocation,
    selectedRailRoute,
    selectedSpatialFeature,
    selectedCounterparty,
    selectedPortfolio,
    filteredBooks,
    filteredAssets,
    referenceCommodityGroups,
    filteredPriceIndices,
    filteredCurrencies,
    filteredUnits,
    filteredLocations,
    filteredRailRoutes,
    filteredSpatialFeatures,
    filteredCounterparties,
    filteredPortfolios,
    selectablePriceIndexUnits,
    activeAssets,
    activeRailRoutes,
    startCreateBook,
    startEditBook,
    startCreateAsset,
    startEditAsset,
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
    startCreateRailRoute,
    startEditRailRoute,
    startCreateSpatialFeature,
    startEditSpatialFeature,
    startCreateCounterparty,
    startEditCounterparty,
    startCreatePortfolio,
    startEditPortfolio,
  }
}
