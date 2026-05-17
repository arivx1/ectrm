import assert from 'node:assert/strict'
import { describe, expect, test } from 'vitest'

import { resolveTerminalCommandSearchState } from '../src/entities/app/terminalCommandSearch'
import type { CounterpartyRecord, PriceIndexRecord, ReferenceRecord, Trade } from '../src/shared/models'

const SAMPLE_TRADES: Trade[] = [
  {
    trade_id: 'TRD-1001',
    originating_option_trade_id: null,
    external_trade_id: 'EXT-1001',
    source_system: 'Trayport',
    created_at: '2026-05-15T12:00:00Z',
    updated_at: '2026-05-16T08:00:00Z',
    execution_timestamp: '2026-05-15T12:00:00Z',
    trade_date: '2026-05-15',
    effective_start_date: '2026-06-01',
    effective_end_date: '2026-06-30',
    quality_spec: null,
    unit_of_measure: 'MMBtu',
    trade_currency_code: 'USD',
    location_code: 'HSC',
    delivery_start: '2026-06-01',
    delivery_end: '2026-06-30',
    price_unit_code: 'USD/MMBtu',
    instrument_type: 'SWAP',
    option_type: null,
    option_style: null,
    option_strike_price: null,
    option_expiration_date: null,
    trade_nature: 'PHYSICAL',
    trade_structure: 'SINGLE',
    trade_side: 'BUY',
    book: 'GAS-NA',
    portfolio: 'TERM',
    counterparty: 'SHELL',
    commodity_class: 'GAS',
    commodity: 'HENRY HUB GAS',
    pricing_type: 'FLOATING',
    pricing_status: 'PENDING',
    confirmation_status: 'PENDING',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    actualization_status: 'PENDING',
    price_index_code: 'HENRY_DA',
    price: null,
    volume: 25000,
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    trader_user: 'trader-1',
    status: 'ACTIVE',
    last_event_id: 'evt-1001',
  },
]

const SAMPLE_COUNTERPARTIES: CounterpartyRecord[] = [
  {
    code: 'SHELL',
    name: 'Shell Energy North America',
    description: 'Natural gas counterparty',
    is_active: true,
    counterparty_type: 'ENERGY_MARKETER',
    short_name: 'Shell',
    legal_entity_name: 'Shell Energy North America (US), L.P.',
    country_code: 'US',
    ticker_symbol: 'SHEL',
    credit_status: 'APPROVED',
  },
]

const SAMPLE_COMMODITIES: ReferenceRecord[] = [
  {
    code: 'HH_GAS',
    name: 'Henry Hub Gas',
    description: 'US natural gas benchmark',
    commodity_class: 'GAS',
    is_active: true,
  },
]

const SAMPLE_PRICE_INDICES: PriceIndexRecord[] = [
  {
    code: 'HENRY_DA',
    name: 'Henry Hub Daily',
    description: 'Henry Hub daily midpoint',
    is_active: true,
    commodity_code: 'HH_GAS',
    currency_code: 'USD',
    unit_code: 'MMBTU',
    provider: 'ICE',
    market: 'Henry Hub',
    location_code: 'HSC',
  },
]

