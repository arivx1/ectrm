import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/workspaces/reports/settlementReportTiles.tsx', () => ({
  buildSettlementReportTiles: () => [],
}))

vi.mock('../src/workspaces/reports/useSettlementReportLens.ts', () => ({
  useSettlementReportLens: () => ({}),
}))

import type { LocationRecord, PriceIndexObservationRecord, PriceIndexRecord } from '../src/shared/models'
import { PriceReportObservationTable, ReportsWorkspace } from '../src/workspaces/reports/ReportsWorkspace'
import { resolveReportPromptIntent } from '../src/workspaces/reports/reportPrompt'
import { ReportPromptPriceReport } from '../src/workspaces/reports/reportPromptPriceReport'
import {
  hiddenPriceReportObservationColumns,
  hidePriceReportObservationColumn,
  movePriceReportObservationColumn,
  showPriceReportObservationColumn,
  sortPriceReportObservations,
} from '../src/workspaces/reports/priceReportObservations'
import {
  buildPriceIndexBiReportHeroTitle,
  buildPriceIndexBiReportHandoff,
  resolvePriceIndexReportRouteFocus,
} from '../src/workspaces/reports/reportRouteHandoffs'

function priceObservation(overrides: Partial<PriceIndexObservationRecord> = {}): PriceIndexObservationRecord {
  return {
    id: overrides.id ?? 1,
    price_index_code: overrides.price_index_code ?? 'ERCOT_HB_HOUSTON_RT15M',
    observation_date: overrides.observation_date ?? '2026-05-25',
    value: overrides.value ?? 24.81,
    unit_code: overrides.unit_code ?? 'MWH',
    currency_code: overrides.currency_code ?? 'USD',
    source_provider: overrides.source_provider ?? 'ERCOT',
    source_series_id: overrides.source_series_id ?? 'HB_HOUSTON',
    source_frequency: overrides.source_frequency ?? '15MIN',
    source_published_at: overrides.source_published_at ?? null,
    source_revision: overrides.source_revision ?? '2026-05-25:IE1200',
    downloaded_at: overrides.downloaded_at ?? '2026-05-25T10:06:00Z',
    run_id: overrides.run_id ?? 10,
    created_at: overrides.created_at ?? '2026-05-25T10:07:00Z',
    updated_at: overrides.updated_at ?? '2026-05-25T10:07:00Z',
  }
}

function priceIndex(overrides: Partial<PriceIndexRecord> = {}): PriceIndexRecord {
  return {
    code: overrides.code ?? 'ERCOT_HB_HOUSTON_RT15M',
    name: overrides.name ?? 'ERCOT Houston Real-Time Hub SPP',
    description: overrides.description ?? 'Current public ERCOT real-time Houston hub settlement point price reference.',
    is_active: overrides.is_active ?? true,
    commodity_code: overrides.commodity_code ?? 'POWER',
    currency_code: overrides.currency_code ?? 'USD',
    unit_code: overrides.unit_code ?? 'MWH',
    provider: overrides.provider ?? 'ERCOT',
    quote_type: overrides.quote_type ?? 'INDEX',
    market: overrides.market ?? 'ERCOT',
    location_code: overrides.location_code ?? 'ERCOT_HOUSTON',
    calendar_code: overrides.calendar_code ?? 'ERCOT',
  }
}

function location(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return {
    code: overrides.code ?? 'ERCOT_HOUSTON',
    name: overrides.name ?? 'ERCOT Houston',
    description: overrides.description ?? 'Houston power hub.',
    is_active: overrides.is_active ?? true,
    location_kind: overrides.location_kind ?? 'POINT',
    location_type: overrides.location_type ?? 'HUB',
    market: overrides.market ?? 'ERCOT',
    city: overrides.city ?? 'Houston',
    subdivision_code: overrides.subdivision_code ?? 'US-TX',
    country_code: overrides.country_code ?? 'US',
    continent_code: overrides.continent_code ?? 'NA',
    latitude: overrides.latitude ?? 29.7604,
    longitude: overrides.longitude ?? -95.3698,
    region: overrides.region ?? 'Texas',
    timezone: overrides.timezone ?? 'America/Chicago',
  }
}

