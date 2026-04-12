import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import type {
  CounterpartyRecord,
  CurrencyRecord,
  EventRow,
  ExternalDataRunRecord,
  LocationRecord,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  TradingSourceRecord,
  UnitRecord,
} from '../src/shared/models.ts'

const { fetchJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
}))

vi.mock('../src/shared/config.ts', () => ({
  bootstrapQueryLimits: {
    events: 100,
    workspaceRecords: 250,
    selectedTradeEvents: 500,
    referenceData: 2000,
    externalDataRuns: 10,
    tradingSources: 500,
  },
}))

import {
  loadAdminWorkspaceBootstrap,
  loadCoreWorkspaceBootstrap,
  loadDeliveriesWorkspaceBootstrap,
  loadDeliveriesWindow,
  loadEventsWorkspaceBootstrap,
  loadOptionExposuresWindow,
  loadPositionsWorkspaceBootstrap,
  loadPositionsWindow,
  loadTradeConfirmationsWindow,
  loadTradeInvoicesWindow,
  loadTradeMetadata,
  loadTradePaymentsWindow,
  loadTradeWorkflowItemsWindow,
  loadTradesWindow,
  loadTradesWorkspaceBootstrap,
  loadOperationsWorkspaceBootstrap,
  loadReferenceWorkspaceBootstrap,
  loadRiskWorkspaceBootstrap,
  loadSettlementWorkspaceBootstrap,
} from '../src/entities/app/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
})

const authenticatedReadOptions = {
  readHeaders: {
    Authorization: 'Bearer test-token',
  },
}

function makeStringRows(key: string, prefix: string, count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    [key]: `${prefix}-${start + index}`,
  }))
}

function makeNumberRows(key: string, count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    [key]: start + index,
  }))
}

const bootstrapEventRow: EventRow = {
  event_id: '1',
  aggregate_type: 'TRADE',
  aggregate_id: 'T-1',
  event_type: 'TRADE_CAPTURED',
  occurred_at: '2026-04-10T00:00:00Z',
  recorded_at: '2026-04-10T00:00:00Z',
  actor_id: 'ops.user',
  correlation_id: null,
  causation_id: null,
  schema_version: 1,
  payload: {},
}

const bootstrapBook: ReferenceRecord = {
  code: 'BOOK-1',
  name: 'Prompt Book',
  is_active: true,
}

const bootstrapCommodity: ReferenceRecord = {
  code: 'POWER',
  name: 'Power',
  is_active: true,
  commodity_class: 'POWER',
}

const bootstrapPriceIndex: PriceIndexRecord = {
  code: 'PJM_DA',
  name: 'PJM Day Ahead',
  is_active: true,
  commodity_class: 'POWER',
  commodity_code: 'POWER',
  currency_code: 'USD',
  unit_code: 'MWH',
  provider: 'INTERNAL',
}

const bootstrapCurrency: CurrencyRecord = {
  code: 'USD',
  name: 'US Dollar',
  is_active: true,
  symbol: '$',
}

const bootstrapUnit: UnitRecord = {
  code: 'MWH',
  name: 'Megawatt Hour',
  is_active: true,
  commodity_class: 'POWER',
  dimension: 'ENERGY',
  precision: 3,
}

const bootstrapLocation: LocationRecord = {
  code: 'PJM-WEST',
  name: 'PJM West Hub',
  is_active: true,
  location_kind: 'POINT',
  location_type: 'HUB',
  market: 'PJM',
}

const bootstrapCounterparty: CounterpartyRecord = {
  code: 'CP-1',
  name: 'Counterparty One',
  is_active: true,
  counterparty_type: 'UTILITY',
  credit_status: 'APPROVED',
}

const bootstrapPortfolio: PortfolioRecord = {
  code: 'PTF-1',
  name: 'Prompt Power',
  is_active: true,
  book_code: 'BOOK-1',
}

const bootstrapExternalDataRun: ExternalDataRunRecord = {
  id: 101,
  provider: 'EIA',
  job_name: 'sync_eia_price_data',
  status: 'SUCCEEDED',
  started_at: '2026-04-06T00:00:00Z',
  finished_at: '2026-04-06T00:05:00Z',
  requested_by: 'system',
  series_count: 42,
  observation_count: 128,
  error_summary: null,
  created_at: '2026-04-06T00:00:00Z',
}

