import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { HomeWorkspace } from '../src/workspaces/home/HomeWorkspace'
import type { EventRow, PriceIndexRecord, Trade } from '../src/shared/models'
import type { WorkspaceBootstrapSummary } from '../src/entities/app/api'

const SAMPLE_TRADE: Trade = {
  trade_id: 'TRD-1001',
  originating_option_trade_id: null,
  external_trade_id: 'EXT-1001',
  source_system: 'Trayport',
  created_at: '2026-05-15T12:00:00Z',
  updated_at: '2026-05-16T08:00:00Z',
  execution_timestamp: '2026-05-15T12:00:00Z',
  trade_date: '2026-05-15',
  effective_start_date: '2026-06-01',
  effective_end_date: '2026-06-30',
  quality_spec: null,
  unit_of_measure: 'MMBtu',
  trade_currency_code: 'USD',
  location_code: 'HSC',
  delivery_start: '2026-06-01',
  delivery_end: '2026-06-30',
  price_unit_code: 'USD/MMBtu',
  instrument_type: 'SWAP',
  option_type: null,
  option_style: null,
  option_strike_price: null,
  option_expiration_date: null,
  trade_nature: 'PHYSICAL',
  trade_structure: 'SINGLE',
  trade_side: 'BUY',
  book: 'GAS-NA',
  portfolio: 'TERM',
  counterparty: 'SHELL',
  commodity_class: 'GAS',
  commodity: 'HENRY HUB GAS',
  pricing_type: 'FLOATING',
  pricing_status: 'PRICED',
  confirmation_status: 'CONFIRMED',
  nomination_status: 'COMPLETE',
  allocation_status: 'COMPLETE',
  actualization_status: 'COMPLETE',
  price_index_code: 'HH_NATGAS',
  price: null,
  volume: 25000,
  invoice_status: 'PENDING',
  payment_status: 'PENDING',
  settlement_status: 'PENDING',
  trader_user: 'trader-1',
  status: 'ACTIVE',
  last_event_id: 'evt-1001',
}

const SAMPLE_EVENT: EventRow = {
  event_id: 'evt-1001',
  aggregate_type: 'trade',
  aggregate_id: 'TRD-1001',
  event_type: 'TradeAmended',
  occurred_at: '2026-06-01T13:45:00Z',
  recorded_at: '2026-06-01T13:45:00Z',
  actor_id: 'trader-1',
  correlation_id: null,
  causation_id: null,
  schema_version: 1,
  payload: {},
}

const SAMPLE_PRICE_INDEX: PriceIndexRecord = {
  code: 'HH_NATGAS',
  name: 'Henry Hub Natural Gas',
  description: 'Henry Hub natural gas daily index',
  is_active: true,
  commodity_code: 'NATGAS',
  currency_code: 'USD',
  unit_code: 'MMBTU',
  provider: 'ICE',
  quote_type: 'INDEX',
  market: 'Henry Hub',
  location_code: 'HENRY_HUB',
}

function buildSummary(overrides: Partial<WorkspaceBootstrapSummary> = {}): WorkspaceBootstrapSummary {
  return {
    generated_at: '2026-06-01T14:00:00Z',
    trades: {
      total_count: 12,
      active_count: 9,
      priced_active_count: 8,
      pending_pricing_count: 0,
      pending_settlement_count: 2,
      tracked_book_count: 3,
      total_active_volume: 4200,
    },
    positions: { total_count: 4 },
    option_exposures: { total_count: 0 },
    deliveries: { total_count: 2 },
    confirmations: { total_count: 4 },
    work_items: {
      total_count: 1,
      operations_queue_count: 0,
      settlement_queue_count: 1,
    },
    invoices: { total_count: 3 },
    payments: { total_count: 2 },
    dashboard: {
      positions: {
        gross_exposure: 4200,
        position_count: 4,
        bucket_count: 2,
        buckets: [],
        largest_bucket: null,
      },
      attention: {
        total_count: 2,
        confirmation_backlog_count: 0,
        nomination_backlog_count: 0,
        allocation_backlog_count: 0,
        invoice_backlog_count: 1,
        overdue_payment_count: 1,
        stale_pricing_count: 0,
        incomplete_ops_data_count: 0,
      },
    },
    settlement: {
      open_work_item_count: 1,
      invoice_pending_count: 1,
      payment_due_count: 1,
      settled_count: 0,
      trade_exception_count: 0,
      workflow_exception_count: 0,
      breakdown: [],
    },
    ...overrides,
  }
}

function renderHome(summary: WorkspaceBootstrapSummary | null = buildSummary()) {
  return renderToStaticMarkup(
    createElement(HomeWorkspace, {
      authDisplayName: 'Anthony',
      health: 'ok',
      summary,
      activeTrades: [SAMPLE_TRADE],
      events: [SAMPLE_EVENT],
      priceIndices: [SAMPLE_PRICE_INDEX],
      appLoading: false,
      onOpenView: () => undefined,
      onOpenTrade: () => undefined,
      onRefreshData: async () => undefined,
    }),
  )
}

test('HomeWorkspace renders a brief, focus object, timeline, pulse, and recent truth', () => {
  const markup = renderHome()

  assert.match(markup, /Morning, Anthony\./)
  assert.match(markup, /2 settlement · TRD-1001/)
  assert.match(markup, /Settlement · TRD-1001/)
  assert.match(markup, /High signal/)
  assert.match(markup, /<strong>Settle<\/strong>2/)
  assert.match(markup, /<strong>Clean<\/strong>0d/)
  assert.match(markup, /<h3 id="home-timeline-title">Now<\/h3>/)
  assert.match(markup, /title="Invoice, payment, or exception pressure is leading Home\."/)
  assert.match(markup, /HH_NATGAS/)
  assert.match(markup, /TradeAmended/)
  assert.doesNotMatch(markup, /Live Desk/)
})

test('HomeWorkspace has a quiet healthy state when no material work is promoted', () => {
  const summary = buildSummary({
    trades: {
      ...buildSummary().trades,
      pending_pricing_count: 0,
      pending_settlement_count: 0,
    },
    work_items: {
      total_count: 0,
      operations_queue_count: 0,
      settlement_queue_count: 0,
    },
    dashboard: {
      ...buildSummary().dashboard,
      attention: {
        total_count: 0,
        confirmation_backlog_count: 0,
        nomination_backlog_count: 0,
        allocation_backlog_count: 0,
        invoice_backlog_count: 0,
        overdue_payment_count: 0,
        stale_pricing_count: 0,
        incomplete_ops_data_count: 0,
      },
    },
    settlement: {
      ...buildSummary().settlement,
      open_work_item_count: 0,
      invoice_pending_count: 0,
      payment_due_count: 0,
      trade_exception_count: 0,
      workflow_exception_count: 0,
    },
  })
  const markup = renderHome(summary)

  assert.match(markup, /Clear · API ok/)
  assert.match(markup, /<strong>Clean<\/strong>1d/)
  assert.doesNotMatch(markup, /No stale marks, blocked workflow/)
})
