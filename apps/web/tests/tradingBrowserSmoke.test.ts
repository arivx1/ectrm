import assert from 'node:assert/strict'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { chromium, type Locator, type Page } from 'playwright'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import { test } from 'vitest'

import { buildFallbackTradeMetadata } from '../src/shared/tradeMetadata'

type RecordedRequest = {
  method: string
  path: string
  search: string
}

type MockApiServer = {
  baseUrl: string
  expireSession: () => void
  heartbeatRequests: RecordedRequest[]
  layoutRequests: RecordedRequest[]
  mutationRequests: RecordedRequest[]
  restoreSession: () => void
  unexpectedRequests: RecordedRequest[]
  close: () => Promise<void>
}

type StartMockApiServerOptions = {
  singleUserAuthEnabled?: boolean
}

type StoredLayoutResponse = {
  workspace_id: string
  order: string[]
  hidden: string[]
  spans: Record<string, string>
  sections: Record<string, string[]>
  updated_at: string
  updated_by: string
  version: number
}

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const smokeAccessToken = 'smoke-access-token'
const smokeSession = {
  sessionId: 'smoke-session-1',
  accessToken: smokeAccessToken,
  // Keep this comfortably in the future so the browser harness does not
  // accidentally boot into a signed-out state as wall-clock time moves on.
  expiresAt: '2099-01-01T00:00:00Z',
  user: {
    user_id: 'ops_admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    role: 'OPS_ADMIN',
  },
} as const

const publicRuntimeSettings = {
  app_version: 'smoke-build',
  database: {
    dialect: 'sqlite',
    name: 'smoke.db',
    size_bytes: 1024,
    table_count: 12,
    record_count: 42,
  },
  cors_allow_origins: ['http://127.0.0.1'],
  mutation_protection_enabled: true,
  bootstrap_admin_enabled: false,
  single_user_auth_enabled: false,
  google_auth: {
    enabled: false,
    client_id: null,
    auto_create_users: false,
  },
  session_ttl_hours: 24,
  eia_base_url: 'https://api.eia.gov',
  eia_timeout_seconds: 30,
  assistant: {
    enabled: false,
    default_provider: 'openai',
    effective_default_provider: null,
    configured_provider_count: 0,
    providers: [],
    available_tools: [],
    available_action_types: [],
  },
  pagination: {
    standard_default: 100,
    standard_max: 500,
    admin_default: 100,
    admin_max: 500,
  },
} as const

const books = [
  {
    code: 'GULF_GAS',
    name: 'Gulf Gas Book',
    is_active: true,
  },
  {
    code: 'WEST_POWER',
    name: 'West Power Desk',
    is_active: true,
  },
]

const commodities = [
  {
    code: 'HENRY_HUB_GAS',
    name: 'Henry Hub Gas',
    commodity_class: 'NATURAL_GAS',
    is_active: true,
  },
  {
    code: 'WAHA_GAS',
    name: 'Waha Gas',
    commodity_class: 'NATURAL_GAS',
    is_active: true,
  },
]

const priceIndices = [
  {
    code: 'HH_IFERC',
    name: 'Henry Hub IFERC',
    commodity_class: 'NATURAL_GAS',
    commodity_code: 'HENRY_HUB_GAS',
    currency_code: 'USD',
    unit_code: 'MMBTU',
    provider: 'ICE',
    is_active: true,
  },
]

const currencies = [
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    is_active: true,
  },
]

const units = [
  {
    code: 'MMBTU',
    name: 'Million British Thermal Units',
    commodity_class: 'NATURAL_GAS',
    dimension: 'ENERGY',
    precision: 2,
    is_active: true,
  },
  {
    code: 'USD/MMBTU',
    name: 'US Dollars per MMBtu',
    commodity_class: 'NATURAL_GAS',
    dimension: 'PRICE',
    precision: 4,
    is_active: true,
  },
]

const locations = [
  {
    code: 'HENRY_HUB',
    name: 'Henry Hub',
    location_kind: 'POINT',
    location_type: 'HUB',
    market: 'PHYSICAL',
    timezone: 'America/Chicago',
    is_active: true,
  },
  {
    code: 'WAHA_POOL',
    name: 'Waha Pool',
    location_kind: 'POINT',
    location_type: 'HUB',
    market: 'PHYSICAL',
    timezone: 'America/Chicago',
    is_active: true,
  },
]

const counterparties = [
  {
    code: 'ALPHA_MKT',
    name: 'Alpha Marketing',
    counterparty_type: 'MARKETER',
    credit_status: 'APPROVED',
    is_active: true,
  },
  {
    code: 'CASCADE_UTIL',
    name: 'Cascade Utility',
    counterparty_type: 'UTILITY',
    credit_status: 'APPROVED',
    is_active: true,
  },
  {
    code: 'BETA_PWR',
    name: 'Beta Power Trading',
    counterparty_type: 'TRADER',
    credit_status: 'ON_HOLD',
    is_active: true,
  },
]

const portfolios = [
  {
    code: 'GULF_PROMPT',
    name: 'Gulf Prompt Portfolio',
    book_code: 'GULF_GAS',
    is_active: true,
  },
  {
    code: 'WEST_BAL',
    name: 'West Balance Portfolio',
    book_code: 'WEST_POWER',
    is_active: true,
  },
]

const positions = [
  {
    commodity: 'HENRY_HUB_GAS',
    net_volume: 25000,
    updated_at: '2026-04-10T18:30:00Z',
  },
]

