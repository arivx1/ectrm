import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

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

import {
  approveDocumentActionApprovalRequest,
  attachSelectedDocumentRecordCandidate,
  executeDocumentActionPlan,
  executeDocumentWorkflow,
  fetchDocumentSource,
  listDocumentActionApprovalRequests,
  listDocumentWorkflows,
  rejectDocumentActionApprovalRequest,
  stageSelectedDocumentRecordCandidateApprovalRequest,
  stageDocumentActionApprovalRequest,
  uploadPdfDocument,
} from '../src/entities/documents/api.ts'
import type { StoredAuthSession } from '../src/shared/mutation.ts'

const documentSession: StoredAuthSession = {
  sessionId: 'session-1',
  accessToken: 'document-token',
  expiresAt: '2026-05-11T00:00:00Z',
  user: {
    user_id: 'user-1',
    email: 'ops@example.com',
    display_name: 'Ops User',
    role: 'OPS_ADMIN',
  },
}

beforeEach(() => {
  fetchJsonMock.mockReset()
  patchJsonMock.mockReset()
  postFormDataMock.mockReset()
  postJsonMock.mockReset()
  requestOkMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
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
    documentSession,
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

test('uploadPdfDocument posts the AI confidence threshold with the upload form', async () => {
  postFormDataMock.mockResolvedValueOnce({ document_id: 'DOC-THRESHOLD' })
  const file = new File(['%PDF-1.7'], 'invoice.pdf', { type: 'application/pdf' })

  await uploadPdfDocument(
    'http://api.test',
    documentSession,
    file,
    'Invoice',
    'openai',
    'gpt-5-mini',
    0.82,
  )

  const [url, formData, init] = postFormDataMock.mock.calls[0]
  assert.equal(url, 'http://api.test/documents/uploads')
  assert.equal((formData as FormData).get('ai_confidence_threshold'), '0.82')
  assert.equal((formData as FormData).get('processor_provider'), 'openai')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer document-token')
})

test('listDocumentWorkflows requests the document workflow registry with authorization', async () => {
  fetchJsonMock.mockResolvedValueOnce({
    document_id: 'DOC-PRICE-1',
    document_kind: 'PRICE_PUBLICATION',
    document_type_label: 'Price Publication Report',
    workflows: [
      {
        workflow_id: 'process_prices',
        label: 'Process Prices',
        document_kind: 'PRICE_PUBLICATION',
        document_type_label: 'Price Publication Report',
        description: 'Load reviewed price lines from this document into the price-index observation table.',
      },
    ],
    empty_message: 'No workflows assigned to this document type.',
  })

  const payload = await listDocumentWorkflows('http://api.test', documentSession, 'DOC-PRICE-1')

  assert.equal(payload.workflows[0]?.workflow_id, 'process_prices')
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/documents/DOC-PRICE-1/workflows')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer document-token')
  assert.equal((init as RequestInit | undefined)?.cache, 'no-store')
})

test('listDocumentWorkflows times out instead of leaving the workflow dialog pending forever', async () => {
  vi.useFakeTimers()
  fetchJsonMock.mockReturnValueOnce(new Promise(() => undefined))

  const pendingRequest = listDocumentWorkflows('http://api.test', documentSession, 'DOC-PRICE-1')
  const rejection = assert.rejects(
    pendingRequest,
    /Document workflows did not respond within 15 seconds/,
  )

  await vi.advanceTimersByTimeAsync(15_000)
  await rejection
})

test('executeDocumentWorkflow posts the selected workflow id with authorization', async () => {
  postJsonMock.mockResolvedValueOnce({
    document_id: 'DOC-PRICE-1',
    workflow_id: 'process_prices',
    label: 'Process Prices',
    status: 'EXECUTED',
    message: 'Processed 1 price observation.',
    run_id: 42,
    observation_count: 1,
    created_count: 1,
    updated_count: 0,
    unchanged_count: 0,
    price_index_codes: ['WTI_CUSHING_D'],
    observations: [],
  })

  const payload = await executeDocumentWorkflow(
    'http://api.test',
    documentSession,
    'DOC-PRICE-1',
    'process_prices',
  )

  assert.equal(payload.status, 'EXECUTED')
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/documents/DOC-PRICE-1/workflows/process_prices/execute')
  assert.deepEqual(body, {})
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer document-token')
})

test('executeDocumentActionPlan posts to the guarded action-plan endpoint with authorization', async () => {
  postJsonMock.mockResolvedValueOnce({
    document_id: 'DOC-INVOICE-1',
    record_links: [
      {
        record_type: 'TRADE_INVOICE',
        record_id: '42',
        record_label: 'Invoice INV-42',
      },
    ],
  })

  const payload = await executeDocumentActionPlan(
    'http://api.test',
    documentSession,
    'DOC-INVOICE-1',
  )

  assert.equal(payload.document_id, 'DOC-INVOICE-1')
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/documents/DOC-INVOICE-1/execute-action-plan')
  assert.deepEqual(body, {})
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer document-token')
})

test('document action approval APIs use the approval request endpoints', async () => {
  fetchJsonMock.mockResolvedValueOnce([{ request_id: 1, document_id: 'DOC-INVOICE-1' }])
  postJsonMock
    .mockResolvedValueOnce({ request_id: 1, document_id: 'DOC-INVOICE-1', status: 'PENDING' })
    .mockResolvedValueOnce({ request_id: 1, document_id: 'DOC-INVOICE-1', status: 'EXECUTED' })
    .mockResolvedValueOnce({ request_id: 2, document_id: 'DOC-INVOICE-2', status: 'REJECTED' })

  await listDocumentActionApprovalRequests('http://api.test', documentSession, {
    status: 'PENDING',
    limit: 10,
  })
  await stageDocumentActionApprovalRequest('http://api.test', documentSession, 'DOC-INVOICE-1', {
    request_comment: 'Please review.',
  })
  await approveDocumentActionApprovalRequest('http://api.test', documentSession, 'DOC-INVOICE-1', {
    decision_comment: 'Approved.',
  })
  await rejectDocumentActionApprovalRequest('http://api.test', documentSession, 'DOC-INVOICE-2', {
    decision_comment: 'Rejected.',
  })

  assert.equal(fetchJsonMock.mock.calls[0][0], 'http://api.test/documents/action-approval-requests?status=PENDING&limit=10')
  assert.equal(postJsonMock.mock.calls[0][0], 'http://api.test/documents/DOC-INVOICE-1/action-approval-requests')
  assert.deepEqual(postJsonMock.mock.calls[0][1], { request_comment: 'Please review.' })
  assert.equal(postJsonMock.mock.calls[1][0], 'http://api.test/documents/DOC-INVOICE-1/action-approval-requests/approve')
  assert.deepEqual(postJsonMock.mock.calls[1][1], { decision_comment: 'Approved.' })
  assert.equal(postJsonMock.mock.calls[2][0], 'http://api.test/documents/DOC-INVOICE-2/action-approval-requests/reject')
  assert.deepEqual(postJsonMock.mock.calls[2][1], { decision_comment: 'Rejected.' })
})

test('selected document candidate APIs post selected record targets', async () => {
  postJsonMock
    .mockResolvedValueOnce({ document_id: 'DOC-INVOICE-1' })
    .mockResolvedValueOnce({ request_id: 1, document_id: 'DOC-INVOICE-1', status: 'PENDING' })

  await attachSelectedDocumentRecordCandidate('http://api.test', documentSession, 'DOC-INVOICE-1', {
    record_type: 'TRADE_INVOICE',
    record_id: '42',
  })
  await stageSelectedDocumentRecordCandidateApprovalRequest('http://api.test', documentSession, 'DOC-INVOICE-1', {
    record_type: 'TRADE_INVOICE',
    record_id: '42',
    request_comment: 'Selected in Library.',
  })

  assert.equal(postJsonMock.mock.calls[0][0], 'http://api.test/documents/DOC-INVOICE-1/record-candidate-attachments')
  assert.deepEqual(postJsonMock.mock.calls[0][1], {
    record_type: 'TRADE_INVOICE',
    record_id: '42',
  })
  assert.equal(
    postJsonMock.mock.calls[1][0],
    'http://api.test/documents/DOC-INVOICE-1/record-candidate-attachments/approval-requests',
  )
  assert.deepEqual(postJsonMock.mock.calls[1][1], {
    record_type: 'TRADE_INVOICE',
    record_id: '42',
    request_comment: 'Selected in Library.',
  })
})
