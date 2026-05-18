import { describe, expect, test } from 'vitest'

import type { PnlHistoryReport, PriceIndexObservationRecord } from '../src/shared/models'
import {
  buildTerminalInstrumentAnalyticsModel,
} from '../src/workspaces/dashboard/terminalInstrumentAnalytics'
import type {
  TerminalQuoteCurvePriceIndex,
  TerminalQuoteCurveSeries,
} from '../src/workspaces/dashboard/terminalQuoteCurve'

const PRIMARY_INDEX: TerminalQuoteCurvePriceIndex = {
  code: 'ERCOT_DA',
  name: 'ERCOT Day Ahead',
  provider: 'ICE',
  unit_code: 'MWH',
  currency_code: 'USD',
  is_active: true,
  commodity_class: 'POWER',
  commodity_code: 'ERCOT_NORTH',
}

const BASIS_INDEX: TerminalQuoteCurvePriceIndex = {
  code: 'ERCOT_HUB',
  name: 'ERCOT Hub',
  provider: 'ICE',
  unit_code: 'MWH',
  currency_code: 'USD',
  is_active: true,
  commodity_class: 'POWER',
  commodity_code: 'ERCOT_HUB',
}

function observation(overrides: Partial<PriceIndexObservationRecord>): PriceIndexObservationRecord {
  return {
    id: overrides.id ?? 1,
    price_index_code: overrides.price_index_code ?? 'ERCOT_DA',
    observation_date: overrides.observation_date ?? '2026-05-15',
    value: overrides.value ?? 100,
    unit_code: overrides.unit_code ?? 'MWH',
    currency_code: overrides.currency_code ?? 'USD',
    source_provider: overrides.source_provider ?? 'ICE',
    source_series_id: overrides.source_series_id ?? 'ERCOT',
    source_frequency: overrides.source_frequency ?? 'DAILY',
    source_published_at: overrides.source_published_at ?? '2026-05-15T12:00:00Z',
    source_revision: overrides.source_revision ?? null,
    downloaded_at: overrides.downloaded_at ?? '2026-05-15T12:05:00Z',
    run_id: overrides.run_id ?? 1,
    created_at: overrides.created_at ?? '2026-05-15T12:05:00Z',
    updated_at: overrides.updated_at ?? '2026-05-15T12:05:00Z',
  }
}

function pnlReport(): PnlHistoryReport {
  return {
    generated_at: '2026-05-17T12:00:00Z',
    basis: 'MARK_TO_MARKET',
    methodology: 'Demo report',
    point_count: 2,
    points: [
      {
        date: '2026-05-16',
        total_pnl: 90,
        realized_pnl: 30,
        unrealized_pnl: 60,
        priced_trade_count: 2,
        realized_trade_count: 1,
        unrealized_trade_count: 1,
      },
      {
        date: '2026-05-17',
        total_pnl: 150,
        realized_pnl: 40,
        unrealized_pnl: 110,
        priced_trade_count: 3,
        realized_trade_count: 1,
        unrealized_trade_count: 2,
      },
    ],
    summary: {
      total_pnl: 150,
      realized_pnl: 40,
      unrealized_pnl: 110,
      priced_trade_count: 3,
      realized_trade_count: 1,
      unrealized_trade_count: 2,
    },
    valuations: [
      {
        trade_id: 'TRD-1',
        book: 'POWER',
        portfolio: 'ERCOT',
        commodity_class: 'POWER',
        instrument_type: 'SWAP',
        trade_structure: 'FLAT',
        trade_side: 'BUY',
        settlement_status: 'OPEN',
        pnl_bucket: 'UNREALIZED',
        pricing_type: 'FLOATING',
        pricing_source: 'MARKET',
        fixed_price: null,
        price_index_code: 'ERCOT_DA',
        market_price: 103,
        effective_mark: 103,
        quantity: 10,
        direction: 1,
        trade_currency_code: 'USD',
        price_unit_code: 'MWH',
        pnl_contribution: 120,
        valuation_status: 'VALUED',
        valuation_status_reason: null,
        included_in_totals: true,
      },
      {
        trade_id: 'TRD-2',
        book: 'POWER',
        portfolio: 'ERCOT',
        commodity_class: 'POWER',
        instrument_type: 'SWAP',
        trade_structure: 'FLAT',
        trade_side: 'SELL',
        settlement_status: 'OPEN',
        pnl_bucket: 'UNREALIZED',
        pricing_type: 'FLOATING',
        pricing_source: 'MARKET',
        fixed_price: null,
        price_index_code: 'ERCOT_HUB',
        market_price: 98,
        effective_mark: 98,
        quantity: 5,
        direction: -1,
        trade_currency_code: 'USD',
        price_unit_code: 'MWH',
        pnl_contribution: -20,
        valuation_status: 'VALUED',
        valuation_status_reason: null,
        included_in_totals: true,
      },
    ],
  }
}