const bootstrapTradingSource: TradingSourceRecord = {
  source_id: 'SRC-1',
  source_name: 'Desk Source',
  source_category: 'MARKET_DATA',
  dataset_name: 'Prompt Curves',
  business_purpose: 'Trading',
  asset_classes: 'Power',
  products_or_regions: 'PJM',
  system_owner: 'Ops',
  business_owner: 'Trading',
  vendor_or_origin: 'Internal',
  golden_source: 'Yes',
  fallback_source: 'No',
  update_frequency: 'Hourly',
  delivery_pattern: 'Push',
  latency_requirement: 'Near real time',
  retention_requirement: 'Seven years',
  storage_pattern: 'Warehouse',
  schema_owner: 'Data Platform',
  quality_checks: 'Schema validation',
  reconciliation_method: 'Daily compare',
  usage_scope: 'Desk',
  criticality: 'High',
  license_type: 'Internal',
  license_restrictions: 'None',
  entitlements_required: 'Trader',
  cost_model: 'Allocated',
  sensitivity_class: 'Internal',
  availability_slo: '99.9%',
  incident_runbook: 'runbook://desk-source',
  monitoring_metrics: 'freshness, latency',
  lineage_notes: 'Loaded from internal ETL',
  last_reviewed_at: '2026-04-01',
  status: 'ACTIVE',
}

