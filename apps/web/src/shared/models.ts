export type Trade = {
  trade_id: string
  external_trade_id: string | null
  source_system: string | null
  created_at: string
  updated_at: string
  execution_timestamp: string | null
  trade_date: string | null
  effective_start_date: string | null
  effective_end_date: string | null
  quality_spec: string | null
  unit_of_measure: string | null
  trade_currency_code: string | null
  location_code: string | null
  delivery_start: string | null
  delivery_end: string | null
  price_unit_code: string | null
  trade_nature: string
  trade_structure: string
  trade_side: string | null
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  pricing_type: string
  pricing_status: string
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  invoice_status: string
  payment_status: string
  settlement_status: string
  trader_user: string | null
  status: string
  last_event_id: string
}

export type TradeLegDraft = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: string
}

export type TradeHeaderDraft = {
  external_trade_id: string
  source_system: string
  execution_timestamp: string
  trade_date: string
  effective_start_date: string
  effective_end_date: string
  quality_spec: string
  unit_of_measure: string
  trade_currency_code: string
  location_code: string
  delivery_start: string
  delivery_end: string
  price_unit_code: string
  portfolio: string
  counterparty: string
  pricing_status: string
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  invoice_status: string
  payment_status: string
  settlement_status: string
  trader_user: string
}

export type EventRow = {
  event_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  occurred_at: string
  recorded_at: string
  actor_id: string | null
  correlation_id: string | null
  causation_id: string | null
  schema_version: number
  payload: Record<string, unknown>
}

export type PositionRow = {
  commodity: string
  net_volume: number
  updated_at: string
}

export type DeliveryRecord = {
  delivery_id: string
  trade_id: string
  leg_no: number | null
  external_trade_id: string | null
  status: 'BLOCKED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED'
  direction: string
  mode_family: 'LOGISTICS' | 'NETWORK_FLOW' | 'POWER_SCHEDULE'
  transport_mode:
    | 'UNSPECIFIED'
    | 'TRUCK'
    | 'RAIL'
    | 'BARGE'
    | 'VESSEL'
    | 'PIPELINE'
    | 'POWER_GRID'
    | 'STORAGE'
  transport_mode_source: 'EXPLICIT' | 'DERIVED' | 'UNSPECIFIED'
  delivery_profile: 'LOAD_DISCHARGE_WINDOW' | 'FLOW_WINDOW' | 'INTERVAL_SCHEDULE'
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  volume: number | null
  unit_of_measure: string | null
  trade_currency_code: string | null
  price_unit_code: string | null
  location_code: string | null
  delivery_start: string | null
  delivery_end: string | null
  booked_at: string
  last_updated_at: string
  age_days: number
  pricing_status: string
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  invoice_status: string
  payment_status: string
  settlement_status: string
  blocker_count: number
  blockers: string[]
}

export type ShipmentRecord = DeliveryRecord

export type TradeWorkflowItemRecord = {
  item_id: number
  trade_id: string
  queue: 'operations' | 'settlement'
  workflow_type: 'CONFIRMATION' | 'NOMINATION' | 'ALLOCATION' | 'INVOICE' | 'PAYMENT'
  status: string
  owner: string | null
  due_at: string | null
  notes: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  is_closed: boolean
  is_overdue: boolean
  age_days: number
  trade_nature: string
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  trader_user: string | null
  trade_date: string | null
  delivery_start: string | null
  delivery_end: string | null
}

export type ReferenceRecord = {
  code: string
  name: string
  description?: string | null
  is_active: boolean
  created_at?: string
  created_by?: string
  updated_at?: string
  updated_by?: string
  version?: number
  commodity_class?: string
}

export type PriceIndexRecord = ReferenceRecord & {
  commodity_code: string
  currency_code: string
  unit_code: string
  provider: string
  market?: string | null
  location_code?: string | null
  calendar_code?: string | null
}

export type CurrencyRecord = ReferenceRecord & {
  symbol?: string | null
}

