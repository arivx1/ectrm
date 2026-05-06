import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  loadWeatherForecastPeriods,
  loadWeatherObservations,
} from '../../../entities/weather/api'
import {
  formatWeatherAgeHours,
  formatWeatherPeriodWindow,
  summarizeWeatherForecast,
  summarizeWeatherObservation,
  weatherHealthLabel,
  weatherHealthTone,
} from '../../../entities/weather/presentation'
import {
  assetMapSubtypeLabelForAsset,
  ASSET_MAP_SUBTYPE_LABELS,
  buildAssetMapFeatureCollection,
  buildAssetMapSummary,
  buildSpatialFeatureMapFeatureCollection,
  formatAssetMapLocation,
  formatAssetMapPlacement,
  formatAssetMapSource,
  type AssetMapRecord,
} from '../../../features/reference-data/assetMap'
import { appConfig } from '../../../shared/config'
import type {
  AssetRecord,
  LocationRecord,
  SpatialFeatureRecord,
  WeatherForecastPeriodRecord,
  WeatherLocationRecord,
  WeatherObservationRecord,
  WeatherSyncStatusRecord,
} from '../../../shared/models'

type AssetMapPanelProps = {
  assets: AssetRecord[]
  locations: LocationRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
  weatherDataLoaded?: boolean
  weatherDataLoading?: boolean
  weatherLoadError?: string
  selectedAssetCode: string | null
  onSelectAsset: (code: string) => void
  filterControls?: ReactNode
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

function buildWeatherLocationSignature(weatherLocations: WeatherLocationRecord[]): string {
  return weatherLocations
    .map((location) =>
      [
        location.code,
        location.latitude,
        location.longitude,
        location.is_active,
        location.updated_at,
      ].join(':'),
    )
    .join('|')
}

function buildWeatherStatusSignature(weatherSyncStatus: WeatherSyncStatusRecord | null): string {
  return (weatherSyncStatus?.locations ?? [])
    .map((location) =>
      [
        location.code,
        location.health_status,
        location.forecast_age_hours ?? 'na',
        location.observation_age_hours ?? 'na',
      ].join(':'),
    )
    .join('|')
}

export function sortedUniqueAssetSubtypes(records: AssetMapRecord[]): string[] {
  const presentSubtypeLabels = new Set(
    records.map((record) => assetMapSubtypeLabelForAsset(record.asset)),
  )

  return ASSET_MAP_SUBTYPE_LABELS.filter((subtypeLabel) => presentSubtypeLabels.has(subtypeLabel))
}

export function syncAssetSubtypeVisibilityState(
  assetSubtypes: string[],
  currentState: Record<string, boolean>,
): Record<string, boolean> {
  return assetSubtypes.reduce<Record<string, boolean>>((nextState, assetSubtype) => {
    nextState[assetSubtype] = currentState[assetSubtype] ?? true
    return nextState
  }, {})
}

function assetSubtypeVisibilityStatesMatch(
  left: Record<string, boolean>,
  right: Record<string, boolean>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => left[key] === right[key])
}

function isAssetSubtypeVisible(
  assetSubtypeVisibility: Record<string, boolean>,
  assetSubtype: string,
): boolean {
  return assetSubtypeVisibility[assetSubtype] !== false
}

function buildVisiblePlacementCounts(records: AssetMapRecord[]): {
  assetGeometryCount: number
  assetPointCount: number
  linkedLocationCount: number
} {
  return records.reduce(
    (counts, record) => {
      switch (record.placementStatus) {
        case 'asset_geometry':
          counts.assetGeometryCount += 1
          break
        case 'asset_coordinates':
          counts.assetPointCount += 1
          break
        case 'linked_location':
          counts.linkedLocationCount += 1
          break
        default:
          break
      }

      return counts
    },
    {
      assetGeometryCount: 0,
      assetPointCount: 0,
      linkedLocationCount: 0,
    },
  )
}

function formatGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission is blocked for this browser session.'
    case error.POSITION_UNAVAILABLE:
      return 'Current location could not be determined right now.'
    case error.TIMEOUT:
      return 'Current location lookup timed out. Try again.'
    default:
      return 'Current location could not be determined.'
  }
}

