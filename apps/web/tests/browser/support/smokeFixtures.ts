export type RecordedRequest = {
  method: string
  path: string
  search: string
}

export const smokeAccessToken = 'smoke-access-token'

export const smokeSession = {
  sessionId: 'smoke-session-1',
  accessToken: smokeAccessToken,
  expiresAt: '2099-01-01T00:00:00Z',
  user: {
    user_id: 'ops_admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    role: 'OPS_ADMIN',
  },
} as const

export const publicRuntimeSettings = {
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
  },
  pagination: {
    standard_default: 100,
    standard_max: 500,
    admin_default: 100,
    admin_max: 500,
  },
} as const

export const books = [
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

export const commodities = [
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

export const priceIndices = [
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

export const currencies = [
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    is_active: true,
  },
]

export const units = [
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

export const locations = [
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

export const counterparties = [
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
]

export const portfolios = [
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

export const positions = [
  {
    commodity: 'HENRY_HUB_GAS',
    net_volume: 25000,
    updated_at: '2026-04-10T16:05:00Z',
  },
]

export const trades = [
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
    confirmation_status: 'PENDING',
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
    last_event_id: 'evt-trade-created-100',
    active_credit_exception: null,
    credit_approval_status: 'APPROVED',
    credit_hold_active: false,
    credit_hold_reason: null,
  },
]

export const selectedTradeEvents = [
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

export function buildWorkspaceSummary() {
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