test('loadCoreWorkspaceBootstrap fetches only the shell-critical datasets', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/health')) {
      return { status: 'ok' }
    }
    if (url.endsWith('/operations/workspace-summary')) {
      return {
        generated_at: '2026-04-10T00:00:00Z',
        trades: {
          total_count: 12,
          active_count: 9,
          priced_active_count: 7,
          pending_pricing_count: 2,
          pending_settlement_count: 5,
          tracked_book_count: 3,
          total_active_volume: 4200,
        },
        positions: { total_count: 4 },
        option_exposures: { total_count: 2 },
        deliveries: { total_count: 3 },
        confirmations: { total_count: 6 },
        work_items: {
          total_count: 8,
          operations_queue_count: 5,
          settlement_queue_count: 3,
        },
        invoices: { total_count: 4 },
        payments: { total_count: 2 },
        dashboard: {
          positions: {
            gross_exposure: 4200,
            position_count: 4,
            bucket_count: 2,
            buckets: [
              {
                commodity_class: 'CRUDE_OIL',
                unit_label: 'BBL',
                net_volume: 3200,
                commodity_count: 3,
              },
              {
                commodity_class: 'POWER',
                unit_label: 'MWH',
                net_volume: -1000,
                commodity_count: 1,
              },
            ],
            largest_bucket: {
              commodity_class: 'CRUDE_OIL',
              unit_label: 'BBL',
              net_volume: 3200,
              commodity_count: 3,
            },
          },
          attention: {
            total_count: 4,
            confirmation_backlog_count: 1,
            nomination_backlog_count: 1,
            allocation_backlog_count: 0,
            invoice_backlog_count: 1,
            overdue_payment_count: 0,
            stale_pricing_count: 0,
            incomplete_ops_data_count: 1,
          },
        },
        settlement: {
          open_work_item_count: 3,
          invoice_pending_count: 1,
          payment_due_count: 2,
          settled_count: 4,
          trade_exception_count: 1,
          workflow_exception_count: 1,
          breakdown: [
            { status: 'PENDING', count: 2 },
            { status: 'INVOICED', count: 3 },
            { status: 'SETTLED', count: 4 },
          ],
        },
      }
    }
    if (url.endsWith('/operations/resources')) {
      return [
        {
          resource_key: 'confirmations',
          filters: ['trade_id'],
          sort_fields: ['created_at desc', 'id desc'],
          actions: ['create', 'update', 'issue', 'record_response'],
        },
        {
          resource_key: 'work_items',
          filters: ['queue', 'include_closed', 'trade_id'],
          sort_fields: ['attention_rank'],
          actions: ['create', 'update', 'book_underlying'],
        },
      ]
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const payload = await loadCoreWorkspaceBootstrap('https://example.test/api', authenticatedReadOptions)

  assert.deepEqual(payload, {
    health: { status: 'ok' },
    operationalResourceDescriptors: [
      {
        resource_key: 'confirmations',
        filters: ['trade_id'],
        sort_fields: ['created_at desc', 'id desc'],
        actions: ['create', 'update', 'issue', 'record_response'],
      },
      {
        resource_key: 'work_items',
        filters: ['queue', 'include_closed', 'trade_id'],
        sort_fields: ['attention_rank'],
        actions: ['create', 'update', 'book_underlying'],
      },
    ],
    workspaceSummary: {
      generated_at: '2026-04-10T00:00:00Z',
      trades: {
        total_count: 12,
        active_count: 9,
        priced_active_count: 7,
        pending_pricing_count: 2,
        pending_settlement_count: 5,
        tracked_book_count: 3,
        total_active_volume: 4200,
      },
      positions: { total_count: 4 },
      option_exposures: { total_count: 2 },
      deliveries: { total_count: 3 },
      confirmations: { total_count: 6 },
      work_items: {
        total_count: 8,
        operations_queue_count: 5,
        settlement_queue_count: 3,
      },
      invoices: { total_count: 4 },
      payments: { total_count: 2 },
      dashboard: {
        positions: {
          gross_exposure: 4200,
          position_count: 4,
          bucket_count: 2,
          buckets: [
            {
              commodity_class: 'CRUDE_OIL',
              unit_label: 'BBL',
              net_volume: 3200,
              commodity_count: 3,
            },
            {
              commodity_class: 'POWER',
              unit_label: 'MWH',
              net_volume: -1000,
              commodity_count: 1,
            },
          ],
          largest_bucket: {
            commodity_class: 'CRUDE_OIL',
            unit_label: 'BBL',
            net_volume: 3200,
            commodity_count: 3,
          },
        },
        attention: {
          total_count: 4,
          confirmation_backlog_count: 1,
          nomination_backlog_count: 1,
          allocation_backlog_count: 0,
          invoice_backlog_count: 1,
          overdue_payment_count: 0,
          stale_pricing_count: 0,
          incomplete_ops_data_count: 1,
        },
      },
      settlement: {
        open_work_item_count: 3,
        invoice_pending_count: 1,
        payment_due_count: 2,
        settled_count: 4,
        trade_exception_count: 1,
        workflow_exception_count: 1,
        breakdown: [
          { status: 'PENDING', count: 2 },
          { status: 'INVOICED', count: 3 },
          { status: 'SETTLED', count: 4 },
        ],
      },
    },
  })
  assert.deepEqual(
    fetchJsonMock.mock.calls.map((call) => call[0]),
    [
      'https://example.test/api/health',
      'https://example.test/api/operations/workspace-summary',
      'https://example.test/api/operations/resources',
    ],
  )
})

