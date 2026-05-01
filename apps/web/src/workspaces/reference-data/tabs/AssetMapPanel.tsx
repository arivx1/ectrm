import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  buildAssetMapFeatureCollection,
  buildAssetMapSummary,
  buildSpatialFeatureMapFeatureCollection,
  formatAssetMapLocation,
  formatAssetMapPlacement,
  formatAssetMapSource,
  type AssetMapRecord,
} from '../../../features/reference-data/assetMap'
import type { AssetRecord, LocationRecord, SpatialFeatureRecord } from '../../../shared/models'

type AssetMapPanelProps = {
  assets: AssetRecord[]
  locations: LocationRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  selectedAssetCode: string | null
  onSelectAsset: (code: string) => void
}

type MapLibreModule = typeof import('maplibre-gl')

const ASSET_GEOMETRY_SOURCE_ID = 'asset-geometry-source'
const ASSET_GEOMETRY_FILL_LAYER_ID = 'asset-geometry-fill-layer'
const ASSET_GEOMETRY_LINE_LAYER_ID = 'asset-geometry-line-layer'
const ASSET_GEOMETRY_POINT_LAYER_ID = 'asset-geometry-point-layer'
const SPATIAL_FEATURE_SOURCE_ID = 'spatial-feature-source'
const SPATIAL_FEATURE_FILL_LAYER_ID = 'spatial-feature-fill-layer'
const SPATIAL_FEATURE_LINE_LAYER_ID = 'spatial-feature-line-layer'
const SPATIAL_FEATURE_POINT_LAYER_ID = 'spatial-feature-point-layer'

const FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openstreetmap',
      type: 'raster',
      source: 'openstreetmap',
    },
  ],
}

function buildRecordSignature(records: AssetMapRecord[]): string {
  return records
    .map((record) =>
      [
        record.asset.code,
        record.asset.latitude ?? 'na',
        record.asset.longitude ?? 'na',
        JSON.stringify(record.asset.geometry_geojson ?? null),
        record.placementStatus,
      ].join(':'),
    )
    .join('|')
}

function buildSpatialFeatureSignature(spatialFeatures: SpatialFeatureRecord[]): string {
  return spatialFeatures
    .map((feature) =>
      [
        feature.code,
        feature.feature_kind,
        feature.geometry_type,
        feature.entity_type ?? 'na',
        feature.entity_code ?? 'na',
        JSON.stringify(feature.geometry_geojson),
      ].join(':'),
    )
    .join('|')
}

