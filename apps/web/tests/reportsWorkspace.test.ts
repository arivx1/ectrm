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
})
