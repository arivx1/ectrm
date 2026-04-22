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

export const assistantRuntimeSettings = {
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
      default_model: 'gpt-5.4',
      base_url: 'https://api.openai.com/v1',
      setup_env_var: 'OPENAI_API_KEY',
    },
  ],
  available_tools: [
    {
      name: 'get_trade_by_id',
      description: 'Load one live trade projection by exact trade_id.',
    },
  ],
} as const

export const assistantAdminAgents = [
  {
    agent_id: 'ops-governor',
    name: 'Ops Governor',
    description: 'Proposes high-impact trade actions that require admin review.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5.4',
    allowed_workspaces: ['assistant', 'admin', 'trades'],
    capabilities: ['READ', 'ACTION'],
    allowed_tools: ['get_trade_by_id'],
    allowed_action_types: ['cancel_trade'],
    system_prompt: 'Escalate cross-user trade actions into an approval inbox before execution.',
    created_at: '2026-04-11T08:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-04-11T08:30:00Z',
    updated_by: 'ops_admin',
    version: 3,
  },
] as const

export const assistantRoleArchetypes = [
  {
    role_key: 'trade-ops-copilot',
    name: 'Trade Ops Copilot',
    description: 'Coordinates trade operations follow-through with staged, reviewable actions.',
    catalog_status: 'SEEDED',
    mission: ['Keep booked trades moving.', 'Stage the smallest justified action.'],
    human_owner_role: 'Operations Lead',
    allowed_workspaces: ['assistant', 'trades', 'operations'],
    work_objects: ['trade', 'workflow item'],
    capability_ceiling: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    default_tools: ['get_trade_by_id'],
    maximum_action_types: ['cancel_trade', 'update_trade_workflow_item'],
    authority_ceiling: 'STAGE',
    approval_rules: ['Operations Lead reviews staged actions before execution.'],
    stop_conditions: ['Evidence is ambiguous.', 'Requested action exceeds the role boundary.'],
    success_metrics: ['High approval rate.', 'Low stale action rate.'],
    required_eval_coverage: ['Allowed action staging.', 'Denied overreach.'],
    base_prompt_guidance: ['Lead with the blocker.', 'Show evidence before staging.'],
    current_profile_ids: ['ops-governor'],
  },
] as const

export const assistantActionRequests = [
  {
    action_request_id: 7001,
    run_id: 701,
    user_id: 'trader.alpha',
    status: 'PENDING',
    workspace: 'trades',
    agent_id: 'ops-governor',
    agent_name: 'Ops Governor',
    action_type: 'cancel_trade',
    summary: 'Cancel trade T-AMEND-100',
    description:
      'Cancel trade T-AMEND-100 because the counterparty requested a same-day unwind before confirmation.',
    payload: {
      trade_id: 'T-AMEND-100',
      reason: 'Counterparty unwind requested before confirmation.',
    },
    lifecycle: {
      stage: 'AWAITING_REVIEW',
      label: 'Awaiting review',
      tone: 'attention',
      is_terminal: false,
      can_approve: true,
      can_reject: true,
      reviewer_action_label: 'Approve or reject',
      decided_label: null,
      review_risk_flags: [],
    },
    result: null,
    error_detail: null,
    created_at: '2026-04-11T08:45:00Z',
    decided_at: null,
    decided_by: null,
  },
] as const