describe('ReportsWorkspace', () => {
  it('renders price report observations as a table-like record grid', () => {
    const observations: PriceIndexObservationRecord[] = [priceObservation()]
    const markup = renderToStaticMarkup(
      createElement(PriceReportObservationTable, {
        observations,
        formatNumber: (value: number | null, digits = 2) => (value ?? 0).toFixed(digits),
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        formatDateOnly: (value: string | null | undefined) => value ?? 'n/a',
      }),
    )

    expect(markup).toContain('class="price-report-observation-table"')
    expect(markup).toContain('aria-label="Hidden price report columns"')
    expect(markup).toContain('draggable="true"')
    expect(markup).toContain('aria-sort="descending"')
    expect(markup).toContain('Sort price observations by Observation Date/Time')
    expect(markup).toContain('<strong>2026-05-25 12:00:00</strong>')
    expect(markup).toContain('USD 24.81 / MWH')
    expect(markup).toContain('Revision 2026-05-25:IE1200')
    expect(markup).toContain('HB_HOUSTON')
  })

  it('moves price report columns in and out of the table order', () => {
    const visibleColumns = ['observationDateTime', 'price', 'frequency', 'revision', 'source', 'downloaded'] as const
    const hiddenColumns = hidePriceReportObservationColumn([...visibleColumns], 'revision')

    expect(hiddenColumns).toEqual(['observationDateTime', 'price', 'frequency', 'source', 'downloaded'])
    expect(hiddenPriceReportObservationColumns(hiddenColumns)).toEqual(['revision'])
    expect(showPriceReportObservationColumn(hiddenColumns, 'revision', 'price')).toEqual([
      'observationDateTime',
      'revision',
      'price',
      'frequency',
      'source',
      'downloaded',
    ])
    expect(movePriceReportObservationColumn([...visibleColumns], 'downloaded', 'price')).toEqual([
      'observationDateTime',
      'downloaded',
      'price',
      'frequency',
      'revision',
      'source',
    ])
  })

  it('sorts price report observations by clicked column semantics', () => {
    const observations = [
      priceObservation({
        id: 1,
        observation_date: '2026-05-25',
        value: 24.81,
        source_revision: '2026-05-25:IE1200',
      }),
      priceObservation({
        id: 2,
        observation_date: '2026-05-24',
        value: 28.91,
        source_revision: '2026-05-24:IE2330',
      }),
      priceObservation({
        id: 3,
        observation_date: '2026-05-25',
        value: 18.35,
        source_revision: '2026-05-25:IE0900',
      }),
    ]

    expect(
      sortPriceReportObservations(observations, { field: 'observationDateTime', direction: 'asc' }).map(
        (observation) => observation.id,
      ),
    ).toEqual([2, 3, 1])
    expect(
      sortPriceReportObservations(observations, { field: 'observationDateTime', direction: 'desc' }).map(
        (observation) => observation.id,
      ),
    ).toEqual([1, 3, 2])
    expect(
      sortPriceReportObservations(observations, { field: 'price', direction: 'asc' }).map(
        (observation) => observation.id,
      ),
    ).toEqual([3, 1, 2])
  })

  it('resolves a US power price prompt to active US power indices', () => {
    const intent = resolveReportPromptIntent('Show me power prices in the US', {
      priceIndices: [
        priceIndex({ code: 'ERCOT_HB_HOUSTON_RT15M', location_code: 'ERCOT_HOUSTON' }),
        priceIndex({
          code: 'PJM_WEST_ONPEAK_DA',
          name: 'PJM West ICE Peak Daily',
          provider: 'EIA_WHOLESALE_POWER',
          market: 'PJM',
          location_code: 'PJM_WEST',
          calendar_code: 'PJM',
        }),
        priceIndex({
          code: 'BRENT_SPOT_D',
          name: 'Brent Spot Daily',
          commodity_code: 'BRENT',
          unit_code: 'BBL',
          provider: 'EIA',
          market: 'EUROPE',
          location_code: null,
          calendar_code: null,
        }),
        priceIndex({
          code: 'ERCOT_INACTIVE',
          is_active: false,
        }),
      ],
      locations: [
        location(),
        location({
          code: 'PJM_WEST',
          name: 'PJM West',
          market: 'PJM',
          city: 'Pittsburgh',
          subdivision_code: 'US-PA',
          latitude: 40.4406,
          longitude: -79.9959,
          timezone: 'America/New_York',
        }),
      ],
    })

    expect(intent.kind).toBe('price-index')
    if (intent.kind !== 'price-index') {
      return
    }
    expect(intent.title).toBe('Power Prices · US')
    expect(intent.priceIndices.map((item) => item.code)).toEqual([
      'ERCOT_HB_HOUSTON_RT15M',
      'PJM_WEST_ONPEAK_DA',
    ])
  })

  it('renders the prompt price report as average, map, line chart, legend, and table', () => {
    const intent = resolveReportPromptIntent('Show me power prices in the US', {
      priceIndices: [
        priceIndex({ code: 'ERCOT_HB_HOUSTON_RT15M', location_code: 'ERCOT_HOUSTON' }),
        priceIndex({
          code: 'PJM_WEST_ONPEAK_DA',
          name: 'PJM West ICE Peak Daily',
          provider: 'EIA_WHOLESALE_POWER',
          market: 'PJM',
          location_code: 'PJM_WEST',
          calendar_code: 'PJM',
        }),
      ],
      locations: [
        location(),
        location({
          code: 'PJM_WEST',
          name: 'PJM West',
          market: 'PJM',
          city: 'Pittsburgh',
          subdivision_code: 'US-PA',
          latitude: 40.4406,
          longitude: -79.9959,
          timezone: 'America/New_York',
        }),
      ],
    })

    expect(intent.kind).toBe('price-index')
    if (intent.kind !== 'price-index') {
      return
    }

    const markup = renderToStaticMarkup(
      createElement(ReportPromptPriceReport, {
        intent,
        observations: [
          priceObservation({ id: 1, price_index_code: 'ERCOT_HB_HOUSTON_RT15M', observation_date: '2026-05-25', value: 24 }),
          priceObservation({ id: 2, price_index_code: 'ERCOT_HB_HOUSTON_RT15M', observation_date: '2026-05-24', value: 21 }),
          priceObservation({ id: 3, price_index_code: 'PJM_WEST_ONPEAK_DA', observation_date: '2026-05-25', value: 42, source_provider: 'EIA_WHOLESALE_POWER', source_series_id: 'PJM WH Real Time Peak' }),
          priceObservation({ id: 4, price_index_code: 'PJM_WEST_ONPEAK_DA', observation_date: '2026-05-24', value: 39, source_provider: 'EIA_WHOLESALE_POWER', source_series_id: 'PJM WH Real Time Peak' }),
        ],
        locations: [
          location(),
          location({
            code: 'PJM_WEST',
            name: 'PJM West',
            market: 'PJM',
            city: 'Pittsburgh',
            subdivision_code: 'US-PA',
            latitude: 40.4406,
            longitude: -79.9959,
            timezone: 'America/New_York',
          }),
        ],
        formatNumber: (value: number | null, digits = 2) => (value ?? 0).toFixed(digits),
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        formatDateOnly: (value: string | null | undefined) => value ?? 'n/a',
      }),
    )

    expect(markup).toContain('Average Price')
    expect(markup).toContain('USD 33.00 / MWH')
    expect(markup).toContain('class="report-prompt-price-map"')
    expect(markup).toContain('Power Price Index Lines')
    expect(markup).toContain('aria-label="Power price index legend"')
    expect(markup).toContain('ERCOT_HB_HOUSTON_RT15M')
    expect(markup).toContain('PJM_WEST_ONPEAK_DA')
    expect(markup).toContain('class="report-prompt-price-table"')
  })

  it('renders the Trading EOD tile alongside the reporting overview shell', () => {
    const markup = renderToStaticMarkup(
      createElement(ReportsWorkspace, {
        activeTrades: [],
        authSession: null,
        globalFilter: 'basis risk',
        counterpartyCreditReport: [],
        priceIndices: [],
        locations: [],
        portfolios: [],
        formatNumber: (value: number | null) => String(value ?? 0),
        formatMoney: (value: number | null) => `$${value ?? 0}`,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        formatDateOnly: (value: string | null | undefined) => value ?? 'n/a',
        onOpenPrompt: () => undefined,
        onOpenSettlement: () => undefined,
        onOpenTrade: () => undefined,
      }),
    )

    expect(markup).toContain('Reporting Overview')
    expect(markup).not.toContain('Report Prompt')
    expect(markup).not.toContain('Show me power prices in the US')
    expect(markup).toContain('Trading EOD')
    expect(markup).toContain('Draft Validator')
    expect(markup).toContain('Global Report Filter')
    expect(markup).toContain('Desk-wide end-of-day posture rolled up from pricing, workflow, settlement, projection-integrity, and accrual evidence.')
  })

  it('renders a Home-routed price report focus without the general report deck', () => {
    const routeHandoff = buildPriceIndexBiReportHandoff({
      priceIndexCode: 'HH_NATGAS',
      priceIndexName: 'Henry Hub Natural Gas',
      product: 'NATGAS',
      location: 'HENRY_HUB',
      dateTime: '05/25/2026',
      source: 'ICE · HH_NATGAS',
    })
    const markup = renderToStaticMarkup(
      createElement(ReportsWorkspace, {
        activeTrades: [],
        authSession: null,
        routeHandoff,
        globalFilter: '',
        counterpartyCreditReport: [],
        priceIndices: [],
        locations: [],
        portfolios: [],
        formatNumber: (value: number | null) => String(value ?? 0),
        formatMoney: (value: number | null) => `$${value ?? 0}`,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        formatDateOnly: (value: string | null | undefined) => value ?? 'n/a',
        onOpenPrompt: () => undefined,
        onOpenSettlement: () => undefined,
        onOpenTrade: () => undefined,
        onClearHandoff: () => undefined,
        onOpenPriceSourcesReview: () => undefined,
      }),
    )

    expect(resolvePriceIndexReportRouteFocus(routeHandoff)).toMatchObject({
      heroTitle: 'NATGAS, HENRY_HUB, ICE · HH_NATGAS',
      badgeLabel: 'Price Report',
      badgeDetail: 'Filtered to HH_NATGAS',
    })
    expect(
      buildPriceIndexBiReportHeroTitle({
        priceIndexCode: 'ERCOT_HB_HOUSTON_RT15M',
        priceIndexName: 'ERCOT Houston Real-Time Hub SPP',
        product: 'POWER',
        location: 'HB_HOUSTON',
        dateTime: '05/25/2026 12:00:00',
        source: 'ERCOT · HB_HOUSTON',
      }),
    ).toBe('POWER, HB_HOUSTON, ERCOT · HB_HOUSTON')
    expect(markup).toContain('Open Henry Hub Natural Gas price report')
    expect(markup).toContain('Home')
    expect(markup).toContain('Filter: HH_NATGAS')
    expect(markup).toContain('Price Report Tiles')
    expect(markup).toContain('NATGAS, HENRY_HUB, ICE · HH_NATGAS')
    expect(markup).toContain('Price Index News')
    expect(markup).toContain('Review Sources')
    expect(markup).toContain('Price observation history, range, source provenance, and freshness for the selected price index.')
    expect(markup).toContain('The selected price index has no loaded observations for the price report.')
    expect(markup).not.toContain('Workbook Data Sources')
    expect(markup).not.toContain('Trading EOD')
    expect(markup).not.toContain('Draft Validator')
  })
})
