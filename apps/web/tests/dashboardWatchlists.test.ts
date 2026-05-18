import { describe, expect, test } from 'vitest'

import type { Trade } from '../src/shared/models'
import {
  buildDefaultDashboardWatchlist,
  evaluateDashboardWatchlistAlerts,
  formatDashboardWatchlistAlertDeliveryChannel,
  markDashboardWatchlistAlertDeliveryOpened,
  parseDashboardWatchlistAlertDeliveries,
  parseDashboardWatchlist,
  reconcileDashboardWatchlistAlertDeliveries,
  serializeDashboardWatchlistAlertDeliveries,
  serializeDashboardWatchlist,
} from '../src/workspaces/dashboard/dashboardWatchlists'

const baseTrade = {
  trade_id: 'TRD-WATCH-1',
  originating_option_trade_id: null,
  external_trade_id: 'EXT-WATCH-1',
  source_system: 'ICE',
  created_at: '2026-05-12T10:00:00Z',
  updated_at: '2026-05-16T15:00:00Z',
  execution_timestamp: '2026-05-12T10:00:00Z',
  trade_date: '2026-05-12',
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
  trade_nature: 'PHYSICAL',
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
  nomination_status: 'PENDING',
  allocation_status: 'PENDING',
  actualization_status: 'PENDING',
  price_index_code: 'ERCOT_DA',
  price: null,
  volume: 50,
  invoice_status: 'DRAFT',
  payment_status: 'OVERDUE',
  settlement_status: 'PARTIALLY_SETTLED',
  trader_user: null,
  status: 'ACTIVE',
  last_event_id: 'EVT-WATCH-1',
} satisfies Trade

describe('dashboard watchlists', () => {
  test('serializes saved watchlists and rejects unsupported payloads', () => {
    const watchlist = buildDefaultDashboardWatchlist({
      activeTrades: [baseTrade],
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          is_active: true,
          commodity_class: 'POWER',
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
      now: new Date('2026-05-16T00:00:00Z'),
    })

    expect(parseDashboardWatchlist(serializeDashboardWatchlist(watchlist))).toEqual(watchlist)
    expect(parseDashboardWatchlist('{bad json')).toBeNull()
    expect(
      parseDashboardWatchlist(
        JSON.stringify({
          version: 1,
          id: 'bad',
          name: 'Bad',
          createdAt: '2026-05-16T00:00:00Z',
          updatedAt: '2026-05-16T00:00:00Z',
          items: [{ objectType: 'arbitrary_expression', objectId: 'x', label: 'x' }],
          alertRules: [],
        }),
      ),
    ).toBeNull()
  })

  test('evaluates typed price, stale-data, exposure, pricing, and settlement alert rules', () => {
    const watchlist = buildDefaultDashboardWatchlist({
      activeTrades: [baseTrade],
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          is_active: true,
          commodity_class: 'POWER',
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
      now: new Date('2026-05-16T00:00:00Z'),
    })

    const alerts = evaluateDashboardWatchlistAlerts({
      watchlist,
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          is_active: true,
          commodity_class: 'POWER',
          last_observed_at: '2026-05-11T00:00:00Z',
          dayChangePercent: 6.2,
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
          label: 'Stale pricing',
          count: 2,
          detail: 'Trades still need pricing.',
          candidateType: 'stale_pricing',
          destinationView: 'trades',
        },
        {
          label: 'Overdue payments',
          count: 1,
          detail: 'Payment follow-through required.',
          candidateType: 'overdue_payment',
          destinationView: 'settlement',
        },
      ],
      activeTrades: [baseTrade],
      now: new Date('2026-05-16T00:00:00Z'),
    })

    expect(alerts.map((alert) => alert.conditionType)).toEqual(
      expect.arrayContaining([
        'price_move',
        'stale_market_data',
        'large_position_change',
        'pricing_exception',
        'settlement_exception',
      ]),
    )
    expect(alerts.find((alert) => alert.conditionType === 'settlement_exception')).toMatchObject({
      severity: 'critical',
      ownerView: 'settlement',
      metricValue: 1,
    })
    expect(alerts.find((alert) => alert.conditionType === 'price_move')?.threshold).toBe(5)
  })

  test('persists terminal alert delivery records with deterministic routing and cooldowns', () => {
    const watchlist = buildDefaultDashboardWatchlist({
      activeTrades: [baseTrade],
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          is_active: true,
          commodity_class: 'POWER',
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
      now: new Date('2026-05-16T00:00:00Z'),
    })
    const alerts = evaluateDashboardWatchlistAlerts({
      watchlist,
      priceIndices: [
        {
          code: 'ERCOT_DA',
          name: 'ERCOT Day Ahead',
          provider: 'ICE',
          is_active: true,
          commodity_class: 'POWER',
          dayChangePercent: 6.2,
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
      issues: [],
      activeTrades: [baseTrade],
      now: new Date('2026-05-16T00:00:00Z'),
    })

    const firstSnapshot = reconcileDashboardWatchlistAlertDeliveries({
      watchlistId: watchlist.id,
      alerts,
      existingRecords: [],
      now: new Date('2026-05-16T10:00:00Z'),
      minimumIntervalMinutes: 30,
    })
    const priceMoveDelivery = firstSnapshot.records.find((record) => record.conditionType === 'price_move')

    expect(firstSnapshot.emittedCount).toBe(alerts.length)
    expect(priceMoveDelivery).toMatchObject({
      channel: 'instrument_brief',
      routeView: 'dashboard',
      ownerView: 'reference',
      actionLabel: 'Open Brief',
      deliveryCount: 1,
    })

    const suppressedSnapshot = reconcileDashboardWatchlistAlertDeliveries({
      watchlistId: watchlist.id,
      alerts,
      existingRecords: firstSnapshot.records,
      now: new Date('2026-05-16T10:15:00Z'),
      minimumIntervalMinutes: 30,
    })

    expect(suppressedSnapshot.emittedCount).toBe(0)
    expect(suppressedSnapshot.suppressedCount).toBe(alerts.length)
    expect(suppressedSnapshot.records.find((record) => record.conditionType === 'price_move')?.deliveryCount).toBe(1)

    const openedRecords = markDashboardWatchlistAlertDeliveryOpened({
      records: suppressedSnapshot.records,
      deliveryId: priceMoveDelivery?.id ?? '',
      now: new Date('2026-05-16T10:20:00Z'),
    })

    expect(parseDashboardWatchlistAlertDeliveries(serializeDashboardWatchlistAlertDeliveries(openedRecords))).toEqual(
      openedRecords,
    )
    expect(openedRecords.find((record) => record.id === priceMoveDelivery?.id)?.lastOpenedAt).toBe(
      '2026-05-16T10:20:00.000Z',
    )
    expect(formatDashboardWatchlistAlertDeliveryChannel('instrument_brief')).toBe('Instrument Brief')
    expect(parseDashboardWatchlistAlertDeliveries('{bad json')).toEqual([])
  })
})
