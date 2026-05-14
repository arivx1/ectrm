import { useMemo } from 'react'

import type {
  AssetRecord,
  AssetStandards,
  CurrencyRecord,
  LocationRecord,
  LocationStandards,
  PortfolioRecord,
  PriceIndexRecord,
  RailRouteRecord,
  ReferenceRecord,
  SpatialFeatureRecord,
  SpatialFeatureStandards,
  UnitRecord,
} from '../../shared/models'
import { type useReferenceDataWorkspace } from './useReferenceDataWorkspace'
import {
  buildAssetFieldErrors,
  buildCommodityFieldErrors,
  buildCurrencyFieldErrors,
  buildLocationFieldErrors,
  buildRailRouteFieldErrors,
  buildSpatialFeatureFieldErrors,
  parseAssetCoordinatePair,
  parseAssetGeometryInput,
  buildPriceIndexFieldErrors,
  buildUnitFieldErrors,
  isAssetFormDirty,
  isCommodityFormDirty,
  isCurrencyFormDirty,
  isLocationFormDirty,
  isPriceIndexFormDirty,
  isRailRouteFormDirty,
  isSpatialFeatureFormDirty,
  isUnitFormDirty,
} from './referenceDataFormState'

type ReferenceDataWorkspaceState = ReturnType<typeof useReferenceDataWorkspace>

type SubmitReference = (
  path: string,
  method: 'POST' | 'PUT',
  payload: Record<string, unknown>,
  successMessage: string,
) => Promise<void>

type EntityControllerActions = {
  beginReferenceAction: (action: () => void) => void
  currentActorId: () => string
  submitReference: SubmitReference
  setReferenceActionError: (message: string) => void
  setReferenceActionSuccess: (message: string) => void
}

