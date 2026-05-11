import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { WorkspaceHandoffFocusBanner } from '../src/shared/ui/WorkspaceHandoffFocusBanner'

test('workspace handoff focus banner exposes source, focus, filter, and reset action', () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceHandoffFocusBanner, {
      currentView: 'operations',
      handoff: {
        source: 'assistant',
        tradeId: 'TRD-1001',
        focus: {
          type: 'trade',
          id: 'TRD-1001',
          label: 'TRD-1001',
        },
        tradeInspectorTab: 'events',
        eventType: null,
        label: 'Open Work Queue',
        rationale: 'Review the matching queue item before changing trade state.',
        filter: 'TRD-1001',
        sourceRunId: 8801,
        sourceConversationId: 902,
        sourceActionRequestId: null,
      },
      onClear: () => {},
      clearLabel: 'Show Full Queue',
    }),
  )

  assert.match(markup, /Open Work Queue/)
  assert.match(markup, /Assistant run #8801/)
  assert.match(markup, /Trade: TRD-1001/)
  assert.match(markup, /Filter: TRD-1001/)
  assert.match(markup, /Inspector: events/)
  assert.match(markup, /Show Full Queue/)
})

test('workspace handoff focus banner labels map-sourced route focus clearly', () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceHandoffFocusBanner, {
      currentView: 'shipments',
      handoff: {
        source: 'map',
        tradeId: 'BNSF_WAHA_TO_HSC',
        focus: {
          type: 'reference_record',
          id: 'BNSF_WAHA_TO_HSC',
          label: 'BNSF Waha to Houston Ship Channel',
        },
        tradeInspectorTab: null,
        eventType: null,
        label: 'Open deliveries for BNSF_WAHA_TO_HSC',
        rationale:
          'This workspace started focused on the selected rail route so you can review the matching deliveries before widening back to the full board.',
        filter: 'BNSF_WAHA_TO_HSC',
        sourceRunId: null,
        sourceConversationId: null,
        sourceActionRequestId: null,
      },
      onClear: () => {},
      clearLabel: 'Show Full Board',
    }),
  )

  assert.match(markup, /Open deliveries for BNSF_WAHA_TO_HSC/)
  assert.match(markup, /Map/)
  assert.match(markup, /Reference record: BNSF Waha to Houston Ship Channel/)
  assert.match(markup, /Filter: BNSF_WAHA_TO_HSC/)
  assert.match(markup, /Show Full Board/)
})

test('workspace handoff focus banner labels reference-sourced route focus clearly', () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceHandoffFocusBanner, {
      currentView: 'scheduling',
      handoff: {
        source: 'reference',
        tradeId: 'BNSF_WAHA_TO_HSC',
        focus: {
          type: 'reference_record',
          id: 'BNSF_WAHA_TO_HSC',
          label: 'BNSF Waha to Houston Ship Channel',
        },
        tradeInspectorTab: null,
        eventType: null,
        label: 'Open scheduling for BNSF_WAHA_TO_HSC',
        rationale:
          'This workspace started focused on the selected reference-data rail route so you can review the matching scheduling rows before widening back to the full board.',
        filter: 'BNSF_WAHA_TO_HSC',
        sourceRunId: null,
        sourceConversationId: null,
        sourceActionRequestId: null,
      },
      onClear: () => {},
      clearLabel: 'Show Full Board',
    }),
  )

  assert.match(markup, /Open scheduling for BNSF_WAHA_TO_HSC/)
  assert.match(markup, /Reference Data/)
  assert.match(markup, /Reference record: BNSF Waha to Houston Ship Channel/)
  assert.match(markup, /Filter: BNSF_WAHA_TO_HSC/)
  assert.match(markup, /Show Full Board/)
})
