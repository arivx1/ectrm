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
    selectedTradeEvents: 500,
    referenceData: 2000,
    externalDataRuns: 10,
    tradingSources: 500,
  },
}))

import {
  loadAdminWorkspaceBootstrap,
  loadCoreWorkspaceBootstrap,
  loadReferenceWorkspaceBootstrap,
} from '../src/entities/app/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
})

test('loadCoreWorkspaceBootstrap fetches only the shell-critical datasets', async () => {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/health')) {
      return { status: 'ok' }
    }
    if (url.endsWith('/trades')) {
      return [{ trade_id: 'T-1' }]
    }
    if (url.endsWith('/events?limit=100')) {
      return [{ event_id: '1' }]
    }
    if (url.endsWith('/positions')) {
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
      'https://example.test/api/trades',
      'https://example.test/api/events?limit=100',
      'https://example.test/api/positions',
    ],
  )
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
    if (url.endsWith('/admin/weather/sync/status')) {
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
    weatherSyncStatus: { latest_run: '2026-04-06T00:00:00Z' },
  })
  assert.equal(fetchJsonMock.mock.calls.length, 4)
  assert.strictEqual(fetchJsonMock.mock.calls[0]?.[1]?.headers, headers)
})
