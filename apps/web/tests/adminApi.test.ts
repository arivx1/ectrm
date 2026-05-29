import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { buildMutationHeadersMock, fetchJsonMock, getMutationContextMock, postJsonMock, putJsonMock } = vi.hoisted(() => ({
  buildMutationHeadersMock: vi.fn(),
  fetchJsonMock: vi.fn(),
  getMutationContextMock: vi.fn(),
  postJsonMock: vi.fn(),
  putJsonMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  postJson: postJsonMock,
  putJson: putJsonMock,
}))

vi.mock('../src/shared/mutation.ts', () => ({
  buildMutationHeaders: buildMutationHeadersMock,
  getMutationContext: getMutationContextMock,
}))

import {
  importCounterpartyCreditSnapshots,
  isExternalDataSyncProvider,
  loadTradeProjectionMonitoring,
  previewCounterpartyCreditImport,
  runExternalDataSync,
  runNwsWeatherSync,
  runTradeProjectionMonitoring,
  saveTradeProjectionMonitoring,
  seedAssistantAgents,
  seedTradingSources,
} from '../src/entities/app/adminApi.ts'

beforeEach(() => {
  buildMutationHeadersMock.mockReset()
  fetchJsonMock.mockReset()
  getMutationContextMock.mockReset()
  postJsonMock.mockReset()
  putJsonMock.mockReset()

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

test('runExternalDataSync supports the full price-provider sync route set', async () => {
  const providerRoutes = [
    ['BLS_PPI', 'bls-ppi'],
    ['WORLD_BANK', 'world-bank'],
    ['USDA_NASS', 'usda-nass'],
    ['EIA_WHOLESALE_POWER', 'eia-wholesale-power'],
    ['MISO', 'miso'],
    ['NYISO', 'nyiso'],
  ] as const

  for (const [provider, route] of providerRoutes) {
    postJsonMock.mockResolvedValueOnce({ id: 102, provider })
    await runExternalDataSync('http://api.test', provider)
    const [url] = postJsonMock.mock.calls.at(-1)!
    assert.equal(url, `http://api.test/admin/external-data/${route}/sync`)
  }
})

test('runExternalDataSync can use an explicit actor and headers outside admin workspace state', async () => {
  const expected = { id: 103, provider: 'ERCOT' }
  const headers = new Headers({ Authorization: 'Bearer home-admin-token' })
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await runExternalDataSync('http://api.test', 'ERCOT', {
    requestedBy: 'home.admin',
    headers,
  })

  assert.equal(payload, expected)
  assert.equal(getMutationContextMock.mock.calls.length, 0)
  assert.equal(buildMutationHeadersMock.mock.calls.length, 0)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/external-data/ercot/sync')
  assert.deepEqual(body, { requested_by: 'home.admin' })
  const sentHeaders = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(sentHeaders.get('Authorization'), 'Bearer home-admin-token')
})

test('isExternalDataSyncProvider narrows configured provider routes', () => {
  assert.equal(isExternalDataSyncProvider('EIA'), true)
  assert.equal(isExternalDataSyncProvider('ERCOT'), true)
  assert.equal(isExternalDataSyncProvider('OPIS'), false)
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
    total_profiles: 20,
    total_templates: 20,
    created_count: 2,
    updated_count: 1,
    agent_ids: [
      'trade-ops-copilot',
      'settlement-copilot',
      'trade-governor',
      'trade-capture-agent',
      'movement-controller-agent',
      'accrual-controller-agent',
      'accounting-posting-agent',
      'counterparty-state-sync-agent',
      'confirmation-controller-agent',
      'workflow-controller-agent',
      'invoice-controller-agent',
      'market-research-agent',
      'pre-trade-structuring-agent',
      'risk-sentinel',
      'document-agent',
      'reporting-reconciliation-agent',
      'logistics-coordinator',
      'fee-accrual-agent',
      'counterparty-outreach-agent',
      'control-tower-agent',
    ],
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

test('loadTradeProjectionMonitoring reads the protected monitoring endpoint', async () => {
  const expected = {
    document: {
      policy_key: 'projection_integrity_monitoring.v1',
      schedule: {
        enabled: true,
        cadence_minutes: 240,
        auto_clean_mode: 'clean_auto_cleanable',
        max_cleanup_trades_per_run: 25,
      },
      alerting: {
        enabled: true,
        issue_count_threshold: 1,
        impacted_trade_threshold: 1,
        minimum_alert_interval_minutes: 60,
        channels: ['ADMIN_WORKSPACE', 'EMAIL'],
        routing_note: 'Route through admin workspace.',
      },
    },
    updated_at: null,
    updated_by: null,
    version: 0,
    is_default: true,
    recent_revisions: [],
    runtime: {
      last_evaluated_at: null,
      last_evaluated_by: null,
      last_issue_count: 0,
      last_impacted_trade_count: 0,
      last_auto_cleaned_trade_count: 0,
      last_auto_cleaned_trade_ids: [],
      last_cycle_status: 'idle',
      last_alert_at: null,
      last_alert_reason: null,
      last_alert_severity: null,
    },
    recent_alerts: [],
    recent_deliveries: [],
    live_status: {
      health_status: 'attention',
      evaluation_due: true,
      next_evaluation_at: null,
      live_issue_count: 0,
      live_impacted_trade_count: 0,
      should_alert: false,
      alert_messages: ['Projection monitoring is due for a fresh evaluation.'],
      last_evaluated_at: null,
      last_evaluated_by: null,
      last_alert_at: null,
      last_alert_reason: null,
    },
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadTradeProjectionMonitoring('http://api.test', 'session-token')

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/data/projection-monitoring')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer session-token')
})

test('saveTradeProjectionMonitoring writes the monitoring policy through the typed admin helper', async () => {
  const document = {
    policy_key: 'projection_integrity_monitoring.v1',
    schedule: {
      enabled: true,
      cadence_minutes: 120,
      auto_clean_mode: 'clean_auto_cleanable',
      max_cleanup_trades_per_run: 10,
    },
    alerting: {
      enabled: true,
      issue_count_threshold: 1,
      impacted_trade_threshold: 1,
      minimum_alert_interval_minutes: 30,
      channels: ['ADMIN_WORKSPACE'],
      routing_note: 'Desk review required.',
    },
  } as const
  const expected = {
    document,
    updated_at: '2026-04-15T12:00:00Z',
    updated_by: 'ops.admin',
    version: 1,
    is_default: false,
    recent_revisions: [],
    runtime: {
      last_evaluated_at: null,
      last_evaluated_by: null,
      last_issue_count: 0,
      last_impacted_trade_count: 0,
      last_auto_cleaned_trade_count: 0,
      last_auto_cleaned_trade_ids: [],
      last_cycle_status: 'idle',
      last_alert_at: null,
      last_alert_reason: null,
      last_alert_severity: null,
    },
    recent_alerts: [],
    recent_deliveries: [],
    live_status: {
      health_status: 'attention',
      evaluation_due: true,
      next_evaluation_at: null,
      live_issue_count: 0,
      live_impacted_trade_count: 0,
      should_alert: false,
      alert_messages: [],
      last_evaluated_at: null,
      last_evaluated_by: null,
      last_alert_at: null,
      last_alert_reason: null,
    },
  }
  putJsonMock.mockResolvedValueOnce(expected)

  const payload = await saveTradeProjectionMonitoring(
    'http://api.test',
    'session-token',
    document,
    'ops.admin',
  )

  assert.equal(payload, expected)
  const [url, body, init] = putJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/data/projection-monitoring')
  assert.deepEqual(body, {
    document,
    updated_by: 'ops.admin',
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer session-token')
})

test('runTradeProjectionMonitoring routes a forced run through the typed admin mutation helper', async () => {
  const expected = {
    cycle_status: 'issues_detected',
    executed: true,
    requested_by: 'ops.admin',
    evaluated_at: '2026-04-15T12:00:00Z',
    issue_count_before: 2,
    issue_count_after: 1,
    impacted_trade_count_after: 1,
    auto_cleaned_trade_ids: ['T-ORPHAN'],
    emitted_alerts: [],
    emitted_deliveries: [
      {
        delivery_id: 'delivery-1',
        alert_id: 'alert-1',
        channel: 'ADMIN_WORKSPACE',
        status: 'delivered',
        target: 'admin-workspace',
        title: 'Projection monitoring alert',
        body: '1 issue remains.',
        recipients: [],
        created_at: '2026-04-15T12:00:00Z',
        delivered_at: '2026-04-15T12:00:00Z',
        error: null,
      },
      {
        delivery_id: 'delivery-2',
        alert_id: 'alert-1',
        channel: 'EMAIL',
        status: 'delivered',
        target: 'local-email-archive',
        title: 'Projection monitoring alert',
        body: '1 issue remains.',
        recipients: ['ops@example.com'],
        created_at: '2026-04-15T12:00:00Z',
        delivered_at: '2026-04-15T12:00:00Z',
        error: null,
      },
    ],
    summary: 'Projection monitoring found 1 remaining issue across 1 trade. 2 channel deliveries were recorded.',
    next_evaluation_at: '2026-04-15T16:00:00Z',
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await runTradeProjectionMonitoring('http://api.test')

  assert.equal(payload, expected)
  const [url, body] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/admin/data/projection-monitoring/run')
  assert.deepEqual(body, {
    requested_by: 'ops.admin',
    force: true,
  })
})