test('loadTradeMetadata fetches the server-owned trade contract through typed helpers', async () => {
  fetchJsonMock.mockResolvedValue({
    contract_version: 1,
    vocabulary: {
      trade_natures: ['PHYSICAL', 'FINANCIAL'],
      instrument_types: ['LINEAR', 'OPTION'],
      trade_structures: ['SINGLE', 'SWAP'],
      trade_sides: ['BUY', 'SELL'],
      trade_statuses: ['ACTIVE', 'CANCELLED'],
      option_types: ['CALL', 'PUT'],
      option_styles: ['AMERICAN', 'EUROPEAN'],
      option_lifecycle_event_types: ['OptionAssigned', 'OptionExercised', 'OptionExpired'],
      pricing_types: ['FIXED', 'INDEX', 'HYBRID'],
      pricing_statuses: ['PENDING', 'PRICED'],
      confirmation_statuses: ['PENDING', 'CONFIRMED'],
      nomination_statuses: ['NOT_REQUIRED', 'PENDING'],
      allocation_statuses: ['NOT_REQUIRED', 'PENDING'],
      actualization_statuses: ['NOT_REQUIRED', 'PENDING'],
      invoice_statuses: ['NOT_REQUIRED', 'PENDING'],
      payment_statuses: ['PENDING', 'PAID'],
      settlement_statuses: ['PENDING', 'SETTLED'],
      credit_approval_statuses: ['PENDING_REVIEW', 'APPROVED'],
      option_settlement_statuses: ['PENDING', 'BOOKED'],
    },
    defaults: {
      source_system: 'SERVER',
      instrument_type: 'LINEAR',
      trade_nature: 'PHYSICAL',
      trade_structure: 'SINGLE',
      trade_side: 'BUY',
      trade_status: 'ACTIVE',
      pricing_type: 'FIXED',
      pricing_status: 'PENDING',
      settlement_status: 'PENDING',
      option_style: 'AMERICAN',
      workflow_statuses_by_trade_nature: {
        PHYSICAL: {
          confirmation_status: 'PENDING',
          nomination_status: 'PENDING',
          allocation_status: 'PENDING',
          actualization_status: 'PENDING',
          invoice_status: 'PENDING',
          payment_status: 'PENDING',
        },
      },
    },
    rules: {
      pricing_types_requiring_price_index: ['INDEX', 'HYBRID'],
      pricing_types_requiring_explicit_price: ['FIXED', 'HYBRID'],
      trade_structures_requiring_top_level_volume: ['SINGLE'],
      option_allowed_instrument_type: 'OPTION',
      option_required_trade_nature: 'FINANCIAL',
      option_required_trade_structure: 'SINGLE',
      option_required_pricing_type: 'FIXED',
      option_lifecycle_event_to_status: {
        OptionAssigned: 'ASSIGNED',
      },
    },
  })

  const payload = await loadTradeMetadata('https://example.test/api', authenticatedReadOptions)

  assert.equal(payload.contract_version, 1)
  assert.equal(payload.defaults.source_system, 'SERVER')
  assert.deepEqual(payload.vocabulary.instrument_types, ['LINEAR', 'OPTION'])
  assert.deepEqual(payload.rules.pricing_types_requiring_price_index, ['INDEX', 'HYBRID'])
  assert.deepEqual(fetchJsonMock.mock.calls, [
    [
      'https://example.test/api/trades/metadata',
      {
        cache: 'no-store',
        headers: authenticatedReadOptions.readHeaders,
      },
    ],
  ])
})

test('loadCoreWorkspaceBootstrap tolerates workspace summary failures', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/health')) {
      return { status: 'ok' }
    }
    if (url.endsWith('/operations/workspace-summary')) {
      throw new Error('summary unavailable')
    }
    if (url.endsWith('/operations/resources')) {
      return []
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const payload = await loadCoreWorkspaceBootstrap('https://example.test/api', authenticatedReadOptions)

  assert.equal(payload.workspaceSummary, null)
  assert.deepEqual(payload.operationalResourceDescriptors, [])
})

test('loadCoreWorkspaceBootstrap tolerates operational resource descriptor failures', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/health')) {
      return { status: 'ok' }
    }
    if (url.endsWith('/operations/workspace-summary')) {
      return {
        generated_at: '2026-04-10T00:00:00Z',
        trades: {
          total_count: 0,
          active_count: 0,
          priced_active_count: 0,
          pending_pricing_count: 0,
          pending_settlement_count: 0,
          tracked_book_count: 0,
          total_active_volume: 0,
        },
        positions: { total_count: 0 },
        option_exposures: { total_count: 0 },
        deliveries: { total_count: 0 },
        confirmations: { total_count: 0 },
        work_items: {
          total_count: 0,
          operations_queue_count: 0,
          settlement_queue_count: 0,
        },
        invoices: { total_count: 0 },
        payments: { total_count: 0 },
        dashboard: {
          positions: {
            gross_exposure: 0,
            position_count: 0,
            bucket_count: 0,
            buckets: [],
            largest_bucket: null,
          },
          attention: {
            total_count: 0,
            confirmation_backlog_count: 0,
            nomination_backlog_count: 0,
            allocation_backlog_count: 0,
            invoice_backlog_count: 0,
            overdue_payment_count: 0,
            stale_pricing_count: 0,
            incomplete_ops_data_count: 0,
          },
        },
        settlement: {
          open_work_item_count: 0,
          invoice_pending_count: 0,
          payment_due_count: 0,
          settled_count: 0,
          trade_exception_count: 0,
          workflow_exception_count: 0,
          breakdown: [],
        },
      }
    }
    if (url.endsWith('/operations/resources')) {
      throw new Error('resources unavailable')
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const payload = await loadCoreWorkspaceBootstrap('https://example.test/api', authenticatedReadOptions)

  assert.deepEqual(payload.operationalResourceDescriptors, [])
  assert.equal(payload.workspaceSummary?.trades.total_count, 0)
})