const trades = [
  {
    trade_id: 'T-AMEND-100',
    originating_option_trade_id: null,
    external_trade_id: 'ET-9001',
    source_system: 'ETRM',
    created_at: '2026-04-10T16:00:00Z',
    updated_at: '2026-04-10T16:05:00Z',
    execution_timestamp: '2026-04-10T16:00:00Z',
    trade_date: '2026-04-10',
    effective_start_date: '2026-05-01',
    effective_end_date: '2026-05-31',
    quality_spec: null,
    unit_of_measure: 'MMBTU',
    trade_currency_code: 'USD',
    location_code: 'HENRY_HUB',
    delivery_start: '2026-05-01',
    delivery_end: '2026-05-31',
    price_unit_code: 'USD/MMBTU',
    instrument_type: 'LINEAR',
    option_type: null,
    option_style: null,
    option_strike_price: null,
    option_expiration_date: null,
    trade_nature: 'PHYSICAL',
    trade_structure: 'SINGLE',
    trade_side: 'BUY',
    book: 'GULF_GAS',
    portfolio: 'GULF_PROMPT',
    counterparty: 'ALPHA_MKT',
    commodity_class: 'NATURAL_GAS',
    commodity: 'HENRY_HUB_GAS',
    pricing_type: 'FIXED',
    pricing_status: 'PENDING',
    confirmation_status: 'SENT',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    actualization_status: 'PENDING',
    price_index_code: null,
    price: 3.15,
    volume: 25000,
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    trader_user: 'trader.alpha',
    status: 'ACTIVE',
    last_event_id: 'evt-trade-amended-100',
    active_credit_exception: null,
    credit_approval_status: 'APPROVED',
    credit_hold_active: false,
    credit_hold_reason: null,
  },
]

const selectedTradeEvents = [
  {
    event_id: 'evt-trade-amended-100',
    aggregate_type: 'trade',
    aggregate_id: 'T-AMEND-100',
    event_type: 'TradeAmended',
    occurred_at: '2026-04-10T18:30:00Z',
    recorded_at: '2026-04-10T18:30:00Z',
    actor_id: 'ops_admin',
    correlation_id: 'corr-trade-amended-100',
    causation_id: 'evt-trade-created-100',
    schema_version: 2,
    payload: {
      confirmation_status: 'SENT',
      nomination_status: 'PENDING',
      trader_user: 'ops_admin',
    },
  },
  {
    event_id: 'evt-trade-invoice-updated-100',
    aggregate_type: 'trade',
    aggregate_id: 'T-AMEND-100',
    event_type: 'TradeInvoiceUpdated',
    occurred_at: '2026-04-10T17:45:00Z',
    recorded_at: '2026-04-10T17:45:00Z',
    actor_id: 'settlement_admin',
    correlation_id: 'corr-trade-invoice-updated-100',
    causation_id: 'evt-trade-created-100',
    schema_version: 1,
    payload: {
      invoice_status: 'ISSUED',
      payment_status: 'PENDING',
      settlement_status: 'PENDING',
    },
  },
  {
    event_id: 'evt-trade-created-100',
    aggregate_type: 'trade',
    aggregate_id: 'T-AMEND-100',
    event_type: 'TradeCreated',
    occurred_at: '2026-04-10T16:00:00Z',
    recorded_at: '2026-04-10T16:00:00Z',
    actor_id: 'ops_admin',
    correlation_id: null,
    causation_id: null,
    schema_version: 1,
    payload: {
      trade_id: 'T-AMEND-100',
      book: 'GULF_GAS',
      portfolio: 'GULF_PROMPT',
      counterparty: 'ALPHA_MKT',
      commodity_class: 'NATURAL_GAS',
      commodity: 'HENRY_HUB_GAS',
      pricing_type: 'FIXED',
      price: 3.15,
      volume: 25000,
    },
  },
]

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

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeSections(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([sectionId, itemIds]) => [
      sectionId,
      normalizeStringList(itemIds),
    ]),
  )
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

function buildWorkspaceSummary() {
  return {
    generated_at: '2026-04-11T00:00:00Z',
    trades: {
      total_count: trades.length,
      active_count: trades.length,
      priced_active_count: 1,
      pending_pricing_count: 1,
      pending_settlement_count: 1,
      tracked_book_count: 1,
      total_active_volume: 25000,
    },
    positions: { total_count: 1 },
    option_exposures: { total_count: 0 },
    deliveries: { total_count: 0 },
    confirmations: { total_count: 0 },
    work_items: {
      total_count: 0,
      operations_queue_count: 0,
      settlement_queue_count: 0,
    },
    invoices: { total_count: 0 },
    payments: { total_count: 0 },
    dashboard: {
      positions: {
        gross_exposure: 25000,
        position_count: 1,
        bucket_count: 1,
        buckets: [
          {
            commodity_class: 'NATURAL_GAS',
            unit_label: 'MMBTU',
            net_volume: 25000,
            commodity_count: 1,
          },
        ],
        largest_bucket: {
          commodity_class: 'NATURAL_GAS',
          unit_label: 'MMBTU',
          net_volume: 25000,
          commodity_count: 1,
        },
      },
      attention: {
        total_count: 1,
        confirmation_backlog_count: 0,
        nomination_backlog_count: 0,
        allocation_backlog_count: 0,
        invoice_backlog_count: 0,
        overdue_payment_count: 0,
        stale_pricing_count: 1,
        incomplete_ops_data_count: 0,
      },
    },
    settlement: {
      open_work_item_count: 0,
      invoice_pending_count: 0,
      payment_due_count: 0,
      settled_count: 0,
      trade_exception_count: 0,
      workflow_exception_count: 0,
      breakdown: [],
    },
  }
}

