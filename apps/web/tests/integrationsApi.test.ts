import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock, postJsonMock, requestOkMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
  requestOkMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  postJson: postJsonMock,
  requestOk: requestOkMock,
}))

import { loadAttioClientEnrichment, loadNexusClientEngagements } from '../src/entities/integrations/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
  postJsonMock.mockReset()
  requestOkMock.mockReset()
})

test('loadAttioClientEnrichment posts client name with session authorization', async () => {
  const expected = {
    provider: 'attio_rest_api',
    configured: true,
    client_name: 'Hartree',
    matched: true,
    match_basis: 'search',
    company: null,
    contacts: [],
    deals: [],
    required_scopes: ['object_configuration:read', 'record_permission:read'],
    warnings: [],
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadAttioClientEnrichment('https://example.test/api', 'session-token', 'Hartree')

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/integrations/attio/client-enrichment')
  assert.deepEqual(body, { client_name: 'Hartree' })
  assert.equal((init as RequestInit).cache, 'no-store')
  assert.equal(new Headers((init as RequestInit).headers).get('Authorization'), 'Bearer session-token')
})

test('loadNexusClientEngagements posts company identity with session authorization', async () => {
  const expected = {
    client_name: 'Hartree Partners',
    lookback_days: 30,
    requested_limit: 12,
    matched_count: 2,
    returned_count: 2,
    source_counts: { gmail: 1, slack: 1 },
    gmail_query: 'newer_than:30d ("Hartree Partners")',
    items: [],
    warnings: [],
    read_only: true,
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadNexusClientEngagements('https://example.test/api', 'session-token', {
    client_name: 'Hartree Partners',
    domains: ['hartreepartners.com'],
    contact_emails: ['ops@hartreepartners.com'],
    lookback_days: 30,
    limit: 12,
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'https://example.test/api/integrations/nexus/client-engagements')
  assert.deepEqual(body, {
    client_name: 'Hartree Partners',
    domains: ['hartreepartners.com'],
    contact_emails: ['ops@hartreepartners.com'],
    lookback_days: 30,
    limit: 12,
  })
  assert.equal((init as RequestInit).cache, 'no-store')
  assert.equal(new Headers((init as RequestInit).headers).get('Authorization'), 'Bearer session-token')
})
