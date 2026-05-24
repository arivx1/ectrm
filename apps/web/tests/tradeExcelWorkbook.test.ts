import { describe, expect, it } from 'vitest'

import {
  buildTradeExcelRows,
  buildTradeWorkbookBlob,
  suggestedTradeWorkbookFilename,
  type TradeExcelSource,
} from '../src/features/trades/tradeExcelWorkbook'

const baseTrade: TradeExcelSource = {
  trade_id: 'TRD-1001',
  originating_option_trade_id: null,
  external_trade_id: 'EXT-99',
  source_system: 'ETRM',
  execution_timestamp: '2026-05-23T10:15:00Z',
  trade_date: '2026-05-23',
  effective_start_date: '2026-06-01',
  effective_end_date: '2026-06-30',
  quality_spec: 'Pipeline',
  unit_of_measure: 'MMBtu',
  trade_currency_code: 'USD',
  location_code: 'HSC',
  delivery_start: '2026-06-01',
  delivery_end: '2026-06-30',
  price_unit_code: 'USD/MMBtu',
  instrument_type: 'LINEAR',
  option_type: null,
  option_style: null,
  option_strike_price: null,
  option_expiration_date: null,
  trade_nature: 'PHYSICAL',
  trade_structure: 'SINGLE',
  trade_side: 'BUY',
  book: 'WEST_POWER',
  portfolio: 'PJM',
  counterparty: 'CP-1',
  commodity_class: 'NATURAL_GAS',
  commodity: 'WAHA & HSC Gas',
  pricing_type: 'FIXED',
  pricing_status: 'PRICED',
  confirmation_status: 'PENDING',
  nomination_status: 'PENDING',
  allocation_status: 'NOT_REQUIRED',
  actualization_status: 'PENDING',
  price_index_code: null,
  price: 3.45,
  volume: 10000,
  invoice_status: 'PENDING',
  payment_status: 'PENDING',
  settlement_status: 'PENDING',
  trader_user: 'avery',
  status: 'ACTIVE',
  updated_at: '2026-05-23T10:30:00Z',
  credit_approval_status: 'APPROVED',
  credit_hold_active: false,
  credit_hold_reason: null,
  active_credit_exception: null,
  pretrade_review_id: 12,
  pretrade_recommendation_run_id: 34,
}

describe('trade Excel workbook', () => {
  it('maps the current trade projection into labeled worksheet rows', () => {
    const rows = buildTradeExcelRows(baseTrade)

    expect(rows).toContainEqual({ label: 'Trade ID', value: 'TRD-1001' })
    expect(rows).toContainEqual({ label: 'Commodity', value: 'WAHA & HSC Gas' })
    expect(rows).toContainEqual({ label: 'Price', value: 3.45 })
    expect(rows).toContainEqual({ label: 'Volume', value: 10000 })
    expect(rows).toContainEqual({ label: 'Pre-Trade Review ID', value: 12 })
  })

  it('builds an Excel workbook archive entirely in the browser format', async () => {
    const blob = buildTradeWorkbookBlob(baseTrade, new Date('2026-05-23T12:00:00Z'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const decoded = new TextDecoder().decode(bytes)

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(decoded).toContain('xl/worksheets/sheet1.xml')
    expect(decoded).toContain('Trade Details')
    expect(decoded).toContain('Trade ID')
    expect(decoded).toContain('TRD-1001')
    expect(decoded).toContain('WAHA &amp; HSC Gas')
  })

  it('suggests a filesystem-safe workbook name from the trade id', () => {
    expect(suggestedTradeWorkbookFilename(' TRD/1001 ')).toBe('TRD-1001-trade-details.xlsx')
  })
})
