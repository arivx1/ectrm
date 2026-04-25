import type { AssetRecord, LocationRecord } from '../../shared/models'

export type AssetMapPlacementStatus = 'mapped' | 'missing_coordinates' | 'missing_location'

export type AssetMapRecord = {
  asset: AssetRecord
  location: LocationRecord | null
  latitude: number | null
  longitude: number | null
  placementStatus: AssetMapPlacementStatus
}

export type AssetMapSummary = {
  records: AssetMapRecord[]
  mappedRecords: AssetMapRecord[]
  unmappedRecords: AssetMapRecord[]
  mappedCount: number
  missingCoordinatesCount: number
  missingLocationCount: number
  inactiveCount: number
}

function hasCoordinates(location: LocationRecord | null): location is LocationRecord & {
  latitude: number
  longitude: number
} {
  return (
    location !== null &&
    typeof location.latitude === 'number' &&
    Number.isFinite(location.latitude) &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.longitude)
  )
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

    if (!location) {
      return {
        asset,
        location: null,
        latitude: null,
        longitude: null,
        placementStatus: 'missing_location',
      }
    }

    if (!hasCoordinates(location)) {
      return {
        asset,
        location,
        latitude: null,
        longitude: null,
        placementStatus: 'missing_coordinates',
      }
    }

    return {
      asset,
      location,
      latitude: location.latitude,
      longitude: location.longitude,
      placementStatus: 'mapped',
    }
  })

  const mappedRecords = records.filter((record) => record.placementStatus === 'mapped')
  const unmappedRecords = records.filter((record) => record.placementStatus !== 'mapped')

  return {
    records,
    mappedRecords,
    unmappedRecords,
    mappedCount: mappedRecords.length,
    missingCoordinatesCount: records.filter((record) => record.placementStatus === 'missing_coordinates').length,
    missingLocationCount: records.filter((record) => record.placementStatus === 'missing_location').length,
    inactiveCount: records.filter((record) => !record.asset.is_active).length,
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

export function formatAssetMapPlacement(record: AssetMapRecord): string {
  if (record.placementStatus === 'mapped' && record.latitude !== null && record.longitude !== null) {
    return `${formatAssetMapLocation(record)} · ${formatCoordinate(record.latitude)}, ${formatCoordinate(record.longitude)}`
  }

  if (record.placementStatus === 'missing_coordinates') {
    return `${formatAssetMapLocation(record)} is missing latitude/longitude`
  }

  if (record.asset.location_code) {
    return `Linked location ${record.asset.location_code} is not available`
  }

  return 'Asset is not linked to a reference location'
}