async function startMockApiServer(
  options: StartMockApiServerOptions = {},
): Promise<MockApiServer> {
  const layoutRequests: RecordedRequest[] = []
  const heartbeatRequests: RecordedRequest[] = []
  const mutationRequests: RecordedRequest[] = []
  const unexpectedRequests: RecordedRequest[] = []
  const layoutDefinitions: Record<string, StoredLayoutResponse | null> = {
    dashboard: null,
    operations: null,
    positions: null,
    reports: null,
    risk: null,
    settlement: null,
    shipments: null,
    trades: null,
  }
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

    if (method === 'PUT' && url.pathname.startsWith('/layout-definitions/')) {
      layoutRequests.push(record)
    }

    if (
      method !== 'GET' &&
      !(method === 'POST' && url.pathname === '/auth/heartbeat') &&
      !(method === 'POST' && url.pathname === '/auth/session') &&
      !(method === 'POST' && url.pathname === '/auth/single-user-session') &&
      !(method === 'PUT' && url.pathname.startsWith('/layout-definitions/'))
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
      heartbeatRequests.push(record)
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeNoContent(response)
      return
    }

    if (url.pathname === '/assistant/action-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, [])
      return
    }

    if (url.pathname === '/assistant/prompt-route-recommendations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, [])
      return
    }

    if (url.pathname === '/assistant/conversations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, [
        {
          conversation_id: 902,
          created_at: '2026-04-11T09:00:00Z',
          updated_at: '2026-04-11T09:08:00Z',
          user_id: smokeSession.user.user_id,
          user_role: smokeSession.user.role,
          workspace: 'assistant',
          agent_id: null,
          agent_name: null,
          provider: 'openai',
          model: 'gpt-5.4',
          use_live_tools: true,
          title: 'Recent blocker triage',
          run_count: 1,
          latest_run_id: 8801,
          latest_user_message: 'Where should I handle the confirmation blocker?',
          latest_assistant_message: 'Operations is the right place to continue.',
        },
      ])
      return
    }

    const assistantConversationMatch = url.pathname.match(/^\/assistant\/conversations\/(\d+)$/)
    if (assistantConversationMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, {
        conversation_id: Number(assistantConversationMatch[1]),
        created_at: '2026-04-11T09:00:00Z',
        updated_at: '2026-04-11T09:08:00Z',
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        workspace: 'assistant',
        agent_id: null,
        agent_name: null,
        provider: 'openai',
        model: 'gpt-5.4',
        use_live_tools: true,
        title: 'Recent blocker triage',
        run_count: 1,
        latest_run_id: 8801,
        latest_user_message: 'Where should I handle the confirmation blocker?',
        latest_assistant_message: 'Operations is the right place to continue.',
        messages: [],
      })
      return
    }

    if (url.pathname === '/operations/workspace-summary' && method === 'GET') {
      writeJson(response, buildWorkspaceSummary())
      return
    }

    if (url.pathname === '/operations/system-overview' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T09:05:00Z',
        server_status: 'ok',
        database_status: 'ok',
        database: {
          dialect: 'sqlite',
          name: 'smoke.db',
          size_bytes: 1024,
          table_count: 12,
          record_count: 42,
        },
        uptime_seconds: 172800,
        presence_window_seconds: 3600,
        active_session_count: 1,
        active_user_count: 1,
        registered_user_count: 2,
        active_account_count: 2,
        open_trade_count: trades.length,
        events_last_hour: 2,
        last_event_recorded_at: '2026-04-11T09:00:00Z',
        dependency_count: 1,
        healthy_dependency_count: 1,
        dependencies: [
          {
            key: 'assistant-provider-openai',
            label: 'OpenAI Provider',
            provider: 'OPENAI',
            run_status: 'IDLE',
            health_status: 'healthy',
            success_sla_hours: 24,
            last_run_at: '2026-04-11T08:50:00Z',
            last_success_at: '2026-04-11T08:50:00Z',
            error_summary: null,
          },
        ],
      })
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

    if (url.pathname === '/deliveries' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/operations/work-items' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/invoices' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/payments' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/documents/settings' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        enabled: true,
        default_provider: 'openai',
        effective_default_provider: 'openai',
        configured_provider_count: 1,
        providers: [
          {
            provider: 'openai',
            label: 'OpenAI',
            enabled: true,
            configured: true,
            is_default: true,
            default_model: 'gpt-5.4-mini',
            base_url: 'https://api.openai.com/v1',
            setup_env_var: 'OPENAI_API_KEY',
          },
        ],
      })
      return
    }

    if (url.pathname === '/documents/schema-registry' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        version: 'smoke-1',
        document_kinds: [],
      })
      return
    }

    if (url.pathname === '/documents' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/external-data/runs' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/external-data/status' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
      return
    }

    if (url.pathname === '/admin/trading-sources' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/weather/locations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/weather/sync/status' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
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

      const aggregateId = url.searchParams.get('aggregate_id')?.trim() ?? ''
      if (aggregateId) {
        writeJson(response, aggregateId === 'T-AMEND-100' ? selectedTradeEvents : [])
        return
      }

      writeJson(response, selectedTradeEvents)
      return
    }

    if (url.pathname.startsWith('/layout-definitions/') && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const workspaceId = url.pathname.slice('/layout-definitions/'.length)
      if (!(workspaceId in layoutDefinitions)) {
        writeJson(response, { detail: `Unknown layout workspace: ${workspaceId}` }, 404)
        return
      }

      writeJson(response, layoutDefinitions[workspaceId])
      return
    }

    if (url.pathname.startsWith('/layout-definitions/') && method === 'PUT') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const workspaceId = url.pathname.slice('/layout-definitions/'.length)
      if (!(workspaceId in layoutDefinitions)) {
        writeJson(response, { detail: `Unknown layout workspace: ${workspaceId}` }, 404)
        return
      }

      const layout = payload as {
        order?: unknown
        hidden?: unknown
        spans?: unknown
        sections?: unknown
      }
      const nextLayout: StoredLayoutResponse = {
        workspace_id: workspaceId,
        order: normalizeStringList(layout.order),
        hidden: normalizeStringList(layout.hidden),
        spans: layout.spans && typeof layout.spans === 'object' && !Array.isArray(layout.spans) ? layout.spans : {},
        sections: normalizeSections(layout.sections),
        updated_at: '2026-04-11T00:00:00Z',
        updated_by: smokeSession.user.user_id,
        version: (layoutDefinitions[workspaceId]?.version ?? 0) + 1,
      }

      layoutDefinitions[workspaceId] = nextLayout
      writeJson(response, nextLayout)
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
    heartbeatRequests,
    layoutRequests,
    mutationRequests,
    restoreSession: () => {
      sessionExpired = false
    },
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

