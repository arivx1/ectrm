import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildEventTriageRecommendation,
  describeEventWorkspaceHandoff,
  recommendedWorkspaceForEvent,
  resolveTradeInspectorTabForEvent,
} from '../src/workspaces/events/eventHelpers.ts'

test('trade creation events route back into trade capture', () => {
  assert.equal(
    recommendedWorkspaceForEvent({
      event_type: 'TradeCreated',
      payload: {
        trade_id: 'TRD-100',
        book: 'GULF_GAS',
      },
    }),
    'trades',
  )
})

test('post-trade workflow payload changes route into operations', () => {
  assert.equal(
    recommendedWorkspaceForEvent({
      event_type: 'TradeAmended',
      payload: {
        confirmation_status: 'SENT',
      },
    }),
    'operations',
  )

  assert.deepEqual(
    buildEventTriageRecommendation({
      event_type: 'TradeWorkflowItemUpdated',
      payload: {
        workflow_type: 'CONFIRMATION',
      },
    }),
    {
      workspace: 'operations',
      badge: 'Queue changed',
      title: 'Work the queue row next',
      detail:
        'This event changed queue ownership, timing, or workflow posture. Open Work Queue and clear the matching row before widening back to the full book.',
      summary: 'Queue follow-through changed Workflow CONFIRMATION.',
      highlights: ['Workflow CONFIRMATION'],
      severityLabel: 'Queue follow-up',
      severityTone: 'in-progress',
    },
  )
})

test('settlement payload changes route into settlement', () => {
  assert.equal(
    recommendedWorkspaceForEvent({
      event_type: 'TradeAmended',
      payload: {
        payment_status: 'DUE',
      },
    }),
    'settlement',
  )
})

test('option lifecycle events route into operations', () => {
  assert.equal(
    recommendedWorkspaceForEvent({
      event_type: 'OptionAssigned',
      payload: {},
    }),
    'operations',
  )
})

test('triage recommendations surface payload-aware summaries and handoff copy', () => {
  assert.deepEqual(
    buildEventTriageRecommendation({
      event_type: 'TradeInvoiceUpdated',
      payload: {
        invoice_status: 'ISSUED',
        payment_status: 'PENDING',
        settlement_status: 'PENDING',
      },
    }),
    {
      workspace: 'settlement',
      badge: 'Invoice changed',
      title: 'Move into invoice follow-through next',
      detail:
        'This event changed invoice posture. Open Settlement and review the invoice ledger for the same trade before widening back out.',
      summary: 'Invoice follow-through changed Invoice ISSUED, Payment PENDING, and Settlement PENDING.',
      highlights: ['Invoice ISSUED', 'Payment PENDING', 'Settlement PENDING'],
      severityLabel: 'Cash follow-up',
      severityTone: 'in-progress',
    },
  )

  assert.deepEqual(
    describeEventWorkspaceHandoff('operations', 'TRD-1001', 'TradeAmended'),
    {
      title: 'Start with amendment follow-through for TRD-1001',
      detail:
        'Activity Feed routed you here because the amendment touched post-trade workflow state. Review the confirmation ledger and operational queue rows for this trade first.',
    },
  )
})

test('trade-linked events reopen trade capture on the right inspector tab', () => {
  assert.equal(resolveTradeInspectorTabForEvent('TradeAmended'), 'amend')
  assert.equal(resolveTradeInspectorTabForEvent('TradeCancelled'), 'overview')
  assert.equal(resolveTradeInspectorTabForEvent('TradeCreated'), 'overview')
  assert.equal(resolveTradeInspectorTabForEvent(null), 'overview')
})
