import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  findLatestCounterpartyExternalSnapshot,
  listRelatedTradesForDraft,
  sumRelatedPositionNetVolume,
  summarizePreTradeSourceQuality,
  type PositionedRow,
} from '../src/workspaces/pretrade/preTradeWorkspaceSupport'
import type { CounterpartyExternalCreditSnapshotRecord, PreTradeScenarioDraft, PreTradeRecommendationSourceSnapshotRecord, Trade } from '../src/shared/models'

const draft: PreTradeScenarioDraft = {
  book: 'GAS_PHYS',
  portfolio: 'PROMPT',
  counterparty: 'SHELL_TRADING',
  commodity_class: 'NATURAL_GAS',
  commodity: 'HENRY_HUB',
  trade_side: 'BUY',
  pricing_type: 'FLOATING',
  price_index_code: 'NG_HH_PROMPT',
  target_price: 2.8,
  target_volume: 25000,
  trade_currency_code: 'USD',
  unit_of_measure: 'MMBTU',
  price_unit_code: 'MMBTU',
  location_code: 'HENRY_HUB',
  delivery_start: '2026-05-01',
  delivery_end: '2026-05-31',
}

test('listRelatedTradesForDraft matches desk trades on book and commodity lane', () => {
  const trades: Trade[] = [
    {
      trade_id: 'TRD-1',
      originating_option_trade_id: null,
      external_trade_id: null,
      source_system: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      execution_timestamp: null,
      trade_date: null,
      effective_start_date: null,
      effective_end_date: null,
      quality_spec: null,
      unit_of_measure: 'MMBTU',
      trade_currency_code: 'USD',
      location_code: 'HENRY_HUB',
      delivery_start: null,
      delivery_end: null,
      price_unit_code: 'MMBTU',
      instrument_type: 'LINEAR',
      option_type: null,
      option_style: null,
      option_strike_price: null,
      option_expiration_date: null,
      trade_nature: 'PHYSICAL',
      trade_structure: 'SINGLE',
      trade_side: 'BUY',
      book: 'GAS_PHYS',
      portfolio: 'PROMPT',
      counterparty: 'SHELL_TRADING',
      commodity_class: 'NATURAL_GAS',
      commodity: 'HENRY_HUB',
      pricing_type: 'FLOATING',
      pricing_status: 'PRICED',
      confirmation_status: 'CONFIRMED',
      nomination_status: 'NOMINATED',
      allocation_status: 'ALLOCATED',
      actualization_status: 'ACTUALIZED',
      price_index_code: 'NG_HH_PROMPT',
      price: 2.76,
      volume: 10000,
      invoice_status: 'PENDING',
      payment_status: 'PENDING',
      settlement_status: 'OPEN',
      trader_user: 'trader.alpha',
      status: 'ACTIVE',
      last_event_id: 'evt-1',
    },
    {
      trade_id: 'TRD-2',
      originating_option_trade_id: null,
      external_trade_id: null,
      source_system: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      execution_timestamp: null,
      trade_date: null,
      effective_start_date: null,
      effective_end_date: null,
      quality_spec: null,
      unit_of_measure: 'MMBTU',
      trade_currency_code: 'USD',
      location_code: 'Waha',
      delivery_start: null,
      delivery_end: null,
      price_unit_code: 'MMBTU',
      instrument_type: 'LINEAR',
      option_type: null,
      option_style: null,
      option_strike_price: null,
      option_expiration_date: null,
      trade_nature: 'PHYSICAL',
      trade_structure: 'SINGLE',
      trade_side: 'SELL',
      book: 'GAS_PHYS',
      portfolio: 'PROMPT',
      counterparty: 'OTHER',
      commodity_class: 'NATURAL_GAS',
      commodity: 'WAHA',
      pricing_type: 'FLOATING',
      pricing_status: 'PRICED',
      confirmation_status: 'CONFIRMED',
      nomination_status: 'NOMINATED',
      allocation_status: 'ALLOCATED',
      actualization_status: 'ACTUALIZED',
      price_index_code: 'NG_WAHA_PROMPT',
      price: 2.33,
      volume: 12000,
      invoice_status: 'PENDING',
      payment_status: 'PENDING',
      settlement_status: 'OPEN',
      trader_user: 'trader.beta',
      status: 'ACTIVE',
      last_event_id: 'evt-2',
    },
  ]

  assert.deepEqual(
    listRelatedTradesForDraft(draft, trades).map((trade) => trade.trade_id),
    ['TRD-1'],
  )
})

