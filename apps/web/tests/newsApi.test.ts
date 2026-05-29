import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
}))

import { loadMarketNewsHeadlines } from '../src/entities/news/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
})

test('loadMarketNewsHeadlines builds reusable market news query parameters', async () => {
  const expected = {
    generated_at: '2026-05-25T12:00:00Z',
    commodity: 'NATGAS',
    search_query: 'NATGAS Henry Hub when:7d',
    count: 0,
    items: [],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadMarketNewsHeadlines('https://example.test/api', {
    commodity: ' NATGAS ',
    query: 'Henry Hub IFERC',
    limit: 5.9,
    lookbackDays: 7.2,
  })

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(
    url,
    'https://example.test/api/market-data/news/headlines?commodity=NATGAS&query=Henry+Hub+IFERC&limit=5&lookback_days=7',
  )
  assert.equal((init as RequestInit).cache, 'no-store')
})
