import type { AssetRecord, LocationRecord, SpatialFeatureRecord } from '../../shared/models'
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'

type AssetGeometrySource = 'ASSET_GEOMETRY' | 'ASSET_POINT' | 'LINKED_LOCATION'

type AssetGeoJsonProperties = GeoJsonProperties & {
  assetCode?: string
  assetName?: string
  featureCode?: string
  featureName?: string
  featureKind?: string
  entityType?: string | null
  entityCode?: string | null
}

type GeoJsonFeature = Feature<Geometry, AssetGeoJsonProperties>
type GeoJsonFeatureCollection = FeatureCollection<Geometry, AssetGeoJsonProperties>

export type AssetMapPlacementStatus =
  | 'asset_geometry'
  | 'asset_coordinates'
  | 'linked_location'
  | 'missing_coordinates'
  | 'missing_location'

export type AssetMapRecord = {
  asset: AssetRecord
  location: LocationRecord | null
  latitude: number | null
  longitude: number | null
  geometryFeatures: GeoJsonFeature[]
  extentCoordinates: Array<[number, number]>
  placementStatus: AssetMapPlacementStatus
}

export type AssetMapSummary = {
  records: AssetMapRecord[]
  mappedRecords: AssetMapRecord[]
  unmappedRecords: AssetMapRecord[]
  mappedCount: number
  assetGeometryCount: number
  assetPointCount: number
  linkedLocationCount: number
  missingCoordinatesCount: number
  missingLocationCount: number
  inactiveCount: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGeoJsonGeometry(value: unknown): value is Geometry {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }

  switch (value.type) {
    case 'Point':
    case 'MultiPoint':
    case 'LineString':
    case 'MultiLineString':
    case 'Polygon':
    case 'MultiPolygon':
      return 'coordinates' in value
    case 'GeometryCollection':
      return Array.isArray(value.geometries) && value.geometries.every((entry) => isGeoJsonGeometry(entry))
    default:
      return false
  }
}

function hasCoordinates(location: LocationRecord | null): location is LocationRecord & {
  latitude: number
  longitude: number
} {
  return (
    location !== null &&
    isFiniteNumber(location.latitude) &&
    isFiniteNumber(location.longitude)
  )
}

function collectPositions(value: unknown, positions: Array<[number, number]>): void {
  if (!Array.isArray(value)) {
    return
  }

  if (value.length >= 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1])) {
    positions.push([value[0], value[1]])
    return
  }

  value.forEach((entry) => collectPositions(entry, positions))
}

function collectGeometryPositions(
  geometry: Geometry,
  positions: Array<[number, number]>,
): void {
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((entry) => collectGeometryPositions(entry, positions))
    return
  }

  collectPositions('coordinates' in geometry ? geometry.coordinates : null, positions)
}

function toFeatureList(
  geojson: Record<string, unknown> | null | undefined,
  asset: AssetRecord,
): GeoJsonFeature[] {
  if (!geojson || typeof geojson.type !== 'string') {
    return []
  }

  if (geojson.type === 'FeatureCollection') {
    const features = Array.isArray(geojson.features) ? geojson.features : []
    return features.flatMap((feature) =>
      isRecord(feature)
        ? toFeatureList(feature, asset)
        : [],
    )
  }

  if (geojson.type === 'Feature') {
    if (!isGeoJsonGeometry(geojson.geometry)) {
      return []
    }

    return [
      {
        type: 'Feature',
        geometry: geojson.geometry,
        properties:
          isRecord(geojson.properties)
            ? {
                ...geojson.properties,
                assetCode: asset.code,
                assetName: asset.name,
              }
            : {
                assetCode: asset.code,
                assetName: asset.name,
              },
      },
    ]
  }

  if (!isGeoJsonGeometry(geojson)) {
    return []
  }

  return [
    {
      type: 'Feature',
      geometry: geojson,
      properties: {
        assetCode: asset.code,
        assetName: asset.name,
      },
    },
  ]
}

