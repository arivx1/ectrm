import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { loadPnlHistoryReportMock } = vi.hoisted(() => ({
  loadPnlHistoryReportMock: vi.fn(),
}))

vi.mock('../src/entities/reports/api.ts', () => ({
  loadPnlHistoryReport: loadPnlHistoryReportMock,
}))

vi.mock('../src/shared/config.ts', () => ({
  appConfig: {
    apiBase: 'https://example.test/api',
  },
}))

import { loadDashboardPnlHistory } from '../src/workspaces/dashboard/pnlHistoryLoader.ts'

beforeEach(() => {
  loadPnlHistoryReportMock.mockReset()
})

test('loadDashboardPnlHistory passes the active session token to protected reporting endpoints', async () => {
  loadPnlHistoryReportMock.mockResolvedValue({ points: [] })

  await loadDashboardPnlHistory(
    {
      book: 'DEMO_GAS',
      commodityClass: 'NATURAL_GAS',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    },
    {
      sessionId: 'session-1',
      accessToken: 'desk-token',
      expiresAt: '2026-04-11T15:00:00Z',
      user: {
        user_id: 'ops_admin',
        email: 'ops@example.com',
        display_name: 'Ops Admin',
        role: 'OPS_ADMIN',
      },
    },
  )

  assert.deepEqual(loadPnlHistoryReportMock.mock.calls[0], [
    'https://example.test/api',
    {
      book: 'DEMO_GAS',
      commodityClass: 'NATURAL_GAS',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    },
    'desk-token',
  ])
})

test('loadDashboardPnlHistory drops blank filters and omits auth headers for signed-out users', async () => {
  loadPnlHistoryReportMock.mockResolvedValue({ points: [] })

  await loadDashboardPnlHistory(
    {
      book: '',
      commodityClass: 'POWER',
      dateFrom: '',
      dateTo: '',
    },
    null,
  )

  assert.deepEqual(loadPnlHistoryReportMock.mock.calls[0], [
    'https://example.test/api',
    {
      book: undefined,
      commodityClass: 'POWER',
      dateFrom: undefined,
      dateTo: undefined,
    },
    undefined,
  ])
})
