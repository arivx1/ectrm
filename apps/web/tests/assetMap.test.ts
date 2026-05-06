import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  assetMapSubtypeLabelForAsset,
  buildAssetMapFeatureCollection,
  buildAssetMapSummary,
  buildSpatialFeatureMapFeatureCollection,
  formatAssetMapLocation,
  formatAssetMapPlacement,
  formatAssetMapSource,
} from '../src/features/reference-data/assetMap'

test('buildAssetMapSummary prefers asset geometry, then asset points, then linked locations', () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: 'PIPE_01',
        name: 'Gulf Transmission',
        description: null,
        is_active: true,
        asset_class: 'PIPELINE',
        asset_type: 'TRANSMISSION',
        commodity_code: 'HENRY_HUB',
        location_code: 'HOUSTON',
        geometry_geojson: {
          type: 'LineString',
          coordinates: [
            [-95.3698, 29.7604],
            [-95.1, 29.9],
          ],
        },
        operating_status: 'OPERATING',
      },
      {
        code: 'STORE_01',
        name: 'North Storage',
        description: null,
        is_active: true,
        asset_class: 'STORAGE',
        asset_type: 'TANK_FARM',
        commodity_code: 'WTI',
        location_code: 'CUSHING',
        latitude: 35.9842,
        longitude: -96.7669,
        operating_status: 'MAINTENANCE',
      },
      {
        code: 'TERM_01',
        name: 'Marine Terminal',
        description: null,
        is_active: false,
        asset_class: 'TERMINAL',
        asset_type: 'MARINE',
        commodity_code: 'ULSD',
        location_code: 'PORTLAND',
        operating_status: 'OPERATING',
      },
      {
        code: 'FIELD_01',
        name: 'Field Sensor',
        description: null,
        is_active: true,
        asset_class: 'UPSTREAM_PRODUCTION',
        asset_type: 'OIL_FIELD',
        commodity_code: 'WTI',
        location_code: 'CUSHING',
        operating_status: 'OPERATING',
      },
      {
        code: 'LOAD_01',
        name: 'Load Pocket',
        description: null,
        is_active: true,
        asset_class: 'CONSUMPTION',
        asset_type: 'INDUSTRIAL',
        commodity_code: 'POWER',
        location_code: null,
        operating_status: 'OPERATING',
      },
    ],
    [
      {
        code: 'HOUSTON',
        name: 'Houston',
        description: null,
        is_active: true,
        location_kind: 'POINT',
        location_type: 'HUB',
        latitude: 29.7604,
        longitude: -95.3698,
      },
      {
        code: 'CUSHING',
        name: 'Cushing',
        description: null,
        is_active: true,
        location_kind: 'POINT',
        location_type: 'TERMINAL',
        latitude: null,
        longitude: null,
      },
      {
        code: 'PORTLAND',
        name: 'Portland',
        description: null,
        is_active: true,
        location_kind: 'POINT',
        location_type: 'PORT',
        latitude: 45.5152,
        longitude: -122.6784,
      },
    ],
  )

  assert.equal(summary.records.length, 5)
  assert.equal(summary.mappedCount, 3)
  assert.equal(summary.assetGeometryCount, 1)
  assert.equal(summary.assetPointCount, 1)
  assert.equal(summary.linkedLocationCount, 1)
  assert.equal(summary.missingCoordinatesCount, 1)
  assert.equal(summary.missingLocationCount, 1)
  assert.equal(summary.inactiveCount, 1)
  assert.equal(summary.mappedRecords[0]?.asset.code, 'PIPE_01')
  assert.equal(summary.unmappedRecords.map((record) => record.asset.code).join(','), 'FIELD_01,LOAD_01')
  assert.equal(summary.records.find((record) => record.asset.code === 'PIPE_01')?.placementStatus, 'asset_geometry')
  assert.equal(summary.records.find((record) => record.asset.code === 'STORE_01')?.placementStatus, 'asset_coordinates')
  assert.equal(summary.records.find((record) => record.asset.code === 'TERM_01')?.placementStatus, 'linked_location')
})

test('asset map subtype labels collapse raw asset taxonomy into operator-friendly map categories', () => {
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: 'UPSTREAM_PRODUCTION',
      asset_type: 'OFFSHORE',
    }),
    'Upstream Oil & Gas',
  )
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: 'PROCESSING',
      asset_type: 'GAS_PLANT',
    }),
    'NG Processing',
  )
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: 'PROCESSING',
      asset_type: 'PETROCHEMICAL',
    }),
    'Petrochem',
  )
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: 'TERMINAL',
      asset_type: 'LNG',
    }),
    'NG Processing',
  )
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: 'TERMINAL',
      asset_type: 'MARINE',
    }),
    'Other',
  )
})

