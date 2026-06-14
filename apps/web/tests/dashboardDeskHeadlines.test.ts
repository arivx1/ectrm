import { describe, expect, test } from 'vitest'

import {
  buildDashboardDeskHeadlines,
  filterDashboardDeskHeadlines,
} from '../src/workspaces/dashboard/dashboardDeskHeadlines'
import type { Trade } from '../src/shared/models'

const baseTrade = {
  trade_id: 'TRD-HEAD-1',
  originating_option_trade_id: null,
  external_trade_id: 'EXT-HEAD-1',
  source_system: 'ICE',
  created_at: '2026-05-12T10:00:00Z',
  updated_at: '2026-05-16T15:00:00Z',
  execution_timestamp: '2026-05-14T10:00:00Z',
  trade_date: '2026-05-14',
  effective_start_date: '2026-05-20',
  effective_end_date: '2026-05-21',
  quality_spec: null,
  unit_of_measure: 'MWh',
  trade_currency_code: 'USD',
  location_code: 'ERCOT',
  delivery_start: '2026-05-20',
  delivery_end: '2026-05-21',
  price_unit_code: 'MWh',
  instrument_type: 'SWAP',
  option_type: null,
  option_style: null,
  option_strike_price: null,
  option_expiration_date: null,
  trade_nature: 'FINANCIAL',
  trade_structure: 'FLAT',
  trade_side: 'BUY',
  book: 'POWER_WEST',
  portfolio: 'ERCOT',
  counterparty: 'UtilityCo',
  commodity_class: 'POWER',
  commodity: 'ERCOT_NORTH',
  pricing_type: 'FLOATING',
  pricing_status: 'PENDING',
  confirmation_status: 'UNCONFIRMED',
  nomination_status: 'NOT_REQUIRED',
  allocation_status: 'NOT_REQUIRED',
  actualization_status: 'PENDING',
  price_index_code: 'ERCOT_DA',
  price: null,
  volume: 50,
  invoice_status: 'NOT_REQUIRED',
  payment_status: 'CURRENT',
  settlement_status: 'OPEN',
  trader_user: null,
  status: 'ACTIVE',
  last_event_id: 'EVT-HEAD-1',
} satisfies Trade

describe('dashboard desk headlines', () => {
  test('builds a mixed deterministic stream with source objects and owner workspaces', () => {
    const headlines = buildDashboardDeskHeadlines({
      activeTrades: [baseTrade],
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          is_active: true,
          commodity_class: 'POWER',
          commodity_code: 'ERCOT_NORTH',
        },
      ],
      exposureByClass: [
        {
          commodityClass: 'POWER',
          unitLabel: 'MWh',
          netVolume: 1200,
          commodityCount: 1,
        },
      ],
      issues: [
        {
          label: 'Confirmation backlog',
          count: 2,
          detail: 'Trades still need confirmation.',
          candidateType: 'confirmation_backlog',
          destinationView: 'operations',
        },
      ],
      events: [
        {
          event_id: 'EVT-HEAD-1',
          aggregate_id: 'TRD-HEAD-1',
          aggregate_type: 'trade',
          event_type: 'TRADE_BOOKED',
          recorded_at: '2026-05-16T14:45:00Z',
        },
      ],
      now: new Date('2026-05-16T00:00:00Z'),
    })

    expect(headlines.map((item) => item.concern)).toEqual(
      expect.arrayContaining(['pricing', 'operations', 'exposure', 'market', 'activity']),
    )
    expect(headlines.find((item) => item.id === 'pricing:TRD-HEAD-1')).toMatchObject({
      severity: 'critical',
      ownerView: 'trades',
      source: {
        type: 'trade',
        id: 'TRD-HEAD-1',
      },
    })
    expect(headlines.find((item) => item.id === 'issue:confirmation_backlog')).toMatchObject({
      ownerView: 'operations',
      source: {
        type: 'workflow',
      },
    })
  })

  test('filters by commodity, concern, and severity without mutating route metadata', () => {
    const headlines = buildDashboardDeskHeadlines({
      activeTrades: [baseTrade],
      priceIndices: [],
      exposureByClass: [],
      issues: [
        {
          label: 'Overdue payments',
          count: 1,
          detail: 'Payment issue.',
          candidateType: 'overdue_payment',
          destinationView: 'settlement',
        },
      ],
      events: [],
      now: new Date('2026-05-16T00:00:00Z'),
    })

    const filtered = filterDashboardDeskHeadlines(headlines, {
      commodityClass: 'POWER',
      concern: 'pricing',
      severity: 'critical',
    })

    expect(filtered.map((item) => item.id)).toEqual(['pricing:TRD-HEAD-1'])
    expect(filtered[0]?.ownerView).toBe('trades')
    expect(filtered[0]?.source.id).toBe('TRD-HEAD-1')
  })
})
