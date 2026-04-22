import { describe, expect, it } from 'vitest'

import { buildPositionTradeContext } from '../src/workspaces/positions/positionHelpers'
import type { Trade } from '../src/shared/models'

function makeTrade(overrides: Partial<Trade> & Pick<Trade, 'trade_id' | 'commodity' | 'commodity_class'>): Trade {
  return {
    trade_id: overrides.trade_id,
    external_trade_id: null,
    source_system: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    execution_timestamp: null,
    trade_date: null,
    effective_start_date: null,
    effective_end_date: null,
    quality_spec: null,
    unit_of_measure: null,
    trade_currency_code: null,
    location_code: null,
    delivery_start: null,
    delivery_end: null,
    price_unit_code: null,
    instrument_type: 'LINEAR',
    option_type: null,
    option_style: null,
    option_strike_price: null,
    option_expiration_date: null,
    trade_nature: 'PHYSICAL',
    trade_structure: 'SINGLE',
    trade_side: 'BUY',
    book: 'BOOK-1',
    portfolio: null,
    counterparty: null,
    commodity_class: overrides.commodity_class,
    commodity: overrides.commodity,
    pricing_type: 'FIXED',
    pricing_status: 'PRICED',
    confirmation_status: 'CONFIRMED',
    nomination_status: 'COMPLETED',
    allocation_status: 'ALLOCATED',
    price_index_code: null,
    price: 10,
    volume: 100,
    invoice_status: 'NOT_REQUIRED',
    payment_status: 'NOT_REQUIRED',
    settlement_status: 'SETTLED',
    trader_user: null,
    status: 'ACTIVE',
    last_event_id: 'EVT-1',
    ...overrides,
  }
}

describe('positions workspace helpers', () => {
  it('matches only active trades with the same commodity row identity', () => {
    const context = buildPositionTradeContext(
      {
        commodity: 'WTI',
        commodity_class: 'CRUDE_OIL',
      },
      [
        makeTrade({ trade_id: 'TRD-1', commodity: 'WTI', commodity_class: 'CRUDE_OIL' }),
        makeTrade({ trade_id: 'TRD-2', commodity: 'BRENT', commodity_class: 'CRUDE_OIL' }),
        makeTrade({ trade_id: 'TRD-3', commodity: 'WTI', commodity_class: 'POWER' }),
      ],
    )

    expect(context.matchingTrades.map((trade) => trade.trade_id)).toEqual(['TRD-1'])
    expect(context.primaryTrade?.trade_id).toBe('TRD-1')
  })

  it('picks the largest matching trade as the primary drilldown target', () => {
    const context = buildPositionTradeContext(
      {
        commodity: 'WTI',
        commodity_class: 'CRUDE_OIL',
      },
      [
        makeTrade({
          trade_id: 'TRD-100',
          commodity: 'WTI',
          commodity_class: 'CRUDE_OIL',
          updated_at: '2026-02-01T00:00:00Z',
          volume: 40,
        }),
        makeTrade({
          trade_id: 'TRD-200',
          commodity: 'WTI',
          commodity_class: 'CRUDE_OIL',
          updated_at: '2026-01-15T00:00:00Z',
          volume: 120,
        }),
      ],
    )

    expect(context.primaryTrade?.trade_id).toBe('TRD-200')
    expect(context.matchingTrades.map((trade) => trade.trade_id)).toEqual(['TRD-200', 'TRD-100'])
  })
})
