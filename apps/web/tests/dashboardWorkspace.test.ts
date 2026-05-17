import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { DashboardWorkspace } from '../src/workspaces/dashboard/DashboardWorkspace'
import { buildDashboardInstrumentHandoff } from '../src/workspaces/dashboard/dashboardInstrumentBrief'

type DashboardWorkspaceProps = ComponentProps<typeof DashboardWorkspace>

function buildDashboardProps(overrides: Partial<DashboardWorkspaceProps> = {}): DashboardWorkspaceProps {
  return {
    authSession: null,
    routeHandoff: null,
    globalFilter: '',
    onOpenView: () => undefined,
    onOpenTrade: () => undefined,
    onClearHandoff: () => undefined,
    appLoading: false,
    activeTrades: [
      {
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
      },
    ],
    dashboardSummary: {
      positions: {
        gross_exposure: 1200,
        position_count: 1,
        bucket_count: 1,
        buckets: [
          {
            commodity_class: 'POWER',
            unit_label: 'MWh',
            net_volume: 1200,
            commodity_count: 1,
          },
        ],
        largest_bucket: {
          commodity_class: 'POWER',
          unit_label: 'MWh',
          net_volume: 1200,
        },
      },
      attention: {
        total_count: 2,
        confirmation_backlog_count: 1,
        nomination_backlog_count: 0,
        allocation_backlog_count: 0,
        invoice_backlog_count: 0,
        overdue_payment_count: 0,
        stale_pricing_count: 1,
        incomplete_ops_data_count: 0,
      },
    },
    priceIndices: [
      {
        code: 'ERCOT_DA',
        name: 'ERCOT Day Ahead',
        provider: 'ICE',
        unit_code: 'MWh',
        currency_code: 'USD',
        is_active: true,
        commodity_class: 'POWER',
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
    formatCommodityClass: (value: string) => value,
    formatMoney: (value: number | null) => (value == null ? '-' : `$${value.toFixed(0)}`),
    formatNumber: (value: number | null, digits = 0) => (value == null ? '-' : value.toFixed(digits)),
    formatDate: (value: string | null | undefined) => value ?? '-',
    ...overrides,
  }
}

describe('dashboard workspace', () => {
  test('renders the terminal-style market monitor tiles and fast paths', () => {
    const markup = renderToStaticMarkup(createElement(DashboardWorkspace, buildDashboardProps()))

    expect(markup).toContain('Market Monitor Strip')
    expect(markup).toContain('Market Monitor Board')
    expect(markup).toContain('Desk Headlines')
    expect(markup).toContain('Pricing gap on TRD-1001')
    expect(markup).toContain('Source: Trade TRD-1001')
    expect(markup).toContain('Watchlist Alerts')
    expect(markup).toContain('Save Watchlist')
    expect(markup).toContain('Pricing exceptions: 1 open')
    expect(markup).toContain('Instrument Brief')
    expect(markup).toContain('No instrument selected')
    expect(markup).toContain('Desk Priorities')
    expect(markup).toContain('Open Brief')
    expect(markup).toContain('Open Reports')
    expect(markup).toContain('Open Risk')
    expect(markup).toContain('Open Activity Feed')
  })

  test('renders a route-backed price-index instrument brief', () => {
    const markup = renderToStaticMarkup(
      createElement(
        DashboardWorkspace,
        buildDashboardProps({
          routeHandoff: buildDashboardInstrumentHandoff({
            kind: 'price_index',
            id: 'ERCOT_DA',
            label: 'ERCOT Day Ahead',
          }),
        }),
      ),
    )

    expect(markup).toContain('Price Index Brief')
    expect(markup).toContain('ERCOT Day Ahead')
    expect(markup).toContain('Related Trades')
    expect(markup).toContain('TRD-1001')
    expect(markup).toContain('Open Reference Data')
    expect(markup).toContain('Clear Brief')
  })
})
