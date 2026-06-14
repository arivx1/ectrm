import { describe, expect, test } from 'vitest'

import {
  buildTerminalCurveBuckets,
  buildTerminalCurveRows,
  buildTerminalQuoteChartModel,
  type TerminalQuoteCurvePriceIndex,
  type TerminalQuoteCurveSeries,
} from '../src/workspaces/dashboard/terminalQuoteCurve'
import type { PriceIndexObservationRecord } from '../src/shared/models'

const GAS_INDEX: TerminalQuoteCurvePriceIndex = {
  code: 'HENRY_DA',
  name: 'Henry Hub Daily',
  provider: 'ICE',
  unit_code: 'MMBTU',
  currency_code: 'USD',
  is_active: true,
  commodity_class: 'GAS',
  commodity_code: 'HH_GAS',
  market: 'Henry Hub',
}

const POWER_INDEX: TerminalQuoteCurvePriceIndex = {
  code: 'ERCOT_DA',
  name: 'ERCOT Day Ahead',
  provider: 'ICE',
  unit_code: 'MWH',
  currency_code: 'USD',
  is_active: true,
  commodity_class: 'POWER',
  commodity_code: 'ERCOT_NORTH',
  market: 'ERCOT',
}

function observation(overrides: Partial<PriceIndexObservationRecord>): PriceIndexObservationRecord {
  return {
    id: overrides.id ?? 1,
    price_index_code: overrides.price_index_code ?? 'HENRY_DA',
    observation_date: overrides.observation_date ?? '2026-05-15',
    value: overrides.value ?? 3.25,
    unit_code: overrides.unit_code ?? 'MMBTU',
    currency_code: overrides.currency_code ?? 'USD',
    source_provider: overrides.source_provider ?? 'ICE',
    source_series_id: overrides.source_series_id ?? 'HH',
    source_frequency: overrides.source_frequency ?? 'DAILY',
    source_published_at: overrides.source_published_at ?? '2026-05-15T12:00:00Z',
    source_revision: overrides.source_revision ?? null,
    downloaded_at: overrides.downloaded_at ?? '2026-05-15T12:05:00Z',
    run_id: overrides.run_id ?? 1,
    created_at: overrides.created_at ?? '2026-05-15T12:05:00Z',
    updated_at: overrides.updated_at ?? '2026-05-15T12:05:00Z',
  }
}

describe('terminal quote and curve helpers', () => {
  test('builds a quote chart model from newest-first observations', () => {
    const model = buildTerminalQuoteChartModel({
      priceIndex: GAS_INDEX,
      observations: [
        observation({ id: 3, observation_date: '2026-05-17', value: 3.45 }),
        observation({ id: 2, observation_date: '2026-05-16', value: 3.3 }),
        observation({ id: 1, observation_date: '2026-05-15', value: 3.2 }),
      ],
    })

    expect(model.latest?.value).toBe(3.45)
    expect(model.previous?.value).toBe(3.3)
    expect(model.values).toEqual([3.2, 3.3, 3.45])
    expect(model.tone).toBe('up')
    expect(model.delta).toBeCloseTo(0.15)
    expect(model.deltaPercent).toBeCloseTo(0.04545, 4)
    expect(model.low).toBe(3.2)
    expect(model.high).toBe(3.45)
    expect(model.average).toBeCloseTo(3.3167, 4)
  })

  test('ranks curve rows by linked trade usage and normalizes latest quote values', () => {
    const seriesList: TerminalQuoteCurveSeries[] = [
      {
        priceIndex: POWER_INDEX,
        observations: [
          observation({ id: 10, price_index_code: 'ERCOT_DA', value: 42.5, unit_code: 'MWH' }),
          observation({ id: 9, price_index_code: 'ERCOT_DA', value: 44.25, unit_code: 'MWH' }),
        ],
      },
      {
        priceIndex: GAS_INDEX,
        observations: [
          observation({ id: 3, value: 3.45 }),
          observation({ id: 2, value: 3.3 }),
        ],
      },
    ]

    const rows = buildTerminalCurveRows(seriesList, [
      { price_index_code: 'HENRY_DA' },
      { price_index_code: 'HENRY_DA' },
      { price_index_code: 'ERCOT_DA' },
    ])

    expect(rows.map((row) => row.priceIndex.code)).toEqual(['HENRY_DA', 'ERCOT_DA'])
    expect(rows[0]?.tradeCount).toBe(2)
    expect(rows[0]?.tone).toBe('up')
    expect(rows[1]?.tone).toBe('down')
    expect(rows[0]?.normalizedLatestValue).toBe(0)
    expect(rows[1]?.normalizedLatestValue).toBe(1)
  })

  test('groups curve rows into commodity-class buckets', () => {
    const rows = buildTerminalCurveRows(
      [
        {
          priceIndex: POWER_INDEX,
          observations: [observation({ price_index_code: 'ERCOT_DA', value: 42.5, unit_code: 'MWH' })],
        },
        {
          priceIndex: GAS_INDEX,
          observations: [observation({ value: 3.45 })],
        },
      ],
      [],
    )

    const buckets = buildTerminalCurveBuckets(rows)

    expect(buckets.map((bucket) => bucket.label).sort()).toEqual(['GAS', 'POWER'])
    expect(buckets.find((bucket) => bucket.label === 'POWER')?.averageLatestValue).toBe(42.5)
    expect(buckets.find((bucket) => bucket.label === 'GAS')?.rows[0]?.priceIndex.code).toBe('HENRY_DA')
  })
})