test('loadCoreWorkspaceBootstrap keeps anonymous bootstrap public-only', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/health')) {
      return { status: 'ok' }
    }

    throw new Error(`Unexpected URL: ${url}`)
  })

  const payload = await loadCoreWorkspaceBootstrap('https://example.test/api')

  assert.deepEqual(payload, {
    health: { status: 'ok' },
    workspaceSummary: null,
    operationalResourceDescriptors: [],
  })
  assert.deepEqual(fetchJsonMock.mock.calls.map((call) => call[0]), ['https://example.test/api/health'])
})

test('split core workspace loaders fetch trades, events, and positions on demand', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/trades?limit=251')) {
      return [{ trade_id: 'T-1' }]
    }
    if (url.endsWith('/events?limit=100')) {
      return [bootstrapEventRow]
    }
    if (url.endsWith('/positions?limit=251')) {
      return [{ commodity: 'PWR' }]
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const [trades, events, positions] = await Promise.all([
    loadTradesWorkspaceBootstrap('https://example.test/api'),
    loadEventsWorkspaceBootstrap('https://example.test/api'),
    loadPositionsWorkspaceBootstrap('https://example.test/api'),
  ])

  assert.deepEqual(trades, {
    trades: [{ trade_id: 'T-1' }],
    tradesWindow: { loadedCount: 1, hasMore: false },
  })
  assert.deepEqual(events, {
    events: [bootstrapEventRow],
  })
  assert.deepEqual(positions, {
    positions: [{ commodity: 'PWR' }],
    positionsWindow: { loadedCount: 1, hasMore: false },
  })

  const firstEvent: EventRow = events.events[0]!
  assert.equal(firstEvent.event_type, 'TRADE_CAPTURED')
})

test('workspace loaders apply bounded bootstrap windows to large operational datasets', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    const responses = new Map<string, unknown>([
      ['https://example.test/api/option-exposures?limit=251', [{ trade_id: 'OPT-1' }]],
      ['https://example.test/api/deliveries?limit=251', [{ delivery_id: 'DLV-1' }]],
      ['https://example.test/api/confirmations?limit=251', [{ confirmation_id: 1 }]],
      ['https://example.test/api/operations/work-items?queue=operations&limit=251', [{ item_id: 1 }]],
      ['https://example.test/api/operations/work-items?queue=settlement&limit=251', [{ item_id: 2 }]],
      ['https://example.test/api/settlement/invoices?limit=251', [{ invoice_id: 11 }]],
      ['https://example.test/api/settlement/payments?limit=251', [{ payment_id: 21 }]],
    ])

    if (!responses.has(url)) {
      throw new Error(`Unexpected URL: ${url}`)
    }

    return responses.get(url)
  })

  const [risk, deliveries, operations, settlement] = await Promise.all([
    loadRiskWorkspaceBootstrap('https://example.test/api'),
    loadDeliveriesWorkspaceBootstrap('https://example.test/api'),
    loadOperationsWorkspaceBootstrap('https://example.test/api'),
    loadSettlementWorkspaceBootstrap('https://example.test/api'),
  ])

  assert.deepEqual(risk.optionExposures, [{ trade_id: 'OPT-1' }])
  assert.deepEqual(risk.optionExposuresWindow, { loadedCount: 1, hasMore: false })
  assert.deepEqual(deliveries.deliveries, [{ delivery_id: 'DLV-1' }])
  assert.deepEqual(deliveries.deliveriesWindow, { loadedCount: 1, hasMore: false })
  assert.deepEqual(operations.confirmations, [{ confirmation_id: 1 }])
  assert.deepEqual(operations.confirmationsWindow, { loadedCount: 1, hasMore: false })
  assert.deepEqual(operations.workItems, [{ item_id: 1 }])
  assert.deepEqual(operations.workItemsWindow, { loadedCount: 1, hasMore: false })
  assert.deepEqual(settlement.invoices, [{ invoice_id: 11 }])
  assert.deepEqual(settlement.invoicesWindow, { loadedCount: 1, hasMore: false })
  assert.deepEqual(settlement.payments, [{ payment_id: 21 }])
  assert.deepEqual(settlement.paymentsWindow, { loadedCount: 1, hasMore: false })
  assert.deepEqual(settlement.workItems, [{ item_id: 2 }])
  assert.deepEqual(settlement.workItemsWindow, { loadedCount: 1, hasMore: false })
})

