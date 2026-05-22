import { useMemo, useState } from 'react'

import {
  buildAssetMapSummary,
  formatAssetMapPlacement,
  formatAssetMapSource,
} from '../../features/reference-data/assetMap'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import type {
  AssetRecord,
  DeliveryRecord,
  LocationRecord,
  RailRouteRecord,
  SpatialFeatureRecord,
} from '../../shared/models'
import { DataSheet } from '../../shared/ui/DataSheet'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import { AssetMapPanel } from '../reference-data/tabs/AssetMapPanel'
import { buildVesselMapRecords, matchesMapVesselFilter } from './vesselMapRecords'

type MapWorkspaceProps = {
  assets: AssetRecord[]
  deliveries?: DeliveryRecord[]
  locations: LocationRecord[]
  railRoutes: RailRouteRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  globalFilter: string
  onOpenReferenceData: () => void
  onPrepareReferenceAsset: (code: string) => void
  onOpenReferenceRailRoute: (code: string) => void
  onOpenVesselDelivery?: (deliveryId: string) => void
  onOpenRailRouteDeliveries: (code: string) => void
  onOpenRailRouteScheduling: (code: string) => void
}

function sortedUniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? '')
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

function matchesMapAssetFilter(asset: AssetRecord, query: string): boolean {
  return matchesTextFilter(query, [
    asset.code,
    asset.name,
    asset.description,
    asset.asset_class,
    asset.asset_type,
    asset.asset_reality,
    asset.commodity_code,
    asset.location_code,
    asset.latitude,
    asset.longitude,
    asset.capacity_value,
    asset.capacity_unit_code,
    asset.operator_name,
    asset.operating_status,
    asset.is_active,
  ])
}

