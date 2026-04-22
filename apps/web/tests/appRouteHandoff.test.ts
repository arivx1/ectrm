import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  describeAppRouteHandoff,
  getAppRouteHandoffKey,
  readAppRouteHandoff,
  writeAppRouteHandoff,
} from '../src/shared/appRouteHandoff.ts'

test('route handoff query params round-trip through the url helpers', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(params, {
    source: 'events',
    tradeId: 'TRD-1001',
    tradeInspectorTab: 'amend',
    eventType: 'TradeAmended',
  })

  assert.equal(params.toString(), 'handoff=events&focusTrade=TRD-1001&tradeTab=amend&eventType=TradeAmended')
  assert.deepEqual(readAppRouteHandoff(params), {
    source: 'events',
    tradeId: 'TRD-1001',
    tradeInspectorTab: 'amend',
    eventType: 'TradeAmended',
  })
  assert.equal(getAppRouteHandoffKey(readAppRouteHandoff(params)), 'events:TRD-1001:amend:TradeAmended')
})

test('workspace handoff copy explains the preserved activity context', () => {
  assert.deepEqual(
    describeAppRouteHandoff(
      {
        source: 'events',
        tradeId: 'TRD-1001',
        tradeInspectorTab: 'amend',
        eventType: 'TradeAmended',
      },
      'operations',
    ),
    {
      title: 'Opened from Activity Feed for TRD-1001',
      detail:
        'This workspace started focused on that trade so you can clear the matching queue items before widening back to the full book.',
    },
  )

  assert.deepEqual(
    describeAppRouteHandoff(
      {
        source: 'events',
        tradeId: 'TRD-1001',
        tradeInspectorTab: 'amend',
        eventType: 'TradeAmended',
      },
      'trades',
    ),
    {
      title: 'Opened from Activity Feed for TRD-1001',
      detail:
        'Trade Capture opened on the amend panel so you can review the latest economics and workflow changes in context.',
    },
  )
})