function AssetMapCanvas({
  records,
  spatialFeatures,
  selectedAssetCode,
  onSelectAsset,
}: {
  records: AssetMapRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  selectedAssetCode: string | null
  onSelectAsset: (code: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<InstanceType<MapLibreModule['Map']> | null>(null)
  const runtimeRef = useRef<MapLibreModule | null>(null)
  const markersRef = useRef<Array<InstanceType<MapLibreModule['Marker']>>>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const handleSelectAsset = useEffectEvent((code: string) => onSelectAsset(code))

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current || typeof window === 'undefined') {
      return
    }

    let cancelled = false

    async function initializeMap() {
      try {
        const runtime = await import('maplibre-gl')
        if (cancelled || !containerRef.current) {
          return
        }

        runtimeRef.current = runtime
        const map = new runtime.Map({
          container: containerRef.current,
          style: FALLBACK_MAP_STYLE,
          center: [-96, 37.8],
          zoom: 2.4,
          minZoom: 1.5,
        })
        map.addControl(new runtime.NavigationControl({ visualizePitch: true }), 'top-right')
        map.addControl(new runtime.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-left')
        map.once('load', () => {
          if (!cancelled) {
            setReady(true)
          }
        })
        mapRef.current = map
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Asset map failed to load.')
        }
      }
    }

    void initializeMap()

    return () => {
      cancelled = true
      setReady(false)
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || !containerRef.current || !mapRef.current || typeof ResizeObserver === 'undefined') {
      return
    }

    const map = mapRef.current
    const observer = new ResizeObserver(() => {
      map.resize()
    })
    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [ready])

  const recordSignature = useMemo(() => buildRecordSignature(records), [records])
  const spatialFeatureSignature = useMemo(
    () => buildSpatialFeatureSignature(spatialFeatures),
    [spatialFeatures],
  )

  useEffect(() => {
    if (!ready || !mapRef.current || !runtimeRef.current) {
      return
    }

    const map = mapRef.current
    const runtime = runtimeRef.current

    const featureCollection = buildAssetMapFeatureCollection(records)
    const sourceData = {
      ...featureCollection,
      features: featureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          isSelected: feature.properties?.assetCode === selectedAssetCode,
        },
      })),
    }

    const existingSource = map.getSource(ASSET_GEOMETRY_SOURCE_ID) as
      | {
          setData: (data: unknown) => void
        }
      | undefined

    if (existingSource) {
      existingSource.setData(sourceData)
    } else {
      map.addSource(ASSET_GEOMETRY_SOURCE_ID, {
        type: 'geojson',
        data: sourceData,
      })
      map.addLayer({
        id: ASSET_GEOMETRY_FILL_LAYER_ID,
        type: 'fill',
        source: ASSET_GEOMETRY_SOURCE_ID,
        filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
        paint: {
          'fill-color': ['case', ['boolean', ['get', 'isSelected'], false], '#13293d', '#127c6c'],
          'fill-opacity': ['case', ['boolean', ['get', 'isSelected'], false], 0.22, 0.1],
        },
      })
      map.addLayer({
        id: ASSET_GEOMETRY_LINE_LAYER_ID,
        type: 'line',
        source: ASSET_GEOMETRY_SOURCE_ID,
        filter: [
          'any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString'],
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        paint: {
          'line-color': ['case', ['boolean', ['get', 'isSelected'], false], '#13293d', '#127c6c'],
          'line-opacity': 0.8,
          'line-width': ['case', ['boolean', ['get', 'isSelected'], false], 3, 2],
        },
      })
      map.addLayer({
        id: ASSET_GEOMETRY_POINT_LAYER_ID,
        type: 'circle',
        source: ASSET_GEOMETRY_SOURCE_ID,
        filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
        paint: {
          'circle-color': ['case', ['boolean', ['get', 'isSelected'], false], '#13293d', '#127c6c'],
          'circle-radius': ['case', ['boolean', ['get', 'isSelected'], false], 6, 4],
          'circle-opacity': 0.45,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })
    }

    const activeSpatialFeatures = spatialFeatures.filter((feature) => feature.is_active)
    const spatialFeatureCollection = buildSpatialFeatureMapFeatureCollection(activeSpatialFeatures)
    const spatialFeatureSourceData = {
      ...spatialFeatureCollection,
      features: spatialFeatureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          isLinkedSelection:
            feature.properties?.entityType === 'ASSET' && feature.properties?.entityCode === selectedAssetCode,
        },
      })),
    }

    const existingSpatialFeatureSource = map.getSource(SPATIAL_FEATURE_SOURCE_ID) as
      | {
          setData: (data: unknown) => void
        }
      | undefined

    if (existingSpatialFeatureSource) {
      existingSpatialFeatureSource.setData(spatialFeatureSourceData)
    } else {
      map.addSource(SPATIAL_FEATURE_SOURCE_ID, {
        type: 'geojson',
        data: spatialFeatureSourceData,
      })
      map.addLayer({
        id: SPATIAL_FEATURE_FILL_LAYER_ID,
        type: 'fill',
        source: SPATIAL_FEATURE_SOURCE_ID,
        filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
        paint: {
          'fill-color': ['case', ['boolean', ['get', 'isLinkedSelection'], false], '#9a3412', '#b45309'],
          'fill-opacity': ['case', ['boolean', ['get', 'isLinkedSelection'], false], 0.14, 0.08],
        },
      })
      map.addLayer({
        id: SPATIAL_FEATURE_LINE_LAYER_ID,
        type: 'line',
        source: SPATIAL_FEATURE_SOURCE_ID,
        filter: [
          'any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString'],
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        paint: {
          'line-color': ['case', ['boolean', ['get', 'isLinkedSelection'], false], '#9a3412', '#b45309'],
          'line-opacity': 0.7,
          'line-width': ['case', ['boolean', ['get', 'isLinkedSelection'], false], 3, 2],
          'line-dasharray': [2, 1],
        },
      })
      map.addLayer({
        id: SPATIAL_FEATURE_POINT_LAYER_ID,
        type: 'circle',
        source: SPATIAL_FEATURE_SOURCE_ID,
        filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
        paint: {
          'circle-color': ['case', ['boolean', ['get', 'isLinkedSelection'], false], '#9a3412', '#b45309'],
          'circle-radius': ['case', ['boolean', ['get', 'isLinkedSelection'], false], 5, 3],
          'circle-opacity': 0.4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      })
    }

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    records.forEach((record) => {
      if (record.latitude === null || record.longitude === null) {
        return
      }

      const markerElement = document.createElement('button')
      markerElement.type = 'button'
      markerElement.className = [
        'asset-map-marker',
        record.asset.code === selectedAssetCode ? 'is-selected' : '',
        record.asset.is_active ? '' : 'is-inactive',
      ]
        .filter(Boolean)
        .join(' ')
      markerElement.setAttribute('aria-label', `Open asset ${record.asset.code}: ${record.asset.name}`)
      markerElement.title = `${record.asset.code} · ${record.asset.name}`
      markerElement.addEventListener('click', () => {
        handleSelectAsset(record.asset.code)
      })

      const marker = new runtime.Marker({
        element: markerElement,
        anchor: 'center',
      })
        .setLngLat([record.longitude, record.latitude])
        .addTo(map)

      markersRef.current.push(marker)
    })

    map.resize()

    const selectedRecord = records.find((record) => record.asset.code === selectedAssetCode) ?? null
    const fitRecords = selectedRecord ? [selectedRecord] : records
    const allCoordinates = fitRecords.flatMap((record) => record.extentCoordinates)

    if (allCoordinates.length === 1) {
      const [longitude, latitude] = allCoordinates[0]
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), selectedRecord ? 6.2 : 5.2),
        duration: 600,
      })
      return
    }

    if (allCoordinates.length > 1) {
      const bounds = new runtime.LngLatBounds(allCoordinates[0], allCoordinates[0])
      allCoordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate))
      map.fitBounds(bounds, {
        padding: selectedRecord ? 72 : 64,
        duration: 600,
        maxZoom: selectedRecord ? 8 : 6,
      })
    }
  }, [ready, recordSignature, records, selectedAssetCode, spatialFeatureSignature, spatialFeatures])

  return (
    <div className="asset-map-canvas-shell">
      <div ref={containerRef} className="asset-map-canvas" />
      {loadError ? <div className="asset-map-overlay">{loadError}</div> : null}
    </div>
  )
}