function formatMapTimestamp(value: string | null): string {
  if (!value) {
    return 'No timestamp'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatOptionalNumber(value: number | null, suffix: string, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits)} ${suffix}`
}

function formatVesselHealth(value: string): string {
  return value.replaceAll('_', ' ')
}

function mapStatusLabel(
  placementStatus:
    | 'asset_geometry'
    | 'asset_coordinates'
    | 'linked_location'
    | 'missing_coordinates'
    | 'missing_location',
): string {
  switch (placementStatus) {
    case 'asset_geometry':
      return 'Geometry'
    case 'asset_coordinates':
      return 'Asset Point'
    case 'linked_location':
      return 'Linked Location'
    case 'missing_coordinates':
      return 'Missing Coordinates'
    case 'missing_location':
      return 'Missing Location'
    default:
      return 'Unknown'
  }
}

export function MapWorkspace({
  assets,
  deliveries = [],
  locations,
  railRoutes,
  spatialFeatures,
  globalFilter,
  onOpenReferenceData,
  onPrepareReferenceAsset,
  onOpenReferenceRailRoute,
  onOpenVesselDelivery = () => undefined,
  onOpenRailRouteDeliveries,
  onOpenRailRouteScheduling,
}: MapWorkspaceProps) {
  const [screenFilter, setScreenFilter] = useState('')
  const [selectedAssetCode, setSelectedAssetCode] = useState<string | null>(null)
  const [selectedRailRouteCode, setSelectedRailRouteCode] = useState<string | null>(null)
  const [selectedVesselDeliveryId, setSelectedVesselDeliveryId] = useState<string | null>(null)
  const [assetClassFilter, setAssetClassFilter] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState('')
  const [commodityFilter, setCommodityFilter] = useState('')

  const assetClassOptions = useMemo(
    () => sortedUniqueValues(assets.map((asset) => asset.asset_class)),
    [assets],
  )
  const assetTypeOptions = useMemo(
    () =>
      sortedUniqueValues(
        assets
          .filter((asset) => !assetClassFilter || asset.asset_class === assetClassFilter)
          .map((asset) => asset.asset_type),
      ),
    [assetClassFilter, assets],
  )
  const commodityOptions = useMemo(
    () => sortedUniqueValues(assets.map((asset) => asset.commodity_code ?? '')),
    [assets],
  )

  const effectiveScreenFilter = useMemo(
    () => combineTextFilters(globalFilter, screenFilter),
    [globalFilter, screenFilter],
  )

  const filteredAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          matchesMapAssetFilter(asset, effectiveScreenFilter) &&
          (!assetClassFilter || asset.asset_class === assetClassFilter) &&
          (!assetTypeFilter || asset.asset_type === assetTypeFilter) &&
          (!commodityFilter || (asset.commodity_code ?? '') === commodityFilter),
      ),
    [assetClassFilter, assetTypeFilter, assets, commodityFilter, effectiveScreenFilter],
  )

  const vesselPositions = useMemo(() => buildVesselMapRecords(deliveries), [deliveries])

  const filteredVesselPositions = useMemo(
    () =>
      vesselPositions.filter((vessel) =>
        matchesMapVesselFilter(vessel, effectiveScreenFilter),
      ),
    [effectiveScreenFilter, vesselPositions],
  )

  const activeSelectedAssetCode = useMemo(
    () =>
      selectedAssetCode && filteredAssets.some((asset) => asset.code === selectedAssetCode)
        ? selectedAssetCode
        : null,
    [filteredAssets, selectedAssetCode],
  )

  const activeSelectedVesselDeliveryId = useMemo(
    () =>
      selectedVesselDeliveryId &&
      filteredVesselPositions.some((vessel) => vessel.deliveryId === selectedVesselDeliveryId)
        ? selectedVesselDeliveryId
        : null,
    [filteredVesselPositions, selectedVesselDeliveryId],
  )

  const mapSummary = useMemo(
    () => buildAssetMapSummary(filteredAssets, locations),
    [filteredAssets, locations],
  )

  const mapRecordByCode = useMemo(
    () => new Map(mapSummary.records.map((record) => [record.asset.code, record] as const)),
    [mapSummary.records],
  )

  const selectedAsset = useMemo(
    () => filteredAssets.find((asset) => asset.code === activeSelectedAssetCode) ?? null,
    [activeSelectedAssetCode, filteredAssets],
  )
  const selectedVessel = useMemo(
    () =>
      filteredVesselPositions.find(
        (vessel) => vessel.deliveryId === activeSelectedVesselDeliveryId,
      ) ?? null,
    [activeSelectedVesselDeliveryId, filteredVesselPositions],
  )
  const activeFacetFilterCount = [assetClassFilter, assetTypeFilter, commodityFilter].filter(Boolean).length

  function handleOpenReferenceData() {
    if (activeSelectedAssetCode) {
      onPrepareReferenceAsset(activeSelectedAssetCode)
    }
    onOpenReferenceData()
  }

  function handleSelectAsset(code: string) {
    setSelectedRailRouteCode(null)
    setSelectedVesselDeliveryId(null)
    setSelectedAssetCode(code)
  }

  function handleSelectRailRoute(code: string) {
    setSelectedAssetCode(null)
    setSelectedVesselDeliveryId(null)
    setSelectedRailRouteCode(code)
  }

  function handleSelectVessel(deliveryId: string) {
    setSelectedAssetCode(null)
    setSelectedRailRouteCode(null)
    setSelectedVesselDeliveryId(deliveryId)
  }

  function clearMapSelection() {
    setSelectedAssetCode(null)
    setSelectedRailRouteCode(null)
    setSelectedVesselDeliveryId(null)
  }

  function handleAssetClassChange(nextAssetClass: string) {
    setAssetClassFilter(nextAssetClass)
    if (
      nextAssetClass &&
      assetTypeFilter &&
      !assets.some((asset) => asset.asset_class === nextAssetClass && asset.asset_type === assetTypeFilter)
    ) {
      setAssetTypeFilter('')
    }
  }

  function resetFacetFilters() {
    setAssetClassFilter('')
    setAssetTypeFilter('')
    setCommodityFilter('')
  }

  return (
    <div className="stack map-workspace">
      <WorkspaceLocalFilterBar
        value={screenFilter}
        onChange={setScreenFilter}
        placeholder="Search assets, vessels, classes, locations, operators, or map status"
        description="Keep the spatial review local to this screen so you can narrow the physical footprint without changing any other workspace."
        totalCount={assets.length + vesselPositions.length}
        matchedCount={filteredAssets.length + filteredVesselPositions.length}
        resultLabel="map records"
        globalValue={globalFilter}
        note="Selection is optional here. With nothing selected, the map stays centered on every plotted asset and vessel position in the current filter."
      />

      <AssetMapPanel
        assets={filteredAssets}
        locations={locations}
        railRoutes={railRoutes}
        spatialFeatures={spatialFeatures}
        vesselPositions={filteredVesselPositions}
        selectedAssetCode={activeSelectedAssetCode}
        selectedRailRouteCode={selectedRailRouteCode}
        selectedVesselDeliveryId={activeSelectedVesselDeliveryId}
        onSelectAsset={handleSelectAsset}
        onSelectRailRoute={handleSelectRailRoute}
        onSelectVessel={handleSelectVessel}
        onOpenVesselDelivery={onOpenVesselDelivery}
        onOpenRailRouteDeliveries={onOpenRailRouteDeliveries}
        onOpenRailRouteScheduling={onOpenRailRouteScheduling}
        onOpenReferenceRailRoute={onOpenReferenceRailRoute}
        onClearRailRouteSelection={() => setSelectedRailRouteCode(null)}
        onClearVesselSelection={() => setSelectedVesselDeliveryId(null)}
        filterControls={(
          <>
            <label className="field">
              <span>Asset Class</span>
              <select
                className="control control-compact"
                value={assetClassFilter}
                onChange={(event) => handleAssetClassChange(event.target.value)}
              >
                <option value="">All classes</option>
                {assetClassOptions.map((assetClass) => (
                  <option key={assetClass} value={assetClass}>
                    {assetClass}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Asset Type</span>
              <select
                className="control control-compact"
                value={assetTypeFilter}
                onChange={(event) => setAssetTypeFilter(event.target.value)}
              >
                <option value="">All types</option>
                {assetTypeOptions.map((assetType) => (
                  <option key={assetType} value={assetType}>
                    {assetType}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Commodity</span>
              <select
                className="control control-compact"
                value={commodityFilter}
                onChange={(event) => setCommodityFilter(event.target.value)}
              >
                <option value="">All commodities</option>
                {commodityOptions.map((commodity) => (
                  <option key={commodity} value={commodity}>
                    {commodity}
                  </option>
                ))}
              </select>
            </label>
            <div className="asset-map-filter-actions">
              <span className="entity-chip entity-chip-soft">
                {activeFacetFilterCount === 0
                  ? 'All map filters open'
                  : `${activeFacetFilterCount} map filter${activeFacetFilterCount === 1 ? '' : 's'} active`}
              </span>
              {activeFacetFilterCount > 0 ? (
                <button type="button" className="button button-ghost" onClick={resetFacetFilters}>
                  Clear Map Filters
                </button>
              ) : null}
            </div>
          </>
        )}
      />

      <section className="surface">
        <div className="section-head section-head-control">
          <div>
            <span className="eyebrow">Directory</span>
            <h3>Map Asset Directory</h3>
          </div>
          <div className="toolbar">
            {activeSelectedAssetCode || activeSelectedVesselDeliveryId ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={clearMapSelection}
              >
                Clear Selection
              </button>
            ) : null}
            {activeSelectedVesselDeliveryId ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onOpenVesselDelivery(activeSelectedVesselDeliveryId)}
              >
                Open Delivery
              </button>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={handleOpenReferenceData}
              >
                {activeSelectedAssetCode ? 'Edit Selected Asset' : 'Open Reference Data'}
              </button>
            )}
          </div>
        </div>

        {selectedVessel ? (
          <p className="form-note">
            {selectedVessel.label} is in focus. Clear the selection to return the map to the full
            filtered footprint, or open the delivery to review vessel tracking.
          </p>
        ) : selectedAsset ? (
          <p className="form-note">
            {selectedAsset.code} is in focus. Clear the selection to return the map to the full filtered
            footprint, or open Reference Data to maintain the record.
          </p>
        ) : (
          <p className="form-note">
            No asset or vessel is selected. The map is currently showing every map-ready asset and saved
            vessel position in the current filter.
          </p>
        )}

        {vesselPositions.length > 0 ? (
          <DataSheet
            label="Vessel Positions"
            description="Review saved vessel positions and AIS tracking health before jumping into the delivery record."
            columns={[
              { id: 'vessel', label: 'Vessel', width: '16rem', renderCell: (vessel) => vessel.label },
              { id: 'mmsi', label: 'MMSI', width: '9rem', renderCell: (vessel) => vessel.mmsiNumber ?? '—' },
              { id: 'delivery', label: 'Delivery', width: '12rem', renderCell: (vessel) => vessel.deliveryId },
              { id: 'trade', label: 'Trade', width: '10rem', renderCell: (vessel) => vessel.tradeId },
              { id: 'commodity', label: 'Commodity', width: '12rem', renderCell: (vessel) => vessel.commodity },
              {
                id: 'last-position',
                label: 'Last Position',
                width: '14rem',
                renderCell: (vessel) => formatMapTimestamp(vessel.lastPositionAt ?? vessel.lastSignalAt),
              },
              {
                id: 'speed',
                label: 'Speed',
                width: '8rem',
                renderCell: (vessel) => formatOptionalNumber(vessel.speedKnots, 'kn'),
              },
              {
                id: 'destination',
                label: 'Destination',
                width: '12rem',
                renderCell: (vessel) => vessel.destination ?? '—',
              },
              {
                id: 'health',
                label: 'Health',
                width: '12rem',
                renderCell: (vessel) => formatVesselHealth(vessel.primaryException ?? vessel.healthSeverity),
              },
            ]}
            rows={filteredVesselPositions}
            getRowId={(vessel) => vessel.deliveryId}
            getRowLabel={(vessel) => `${vessel.label} ${vessel.deliveryId}`}
            selectedRowId={activeSelectedVesselDeliveryId}
            onSelectRow={(vessel) => handleSelectVessel(vessel.deliveryId)}
            emptyMessage="No vessel positions match the current map filter."
          />
        ) : null}

        <DataSheet
          label="Map Assets"
          description="Review asset map readiness, placement source, and footprint context before jumping into reference maintenance."
          columns={[
            { id: 'code', label: 'Code', width: '10rem', renderCell: (asset) => asset.code },
            { id: 'name', label: 'Name', width: '18rem', renderCell: (asset) => asset.name },
            { id: 'class', label: 'Class', width: '12rem', renderCell: (asset) => asset.asset_class },
            { id: 'type', label: 'Type', width: '12rem', renderCell: (asset) => asset.asset_type },
            {
              id: 'map-status',
              label: 'Map Status',
              width: '12rem',
              renderCell: (asset) => {
                const record = mapRecordByCode.get(asset.code)
                return record ? mapStatusLabel(record.placementStatus) : 'Not Map-Ready'
              },
            },
            {
              id: 'map-source',
              label: 'Map Source',
              width: '12rem',
              renderCell: (asset) => {
                const record = mapRecordByCode.get(asset.code)
                return record ? formatAssetMapSource(record) : 'Not map-ready'
              },
            },
            {
              id: 'placement',
              label: 'Placement',
              width: '20rem',
              renderCell: (asset) => {
                const record = mapRecordByCode.get(asset.code)
                return record ? formatAssetMapPlacement(record) : 'Add GeoJSON, direct coordinates, or a linked location.'
              },
            },
            {
              id: 'status',
              label: 'Record Status',
              width: '9rem',
              renderCell: (asset) => (asset.is_active ? 'Active' : 'Inactive'),
            },
          ]}
          rows={filteredAssets}
          getRowId={(asset) => asset.code}
          getRowLabel={(asset) => `${asset.code} ${asset.name}`}
          selectedRowId={activeSelectedAssetCode}
          onSelectRow={(asset) => handleSelectAsset(asset.code)}
          emptyMessage="No assets match the current map filter."
        />
      </section>
    </div>
  )
}