function formatWeatherLayerStatus(params: {
  activeLocationCount: number
  weatherDataLoaded: boolean
  weatherDataLoading: boolean
  weatherLoadError: string
}): string {
  const { activeLocationCount, weatherDataLoaded, weatherDataLoading, weatherLoadError } = params

  if (weatherLoadError) {
    return 'Weather Error'
  }

  if (weatherDataLoading || !weatherDataLoaded) {
    return 'Loading tracked weather points...'
  }

  if (activeLocationCount > 0) {
    return `${activeLocationCount} tracked weather point${activeLocationCount === 1 ? '' : 's'} visible`
  }

  return 'No tracked weather points loaded'
}

function logAssetMapError(scope: string, detail: string): void {
  if (typeof console === 'undefined' || !detail.trim()) {
    return
  }

  console.error(`[AssetMap] ${scope}: ${detail}`)
}

export function AssetMapCanvas({
  records,
  spatialFeatures,
  weatherLocations,
  weatherSyncStatus,
  assetSubtypeOptions = [],
  assetSubtypeVisibility = {},
  weatherDataLoaded = false,
  weatherDataLoading = false,
  weatherLoadError = '',
  onToggleAssetSubtype = () => undefined,
  selectedAssetCode,
  onSelectAsset,
  statusTitle,
  statusDetail,
}: {
  records: AssetMapRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
  assetSubtypeOptions: string[]
  assetSubtypeVisibility: Record<string, boolean>
  weatherDataLoaded?: boolean
  weatherDataLoading?: boolean
  weatherLoadError?: string
  onToggleAssetSubtype: (assetSubtype: string) => void
  selectedAssetCode: string | null
  onSelectAsset: (code: string) => void
  statusTitle?: string | null
  statusDetail?: string | null
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<InstanceType<MapLibreModule['Map']> | null>(null)
  const runtimeRef = useRef<MapLibreModule | null>(null)
  const markersRef = useRef<Array<InstanceType<MapLibreModule['Marker']>>>([])
  const weatherMarkersRef = useRef<Array<InstanceType<MapLibreModule['Marker']>>>([])
  const userMarkerRef = useRef<InstanceType<MapLibreModule['Marker']> | null>(null)
  const requestedUserLocationRef = useRef(false)
  const hasCenteredOnUserRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [geolocationError, setGeolocationError] = useState('')
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [showUserLocation, setShowUserLocation] = useState(true)
  const [showAssets, setShowAssets] = useState(true)
  const [showWeather, setShowWeather] = useState(true)
  const [selectedWeatherLocationCode, setSelectedWeatherLocationCode] = useState<string | null>(null)
  const [weatherPreviewLoading, setWeatherPreviewLoading] = useState(false)
  const [weatherPreviewError, setWeatherPreviewError] = useState('')
  const [weatherForecasts, setWeatherForecasts] = useState<WeatherForecastPeriodRecord[]>([])
  const [weatherObservations, setWeatherObservations] = useState<WeatherObservationRecord[]>([])
  const loggedWeatherLoadErrorRef = useRef('')
  const loggedMapLoadErrorRef = useRef('')
  const loggedGeolocationErrorRef = useRef('')
  const loggedWeatherPreviewErrorRef = useRef('')
  const handleSelectAsset = useEffectEvent((code: string) => {
    setSelectedWeatherLocationCode(null)
    onSelectAsset(code)
  })
  const activeWeatherLocations = useMemo(
    () => weatherLocations.filter((location) => location.is_active),
    [weatherLocations],
  )
  const weatherStatusByCode = useMemo(
    () => new Map((weatherSyncStatus?.locations ?? []).map((location) => [location.code, location] as const)),
    [weatherSyncStatus],
  )
  const weatherLocationSignature = useMemo(
    () => buildWeatherLocationSignature(activeWeatherLocations),
    [activeWeatherLocations],
  )
  const weatherStatusSignature = useMemo(
    () => buildWeatherStatusSignature(weatherSyncStatus),
    [weatherSyncStatus],
  )
  const selectedWeatherLocation = useMemo(
    () =>
      activeWeatherLocations.find((location) => location.code === selectedWeatherLocationCode) ?? null,
    [activeWeatherLocations, selectedWeatherLocationCode],
  )
  const selectedWeatherStatus =
    selectedWeatherLocation ? weatherStatusByCode.get(selectedWeatherLocation.code) ?? null : null
  const weatherLayerStatus = formatWeatherLayerStatus({
    activeLocationCount: activeWeatherLocations.length,
    weatherDataLoaded,
    weatherDataLoading,
    weatherLoadError,
  })

  useEffect(() => {
    if (!weatherLoadError || loggedWeatherLoadErrorRef.current === weatherLoadError) {
      return
    }

    logAssetMapError('Weather layer error', weatherLoadError)
    loggedWeatherLoadErrorRef.current = weatherLoadError
  }, [weatherLoadError])

  useEffect(() => {
    if (!loadError || loggedMapLoadErrorRef.current === loadError) {
      return
    }

    logAssetMapError('Map error', loadError)
    loggedMapLoadErrorRef.current = loadError
  }, [loadError])

  useEffect(() => {
    if (!geolocationError || loggedGeolocationErrorRef.current === geolocationError) {
      return
    }

    logAssetMapError('My location error', geolocationError)
    loggedGeolocationErrorRef.current = geolocationError
  }, [geolocationError])

  useEffect(() => {
    if (!weatherPreviewError || loggedWeatherPreviewErrorRef.current === weatherPreviewError) {
      return
    }

    logAssetMapError('Weather preview error', weatherPreviewError)
    loggedWeatherPreviewErrorRef.current = weatherPreviewError
  }, [weatherPreviewError])

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
      weatherMarkersRef.current.forEach((marker) => marker.remove())
      weatherMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      requestedUserLocationRef.current = false
      hasCenteredOnUserRef.current = false
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
    if (showWeather) {
      return
    }

    setSelectedWeatherLocationCode(null)
  }, [showWeather])

  useEffect(() => {
    if (!selectedWeatherLocationCode) {
      return
    }

    if (!showWeather || !activeWeatherLocations.some((location) => location.code === selectedWeatherLocationCode)) {
      setSelectedWeatherLocationCode(null)
    }
  }, [activeWeatherLocations, selectedWeatherLocationCode, showWeather])

  useEffect(() => {
    if (!showWeather || !selectedWeatherLocation) {
      setWeatherPreviewLoading(false)
      setWeatherPreviewError('')
      setWeatherForecasts([])
      setWeatherObservations([])
      return
    }

    let cancelled = false

    async function loadWeatherPreview() {
      setWeatherPreviewLoading(true)
      setWeatherPreviewError('')
      setWeatherForecasts([])
      setWeatherObservations([])

      try {
        const [forecastResult, observationResult] = await Promise.all([
          loadWeatherForecastPeriods(appConfig.apiBase, selectedWeatherLocation.code, 2),
          loadWeatherObservations(appConfig.apiBase, selectedWeatherLocation.code, 2),
        ])

        if (!cancelled) {
          setWeatherForecasts(forecastResult)
          setWeatherObservations(observationResult)
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherPreviewError(
            error instanceof Error ? error.message : 'Unable to load weather location preview.',
          )
        }
      } finally {
        if (!cancelled) {
          setWeatherPreviewLoading(false)
        }
      }
    }

    void loadWeatherPreview()

    return () => {
      cancelled = true
    }
  }, [selectedWeatherLocation, showWeather])

  useEffect(() => {
    if (!ready || !mapRef.current || !runtimeRef.current) {
      return
    }

    const map = mapRef.current
    const runtime = runtimeRef.current
    const hasVisibleAssetData =
      showAssets && records.some((record) => record.extentCoordinates.length > 0)
    const hasVisibleWeatherData = showWeather && activeWeatherLocations.length > 0

    if (!showUserLocation || !userLocation) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }

    userMarkerRef.current?.remove()

    const markerElement = document.createElement('div')
    markerElement.className = 'asset-map-user-marker'
    markerElement.setAttribute('aria-hidden', 'true')

    userMarkerRef.current = new runtime.Marker({
      element: markerElement,
      anchor: 'center',
    })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map)

    if (!hasCenteredOnUserRef.current && !hasVisibleAssetData && !hasVisibleWeatherData) {
      map.easeTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: Math.max(map.getZoom(), 8.5),
        duration: 700,
      })
      hasCenteredOnUserRef.current = true
    }
  }, [activeWeatherLocations, ready, records, showAssets, showUserLocation, showWeather, userLocation])

  useEffect(() => {
    if (!ready || requestedUserLocationRef.current || !showUserLocation) {
      return
    }

    requestedUserLocationRef.current = true

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeolocationError('Current location is not available in this browser.')
      return
    }

    setGeolocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        setGeolocationError(formatGeolocationError(error))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    )
  }, [ready, showUserLocation])

  useEffect(() => {
    if (!ready || !mapRef.current || !runtimeRef.current) {
      return
    }

    const map = mapRef.current
    const runtime = runtimeRef.current
    const visibleRecords = showAssets ? records : []
    const visibleSpatialFeatures = showAssets
      ? spatialFeatures.filter((feature) => feature.is_active)
      : []
    const selectedWeatherLocationForFit =
      showWeather
        ? activeWeatherLocations.find((location) => location.code === selectedWeatherLocationCode) ?? null
        : null

    const featureCollection = buildAssetMapFeatureCollection(visibleRecords)
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

    const spatialFeatureCollection = buildSpatialFeatureMapFeatureCollection(visibleSpatialFeatures)
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
    weatherMarkersRef.current.forEach((marker) => marker.remove())
    weatherMarkersRef.current = []

    visibleRecords.forEach((record) => {
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

    if (showWeather) {
      activeWeatherLocations.forEach((location) => {
        const weatherStatus = weatherStatusByCode.get(location.code)
        const markerElement = document.createElement('button')
        const markerLabel = document.createElement('span')
        markerLabel.className = 'asset-map-weather-marker-label'
        markerLabel.textContent = 'Wx'
        markerElement.type = 'button'
        markerElement.className = [
          'asset-map-weather-marker',
          `is-${weatherStatus?.health_status ?? 'unknown'}`,
          selectedWeatherLocationCode === location.code ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')
        markerElement.setAttribute('aria-label', `Open weather location ${location.code}: ${location.name}`)
        markerElement.title = `${location.code} · ${location.name}`
        markerElement.append(markerLabel)
        markerElement.addEventListener('click', () => {
          setSelectedWeatherLocationCode(location.code)
          map.easeTo({
            center: [location.longitude, location.latitude],
            zoom: Math.max(map.getZoom(), 6.5),
            duration: 500,
          })
        })

        const marker = new runtime.Marker({
          element: markerElement,
          anchor: 'center',
        })
          .setLngLat([location.longitude, location.latitude])
          .addTo(map)

        weatherMarkersRef.current.push(marker)
      })
    }

    map.resize()

    const weatherCoordinates = showWeather
      ? activeWeatherLocations.map((location) => [location.longitude, location.latitude] as [number, number])
      : []

    if (selectedWeatherLocationForFit) {
      map.easeTo({
        center: [selectedWeatherLocationForFit.longitude, selectedWeatherLocationForFit.latitude],
        zoom: Math.max(map.getZoom(), 6.5),
        duration: 600,
      })
      return
    }

    const selectedRecord = showAssets
      ? records.find((record) => record.asset.code === selectedAssetCode) ?? null
      : null

    if (selectedRecord) {
      const selectedAssetCoordinates = selectedRecord.extentCoordinates

      if (selectedAssetCoordinates.length === 1) {
        const [longitude, latitude] = selectedAssetCoordinates[0]
        map.easeTo({
          center: [longitude, latitude],
          zoom: Math.max(map.getZoom(), 6.2),
          duration: 600,
        })
        return
      }

      if (selectedAssetCoordinates.length > 1) {
        const bounds = new runtime.LngLatBounds(selectedAssetCoordinates[0], selectedAssetCoordinates[0])
        selectedAssetCoordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate))
        map.fitBounds(bounds, {
          padding: 72,
          duration: 600,
          maxZoom: 8,
        })
        return
      }
    }

    const combinedCoordinates = [
      ...visibleRecords.flatMap((record) => record.extentCoordinates),
      ...weatherCoordinates,
    ]

    if (combinedCoordinates.length === 1) {
      const [longitude, latitude] = combinedCoordinates[0]
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 5.4),
        duration: 600,
      })
      return
    }

    if (combinedCoordinates.length > 1) {
      const bounds = new runtime.LngLatBounds(combinedCoordinates[0], combinedCoordinates[0])
      combinedCoordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate))
      map.fitBounds(bounds, {
        padding: 64,
        duration: 600,
        maxZoom: 6.2,
      })
    }
  }, [
    activeWeatherLocations,
    ready,
    recordSignature,
    records,
    selectedAssetCode,
    selectedWeatherLocationCode,
    showAssets,
    showWeather,
    spatialFeatureSignature,
    spatialFeatures,
    weatherLocationSignature,
    weatherStatusByCode,
    weatherStatusSignature,
  ])

  return (
    <div className="asset-map-canvas-shell">
      <div className="asset-map-layer-controls" aria-label="Map layer visibility controls">
        <span className="asset-map-layer-controls-label">Show</span>
        <label className="asset-map-layer-toggle">
          <input
            type="checkbox"
            checked={showUserLocation}
            onChange={(event) => setShowUserLocation(event.target.checked)}
          />
          <span>My Location</span>
        </label>
        <label className="asset-map-layer-toggle">
          <input type="checkbox" checked={showAssets} onChange={(event) => setShowAssets(event.target.checked)} />
          <span>Assets</span>
        </label>
        <label className="asset-map-layer-toggle">
          <input type="checkbox" checked={showWeather} onChange={(event) => setShowWeather(event.target.checked)} />
          <span>Weather</span>
        </label>
        {showWeather ? (
          <div className="asset-map-layer-status" aria-live="polite">
            <span className="asset-map-weather-legend-marker" aria-hidden="true">
              <span className="asset-map-weather-marker-label">Wx</span>
            </span>
            <span>{weatherLayerStatus}</span>
          </div>
        ) : null}
      </div>

      {showAssets && assetSubtypeOptions.length > 0 ? (
        <div className="asset-map-subtype-controls" aria-label="Asset category visibility controls">
          <span className="asset-map-subtype-controls-label">Asset Categories</span>
          {assetSubtypeOptions.map((assetSubtype) => (
            <label key={assetSubtype} className="asset-map-subtype-toggle">
              <input
                type="checkbox"
                checked={isAssetSubtypeVisible(assetSubtypeVisibility, assetSubtype)}
                onChange={() => onToggleAssetSubtype(assetSubtype)}
              />
              <span>{assetSubtype}</span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="asset-map-canvas-frame">
        <div ref={containerRef} className="asset-map-canvas" />

        {showWeather && selectedWeatherLocation ? (
          <div className="asset-map-weather-preview">
            <div className="asset-map-weather-preview-head">
              <div>
                <strong>{selectedWeatherLocation.code}</strong>
                <p>{selectedWeatherLocation.name}</p>
              </div>
              <button
                type="button"
                className="asset-map-weather-preview-close"
                aria-label={`Close weather preview for ${selectedWeatherLocation.code}`}
                onClick={() => setSelectedWeatherLocationCode(null)}
              >
                ×
              </button>
            </div>

            <div className="asset-map-weather-preview-meta">
              <span
                className={`status-pill status-pill-${weatherHealthTone(selectedWeatherStatus?.health_status ?? 'unknown')}`}
              >
                {weatherHealthLabel(selectedWeatherStatus?.health_status ?? 'unknown')}
              </span>
              {selectedWeatherStatus ? (
                <>
                  <span className="entity-chip entity-chip-soft">
                    Forecast {formatWeatherAgeHours(selectedWeatherStatus.forecast_age_hours)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    Observation {formatWeatherAgeHours(selectedWeatherStatus.observation_age_hours)}
                  </span>
                </>
              ) : null}
            </div>

            {weatherPreviewError ? <p>Weather Error</p> : null}
            {!weatherPreviewError && weatherPreviewLoading ? <p>Loading weather preview...</p> : null}
            {!weatherPreviewError && !weatherPreviewLoading ? (
              <>
                <p>
                  <strong>Latest obs:</strong>{' '}
                  {weatherObservations[0]
                    ? summarizeWeatherObservation(weatherObservations[0])
                    : 'No recent observations are stored for this location yet.'}
                </p>
                <p>
                  <strong>Next forecast:</strong>{' '}
                  {weatherForecasts[0]
                    ? `${formatWeatherPeriodWindow(weatherForecasts[0].start_at, weatherForecasts[0].end_at)} · ${summarizeWeatherForecast(weatherForecasts[0])}`
                    : 'No current forecast periods are stored for this location yet.'}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
        {showUserLocation && geolocationError ? (
          <div className="asset-map-control-feedback">My Location Error</div>
        ) : null}
        {loadError ? <div className="asset-map-overlay">Map Error</div> : null}
        {!loadError && statusTitle ? (
          <div className="asset-map-overlay asset-map-overlay-info">
            <strong>{statusTitle}</strong>
            {statusDetail ? <p>{statusDetail}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AssetMapPanel({
  assets,
  locations,
  spatialFeatures,
  weatherLocations,
  weatherSyncStatus,
  weatherDataLoaded = false,
  weatherDataLoading = false,
  weatherLoadError = '',
  selectedAssetCode,
  onSelectAsset,
  filterControls,
}: AssetMapPanelProps) {
  const mapSummary = useMemo(() => buildAssetMapSummary(assets, locations), [assets, locations])
  const [assetSubtypeVisibility, setAssetSubtypeVisibility] = useState<Record<string, boolean>>({})
  const assetSubtypeOptions = useMemo(
    () => sortedUniqueAssetSubtypes(mapSummary.records),
    [mapSummary.records],
  )
  const visibleRecordCandidates = useMemo(
    () =>
      mapSummary.records.filter((record) =>
        isAssetSubtypeVisible(assetSubtypeVisibility, assetMapSubtypeLabelForAsset(record.asset)),
      ),
    [assetSubtypeVisibility, mapSummary.records],
  )
  const visibleMappedRecords = useMemo(
    () =>
      mapSummary.mappedRecords.filter((record) =>
        isAssetSubtypeVisible(assetSubtypeVisibility, assetMapSubtypeLabelForAsset(record.asset)),
      ),
    [assetSubtypeVisibility, mapSummary.mappedRecords],
  )
  const selectedRecord = visibleMappedRecords.find((record) => record.asset.code === selectedAssetCode) ?? null
  const selectedAssetRecord = useMemo(
    () => mapSummary.records.find((record) => record.asset.code === selectedAssetCode) ?? null,
    [mapSummary.records, selectedAssetCode],
  )
  const selectedAsset = selectedAssetRecord?.asset ?? null
  const activeSpatialFeatures = useMemo(
    () => spatialFeatures.filter((feature) => feature.is_active),
    [spatialFeatures],
  )
  const activeWeatherLocations = useMemo(
    () => weatherLocations.filter((location) => location.is_active),
    [weatherLocations],
  )
  const visiblePlacementCounts = useMemo(
    () => buildVisiblePlacementCounts(visibleMappedRecords),
    [visibleMappedRecords],
  )
  const subtypeHiddenCount = Math.max(0, mapSummary.records.length - visibleRecordCandidates.length)
  const unmappedVisibleCount = Math.max(0, visibleRecordCandidates.length - visibleMappedRecords.length)
  const hiddenAssetCount = subtypeHiddenCount + unmappedVisibleCount
  const mapStatusTitle =
    visibleMappedRecords.length === 0
      ? visibleRecordCandidates.length === 0 && assetSubtypeOptions.length > 0
        ? 'No selected asset categories are visible right now.'
        : 'No filtered assets are map-ready yet.'
      : null
  const mapStatusDetail =
    visibleMappedRecords.length === 0
      ? visibleRecordCandidates.length === 0 && assetSubtypeOptions.length > 0
        ? 'Turn at least one asset category back on to restore plotted assets.'
        : 'The base map is still available for zoom, pan, and rotate. Assets only plot once they have GeoJSON, direct coordinates, or linked location coordinates.'
      : null

  useEffect(() => {
    setAssetSubtypeVisibility((currentState) => {
      const nextState = syncAssetSubtypeVisibilityState(assetSubtypeOptions, currentState)
      return assetSubtypeVisibilityStatesMatch(currentState, nextState) ? currentState : nextState
    })
  }, [assetSubtypeOptions])

  function handleToggleAssetSubtype(assetSubtype: string) {
    setAssetSubtypeVisibility((currentState) => ({
      ...currentState,
      [assetSubtype]: !isAssetSubtypeVisible(currentState, assetSubtype),
    }))
  }

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
          <span className="entity-chip entity-chip-soft">{visibleMappedRecords.length} plotted</span>
          <span className="entity-chip entity-chip-soft">{visiblePlacementCounts.assetGeometryCount} geometry</span>
          <span className="entity-chip entity-chip-soft">{visiblePlacementCounts.assetPointCount} asset points</span>
          <span className="entity-chip entity-chip-soft">{visiblePlacementCounts.linkedLocationCount} linked locations</span>
          <span className="entity-chip entity-chip-soft">{activeSpatialFeatures.length} shared overlays</span>
          {activeWeatherLocations.length > 0 ? (
            <span className="entity-chip entity-chip-soft">{activeWeatherLocations.length} weather points</span>
          ) : null}
          <span className="entity-chip entity-chip-soft">{hiddenAssetCount} hidden</span>
        </div>
      </div>

      {filterControls ? <div className="asset-map-filter-strip">{filterControls}</div> : null}

      <AssetMapCanvas
        records={visibleMappedRecords}
        spatialFeatures={activeSpatialFeatures}
        weatherLocations={weatherLocations}
        weatherSyncStatus={weatherSyncStatus}
        assetSubtypeOptions={assetSubtypeOptions}
        assetSubtypeVisibility={assetSubtypeVisibility}
        weatherDataLoaded={weatherDataLoaded}
        weatherDataLoading={weatherDataLoading}
        weatherLoadError={weatherLoadError}
        onToggleAssetSubtype={handleToggleAssetSubtype}
        selectedAssetCode={selectedAssetCode}
        onSelectAsset={onSelectAsset}
        statusTitle={mapStatusTitle}
        statusDetail={mapStatusDetail}
      />

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
          ) : selectedAssetRecord &&
            !isAssetSubtypeVisible(
              assetSubtypeVisibility,
              assetMapSubtypeLabelForAsset(selectedAssetRecord.asset),
            ) ? (
            <p>
              {selectedAssetRecord.asset.code} is hidden by the current asset category filters.
              Re-enable {assetMapSubtypeLabelForAsset(selectedAssetRecord.asset)} to plot it again.
            </p>
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
          {subtypeHiddenCount > 0 && unmappedVisibleCount > 0 ? (
            <p>
              {subtypeHiddenCount} filtered asset{subtypeHiddenCount === 1 ? '' : 's'} are hidden by
              asset category filters, and {unmappedVisibleCount} visible category match
              {unmappedVisibleCount === 1 ? '' : 'es'} still need GeoJSON, direct coordinates, or
              linked location coordinates.
            </p>
          ) : subtypeHiddenCount > 0 ? (
            <p>
              {subtypeHiddenCount} filtered asset{subtypeHiddenCount === 1 ? '' : 's'} are hidden by
              the current asset category filters.
            </p>
          ) : unmappedVisibleCount > 0 ? (
            <p>
              {unmappedVisibleCount} filtered asset{unmappedVisibleCount === 1 ? '' : 's'} are currently hidden from
              the map until they gain GeoJSON, direct coordinates, or linked location coordinates.
            </p>
          ) : (
            <p>All visible filtered assets currently meet the map-ready rules.</p>
          )}
        </div>
      </div>

      {visibleMappedRecords.length > 0 ? (
        <p className="form-note asset-map-footnote">
          Example plotted asset: {formatAssetMapLocation(visibleMappedRecords[0])}. Shared overlays stay visible for corridors, routes, and regions.
        </p>
      ) : null}
    </section>
  )
}
