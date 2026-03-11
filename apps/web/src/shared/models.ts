export type Trade = {
  trade_id: string
  created_at: string
  updated_at: string
  trade_nature: string
  trade_structure: string
  trade_side: string | null
  book: string
  commodity_class: string
  commodity: string
  pricing_type: string
  price_index_code: string | null
  price: number | null
  volume: number | null
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

export type ViewKey = 'dashboard' | 'trades' | 'events' | 'positions' | 'reference' | 'admin' | 'settings'
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
