import { describe, expect, test } from 'vitest'

import {
  buildDashboardInstrumentBrief,
  buildDashboardInstrumentHandoff,
  resolveDashboardInstrumentBriefSelection,
} from '../src/workspaces/dashboard/dashboardInstrumentBrief'
import { readAppRouteHandoff, writeAppRouteHandoff } from '../src/shared/appRouteHandoff'
import type { Trade } from '../src/shared/models'

const trade = {
  trade_id: 'TRD-1001',
  originating_option_trade_id: null,
  external_trade_id: 'EXT-1001',
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
  last_event_id: 'EVT-1001',
} satisfies Trade

describe('dashboard instrument brief helpers', () => {
  test('round-trips market instrument handoffs through route params', () => {
    const handoff = buildDashboardInstrumentHandoff({
      kind: 'price_index',
      id: 'ERCOT_DA',
      label: 'ERCOT Day Ahead',
    })
    const params = new URLSearchParams()
    writeAppRouteHandoff(params, handoff)

    expect(params.toString()).toContain('focusType=market_instrument')
    expect(resolveDashboardInstrumentBriefSelection(readAppRouteHandoff(params))).toEqual({
      kind: 'price_index',
      id: 'ERCOT_DA',
      label: 'ERCOT Day Ahead',
    })
  })

  test('builds price-index briefs with related trade, position, and event context', () => {
    const brief = buildDashboardInstrumentBrief({
      selection: {
        kind: 'price_index',
        id: 'ERCOT_DA',
        label: 'ERCOT Day Ahead',
      },
      activeTrades: [trade],
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          unit_code: 'MWh',
          currency_code: 'USD',
          is_active: true,
          commodity_code: 'ERCOT_NORTH',
        },
      ],
      positionsWithClass: [
        {
          commodity: 'ERCOT_NORTH',
          commodity_class: 'POWER',
          net_volume: 1200,
        },
      ],
      events: [
        {
          event_id: 'EVT-1001',
          aggregate_id: 'TRD-1001',
          aggregate_type: 'trade',
          event_type: 'TRADE_BOOKED',
          recorded_at: '2026-05-16T14:45:00Z',
        },
      ],
    })

    expect(brief?.title).toBe('ERCOT Day Ahead')
    expect(brief?.ownerView).toBe('reference')
    expect(brief?.relatedTrades.map((row) => row.trade_id)).toEqual(['TRD-1001'])
    expect(brief?.relatedPositions.map((row) => row.commodity)).toEqual(['ERCOT_NORTH'])
    expect(brief?.relatedEvents.map((row) => row.event_id)).toEqual(['EVT-1001'])
  })

  test('fails closed when the selected instrument is unsupported', () => {
    expect(
      buildDashboardInstrumentBrief({
        selection: {
          kind: 'price_index',
          id: 'MISSING',
          label: 'Missing Curve',
        },
        activeTrades: [trade],
        priceIndices: [],
        positionsWithClass: [],
        events: [],
      }),
    ).toBeNull()
  })
})