test('windowed trade loaders trim the extra row and use offset for follow-on pages', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/trades?limit=251')) {
      return Array.from({ length: 251 }, (_, index) => ({ trade_id: `T-${index + 1}` }))
    }
    if (url.endsWith('/trades?offset=250&limit=251')) {
      return [{ trade_id: 'T-251' }, { trade_id: 'T-252' }]
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const firstPage = await loadTradesWindow('https://example.test/api')
  const nextPage = await loadTradesWindow('https://example.test/api', undefined, 250)

  assert.equal(firstPage.rows.length, 250)
  assert.equal(firstPage.rows.at(-1)?.trade_id, 'T-250')
  assert.deepEqual(firstPage.window, { loadedCount: 250, hasMore: true })
  assert.deepEqual(nextPage.rows, [{ trade_id: 'T-251' }, { trade_id: 'T-252' }])
  assert.deepEqual(nextPage.window, { loadedCount: 2, hasMore: false })
})

test('large faux-book loaders stay bounded on the first page across every bootstrapped collection', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    const responses = new Map<string, unknown>([
      ['https://example.test/api/trades?limit=251', makeStringRows('trade_id', 'TRD', 251)],
      ['https://example.test/api/positions?limit=251', makeStringRows('commodity', 'CMDTY', 251)],
      ['https://example.test/api/option-exposures?limit=251', makeStringRows('trade_id', 'OPT', 251)],
      ['https://example.test/api/deliveries?limit=251', makeStringRows('delivery_id', 'DLV', 251)],
      ['https://example.test/api/confirmations?limit=251', makeNumberRows('confirmation_id', 251)],
      ['https://example.test/api/operations/work-items?queue=operations&limit=251', makeNumberRows('item_id', 251)],
      ['https://example.test/api/operations/work-items?queue=settlement&limit=251', makeNumberRows('item_id', 251, 1000)],
      ['https://example.test/api/settlement/invoices?limit=251', makeNumberRows('invoice_id', 251)],
      ['https://example.test/api/settlement/payments?limit=251', makeNumberRows('payment_id', 251)],
    ])

    if (!responses.has(url)) {
      throw new Error(`Unexpected URL: ${url}`)
    }

    return responses.get(url)
  })

  const [
    trades,
    positions,
    optionExposures,
    deliveries,
    confirmations,
    operationsWorkItems,
    settlementWorkItems,
    invoices,
    payments,
  ] = await Promise.all([
    loadTradesWindow('https://example.test/api'),
    loadPositionsWindow('https://example.test/api'),
    loadOptionExposuresWindow('https://example.test/api'),
    loadDeliveriesWindow('https://example.test/api'),
    loadTradeConfirmationsWindow('https://example.test/api'),
    loadTradeWorkflowItemsWindow('https://example.test/api', 'operations'),
    loadTradeWorkflowItemsWindow('https://example.test/api', 'settlement'),
    loadTradeInvoicesWindow('https://example.test/api'),
    loadTradePaymentsWindow('https://example.test/api'),
  ])

  assert.equal(trades.rows.length, 250)
  assert.equal(trades.rows.at(-1)?.trade_id, 'TRD-250')
  assert.deepEqual(trades.window, { loadedCount: 250, hasMore: true })

  assert.equal(positions.rows.length, 250)
  assert.equal(positions.rows.at(-1)?.commodity, 'CMDTY-250')
  assert.deepEqual(positions.window, { loadedCount: 250, hasMore: true })

  assert.equal(optionExposures.rows.length, 250)
  assert.equal(optionExposures.rows.at(-1)?.trade_id, 'OPT-250')
  assert.deepEqual(optionExposures.window, { loadedCount: 250, hasMore: true })

  assert.equal(deliveries.rows.length, 250)
  assert.equal(deliveries.rows.at(-1)?.delivery_id, 'DLV-250')
  assert.deepEqual(deliveries.window, { loadedCount: 250, hasMore: true })

  assert.equal(confirmations.rows.length, 250)
  assert.equal(confirmations.rows.at(-1)?.confirmation_id, 250)
  assert.deepEqual(confirmations.window, { loadedCount: 250, hasMore: true })

  assert.equal(operationsWorkItems.rows.length, 250)
  assert.equal(operationsWorkItems.rows.at(-1)?.item_id, 250)
  assert.deepEqual(operationsWorkItems.window, { loadedCount: 250, hasMore: true })

  assert.equal(settlementWorkItems.rows.length, 250)
  assert.equal(settlementWorkItems.rows.at(-1)?.item_id, 1249)
  assert.deepEqual(settlementWorkItems.window, { loadedCount: 250, hasMore: true })

  assert.equal(invoices.rows.length, 250)
  assert.equal(invoices.rows.at(-1)?.invoice_id, 250)
  assert.deepEqual(invoices.window, { loadedCount: 250, hasMore: true })

  assert.equal(payments.rows.length, 250)
  assert.equal(payments.rows.at(-1)?.payment_id, 250)
  assert.deepEqual(payments.window, { loadedCount: 250, hasMore: true })
})

