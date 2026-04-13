import assert from 'node:assert/strict'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import type { Page } from 'playwright/test'
import { createServer as createViteServer, type ViteDevServer } from 'vite'

import { buildFallbackTradeMetadata } from '../../../src/shared/tradeMetadata'
import {
  books,
  buildWorkspaceSummary,
  commodities,
  counterparties,
  currencies,
  locations,
  portfolios,
  positions,
  priceIndices,
  publicRuntimeSettings,
  type RecordedRequest,
  selectedTradeEvents,
  smokeAccessToken,
  smokeSession,
  trades,
  units,
} from './smokeFixtures'

type MockApiServer = {
  baseUrl: string
  expireSession: () => void
  mutationRequests: RecordedRequest[]
  unexpectedRequests: RecordedRequest[]
  close: () => Promise<void>
}

type StartSmokeHarnessOptions = {
  singleUserAuthEnabled?: boolean
}

export type SmokeHarness = {
  origin: string
  apiBaseUrl: string
  expireSession: () => void
  mutationRequests: RecordedRequest[]
  unexpectedRequests: RecordedRequest[]
  close: () => Promise<void>
}

const webRoot = fileURLToPath(new URL('../../..', import.meta.url))

function writeJson(response: ServerResponse, payload: unknown, status = 200): void {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function writeNoContent(response: ServerResponse): void {
  response.writeHead(204)
  response.end()
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) {
    return null
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function requireAuthorization(
  request: IncomingMessage,
  response: ServerResponse,
  sessionExpired = false,
): boolean {
  if (!sessionExpired && request.headers.authorization === `Bearer ${smokeAccessToken}`) {
    return true
  }

  writeJson(response, { detail: 'Unauthorized' }, 401)
  return false
}

async function startMockApiServer(
  options: StartSmokeHarnessOptions = {},
): Promise<MockApiServer> {
  const mutationRequests: RecordedRequest[] = []
  const unexpectedRequests: RecordedRequest[] = []
  let sessionExpired = false
  const runtimeSettings = {
    ...publicRuntimeSettings,
    single_user_auth_enabled: options.singleUserAuthEnabled ?? publicRuntimeSettings.single_user_auth_enabled,
  }

  const server = createHttpServer(async (request, response) => {
    const method = request.method ?? 'GET'
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const record: RecordedRequest = {
      method,
      path: url.pathname,
      search: url.search,
    }

    if (
      method !== 'GET' &&
      !(method === 'POST' && url.pathname === '/auth/heartbeat') &&
      !(method === 'POST' && url.pathname === '/auth/session') &&
      !(method === 'POST' && url.pathname === '/auth/single-user-session') &&
      !(method === 'PUT' && url.pathname === '/layout-definitions/trades') &&
      !(method === 'PUT' && url.pathname === '/layout-definitions/dashboard')
    ) {
      mutationRequests.push(record)
    }

    if (url.pathname === '/health' && method === 'GET') {
      writeJson(response, { status: 'ok' })
      return
    }

    if (url.pathname === '/settings/public' && method === 'GET') {
      writeJson(response, runtimeSettings)
      return
    }

    if (url.pathname === '/auth/session' && method === 'POST') {
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const sessionRequest = payload as {
        identifier?: unknown
        password?: unknown
      }

      assert.equal(typeof sessionRequest.identifier, 'string')
      assert.equal(typeof sessionRequest.password, 'string')
      sessionExpired = false

      writeJson(response, {
        session_id: smokeSession.sessionId,
        access_token: smokeSession.accessToken,
        expires_at: smokeSession.expiresAt,
        user: smokeSession.user,
      })
      return
    }

    if (url.pathname === '/auth/single-user-session' && method === 'POST') {
      sessionExpired = false

      writeJson(response, {
        session_id: smokeSession.sessionId,
        access_token: smokeSession.accessToken,
        expires_at: smokeSession.expiresAt,
        user: smokeSession.user,
      })
      return
    }

    if (url.pathname === '/auth/me' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        session_id: smokeSession.sessionId,
        expires_at: smokeSession.expiresAt,
        user: smokeSession.user,
      })
      return
    }

    if (url.pathname === '/auth/heartbeat' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeNoContent(response)
      return
    }

    if (url.pathname === '/operations/workspace-summary' && method === 'GET') {
      writeJson(response, buildWorkspaceSummary())
      return
    }

    if (url.pathname === '/operations/resources' && method === 'GET') {
      writeJson(response, [
        {
          resource_key: 'confirmations',
          filters: ['trade_id'],
          sort_fields: ['created_at desc', 'id desc'],
          actions: ['create', 'update', 'issue', 'record_response'],
        },
        {
          resource_key: 'deliveries',
          filters: [],
          sort_fields: ['delivery_status_rank', 'delivery_start', 'trade_id', 'leg_no'],
          actions: ['sync_from_trades', 'update', 'update_logistics_detail', 'update_pipeline_detail', 'update_power_detail', 'append_event'],
        },
        {
          resource_key: 'shipments',
          filters: [],
          sort_fields: ['delivery_status_rank', 'delivery_start', 'trade_id', 'leg_no'],
          actions: ['upsert_actualization'],
        },
        {
          resource_key: 'invoices',
          filters: ['trade_id'],
          sort_fields: ['due_at asc', 'updated_at desc', 'id desc'],
          actions: ['create', 'update'],
        },
        {
          resource_key: 'payments',
          filters: ['trade_id', 'invoice_id'],
          sort_fields: ['trade_id asc', 'due_at asc', 'id asc'],
          actions: ['create', 'update'],
        },
        {
          resource_key: 'work_items',
          filters: ['queue', 'include_closed', 'trade_id'],
          sort_fields: ['attention_rank'],
          actions: ['create', 'update', 'book_underlying'],
        },
      ])
      return
    }

    if (url.pathname === '/trades' && method === 'GET') {
      writeJson(response, trades)
      return
    }

    if (url.pathname === '/trades/metadata' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildFallbackTradeMetadata())
      return
    }

    if (url.pathname === '/positions' && method === 'GET') {
      writeJson(response, positions)
      return
    }

    if (url.pathname === '/option-exposures' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/confirmations' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/operations/work-items' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/reference/books' && method === 'GET') {
      writeJson(response, books)
      return
    }

    if (url.pathname === '/reference/commodities' && method === 'GET') {
      writeJson(response, commodities)
      return
    }

    if (url.pathname === '/reference/price-indices' && method === 'GET') {
      writeJson(response, priceIndices)
      return
    }

    if (url.pathname === '/reference/currencies' && method === 'GET') {
      writeJson(response, currencies)
      return
    }

    if (url.pathname === '/reference/units' && method === 'GET') {
      writeJson(response, units)
      return
    }

    if (url.pathname === '/reference/locations' && method === 'GET') {
      writeJson(response, locations)
      return
    }

    if (url.pathname === '/reference/locations/standards' && method === 'GET') {
      writeJson(response, {
        default_location_kind: 'POINT',
        default_location_type_by_kind: {
          POINT: 'HUB',
          REGION: 'REGION',
        },
        location_kinds: ['POINT', 'REGION'],
        location_types_by_kind: {
          POINT: ['HUB'],
          REGION: ['REGION'],
        },
        market_codes: ['PHYSICAL'],
        continent_codes: ['NA'],
      })
      return
    }

    if (url.pathname === '/reference/counterparties' && method === 'GET') {
      writeJson(response, counterparties)
      return
    }

    if (url.pathname === '/reference/counterparties/standards' && method === 'GET') {
      writeJson(response, {
        default_counterparty_type: 'SUPPLIER',
        counterparty_types: ['MARKETER', 'TRADER', 'UTILITY'],
        default_counterparty_credit_status: 'APPROVED',
        counterparty_credit_statuses: ['APPROVED', 'REVIEW_REQUIRED', 'ON_HOLD', 'BLOCKED'],
        default_counterparty_credit_breach_action: 'REQUIRE_APPROVAL',
        counterparty_credit_breach_actions: ['WARN', 'REQUIRE_APPROVAL', 'BLOCK'],
      })
      return
    }

    if (url.pathname === '/reference/portfolios' && method === 'GET') {
      writeJson(response, portfolios)
      return
    }

    if (url.pathname === '/reference/counterparties/credit-profiles' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/reference/counterparties/external-credit-snapshots' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/events' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(
        response,
        url.searchParams.get('aggregate_id') === 'T-AMEND-100' ? selectedTradeEvents : [],
      )
      return
    }

    if (url.pathname === '/layout-definitions/trades' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
      return
    }

    if (url.pathname === '/layout-definitions/dashboard' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
      return
    }

    if (url.pathname === '/layout-definitions/trades' && method === 'PUT') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const layout = payload as {
        order?: unknown
        hidden?: unknown
        spans?: unknown
      }

      writeJson(response, {
        workspace_id: 'trades',
        order: Array.isArray(layout.order) ? layout.order : [],
        hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
        spans:
          layout.spans && typeof layout.spans === 'object' && !Array.isArray(layout.spans)
            ? layout.spans
            : {},
        updated_at: '2026-04-11T00:00:00Z',
        updated_by: smokeSession.user.user_id,
        version: 1,
      })
      return
    }

    if (url.pathname === '/layout-definitions/dashboard' && method === 'PUT') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const layout = payload as {
        order?: unknown
        hidden?: unknown
        spans?: unknown
      }

      writeJson(response, {
        workspace_id: 'dashboard',
        order: Array.isArray(layout.order) ? layout.order : [],
        hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
        spans:
          layout.spans && typeof layout.spans === 'object' && !Array.isArray(layout.spans)
            ? layout.spans
            : {},
        updated_at: '2026-04-11T00:00:00Z',
        updated_by: smokeSession.user.user_id,
        version: 1,
      })
      return
    }

    if (url.pathname === '/weather/intelligence/overview' && method === 'GET') {
      writeJson(response, {
        analysis_mode: 'BASELINE',
        as_of_date: '2026-04-11',
        seasonal_regime: 'Late Winter',
        headline: 'Weather risk is muted in the current smoke scenario.',
        summary: 'No active regional weather signal is driving the seeded trade set.',
        latest_position_update_at: '2026-04-11T00:00:00Z',
        latest_weather_update_at: '2026-04-11T00:00:00Z',
        live_weather_location_count: 0,
        weather_sensitive_exposure_count: 0,
        weather_sensitive_gross_volume: 0,
        focus_areas: ['Maintain routine watch coverage.'],
        exposures: [],
        regional_signals: [],
        tracked_sources: [],
      })
      return
    }

    if (url.pathname === '/market-data/context' && method === 'GET') {
      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        commodity: null,
        price_indices: [
          {
            price_index_code: 'HH_IFERC',
            name: 'Henry Hub IFERC',
            commodity_code: 'HENRY_HUB_GAS',
            market: 'PHYSICAL',
            location_code: 'HENRY_HUB',
            observation_date: '2026-04-11',
            value: 3.21,
            unit_code: 'USD/MMBTU',
            currency_code: 'USD',
            source_provider: 'ICE',
            source_series_id: 'HH_IFERC',
            downloaded_at: '2026-04-11T00:00:00Z',
          },
        ],
        fundamentals: [],
        power: [],
        macro: [],
        positioning: [],
        freshness: [],
      })
      return
    }

    if (url.pathname === '/market-data/external-series' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/market-data/price-indices/HH_IFERC/observations' && method === 'GET') {
      writeJson(response, [
        {
          id: 1,
          price_index_code: 'HH_IFERC',
          observation_date: '2026-04-11',
          value: 3.21,
          unit_code: 'USD/MMBTU',
          currency_code: 'USD',
          source_provider: 'ICE',
          source_series_id: 'HH_IFERC',
          source_frequency: 'DAILY',
          source_published_at: '2026-04-11T00:00:00Z',
          source_revision: null,
          downloaded_at: '2026-04-11T00:00:00Z',
          run_id: 1,
          created_at: '2026-04-11T00:00:00Z',
          updated_at: '2026-04-11T00:00:00Z',
        },
      ])
      return
    }

    if (url.pathname === '/reports/pnl-history' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        basis: 'MARK_TO_MARKET',
        methodology: 'Daily marked P&L using stored market marks and settled cash movements.',
        point_count: 3,
        points: [
          {
            date: '2026-04-09',
            total_pnl: 7200,
            realized_pnl: 1200,
            unrealized_pnl: 6000,
            priced_trade_count: 1,
            realized_trade_count: 0,
            unrealized_trade_count: 1,
          },
          {
            date: '2026-04-10',
            total_pnl: 8050,
            realized_pnl: 1500,
            unrealized_pnl: 6550,
            priced_trade_count: 1,
            realized_trade_count: 0,
            unrealized_trade_count: 1,
          },
          {
            date: '2026-04-11',
            total_pnl: 8900,
            realized_pnl: 1800,
            unrealized_pnl: 7100,
            priced_trade_count: 1,
            realized_trade_count: 0,
            unrealized_trade_count: 1,
          },
        ],
        summary: {
          total_pnl: 8900,
          realized_pnl: 1800,
          unrealized_pnl: 7100,
          priced_trade_count: 1,
          realized_trade_count: 0,
          unrealized_trade_count: 1,
        },
        valuations: [],
      })
      return
    }

    unexpectedRequests.push(record)
    writeJson(
      response,
      { detail: `Unhandled mock route: ${method} ${url.pathname}${url.search}` },
      404,
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve())
    server.once('error', reject)
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object', 'Mock API server should expose a local address.')

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    expireSession: () => {
      sessionExpired = true
    },
    mutationRequests,
    unexpectedRequests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}