export const assistantOutcomeMetrics = {
  generated_at: '2026-04-11T09:10:00Z',
  created_after: null,
  created_before: null,
  thresholds: {
    min_decided_actions_for_promotion: 10,
    max_rejection_rate_for_promotion: 0.1,
    max_failed_execution_rate_for_promotion: 0.02,
    max_stale_action_rate_for_promotion: 0.05,
    max_pending_actions_for_promotion: 0,
    min_decided_actions_for_pause_signal: 5,
    rejection_rate_pause_threshold: 0.4,
    failed_execution_rate_pause_threshold: 0.1,
    stale_action_rate_pause_threshold: 0.25,
    oldest_pending_hours_pause_threshold: 72,
    repeated_failed_actions_pause_threshold: 3,
    unsupported_attempt_pause_threshold: 1,
    policy_drift_pause_threshold: 1,
  },
  total_feedback_count: 2,
  helpful_feedback_count: 1,
  needs_work_feedback_count: 1,
  feedback_helpful_rate: 0.5,
  by_agent: [
    {
      agent_id: 'ops-governor',
      agent_name: 'Ops Governor',
      agent_role_key: 'trade-ops-copilot',
      agent_profile_kind: 'ROLE_DERIVED',
      run_count: 12,
      completed_run_count: 11,
      failed_run_count: 1,
      warning_count: 1,
      warning_rate: 0.0833,
      tool_call_count: 15,
      tool_error_count: 1,
      tool_error_rate: 0.0667,
      helpful_feedback_count: 8,
      needs_work_feedback_count: 1,
      feedback_helpful_rate: 0.8889,
      staged_action_count: 12,
      pending_action_count: 1,
      executed_action_count: 10,
      rejected_action_count: 1,
      failed_action_count: 0,
      decided_action_count: 11,
      stale_action_count: 0,
      unsupported_attempt_count: 0,
      policy_drift_count: 0,
      approval_rate: 0.9091,
      rejection_rate: 0.0909,
      failed_execution_rate: 0,
      stale_action_rate: 0,
      avg_decision_seconds: 420,
      oldest_pending_age_seconds: 1500,
      recommendation: {
        recommended_action: 'KEEP_STAGED',
        promotion_candidate: false,
        pause_recommended: false,
        reasons: ['Pending actions remain open before promotion.'],
      },
    },
  ],
  by_role: [
    {
      agent_role_key: 'trade-ops-copilot',
      run_count: 12,
      completed_run_count: 11,
      failed_run_count: 1,
      warning_count: 1,
      warning_rate: 0.0833,
      tool_call_count: 15,
      tool_error_count: 1,
      tool_error_rate: 0.0667,
      staged_action_count: 12,
      pending_action_count: 1,
      executed_action_count: 10,
      rejected_action_count: 1,
      failed_action_count: 0,
      decided_action_count: 11,
      stale_action_count: 0,
      unsupported_attempt_count: 0,
      policy_drift_count: 0,
      approval_rate: 0.9091,
      rejection_rate: 0.0909,
      failed_execution_rate: 0,
      stale_action_rate: 0,
      avg_decision_seconds: 420,
      oldest_pending_age_seconds: 1500,
      recommendation: {
        recommended_action: 'KEEP_STAGED',
        promotion_candidate: false,
        pause_recommended: false,
        reasons: ['Pending actions remain open before promotion.'],
      },
    },
  ],
  by_profile: [
    {
      agent_profile_kind: 'ROLE_DERIVED',
      run_count: 12,
      completed_run_count: 11,
      failed_run_count: 1,
      warning_count: 1,
      warning_rate: 0.0833,
      tool_call_count: 15,
      tool_error_count: 1,
      tool_error_rate: 0.0667,
      staged_action_count: 12,
      pending_action_count: 1,
      executed_action_count: 10,
      rejected_action_count: 1,
      failed_action_count: 0,
      decided_action_count: 11,
      stale_action_count: 0,
      unsupported_attempt_count: 0,
      policy_drift_count: 0,
      approval_rate: 0.9091,
      rejection_rate: 0.0909,
      failed_execution_rate: 0,
      stale_action_rate: 0,
      avg_decision_seconds: 420,
      oldest_pending_age_seconds: 1500,
      recommendation: {
        recommended_action: 'KEEP_STAGED',
        promotion_candidate: false,
        pause_recommended: false,
        reasons: ['Pending actions remain open before promotion.'],
      },
    },
  ],
  by_workspace: [
    {
      workspace: 'trades',
      run_count: 8,
      helpful_feedback_count: 1,
      needs_work_feedback_count: 0,
      feedback_count: 1,
      feedback_helpful_rate: 1,
    },
    {
      workspace: 'assistant',
      run_count: 4,
      helpful_feedback_count: 0,
      needs_work_feedback_count: 1,
      feedback_count: 1,
      feedback_helpful_rate: 0,
    },
  ],
  by_action_type: [
    {
      action_type: 'cancel_trade',
      staged_action_count: 12,
      pending_action_count: 1,
      executed_action_count: 10,
      rejected_action_count: 1,
      failed_action_count: 0,
      decided_action_count: 11,
      stale_action_count: 0,
      unsupported_attempt_count: 0,
      policy_drift_count: 0,
      approval_rate: 0.9091,
      rejection_rate: 0.0909,
      failed_execution_rate: 0,
      stale_action_rate: 0,
      avg_decision_seconds: 420,
      oldest_pending_age_seconds: 1500,
      recommendation: {
        recommended_action: 'KEEP_STAGED',
        promotion_candidate: false,
        pause_recommended: false,
        reasons: ['One pending cancel_trade action is still waiting for review.'],
      },
    },
  ],
  recent_feedback: [
    {
      feedback_id: 901,
      run_id: 701,
      conversation_id: 601,
      agent_id: 'ops-governor',
      agent_name: 'Ops Governor',
      workspace: 'assistant',
      user_id: 'trader.alpha',
      user_role: 'TRADER',
      rating: 'NEEDS_WORK',
      comment: 'Show the cancellation policy evidence before staging.',
      created_at: '2026-04-11T09:00:00Z',
      updated_at: '2026-04-11T09:00:00Z',
    },
    {
      feedback_id: 900,
      run_id: 700,
      conversation_id: 600,
      agent_id: 'ops-governor',
      agent_name: 'Ops Governor',
      workspace: 'trades',
      user_id: 'trader.alpha',
      user_role: 'TRADER',
      rating: 'HELPFUL',
      comment: 'Clear and actionable.',
      created_at: '2026-04-11T08:30:00Z',
      updated_at: '2026-04-11T08:30:00Z',
    },
  ],
} as const

