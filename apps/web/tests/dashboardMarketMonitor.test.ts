import { describe, expect, test } from 'vitest'

import { buildDashboardMarketMonitorSummary } from '../src/workspaces/dashboard/dashboardMarketMonitor'
import { selectPriceIndexCandidates } from '../src/workspaces/dashboard/marketPriceSelection'

describe('dashboard market monitor helpers', () => {
  test('summarizes focus classes and desk priorities for the monitor board', () => {
    const summary = buildDashboardMarketMonitorSummary({
      activeTrades: [
        {
          commodity_class: 'POWER',
          price: 52,
          volume: 20,
          price_index_code: 'ERCOT_DA',
        },
        {
          commodity_class: 'POWER',
          price: null,
          volume: 15,
          price_index_code: 'ERCOT_RT',
        },
        {
          commodity_class: 'GAS',
          price: 3.12,
          volume: 1000,
          price_index_code: 'HENRY',
        },
      ],
      exposureByClass: [
        {
          commodityClass: 'POWER',
          unitLabel: 'MWh',
          netVolume: 2400,
          commodityCount: 2,
        },
        {
          commodityClass: 'GAS',
          unitLabel: 'MMBtu',
          netVolume: -9000,
          commodityCount: 1,
        },
      ],
      issues: [
        {
          label: 'Stale pricing',
          count: 3,
          detail: 'Trades still marked pending.',
          tone: 'blocked',
          destinationView: 'trades',
        },
        {
          label: 'Nomination backlog',
          count: 1,
          detail: 'Physical trades nearing delivery.',
          tone: 'blocked',
          destinationView: 'scheduling',
        },
        {
          label: 'Confirmation backlog',
          count: 0,
          detail: 'Nothing pending.',
          tone: 'active',
          destinationView: 'operations',
        },
      ],
      events: [
        { recorded_at: '2026-05-16T10:15:00Z' },
        { recorded_at: '2026-05-16T14:45:00Z' },
      ],
    })

    expect(summary.activeTradeCount).toBe(3)
    expect(summary.pricedTradeCount).toBe(2)
    expect(summary.pricedTradeCoveragePercent).toBe(67)
    expect(summary.latestEventAt).toBe('2026-05-16T14:45:00Z')
    expect(summary.focusRows[0]).toMatchObject({
      commodityClass: 'POWER',
      tradeCount: 2,
      pricedTradeCount: 1,
      linkedPriceIndexCount: 2,
      leadExposureNetVolume: 2400,
      leadExposureUnitLabel: 'MWh',
    })
    expect(summary.priorityRows.map((row) => row.label)).toEqual([
      'Stale pricing',
      'Nomination backlog',
    ])
  })

  test('prefers trade-linked price indices before fallback market curves', () => {
    const selected = selectPriceIndexCandidates(
      [
        { price_index_code: 'WTI' },
        { price_index_code: 'WTI' },
        { price_index_code: 'BRENT' },
      ],
      [
        {
          code: 'BRENT',
          name: 'Brent',
          provider: 'ICE',
          unit_code: 'BBL',
          currency_code: 'USD',
          is_active: true,
        },
        {
          code: 'WTI',
          name: 'WTI',
          provider: 'CME',
          unit_code: 'BBL',
          currency_code: 'USD',
          is_active: true,
        },
        {
          code: 'HH',
          name: 'Henry Hub',
          provider: 'CME',
          unit_code: 'MMBTU',
          currency_code: 'USD',
          is_active: true,
        },
      ],
    )

    expect(selected.map((priceIndex) => priceIndex.code).slice(0, 3)).toEqual(['WTI', 'BRENT', 'HH'])
  })
})
