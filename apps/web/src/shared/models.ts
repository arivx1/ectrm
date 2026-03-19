export type Trade = {
  trade_id: string
  external_trade_id: string | null
  source_system: string | null
  created_at: string
  updated_at: string
  execution_timestamp: string | null
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
  price_index_code: string | null
  price: number | null
  volume: number | null
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
  portfolio: string
  counterparty: string
  pricing_status: string
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
  location_type: string
  market?: string | null
  country_code?: string | null
  region?: string | null
  timezone?: string | null
}

export type CounterpartyRecord = ReferenceRecord & {
  short_name?: string | null
  legal_entity_name?: string | null
  counterparty_type: string
  country_code?: string | null
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

export type AssistantPromptResponse = {
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

export type ViewKey =
  | 'dashboard'
  | 'guide'
  | 'trades'
  | 'events'
  | 'positions'
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
  location_type: string
  market: string
  country_code: string
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
  description: string
}

export type PortfolioForm = {
  code: string
  name: string
  book_code: string
  owner: string
  strategy: string
  description: string
}