describe('terminal instrument analytics', () => {
  test('builds curve, basis, volatility, and linked P&L analytics deterministically', () => {
    const seriesList: TerminalQuoteCurveSeries[] = [
      {
        priceIndex: PRIMARY_INDEX,
        observations: [
          observation({ id: 3, observation_date: '2026-05-17', value: 103 }),
          observation({ id: 2, observation_date: '2026-05-16', value: 105 }),
          observation({ id: 1, observation_date: '2026-05-15', value: 100 }),
        ],
      },
      {
        priceIndex: BASIS_INDEX,
        observations: [
          observation({ id: 6, price_index_code: 'ERCOT_HUB', observation_date: '2026-05-17', value: 98 }),
          observation({ id: 5, price_index_code: 'ERCOT_HUB', observation_date: '2026-05-16', value: 99 }),
          observation({ id: 4, price_index_code: 'ERCOT_HUB', observation_date: '2026-05-15', value: 95 }),
        ],
      },
    ]

    const model = buildTerminalInstrumentAnalyticsModel({
      seriesList,
      activeTrades: [
        { price_index_code: 'ERCOT_DA' },
        { price_index_code: 'ERCOT_DA' },
        { price_index_code: 'ERCOT_HUB' },
      ],
      pnlHistoryReport: pnlReport(),
    })

    expect(model.primarySeries?.priceIndex.code).toBe('ERCOT_DA')
    expect(model.comparisonSeries?.priceIndex.code).toBe('ERCOT_HUB')
    expect(model.curveRows.map((row) => row.priceIndex.code)).toEqual(['ERCOT_DA', 'ERCOT_HUB'])
    expect(model.curveRows[0]?.tradeCount).toBe(2)
    expect(model.curveRows[0]?.annualizedVolatilityPercent).toBeGreaterThan(50)
    expect(model.basis).toMatchObject({
      primaryCode: 'ERCOT_DA',
      comparisonCode: 'ERCOT_HUB',
      latestSpread: 5,
      lowSpread: 5,
      highSpread: 6,
      observationCount: 3,
    })
    expect(model.basis?.averageSpread).toBeCloseTo(5.3333, 4)
    expect(model.pnl.linkedValuationCount).toBe(2)
    expect(model.pnl.linkedPnl).toBe(100)
    expect(model.pnl.windowChange).toBe(60)
    expect(model.notes).toEqual([])
  })

  test('fails soft when basis or P&L inputs are missing', () => {
    const model = buildTerminalInstrumentAnalyticsModel({
      seriesList: [
        {
          priceIndex: PRIMARY_INDEX,
          observations: [observation({ observation_date: '2026-05-17', value: 103 })],
        },
      ],
      activeTrades: [{ price_index_code: 'ERCOT_DA' }],
      pnlHistoryReport: null,
    })

    expect(model.basis).toBeNull()
    expect(model.pnl.totalPnl).toBeNull()
    expect(model.notes).toContain('Basis analytics require a second compatible curve with the same currency and unit.')
    expect(model.notes).toContain('P&L attribution is waiting on the existing P&L history report.')
  })
})
