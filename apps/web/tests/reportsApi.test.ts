import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  patchJson: vi.fn(),
  postJson: vi.fn(),
  requestOk: vi.fn(),
}))

import { loadTradingEodReport } from '../src/entities/reports/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
})

test('loadTradingEodReport sends business-date basis and auth headers to the protected endpoint', async () => {
  const expected = { status: 'WARNING' }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadTradingEodReport(
    'https://example.test/api',
    {
      businessDate: '2026-04-06',
      asOf: '2026-04-06',
    },
    'desk-token',
  )

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/reports/trading-eod?business_date=2026-04-06&as_of=2026-04-06')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer desk-token')
})

test('loadTradingEodReport omits blank options and auth headers for signed-out users', async () => {
  const expected = { status: 'READY' }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadTradingEodReport(
    'https://example.test/api',
    {
      businessDate: '',
      asOf: '',
    },
  )

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/reports/trading-eod')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), null)
})
