import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildRailRouteWorkspaceHandoff,
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

test('terminal route handoffs preserve market-instrument focus', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(params, {
    source: 'terminal',
    tradeId: 'price_index:HH_IFERC',
    focus: {
      type: 'market_instrument',
      id: 'price_index:HH_IFERC',
      label: 'Henry Hub IFERC',
    },
    tradeInspectorTab: null,
    eventType: null,
    label: 'Open Henry Hub IFERC brief',
    rationale: null,
    filter: 'HH_IFERC',
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  })

  assert.equal(
    params.toString(),
    'handoff=terminal&focusType=market_instrument&focusId=price_index%3AHH_IFERC&focusLabel=Henry+Hub+IFERC&handoffLabel=Open+Henry+Hub+IFERC+brief&focusFilter=HH_IFERC',
  )
  const handoff = readAppRouteHandoff(params)
  assert.equal(getAppRouteHandoffTradeId(handoff), null)
  assert.deepEqual(describeAppRouteHandoff(handoff, 'dashboard'), {
    title: 'Open Henry Hub IFERC brief',
    detail:
      'Terminal search opened with market instrument Henry Hub IFERC in focus. Clear the focus when you are ready to widen back to the full workspace.',
  })
})

test('map route handoffs preserve rail-route focus for the deliveries board', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(
    params,
    buildRailRouteWorkspaceHandoff({
      source: 'map',
      railRouteCode: 'BNSF_WAHA_TO_HSC',
      railRouteLabel: 'BNSF Waha to Houston Ship Channel',
      targetView: 'shipments',
    }),
  )

  assert.equal(
    params.toString(),
    'handoff=map&focusType=reference_record&focusId=BNSF_WAHA_TO_HSC&focusLabel=BNSF+Waha+to+Houston+Ship+Channel&handoffLabel=Open+deliveries+for+BNSF_WAHA_TO_HSC&handoffReason=This+workspace+started+focused+on+the+selected+rail+route+so+you+can+review+the+matching+deliveries+before+widening+back+to+the+full+board.&focusFilter=BNSF_WAHA_TO_HSC',
  )

  const handoff = readAppRouteHandoff(params)
  assert.deepEqual(handoff, {
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
  })
  assert.equal(getAppRouteHandoffFilterValue(handoff), 'BNSF_WAHA_TO_HSC')
  assert.equal(getAppRouteHandoffTradeId(handoff), null)
  assert.deepEqual(describeAppRouteHandoff(handoff, 'shipments'), {
    title: 'Open deliveries for BNSF_WAHA_TO_HSC',
    detail:
      'This workspace started focused on the selected rail route so you can review the matching deliveries before widening back to the full board.',
  })
})

test('reference route handoffs preserve rail-route focus for the scheduling board', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(
    params,
    buildRailRouteWorkspaceHandoff({
      source: 'reference',
      railRouteCode: 'BNSF_WAHA_TO_HSC',
      railRouteLabel: 'BNSF Waha to Houston Ship Channel',
      targetView: 'scheduling',
    }),
  )

  assert.equal(
    params.toString(),
    'handoff=reference&focusType=reference_record&focusId=BNSF_WAHA_TO_HSC&focusLabel=BNSF+Waha+to+Houston+Ship+Channel&handoffLabel=Open+scheduling+for+BNSF_WAHA_TO_HSC&handoffReason=This+workspace+started+focused+on+the+selected+reference-data+rail+route+so+you+can+review+the+matching+scheduling+rows+before+widening+back+to+the+full+board.&focusFilter=BNSF_WAHA_TO_HSC',
  )

  const handoff = readAppRouteHandoff(params)
  assert.deepEqual(handoff, {
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
  })
  assert.equal(getAppRouteHandoffFilterValue(handoff), 'BNSF_WAHA_TO_HSC')
  assert.equal(getAppRouteHandoffTradeId(handoff), null)
  assert.deepEqual(describeAppRouteHandoff(handoff, 'scheduling'), {
    title: 'Open scheduling for BNSF_WAHA_TO_HSC',
    detail:
      'This workspace started focused on the selected reference-data rail route so you can review the matching scheduling rows before widening back to the full board.',
  })
})

test('terminal route handoffs preserve focused report context', () => {
  const params = new URLSearchParams()
  writeAppRouteHandoff(params, {
    source: 'terminal',
    tradeId: 'reports-credit',
    focus: {
      type: 'report',
      id: 'reports-credit',
      label: 'Counterparty Credit Report',
    },
    tradeInspectorTab: null,
    eventType: null,
    label: 'Open Counterparty Credit Report',
    rationale:
      'Terminal search opened the Reports workspace on this module so you can review the matching analysis without hunting through the full report grid.',
    filter: 'reports-credit',
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  })

  assert.equal(
    params.toString(),
    'handoff=terminal&focusType=report&focusId=reports-credit&focusLabel=Counterparty+Credit+Report&handoffLabel=Open+Counterparty+Credit+Report&handoffReason=Terminal+search+opened+the+Reports+workspace+on+this+module+so+you+can+review+the+matching+analysis+without+hunting+through+the+full+report+grid.&focusFilter=reports-credit',
  )

  const handoff = readAppRouteHandoff(params)
  assert.deepEqual(handoff, {
    source: 'terminal',
    tradeId: 'reports-credit',
    focus: {
      type: 'report',
      id: 'reports-credit',
      label: 'Counterparty Credit Report',
    },
    tradeInspectorTab: null,
    eventType: null,
    label: 'Open Counterparty Credit Report',
    rationale:
      'Terminal search opened the Reports workspace on this module so you can review the matching analysis without hunting through the full report grid.',
    filter: 'reports-credit',
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  })
  assert.equal(getAppRouteHandoffFilterValue(handoff), 'reports-credit')
  assert.equal(getAppRouteHandoffTradeId(handoff), null)
  assert.deepEqual(describeAppRouteHandoff(handoff, 'reports'), {
    title: 'Open Counterparty Credit Report',
    detail:
      'Terminal search opened the Reports workspace on this module so you can review the matching analysis without hunting through the full report grid.',
  })
})

test('route handoff filters apply to queue-style workspaces only', () => {
  assert.equal(viewAppliesAppRouteHandoffFilter('operations'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('settlement'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('shipments'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('scheduling'), true)
  assert.equal(viewAppliesAppRouteHandoffFilter('trades'), false)
})
