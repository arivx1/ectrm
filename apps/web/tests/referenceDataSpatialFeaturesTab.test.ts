import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { REFERENCE_TAB_ORDER } from '../src/workspaces/reference-data/referenceDataTabShared'
import { REFERENCE_TAB_DEFINITIONS } from '../src/workspaces/reference-data/referenceDataTabs'

function buildControllerStub() {
  return {
    filteredSpatialFeatures: [
      {
        code: 'GULF_ROUTE',
        name: 'Gulf Route',
        description: 'Shared route overlay',
        is_active: true,
        created_at: '2026-04-01T00:00:00Z',
        created_by: 'ops',
        updated_at: '2026-04-24T00:00:00Z',
        updated_by: 'ops',
        version: 1,
        feature_kind: 'ROUTE',
        geometry_type: 'LINE',
        geometry_geojson: {
          type: 'LineString',
          coordinates: [
            [-95.3698, 29.7604],
            [-95.1, 29.9],
          ],
        },
        entity_type: 'ASSET',
        entity_code: 'PIPE_01',
        label_latitude: 29.8,
        label_longitude: -95.2,
        is_primary: true,
      },
    ],
    selectedSpatialFeatureCode: 'GULF_ROUTE',
    startEditSpatialFeature: () => undefined,
    savingReference: false,
    selectedSpatialFeature: {
      code: 'GULF_ROUTE',
      name: 'Gulf Route',
      description: 'Shared route overlay',
      is_active: true,
      created_at: '2026-04-01T00:00:00Z',
      created_by: 'ops',
      updated_at: '2026-04-24T00:00:00Z',
      updated_by: 'ops',
      version: 1,
      feature_kind: 'ROUTE',
      geometry_type: 'LINE',
      geometry_geojson: {
        type: 'LineString',
        coordinates: [
          [-95.3698, 29.7604],
          [-95.1, 29.9],
        ],
      },
      entity_type: 'ASSET',
      entity_code: 'PIPE_01',
      label_latitude: 29.8,
      label_longitude: -95.2,
      is_primary: true,
    },
    spatialFeatureFormMode: 'edit' as const,
    spatialFeatureForm: {
      code: 'GULF_ROUTE',
      name: 'Gulf Route',
      feature_kind: 'ROUTE',
      entity_type: 'ASSET',
      entity_code: 'PIPE_01',
      label_latitude: '29.8',
      label_longitude: '-95.2',
      is_primary: true,
      geometry_geojson: '{\n  "type": "LineString",\n  "coordinates": [\n    [\n      -95.3698,\n      29.7604\n    ],\n    [\n      -95.1,\n      29.9\n    ]\n  ]\n}',
      description: 'Shared route overlay',
    },
    setSpatialFeatureForm: () => undefined,
    spatialFeatureStandards: {
      default_feature_kind: 'REGION',
      feature_kinds: ['PIPELINE', 'REGION', 'ROUTE'],
      geometry_types: ['AREA', 'LINE', 'POINT'],
      entity_types: ['ASSET', 'LOCATION'],
    },
    activeAssets: [{ code: 'PIPE_01', name: 'Pipe 01', is_active: true }],
    activeLocations: [{ code: 'HOUSTON', name: 'Houston', is_active: true }],
    startCreateSpatialFeature: () => undefined,
    handleSaveSpatialFeature: () => undefined,
    handleToggleSpatialFeature: () => undefined,
    spatialFeatureFieldErrors: {
      entity_link: 'Entity type and linked code must be provided together.',
      geometry_geojson: 'Geometry GeoJSON is required.',
    },
    spatialFeatureFormDirty: true,
  }
}

test('reference data tab registry includes the spatial features tab in the shared order', () => {
  assert.equal(REFERENCE_TAB_ORDER.includes('spatial-features'), true)
  assert.equal(REFERENCE_TAB_DEFINITIONS['spatial-features'].label, 'Spatial Features')
  assert.equal(REFERENCE_TAB_DEFINITIONS['spatial-features'].editorTitle, 'Spatial Feature Editor')
})

test('spatial features tab definition renders directory and editor content through the shared registry', () => {
  const controller = buildControllerStub()
  const definition = REFERENCE_TAB_DEFINITIONS['spatial-features']

  const directoryMarkup = renderToStaticMarkup(
    createElement(definition.Directory, {
      controller: controller as never,
      formatCommodityClass: (value: string) => value,
      formatDate: (value: string | null | undefined) => value ?? 'n/a',
    }),
  )

  const editorMarkup = renderToStaticMarkup(
    createElement(definition.Editor, {
      controller: controller as never,
      formatCommodityClass: (value: string) => value,
      formatDate: (value: string | null | undefined) => value ?? 'n/a',
    }),
  )

  assert.match(directoryMarkup, /Spatial Features/)
  assert.match(directoryMarkup, /Gulf Route/)
  assert.match(directoryMarkup, /ROUTE/)
  assert.match(directoryMarkup, /LINE/)
  assert.match(directoryMarkup, /ASSET · PIPE_01/)

  assert.match(editorMarkup, /New Spatial Feature/)
  assert.match(editorMarkup, /Spatial Status/)
  assert.match(editorMarkup, /Feature Kind/)
  assert.match(editorMarkup, /Entity Type/)
  assert.match(editorMarkup, /Geometry GeoJSON/)
  assert.match(editorMarkup, /Primary overlay/)
  assert.match(editorMarkup, /Unsaved changes/)
  assert.match(editorMarkup, /2026-04-24T00:00:00Z/)
})