export function AssetMapPanel({
  assets,
  locations,
  spatialFeatures,
  selectedAssetCode,
  onSelectAsset,
}: AssetMapPanelProps) {
  const mapSummary = useMemo(() => buildAssetMapSummary(assets, locations), [assets, locations])
  const selectedRecord = mapSummary.mappedRecords.find((record) => record.asset.code === selectedAssetCode) ?? null
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.code === selectedAssetCode) ?? null,
    [assets, selectedAssetCode],
  )
  const activeSpatialFeatures = useMemo(
    () => spatialFeatures.filter((feature) => feature.is_active),
    [spatialFeatures],
  )
  const hiddenAssetCount = Math.max(0, assets.length - mapSummary.mappedCount)

  return (
    <section className="asset-map-shell">
      <div className="asset-map-head">
        <div>
          <span className="eyebrow">Map</span>
          <h4>Asset Footprint</h4>
          <p>
            The map prefers asset GeoJSON, then direct asset coordinates, then the linked location
            coordinates, and now overlays governed spatial features like routes and regions for shared context.
            Only map-ready assets are included here.
          </p>
        </div>
        <div className="asset-map-stats" aria-label="Asset map coverage">
          <span className="entity-chip entity-chip-soft">{mapSummary.mappedCount} plotted</span>
          <span className="entity-chip entity-chip-soft">{mapSummary.assetGeometryCount} geometry</span>
          <span className="entity-chip entity-chip-soft">{mapSummary.assetPointCount} asset points</span>
          <span className="entity-chip entity-chip-soft">{mapSummary.linkedLocationCount} linked locations</span>
          <span className="entity-chip entity-chip-soft">{activeSpatialFeatures.length} shared overlays</span>
          <span className="entity-chip entity-chip-soft">{hiddenAssetCount} hidden</span>
        </div>
      </div>

      {mapSummary.mappedCount > 0 ? (
        <AssetMapCanvas
          records={mapSummary.mappedRecords}
          spatialFeatures={activeSpatialFeatures}
          selectedAssetCode={selectedAssetCode}
          onSelectAsset={onSelectAsset}
        />
      ) : (
        <div className="asset-map-empty">
          <strong>No filtered assets are map-ready yet.</strong>
          <p>
            This map only includes assets with GeoJSON, direct asset coordinates, or linked
            location coordinates.
          </p>
        </div>
      )}

      <div className="asset-map-summary-grid">
        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Selected Asset</strong>
            <span className="entity-chip entity-chip-soft">{selectedRecord?.asset.code ?? 'No selection'}</span>
          </div>
          {selectedRecord ? (
            <>
              <p>
                {selectedRecord.asset.name} · {selectedRecord.asset.asset_class} ·{' '}
                {selectedRecord.asset.asset_type}
              </p>
              <p>{formatAssetMapSource(selectedRecord)}</p>
              <p>{formatAssetMapPlacement(selectedRecord)}</p>
            </>
          ) : selectedAsset ? (
            <p>
              {selectedAsset.code} is not map-ready yet. Only assets with GeoJSON, direct coordinates,
              or linked location coordinates are eligible for the map.
            </p>
          ) : (
            <p>Pan freely, or select a plotted asset from the map or directory to inspect its placement.</p>
          )}
        </div>

        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Map Scope</strong>
            <span className="entity-chip entity-chip-soft">{hiddenAssetCount}</span>
          </div>
          {hiddenAssetCount > 0 ? (
            <p>
              {hiddenAssetCount} filtered asset{hiddenAssetCount === 1 ? '' : 's'} are currently hidden from
              the map until they gain GeoJSON, direct coordinates, or linked location coordinates.
            </p>
          ) : (
            <p>All filtered assets currently meet the map-ready rules.</p>
          )}
        </div>
      </div>

      {mapSummary.mappedRecords.length > 0 ? (
        <p className="form-note asset-map-footnote">
          Example plotted asset: {formatAssetMapLocation(mapSummary.mappedRecords[0])}. Shared overlays stay visible for corridors, routes, and regions.
        </p>
      ) : null}
    </section>
  )
}
