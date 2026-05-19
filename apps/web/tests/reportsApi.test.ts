import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock, postJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  patchJson: vi.fn(),
  postJson: postJsonMock,
  requestOk: vi.fn(),
}))

import {
  loadTradingEodReport,
  validateReportDefinitionDraft,
  validateWorkbookDefinitionDraft,
} from '../src/entities/reports/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
  postJsonMock.mockReset()
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

test('validateReportDefinitionDraft posts draft payload with auth headers', async () => {
  const expected = { valid: true, status: 'valid' }
  const draft = {
    report_key: 'draft_report_settlement_aging_rows',
    name: 'Settlement Aging Draft',
    dataset_id: 'report_settlement_aging_rows',
    columns: [{ field_key: 'counterparty_code' }],
    parameter_keys: ['as_of'],
    default_sort: ['counterparty_code'],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await validateReportDefinitionDraft('https://example.test/api', draft, 'desk-token')

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/reports/definitions/validate')
  assert.deepEqual(body, draft)
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer desk-token')
})

test('validateWorkbookDefinitionDraft posts workbook draft to the workbook validator', async () => {
  const expected = { valid: true, status: 'valid' }
  const draft = {
    workbook_key: 'settlement_pack',
    name: 'Settlement Pack',
    sheets: [
      {
        sheet_key: 'aging',
        sheet_name: 'Aging',
        sheet_kind: 'dataset' as const,
        dataset_id: 'report_settlement_aging_rows',
      },
    ],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await validateWorkbookDefinitionDraft('https://example.test/api', draft)

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/reports/workbooks/validate')
  assert.deepEqual(body, draft)
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), null)
})
