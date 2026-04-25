import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  buildAssetMapSummary,
  formatAssetMapLocation,
  formatAssetMapPlacement,
} from '../src/features/reference-data/assetMap'

test('buildAssetMapSummary classifies mapped and unmapped assets from linked locations', () => {
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
    ],
  )

  assert.equal(summary.records.length, 3)
  assert.equal(summary.mappedCount, 1)
  assert.equal(summary.missingCoordinatesCount, 1)
  assert.equal(summary.missingLocationCount, 1)
  assert.equal(summary.inactiveCount, 1)
  assert.equal(summary.mappedRecords[0]?.asset.code, 'PIPE_01')
  assert.equal(summary.unmappedRecords.map((record) => record.asset.code).join(','), 'STORE_01,TERM_01')
})

test('asset map formatting explains linked locations and placement gaps', () => {
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
  assert.match(formatAssetMapPlacement(mappedRecord), /29\.7604/)
  assert.equal(formatAssetMapPlacement(unmappedRecord), 'Asset is not linked to a reference location')
})
