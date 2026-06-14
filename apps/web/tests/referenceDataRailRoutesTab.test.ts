import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { REFERENCE_TAB_ORDER } from '../src/workspaces/reference-data/referenceDataTabShared'
import { REFERENCE_TAB_DEFINITIONS } from '../src/workspaces/reference-data/referenceDataTabs'

function buildControllerStub() {
  const locations = [
    {
      code: 'WAHA',
      name: 'Waha',
      description: null,
      is_active: true,
      location_kind: 'POINT',
      location_type: 'HUB',
    },
    {
      code: 'HSC',
      name: 'Houston Ship Channel',
      description: null,
      is_active: true,
      location_kind: 'POINT',
      location_type: 'HUB',
    },
  ]
  const selectedRailRoute = {
    code: 'BNSF_WAHA_TO_HSC',
    name: 'BNSF Waha to Houston Ship Channel',
    description: 'Seeded rail corridor',
    is_active: true,
    created_at: '2026-05-08T00:00:00Z',
    created_by: 'ops',
    updated_at: '2026-05-09T12:00:00Z',
    updated_by: 'ops',
    version: 1,
    rail_line_code: 'BNSF_SOUTHERN_TRANSCON',
    origin_location_code: 'WAHA',
    destination_location_code: 'HSC',
    service_calendar_code: 'US_GAS_DAY',
    route_direction: 'FORWARD',
    schedule_timezone: 'America/Chicago',
    placement_cutoff_time_local: '15:00',
    release_cutoff_time_local: '11:00',
    placement_free_time_hours: 48,
    release_free_time_hours: 24,
  }

  return {
    locations,
    activeLocations: locations,
    filteredRailRoutes: [selectedRailRoute],
    selectedRailRouteCode: 'BNSF_WAHA_TO_HSC',
    startEditRailRoute: () => undefined,
    savingReference: false,
    selectedRailRoute,
    railRouteFormMode: 'edit' as const,
    railRouteForm: {
      code: 'BNSF_WAHA_TO_HSC',
      name: 'BNSF Waha to Houston Ship Channel',
      rail_line_code: 'BNSF_SOUTHERN_TRANSCON',
      origin_location_code: 'WAHA',
      destination_location_code: 'HSC',
      service_calendar_code: 'US_GAS_DAY',
      route_direction: 'FORWARD',
      schedule_timezone: 'America/Chicago',
      placement_cutoff_time_local: '15:00',
      release_cutoff_time_local: '11:00',
      placement_free_time_hours: '48',
      release_free_time_hours: '24',
      description: 'Seeded rail corridor',
    },
    setRailRouteForm: () => undefined,
    startCreateRailRoute: () => undefined,
    openRailRouteScheduling: () => undefined,
    handleSaveRailRoute: () => undefined,
    handleToggleRailRoute: () => undefined,
    railRouteFieldErrors: {
      placement_cutoff_time_local: 'Placement cutoff must use 24-hour HH:MM format.',
    },
    railRouteFormDirty: true,
  }
}

test('reference data tab registry includes rail routes in the shared order', () => {
  assert.equal(REFERENCE_TAB_ORDER.includes('rail-routes'), true)
  assert.equal(REFERENCE_TAB_DEFINITIONS['rail-routes'].label, 'Rail Routes')
  assert.equal(REFERENCE_TAB_DEFINITIONS['rail-routes'].editorTitle, 'Rail Route Editor')
})

test('rail routes tab definition renders directory and editor content through the shared registry', () => {
  const controller = buildControllerStub()
  const definition = REFERENCE_TAB_DEFINITIONS['rail-routes']

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

  assert.match(directoryMarkup, /Rail Routes/)
  assert.match(directoryMarkup, /BNSF Waha to Houston Ship Channel/)
  assert.match(directoryMarkup, /BNSF_SOUTHERN_TRANSCON/)
  assert.match(directoryMarkup, /WAHA · Waha/)
  assert.match(directoryMarkup, /HSC · Houston Ship Channel/)
  assert.match(directoryMarkup, /America\/Chicago/)

  assert.match(editorMarkup, /New Rail Route/)
  assert.match(editorMarkup, /Open Scheduling/)
  assert.match(editorMarkup, /Scheduling Context/)
  assert.match(editorMarkup, /Launch Scheduling from this route to reuse the same governed lane focus the map uses\./)
  assert.match(editorMarkup, /Route Direction/)
  assert.match(editorMarkup, /Placement Cutoff/)
  assert.match(editorMarkup, /Release Free Time \(Hours\)/)
  assert.match(editorMarkup, /Placement cutoff must use 24-hour HH:MM format\./)
  assert.match(editorMarkup, /Unsaved changes/)
  assert.match(editorMarkup, /2026-05-09T12:00:00Z/)
})
