import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { REFERENCE_TAB_ORDER } from '../src/workspaces/reference-data/referenceDataTabShared'
import { REFERENCE_TAB_DEFINITIONS } from '../src/workspaces/reference-data/referenceDataTabs'

function buildControllerStub() {
  const locations = [
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
  ]

  return {
    filteredAssets: [
      {
        code: 'PIPE_01',
        name: 'Gulf Transmission',
        description: 'Primary prompt gas pipe',
        is_active: true,
        created_at: '2026-04-01T00:00:00Z',
        created_by: 'ops',
        updated_at: '2026-04-24T00:00:00Z',
        updated_by: 'ops',
        version: 1,
        asset_class: 'PIPELINE',
        asset_type: 'TRANSMISSION',
        asset_reality: 'REAL',
        commodity_code: 'HENRY_HUB',
        location_code: 'HOUSTON',
        capacity_value: 125000,
        capacity_unit_code: 'MMBTU',
        operator_name: 'Grid Ops',
        operating_status: 'OPERATING',
      },
    ],
    locations,
    selectedAssetCode: 'PIPE_01',
    startEditAsset: () => undefined,
    savingReference: false,
    selectedAsset: {
      code: 'PIPE_01',
      name: 'Gulf Transmission',
      description: 'Primary prompt gas pipe',
      is_active: true,
      created_at: '2026-04-01T00:00:00Z',
      created_by: 'ops',
      updated_at: '2026-04-24T00:00:00Z',
      updated_by: 'ops',
      version: 1,
      asset_class: 'PIPELINE',
      asset_type: 'TRANSMISSION',
      asset_reality: 'REAL',
      commodity_code: 'HENRY_HUB',
      location_code: 'HOUSTON',
      capacity_value: 125000,
      capacity_unit_code: 'MMBTU',
      operator_name: 'Grid Ops',
      operating_status: 'OPERATING',
    },
    assetFormMode: 'edit' as const,
    assetForm: {
      code: 'PIPE_01',
      name: 'Gulf Transmission',
      asset_class: 'PIPELINE',
      asset_type: 'TRANSMISSION',
      asset_reality: 'REAL',
      commodity_code: 'HENRY_HUB',
      location_code: 'HOUSTON',
      capacity_value: '125000',
      capacity_unit_code: '',
      operator_name: 'Grid Ops',
      operating_status: 'OPERATING',
      description: 'Primary prompt gas pipe',
    },
    setAssetForm: () => undefined,
    assetStandards: {
      default_asset_class: 'PIPELINE',
      default_asset_type_by_class: { PIPELINE: 'TRANSMISSION' },
      asset_classes: ['PIPELINE', 'STORAGE'],
      asset_types_by_class: {
        PIPELINE: ['TRANSMISSION', 'GATHERING'],
        STORAGE: ['TANK_FARM'],
      },
      default_asset_reality: 'REAL',
      asset_realities: ['REAL', 'SIMULATED'],
      default_operating_status: 'OPERATING',
      operating_statuses: ['OPERATING', 'MAINTENANCE'],
    },
    activeCommodities: [
      { code: 'HENRY_HUB', name: 'Henry Hub', description: null, is_active: true },
    ],
    activeLocations: locations,
    activeUnits: [
      { code: 'MMBTU', name: 'MMBTU', description: null, is_active: true },
    ],
    startCreateAsset: () => undefined,
    handleSaveAsset: () => undefined,
    handleToggleAsset: () => undefined,
    assetFieldErrors: {
      capacity: 'Capacity value and unit must be provided together.',
      capacity_unit_code: 'Capacity value and unit must be provided together.',
    },
    assetFormDirty: true,
  }
}

test('reference data tab registry includes the assets tab in the shared order', () => {
  assert.equal(REFERENCE_TAB_ORDER.includes('assets'), true)
  assert.equal(REFERENCE_TAB_DEFINITIONS.assets.label, 'Assets')
  assert.equal(REFERENCE_TAB_DEFINITIONS.assets.editorTitle, 'Asset Editor')
})

test('assets tab definition renders directory and editor content through the shared registry', () => {
  const controller = buildControllerStub()
  const definition = REFERENCE_TAB_DEFINITIONS.assets

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

  assert.match(directoryMarkup, /Assets/)
  assert.match(directoryMarkup, /Asset Footprint/)
  assert.match(directoryMarkup, /Gulf Transmission/)
  assert.match(directoryMarkup, /PIPELINE/)
  assert.match(directoryMarkup, /REAL/)
  assert.match(directoryMarkup, /125,000 MMBTU/)
  assert.match(directoryMarkup, /1 plotted/)
  assert.match(directoryMarkup, /0 awaiting coordinates/)

  assert.match(editorMarkup, /New Asset/)
  assert.match(editorMarkup, /Asset Status/)
  assert.match(editorMarkup, /Asset Reality/)
  assert.match(editorMarkup, /Operating Status/)
  assert.match(editorMarkup, /Capacity Unit/)
  assert.match(editorMarkup, /Capacity value and unit must be provided together\./)
  assert.match(editorMarkup, /Unsaved changes/)
  assert.match(editorMarkup, /2026-04-24T00:00:00Z/)
})