test('windowed loaders honor larger expanded windows for follow-on faux-book refreshes', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/trades?limit=501')) {
      return makeStringRows('trade_id', 'TRD', 501)
    }
    if (url.endsWith('/settlement/payments?offset=500&limit=501')) {
      return makeNumberRows('payment_id', 125, 501)
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const expandedTradeWindow = await loadTradesWindow('https://example.test/api', undefined, 0, 500)
  const expandedPaymentPage = await loadTradePaymentsWindow('https://example.test/api', undefined, 500, 500)

  assert.equal(expandedTradeWindow.rows.length, 500)
  assert.equal(expandedTradeWindow.rows.at(-1)?.trade_id, 'TRD-500')
  assert.deepEqual(expandedTradeWindow.window, { loadedCount: 500, hasMore: true })

  assert.equal(expandedPaymentPage.rows.length, 125)
  assert.deepEqual(expandedPaymentPage.rows.at(0), { payment_id: 501 })
  assert.deepEqual(expandedPaymentPage.window, { loadedCount: 125, hasMore: false })
})

test('loadReferenceWorkspaceBootstrap keeps core reference data even when optional credit feeds fail', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.includes('/credit-profiles')) {
      throw new Error('Credit profiles unavailable')
    }
    if (url.includes('/external-credit-snapshots')) {
      throw new Error('External snapshots unavailable')
    }

    const responses = new Map<string, unknown>([
      ['https://example.test/api/reference/books?limit=2000', [bootstrapBook]],
      ['https://example.test/api/reference/commodities?limit=2000', [bootstrapCommodity]],
      ['https://example.test/api/reference/price-indices?limit=2000', [bootstrapPriceIndex]],
      ['https://example.test/api/reference/currencies?limit=2000', [bootstrapCurrency]],
      ['https://example.test/api/reference/units?limit=2000', [bootstrapUnit]],
      ['https://example.test/api/reference/locations?limit=2000', [bootstrapLocation]],
      ['https://example.test/api/reference/locations/standards', { location_kinds: ['HUB'] }],
      ['https://example.test/api/reference/counterparties?limit=2000', [bootstrapCounterparty]],
      ['https://example.test/api/reference/counterparties/standards', { credit_statuses: ['APPROVED'] }],
      ['https://example.test/api/reference/portfolios?limit=2000', [bootstrapPortfolio]],
    ])

    if (!responses.has(url)) {
      throw new Error(`Unexpected URL: ${url}`)
    }

    return responses.get(url)
  })

  const payload = await loadReferenceWorkspaceBootstrap('https://example.test/api')

  assert.deepEqual(payload.books, [bootstrapBook])
  assert.deepEqual(payload.commodities, [bootstrapCommodity])
  assert.deepEqual(payload.locationStandards, { location_kinds: ['HUB'] })
  assert.deepEqual(payload.counterpartyStandards, { credit_statuses: ['APPROVED'] })
  assert.deepEqual(payload.counterpartyCreditProfiles, [])
  assert.deepEqual(payload.counterpartyExternalCreditSnapshots, [])

  const firstBook: ReferenceRecord = payload.books[0]!
  const firstPriceIndex: PriceIndexRecord = payload.priceIndices[0]!
  const firstCurrency: CurrencyRecord = payload.currencies[0]!
  const firstUnit: UnitRecord = payload.units[0]!
  const firstLocation: LocationRecord = payload.locations[0]!
  const firstCounterparty: CounterpartyRecord = payload.counterparties[0]!
  const firstPortfolio: PortfolioRecord = payload.portfolios[0]!

  assert.equal(firstBook.code, 'BOOK-1')
  assert.equal(firstPriceIndex.code, 'PJM_DA')
  assert.equal(firstCurrency.code, 'USD')
  assert.equal(firstUnit.code, 'MWH')
  assert.equal(firstLocation.code, 'PJM-WEST')
  assert.equal(firstCounterparty.code, 'CP-1')
  assert.equal(firstPortfolio.code, 'PTF-1')
})

