import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAmendDraft } from '../src/features/trades/amendDraft.ts'

test('buildAmendDraft uses the latest event payload that actually contains swap legs', () => {
  const draft = buildAmendDraft(
    {
      trade_id: 'T-SWAP-1',
      external_trade_id: null,
      source_system: null,
      created_at: '2026-03-11T12:00:00Z',
      updated_at: '2026-03-11T12:05:00Z',
      execution_timestamp: null,
      trade_nature: 'PHYSICAL',
      trade_structure: 'SWAP',
      trade_side: null,
      book: 'CRUDE_PHYS',
      portfolio: null,
      counterparty: null,
      commodity_class: 'CRUDE_OIL',
      commodity: 'WTI',
      pricing_type: 'FIXED',
      pricing_status: 'PENDING',
      price_index_code: null,
      price: 80,
      volume: 1000,
      settlement_status: 'PENDING',
      trader_user: null,
      status: 'ACTIVE',
      last_event_id: 'evt-2',
    },
    [
      {
        event_id: 'evt-2',
        aggregate_type: 'trade',
        aggregate_id: 'T-SWAP-1',
        event_type: 'TradeAmended',
        occurred_at: '2026-03-11T12:05:00Z',
        recorded_at: '2026-03-11T12:05:00Z',
        actor_id: 'ops_admin',
        correlation_id: null,
        causation_id: null,
        schema_version: 2,
        payload: { pricing_status: 'PRICED' },
      },
      {
        event_id: 'evt-1',
        aggregate_type: 'trade',
        aggregate_id: 'T-SWAP-1',
        event_type: 'TradeCreated',
        occurred_at: '2026-03-11T12:00:00Z',
        recorded_at: '2026-03-11T12:00:00Z',
        actor_id: 'ops_admin',
        correlation_id: null,
        causation_id: null,
        schema_version: 1,
        payload: {
          legs: [
            {
              leg_no: 1,
              side: 'BUY',
              commodity_class: 'CRUDE_OIL',
              commodity: 'WTI',
              volume: 20,
            },
            {
              leg_no: 2,
              side: 'SELL',
              commodity_class: 'CRUDE_OIL',
              commodity: 'BRENT',
              volume: 30,
            },
          ],
        },
      },
    ],
    [{ code: 'CRUDE_PHYS', name: 'Crude Physical', is_active: true }],
    ['CRUDE_OIL'],
  )

  assert.deepEqual(draft.legs, [
    {
      leg_no: 1,
      side: 'BUY',
      commodity_class: 'CRUDE_OIL',
      commodity: 'WTI',
      volume: '20',
    },
    {
      leg_no: 2,
      side: 'SELL',
      commodity_class: 'CRUDE_OIL',
      commodity: 'BRENT',
      volume: '30',
    },
  ])
})

test('buildAmendDraft does not fabricate swap legs when history has none', () => {
  const draft = buildAmendDraft(
    {
      trade_id: 'T-SWAP-2',
      external_trade_id: null,
      source_system: null,
      created_at: '2026-03-11T12:00:00Z',
      updated_at: '2026-03-11T12:05:00Z',
      execution_timestamp: null,
      trade_nature: 'PHYSICAL',
      trade_structure: 'SWAP',
      trade_side: null,
      book: 'CRUDE_PHYS',
      portfolio: null,
      counterparty: null,
      commodity_class: 'CRUDE_OIL',
      commodity: 'WTI',
      pricing_type: 'FIXED',
      pricing_status: 'PENDING',
      price_index_code: null,
      price: 80,
      volume: 1000,
      settlement_status: 'PENDING',
      trader_user: null,
      status: 'ACTIVE',
      last_event_id: 'evt-3',
    },
    [
      {
        event_id: 'evt-3',
        aggregate_type: 'trade',
        aggregate_id: 'T-SWAP-2',
        event_type: 'TradeAmended',
        occurred_at: '2026-03-11T12:05:00Z',
        recorded_at: '2026-03-11T12:05:00Z',
        actor_id: 'ops_admin',
        correlation_id: null,
        causation_id: null,
        schema_version: 2,
        payload: { pricing_status: 'PRICED' },
      },
    ],
    [{ code: 'CRUDE_PHYS', name: 'Crude Physical', is_active: true }],
    ['CRUDE_OIL'],
  )

  assert.deepEqual(draft.legs, [])
})