test('asset map formatting explains spatial source and placement gaps', () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: 'PIPE_01',
        name: 'Gulf Transmission',
        description: null,
        is_active: true,
        asset_class: 'PIPELINE',
        asset_type: 'TRANSMISSION',
        commodity_code: 'HENRY_HUB',
        location_code: 'HOUSTON',
        latitude: 30.01,
        longitude: -95.22,
        operating_status: 'OPERATING',
      },
      {
        code: 'TERM_01',
        name: 'Marine Terminal',
        description: null,
        is_active: true,
        asset_class: 'TERMINAL',
        asset_type: 'MARINE',
        commodity_code: 'ULSD',
        location_code: null,
        operating_status: 'OPERATING',
      },
    ],
    [
      {
        code: 'HOUSTON',
        name: 'Houston',
        description: null,
        is_active: true,
        location_kind: 'POINT',
        location_type: 'HUB',
        latitude: 29.7604,
        longitude: -95.3698,
      },
    ],
  )

  const mappedRecord = summary.mappedRecords[0]
  const unmappedRecord = summary.unmappedRecords[0]

  assert.equal(formatAssetMapLocation(mappedRecord), 'HOUSTON · Houston')
  assert.equal(formatAssetMapSource(mappedRecord), 'Asset coordinates')
  assert.match(formatAssetMapPlacement(mappedRecord), /30\.0100/)
  assert.equal(formatAssetMapPlacement(unmappedRecord), 'Asset is not linked to a reference location')
})

test('asset map feature collections flatten asset geometry for rendering', () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: 'PIPE_01',
        name: 'Gulf Transmission',
        description: null,
        is_active: true,
        asset_class: 'PIPELINE',
        asset_type: 'TRANSMISSION',
        commodity_code: 'HENRY_HUB',
        location_code: 'HOUSTON',
        geometry_geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-95.3698, 29.7604],
                  [-95.1, 29.9],
                ],
              },
              properties: {
                leg: 'north',
              },
            },
          ],
        },
        operating_status: 'OPERATING',
      },
    ],
    [],
  )

  const featureCollection = buildAssetMapFeatureCollection(summary.mappedRecords)
  assert.equal(featureCollection.features.length, 1)
  assert.equal(featureCollection.features[0]?.properties?.assetCode, 'PIPE_01')
  assert.equal(featureCollection.features[0]?.properties?.leg, 'north')
})

test('asset map ignores malformed geojson geometry and falls back to linked coordinates', () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: 'PIPE_02',
        name: 'South Line',
        description: null,
        is_active: true,
        asset_class: 'PIPELINE',
        asset_type: 'TRANSMISSION',
        commodity_code: 'HENRY_HUB',
        location_code: 'HOUSTON',
        geometry_geojson: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
          },
        },
        operating_status: 'OPERATING',
      },
    ],
    [
      {
        code: 'HOUSTON',
        name: 'Houston',
        description: null,
        is_active: true,
        location_kind: 'POINT',
        location_type: 'HUB',
        latitude: 29.7604,
        longitude: -95.3698,
      },
    ],
  )

  assert.equal(summary.mappedCount, 1)
  assert.equal(summary.assetGeometryCount, 0)
  assert.equal(summary.linkedLocationCount, 1)
  assert.equal(summary.mappedRecords[0]?.placementStatus, 'linked_location')
  assert.equal(summary.mappedRecords[0]?.geometryFeatures.length, 0)
})

test('spatial feature map collections flatten shared overlays for rendering', () => {
  const featureCollection = buildSpatialFeatureMapFeatureCollection([
    {
      code: 'GULF_REGION',
      name: 'Gulf Region',
      description: null,
      is_active: true,
      feature_kind: 'REGION',
      geometry_type: 'AREA',
      entity_type: 'LOCATION',
      entity_code: 'GULF_COAST',
      label_latitude: 29.8,
      label_longitude: -95.2,
      is_primary: true,
      geometry_geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-95.6, 29.6],
                  [-94.7, 29.6],
                  [-94.7, 30.2],
                  [-95.6, 30.2],
                  [-95.6, 29.6],
                ],
              ],
            },
            properties: {
              region: 'gulf',
            },
          },
        ],
      },
    },
  ])

  assert.equal(featureCollection.features.length, 1)
  assert.equal(featureCollection.features[0]?.properties?.featureCode, 'GULF_REGION')
  assert.equal(featureCollection.features[0]?.properties?.featureKind, 'REGION')
  assert.equal(featureCollection.features[0]?.properties?.entityType, 'LOCATION')
  assert.equal(featureCollection.features[0]?.properties?.entityCode, 'GULF_COAST')
  assert.equal(featureCollection.features[0]?.properties?.region, 'gulf')
})