test('loadAdminWorkspaceBootstrap returns empty admin data without an authenticated header set', async () => {
  const payload = await loadAdminWorkspaceBootstrap('https://example.test/api', {
    adminHeaders: null,
  })

  assert.deepEqual(payload, {
    externalDataRuns: [],
    externalDataSyncStatus: null,
    tradingSources: [],
    weatherLocations: [],
    weatherSyncStatus: null,
  })
  assert.equal(fetchJsonMock.mock.calls.length, 0)
})

test('loadAdminWorkspaceBootstrap tolerates partial admin endpoint failures', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/admin/external-data/runs?limit=10')) {
      return [bootstrapExternalDataRun]
    }
    if (url.endsWith('/admin/external-data/status')) {
      throw new Error('status unavailable')
    }
    if (url.endsWith('/admin/trading-sources?limit=500')) {
      return [bootstrapTradingSource]
    }
    if (url.endsWith('/admin/weather/locations')) {
      return [{ code: 'HOUSTON_GC' }]
    }
    if (url.endsWith('/admin/weather/sync/status?include_inactive=true')) {
      return { latest_run: '2026-04-06T00:00:00Z' }
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const headers = new Headers({ Authorization: 'Bearer test-token' })
  const payload = await loadAdminWorkspaceBootstrap('https://example.test/api', {
    adminHeaders: headers,
  })

  assert.deepEqual(payload, {
    externalDataRuns: [bootstrapExternalDataRun],
    externalDataSyncStatus: null,
    tradingSources: [bootstrapTradingSource],
    weatherLocations: [{ code: 'HOUSTON_GC' }],
    weatherSyncStatus: { latest_run: '2026-04-06T00:00:00Z' },
  })
  assert.equal(fetchJsonMock.mock.calls.length, 5)
  assert.strictEqual(fetchJsonMock.mock.calls[0]?.[1]?.headers, headers)

  const firstRun: ExternalDataRunRecord = payload.externalDataRuns[0]!
  const firstSource: TradingSourceRecord = payload.tradingSources[0]!

  assert.equal(firstRun.id, 101)
  assert.equal(firstSource.source_id, 'SRC-1')
})
