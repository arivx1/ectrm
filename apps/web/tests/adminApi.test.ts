import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { buildMutationHeadersMock, getMutationContextMock, postJsonMock } = vi.hoisted(() => ({
  buildMutationHeadersMock: vi.fn(),
  getMutationContextMock: vi.fn(),
  postJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  postJson: postJsonMock,
}))

vi.mock('../src/shared/mutation.ts', () => ({
  buildMutationHeaders: buildMutationHeadersMock,
  getMutationContext: getMutationContextMock,
}))

import {
  importCounterpartyCreditSnapshots,
  previewCounterpartyCreditImport,
  runExternalDataSync,
  runNwsWeatherSync,
  seedAssistantAgents,
  seedTradingSources,
} from '../src/entities/app/adminApi.ts'

beforeEach(() => {
  buildMutationHeadersMock.mockReset()
  getMutationContextMock.mockReset()
  postJsonMock.mockReset()

  buildMutationHeadersMock.mockImplementation((headers?: HeadersInit) => {
    const merged = new Headers(headers)
    merged.set('Authorization', 'Bearer admin-token')
    return merged
  })
  getMutationContextMock.mockReturnValue({
    actorId: 'ops.admin',
    accessToken: 'admin-token',
    role: 'ADMIN',
  })
})

test('runExternalDataSync routes provider-specific syncs through the typed admin helper', async () => {
  const expected = { id: 101, provider: 'EIA_FUNDAMENTALS' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await runExternalDataSync('http://api.test', 'EIA_FUNDAMENTALS')

  assert.equal(payload, expected)
  assert.equal(postJsonMock.mock.calls.length, 1)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/external-data/eia-fundamentals/sync')
  assert.deepEqual(body, { requested_by: 'ops.admin' })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer admin-token')
})

test('previewCounterpartyCreditImport applies the shared preview payload contract', async () => {
  const rows = [{ duns: '12345' }]
  const expected = { provider: 'DNB', total_rows: 1 }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await previewCounterpartyCreditImport('http://api.test', rows, {
    defaultLimitCurrencyCode: 'EUR',
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/external-data/dnb/counterparty-credit/preview')
  assert.deepEqual(body, {
    rows,
    default_limit_currency_code: 'EUR',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer admin-token')
})

test('importCounterpartyCreditSnapshots standardizes the counterparty credit import request', async () => {
  const snapshots = [
    {
      counterparty_code: 'CP-1',
      as_of_date: '2026-04-12',
      recommended_limit_amount: 250000,
    },
  ]
  const expected = { id: 202, provider: 'DNB' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await importCounterpartyCreditSnapshots('http://api.test', snapshots)

  assert.equal(payload, expected)
  const [url, body] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/external-data/counterparty-credit/import')
  assert.deepEqual(body, {
    provider: 'DNB',
    snapshots,
    requested_by: 'ops.admin',
  })
})

test('seedTradingSources keeps replaceExisting inside the typed admin helper', async () => {
  const expected = {
    total_rows: 12,
    created_count: 10,
    updated_count: 2,
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await seedTradingSources('http://api.test')

  assert.equal(payload, expected)
  const [url, body] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/trading-sources/seed')
  assert.deepEqual(body, {
    requested_by: 'ops.admin',
    replace_existing: true,
  })
})

test('seedAssistantAgents routes through the typed admin seed helper', async () => {
  const expected = {
    requested_by: 'ops.admin',
    total_templates: 3,
    created_count: 2,
    updated_count: 1,
    agent_ids: ['trade-ops-copilot', 'settlement-copilot', 'trade-governor'],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await seedAssistantAgents('http://api.test')

  assert.equal(payload, expected)
  const [url, body] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/data/assistant-agents/seed')
  assert.deepEqual(body, {
    requested_by: 'ops.admin',
  })
})

test('runNwsWeatherSync routes through the typed weather admin helper', async () => {
  const expected = { id: 303, provider: 'NWS' }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await runNwsWeatherSync('http://api.test')

  assert.equal(payload, expected)
  const [url, body] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/weather/sync/nws')
  assert.deepEqual(body, {
    requested_by: 'ops.admin',
  })
})
