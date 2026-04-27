import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  buildAssetMapFeatureCollection,
  buildAssetMapSummary,
  formatAssetMapLocation,
  formatAssetMapPlacement,
  formatAssetMapSource,
  type AssetMapRecord,
} from '../../../features/reference-data/assetMap'
import type { AssetRecord, LocationRecord } from '../../../shared/models'

type AssetMapPanelProps = {
  assets: AssetRecord[]
  locations: LocationRecord[]
  selectedAssetCode: string | null
  onSelectAsset: (code: string) => void
}

type MapLibreModule = typeof import('maplibre-gl')

const ASSET_GEOMETRY_SOURCE_ID = 'asset-geometry-source'
const ASSET_GEOMETRY_FILL_LAYER_ID = 'asset-geometry-fill-layer'
const ASSET_GEOMETRY_LINE_LAYER_ID = 'asset-geometry-line-layer'
const ASSET_GEOMETRY_POINT_LAYER_ID = 'asset-geometry-point-layer'

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

function AssetMapCanvas({
  records,
  selectedAssetCode,
  onSelectAsset,
}: {
  records: AssetMapRecord[]
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
  }, [ready, recordSignature, records, selectedAssetCode])

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
  selectedAssetCode,
  onSelectAsset,
}: AssetMapPanelProps) {
  const mapSummary = useMemo(() => buildAssetMapSummary(assets, locations), [assets, locations])
  const selectedRecord = mapSummary.records.find((record) => record.asset.code === selectedAssetCode) ?? null
  const pendingPlacementPreview = mapSummary.unmappedRecords.slice(0, 3)

  return (
    <section className="asset-map-shell">
      <div className="asset-map-head">
        <div>
          <span className="eyebrow">Map</span>
          <h4>Asset Footprint</h4>
          <p>
            The map prefers asset GeoJSON, then direct asset coordinates, then the linked location
            coordinates, so we can zoom, pan, and rotate around the physical footprint instead of a
            generic reference point.
          </p>
        </div>
        <div className="asset-map-stats" aria-label="Asset map coverage">
          <span className="entity-chip entity-chip-soft">{mapSummary.mappedCount} plotted</span>
          <span className="entity-chip entity-chip-soft">{mapSummary.assetGeometryCount} geometry</span>
          <span className="entity-chip entity-chip-soft">{mapSummary.assetPointCount} asset points</span>
          <span className="entity-chip entity-chip-soft">{mapSummary.linkedLocationCount} linked locations</span>
          <span className="entity-chip entity-chip-soft">
            {mapSummary.missingCoordinatesCount} awaiting coordinates
          </span>
        </div>
      </div>

      {mapSummary.mappedCount > 0 ? (
        <AssetMapCanvas
          records={mapSummary.mappedRecords}
          selectedAssetCode={selectedAssetCode}
          onSelectAsset={onSelectAsset}
        />
      ) : (
        <div className="asset-map-empty">
          <strong>No filtered assets can be plotted yet.</strong>
          <p>
            Add asset GeoJSON, direct asset latitude and longitude, or coordinates on the linked
            reference location.
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
          ) : (
            <p>Select a plotted asset from the map or directory to center the view and prep the editor.</p>
          )}
        </div>

        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Placement Gaps</strong>
            <span className="entity-chip entity-chip-soft">{mapSummary.unmappedRecords.length}</span>
          </div>
          {pendingPlacementPreview.length > 0 ? (
            <ul className="asset-map-gap-list">
              {pendingPlacementPreview.map((record) => (
                <li key={record.asset.code}>
                  <strong>{record.asset.code}</strong>
                  <span>{formatAssetMapPlacement(record)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>All filtered assets currently have usable map placement data.</p>
          )}
        </div>
      </div>

      {mapSummary.mappedRecords.length > 0 ? (
        <p className="form-note asset-map-footnote">
          Current selection example: {formatAssetMapLocation(mapSummary.mappedRecords[0])}.
        </p>
      ) : null}
    </section>
  )
}