export function useReferenceDataAssetController({
  workspace,
  assets,
  assetStandards,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'assetForm'
    | 'assetFormMode'
    | 'selectedAsset'
    | 'startCreateAsset'
    | 'startEditAsset'
  >
  assets: AssetRecord[]
  assetStandards: AssetStandards
} & Pick<
  EntityControllerActions,
  'beginReferenceAction' | 'currentActorId' | 'submitReference' | 'setReferenceActionError'
>) {
  const {
    assetForm,
    assetFormMode,
    selectedAsset,
    startCreateAsset: startCreateAssetBase,
    startEditAsset: startEditAssetBase,
  } = workspace

  const assetFieldErrors = useMemo(
    () => buildAssetFieldErrors(assetForm, assetFormMode, assets, assetStandards),
    [assetForm, assetFormMode, assetStandards, assets],
  )

  const assetFormDirty = useMemo(
    () => isAssetFormDirty(assetForm, assetFormMode, selectedAsset, assetStandards),
    [assetForm, assetFormMode, assetStandards, selectedAsset],
  )

  function startCreateAsset() {
    beginReferenceAction(startCreateAssetBase)
  }

  function startEditAsset(code: string) {
    beginReferenceAction(() => startEditAssetBase(code))
  }

  async function handleSaveAsset(e: React.FormEvent) {
    e.preventDefault()
    if (
      !assetForm.code.trim() ||
      !assetForm.name.trim() ||
      !assetForm.asset_class.trim() ||
      !assetForm.asset_type.trim() ||
      !assetForm.asset_reality.trim() ||
      !assetForm.operating_status.trim()
    ) {
      setReferenceActionError('Asset code, name, class, type, reality, and operating status are required.')
      return
    }

    const capacityValue = assetForm.capacity_value.trim() ? Number(assetForm.capacity_value.trim()) : null
    if (assetForm.capacity_value.trim() && Number.isNaN(capacityValue)) {
      setReferenceActionError('Capacity must be numeric.')
      return
    }
    if ((capacityValue === null) !== !assetForm.capacity_unit_code.trim()) {
      setReferenceActionError('Capacity value and unit must be provided together.')
      return
    }

    const parsedCoordinates = parseAssetCoordinatePair({
      latitudeText: assetForm.latitude,
      longitudeText: assetForm.longitude,
    })
    if (parsedCoordinates.error) {
      setReferenceActionError(parsedCoordinates.error)
      return
    }

    const parsedGeometry = parseAssetGeometryInput(assetForm.geometry_geojson)
    if (parsedGeometry.error) {
      setReferenceActionError(parsedGeometry.error)
      return
    }

    const payload = {
      code: assetForm.code.trim().toUpperCase(),
      name: assetForm.name.trim(),
      asset_class: assetForm.asset_class.trim().toUpperCase(),
      asset_type: assetForm.asset_type.trim().toUpperCase(),
      asset_reality: assetForm.asset_reality.trim().toUpperCase(),
      commodity_code: assetForm.commodity_code.trim().toUpperCase() || null,
      location_code: assetForm.location_code.trim().toUpperCase() || null,
      latitude: parsedCoordinates.latitude,
      longitude: parsedCoordinates.longitude,
      geometry_geojson: parsedGeometry.value,
      capacity_value: capacityValue,
      capacity_unit_code: assetForm.capacity_unit_code.trim().toUpperCase() || null,
      operator_name: assetForm.operator_name.trim() || null,
      operating_status: assetForm.operating_status.trim().toUpperCase(),
      description: assetForm.description.trim() || null,
    }

    if (assetFormMode === 'create') {
      await submitReference('/reference/assets', 'POST', { ...payload, created_by: currentActorId() }, `Asset ${payload.code} created.`)
      startEditAssetBase(payload.code)
    } else if (selectedAsset) {
      await submitReference(
        `/reference/assets/${selectedAsset.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
        `Asset ${selectedAsset.code} updated.`,
      )
    }
  }

  async function handleToggleAsset(record: AssetRecord) {
    await submitReference(
      `/reference/assets/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
      `Asset ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  return {
    assetFieldErrors,
    assetFormDirty,
    startCreateAsset,
    startEditAsset,
    handleSaveAsset,
    handleToggleAsset,
  }
}

export function useReferenceDataSpatialFeatureController({
  workspace,
  spatialFeatures,
  spatialFeatureStandards,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'spatialFeatureForm'
    | 'spatialFeatureFormMode'
    | 'selectedSpatialFeature'
    | 'startCreateSpatialFeature'
    | 'startEditSpatialFeature'
  >
  spatialFeatures: SpatialFeatureRecord[]
  spatialFeatureStandards: SpatialFeatureStandards
} & Pick<
  EntityControllerActions,
  'beginReferenceAction' | 'currentActorId' | 'submitReference' | 'setReferenceActionError'
>) {
  const {
    spatialFeatureForm,
    spatialFeatureFormMode,
    selectedSpatialFeature,
    startCreateSpatialFeature: startCreateSpatialFeatureBase,
    startEditSpatialFeature: startEditSpatialFeatureBase,
  } = workspace

  const spatialFeatureFieldErrors = useMemo(
    () =>
      buildSpatialFeatureFieldErrors(
        spatialFeatureForm,
        spatialFeatureFormMode,
        spatialFeatures,
        spatialFeatureStandards,
      ),
    [spatialFeatureForm, spatialFeatureFormMode, spatialFeatureStandards, spatialFeatures],
  )

  const spatialFeatureFormDirty = useMemo(
    () =>
      isSpatialFeatureFormDirty(
        spatialFeatureForm,
        spatialFeatureFormMode,
        selectedSpatialFeature,
        spatialFeatureStandards,
      ),
    [selectedSpatialFeature, spatialFeatureForm, spatialFeatureFormMode, spatialFeatureStandards],
  )

  function startCreateSpatialFeature() {
    beginReferenceAction(startCreateSpatialFeatureBase)
  }

  function startEditSpatialFeature(code: string) {
    beginReferenceAction(() => startEditSpatialFeatureBase(code))
  }

  async function handleSaveSpatialFeature(e: React.FormEvent) {
    e.preventDefault()
    if (
      !spatialFeatureForm.code.trim() ||
      !spatialFeatureForm.name.trim() ||
      !spatialFeatureForm.feature_kind.trim()
    ) {
      setReferenceActionError('Spatial feature code, name, kind, and geometry are required.')
      return
    }

    const parsedLabelCoordinates = parseAssetCoordinatePair({
      latitudeText: spatialFeatureForm.label_latitude,
      longitudeText: spatialFeatureForm.label_longitude,
    })
    if (parsedLabelCoordinates.error) {
      setReferenceActionError(parsedLabelCoordinates.error)
      return
    }

    const parsedGeometry = parseAssetGeometryInput(spatialFeatureForm.geometry_geojson)
    if (parsedGeometry.error) {
      setReferenceActionError(parsedGeometry.error)
      return
    }
    if (parsedGeometry.value === null) {
      setReferenceActionError('Geometry GeoJSON is required.')
      return
    }

    const normalizedEntityType = spatialFeatureForm.entity_type.trim().toUpperCase()
    const normalizedEntityCode = spatialFeatureForm.entity_code.trim().toUpperCase()
    if (Boolean(normalizedEntityType) !== Boolean(normalizedEntityCode)) {
      setReferenceActionError('Entity type and linked code must be provided together.')
      return
    }

    const payload = {
      code: spatialFeatureForm.code.trim().toUpperCase(),
      name: spatialFeatureForm.name.trim(),
      feature_kind: spatialFeatureForm.feature_kind.trim().toUpperCase(),
      geometry_geojson: parsedGeometry.value,
      entity_type: normalizedEntityType || null,
      entity_code: normalizedEntityCode || null,
      label_latitude: parsedLabelCoordinates.latitude,
      label_longitude: parsedLabelCoordinates.longitude,
      is_primary: spatialFeatureForm.is_primary,
      description: spatialFeatureForm.description.trim() || null,
    }

    if (spatialFeatureFormMode === 'create') {
      await submitReference(
        '/reference/spatial-features',
        'POST',
        { ...payload, created_by: currentActorId() },
        `Spatial feature ${payload.code} created.`,
      )
      startEditSpatialFeatureBase(payload.code)
    } else if (selectedSpatialFeature) {
      await submitReference(
        `/reference/spatial-features/${selectedSpatialFeature.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
        `Spatial feature ${selectedSpatialFeature.code} updated.`,
      )
    }
  }

  async function handleToggleSpatialFeature(record: SpatialFeatureRecord) {
    await submitReference(
      `/reference/spatial-features/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
      `Spatial feature ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  return {
    spatialFeatureFieldErrors,
    spatialFeatureFormDirty,
    startCreateSpatialFeature,
    startEditSpatialFeature,
    handleSaveSpatialFeature,
    handleToggleSpatialFeature,
  }
}

export function useReferenceDataRailRouteController({
  workspace,
  railRoutes,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'railRouteForm'
    | 'railRouteFormMode'
    | 'selectedRailRoute'
    | 'startCreateRailRoute'
    | 'startEditRailRoute'
  >
  railRoutes: RailRouteRecord[]
} & Pick<
  EntityControllerActions,
  'beginReferenceAction' | 'currentActorId' | 'submitReference' | 'setReferenceActionError'
>) {
  const {
    railRouteForm,
    railRouteFormMode,
    selectedRailRoute,
    startCreateRailRoute: startCreateRailRouteBase,
    startEditRailRoute: startEditRailRouteBase,
  } = workspace

  const railRouteFieldErrors = useMemo(
    () => buildRailRouteFieldErrors(railRouteForm, railRouteFormMode, railRoutes),
    [railRouteForm, railRouteFormMode, railRoutes],
  )

  const railRouteFormDirty = useMemo(
    () => isRailRouteFormDirty(railRouteForm, railRouteFormMode, selectedRailRoute),
    [railRouteForm, railRouteFormMode, selectedRailRoute],
  )

  function startCreateRailRoute() {
    beginReferenceAction(startCreateRailRouteBase)
  }

  function startEditRailRoute(code: string) {
    beginReferenceAction(() => startEditRailRouteBase(code))
  }

  async function handleSaveRailRoute(e: React.FormEvent) {
    e.preventDefault()
    if (!railRouteForm.code.trim() || !railRouteForm.name.trim() || !railRouteForm.rail_line_code.trim()) {
      setReferenceActionError('Rail route code, name, and rail line code are required.')
      return
    }

    if (!railRouteForm.route_direction.trim()) {
      setReferenceActionError('Route direction is required.')
      return
    }

    if (railRouteFieldErrors.route_direction) {
      setReferenceActionError(railRouteFieldErrors.route_direction)
      return
    }

    if (railRouteForm.placement_cutoff_time_local.trim() && railRouteFieldErrors.placement_cutoff_time_local) {
      setReferenceActionError(railRouteFieldErrors.placement_cutoff_time_local)
      return
    }

    if (railRouteForm.release_cutoff_time_local.trim() && railRouteFieldErrors.release_cutoff_time_local) {
      setReferenceActionError(railRouteFieldErrors.release_cutoff_time_local)
      return
    }

    if (railRouteForm.placement_free_time_hours.trim() && railRouteFieldErrors.placement_free_time_hours) {
      setReferenceActionError(railRouteFieldErrors.placement_free_time_hours)
      return
    }

    if (railRouteForm.release_free_time_hours.trim() && railRouteFieldErrors.release_free_time_hours) {
      setReferenceActionError(railRouteFieldErrors.release_free_time_hours)
      return
    }

    const placementFreeTimeHours = railRouteForm.placement_free_time_hours.trim()
      ? Number.parseInt(railRouteForm.placement_free_time_hours.trim(), 10)
      : null
    const releaseFreeTimeHours = railRouteForm.release_free_time_hours.trim()
      ? Number.parseInt(railRouteForm.release_free_time_hours.trim(), 10)
      : null

    const payload = {
      code: railRouteForm.code.trim().toUpperCase(),
      name: railRouteForm.name.trim(),
      rail_line_code: railRouteForm.rail_line_code.trim().toUpperCase(),
      origin_location_code: railRouteForm.origin_location_code.trim().toUpperCase() || null,
      destination_location_code: railRouteForm.destination_location_code.trim().toUpperCase() || null,
      service_calendar_code: railRouteForm.service_calendar_code.trim().toUpperCase() || null,
      route_direction: railRouteForm.route_direction.trim().toUpperCase(),
      schedule_timezone: railRouteForm.schedule_timezone.trim() || null,
      placement_cutoff_time_local: railRouteForm.placement_cutoff_time_local.trim() || null,
      release_cutoff_time_local: railRouteForm.release_cutoff_time_local.trim() || null,
      placement_free_time_hours: placementFreeTimeHours,
      release_free_time_hours: releaseFreeTimeHours,
      description: railRouteForm.description.trim() || null,
    }

    if (railRouteFormMode === 'create') {
      await submitReference(
        '/reference/rail-routes',
        'POST',
        { ...payload, created_by: currentActorId() },
        `Rail route ${payload.code} created.`,
      )
      startEditRailRouteBase(payload.code)
    } else if (selectedRailRoute) {
      await submitReference(
        `/reference/rail-routes/${selectedRailRoute.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
        `Rail route ${selectedRailRoute.code} updated.`,
      )
    }
  }

  async function handleToggleRailRoute(record: RailRouteRecord) {
    await submitReference(
      `/reference/rail-routes/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
      `Rail route ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  return {
    railRouteFieldErrors,
    railRouteFormDirty,
    startCreateRailRoute,
    startEditRailRoute,
    handleSaveRailRoute,
    handleToggleRailRoute,
  }
}

export function useReferenceDataCommodityController({
  workspace,
  commodities,
  commodityClassOrder,
  commodityUsageByCode,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
  setReferenceActionSuccess,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'commodityForm'
    | 'commodityFormMode'
    | 'selectedCommodity'
    | 'startCreateCommodity'
    | 'startEditCommodity'
  >
  commodities: ReferenceRecord[]
  commodityClassOrder: readonly string[]
  commodityUsageByCode: Map<string, { activeTrades: number; totalTrades: number }>
} & EntityControllerActions) {
  const {
    commodityForm,
    commodityFormMode,
    selectedCommodity,
    startCreateCommodity: startCreateCommodityBase,
    startEditCommodity: startEditCommodityBase,
  } = workspace

  const selectedCommodityUsage = selectedCommodity
    ? commodityUsageByCode.get(selectedCommodity.code) ?? { activeTrades: 0, totalTrades: 0 }
    : null

  const commodityFieldErrors = useMemo(
    () => buildCommodityFieldErrors(commodityForm, commodityFormMode, commodities),
    [commodities, commodityForm, commodityFormMode],
  )

  const commodityFormDirty = useMemo(
    () => isCommodityFormDirty(commodityForm, commodityFormMode, selectedCommodity, commodityClassOrder),
    [commodityClassOrder, commodityForm, commodityFormMode, selectedCommodity],
  )

  function startCreateCommodity() {
    beginReferenceAction(startCreateCommodityBase)
  }

  function startEditCommodity(code: string) {
    beginReferenceAction(() => startEditCommodityBase(code))
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
          allowed_transport_modes: commodityForm.allowed_transport_modes,
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
          allowed_transport_modes: commodityForm.allowed_transport_modes,
          updated_by: currentActorId(),
        },
        `Commodity ${selectedCommodity.code} updated.`,
      )
    }
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

  return {
    selectedCommodityUsage,
    commodityFieldErrors,
    commodityFormDirty,
    startCreateCommodity,
    startEditCommodity,
    handleSaveCommodity,
    handleToggleCommodity,
  }
}

export function useReferenceDataPriceIndexController({
  workspace,
  activeCommodities,
  priceIndices,
  priceIndexUsageByCode,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
  setReferenceActionSuccess,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'priceIndexForm'
    | 'priceIndexFormMode'
    | 'selectedPriceIndex'
    | 'startCreatePriceIndex'
    | 'startEditPriceIndex'
  >
  activeCommodities: ReferenceRecord[]
  priceIndices: PriceIndexRecord[]
  priceIndexUsageByCode: Map<string, { activeTrades: number; totalTrades: number }>
} & EntityControllerActions) {
  const {
    priceIndexForm,
    priceIndexFormMode,
    selectedPriceIndex,
    startCreatePriceIndex: startCreatePriceIndexBase,
    startEditPriceIndex: startEditPriceIndexBase,
  } = workspace

  const selectedPriceIndexUsage = selectedPriceIndex
    ? priceIndexUsageByCode.get(selectedPriceIndex.code) ?? { activeTrades: 0, totalTrades: 0 }
    : null

  const priceIndexFieldErrors = useMemo(
    () => buildPriceIndexFieldErrors(priceIndexForm, priceIndexFormMode, priceIndices),
    [priceIndexForm, priceIndexFormMode, priceIndices],
  )

  const priceIndexFormDirty = useMemo(
    () => isPriceIndexFormDirty(priceIndexForm, priceIndexFormMode, selectedPriceIndex, activeCommodities),
    [activeCommodities, priceIndexForm, priceIndexFormMode, selectedPriceIndex],
  )

  function startCreatePriceIndex() {
    beginReferenceAction(startCreatePriceIndexBase)
  }

  function startEditPriceIndex(code: string) {
    beginReferenceAction(() => startEditPriceIndexBase(code))
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

  return {
    selectedPriceIndexUsage,
    priceIndexFieldErrors,
    priceIndexFormDirty,
    startCreatePriceIndex,
    startEditPriceIndex,
    handleSavePriceIndex,
    handleTogglePriceIndex,
  }
}

export function useReferenceDataCurrencyController({
  workspace,
  currencies,
  currencyUsageByCode,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
  setReferenceActionSuccess,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'currencyForm'
    | 'currencyFormMode'
    | 'selectedCurrency'
    | 'startCreateCurrency'
    | 'startEditCurrency'
  >
  currencies: CurrencyRecord[]
  currencyUsageByCode: Map<string, { activeChildren: number; totalChildren: number }>
} & EntityControllerActions) {
  const {
    currencyForm,
    currencyFormMode,
    selectedCurrency,
    startCreateCurrency: startCreateCurrencyBase,
    startEditCurrency: startEditCurrencyBase,
  } = workspace

  const selectedCurrencyUsage = selectedCurrency
    ? currencyUsageByCode.get(selectedCurrency.code) ?? { activeChildren: 0, totalChildren: 0 }
    : null

  const currencyFieldErrors = useMemo(
    () => buildCurrencyFieldErrors(currencyForm, currencyFormMode, currencies),
    [currencies, currencyForm, currencyFormMode],
  )

  const currencyFormDirty = useMemo(
    () => isCurrencyFormDirty(currencyForm, currencyFormMode, selectedCurrency),
    [currencyForm, currencyFormMode, selectedCurrency],
  )

  function startCreateCurrency() {
    beginReferenceAction(startCreateCurrencyBase)
  }

  function startEditCurrency(code: string) {
    beginReferenceAction(() => startEditCurrencyBase(code))
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

  return {
    selectedCurrencyUsage,
    currencyFieldErrors,
    currencyFormDirty,
    startCreateCurrency,
    startEditCurrency,
    handleSaveCurrency,
    handleToggleCurrency,
  }
}

export function useReferenceDataUnitController({
  workspace,
  selectedCommodity,
  commodityClassOrder,
  units,
  unitUsageByCode,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
  setReferenceActionSuccess,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'unitForm'
    | 'unitFormMode'
    | 'selectedUnit'
    | 'startCreateUnit'
    | 'startEditUnit'
  >
  selectedCommodity: ReferenceRecord | null
  commodityClassOrder: readonly string[]
  units: UnitRecord[]
  unitUsageByCode: Map<string, { activeChildren: number; totalChildren: number }>
} & EntityControllerActions) {
  const {
    unitForm,
    unitFormMode,
    selectedUnit,
    startCreateUnit: startCreateUnitBase,
    startEditUnit: startEditUnitBase,
  } = workspace

  const selectedUnitUsage = selectedUnit
    ? unitUsageByCode.get(selectedUnit.code) ?? { activeChildren: 0, totalChildren: 0 }
    : null

  const unitFieldErrors = useMemo(
    () => buildUnitFieldErrors(unitForm, unitFormMode, units),
    [unitForm, unitFormMode, units],
  )

  const unitFormDirty = useMemo(
    () => isUnitFormDirty(unitForm, unitFormMode, selectedUnit, selectedCommodity, commodityClassOrder),
    [commodityClassOrder, selectedCommodity, selectedUnit, unitForm, unitFormMode],
  )

  function startCreateUnit() {
    beginReferenceAction(startCreateUnitBase)
  }

  function startEditUnit(code: string) {
    beginReferenceAction(() => startEditUnitBase(code))
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

  return {
    selectedUnitUsage,
    unitFieldErrors,
    unitFormDirty,
    startCreateUnit,
    startEditUnit,
    handleSaveUnit,
    handleToggleUnit,
  }
}

export function useReferenceDataLocationController({
  workspace,
  locations,
  locationStandards,
  locationUsageByCode,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
  setReferenceActionSuccess,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'locationForm'
    | 'locationFormMode'
    | 'selectedLocation'
    | 'startCreateLocation'
    | 'startEditLocation'
  >
  locations: LocationRecord[]
  locationStandards: LocationStandards
  locationUsageByCode: Map<string, { activeChildren: number; totalChildren: number }>
} & EntityControllerActions) {
  const {
    locationForm,
    locationFormMode,
    selectedLocation,
    startCreateLocation: startCreateLocationBase,
    startEditLocation: startEditLocationBase,
  } = workspace

  const selectedLocationUsage = selectedLocation
    ? locationUsageByCode.get(selectedLocation.code) ?? { activeChildren: 0, totalChildren: 0 }
    : null

  const locationFieldErrors = useMemo(
    () => buildLocationFieldErrors(locationForm, locationFormMode, locations, locationStandards),
    [locationForm, locationFormMode, locationStandards, locations],
  )

  const locationFormDirty = useMemo(
    () => isLocationFormDirty(locationForm, locationFormMode, selectedLocation, locationStandards),
    [locationForm, locationFormMode, locationStandards, selectedLocation],
  )

  function startCreateLocation() {
    beginReferenceAction(startCreateLocationBase)
  }

  function startEditLocation(code: string) {
    beginReferenceAction(() => startEditLocationBase(code))
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

  return {
    selectedLocationUsage,
    locationFieldErrors,
    locationFormDirty,
    startCreateLocation,
    startEditLocation,
    handleSaveLocation,
    handleToggleLocation,
  }
}

export function useReferenceDataPortfolioController({
  workspace,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
}: {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'portfolioForm'
    | 'portfolioFormMode'
    | 'selectedPortfolio'
    | 'startCreatePortfolio'
    | 'startEditPortfolio'
  >
} & Pick<EntityControllerActions, 'beginReferenceAction' | 'currentActorId' | 'submitReference' | 'setReferenceActionError'>) {
  const {
    portfolioForm,
    portfolioFormMode,
    selectedPortfolio,
    startCreatePortfolio: startCreatePortfolioBase,
    startEditPortfolio: startEditPortfolioBase,
  } = workspace

  function startCreatePortfolio() {
    beginReferenceAction(startCreatePortfolioBase)
  }

  function startEditPortfolio(code: string) {
    beginReferenceAction(() => startEditPortfolioBase(code))
  }

  async function handleSavePortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!portfolioForm.code.trim() || !portfolioForm.name.trim() || !portfolioForm.book_code.trim()) {
      setReferenceActionError('Portfolio code, name, and book are required.')
      return
    }

    const payload = {
      code: portfolioForm.code.trim().toUpperCase(),
      name: portfolioForm.name.trim(),
      book_code: portfolioForm.book_code.trim().toUpperCase(),
      owner: portfolioForm.owner.trim() || null,
      strategy: portfolioForm.strategy.trim() || null,
      description: portfolioForm.description.trim() || null,
    }

    if (portfolioFormMode === 'create') {
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
    startCreatePortfolio,
    startEditPortfolio,
    handleSavePortfolio,
    handleTogglePortfolio,
  }
}
