import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  buildAssetMapSummary,
  formatAssetMapLocation,
  formatAssetMapPlacement,
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

  const recordSignature = useMemo(
    () =>
      records
        .map((record) => `${record.asset.code}:${record.latitude ?? 'na'}:${record.longitude ?? 'na'}`)
        .join('|'),
    [records],
  )

  useEffect(() => {
    if (!ready || !mapRef.current || !runtimeRef.current) {
      return
    }

    const map = mapRef.current
    const runtime = runtimeRef.current

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
      markerElement.setAttribute(
        'aria-label',
        `Open asset ${record.asset.code}: ${record.asset.name}`,
      )
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
    if (selectedRecord && selectedRecord.latitude !== null && selectedRecord.longitude !== null) {
      map.easeTo({
        center: [selectedRecord.longitude, selectedRecord.latitude],
        zoom: Math.max(map.getZoom(), 5.8),
        duration: 600,
      })
      return
    }

    if (records.length === 1 && records[0].latitude !== null && records[0].longitude !== null) {
      map.easeTo({
        center: [records[0].longitude, records[0].latitude],
        zoom: 5.2,
        duration: 600,
      })
      return
    }

    if (records.length > 1) {
      const bounds = new runtime.LngLatBounds(
        [records[0].longitude ?? 0, records[0].latitude ?? 0],
        [records[0].longitude ?? 0, records[0].latitude ?? 0],
      )
      records.forEach((record) => {
        if (record.latitude !== null && record.longitude !== null) {
          bounds.extend([record.longitude, record.latitude])
        }
      })
      map.fitBounds(bounds, {
        padding: 64,
        duration: 600,
        maxZoom: 6,
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
  const selectedRecord =
    mapSummary.records.find((record) => record.asset.code === selectedAssetCode) ?? null

  const pendingPlacementPreview = mapSummary.unmappedRecords.slice(0, 3)

  return (
    <section className="asset-map-shell">
      <div className="asset-map-head">
        <div>
          <span className="eyebrow">Map</span>
          <h4>Asset Footprint</h4>
          <p>
            Plotting follows each asset&apos;s linked reference location, so zoom, pan, and rotate
            the footprint before opening the asset record in the editor.
          </p>
        </div>
        <div className="asset-map-stats" aria-label="Asset map coverage">
          <span className="entity-chip entity-chip-soft">{mapSummary.mappedCount} plotted</span>
          <span className="entity-chip entity-chip-soft">
            {mapSummary.missingCoordinatesCount} awaiting coordinates
          </span>
          <span className="entity-chip entity-chip-soft">
            {mapSummary.missingLocationCount} missing location links
          </span>
          <span className="entity-chip entity-chip-soft">{mapSummary.inactiveCount} inactive</span>
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
            Add latitude and longitude to the linked reference locations, or connect each asset to
            an existing point location.
          </p>
        </div>
      )}

      <div className="asset-map-summary-grid">
        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Selected Asset</strong>
            <span className="entity-chip entity-chip-soft">
              {selectedRecord?.asset.code ?? 'No selection'}
            </span>
          </div>
          {selectedRecord ? (
            <>
              <p>
                {selectedRecord.asset.name} · {selectedRecord.asset.asset_class} ·{' '}
                {selectedRecord.asset.asset_type}
              </p>
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
            <p>All filtered assets currently have usable map coordinates.</p>
          )}
        </div>
      </div>

      {mapSummary.mappedRecords.length > 0 ? (
        <p className="form-note asset-map-footnote">
          Selected markers use the linked location label, such as{' '}
          {formatAssetMapLocation(mapSummary.mappedRecords[0])}.
        </p>
      ) : null}
    </section>
  )
}
