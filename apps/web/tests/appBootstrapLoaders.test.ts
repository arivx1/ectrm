import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

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
  loadOperationsWorkspaceBootstrap,
  loadReferenceWorkspaceBootstrap,
  loadRiskWorkspaceBootstrap,
  loadSettlementWorkspaceBootstrap,
} from '../src/entities/app/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
})

test('loadCoreWorkspaceBootstrap fetches only the shell-critical datasets', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/health')) {
      return { status: 'ok' }
    }
    if (url.endsWith('/trades?limit=250')) {
      return [{ trade_id: 'T-1' }]
    }
    if (url.endsWith('/events?limit=100')) {
      return [{ event_id: '1' }]
    }
    if (url.endsWith('/positions?limit=250')) {
      return [{ commodity: 'PWR' }]
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const payload = await loadCoreWorkspaceBootstrap('https://example.test/api')

  assert.deepEqual(payload, {
    health: { status: 'ok' },
    trades: [{ trade_id: 'T-1' }],
    events: [{ event_id: '1' }],
    positions: [{ commodity: 'PWR' }],
  })
  assert.deepEqual(
    fetchJsonMock.mock.calls.map((call) => call[0]),
    [
      'https://example.test/api/health',
      'https://example.test/api/trades?limit=250',
      'https://example.test/api/events?limit=100',
      'https://example.test/api/positions?limit=250',
    ],
  )
})

test('workspace loaders apply bounded bootstrap windows to large operational datasets', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    const responses = new Map<string, unknown>([
      ['https://example.test/api/option-exposures?limit=250', [{ trade_id: 'OPT-1' }]],
      ['https://example.test/api/deliveries?limit=250', [{ delivery_id: 'DLV-1' }]],
      ['https://example.test/api/confirmations?limit=250', [{ confirmation_id: 1 }]],
      ['https://example.test/api/operations/work-items?limit=250', [{ item_id: 1 }]],
      ['https://example.test/api/settlement/invoices?limit=250', [{ invoice_id: 11 }]],
      ['https://example.test/api/settlement/payments?limit=250', [{ payment_id: 21 }]],
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
  assert.deepEqual(deliveries.deliveries, [{ delivery_id: 'DLV-1' }])
  assert.deepEqual(operations.confirmations, [{ confirmation_id: 1 }])
  assert.deepEqual(operations.workItems, [{ item_id: 1 }])
  assert.deepEqual(settlement.invoices, [{ invoice_id: 11 }])
  assert.deepEqual(settlement.payments, [{ payment_id: 21 }])
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
      ['https://example.test/api/reference/books?limit=2000', [{ code: 'BOOK-1' }]],
      ['https://example.test/api/reference/commodities?limit=2000', [{ code: 'POWER' }]],
      ['https://example.test/api/reference/price-indices?limit=2000', [{ code: 'PJM_DA' }]],
      ['https://example.test/api/reference/currencies?limit=2000', [{ code: 'USD' }]],
      ['https://example.test/api/reference/units?limit=2000', [{ code: 'MWH' }]],
      ['https://example.test/api/reference/locations?limit=2000', [{ code: 'PJM' }]],
      ['https://example.test/api/reference/locations/standards', { location_kinds: ['HUB'] }],
      ['https://example.test/api/reference/counterparties?limit=2000', [{ code: 'CP-1' }]],
      ['https://example.test/api/reference/counterparties/standards', { credit_statuses: ['APPROVED'] }],
      ['https://example.test/api/reference/portfolios?limit=2000', [{ code: 'PTF-1' }]],
    ])

    if (!responses.has(url)) {
      throw new Error(`Unexpected URL: ${url}`)
    }

    return responses.get(url)
  })

  const payload = await loadReferenceWorkspaceBootstrap('https://example.test/api')

  assert.deepEqual(payload.books, [{ code: 'BOOK-1' }])
  assert.deepEqual(payload.commodities, [{ code: 'POWER' }])
  assert.deepEqual(payload.locationStandards, { location_kinds: ['HUB'] })
  assert.deepEqual(payload.counterpartyStandards, { credit_statuses: ['APPROVED'] })
  assert.deepEqual(payload.counterpartyCreditProfiles, [])
  assert.deepEqual(payload.counterpartyExternalCreditSnapshots, [])
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
      return [{ id: 101 }]
    }
    if (url.endsWith('/admin/external-data/status')) {
      throw new Error('status unavailable')
    }
    if (url.endsWith('/admin/trading-sources?limit=500')) {
      return [{ source_id: 'SRC-1' }]
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
    externalDataRuns: [{ id: 101 }],
    externalDataSyncStatus: null,
    tradingSources: [{ source_id: 'SRC-1' }],
    weatherLocations: [{ code: 'HOUSTON_GC' }],
    weatherSyncStatus: { latest_run: '2026-04-06T00:00:00Z' },
  })
  assert.equal(fetchJsonMock.mock.calls.length, 5)
  assert.strictEqual(fetchJsonMock.mock.calls[0]?.[1]?.headers, headers)
})
