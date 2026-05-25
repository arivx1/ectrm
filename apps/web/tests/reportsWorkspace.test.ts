import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/workspaces/reports/settlementReportTiles.tsx', () => ({
  buildSettlementReportTiles: () => [],
}))

vi.mock('../src/workspaces/reports/useSettlementReportLens.ts', () => ({
  useSettlementReportLens: () => ({}),
}))

import { ReportsWorkspace } from '../src/workspaces/reports/ReportsWorkspace'
import { buildPriceIndexBiReportHandoff } from '../src/workspaces/reports/reportRouteHandoffs'

describe('ReportsWorkspace', () => {
  it('renders the Trading EOD tile alongside the reporting overview shell', () => {
    const markup = renderToStaticMarkup(
      createElement(ReportsWorkspace, {
        activeTrades: [],
        authSession: null,
        globalFilter: 'basis risk',
        counterpartyCreditReport: [],
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
    expect(markup).toContain('Trading EOD')
    expect(markup).toContain('Draft Validator')
    expect(markup).toContain('Global Report Filter')
    expect(markup).toContain('Desk-wide end-of-day posture rolled up from pricing, workflow, settlement, projection-integrity, and accrual evidence.')
  })

  it('renders a Home-routed price BI report focus', () => {
    const markup = renderToStaticMarkup(
      createElement(ReportsWorkspace, {
        activeTrades: [],
        authSession: null,
        routeHandoff: buildPriceIndexBiReportHandoff({
          priceIndexCode: 'HH_NATGAS',
          priceIndexName: 'Henry Hub Natural Gas',
        }),
        globalFilter: '',
        counterpartyCreditReport: [],
        portfolios: [],
        formatNumber: (value: number | null) => String(value ?? 0),
        formatMoney: (value: number | null) => `$${value ?? 0}`,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        formatDateOnly: (value: string | null | undefined) => value ?? 'n/a',
        onOpenPrompt: () => undefined,
        onOpenSettlement: () => undefined,
        onOpenTrade: () => undefined,
        onClearHandoff: () => undefined,
      }),
    )

    expect(markup).toContain('Open Henry Hub Natural Gas price BI report')
    expect(markup).toContain('Home')
    expect(markup).toContain('Filter: HH_NATGAS')
    expect(markup).toContain('Price BI Report · HH_NATGAS')
    expect(markup).toContain('Price observation history, range, source provenance, and freshness for the selected price index.')
    expect(markup).toContain('The selected price index has no loaded observations for the price BI report.')
  })
})