function searchField(input: Locator): Locator {
  return input.locator('xpath=ancestor::div[contains(@class, "trade-search-field")][1]')
}

async function helperTextFor(input: Locator): Promise<string> {
  return (await searchField(input).locator('.trade-search-helper').textContent()) ?? ''
}

async function selectSearchOption(
  scope: Locator,
  placeholder: string,
  query: string,
  optionText: string,
): Promise<Locator> {
  const input = scope.getByPlaceholder(placeholder)
  await input.click()
  await input.fill(query)

  const option = searchField(input).locator('.trade-search-option', { hasText: optionText }).first()
  try {
    await option.waitFor({ state: 'visible', timeout: 1500 })
    await option.click()
    return input
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') {
      throw error
    }
  }

  await input.fill(optionText)
  await input.press('Tab')
  return input
}

async function dismissStartHereOverlay(page: Page): Promise<void> {
  const overlay = page.locator('.start-here-dialog')
  await overlay.waitFor()
  await overlay.getByRole('button', { name: 'Not Now' }).click()
  await overlay.waitFor({ state: 'hidden' })
}

async function dismissStartHereOverlayIfPresent(page: Page): Promise<void> {
  const overlay = page.locator('.start-here-dialog')
  try {
    await overlay.waitFor({ state: 'visible', timeout: 2000 })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return
    }
    throw error
  }

  await overlay.getByRole('button', { name: 'Not Now' }).click()
  await overlay.waitFor({ state: 'hidden' })
}

async function dragBetweenLocators(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  assert.ok(sourceBox, 'Expected drag source to be visible.')
  assert.ok(targetBox, 'Expected drag target to be visible.')

  const sourceX = sourceBox.x + sourceBox.width / 2
  const sourceY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2

  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.mouse.move(sourceX + 12, sourceY + 12, { steps: 6 })
  await page.mouse.move(targetX, targetY, { steps: 20 })
  await page.mouse.up()
}

async function waitForRecordedRequest(
  requests: RecordedRequest[],
  predicate: (request: RecordedRequest, index: number) => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const startedAt = Date.now()
  while (!requests.some(predicate)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for recorded request.\n${formatRecordedRequests(requests)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function waitForGlobalWorkspaceFilter(page: Page, value: string): Promise<void> {
  await page.waitForFunction((expectedValue) => {
    const inputs = Array.from(document.querySelectorAll('input'))
    const globalSearchInput = inputs.find(
      (candidate) =>
        candidate instanceof HTMLInputElement &&
        candidate.placeholder === 'Workspace, trade, delivery, counterparty, book, or provider',
    )

    return globalSearchInput instanceof HTMLInputElement && globalSearchInput.value === expectedValue
  }, value)
}

async function waitForCollapsedGlobalWorkspaceFilter(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: 'Show filter' }).waitFor()
  await page.locator('.nav-global-filter-summary-value', { hasText: `"${value}"` }).waitFor()
}

async function triggerSessionExpiry(page: Page, mockApi: MockApiServer): Promise<void> {
  const previousHeartbeatCount = mockApi.heartbeatRequests.length
  mockApi.expireSession()
  await page.evaluate(() => {
    window.dispatchEvent(new FocusEvent('focus'))
  })
  await waitForRecordedRequest(
    mockApi.heartbeatRequests,
    (_, index) => index >= previousHeartbeatCount,
  )
  await page.waitForFunction(
    () =>
      window.localStorage.getItem('ectrm.auth-session') === null &&
      window.localStorage.getItem('ectrm.auth-interruption-resume') !== null,
  )
}

async function readMobileShellMetrics(page: Page): Promise<{
  mainStageWidth: number
  shellTrackCount: number
  sideRailHidden: boolean
  sideRailVisible: boolean
  mobileTopbarVisible: boolean
  viewportWidth: number
}> {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell')
    const mainStage = document.querySelector('.main-stage')
    const sideRail = document.querySelector('.side-rail')
    const mobileTopbar = document.querySelector('.mobile-topbar')
    if (!(shell instanceof HTMLElement) || !(mainStage instanceof HTMLElement) || !(sideRail instanceof HTMLElement) || !(mobileTopbar instanceof HTMLElement)) {
      throw new Error('Expected shell elements were not rendered.')
    }

    return {
      mainStageWidth: Math.round(mainStage.getBoundingClientRect().width),
      shellTrackCount: getComputedStyle(shell).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      sideRailHidden: sideRail.hasAttribute('hidden'),
      sideRailVisible: getComputedStyle(sideRail).display !== 'none' && !sideRail.hasAttribute('hidden'),
      mobileTopbarVisible: getComputedStyle(mobileTopbar).display !== 'none',
      viewportWidth: window.innerWidth,
    }
  })
}

function formatRecordedRequests(requests: RecordedRequest[]): string {
  return requests.map((request) => `${request.method} ${request.path}${request.search}`).join('\n')
}

