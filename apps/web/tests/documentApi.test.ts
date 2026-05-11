import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock, patchJsonMock, postFormDataMock, postJsonMock, requestOkMock } =
  vi.hoisted(() => ({
    fetchJsonMock: vi.fn(),
    patchJsonMock: vi.fn(),
    postFormDataMock: vi.fn(),
    postJsonMock: vi.fn(),
    requestOkMock: vi.fn(),
  }))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  patchJson: patchJsonMock,
  postFormData: postFormDataMock,
  postJson: postJsonMock,
  requestOk: requestOkMock,
}))

import { fetchDocumentSource } from '../src/entities/documents/api.ts'

beforeEach(() => {
  fetchJsonMock.mockReset()
  patchJsonMock.mockReset()
  postFormDataMock.mockReset()
  postJsonMock.mockReset()
  requestOkMock.mockReset()
})

test('fetchDocumentSource requests the protected source-pdf endpoint with authorization', async () => {
  requestOkMock.mockResolvedValueOnce(
    new Response(new Blob(['pdf-bytes'], { type: 'application/pdf' }), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }),
  )

  const payload = await fetchDocumentSource(
    'http://api.test',
    {
      sessionId: 'session-1',
      accessToken: 'document-token',
      expiresAt: '2026-05-11T00:00:00Z',
      user: {
        user_id: 'user-1',
        email: 'ops@example.com',
        display_name: 'Ops User',
        role: 'OPS_ADMIN',
      },
    },
    'DOC-1001',
  )

  assert.ok(payload instanceof Blob)
  assert.equal(payload.type, 'application/pdf')
  assert.equal(await payload.text(), 'pdf-bytes')
  const [url, init] = requestOkMock.mock.calls[0]
  assert.equal(url, 'http://api.test/documents/DOC-1001/source')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer document-token')
})
