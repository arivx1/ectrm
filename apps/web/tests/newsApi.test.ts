import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock, postJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  postJson: postJsonMock,
}))

import { loadMarketNewsHeadlineTags, loadMarketNewsHeadlines } from '../src/entities/news/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
  postJsonMock.mockReset()
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

test('loadMarketNewsHeadlineTags posts deterministic baseline for AI enrichment', async () => {
  const expected = {
    generated_at: '2026-05-25T12:00:00Z',
    provider: 'openai',
    model: 'gpt-5-mini',
    items: [],
    warnings: [],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadMarketNewsHeadlineTags('https://example.test/api', {
    commodity: 'BEEF',
    items: [
      {
        id: 'headline-0',
        title: 'Beef output hits record in the U.S.',
        source: 'Market Wire',
        published_at: null,
        deterministic: {
          supply: { direction: 'neutral', horizon: 'near_term' },
          demand: { direction: 'neutral', horizon: 'near_term' },
          market_location: { label: 'United States', scope: 'country' },
        },
      },
    ],
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/market-data/news/headlines/tagging')
  assert.equal((init as RequestInit).cache, 'no-store')
  assert.equal((body as { items: { id: string }[] }).items[0].id, 'headline-0')
})
