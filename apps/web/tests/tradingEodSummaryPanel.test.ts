import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TradingEodSummaryPanel } from '../src/workspaces/reports/TradingEodSummaryPanel'
import type { TradingEodReport } from '../src/shared/models'

const sampleTradingEodReport: TradingEodReport = {
  generated_at: '2026-04-06T23:59:59Z',
  business_date: '2026-04-06',
  as_of: '2026-04-06',
  evaluation_timestamp: '2026-04-06T23:59:59Z',
  basis:
    'Trading EOD combines current trade, workflow, settlement, projection-integrity, accrual, and P&L evidence.',
  status: 'BLOCKED',
  blocked_check_count: 1,
  warning_check_count: 2,
  ready_check_count: 1,
  checks: [
    {
      key: 'pricing_readiness',
      title: 'Pricing readiness',
      status: 'WARNING',
      owner_role: 'Desk Lead',
      reason: '2 active trade(s) remain in pending pricing.',
      supporting_metrics: {
        active_trade_count: 4,
        pending_pricing_count: 2,
      },
    },
    {
      key: 'settlement_posture',
      title: 'Settlement posture',
      status: 'BLOCKED',
      owner_role: 'Settlement Lead',
      reason: '1 blocked settlement exception remains.',
      supporting_metrics: {
        blocked_exception_count: 1,
        overdue_invoice_count: 3,
      },
    },
  ],
  coverage_notes: [
    'Trade, workflow, projection-integrity, and accrual sections currently reflect live projections.',
  ],
  trade_summary: {
    active_trade_count: 4,
    priced_active_count: 2,
    pending_pricing_count: 2,
    pending_settlement_count: 1,
    tracked_book_count: 2,
    total_active_volume: 125000,
  },
  pnl_summary: {
    basis: 'Marked to model',
    methodology: 'CURRENT_SUPPORTED_VALUATION',
    total_pnl: 152500,
    realized_pnl: 50000,
    unrealized_pnl: 102500,
    priced_trade_count: 2,
    realized_trade_count: 1,
    unrealized_trade_count: 1,
  },
  operations_summary: {
    open_work_item_count: 5,
    operations_queue_count: 3,
    settlement_queue_count: 2,
    attention_count: 1,
    stale_pricing_count: 0,
    incomplete_ops_data_count: 0,
  },
  settlement_summary: {
    invoice_count: 3,
    overdue_invoice_count: 3,
    disputed_invoice_count: 1,
    blocked_exception_count: 1,
    warning_exception_count: 2,
    payment_due_count: 1,
    invoice_pending_count: 1,
  },
  projection_summary: {
    structural_issue_count: 1,
    invariant_issue_count: 0,
    impacted_trade_count: 2,
  },
  accrual_summary: {
    row_count: 2,
    lot_count: 1,
    unbilled_amount_total: 5000,
    billed_uncollected_amount_total: 1000,
    net_open_amount_total: 6000,
    coverage_basis: 'Live accrual lots',
  },
}

describe('TradingEodSummaryPanel', () => {
  it('renders desk-wide close posture, check ownership, and coverage notes', () => {
    const markup = renderToStaticMarkup(
      createElement(TradingEodSummaryPanel, {
        report: sampleTradingEodReport,
        hasGlobalFilter: true,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        formatDateOnly: (value: string | null | undefined) => value ?? 'n/a',
        formatMoney: (value: number | null) => `$${value ?? 0}`,
        formatNumber: (value: number | null) => String(value ?? 0),
        onOpenPrompt: () => undefined,
        onOpenSettlement: () => undefined,
      }),
    )

    expect(markup).toContain('Business Date 2026-04-06')
    expect(markup).toContain('This desk-wide close posture does not narrow to the active global report filter.')
    expect(markup).toContain('BLOCKED')
    expect(markup).toContain('Pricing readiness')
    expect(markup).toContain('Settlement Lead')
    expect(markup).toContain('Open Settlement')
    expect(markup).toContain('Coverage Note 1')
  })
})