export type UnitRecord = ReferenceRecord & {
  commodity_class?: string | null
  dimension: string
  base_unit_code?: string | null
  conversion_factor?: number | null
  precision: number
}

export type LocationRecord = ReferenceRecord & {
  location_kind: string
  location_type: string
  parent_location_code?: string | null
  market?: string | null
  city?: string | null
  subdivision_code?: string | null
  country_code?: string | null
  continent_code?: string | null
  latitude?: number | null
  longitude?: number | null
  region?: string | null
  timezone?: string | null
}

export type LocationStandards = {
  default_location_kind: string
  default_location_type_by_kind: Record<string, string>
  location_kinds: string[]
  location_types_by_kind: Record<string, string[]>
  market_codes: string[]
  continent_codes: string[]
}

export const DEFAULT_LOCATION_STANDARDS: LocationStandards = {
  default_location_kind: 'POINT',
  default_location_type_by_kind: {
    POINT: 'HUB',
    REGION: 'REGION',
  },
  location_kinds: ['POINT', 'REGION'],
  location_types_by_kind: {
    POINT: ['AIRPORT', 'CITY', 'DELIVERY_POINT', 'HUB', 'NODE', 'PORT', 'TERMINAL', 'TRADING_POINT', 'ZONE'],
    REGION: ['BASIN', 'CONTINENT', 'CORRIDOR', 'COUNTRY', 'MARKET_AREA', 'PADD', 'PROVINCE', 'REGION', 'STATE'],
  },
  market_codes: ['CAISO', 'CME', 'EEX', 'ERCOT', 'ICE', 'ICE_EUROPE', 'ISO_NE', 'JKM', 'MISO', 'NBP', 'NGX', 'NYISO', 'NYMEX', 'PHYSICAL', 'PJM', 'SPP', 'TTF'],
  continent_codes: ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'],
}

export type CounterpartyRecord = ReferenceRecord & {
  short_name?: string | null
  legal_entity_name?: string | null
  counterparty_type: string
  country_code?: string | null
  lei_code?: string | null
  duns_number?: string | null
  ticker_symbol?: string | null
  credit_status?: string | null
}

