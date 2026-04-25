import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  describeAppRouteHandoff,
  getAppRouteHandoffFilterValue,
  getAppRouteHandoffKey,
  getAppRouteHandoffTradeId,
  readAppRouteHandoff,
  viewAppliesAppRouteHandoffFilter,
  writeAppRouteHandoff,
} from '../src/shared/appRouteHandoff.ts'

test('route handoff query params round-trip through the url helpers', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(params, {
    source: 'events',
    tradeId: 'TRD-1001',
    focus: {
      type: 'trade',
      id: 'TRD-1001',
      label: 'TRD-1001',
    },
    tradeInspectorTab: 'amend',
    eventType: 'TradeAmended',
    label: null,
    rationale: null,
    filter: null,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  })

  assert.equal(params.toString(), 'handoff=events&focusTrade=TRD-1001&tradeTab=amend&eventType=TradeAmended')
  assert.deepEqual(readAppRouteHandoff(params), {
    source: 'events',
    tradeId: 'TRD-1001',
    focus: {
      type: 'trade',
      id: 'TRD-1001',
      label: null,
    },
    tradeInspectorTab: 'amend',
    eventType: 'TradeAmended',
    label: null,
    rationale: null,
    filter: null,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  })
  assert.equal(getAppRouteHandoffKey(readAppRouteHandoff(params)), 'events:trade:TRD-1001:amend:TradeAmended::')
})

test('workspace handoff copy explains the preserved activity context', () => {
  assert.deepEqual(
    describeAppRouteHandoff(
      {
        source: 'events',
        tradeId: 'TRD-1001',
        focus: {
          type: 'trade',
          id: 'TRD-1001',
          label: null,
        },
        tradeInspectorTab: 'amend',
        eventType: 'TradeAmended',
        label: null,
        rationale: null,
        filter: null,
        sourceRunId: null,
        sourceConversationId: null,
        sourceActionRequestId: null,
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
        focus: {
          type: 'trade',
          id: 'TRD-1001',
          label: null,
        },
        tradeInspectorTab: 'amend',
        eventType: 'TradeAmended',
        label: null,
        rationale: null,
        filter: null,
        sourceRunId: null,
        sourceConversationId: null,
        sourceActionRequestId: null,
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

test('assistant route handoffs round-trip focused workspace context', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(params, {
    source: 'assistant',
    tradeId: 'TRD-2002',
    focus: {
      type: 'workflow_item',
      id: 'WF-900',
      label: 'Late confirmation',
    },
    tradeInspectorTab: null,
    eventType: null,
    label: 'Open Work Queue',
    rationale: 'The assistant found a late confirmation item that needs owner review.',
    filter: 'WF-900',
    sourceRunId: 77,
    sourceConversationId: 12,
    sourceActionRequestId: null,
  })

  assert.equal(
    params.toString(),
    'handoff=assistant&focusType=workflow_item&focusId=WF-900&focusLabel=Late+confirmation&focusTrade=TRD-2002&handoffLabel=Open+Work+Queue&handoffReason=The+assistant+found+a+late+confirmation+item+that+needs+owner+review.&focusFilter=WF-900&assistantRun=77&assistantConversation=12',
  )
  const handoff = readAppRouteHandoff(params)
  assert.deepEqual(handoff, {
    source: 'assistant',
    tradeId: 'TRD-2002',
    focus: {
      type: 'workflow_item',
      id: 'WF-900',
      label: 'Late confirmation',
    },
    tradeInspectorTab: null,
    eventType: null,
    label: 'Open Work Queue',
    rationale: 'The assistant found a late confirmation item that needs owner review.',
    filter: 'WF-900',
    sourceRunId: 77,
    sourceConversationId: 12,
    sourceActionRequestId: null,
  })
  assert.equal(getAppRouteHandoffFilterValue(handoff), 'WF-900')
  assert.equal(getAppRouteHandoffTradeId(handoff), null)
  assert.deepEqual(describeAppRouteHandoff(handoff, 'operations'), {
    title: 'Open Work Queue',
    detail: 'The assistant found a late confirmation item that needs owner review.',
  })
})

test('route handoff filters apply to queue-style workspaces only', () => {
  assert.equal(viewAppliesAppRouteHandoffFilter('operations'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('settlement'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('shipments'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('scheduling'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('trades'), false)
})