export const codexTaskSettings = {
  enabled: true,
  configured: false,
  provider: 'github_actions',
  repository: null,
  workflow_id: null,
  default_ref: 'main',
  prompt_input_name: 'prompt',
  missing_configuration: ['CODEX_TASK_REPOSITORY', 'CODEX_TASK_WORKFLOW_ID'],
} as const

export const codexTasks = [] as const

export const userAccounts = [
  {
    user_id: 'ops_admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    role: 'OPS_ADMIN',
    is_active: true,
    password_set: true,
    last_login_at: '2026-04-11T07:55:00Z',
    created_at: '2026-01-03T10:00:00Z',
    created_by: 'system',
    updated_at: '2026-04-11T07:55:00Z',
    updated_by: 'ops_admin',
    version: 4,
  },
  {
    user_id: 'trader.alpha',
    email: 'trader.alpha@example.com',
    display_name: 'Trader Alpha',
    role: 'TRADER',
    is_active: true,
    password_set: true,
    last_login_at: '2026-04-11T08:20:00Z',
    created_at: '2026-01-10T09:30:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-04-11T08:20:00Z',
    updated_by: 'ops_admin',
    version: 2,
  },
] as const

export const adminRoadmapDocument = {
  document: {
    source_path: 'docs/engineering/trading-source-roadmap.md',
    horizons: [
      {
        key: 'now',
        label: 'Now',
        detail: 'Protect the highest-risk operational seams first.',
      },
      {
        key: 'next',
        label: 'Next',
        detail: 'Expand typed contracts and smoke coverage across adjacent flows.',
      },
      {
        key: 'later',
        label: 'Later',
        detail: 'Productize deeper governance and automation controls.',
      },
    ],
    phases: [
      {
        id: 'wave-0',
        title: 'Wave 0',
        priority: 'P0',
        summary: 'Protect the first operator and governance trust seams.',
        items: [
          {
            id: 'governance-smoke',
            title: 'Governance smoke coverage',
            summary: 'Protect assistant approvals with deterministic browser coverage.',
            status: 'in_progress',
            horizon: 'now',
            owner: 'Platform',
            target: 'Wave 0',
            source_ids: ['FR0-12'],
            links: [
              { label: 'Admin', view: 'admin' },
              { label: 'Assistant', view: 'assistant' },
            ],
          },
        ],
      },
    ],
    milestones: [
      {
        id: 'wave-0-trust',
        title: 'Wave 0 Trust Protected',
        summary: 'Primary workflows and one governance seam are covered by smoke automation.',
        owner: 'Platform',
        target: 'Wave 0',
        item_ids: ['governance-smoke'],
        exit_criteria: [
          'Seeded browser smoke covers one admin or assistant governance interaction.',
        ],
        links: [{ label: 'Admin', view: 'admin' }],
      },
    ],
  },
  updated_at: '2026-04-11T09:00:00Z',
  updated_by: 'ops_admin',
  version: 3,
  is_default: false,
  recent_revisions: [
    {
      revision_id: 12,
      version: 3,
      created_at: '2026-04-11T09:00:00Z',
      created_by: 'ops_admin',
      change_summary: ['Added governance smoke coverage milestone.'],
      restored_from_revision_id: null,
    },
  ],
} as const

