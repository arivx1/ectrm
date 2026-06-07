import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { postJsonMock } = vi.hoisted(() => ({
  postJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  postJson: postJsonMock,
}))

import { loadAttioClientEnrichment } from '../src/entities/integrations/api.ts'

beforeEach(() => {
  postJsonMock.mockReset()
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