test('sumRelatedPositionNetVolume returns the net position for the matching commodity lane', () => {
  const positions: PositionedRow[] = [
    {
      commodity_class: 'NATURAL_GAS',
      commodity: 'HENRY_HUB',
      net_volume: 18000,
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      commodity_class: 'POWER',
      commodity: 'MIDC_PEAK',
      net_volume: -500,
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      commodity_class: undefined,
      commodity: 'HENRY_HUB',
      net_volume: -3000,
      updated_at: '2026-04-01T00:00:00Z',
    },
  ]

  assert.equal(sumRelatedPositionNetVolume(draft, positions), 15000)
  assert.equal(
    sumRelatedPositionNetVolume(
      { ...draft, commodity: 'MIDC_PEAK', commodity_class: 'POWER' },
      positions,
    ),
    -500,
  )
  assert.equal(
    sumRelatedPositionNetVolume(
      { ...draft, commodity: 'AECO', commodity_class: 'NATURAL_GAS' },
      positions,
    ),
    null,
  )
})

test('findLatestCounterpartyExternalSnapshot picks the newest matching snapshot', () => {
  const snapshots: CounterpartyExternalCreditSnapshotRecord[] = [
    {
      id: 1,
      counterparty_code: 'SHELL_TRADING',
      provider: 'DNB',
      source_entity_id: 'dnb-1',
      source_entity_name: 'Shell Trading',
      match_basis: 'lei',
      matched_identifier_value: 'LEI-1',
      as_of_date: '2026-04-21',
      rating_scale: 'internal',
      rating_value: 'BBB',
      rating_outlook: 'Stable',
      credit_score: 70,
      probability_of_default: 0.02,
      recommended_limit_currency_code: 'USD',
      recommended_limit_amount: 450000,
      commentary: null,
      downloaded_at: '2026-04-21T12:00:00Z',
      run_id: 1,
      created_at: '2026-04-21T12:00:00Z',
      updated_at: '2026-04-21T12:00:00Z',
      version: 1,
    },
    {
      id: 2,
      counterparty_code: 'SHELL_TRADING',
      provider: 'DNB',
      source_entity_id: 'dnb-2',
      source_entity_name: 'Shell Trading',
      match_basis: 'lei',
      matched_identifier_value: 'LEI-1',
      as_of_date: '2026-04-23',
      rating_scale: 'internal',
      rating_value: 'BBB+',
      rating_outlook: 'Positive',
      credit_score: 76,
      probability_of_default: 0.018,
      recommended_limit_currency_code: 'USD',
      recommended_limit_amount: 480000,
      commentary: null,
      downloaded_at: '2026-04-23T12:00:00Z',
      run_id: 2,
      created_at: '2026-04-23T12:00:00Z',
      updated_at: '2026-04-23T12:00:00Z',
      version: 1,
    },
  ]

  assert.equal(findLatestCounterpartyExternalSnapshot('SHELL_TRADING', snapshots)?.id, 2)
  assert.equal(findLatestCounterpartyExternalSnapshot('BP', snapshots), null)
})

test('summarizePreTradeSourceQuality reports impaired source counts', () => {
  const snapshots: PreTradeRecommendationSourceSnapshotRecord[] = [
    {
      source_key: 'desk-context',
      adapter_key: 'desk-context',
      adapter_label: 'Desk Context',
      source_type: 'INTERNAL',
      source_available: true,
      captured_at: '2026-04-23T18:00:00Z',
      freshness: 'FRESH',
      quality_status: 'OK',
      quality_score: 1,
      summary: 'Desk context loaded.',
      provenance: {
        provider: null,
        dataset: 'positions',
        record_id: 'desk-1',
        observed_at: '2026-04-23T17:55:00Z',
        ingested_at: '2026-04-23T18:00:00Z',
        captured_by: 'system',
      },
      payload: {},
    },
    {
      source_key: 'latest-mark',
      adapter_key: 'latest-mark',
      adapter_label: 'Latest Mark',
      source_type: 'EXTERNAL',
      source_available: true,
      captured_at: '2026-04-23T18:00:00Z',
      freshness: 'STALE',
      quality_status: 'STALE',
      quality_score: 0.5,
      summary: 'Latest mark is stale.',
      provenance: {
        provider: 'ICE',
        dataset: 'marks',
        record_id: 'hh-prompt',
        observed_at: '2026-04-22T20:00:00Z',
        ingested_at: '2026-04-23T18:00:00Z',
        captured_by: 'system',
      },
      payload: {},
    },
  ]

  assert.equal(summarizePreTradeSourceQuality(snapshots), '1 source need attention')
  assert.equal(
    summarizePreTradeSourceQuality(snapshots.map((snapshot) => ({ ...snapshot, quality_status: 'OK' as const }))),
    'all sources clean',
  )
})