async function startViteAppServer(apiBase: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: ViteDevServer = await createViteServer({
    root: webRoot,
    configFile: false,
    logLevel: 'error',
    appType: 'spa',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  })

  await server.listen()

  const address = server.httpServer?.address()
  assert.ok(address && typeof address === 'object', 'Vite app server should expose a local address.')

  return {
    origin: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: async () => {
      await server.close()
    },
  }
}

export async function startSmokeHarness(
  options: StartSmokeHarnessOptions = {},
): Promise<SmokeHarness> {
  const mockApi = await startMockApiServer(options)
  const appServer = await startViteAppServer(mockApi.baseUrl)

  return {
    origin: appServer.origin,
    apiBaseUrl: mockApi.baseUrl,
    expireSession: mockApi.expireSession,
    mutationRequests: mockApi.mutationRequests,
    unexpectedRequests: mockApi.unexpectedRequests,
    close: async () => {
      const results = await Promise.allSettled([appServer.close(), mockApi.close()])
      const failure = results.find((result) => result.status === 'rejected')

      if (failure?.status === 'rejected') {
        throw failure.reason
      }
    },
  }
}

export async function seedApiBaseOverride(page: Page, harness: SmokeHarness): Promise<void> {
  await page.addInitScript(
    ({ apiBaseOverride }) => {
      window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
    },
    {
      apiBaseOverride: `${harness.origin}/api`,
    },
  )
}

export async function seedSignedInSession(page: Page, harness: SmokeHarness): Promise<void> {
  await page.addInitScript(
    ({ apiBaseOverride, session }) => {
      window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
      window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
    },
    {
      apiBaseOverride: `${harness.origin}/api`,
      session: smokeSession,
    },
  )
}

export async function dismissStartHereOverlay(page: Page): Promise<void> {
  const overlay = page.locator('.start-here-dialog')
  await overlay.waitFor()
  await overlay.getByRole('button', { name: 'Not Now' }).click()
  await overlay.waitFor({ state: 'hidden' })
}

export function formatRecordedRequests(requests: RecordedRequest[]): string {
  return requests.map((request) => `${request.method} ${request.path}${request.search}`).join('\n')
}

export function assertNoHarnessRequestFailures(harness: SmokeHarness): void {
  assert.equal(
    harness.unexpectedRequests.length,
    0,
    `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
  )
  assert.equal(
    harness.mutationRequests.length,
    0,
    `Unexpected mutation requests:\n${formatRecordedRequests(harness.mutationRequests)}`,
  )
}