function toSpatialFeatureList(
  geojson: Record<string, unknown> | null | undefined,
  feature: SpatialFeatureRecord,
): GeoJsonFeature[] {
  if (!geojson || typeof geojson.type !== 'string') {
    return []
  }

  if (geojson.type === 'FeatureCollection') {
    const features = Array.isArray(geojson.features) ? geojson.features : []
    return features.flatMap((entry) => (isRecord(entry) ? toSpatialFeatureList(entry, feature) : []))
  }

  if (geojson.type === 'Feature') {
    if (!isGeoJsonGeometry(geojson.geometry)) {
      return []
    }

    return [
      {
        type: 'Feature',
        geometry: geojson.geometry,
        properties:
          isRecord(geojson.properties)
            ? {
                ...geojson.properties,
                featureCode: feature.code,
                featureName: feature.name,
                featureKind: feature.feature_kind,
                entityType: feature.entity_type ?? null,
                entityCode: feature.entity_code ?? null,
              }
            : {
                featureCode: feature.code,
                featureName: feature.name,
                featureKind: feature.feature_kind,
                entityType: feature.entity_type ?? null,
                entityCode: feature.entity_code ?? null,
              },
      },
    ]
  }

  if (!isGeoJsonGeometry(geojson)) {
    return []
  }

  return [
    {
      type: 'Feature',
      geometry: geojson,
      properties: {
        featureCode: feature.code,
        featureName: feature.name,
        featureKind: feature.feature_kind,
        entityType: feature.entity_type ?? null,
        entityCode: feature.entity_code ?? null,
      },
    },
  ]
}

function buildRepresentativeCoordinate(
  positions: Array<[number, number]>,
): { latitude: number | null; longitude: number | null } {
  if (positions.length === 0) {
    return { latitude: null, longitude: null }
  }

  let minLongitude = positions[0][0]
  let maxLongitude = positions[0][0]
  let minLatitude = positions[0][1]
  let maxLatitude = positions[0][1]

  positions.forEach(([longitude, latitude]) => {
    minLongitude = Math.min(minLongitude, longitude)
    maxLongitude = Math.max(maxLongitude, longitude)
    minLatitude = Math.min(minLatitude, latitude)
    maxLatitude = Math.max(maxLatitude, latitude)
  })

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
  }
}

function buildMappedRecord(args: {
  asset: AssetRecord
  location: LocationRecord | null
  geometryFeatures?: GeoJsonFeature[]
  placementStatus: AssetMapPlacementStatus
  representativeCoordinate: { latitude: number | null; longitude: number | null }
  extentCoordinates: Array<[number, number]>
}): AssetMapRecord {
  return {
    asset: args.asset,
    location: args.location,
    latitude: args.representativeCoordinate.latitude,
    longitude: args.representativeCoordinate.longitude,
    geometryFeatures: args.geometryFeatures ?? [],
    extentCoordinates: args.extentCoordinates,
    placementStatus: args.placementStatus,
  }
}

function placementSource(record: AssetMapRecord): AssetGeometrySource | null {
  switch (record.placementStatus) {
    case 'asset_geometry':
      return 'ASSET_GEOMETRY'
    case 'asset_coordinates':
      return 'ASSET_POINT'
    case 'linked_location':
      return 'LINKED_LOCATION'
    default:
      return null
  }
}