describe('terminal command search', () => {
  test('shows featured navigation groups before the user starts typing', () => {
    const state = resolveTerminalCommandSearchState({
      query: '',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(state.status).toBe('results')
    if (state.status !== 'results') {
      return
    }

    expect(state.groups.map((group) => group.label)).toEqual(['Workspaces', 'Reports', 'Trades'])
    expect(state.groups[0]?.results[0]?.title).toBeTruthy()
    expect(state.groups[1]?.results[0]?.title).toBe('Reporting Overview')
    expect(state.groups[2]?.results[0]?.title).toBe('TRD-1001')
  })

  test('routes trade lookups into trade navigation with a terminal handoff', () => {
    const state = resolveTerminalCommandSearchState({
      query: 'trade: TRD-1001',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(state.status).toBe('results')
    if (state.status !== 'results') {
      return
    }

    const result = state.groups[0]?.results[0]
    assert.ok(result)
    expect(result.action.kind).toBe('trade')
    if (result.action.kind !== 'trade') {
      return
    }
    expect(result.action.tradeId).toBe('TRD-1001')
    expect(result.action.handoff.source).toBe('terminal')
    expect(result.action.handoff.focus.type).toBe('trade')
  })

  test('routes counterparty lookups into governed reference-data navigation', () => {
    const state = resolveTerminalCommandSearchState({
      query: 'cp: shell',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(state.status).toBe('results')
    if (state.status !== 'results') {
      return
    }

    const result = state.groups[0]?.results[0]
    assert.ok(result)
    expect(result.title).toBe('Shell Energy North America')
    expect(result.action.kind).toBe('reference_record')
    if (result.action.kind !== 'reference_record') {
      return
    }
    expect(result.action.referenceTab).toBe('counterparties')
    expect(result.action.recordCode).toBe('SHELL')
    expect(result.action.handoff.source).toBe('terminal')
    expect(result.action.handoff.focus.type).toBe('reference_record')
  })

  test('keeps mutation-like input out of terminal search actions', () => {
    const state = resolveTerminalCommandSearchState({
      query: 'book shell basis swap',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(state).toEqual({
      status: 'unsupported',
      title: 'Terminal search is navigation only',
      detail:
        '"book" looks like a business action. Use terminal search to open the right workspace or record first, then make the change there.',
      scope: null,
    })
  })

  test('routes report lookups into anchored report modules', () => {
    const state = resolveTerminalCommandSearchState({
      query: 'report: credit',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(state.status).toBe('results')
    if (state.status !== 'results') {
      return
    }

    const result = state.groups[0]?.results[0]
    assert.ok(result)
    expect(result.title).toBe('Counterparty Credit Report')
    expect(result.action.kind).toBe('view')
    if (result.action.kind !== 'view') {
      return
    }
    expect(result.action.view).toBe('reports')
    expect(result.action.hash).toBe('reports-credit')
    expect(result.action.handoff?.source).toBe('terminal')
  })

  test('routes workspace and price-index lookups with safe terminal handoffs', () => {
    const workspaceState = resolveTerminalCommandSearchState({
      query: 'workspace: live desk',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(workspaceState.status).toBe('results')
    if (workspaceState.status !== 'results') {
      return
    }

    const workspaceResult = workspaceState.groups[0]?.results[0]
    assert.ok(workspaceResult)
    expect(workspaceResult.title).toBe('Live Desk')
    expect(workspaceResult.action).toEqual({
      kind: 'view',
      view: 'dashboard',
      handoff: null,
    })

    const priceIndexState = resolveTerminalCommandSearchState({
      query: 'px: henry',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(priceIndexState.status).toBe('results')
    if (priceIndexState.status !== 'results') {
      return
    }

    const priceIndexResult = priceIndexState.groups[0]?.results[0]
    assert.ok(priceIndexResult)
    expect(priceIndexResult.title).toBe('Henry Hub Daily')
    expect(priceIndexResult.action.kind).toBe('reference_record')
    if (priceIndexResult.action.kind !== 'reference_record') {
      return
    }
    expect(priceIndexResult.action.recordKind).toBe('price_index')
    expect(priceIndexResult.action.referenceTab).toBe('price-indices')
    expect(priceIndexResult.action.recordCode).toBe('HENRY_DA')
    expect(priceIndexResult.action.handoff).toMatchObject({
      source: 'terminal',
      focus: {
        type: 'reference_record',
        id: 'HENRY_DA',
        label: 'Henry Hub Daily',
      },
      filter: 'HENRY_DA',
    })
  })

  test('blocks terminal-mode mutation verbs even when they look like layout or watchlist commands', () => {
    const state = resolveTerminalCommandSearchState({
      query: 'save market overview watchlist',
      isLoading: false,
      trades: SAMPLE_TRADES,
      counterparties: SAMPLE_COUNTERPARTIES,
      commodities: SAMPLE_COMMODITIES,
      priceIndices: SAMPLE_PRICE_INDICES,
    })

    expect(state).toEqual({
      status: 'unsupported',
      title: 'Terminal search is navigation only',
      detail:
        '"save" looks like a business action. Use terminal search to open the right workspace or record first, then make the change there.',
      scope: null,
    })
  })

  test('returns a loading state when data-backed scopes are still hydrating', () => {
    const state = resolveTerminalCommandSearchState({
      query: 'trade: TRD-1001',
      isLoading: true,
      trades: [],
      counterparties: [],
      commodities: [],
      priceIndices: [],
    })

    expect(state).toEqual({
      status: 'loading',
      title: 'Loading terminal search',
      detail:
        'Trades and reference records are still syncing into the command catalog. Try the same lookup again in a moment.',
      scope: 'trade',
    })
  })
})
