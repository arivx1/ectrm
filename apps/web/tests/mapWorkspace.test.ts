import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { MapWorkspace } from '../src/workspaces/map/MapWorkspace'

test('map workspace renders a dedicated asset map screen without requiring a selection', () => {
  const markup = renderToStaticMarkup(
    createElement(MapWorkspace, {
      assets: [
        {
          code: 'PIPE_01',
          name: 'Gulf Transmission',
          description: 'Primary prompt gas pipe',
          is_active: true,
          asset_class: 'PIPELINE',
          asset_type: 'TRANSMISSION',
          asset_reality: 'REAL',
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
          code: 'TERM_02',
          name: 'Unmapped Terminal',
          description: 'Awaiting field survey',
          is_active: true,
          asset_class: 'TERMINAL',
          asset_type: 'MARINE',
          asset_reality: 'REAL',
          commodity_code: 'POWER',
          location_code: null,
          latitude: null,
          longitude: null,
          geometry_geojson: null,
          operating_status: 'OPERATING',
        },
      ],
      locations: [
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
      spatialFeatures: [
        {
          code: 'GULF_REGION',
          name: 'Gulf Region',
          description: null,
          is_active: true,
          feature_kind: 'REGION',
          geometry_type: 'AREA',
          geometry_geojson: {
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
          entity_type: null,
          entity_code: null,
          label_latitude: null,
          label_longitude: null,
          is_primary: true,
        },
      ],
      globalFilter: '',
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
    }),
  )

  assert.match(markup, /Asset Footprint/)
  assert.match(markup, /Local Screen Filter/)
  assert.match(markup, /Map Asset Directory/)
  assert.match(markup, /No asset is selected\. The map is currently showing every map-ready asset in the current filter\./)
  assert.match(markup, /Only map-ready assets are included here\./)
  assert.match(markup, /Asset Class/)
  assert.match(markup, /Asset Type/)
  assert.match(markup, /Commodity/)
  assert.match(markup, /All classes/)
  assert.match(markup, /All types/)
  assert.match(markup, /All commodities/)
  assert.match(markup, /All map filters open/)
  assert.match(markup, /1 hidden/)
  assert.match(markup, /Open Reference Data/)
  assert.match(markup, /class="stack map-workspace"/)
})

test('map workspace keeps the live map canvas available even when no assets are plottable', () => {
  const markup = renderToStaticMarkup(
    createElement(MapWorkspace, {
      assets: [
        {
          code: 'TERM_02',
          name: 'Unmapped Terminal',
          description: 'Awaiting field survey',
          is_active: true,
          asset_class: 'TERMINAL',
          asset_type: 'MARINE',
          asset_reality: 'REAL',
          commodity_code: 'HENRY_HUB',
          location_code: null,
          latitude: null,
          longitude: null,
          geometry_geojson: null,
          operating_status: 'OPERATING',
        },
      ],
      locations: [],
      spatialFeatures: [],
      globalFilter: '',
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
    }),
  )

  assert.match(markup, /class="asset-map-canvas-shell"/)
  assert.match(markup, /No filtered assets are map-ready yet\./)
  assert.match(markup, /The base map is still available for zoom, pan, and rotate\./)
  assert.match(markup, /1 hidden/)
  assert.doesNotMatch(markup, /class="asset-map-empty"/)
})
