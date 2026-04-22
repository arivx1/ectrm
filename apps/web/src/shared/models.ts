export type Trade = {
  trade_id: string
  originating_option_trade_id: string | null
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
  instrument_type: string
  option_type: string | null
  option_style: string | null
  option_strike_price: number | null
  option_expiration_date: string | null
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
  actualization_status: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  invoice_status: string
  payment_status: string
  settlement_status: string
  trader_user: string | null
  status: string
  last_event_id: string
  active_credit_exception?: TradeCreditExceptionRecord | null
  credit_approval_status?: string
  credit_hold_active?: boolean
  credit_hold_reason?: string | null
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

export type OptionExposureRow = {
  trade_id: string
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  trade_side: string
  option_type: string
  option_style: string | null
  option_strike_price: number | null
  option_expiration_date: string | null
  contract_volume: number
  premium_price: number | null
  premium_cashflow: number | null
  underlying_equivalent_volume: number
  trade_currency_code: string | null
  price_unit_code: string | null
  updated_at: string
}

export type DeliveryFieldSource = 'TRADE_DERIVED' | 'MANUAL' | 'SYSTEM_GENERATED'

export type DeliveryExecutionStatus =
  | 'PLANNED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED'

export type DeliveryEventType =
  | 'PLAN_CAPTURED'
  | 'SCHEDULE_COMMITTED'
  | 'EXECUTION_STARTED'
  | 'CHECKPOINT_RECORDED'
  | 'DELIVERY_COMPLETED'
  | 'HOLD_APPLIED'
  | 'HOLD_RELEASED'
  | 'CANCELLED'

export type DeliveryEventRecord = {
  event_id: number
  delivery_id: string
  trade_id: string
  leg_no: number | null
  event_type: DeliveryEventType
  execution_status: DeliveryExecutionStatus
  occurred_at: string
  location_code: string | null
  reference_code: string | null
  source: string | null
  notes: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
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
  book_source: DeliveryFieldSource
  portfolio: string | null
  portfolio_source: DeliveryFieldSource
  counterparty: string | null
  counterparty_source: DeliveryFieldSource
  commodity_class: string
  commodity: string
  volume: number | null
  unit_of_measure: string | null
  trade_currency_code: string | null
  price_unit_code: string | null
  location_code: string | null
  location_source: DeliveryFieldSource
  delivery_start: string | null
  delivery_end: string | null
  delivery_window_source: DeliveryFieldSource
  origin_location_code: string | null
  origin_location_code_source: DeliveryFieldSource | null
  destination_location_code: string | null
  destination_location_code_source: DeliveryFieldSource | null
  carrier_name: string | null
  carrier_name_source: DeliveryFieldSource | null
  carrier_reference: string | null
  carrier_reference_source: DeliveryFieldSource | null
  asset_reference: string | null
  asset_reference_source: DeliveryFieldSource | null
  incoterm_code: string | null
  incoterm_code_source: DeliveryFieldSource | null
  equipment_type: string | null
  equipment_type_source: DeliveryFieldSource | null
  load_reference: string | null
  load_reference_source: DeliveryFieldSource | null
  discharge_reference: string | null
  discharge_reference_source: DeliveryFieldSource | null
  receipt_location_code: string | null
  receipt_location_code_source: DeliveryFieldSource | null
  delivery_location_code: string | null
  delivery_location_code_source: DeliveryFieldSource | null
  pipeline_system: string | null
  pipeline_system_source: DeliveryFieldSource | null
  pipeline_path: string | null
  pipeline_path_source: DeliveryFieldSource | null
  pipeline_contract_number: string | null
  pipeline_contract_number_source: DeliveryFieldSource | null
  pipeline_cycle_code: string | null
  pipeline_cycle_code_source: DeliveryFieldSource | null
  nomination_reference: string | null
  nomination_reference_source: DeliveryFieldSource | null
  market_operator: string | null
  market_operator_source: DeliveryFieldSource | null
  pricing_node_code: string | null
  pricing_node_code_source: DeliveryFieldSource | null
  delivery_node_code: string | null
  delivery_node_code_source: DeliveryFieldSource | null
  profile_code: string | null
  profile_code_source: DeliveryFieldSource | null
  schedule_reference: string | null
  schedule_reference_source: DeliveryFieldSource | null
  interval_minutes: number | null
  interval_minutes_source: DeliveryFieldSource | null
  timezone_name: string | null
  timezone_name_source: DeliveryFieldSource | null
  execution_status: DeliveryExecutionStatus
  execution_status_source: DeliveryFieldSource
  event_count: number
  latest_event_type: DeliveryEventType | null
  latest_event_at: string | null
  operations_owner: string | null
  operations_owner_source: DeliveryFieldSource
  external_reference: string | null
  external_reference_source: DeliveryFieldSource
  ops_notes: string | null
  ops_notes_source: DeliveryFieldSource
  booked_at: string
  last_updated_at: string
  age_days: number
  pricing_status: string
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  actualization_status: string
  actualized_quantity: number | null
  actualized_at: string | null
  actualization_source: string | null
  actualization_notes: string | null
  actualization_updated_at: string | null
  actualization_variance_quantity: number | null
  invoice_status: string
  payment_status: string
  settlement_status: string
  blocker_count: number
  blockers: string[]
  scheduling_stage: 'BLOCKED' | 'READY' | 'IN_FLIGHT' | 'WATCHLIST'
  scheduling_owner: string | null
  scheduling_due_at: string | null
  open_scheduling_work_item_count: number
  next_scheduling_workflow_type: 'CONFIRMATION' | 'NOMINATION' | 'ALLOCATION' | null
  next_scheduling_workflow_status: string | null
  scheduling_work_items: DeliverySchedulingWorkflowItemRecord[]
  delivery_events: DeliveryEventRecord[]
}

export type ShipmentRecord = DeliveryRecord

export type DeliverySchedulingWorkflowItemRecord = {
  item_id: number
  workflow_type: 'CONFIRMATION' | 'NOMINATION' | 'ALLOCATION'
  status: string
  owner: string | null
  due_at: string | null
  notes: string | null
  updated_at: string
  version: number
  is_closed: boolean
  is_overdue: boolean
}

export type TradeCreditApprovalDecisionRecord = {
  decision_id: number
  trade_id: string
  workflow_item_id: number
  decision: string
  decision_comment: string
  breach_snapshot: Record<string, unknown>
  decided_at: string
  decided_by: string
}

export type TradeCreditApprovalFreshnessRecord = {
  trade_id: string
  counterparty_code: string | null
  review_due_at: string | null
  latest_external_snapshot_provider: string | null
  latest_external_snapshot_as_of_date: string | null
  latest_external_snapshot_age_days: number | null
  approval_blocked: boolean
  blocking_reasons: string[]
}

export type TradeCreditExceptionRecord = {
  exception_id: number
  trade_id: string
  workflow_item_id: number
  approval_decision_id: number | null
  status: string
  limit_currency_code: string
  approved_limit_amount: number | null
  approved_projected_exposure_amount: number
  approved_excess_amount: number | null
  approval_comment: string
  approved_at: string
  approved_by: string
  expires_at: string
  released_at: string | null
  released_by: string | null
  released_reason: string | null
  current_projected_exposure_amount: number | null
  remaining_headroom_amount: number | null
  revalidation_required: boolean
  revalidation_reason: string | null
}

export type OperationalRowActionStateRecord = {
  key: string
  available: boolean
  blocked_reason: string | null
  label: string | null
}

export type TradeWorkflowItemRecord = {
  item_id: number
  trade_id: string
  linked_trade_id: string | null
  linked_trade_status: string | null
  queue: 'operations' | 'settlement'
  workflow_type:
    | 'CONFIRMATION'
    | 'NOMINATION'
    | 'ALLOCATION'
    | 'ACTUALIZATION'
    | 'INVOICE'
    | 'PAYMENT'
    | 'CREDIT_APPROVAL'
    | 'OPTION_SETTLEMENT'
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
  action_states: OperationalRowActionStateRecord[]
  credit_approval_freshness?: TradeCreditApprovalFreshnessRecord | null
  active_credit_exception?: TradeCreditExceptionRecord | null
  credit_decision_history: TradeCreditApprovalDecisionRecord[]
  credit_approval_status?: string
  credit_hold_active?: boolean
  credit_hold_reason?: string | null
}

export type TradeConfirmationRecord = {
  confirmation_id: number
  trade_id: string
  source_document_id: string | null
  source_document_display_name: string | null
  source_document_review_status: string | null
  confirmation_number: string
  status: string
  sent_at: string | null
  confirmed_at: string | null
  issue_count: number
  last_issued_at: string | null
  last_issued_by: string | null
  last_issue_method: string | null
  last_issue_recipient: string | null
  last_issue_note: string | null
  receipt_status: string
  received_at: string | null
  received_by: string | null
  response_method: string | null
  response_reference: string | null
  response_note: string | null
  dispute_reason: string | null
  notes: string | null
  comparison_waiver_note: string | null
  comparison_waived_at: string | null
  comparison_waived_by: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  workflow_item_id: number | null
  workflow_owner: string | null
  is_current: boolean
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
  comparison_status: string
  blocking_mismatch_count: number
  mismatches: TradeConfirmationMismatchRecord[]
  action_states: OperationalRowActionStateRecord[]
}

export type TradeConfirmationMismatchRecord = {
  field_key: string
  label: string
  mismatch_type: string
  expected_value: string | null
  actual_value: string | null
  blocking: boolean
}

export type TradeInvoiceRecord = {
  invoice_id: number
  trade_id: string
  delivery_id: string | null
  leg_no: number | null
  invoice_number: string
  invoice_currency_code: string
  billed_quantity: number | null
  quantity_unit_code: string | null
  invoice_amount: number
  status: string
  issued_at: string
  due_at: string
  dispute_reason: string | null
  notes: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  workflow_item_id: number | null
  workflow_owner: string | null
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
  payment_status: string
  settlement_status: string
  total_paid_amount: number
  outstanding_amount: number
  action_states: OperationalRowActionStateRecord[]
}

export type TradePaymentRecord = {
  payment_id: number
  trade_id: string
  invoice_id: number
  invoice_number: string
  payment_reference: string
  payment_currency_code: string
  payment_amount: number
  status: string
  due_at: string
  received_at: string | null
  notes: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  workflow_item_id: number | null
  workflow_owner: string | null
  is_overdue: boolean
  age_days: number
  invoice_amount: number
  total_paid_amount: number
  outstanding_amount: number
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
  invoice_status: string
  settlement_status: string
  action_states: OperationalRowActionStateRecord[]
}

export type DocumentExtractedFieldRecord = {
  field_key: string
  label: string
  value: string
  confidence: number | null
  source: string
}

export type DocumentTableBlockRecord = {
  table_index: number
  template_key: string | null
  title: string | null
  columns: string[]
  rows: Array<Record<string, string | null>>
  header_row_detected: boolean
  source: string
}

export type DocumentRoutingCandidateRecord = {
  record_type: string
  label: string
  role: string
  score: number
  matched_keys: string[]
  missing_keys: string[]
  rationale: string
  create_if_missing: boolean
}

export type DocumentRoutingAssessmentRecord = {
  routing_strategy: string
  status: string
  confidence: number
  primary_record_type: string | null
  primary_label: string | null
  matched_keys: string[]
  missing_keys: string[]
  reasons: string[]
  candidates: DocumentRoutingCandidateRecord[]
}

export type DocumentLinkageCandidateRecord = {
  record_type: string
  record_id: string | null
  record_label: string
  role: string
  existing_record: boolean
  score: number
  matched_keys: string[]
  missing_keys: string[]
  summary: string
  reason: string
  create_if_missing: boolean
}

export type DocumentLinkageAssessmentRecord = {
  status: string
  recommended_action: string
  confidence: number
  primary_record_type: string | null
  primary_record_id: string | null
  primary_record_label: string | null
  reasons: string[]
  candidates: DocumentLinkageCandidateRecord[]
}

export type DocumentActionRecordRefRecord = {
  record_type: string
  record_id: string | null
  record_label: string
  existing_record: boolean
}

export type DocumentActionPlanRecord = {
  status: string
  action_type: string
  operation_type: string | null
  title: string
  description: string
  confidence: number
  target: DocumentActionRecordRefRecord | null
  owner: DocumentActionRecordRefRecord | null
  reasons: string[]
  payload: Record<string, unknown>
}

export type DocumentRecordLinkRecord = {
  record_type: string
  record_id: string
  record_label: string
  role: string
  source: string
  summary: string
  linked_at: string
  linked_by: string
}

export type DocumentProcessorTraceRecord = {
  provider: 'openai' | 'anthropic' | 'google' | null
  model: string | null
  applied: boolean
  overrode_heuristics: boolean
  partial: boolean
  warning_count: number
  warnings: string[]
}

export type DocumentProcessorPageTraceRecord = DocumentProcessorTraceRecord & {
  heuristic_document_kind: string | null
  heuristic_document_subtype: string | null
}

export type DocumentProcessorDocumentTraceRecord = DocumentProcessorTraceRecord & {
  applied_page_count: number
  overridden_page_count: number
  partial_page_count: number
}

export type DocumentIngestionPageRecord = {
  page_id: number
  page_number: number
  classification_status: string
  extraction_status: string
  document_kind: string
  document_subtype: string | null
  classification_confidence: number | null
  classification_payload: Record<string, unknown>
  header_fields: DocumentExtractedFieldRecord[]
  table_blocks: DocumentTableBlockRecord[]
  raw_text_excerpt: string | null
  text_source: 'none' | 'pdf_text' | 'ocr'
  preview_available: boolean
  processing_warnings: string[]
  processing_errors: string[]
  review_status: string
  review_notes: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  processed_at: string | null
  processor_trace: DocumentProcessorPageTraceRecord | null
  routing_assessment: DocumentRoutingAssessmentRecord | null
}

export type DocumentIngestionRecord = {
  document_id: string
  original_filename: string
  display_name: string
  content_type: string
  storage_key: string
  sha256: string
  size_bytes: number
  page_count: number
  status: string
  processor_provider: 'builtin' | 'openai' | 'anthropic' | 'google' | null
  processor_model: string | null
  classifier_version: string
  extractor_version: string
  analysis_summary: Record<string, unknown>
  processing_errors: string[]
  review_status: string
  review_notes: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  processor_trace: DocumentProcessorDocumentTraceRecord | null
  routing_assessment: DocumentRoutingAssessmentRecord | null
  linkage_assessment: DocumentLinkageAssessmentRecord | null
  action_plan: DocumentActionPlanRecord | null
  record_links: DocumentRecordLinkRecord[]
  pages: DocumentIngestionPageRecord[]
}

export type DocumentFieldSchemaRecord = {
  field_key: string
  label: string
  description: string | null
  value_type: string
  required: boolean
}

export type DocumentTableColumnSchemaRecord = {
  column_key: string
  label: string
  description: string | null
  value_type: string
  required: boolean
}

export type DocumentTableTemplateSchemaRecord = {
  template_key: string
  label: string
  description: string | null
  min_occurrences: number
  max_occurrences: number | null
  columns: DocumentTableColumnSchemaRecord[]
}

export type DocumentRecordTargetRecord = {
  record_type: string
  label: string
  role: string
  match_hint: string
  create_if_missing: boolean
}

export type DocumentKindSchemaRecord = {
  document_kind: string
  label: string
  document_family: string
  description: string
  review_guidance: string
  linkage_summary: string
  record_targets: DocumentRecordTargetRecord[]
  matching_keys: string[]
  header_fields: DocumentFieldSchemaRecord[]
  table_templates: DocumentTableTemplateSchemaRecord[]
}

export type DocumentSchemaRegistryRecord = {
  version: string
  document_kinds: DocumentKindSchemaRecord[]
}

export type DocumentProcessorProviderStatusRecord = {
  provider: 'openai' | 'anthropic' | 'google'
  label: string
  enabled: boolean
  configured: boolean
  is_default: boolean
  default_model: string
  base_url: string
  setup_env_var: string
}

export type DocumentProcessorRuntimeSettingsRecord = {
  enabled: boolean
  default_provider: 'openai' | 'anthropic' | 'google'
  effective_default_provider: 'openai' | 'anthropic' | 'google' | null
  configured_provider_count: number
  providers: DocumentProcessorProviderStatusRecord[]
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

export type PnlTradeValuation = {
  trade_id: string
  book: string | null
  portfolio: string | null
  commodity_class: string | null
  instrument_type: string
  trade_structure: string
  trade_side: string | null
  settlement_status: string
  pnl_bucket: string
  pricing_type: string
  pricing_source: string
  fixed_price: number | null
  price_index_code: string | null
  market_price: number | null
  effective_mark: number | null
  quantity: number | null
  direction: number
  trade_currency_code: string | null
  price_unit_code: string | null
  pnl_contribution: number | null
  valuation_status: string
  valuation_status_reason: string | null
  included_in_totals: boolean
}

export type PnlHistoryReport = {
  generated_at: string
  basis: string
  methodology: string
  point_count: number
  points: PnlHistoryPoint[]
  summary: PnlHistorySummary
  valuations: PnlTradeValuation[]
}

export type PnlPortfolioComparisonRow = {
  portfolio: string
  from_snapshot: PnlHistorySummary
  to_snapshot: PnlHistorySummary
  delta: PnlHistorySummary
}

export type PnlAttributionBreakdown = {
  market_move_pnl: number
  quantity_change_pnl: number
  coverage_change_pnl: number
  other_change_pnl: number
  realization_transfer_pnl: number
  reconciled_pnl_delta: number
}

export type PnlAttributionDriverEvent = {
  event_id: string
  event_type: string
  occurred_at: string
  actor_id: string | null
  summary: string
}

export type PnlTradeAttributionRow = {
  trade_id: string
  attribution_category: string
  pnl_delta: number
  breakdown: PnlAttributionBreakdown
  driver_summary: string
  driver_events: PnlAttributionDriverEvent[]
  from_valuation: PnlTradeValuation | null
  to_valuation: PnlTradeValuation | null
}

export type PnlComparisonBridgeDay = {
  from_as_of: string
  to_as_of: string
  delta: PnlHistorySummary
  attribution_summary: PnlAttributionBreakdown
  changed_trade_count: number
  top_driver_trade_id: string | null
  top_driver_category: string | null
  top_driver_pnl_delta: number | null
  top_driver_summary: string | null
}

export type PnlComparisonReport = {
  generated_at: string
  basis: string
  methodology: string
  from_as_of: string
  to_as_of: string
  from_snapshot: PnlHistorySummary
  to_snapshot: PnlHistorySummary
  delta: PnlHistorySummary
  attribution_summary: PnlAttributionBreakdown
  portfolio_deltas: PnlPortfolioComparisonRow[]
  attributions: PnlTradeAttributionRow[]
  daily_bridge: PnlComparisonBridgeDay[]
}

export type SettlementAgingCurrencySummary = {
  currency_code: string
  invoice_count: number
  overdue_invoice_count: number
  disputed_invoice_count: number
  total_outstanding_amount: number
  current_amount: number
  past_due_1_7_amount: number
  past_due_8_30_amount: number
  past_due_31_plus_amount: number
  disputed_amount: number
}

export type SettlementAgingRow = {
  counterparty_code: string | null
  book: string
  currency_code: string
  invoice_count: number
  trade_count: number
  overdue_invoice_count: number
  disputed_invoice_count: number
  total_outstanding_amount: number
  current_amount: number
  past_due_1_7_amount: number
  past_due_8_30_amount: number
  past_due_31_plus_amount: number
  disputed_amount: number
  oldest_due_at: string | null
  latest_due_at: string | null
}

export type SettlementAgingReport = {
  generated_at: string
  as_of: string
  row_count: number
  invoice_count: number
  overdue_invoice_count: number
  disputed_invoice_count: number
  currency_summaries: SettlementAgingCurrencySummary[]
  rows: SettlementAgingRow[]
}

export type CashForecastCurrencySummary = {
  currency_code: string
  open_outstanding_amount: number
  overdue_outstanding_amount: number
  expected_horizon_amount: number
  received_horizon_amount: number
  upcoming_invoice_count: number
  overdue_invoice_count: number
  received_payment_count: number
}

export type CashForecastPoint = {
  forecast_date: string
  currency_code: string
  expected_amount: number
  received_amount: number
  expected_invoice_count: number
  received_payment_count: number
}

export type CashForecastReport = {
  generated_at: string
  as_of: string
  horizon_days: number
  basis: string
  row_count: number
  currency_summaries: CashForecastCurrencySummary[]
  points: CashForecastPoint[]
}

export type SettlementExceptionSummary = {
  exception_type: string
  currency_code: string
  exception_count: number
  affected_trade_count: number
  total_outstanding_amount: number
}

export type SettlementExceptionRow = {
  exception_type: string
  severity: 'blocked' | 'in-progress'
  trade_id: string
  invoice_id: number
  invoice_number: string
  counterparty_code: string | null
  book: string
  commodity: string
  currency_code: string
  invoice_status: string
  payment_status: string
  settlement_status: string
  owner: string | null
  due_at: string | null
  last_received_at: string | null
  invoice_amount: number
  total_paid_amount: number
  outstanding_amount: number
  days_past_due: number
  summary: string
}

export type SettlementExceptionReport = {
  generated_at: string
  as_of: string
  row_count: number
  blocked_count: number
  warning_count: number
  summaries: SettlementExceptionSummary[]
  rows: SettlementExceptionRow[]
}

export type SettlementReportFilters = {
  book?: string
  counterparty?: string
  currency?: string
  exception_type?: string
  severity?: 'blocked' | 'in-progress'
}

export type SettlementReportFilterOptions = {
  books: string[]
  counterparties: string[]
  currencies: string[]
  exception_types: string[]
  severities: Array<'blocked' | 'in-progress'>
}

export type SettlementReportPresetRecord = {
  preset_id: number
  preset_key: 'settlement'
  name: string
  scope: 'PERSONAL' | 'SHARED'
  filters: SettlementReportFilters
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
}

export type PreTradeScenarioDraft = {
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  trade_side: 'BUY' | 'SELL'
  pricing_type: string
  price_index_code: string | null
  target_price: number | null
  target_volume: number | null
  trade_currency_code: string | null
  unit_of_measure: string | null
  price_unit_code: string | null
  location_code: string | null
  delivery_start: string | null
  delivery_end: string | null
}

export type PreTradeScenarioRecord = {
  scenario_id: number
  name: string
  thesis: string | null
  draft: PreTradeScenarioDraft
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
}

export type PreTradeReviewStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'

export type PreTradeReviewActivityAction = 'SUBMITTED' | 'CLAIMED' | 'COMMENTED' | 'APPROVED' | 'REJECTED' | 'BOOKED'
export type PreTradeRecommendationStance = 'PROCEED' | 'PROCEED_WITH_CARE' | 'ESCALATE' | 'WAIT_FOR_DATA'
export type PreTradeRecommendationConfidence = 'LOW' | 'MEDIUM' | 'HIGH'
export type PreTradeRecommendationCheckStatus = 'good' | 'watch' | 'block'
export type PreTradeRecommendationSourceType = 'USER_INPUT' | 'INTERNAL' | 'EXTERNAL' | 'DERIVED'
export type PreTradeRecommendationFreshness = 'FRESH' | 'STALE' | 'DEGRADED' | 'UNKNOWN'
export type PreTradeRecommendationSourceQuality = 'OK' | 'STALE' | 'DEGRADED' | 'MISSING'

export type PreTradeReviewActivityRecord = {
  activity_id: string
  action: PreTradeReviewActivityAction
  actor_id: string
  occurred_at: string
  comment: string | null
  payload: Record<string, unknown>
}

export type PreTradeReviewRecommendationSummaryRecord = {
  run_id: number
  run_key: string
  name: string
  stance: PreTradeRecommendationStance
  headline: string
  confidence: PreTradeRecommendationConfidence
  score: number
  explanation: PreTradeRecommendationExplanationRecord | null
  source_scenario_id: number | null
  source_review_id: number | null
  input_snapshot_count: number
  created_at: string
  created_by: string
}

export type PreTradeReviewItemRecord = {
  review_id: number
  name: string
  thesis: string | null
  draft: PreTradeScenarioDraft
  source_scenario_id: number | null
  recommendation_run_id: number | null
  recommendation_summary: PreTradeReviewRecommendationSummaryRecord | null
  recommendation_override_reason: string | null
  recommendation_override_by: string | null
  recommendation_override_at: string | null
  review_status: PreTradeReviewStatus
  owner: string | null
  due_at: string | null
  review_notes: string | null
  linked_trade_id: string | null
  linked_trade_status: string | null
  booked_at: string | null
  booked_by: string | null
  activity: PreTradeReviewActivityRecord[]
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
}

export type PreTradeRecommendationSourceSnapshotRecord = {
  source_key: string
  adapter_key: string | null
  adapter_label: string | null
  source_type: PreTradeRecommendationSourceType
  source_available: boolean
  captured_at: string | null
  freshness: PreTradeRecommendationFreshness
  quality_status: PreTradeRecommendationSourceQuality
  quality_score: number
  summary: string | null
  provenance: PreTradeRecommendationSourceProvenanceRecord
  payload: Record<string, unknown>
}

export type PreTradeRecommendationSourceProvenanceRecord = {
  provider: string | null
  dataset: string | null
  record_id: string | null
  observed_at: string | null
  ingested_at: string | null
  captured_by: string | null
}

export type PreTradeRecommendationSourceAdapterRecord = {
  adapter_key: string
  label: string
  source_type: PreTradeRecommendationSourceType
  description: string
  freshness_sla_hours: number | null
  required_for_recommendation: boolean
  payload_keys: string[]
  provenance_dataset: string
}

export type PreTradeRecommendationCheckRecord = {
  key: string
  label: string
  status: PreTradeRecommendationCheckStatus
  detail: string
  score_impact: number
}

export type PreTradeRecommendationExplanationRecord = {
  stance_rationale: string
  source_quality_rationale: string
  confidence_rationale: string
  primary_drivers: string[]
  reviewer_focus: string[]
}

export type PreTradeRecommendationResultRecord = {
  stance: PreTradeRecommendationStance
  headline: string
  summary: string
  confidence: PreTradeRecommendationConfidence
  score: number
  estimated_notional: number | null
  projected_credit_utilization_pct: number | null
  current_net_position: number | null
  related_active_trade_count: number
  latest_mark: number | null
  mark_gap_pct: number | null
  explanation: PreTradeRecommendationExplanationRecord
  checks: PreTradeRecommendationCheckRecord[]
  next_actions: string[]
}

export type PreTradeRecommendationRunRecord = {
  run_id: number
  run_key: string
  name: string
  thesis: string | null
  draft: PreTradeScenarioDraft
  source_scenario_id: number | null
  source_review_id: number | null
  input_snapshots: PreTradeRecommendationSourceSnapshotRecord[]
  recommendation: PreTradeRecommendationResultRecord
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
}

export type PreTradeReviewCaptureContext = {
  reviewId: number
  reviewName: string
  reviewThesis: string | null
  reviewNotes: string | null
  reviewOwner: string | null
  sourceScenarioId: number | null
  recommendationRunId: number | null
  recommendationHeadline: string | null
  recommendationStance: PreTradeRecommendationStance | null
  recommendationScore: number | null
  recommendationRationale: string | null
  recommendationOverrideReason: string | null
  recommendationOverrideBy: string | null
  recommendationOverrideAt: string | null
  approvedBy: string | null
  approvedAt: string | null
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

export type ExternalSeriesDefinitionRecord = {
  code: string
  provider: string
  dataset_code: string | null
  series_id: string
  name: string
  category: string
  frequency: string
  unit_code: string
  source_url: string | null
  description: string | null
  query_params: Record<string, unknown> | null
  transform_rule: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  version: number
}

export type ExternalSeriesObservationRecord = {
  id: number
  series_code: string
  observation_date: string
  value: number
  unit_code: string
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

export type WeatherLocationRecord = {
  code: string
  name: string
  reference_location_code: string | null
  latitude: number
  longitude: number
  timezone: string | null
  source_provider: string
  cwa: string | null
  grid_id: string | null
  grid_x: number | null
  grid_y: number | null
  station_id: string | null
  description: string | null
  is_active: boolean
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type WeatherForecastPeriodRecord = {
  id: number
  weather_location_code: string
  source_provider: string
  period_number: number
  start_at: string
  end_at: string
  is_daytime: boolean
  temperature: number | null
  temperature_unit: string | null
  wind_speed: string | null
  wind_direction: string | null
  short_forecast: string | null
  detailed_forecast: string | null
  probability_of_precipitation_pct: number | null
  relative_humidity_pct: number | null
  dewpoint_celsius: number | null
  icon_url: string | null
  downloaded_at: string
  run_id: number
}

export type WeatherObservationRecord = {
  id: number
  weather_location_code: string
  source_provider: string
  station_id: string
  observed_at: string
  text_description: string | null
  icon_url: string | null
  temperature_celsius: number | null
  dewpoint_celsius: number | null
  relative_humidity_pct: number | null
  wind_speed_kmh: number | null
  wind_direction_degrees: number | null
  barometric_pressure_pa: number | null
  visibility_meters: number | null
  downloaded_at: string
  run_id: number
}

export type WeatherCommodityExposureRecord = {
  commodity_code: string
  commodity_name: string
  commodity_class: string
  net_volume: number
  active_trade_count: number
  directional_bias: string
  weather_sensitivity_score: number
  primary_driver: string
  suggested_watch: string
}

export type WeatherRegionalSignalRecord = {
  region_code: string
  region_name: string
  demand_risk: string
  supply_risk: string
  storm_risk: string
  primary_driver: string
  narrative: string
  data_mode: string | null
  tracked_location_count: number | null
  current_temperature_f: number | null
  forecast_average_temperature_f: number | null
  temperature_trend_f: number | null
  heating_degree_days_24h: number | null
  cooling_degree_days_24h: number | null
  forecast_bias_f: number | null
  forecast_age_hours: number | null
  observation_age_hours: number | null
}

export type WeatherTrackedSourceRecord = {
  source_id: string
  source_name: string
  source_category: string
  update_frequency: string
  business_owner: string
  status: string
}

export type WeatherIntelligenceOverviewRecord = {
  analysis_mode: string
  as_of_date: string
  seasonal_regime: string
  headline: string
  summary: string
  latest_position_update_at: string | null
  latest_weather_update_at: string | null
  live_weather_location_count: number
  weather_sensitive_exposure_count: number
  weather_sensitive_gross_volume: number
  focus_areas: string[]
  exposures: WeatherCommodityExposureRecord[]
  regional_signals: WeatherRegionalSignalRecord[]
  tracked_sources: WeatherTrackedSourceRecord[]
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
export type AssistantAgentRoleCatalogStatus = 'SEEDED' | 'TEMPLATE' | 'PHASE_1' | 'PHASE_2_PLUS'
export type AssistantAgentProfileKind = 'CURATED' | 'ROLE_DERIVED' | 'CUSTOM'
export type AssistantAgentProfileRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ACTIVATED'
export type AssistantAgentAuthorityLevel =
  | 'OBSERVE'
  | 'EXPLAIN'
  | 'DRAFT'
  | 'STAGE'
  | 'EXECUTE'
  | 'EXTERNAL_COMMIT'
export const ASSISTANT_ACTION_TYPES = [
  'cancel_trade',
  'issue_trade_confirmation',
  'record_trade_confirmation_response',
  'update_trade_workflow_item',
  'issue_trade_invoice',
  'create_trade_payment',
  'reprocess_document_ingestion',
] as const
export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number]
export type AssistantActionRequestStatus = 'PENDING' | 'REJECTED' | 'EXECUTED' | 'FAILED'
export type AssistantActionRequestLifecycleStage =
  | 'AWAITING_REVIEW'
  | 'EXECUTED'
  | 'REJECTED'
  | 'FAILED'
export type AssistantActionRequestLifecycleTone = 'attention' | 'success' | 'neutral' | 'danger'

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

export type AssistantPolicyDecision = {
  resource_type: 'tool' | 'action'
  resource_id: string
  policy_key: string
  allowed: boolean
  reason: string
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  approval_required: boolean
  max_scope: AssistantAgentScope
  roles: string[]
  workspaces: ViewKey[]
}

export type AssistantAgentEffectivePolicy = {
  allowed_tools: AssistantPolicyDecision[]
  blocked_tools: AssistantPolicyDecision[]
  allowed_actions: AssistantPolicyDecision[]
  blocked_actions: AssistantPolicyDecision[]
  policy_notes: string[]
}

export type AssistantPolicySimulationPhase = 'stage' | 'execute'

export type AssistantPolicySimulationActionProposal = {
  action_type: AssistantActionType
  summary: string
  description: string
  payload: Record<string, unknown>
  decision: AssistantPolicyDecision
}

export type AssistantPolicySimulation = {
  agent_id: string
  agent_name: string
  workspace: ViewKey
  actor_role?: string | null
  phase: AssistantPolicySimulationPhase
  effective_policy: AssistantAgentEffectivePolicy
  allowed_tools: AssistantPolicyDecision[]
  blocked_tools: AssistantPolicyDecision[]
  allowed_actions: AssistantPolicyDecision[]
  blocked_actions: AssistantPolicyDecision[]
  staged_action_proposals: AssistantPolicySimulationActionProposal[]
  staging_warnings: string[]
  simulation_notes: string[]
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
  role_key?: string | null
  profile_kind: AssistantAgentProfileKind
  specialization_summary?: string | null
  human_owner_role?: string | null
  authority_ceiling?: AssistantAgentAuthorityLevel | null
  activation_notes?: string | null
  profile_request_id?: number | null
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  allowed_tools: string[]
  allowed_action_types: AssistantActionType[]
  daily_token_allocation?: number | null
  token_budget?: AssistantAgentTokenBudget
  effective_policy?: AssistantAgentEffectivePolicy
}

export type AssistantAgentTokenBudgetStatus = 'GREEN' | 'AMBER' | 'RED'
export type AssistantAgentTokenAllocationSource = 'AGENT' | 'DEFAULT'

export type AssistantAgentTokenBudget = {
  status: AssistantAgentTokenBudgetStatus
  allocated_tokens: number
  used_tokens: number
  remaining_tokens: number
  percent_used: number
  warning_threshold_percent: number
  allocation_source: AssistantAgentTokenAllocationSource
  window_started_at: string
  reset_at: string
}

export type AssistantAdminAgent = AssistantAgent & {
  system_prompt: string
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type AssistantAgentRoleArchetype = {
  role_key: string
  name: string
  description: string
  catalog_status: AssistantAgentRoleCatalogStatus
  mission: string[]
  human_owner_role: string
  allowed_workspaces: ViewKey[]
  work_objects: string[]
  capability_ceiling: AssistantAgentCapability[]
  default_tools: string[]
  maximum_action_types: AssistantActionType[]
  authority_ceiling: AssistantAgentAuthorityLevel
  approval_rules: string[]
  stop_conditions: string[]
  success_metrics: string[]
  required_eval_coverage: string[]
  base_prompt_guidance: string[]
  current_profile_ids: string[]
}

export type AssistantAgentProfileRequest = {
  request_id: number
  status: AssistantAgentProfileRequestStatus
  requested_agent_id: string | null
  business_problem: string
  proposed_mission: string
  human_owner_role: string
  requested_workspaces: ViewKey[]
  work_objects: string[]
  requested_inputs_tools: string[]
  expected_outputs: string[]
  requested_authority_ceiling: AssistantAgentAuthorityLevel
  stop_conditions: string[]
  success_metrics: string[]
  proposed_eval_cases: string[]
  approval_notes: string | null
  rejection_reason: string | null
  linked_agent_id: string | null
  requested_at: string
  requested_by: string
  reviewed_at: string | null
  reviewed_by: string | null
  activated_at: string | null
  activated_by: string | null
  updated_at: string
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

export type AssistantActionReviewObjectRef = {
  type: string
  id: string
  label?: string | null
}

export type AssistantActionReviewSupportingRecord = AssistantActionReviewObjectRef & {
  summary: string
}

export type AssistantActionReviewContext = {
  owning_work_object: AssistantActionReviewObjectRef
  required_reviewer_role: string
  business_rationale: string
  proposed_mutation: Record<string, unknown>
  supporting_records: AssistantActionReviewSupportingRecord[]
  assumptions: string[]
  missing_evidence: string[]
  expected_downstream_effects: string[]
  stale_state_basis: Record<string, unknown>
  idempotency_key?: string | null
}

export type AssistantActionRequestLifecycle = {
  stage: AssistantActionRequestLifecycleStage
  label: string
  tone: AssistantActionRequestLifecycleTone
  is_terminal: boolean
  can_approve: boolean
  can_reject: boolean
  reviewer_action_label?: string | null
  decided_label?: string | null
  review_risk_flags: string[]
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
  review_context?: AssistantActionReviewContext | null
  lifecycle: AssistantActionRequestLifecycle
  result?: Record<string, unknown> | null
  error_detail?: string | null
  created_at: string
  decided_at?: string | null
  decided_by?: string | null
}

export type AssistantActionRequestAdminSummary = {
  total_count: number
  pending_count: number
  executed_count: number
  rejected_count: number
  failed_count: number
  avg_decision_seconds?: number | null
}

export type AssistantActionRequestAdminPage = {
  items: AssistantActionRequest[]
  total_count: number
  limit: number
  offset: number
  has_more: boolean
  summary: AssistantActionRequestAdminSummary
}

export type AssistantOutcomeMetricRecommendationAction =
  | 'INSUFFICIENT_DATA'
  | 'KEEP_STAGED'
  | 'ELIGIBLE_FOR_BOUNDED_REVIEW'
  | 'RECOMMEND_PAUSE'

export type AssistantOutcomeMetricThresholds = {
  min_decided_actions_for_promotion: number
  max_rejection_rate_for_promotion: number
  max_failed_execution_rate_for_promotion: number
  max_stale_action_rate_for_promotion: number
  max_pending_actions_for_promotion: number
  min_decided_actions_for_pause_signal: number
  rejection_rate_pause_threshold: number
  failed_execution_rate_pause_threshold: number
  stale_action_rate_pause_threshold: number
  oldest_pending_hours_pause_threshold: number
}

export type AssistantOutcomeMetricRecommendation = {
  recommended_action: AssistantOutcomeMetricRecommendationAction
  promotion_candidate: boolean
  pause_recommended: boolean
  reasons: string[]
}

export type AssistantOutcomeMetricCounters = {
  staged_action_count: number
  pending_action_count: number
  executed_action_count: number
  rejected_action_count: number
  failed_action_count: number
  decided_action_count: number
  stale_action_count: number
  approval_rate?: number | null
  rejection_rate?: number | null
  failed_execution_rate?: number | null
  stale_action_rate?: number | null
  avg_decision_seconds?: number | null
  oldest_pending_age_seconds?: number | null
}

export type AssistantAgentOutcomeMetricRow = AssistantOutcomeMetricCounters & {
  agent_id?: string | null
  agent_name?: string | null
  agent_role_key?: string | null
  agent_profile_kind?: AssistantAgentProfileKind | null
  run_count: number
  completed_run_count: number
  failed_run_count: number
  warning_count: number
  warning_rate?: number | null
  tool_call_count: number
  helpful_feedback_count: number
  needs_work_feedback_count: number
  feedback_helpful_rate?: number | null
  recommendation: AssistantOutcomeMetricRecommendation
}

export type AssistantWorkspaceFeedbackMetricRow = {
  workspace?: ViewKey | null
  run_count: number
  helpful_feedback_count: number
  needs_work_feedback_count: number
  feedback_count: number
  feedback_helpful_rate?: number | null
}

export type AssistantRunFeedbackInsight = {
  feedback_id: number
  run_id: number
  conversation_id?: number | null
  agent_id?: string | null
  agent_name?: string | null
  workspace?: ViewKey | null
  user_id: string
  user_role: string
  rating: AssistantRunFeedbackRating
  comment?: string | null
  created_at: string
  updated_at: string
}

export type AssistantActionTypeOutcomeMetricRow = AssistantOutcomeMetricCounters & {
  action_type: AssistantActionType
  recommendation: AssistantOutcomeMetricRecommendation
}

export type AssistantOutcomeMetrics = {
  generated_at: string
  created_after?: string | null
  created_before?: string | null
  thresholds: AssistantOutcomeMetricThresholds
  total_feedback_count: number
  helpful_feedback_count: number
  needs_work_feedback_count: number
  feedback_helpful_rate?: number | null
  by_agent: AssistantAgentOutcomeMetricRow[]
  by_workspace: AssistantWorkspaceFeedbackMetricRow[]
  by_action_type: AssistantActionTypeOutcomeMetricRow[]
  recent_feedback: AssistantRunFeedbackInsight[]
}

export type AssistantPromptResponse = {
  conversation_id?: number | null
  conversation_updated_at?: string | null
  run_id?: number | null
  run_recorded_at?: string | null
  agent_id?: string | null
  agent_name?: string | null
  agent_role_key?: string | null
  agent_profile_kind?: AssistantAgentProfileKind | null
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
  agent_role_key?: string | null
  agent_profile_kind?: AssistantAgentProfileKind | null
  provider: AssistantProvider
  model: string
  generated_at: string
  warnings: string[]
  sections: AssistantPromptSection[]
  rendered_system_prompt: string
}

export type AssistantRunStatus = 'COMPLETED' | 'FAILED'
export type AssistantRunFeedbackRating = 'HELPFUL' | 'NEEDS_WORK'

export type AssistantRunFeedback = {
  feedback_id: number
  run_id: number
  conversation_id?: number | null
  user_id: string
  user_role: string
  rating: AssistantRunFeedbackRating
  comment?: string | null
  created_at: string
  updated_at: string
}

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
  agent_role_key?: string | null
  agent_profile_kind?: AssistantAgentProfileKind | null
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

export type AssistantAuditEvent = {
  event_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  occurred_at: string
  recorded_at: string
  actor_id?: string | null
  correlation_id?: string | null
  causation_id?: string | null
  payload: Record<string, unknown>
}

export type AssistantAuditTimelineEntry = {
  entry_type: string
  occurred_at: string
  title: string
  summary: string
  status?: string | null
  metadata: Record<string, unknown>
}

export type AssistantActionRequestTrace = {
  action_request: AssistantActionRequest
  mutation_events: AssistantAuditEvent[]
}

export type AssistantRunAuditTrace = {
  run: AssistantRun
  action_requests: AssistantActionRequestTrace[]
  timeline: AssistantAuditTimelineEntry[]
  mutation_event_count: number
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
  feedback?: AssistantRunFeedback | null
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
  | 'prompt'
  | 'dashboard'
  | 'guide'
  | 'demo'
  | 'pretrade'
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