export function buildAssetMapSummary(
  assets: AssetRecord[],
  locations: LocationRecord[],
): AssetMapSummary {
  const locationByCode = new Map(locations.map((location) => [location.code, location]))

  const records = assets.map<AssetMapRecord>((asset) => {
    const location =
      asset.location_code && asset.location_code.trim().length > 0
        ? locationByCode.get(asset.location_code) ?? null
        : null

    const geometryFeatures = toFeatureList(asset.geometry_geojson, asset)
    if (geometryFeatures.length > 0) {
      const geometryPositions: Array<[number, number]> = []
      geometryFeatures.forEach((feature) => collectGeometryPositions(feature.geometry, geometryPositions))
      const representativeCoordinate = buildRepresentativeCoordinate(geometryPositions)
      if (representativeCoordinate.latitude !== null && representativeCoordinate.longitude !== null) {
        return buildMappedRecord({
          asset,
          location,
          geometryFeatures,
          placementStatus: 'asset_geometry',
          representativeCoordinate,
          extentCoordinates: geometryPositions,
        })
      }
    }

    if (isFiniteNumber(asset.latitude) && isFiniteNumber(asset.longitude)) {
      return buildMappedRecord({
        asset,
        location,
        placementStatus: 'asset_coordinates',
        representativeCoordinate: {
          latitude: asset.latitude,
          longitude: asset.longitude,
        },
        extentCoordinates: [[asset.longitude, asset.latitude]],
      })
    }

    if (!location) {
      return buildMappedRecord({
        asset,
        location: null,
        placementStatus: 'missing_location',
        representativeCoordinate: { latitude: null, longitude: null },
        extentCoordinates: [],
      })
    }

    if (!hasCoordinates(location)) {
      return buildMappedRecord({
        asset,
        location,
        placementStatus: 'missing_coordinates',
        representativeCoordinate: { latitude: null, longitude: null },
        extentCoordinates: [],
      })
    }

    return buildMappedRecord({
      asset,
      location,
      placementStatus: 'linked_location',
      representativeCoordinate: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      extentCoordinates: [[location.longitude, location.latitude]],
    })
  })

  const mappedRecords = records.filter((record) => placementSource(record) !== null)
  const unmappedRecords = records.filter((record) => placementSource(record) === null)

  return {
    records,
    mappedRecords,
    unmappedRecords,
    mappedCount: mappedRecords.length,
    assetGeometryCount: records.filter((record) => record.placementStatus === 'asset_geometry').length,
    assetPointCount: records.filter((record) => record.placementStatus === 'asset_coordinates').length,
    linkedLocationCount: records.filter((record) => record.placementStatus === 'linked_location').length,
    missingCoordinatesCount: records.filter((record) => record.placementStatus === 'missing_coordinates').length,
    missingLocationCount: records.filter((record) => record.placementStatus === 'missing_location').length,
    inactiveCount: records.filter((record) => !record.asset.is_active).length,
  }
}

export function buildAssetMapFeatureCollection(records: AssetMapRecord[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: records.flatMap((record) =>
      record.geometryFeatures.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          assetCode: record.asset.code,
          assetName: record.asset.name,
        },
      })),
    ),
  }
}

export function buildSpatialFeatureMapFeatureCollection(
  spatialFeatures: SpatialFeatureRecord[],
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spatialFeatures.flatMap((feature) =>
      toSpatialFeatureList(feature.geometry_geojson, feature).map((entry) => ({
        ...entry,
        properties: {
          ...(entry.properties ?? {}),
          featureCode: feature.code,
          featureName: feature.name,
          featureKind: feature.feature_kind,
          entityType: feature.entity_type ?? null,
          entityCode: feature.entity_code ?? null,
        },
      })),
    ),
  }
}

export function formatAssetMapLocation(record: AssetMapRecord): string {
  if (!record.location) {
    return record.asset.location_code ?? 'No linked location'
  }

  return record.location.name.trim().length > 0
    ? `${record.location.code} · ${record.location.name}`
    : record.location.code
}

function formatCoordinate(value: number): string {
  return value.toFixed(4)
}

export function formatAssetMapSource(record: AssetMapRecord): string {
  switch (record.placementStatus) {
    case 'asset_geometry':
      return 'Asset geometry'
    case 'asset_coordinates':
      return 'Asset coordinates'
    case 'linked_location':
      return 'Linked location'
    case 'missing_coordinates':
      return 'Missing coordinates'
    case 'missing_location':
      return 'Missing location'
    default:
      return 'Unknown'
  }
}

export function formatAssetMapPlacement(record: AssetMapRecord): string {
  if (record.latitude !== null && record.longitude !== null) {
    if (record.placementStatus === 'linked_location') {
      return `${formatAssetMapSource(record)} · ${formatAssetMapLocation(record)} · ${formatCoordinate(record.latitude)}, ${formatCoordinate(record.longitude)}`
    }

    return `${formatAssetMapSource(record)} · ${formatCoordinate(record.latitude)}, ${formatCoordinate(record.longitude)}`
  }

  if (record.placementStatus === 'missing_coordinates') {
    return `${formatAssetMapLocation(record)} is missing latitude/longitude`
  }

  if (record.asset.location_code) {
    return `Linked location ${record.asset.location_code} is not available`
  }

  return 'Asset is not linked to a reference location'
}