test(
  'trading browser smoke keeps create and amend search flows submit-ready',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=trades&trade=T-AMEND-100`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlay(page)

      await page.waitForFunction(() => {
        const button = document.querySelector('form.trade-form.trade-form-feature button[type="submit"]')
        return button instanceof HTMLButtonElement && !button.disabled
      })

      const createForm = page.locator('form.trade-form.trade-form-feature')
      assert.equal(await createForm.getByLabel('External Trade ID').isVisible(), false)
      assert.equal(await createForm.getByLabel('Trade Date').isVisible(), false)
      assert.equal(await createForm.getByLabel('Pricing Status').isVisible(), false)

      await createForm.locator('summary', { hasText: 'Desk Metadata' }).click()
      assert.equal(await createForm.getByLabel('External Trade ID').isVisible(), true)

      await createForm.locator('summary', { hasText: 'Schedule Overrides' }).click()
      assert.equal(await createForm.getByLabel('Trade Date').isVisible(), true)

      await createForm.locator('summary', { hasText: 'Workflow Defaults' }).click()
      assert.equal(await createForm.getByLabel('Pricing Status').isVisible(), true)

      const createBookInput = await selectSearchOption(
        createForm,
        'Search by book name or code',
        'west',
        'West Power Desk',
      )
      assert.equal(await createBookInput.inputValue(), 'West Power Desk (WEST_POWER)')
      assert.match(await helperTextFor(createBookInput), /Booking into WEST_POWER\./)

      const createPortfolioInput = await selectSearchOption(
        createForm,
        'Search by portfolio name or code',
        'west balance',
        'West Balance Portfolio',
      )
      assert.equal(await createPortfolioInput.inputValue(), 'West Balance Portfolio (WEST_BAL)')
      assert.match(await helperTextFor(createPortfolioInput), /Allocating to WEST_BAL\./)

      const createCounterpartyInput = await selectSearchOption(
        createForm,
        'Search by name or code',
        'cascade',
        'Cascade Utility',
      )
      assert.equal(await createCounterpartyInput.inputValue(), 'Cascade Utility (CASCADE_UTIL)')
      assert.match(await helperTextFor(createCounterpartyInput), /Submitting as CASCADE_UTIL\./)

      const createLocationInput = await selectSearchOption(
        createForm,
        'Search by location name or code',
        'waha',
        'Waha Pool',
      )
      assert.equal(await createLocationInput.inputValue(), 'Waha Pool (WAHA_POOL)')
      assert.match(await helperTextFor(createLocationInput), /Delivering at WAHA_POOL\./)

      const createCommodityInput = await selectSearchOption(
        createForm,
        'Search by commodity name or code',
        'waha',
        'Waha Gas',
      )
      assert.equal(await createCommodityInput.inputValue(), 'Waha Gas (WAHA_GAS)')
      assert.match(await helperTextFor(createCommodityInput), /Ticketing WAHA_GAS\./)

      const createSubmitButton = createForm.getByRole('button', { name: 'Create Trade' })
      assert.equal(await createSubmitButton.isDisabled(), false)

      await page.waitForFunction(() => {
        const amendButton = Array.from(document.querySelectorAll('button')).find(
          (candidate) => candidate.textContent?.trim() === 'Amend',
        )
        return amendButton instanceof HTMLButtonElement && !amendButton.disabled
      })

      await page.getByRole('button', { name: 'Amend', exact: true }).click()

      const amendForm = page.locator('form.stack-form')
      await amendForm.waitFor()
      await page.waitForFunction(() => {
        const previewHeading = document.querySelector('form.stack-form .trade-review-card strong')
        return previewHeading?.textContent?.trim() === 'No changes staged yet'
      })
      assert.equal(await amendForm.getByLabel('External Trade ID').isVisible(), false)
      assert.equal(await amendForm.getByLabel('Trade Date').isVisible(), false)
      assert.equal(await amendForm.getByLabel('Pricing Status').isVisible(), false)

      await amendForm.locator('summary', { hasText: 'Desk Metadata' }).click()
      assert.equal(await amendForm.getByLabel('External Trade ID').isVisible(), true)

      await amendForm.locator('summary', { hasText: 'Schedule Overrides' }).click()
      assert.equal(await amendForm.getByLabel('Trade Date').isVisible(), true)

      await amendForm.locator('summary', { hasText: 'Workflow Statuses' }).click()
      assert.equal(await amendForm.getByLabel('Pricing Status').isVisible(), true)

      const amendCounterpartyInput = await selectSearchOption(
        amendForm,
        'Search by name or code',
        'cascade',
        'Cascade Utility',
      )
      assert.equal(await amendCounterpartyInput.inputValue(), 'Cascade Utility (CASCADE_UTIL)')
      assert.match(await helperTextFor(amendCounterpartyInput), /Submitting as CASCADE_UTIL\./)

      const amendBookInput = await selectSearchOption(
        amendForm,
        'Search by book name or code',
        'west',
        'West Power Desk',
      )
      assert.equal(await amendBookInput.inputValue(), 'West Power Desk (WEST_POWER)')
      assert.match(await helperTextFor(amendBookInput), /Amending into WEST_POWER\./)

      await page.waitForFunction(() => {
        const input = document.querySelector(
          'form.stack-form input[placeholder="Search by portfolio name or code"]',
        )
        return input instanceof HTMLInputElement && input.value === ''
      })

      const amendPortfolioInput = await selectSearchOption(
        amendForm,
        'Search by portfolio name or code',
        'west balance',
        'West Balance Portfolio',
      )
      assert.equal(await amendPortfolioInput.inputValue(), 'West Balance Portfolio (WEST_BAL)')
      assert.match(await helperTextFor(amendPortfolioInput), /Amending within WEST_BAL\./)

      const amendLocationInput = await selectSearchOption(
        amendForm,
        'Search by location name or code',
        'waha',
        'Waha Pool',
      )
      assert.equal(await amendLocationInput.inputValue(), 'Waha Pool (WAHA_POOL)')
      assert.match(await helperTextFor(amendLocationInput), /Amending location to WAHA_POOL\./)

      const amendCommodityInput = await selectSearchOption(
        amendForm,
        'Search by commodity name or code',
        'waha',
        'Waha Gas',
      )
      assert.equal(await amendCommodityInput.inputValue(), 'Waha Gas (WAHA_GAS)')
      assert.match(await helperTextFor(amendCommodityInput), /Amending commodity to WAHA_GAS\./)

      await page.waitForFunction(() => {
        const submit = document.querySelector('form.stack-form button[type="submit"]')
        return submit instanceof HTMLButtonElement &&
          !submit.disabled &&
          submit.textContent?.trim() === 'Apply 5 Changes'
      })

      const amendPreviewText = (await amendForm.locator('.trade-review-card').textContent()) ?? ''
      assert.match(amendPreviewText, /Amendment Preview \(5\)/)
      assert.match(amendPreviewText, /Book/)
      assert.match(amendPreviewText, /Portfolio/)
      assert.match(amendPreviewText, /Counterparty/)
      assert.match(amendPreviewText, /Location/)
      assert.match(amendPreviewText, /Commodity/)

      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'mobile shell keeps the main stage full-width and the nav drawer behaves like an overlay',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage({
        viewport: {
          width: 390,
          height: 844,
        },
      })
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlayIfPresent(page)

      const closedMetrics = await readMobileShellMetrics(page)
      assert.equal(closedMetrics.mobileTopbarVisible, true)
      assert.equal(closedMetrics.sideRailHidden, true)
      assert.equal(closedMetrics.sideRailVisible, false)
      assert.equal(closedMetrics.shellTrackCount, 1)
      assert.ok(
        closedMetrics.mainStageWidth >= closedMetrics.viewportWidth - 48,
        `Expected full-width main stage on mobile, received ${closedMetrics.mainStageWidth}px for a ${closedMetrics.viewportWidth}px viewport.`,
      )

      await page.getByRole('button', { name: 'Open navigation menu' }).click()
      await page.waitForFunction(() => {
        const sideRail = document.querySelector('.side-rail')
        return sideRail instanceof HTMLElement && !sideRail.hasAttribute('hidden')
      })

      const openMetrics = await readMobileShellMetrics(page)
      assert.equal(openMetrics.sideRailHidden, false)
      assert.equal(openMetrics.sideRailVisible, true)
      assert.ok(
        Math.abs(openMetrics.mainStageWidth - closedMetrics.mainStageWidth) <= 16,
        `Expected drawer open state to preserve main-stage width, changed from ${closedMetrics.mainStageWidth}px to ${openMetrics.mainStageWidth}px.`,
      )

      await page.getByRole('button', { name: 'Close navigation menu' }).click()
      await page.waitForFunction(() => {
        const sideRail = document.querySelector('.side-rail')
        return sideRail instanceof HTMLElement && sideRail.hasAttribute('hidden')
      })

      const restoredMetrics = await readMobileShellMetrics(page)
      assert.equal(restoredMetrics.sideRailHidden, true)
      assert.ok(
        restoredMetrics.mainStageWidth >= restoredMetrics.viewportWidth - 48,
        `Expected restored mobile width after closing drawer, received ${restoredMetrics.mainStageWidth}px for a ${restoredMetrics.viewportWidth}px viewport.`,
      )
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'navigation onboarding smoke keeps section starts and dashboard quick starts actionable',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?section=trading`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlayIfPresent(page)

      await page.getByRole('heading', { name: 'Capture trades and understand exposure' }).waitFor()
      await page.getByText('Pick the job you are doing first').waitFor()
      await page
        .locator('.section-start-card', { hasText: 'Investigate a trade issue' })
        .first()
        .getByRole('link', { name: 'Open Activity Feed' })
        .click()

      await page.waitForFunction(() => window.location.search.includes('view=events'))
      await page.getByRole('heading', { name: 'Trace recent trade and platform activity' }).waitFor()

      assert.match(page.url(), /\?view=events(?:&|$)/)

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlayIfPresent(page)

      await page.getByText('Common Starting Points').waitFor()
      await page
        .locator('.dashboard-start-card', { hasText: 'Check exposure' })
        .first()
        .getByRole('button', { name: 'Open Exposure' })
        .click()

      await page.waitForFunction(() => window.location.search.includes('view=risk'))
      await page.getByRole('heading', { name: 'Check exposure, pricing gaps, and expiry risk' }).waitFor()

      assert.match(page.url(), /\?view=risk(?:&|$)/)

      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'start-here onboarding appears once while signed out and once per authenticated session',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(({ apiBaseOverride }) => {
        window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
      }, { apiBaseOverride: `${appServer.origin}/api` })

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })

      const signedOutOverlay = page.locator('.start-here-dialog')
      await signedOutOverlay.waitFor()
      await signedOutOverlay.getByRole('button', { name: 'Sign In for Trade Capture' }).waitFor()

      await signedOutOverlay.getByRole('button', { name: 'Open How It Works' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=guide'))
      await signedOutOverlay.waitFor({ state: 'hidden' })

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => !document.querySelector('.start-here-dialog'))

      await page.evaluate((session) => {
        window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
      }, smokeSession)

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })

      const signedInOverlay = page.locator('.start-here-dialog')
      await signedInOverlay.waitFor()
      await signedInOverlay.getByRole('button', { name: 'Open Exposure' }).waitFor()

      await signedInOverlay.getByRole('button', { name: 'Open Exposure' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=risk'))
      await signedInOverlay.waitFor({ state: 'hidden' })

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => !document.querySelector('.start-here-dialog'))

      assert.match(page.url(), /\?view=risk(?:&|$)/)
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'signed-in start-here routes into activity triage and hands off to operations',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })

      const signedInOverlay = page.locator('.start-here-dialog')
      await signedInOverlay.waitFor()
      await signedInOverlay.getByRole('button', { name: 'Open Activity Feed' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=events'))
      await page.getByRole('heading', { name: 'Trace recent trade and platform activity' }).waitFor()
      await page.getByText('Work the post-trade queue next').waitFor()

      const amendmentEventCard = page.locator('.timeline-item-card', { hasText: 'TradeAmended' }).first()
      await amendmentEventCard.getByText('Amendment changed post-trade workflow state:').waitFor()
      await amendmentEventCard.locator('.entity-chip', { hasText: 'Confirmation SENT' }).first().waitFor()

      await page.getByRole('button', { name: 'Open Work Queue' }).first().click()

      await page.waitForFunction(() => window.location.search.includes('view=operations'))
      await page.getByRole('heading', { name: 'Clear post-trade blockers and handoffs' }).waitFor()
      await page.getByText('Opened from Activity Feed for T-AMEND-100').waitFor()
      await page
        .getByText('This workspace started focused on that trade so you can clear the matching queue items before widening back to the full book.')
        .waitFor()
      await waitForGlobalWorkspaceFilter(page, 'T-AMEND-100')
      await waitForCollapsedGlobalWorkspaceFilter(page, 'T-AMEND-100')

      assert.match(page.url(), /\bview=operations\b/)
      assert.match(page.url(), /\bhandoff=events\b/)
      assert.match(page.url(), /\bfocusTrade=T-AMEND-100\b/)
      assert.match(page.url(), /\beventType=TradeAmended\b/)
      assert.equal((await page.locator('.nav-global-filter-summary-value').textContent())?.trim(), '"T-AMEND-100"')

      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'activity triage hands off settlement issues with the same trade focus',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })

      const signedInOverlay = page.locator('.start-here-dialog')
      await signedInOverlay.waitFor()
      await signedInOverlay.getByRole('button', { name: 'Open Activity Feed' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=events'))
      await page.getByRole('heading', { name: 'Trace recent trade and platform activity' }).waitFor()

      const settlementEventCard = page.locator('.timeline-item-card', { hasText: 'TradeInvoiceUpdated' }).first()
      await settlementEventCard.getByText('Invoice follow-through changed Invoice ISSUED, Payment PENDING, and Settlement PENDING.').waitFor()
      await settlementEventCard.getByRole('button', { name: 'Open Settlement' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=settlement'))
      await page.getByRole('heading', { name: 'Issue invoices, track cash, and clear disputes' }).waitFor()
      await page.getByText('Opened from Activity Feed for T-AMEND-100').waitFor()
      await page
        .getByText('This workspace started focused on that trade so invoice, payment, and dispute follow-through stay anchored to the same issue.')
        .waitFor()
      await waitForGlobalWorkspaceFilter(page, 'T-AMEND-100')
      await waitForCollapsedGlobalWorkspaceFilter(page, 'T-AMEND-100')

      assert.match(page.url(), /\bview=settlement\b/)
      assert.match(page.url(), /\bhandoff=events\b/)
      assert.match(page.url(), /\bfocusTrade=T-AMEND-100\b/)
      assert.match(page.url(), /\beventType=TradeInvoiceUpdated\b/)
      assert.equal((await page.locator('.nav-global-filter-summary-value').textContent())?.trim(), '"T-AMEND-100"')
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'signed-out start-here sign-in intent returns the user to trade capture',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(({ apiBaseOverride }) => {
        window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
      }, { apiBaseOverride: `${appServer.origin}/api` })

      await page.goto(`${appServer.origin}/?view=dashboard`, {
        waitUntil: 'domcontentloaded',
      })

      const signedOutOverlay = page.locator('.start-here-dialog')
      await signedOutOverlay.waitFor()
      await signedOutOverlay.getByRole('button', { name: 'Sign In for Trade Capture' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=settings'))
      await signedOutOverlay.waitFor({ state: 'hidden' })

      const authGate = page.locator('.auth-gate-stage')
      await authGate.waitFor()
      await authGate
        .getByText("After sign-in, opening Trade Capture. We'll take you straight there after authentication succeeds.")
        .waitFor()

      await page.getByLabel('User ID or Email').fill('ops_admin')
      await page.getByLabel('Password').fill('demo-password')
      await page.getByRole('button', { name: 'Enter Console' }).click()

      await page.waitForFunction(() => window.location.search.includes('view=trades'))
      await page.waitForFunction(() => {
        const button = document.querySelector('form.trade-form.trade-form-feature button[type="submit"]')
        return button instanceof HTMLButtonElement && !button.disabled
      })
      await page.waitForFunction(() => !document.querySelector('.start-here-dialog'))

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => !document.querySelector('.start-here-dialog'))
      await page.waitForFunction(() => {
        const button = document.querySelector('form.trade-form.trade-form-feature button[type="submit"]')
        return button instanceof HTMLButtonElement && !button.disabled
      })

      assert.match(page.url(), /\?view=trades(?:&|$)/)
      assert.equal(await page.locator('form.trade-form.trade-form-feature').isVisible(), true)
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'risk browser smoke persists nested summary card order after refresh',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=risk`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlay(page)
      await page.locator('.workspace-tile').first().waitFor()

      const riskSummaryTile = page.locator('.workspace-tile', {
        hasText: 'Risk Snapshot',
      })
      await riskSummaryTile.waitFor()

      const cards = riskSummaryTile.locator('.dashboard-report-card')
      await cards.first().waitFor()

      assert.equal((await cards.nth(0).locator('span').first().textContent())?.trim(), 'Gross Linear Exposure')
      assert.equal((await cards.nth(1).locator('span').first().textContent())?.trim(), 'Pricing Coverage')

      const pricingCoverageHandle = cards.nth(1).getByRole('button', { name: 'Drag Pricing Coverage' })
      await dragBetweenLocators(page, pricingCoverageHandle, cards.nth(0))

      await page.waitForFunction(() => {
        const tile = Array.from(document.querySelectorAll('.workspace-tile')).find((candidate) =>
          candidate.textContent?.includes('Risk Snapshot'),
        )
        const firstLabel = tile?.querySelector('.dashboard-report-card span')
        return firstLabel?.textContent?.trim() === 'Pricing Coverage'
      })

      await waitForRecordedRequest(
        mockApi.layoutRequests,
        (request) => request.method === 'PUT' && request.path === '/layout-definitions/risk',
      )

      await page.evaluate(() => {
        window.localStorage.removeItem('ectrm.tile-layout.risk.v1')
      })

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => !document.querySelector('.start-here-dialog'))
      await page.locator('.workspace-tile').first().waitFor()

      const refreshedTile = page.locator('.workspace-tile', {
        hasText: 'Risk Snapshot',
      })
      await refreshedTile.waitFor()

      const refreshedCards = refreshedTile.locator('.dashboard-report-card')
      await refreshedCards.first().waitFor()
      assert.equal((await refreshedCards.nth(0).locator('span').first().textContent())?.trim(), 'Pricing Coverage')
      assert.equal((await refreshedCards.nth(1).locator('span').first().textContent())?.trim(), 'Gross Linear Exposure')

      assert.ok(
        mockApi.layoutRequests.some(
          (request) => request.method === 'PUT' && request.path === '/layout-definitions/risk',
        ),
        `Expected nested layout persistence request.\n${formatRecordedRequests(mockApi.layoutRequests)}`,
      )
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'single-user auth signs into the prompt home when the API enables one-click access',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer({ singleUserAuthEnabled: true })
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(({ apiBaseOverride }) => {
        window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
      }, { apiBaseOverride: `${appServer.origin}/api` })

      await page.goto(appServer.origin, {
        waitUntil: 'domcontentloaded',
      })

      await page.getByText('Start with the job in front of you').waitFor()
      await page.getByRole('button', { name: 'Sign In', exact: true }).click()

      const authGate = page.locator('.auth-gate-stage')
      await authGate.waitFor()
      await authGate.getByText('Password · Single-user').waitFor()

      await page.getByRole('button', { name: 'Use local OPS_ADMIN session' }).click()

      await page.waitForFunction(() => !document.querySelector('.auth-gate-stage'))
      await page.getByText('Start with the job in front of you').waitFor()
      await page.getByText('Signed in as Ops Admin').waitFor()

      assert.ok(
        page.url() === `${appServer.origin}/` || page.url() === `${appServer.origin}/?view=prompt`,
        `Expected the single-user flow to land on the prompt home, received ${page.url()}.`,
      )
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'session expiration during amend captures the trade amendment resume snapshot',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=trades&trade=T-AMEND-100`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlay(page)

      await page.getByRole('button', { name: 'Amend', exact: true }).click()
      const amendForm = page.locator('form.stack-form')
      await amendForm.waitFor()
      await page.waitForFunction(() => {
        const previewHeading = document.querySelector('form.stack-form .trade-review-card strong')
        return previewHeading?.textContent?.trim() === 'No changes staged yet'
      })

      await triggerSessionExpiry(page, mockApi)
      const interruptionSnapshot = await page.evaluate(() => window.localStorage.getItem('ectrm.auth-interruption-resume'))
      const storedSession = await page.evaluate(() => window.localStorage.getItem('ectrm.auth-session'))
      assert.match(page.url(), /\?view=trades&trade=T-AMEND-100(?:&|$)/)
      assert.equal(storedSession, null)
      assert.ok(interruptionSnapshot, 'Expected an auth interruption resume snapshot to be stored.')
      assert.deepEqual(JSON.parse(interruptionSnapshot as string), {
        reason: 'session_expired',
        url: '/?view=trades&trade=T-AMEND-100',
        continueLabel: 'the amendment for trade T-AMEND-100',
        inspectorTab: 'amend',
      })
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)

test(
  'session expiration during exposure returns to the same workspace after re-authentication',
  { timeout: 120_000 },
  async () => {
    const mockApi = await startMockApiServer()
    const appServer = await startViteAppServer(mockApi.baseUrl)
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.addInitScript(
        ({ apiBaseOverride, session }) => {
          window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
          window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
        },
        {
          apiBaseOverride: `${appServer.origin}/api`,
          session: smokeSession,
        },
      )

      await page.goto(`${appServer.origin}/?view=risk`, {
        waitUntil: 'domcontentloaded',
      })
      await dismissStartHereOverlay(page)
      await page.getByRole('heading', { name: 'Check exposure, pricing gaps, and expiry risk' }).waitFor()

      await triggerSessionExpiry(page, mockApi)
      await page.waitForFunction(() => {
        const snapshot = window.localStorage.getItem('ectrm.auth-interruption-resume')
        return snapshot !== null && snapshot.includes('Exposure')
      })
      mockApi.restoreSession()
      await page.evaluate((session) => {
        window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
      }, smokeSession)
      await page.goto(`${appServer.origin}/?view=risk`, {
        waitUntil: 'domcontentloaded',
      })

      await page.waitForFunction(() => window.location.search.includes('view=risk'))
      await page.getByRole('heading', { name: 'Check exposure, pricing gaps, and expiry risk' }).waitFor()

      assert.match(page.url(), /\?view=risk(?:&|$)/)
      assert.equal(
        mockApi.unexpectedRequests.length,
        0,
        `Unhandled mock API requests:\n${formatRecordedRequests(mockApi.unexpectedRequests)}`,
      )
      assert.equal(
        mockApi.mutationRequests.length,
        0,
        `Unexpected mutation requests:\n${formatRecordedRequests(mockApi.mutationRequests)}`,
      )
    } finally {
      await browser.close()
      await appServer.close()
      await mockApi.close()
    }
  },
)