export type CounterpartyCreditProfileRecord = {
  counterparty_code: string
  credit_rating?: string | null
  review_due_at?: string | null
  limit_currency_code?: string | null
  limit_amount?: number | null
  breach_action: string
  notes?: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type CounterpartyExternalCreditSnapshotRecord = {
  id: number
  counterparty_code: string
  provider: string
  source_entity_id?: string | null
  source_entity_name?: string | null
  match_basis?: string | null
  matched_identifier_value?: string | null
  as_of_date: string
  rating_scale?: string | null
  rating_value?: string | null
  rating_outlook?: string | null
  credit_score?: number | null
  probability_of_default?: number | null
  recommended_limit_currency_code?: string | null
  recommended_limit_amount?: number | null
  commentary?: string | null
  downloaded_at: string
  run_id: number
  created_at: string
  updated_at: string
  version: number
}

export type CounterpartyCreditSnapshotCandidate = {
  counterparty_code: string
  source_entity_id?: string | null
  source_entity_name?: string | null
  match_basis?: string | null
  matched_identifier_value?: string | null
  as_of_date: string
  rating_scale?: string | null
  rating_value?: string | null
  rating_outlook?: string | null
  credit_score?: number | null
  probability_of_default?: number | null
  recommended_limit_currency_code?: string | null
  recommended_limit_amount?: number | null
  commentary?: string | null
  downloaded_at?: string | null
  raw_payload?: Record<string, unknown> | null
}

export type CounterpartyCreditPreviewIssueRecord = {
  severity: string
  code: string
  message: string
}

export type CounterpartyCreditPreviewRowRecord = {
  row_number: number
  source_entity_id?: string | null
  source_entity_name?: string | null
  matched_counterparty_code?: string | null
  matched_counterparty_name?: string | null
  counterparty_is_active?: boolean | null
  match_status: string
  match_basis?: string | null
  matched_identifier_value?: string | null
  rating_scale?: string | null
  rating_value?: string | null
  rating_outlook?: string | null
  credit_score?: number | null
  probability_of_default?: number | null
  recommended_limit_currency_code?: string | null
  recommended_limit_amount?: number | null
  commentary?: string | null
  issues: CounterpartyCreditPreviewIssueRecord[]
  ready_to_import: boolean
  snapshot?: CounterpartyCreditSnapshotCandidate | null
}

export type CounterpartyCreditPreviewRecord = {
  provider: string
  total_rows: number
  matched_rows: number
  ready_rows: number
  warning_rows: number
  blocked_rows: number
  rows: CounterpartyCreditPreviewRowRecord[]
}

export type CounterpartyCreditReportRow = {
  counterparty_code: string
  counterparty_name: string
  counterparty_type: string
  credit_status: string
  active_trade_count: number
  exposure_currency_code?: string | null
  exposure_amount?: number | null
  in_exposure_currency_trade_count: number
  priced_trade_count: number
  unpriced_trade_count: number
  out_of_scope_trade_count: number
  limit_currency_code?: string | null
  limit_amount?: number | null
  limit_utilization_percent?: number | null
  limit_breached: boolean
  credit_rating?: string | null
  review_due_at?: string | null
  review_is_due: boolean
  breach_action: string
  latest_trade_updated_at?: string | null
}

export type CounterpartyStandards = {
  default_counterparty_type: string
  counterparty_types: string[]
  default_counterparty_credit_status: string
  counterparty_credit_statuses: string[]
  default_counterparty_credit_breach_action: string
  counterparty_credit_breach_actions: string[]
}

export const DEFAULT_COUNTERPARTY_STANDARDS: CounterpartyStandards = {
  default_counterparty_type: 'SUPPLIER',
  counterparty_types: ['BANK', 'BROKER', 'END_USER', 'MAJOR', 'MARKETER', 'MIDSTREAM', 'PRODUCER', 'REFINER', 'SUPPLIER', 'TRADER', 'UTILITY'],
  default_counterparty_credit_status: 'APPROVED',
  counterparty_credit_statuses: ['APPROVED', 'REVIEW_REQUIRED', 'ON_HOLD', 'BLOCKED'],
  default_counterparty_credit_breach_action: 'REQUIRE_APPROVAL',
  counterparty_credit_breach_actions: ['WARN', 'REQUIRE_APPROVAL', 'BLOCK'],
}

export type PortfolioRecord = ReferenceRecord & {
  book_code: string
  owner?: string | null
  strategy?: string | null
}

export type ExternalDataRunRecord = {
  id: number
  provider: string
  job_name: string
  status: string
  started_at: string
  finished_at?: string | null
  requested_by?: string | null
  series_count: number
  observation_count: number
  error_summary?: string | null
  created_at: string
}

export type ExternalDataProviderStatusRecord = {
  provider: string
  label: string
  category: string
  health_status: string
  latest_run_status: string
  success_sla_hours: number
  scheduler_interval_minutes: number
  active_series_count: number
  due_for_sync: boolean
  last_run_at: string | null
  last_success_at: string | null
  latest_observation_at: string | null
  observation_age_hours: number | null
  error_summary: string | null
  latest_run: ExternalDataRunRecord | null
  latest_success: ExternalDataRunRecord | null
}

export type ExternalDataSyncStatusRecord = {
  generated_at: string
  health_status: string
  provider_count: number
  healthy_provider_count: number
  stale_provider_count: number
  failed_provider_count: number
  running_provider_count: number
  unknown_provider_count: number
  providers: ExternalDataProviderStatusRecord[]
}

export type ExposureSummaryRow = {
  commodity: string
  net_volume: number
  active_trade_count: number
  updated_at: string
}

export type ActivitySummaryRow = {
  event_type: string
  event_count: number
  last_occurred_at: string
}

export type ReportingOverview = {
  active_trade_count: number
  tracked_commodity_count: number
  gross_net_volume: number
  exposure: ExposureSummaryRow[]
  activity: ActivitySummaryRow[]
}

export type PnlHistoryPoint = {
  date: string
  total_pnl: number
  realized_pnl: number
  unrealized_pnl: number
  priced_trade_count: number
  realized_trade_count: number
  unrealized_trade_count: number
}

export type PnlHistorySummary = {
  total_pnl: number
  realized_pnl: number
  unrealized_pnl: number
  priced_trade_count: number
  realized_trade_count: number
  unrealized_trade_count: number
}

export type PnlHistoryReport = {
  generated_at: string
  basis: string
  methodology: string
  point_count: number
  points: PnlHistoryPoint[]
  summary: PnlHistorySummary
}

export type PriceIndexObservationRecord = {
  id: number
  price_index_code: string
  observation_date: string
  value: number
  unit_code: string
  currency_code: string | null
  source_provider: string
  source_series_id: string
  source_frequency: string
  source_published_at: string | null
  source_revision: string | null
  downloaded_at: string
  run_id: number
  created_at: string
  updated_at: string
}

export type MarketContextPriceRecord = {
  price_index_code: string
  name: string
  commodity_code: string
  market: string | null
  location_code: string | null
  observation_date: string
  value: number
  unit_code: string
  currency_code: string | null
  source_provider: string
  source_series_id: string
  downloaded_at: string
}

export type MarketContextSeriesRecord = {
  series_code: string
  name: string
  category: string
  observation_date: string
  value: number
  unit_code: string
  source_provider: string
  source_series_id: string
  downloaded_at: string
}

export type MarketContextFreshnessRecord = {
  provider: string
  label: string
  category: string
  health_status: string
  latest_run_status: string
  due_for_sync: boolean
  last_success_at: string | null
  latest_observation_at: string | null
  observation_age_hours: number | null
  error_summary: string | null
}

export type MarketContextRecord = {
  generated_at: string
  commodity: string | null
  price_indices: MarketContextPriceRecord[]
  fundamentals: MarketContextSeriesRecord[]
  power: MarketContextSeriesRecord[]
  macro: MarketContextSeriesRecord[]
  positioning: MarketContextSeriesRecord[]
  freshness: MarketContextFreshnessRecord[]
}

export type WeatherSyncLocationStatusRecord = {
  code: string
  name: string
  reference_location_code: string | null
  station_id: string | null
  is_active: boolean
  health_status: string
  last_forecast_downloaded_at: string | null
  last_observation_at: string | null
  last_observation_downloaded_at: string | null
  forecast_age_hours: number | null
  observation_age_hours: number | null
}

export type WeatherSyncStatusRecord = {
  provider: string
  label: string
  health_status: string
  latest_run_status: string
  success_sla_hours: number
  scheduler_interval_minutes: number
  forecast_freshness_hours: number
  observation_freshness_hours: number
  last_run_at: string | null
  last_success_at: string | null
  latest_data_at: string | null
  error_summary: string | null
  active_location_count: number
  healthy_location_count: number
  stale_location_count: number
  missing_location_count: number
  latest_run: ExternalDataRunRecord | null
  latest_success: ExternalDataRunRecord | null
  locations: WeatherSyncLocationStatusRecord[]
}

export type TradingSourceRecord = {
  source_id: string
  source_name: string
  source_category: string
  dataset_name: string
  business_purpose: string
  asset_classes: string
  products_or_regions: string
  system_owner: string
  business_owner: string
  vendor_or_origin: string
  golden_source: string
  fallback_source: string
  update_frequency: string
  delivery_pattern: string
  latency_requirement: string
  retention_requirement: string
  storage_pattern: string
  schema_owner: string
  quality_checks: string
  reconciliation_method: string
  usage_scope: string
  criticality: string
  license_type: string
  license_restrictions: string
  entitlements_required: string
  cost_model: string
  sensitivity_class: string
  availability_slo: string
  incident_runbook: string
  monitoring_metrics: string
  lineage_notes: string
  last_reviewed_at: string
  status: string
}

export type AssistantProvider = 'openai' | 'anthropic' | 'google'
export type AssistantMessageRole = 'user' | 'assistant'
export type AssistantAgentStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED'
export type AssistantAgentScope = 'PERSONAL' | 'TEAM' | 'ORGANIZATION'
export type AssistantAgentCapability = 'READ' | 'EXPLAIN' | 'DRAFT' | 'ACTION'
export type AssistantActionType = 'cancel_trade'
export type AssistantActionRequestStatus = 'PENDING' | 'REJECTED' | 'EXECUTED' | 'FAILED'

export type AssistantProviderStatus = {
  provider: AssistantProvider
  label: string
  enabled: boolean
  configured: boolean
  is_default: boolean
  default_model: string
  base_url: string
  setup_env_var: string
}

export type AssistantToolDefinition = {
  name: string
  description: string
}

export type AssistantRuntimeSettings = {
  enabled: boolean
  default_provider: AssistantProvider
  effective_default_provider: AssistantProvider | null
  configured_provider_count: number
  providers: AssistantProviderStatus[]
  available_tools: AssistantToolDefinition[]
}

export type AssistantMessage = {
  role: AssistantMessageRole
  content: string
}

export type AssistantAgent = {
  agent_id: string
  name: string
  description: string
  status: AssistantAgentStatus
  scope: AssistantAgentScope
  provider: AssistantProvider | null
  model: string | null
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  allowed_tools: string[]
}

export type AssistantAdminAgent = AssistantAgent & {
  system_prompt: string
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type AssistantPromptRequest = {
  conversation_id?: number
  agent_id?: string
  provider?: AssistantProvider
  workspace?: ViewKey
  context?: string
  use_live_tools?: boolean
  messages: AssistantMessage[]
}

export type AssistantToolCall = {
  tool_name: string
  summary: string
  arguments: Record<string, unknown>
  record_count: number | null
}

export type AssistantActionRequest = {
  action_request_id: number
  run_id: number
  user_id: string
  status: AssistantActionRequestStatus
  workspace?: ViewKey | null
  agent_id?: string | null
  agent_name?: string | null
  action_type: AssistantActionType
  summary: string
  description: string
  payload: Record<string, unknown>
  result?: Record<string, unknown> | null
  error_detail?: string | null
  created_at: string
  decided_at?: string | null
  decided_by?: string | null
}

export type AssistantPromptResponse = {
  conversation_id?: number | null
  conversation_updated_at?: string | null
  run_id?: number | null
  run_recorded_at?: string | null
  agent_id?: string | null
  agent_name?: string | null
  provider: AssistantProvider
  model: string
  message: {
    role: 'assistant'
    content: string
  }
  usage: {
    input_tokens: number | null
    output_tokens: number | null
  }
  warnings: string[]
  tool_calls: AssistantToolCall[]
  action_requests: AssistantActionRequest[]
}

export type AssistantPromptContextRequest = {
  agent_id?: string
  provider?: AssistantProvider
  workspace?: ViewKey
  context?: string
  use_live_tools?: boolean
}

export type AssistantPromptSectionSource =
  | 'system'
  | 'organization'
  | 'user'
  | 'business'
  | 'data'
  | 'tool'
  | 'world'
  | 'workspace'
  | 'application'
  | 'agent'

export type AssistantPromptSection = {
  key: string
  title: string
  source: AssistantPromptSectionSource
  content: string
}

export type AssistantPromptContext = {
  agent_id?: string | null
  agent_name?: string | null
  provider: AssistantProvider
  model: string
  generated_at: string
  warnings: string[]
  sections: AssistantPromptSection[]
  rendered_system_prompt: string
}

export type AssistantRunStatus = 'COMPLETED' | 'FAILED'

export type AssistantRunSummary = {
  conversation_id?: number | null
  run_id: number
  status: AssistantRunStatus
  created_at: string
  completed_at: string
  user_id: string
  user_role: string
  workspace?: ViewKey | null
  agent_id?: string | null
  agent_name?: string | null
  provider: AssistantProvider
  model: string
  use_live_tools: boolean
  warning_count: number
  tool_call_count: number
  input_tokens: number | null
  output_tokens: number | null
  latest_user_message?: string | null
  assistant_message?: string | null
  error_detail?: string | null
}

export type AssistantRun = AssistantRunSummary & {
  request_messages: AssistantMessage[]
  application_context?: string | null
  prompt_sections: AssistantPromptSection[]
  rendered_system_prompt: string
  warnings: string[]
  tool_calls: AssistantToolCall[]
}

export type AssistantConversationMessage = {
  role: AssistantMessageRole
  content: string
  recorded_at: string
  run_id?: number | null
  provider?: AssistantProvider | null
  model?: string | null
  warnings: string[]
  tool_calls: AssistantToolCall[]
}

export type AssistantConversationSummary = {
  conversation_id: number
  created_at: string
  updated_at: string
  user_id: string
  user_role: string
  workspace?: ViewKey | null
  agent_id?: string | null
  agent_name?: string | null
  provider: AssistantProvider
  model: string
  use_live_tools: boolean
  title: string
  run_count: number
  latest_run_id?: number | null
  latest_user_message?: string | null
  latest_assistant_message?: string | null
}

export type AssistantConversation = AssistantConversationSummary & {
  messages: AssistantConversationMessage[]
}

export type ViewKey =
  | 'dashboard'
  | 'guide'
  | 'trades'
  | 'events'
  | 'risk'
  | 'positions'
  | 'shipments'
  | 'scheduling'
  | 'operations'
  | 'settlement'
  | 'reports'
  | 'reference'
  | 'admin'
  | 'settings'
  | 'assistant'
export type InspectorTab = 'overview' | 'events' | 'amend' | 'risk'
export type ReferenceTab =
  | 'books'
  | 'commodities'
  | 'price-indices'
  | 'currencies'
  | 'units'
  | 'locations'
  | 'counterparties'
  | 'portfolios'

export type BookForm = {
  code: string
  name: string
  description: string
}

export type CommodityForm = {
  code: string
  name: string
  description: string
  commodity_class: string
}

export type PriceIndexForm = {
  code: string
  name: string
  description: string
  commodity_code: string
  currency_code: string
  unit_code: string
  provider: string
  market: string
  location_code: string
  calendar_code: string
}

export type CurrencyForm = {
  code: string
  name: string
  symbol: string
  description: string
}

export type UnitForm = {
  code: string
  name: string
  commodity_class: string
  dimension: string
  base_unit_code: string
  conversion_factor: string
  precision: string
  description: string
}

export type LocationForm = {
  code: string
  name: string
  location_kind: string
  location_type: string
  parent_location_code: string
  market: string
  city: string
  subdivision_code: string
  country_code: string
  continent_code: string
  latitude: string
  longitude: string
  region: string
  timezone: string
  description: string
}

export type CounterpartyForm = {
  code: string
  name: string
  short_name: string
  legal_entity_name: string
  counterparty_type: string
  country_code: string
  lei_code: string
  duns_number: string
  ticker_symbol: string
  credit_status: string
  description: string
}

export type CounterpartyCreditProfileForm = {
  credit_rating: string
  review_due_at: string
  limit_currency_code: string
  limit_amount: string
  breach_action: string
  notes: string
}

export type PortfolioForm = {
  code: string
  name: string
  book_code: string
  owner: string
  strategy: string
  description: string
}