export const projectionMonitoringAdminRecord = {
  document: {
    policy_key: 'trade-projection-monitoring',
    schedule: {
      enabled: false,
      cadence_minutes: 60,
      auto_clean_mode: 'disabled',
      max_cleanup_trades_per_run: 25,
    },
    alerting: {
      enabled: false,
      issue_count_threshold: 1,
      impacted_trade_threshold: 1,
      minimum_alert_interval_minutes: 60,
      channels: ['ADMIN_WORKSPACE'],
      routing_note: 'Seeded browser smoke monitoring policy.',
    },
  },
  updated_at: '2026-04-11T09:00:00Z',
  updated_by: 'ops_admin',
  version: 1,
  is_default: false,
  recent_revisions: [
    {
      revision_id: 31,
      version: 1,
      created_at: '2026-04-11T09:00:00Z',
      created_by: 'ops_admin',
      change_summary: ['Seeded projection monitoring smoke policy.'],
      restored_from_revision_id: null,
    },
  ],
  runtime: {
    last_evaluated_at: null,
    last_evaluated_by: null,
    last_issue_count: 0,
    last_structural_issue_count: 0,
    last_invariant_issue_count: 0,
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
    health_status: 'disabled',
    evaluation_due: false,
    next_evaluation_at: null,
    live_issue_count: 0,
    live_structural_issue_count: 0,
    live_invariant_issue_count: 0,
    live_impacted_trade_count: 0,
    should_alert: false,
    alert_messages: [],
    last_evaluated_at: null,
    last_evaluated_by: null,
    last_alert_at: null,
    last_alert_reason: null,
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
    updated_at: '2026-04-10T18:30:00Z',
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

export const selectedTradeEvents = [
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

function buildTradeWorkspaceSummary(tradeRows = trades) {
  const activeTrades = tradeRows.filter((trade) => trade.status === 'ACTIVE')

  return {
    total_count: tradeRows.length,
    active_count: activeTrades.length,
    priced_active_count: activeTrades.filter((trade) => trade.price !== null).length,
    pending_pricing_count: activeTrades.filter((trade) => trade.pricing_status === 'PENDING').length,
    pending_settlement_count: activeTrades.filter((trade) => trade.settlement_status !== 'SETTLED').length,
    tracked_book_count: new Set(activeTrades.map((trade) => trade.book)).size,
    total_active_volume: activeTrades.reduce((sum, trade) => sum + (trade.volume ?? 0), 0),
  }
}

export function buildWorkspaceSummary(tradeRows = trades) {
  const tradeSummary = buildTradeWorkspaceSummary(tradeRows)

  return {
    generated_at: '2026-04-11T00:00:00Z',
    trades: tradeSummary,
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
        total_count: tradeSummary.pending_pricing_count,
        confirmation_backlog_count: 0,
        nomination_backlog_count: 0,
        allocation_backlog_count: 0,
        invoice_backlog_count: 0,
        overdue_payment_count: 0,
        stale_pricing_count: tradeSummary.pending_pricing_count,
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
