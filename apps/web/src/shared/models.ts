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
  pretrade_review_id?: number | null
  pretrade_recommendation_run_id?: number | null
  pretrade_approval_governance_snapshot?: PreTradeGovernanceAuditExportRecord | null
  pretrade_booking_governance_snapshot?: PreTradeGovernanceAuditExportRecord | null
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
  | 'EVENT_REVERSED'

export type DeliveryEventRecord = {
  event_id: number
  delivery_id: string
  trade_id: string
  leg_no: number | null
  event_type: DeliveryEventType
  execution_status: DeliveryExecutionStatus
  occurred_at: string
  reversal_of_event_id: number | null
  reversal_reason: string | null
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

export type TruckMovementStatus =
  | 'PLANNED'
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_STOP'
  | 'AT_STOP'
  | 'IN_TRANSIT'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'

export type TruckStopStatus =
  | 'PLANNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'WORKING'
  | 'DEPARTED'
  | 'SKIPPED'
  | 'CANCELLED'

export type TruckStopType = 'PICKUP' | 'DROPOFF' | 'WAYPOINT'

export type TruckCheckpointCode =
  | 'ARRIVED_PICKUP'
  | 'DEPARTED_PICKUP'
  | 'ARRIVED_DESTINATION'

export type TruckTrackingSignalProcessingStatus =
  | 'RECEIVED'
  | 'MATCHED'
  | 'UNRESOLVED'
  | 'REJECTED'
  | 'ERROR'

export type DeliveryTruckDetailRecord = {
  delivery_id: string
  target_run_count: number | null
  dispatcher_owner: string | null
  tracking_provider: string | null
  tracking_policy: string | null
  default_carrier_name: string | null
  default_carrier_name_source: DeliveryFieldSource
  default_external_carrier_reference: string | null
  default_external_carrier_reference_source: DeliveryFieldSource
  equipment_type: string | null
  equipment_type_source: DeliveryFieldSource
  origin_geofence_code: string | null
  origin_geofence_code_source: DeliveryFieldSource
  destination_geofence_code: string | null
  destination_geofence_code_source: DeliveryFieldSource
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type DeliveryTruckStopRecord = {
  stop_id: string
  movement_id: string
  stop_sequence: number
  stop_type: TruckStopType
  status: TruckStopStatus
  status_reason: string | null
  location_code: string | null
  location_code_source: DeliveryFieldSource
  planned_arrival_start: string | null
  planned_arrival_end: string | null
  planned_departure_start: string | null
  planned_departure_end: string | null
  appointment_reference: string | null
  appointment_reference_source: DeliveryFieldSource
  planned_quantity: number | null
  actual_quantity: number | null
  actual_arrived_at: string | null
  actual_departed_at: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type DeliveryTruckMovementTrackingHealthRecord = {
  last_evaluated_at: string
  eta_status: string
  eta_status_reason: string
  tracking_freshness_status: string
  tracking_freshness_reason: string
  dwell_status: string
  dwell_status_reason: string
  exception_severity: 'CLEAR' | 'WATCH' | 'ACTION_REQUIRED'
  primary_exception: string | null
  stale_after_minutes: number
  dwell_threshold_minutes: number
  destination_stop_id: string | null
  current_stop_id: string | null
  minutes_since_last_signal: number | null
  current_dwell_minutes: number | null
  eta_late_minutes: number | null
}

export type DeliveryTruckMovementSummaryRecord = {
  movement_id: string
  delivery_id: string
  sequence_no: number
  status: TruckMovementStatus
  status_reason: string | null
  planned_quantity: number | null
  planned_unit_of_measure: string | null
  carrier_name: string | null
  carrier_name_source: DeliveryFieldSource
  external_carrier_reference: string | null
  external_carrier_reference_source: DeliveryFieldSource
  dispatcher_owner: string | null
  dispatcher_owner_source: DeliveryFieldSource
  current_stop_sequence: number | null
  current_location_code: string | null
  last_signal_at: string | null
  current_eta_at_destination: string | null
  tracking_health?: DeliveryTruckMovementTrackingHealthRecord | null
  hold_reason_code: string | null
  hold_reason_code_source: DeliveryFieldSource
  stop_count: number
  active_stop_count: number
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type DeliveryTruckMovementRecord = DeliveryTruckMovementSummaryRecord & {
  driver_name: string | null
  driver_name_source: DeliveryFieldSource
  driver_phone: string | null
  driver_phone_source: DeliveryFieldSource
  tractor_reference: string | null
  tractor_reference_source: DeliveryFieldSource
  trailer_reference: string | null
  trailer_reference_source: DeliveryFieldSource
  external_load_reference: string | null
  external_load_reference_source: DeliveryFieldSource
  bill_of_lading_number: string | null
  bill_of_lading_number_source: DeliveryFieldSource
  truck_ticket_number: string | null
  truck_ticket_number_source: DeliveryFieldSource
  stops: DeliveryTruckStopRecord[]
}

export type DeliveryTruckTrackingExceptionRecord = {
  delivery_id: string
  trade_id: string
  leg_no: number | null
  external_trade_id: string | null
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  transport_mode: DeliveryRecord['transport_mode']
  execution_status: DeliveryExecutionStatus
  delivery_start: string | null
  delivery_end: string | null
  location_code: string | null
  origin_location_code: string | null
  destination_location_code: string | null
  operations_owner: string | null
  movement: DeliveryTruckMovementSummaryRecord
  tracking_health: DeliveryTruckMovementTrackingHealthRecord
}

export type DeliveryTrackingSignalRecord = {
  signal_id: number
  delivery_id: string | null
  movement_id: string | null
  stop_id: string | null
  source_system: string
  source_event_id: string | null
  signal_type: string
  occurred_at: string
  received_at: string
  latitude: number | null
  longitude: number | null
  location_code: string | null
  external_status: string | null
  normalized_status: string | null
  match_confidence: number | null
  dedupe_key: string
  processing_status: TruckTrackingSignalProcessingStatus
  processing_error: string | null
  raw_payload: Record<string, unknown>
}

export type DeliveryTrackingSignalIngestResultRecord = {
  ingest_status: string
  duplicate: boolean
  signal: DeliveryTrackingSignalRecord
  movement: DeliveryTruckMovementSummaryRecord
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
    | 'AIR'
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
  truck_detail?: DeliveryTruckDetailRecord | null
  truck_movement_count?: number
  active_truck_movement_count?: number
  rail_route_code: string | null
  rail_route_code_source: DeliveryFieldSource | null
  rail_line_code: string | null
  railroad_code: string | null
  rail_route_direction: string | null
  rail_schedule_timezone: string | null
  rail_service_calendar_code: string | null
  rail_placement_cutoff_time_local: string | null
  rail_release_cutoff_time_local: string | null
  rail_placement_free_time_hours: number | null
  rail_release_free_time_hours: number | null
  origin_station_code: string | null
  origin_station_code_source: DeliveryFieldSource | null
  destination_station_code: string | null
  destination_station_code_source: DeliveryFieldSource | null
  waybill_reference: string | null
  waybill_reference_source: DeliveryFieldSource | null
  release_number: string | null
  release_number_source: DeliveryFieldSource | null
  unit_train_id: string | null
  unit_train_id_source: DeliveryFieldSource | null
  railcar_count: number | null
  railcar_count_source: DeliveryFieldSource | null
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
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
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
  reversal_of_payment_id: number | null
  reversal_reason: string | null
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

export type DocumentUnderstandingSourceCountsRecord = {
  none: number
  pdf_text: number
  ocr: number
}

export type DocumentUnderstandingTextStatsRecord = {
  source: 'none' | 'pdf_text' | 'ocr'
  text_available: boolean
  character_count: number
  line_count: number
  token_count: number
  numeric_token_count: number
  date_like_value_count: number
  currency_marker_count: number
}

export type DocumentUnderstandingDocumentTextStatsRecord = {
  pages_with_text: number
  source_counts: DocumentUnderstandingSourceCountsRecord
  total_character_count: number
  total_line_count: number
  total_token_count: number
  total_numeric_token_count: number
  total_date_like_value_count: number
  total_currency_marker_count: number
}

export type DocumentUnderstandingLayoutHintsRecord = {
  non_empty_line_count: number
  short_line_count: number
  uppercase_line_count: number
  key_value_line_count: number
  table_like_line_count: number
}

export type DocumentUnderstandingStructureSignalsRecord = {
  header_candidate_count: number
  header_candidate_keys: string[]
  table_candidate_count: number
  table_template_keys: string[]
  table_column_count: number
  table_column_keys: string[]
  table_row_count: number
}

export type DocumentUnderstandingVisualSignalsRecord = {
  preview_generated: boolean
  preview_available: boolean
  image_has_visible_content: boolean
  ocr_used: boolean
}

export type DocumentUnderstandingDocumentVisualSummaryRecord = {
  preview_generated_page_count: number
  preview_available_page_count: number
  visible_content_page_count: number
}

export type DocumentUnderstandingContentFingerprintRecord = {
  filename_signature: string | null
  content_features: string[]
  content_feature_count: number
  learning_version: string | null
}

export type DocumentUnderstandingClassificationEvidenceRecord = {
  system_document_kind: string | null
  system_document_subtype: string | null
  system_classification_source: string | null
  system_classification_confidence: number | null
  matched_by: string | null
  corrected: boolean
  correction_count: number
  corrected_document_kind: string | null
  corrected_document_subtype: string | null
  learning_applied: boolean
  learning_source: string | null
  learning_similarity: number | null
  learning_example_count: number
  automated_document_kind: string | null
  automated_document_subtype: string | null
}

export type DocumentUnderstandingClassificationAssessmentRecord = {
  assessment_version: string | null
  document_kind: string | null
  document_subtype: string | null
  confidence: number | null
  matched_by: string | null
  supporting_evidence: string[]
  conflicts: string[]
}

export type DocumentIngestionPageUnderstandingRecord = {
  bundle_version: string
  text_stats: DocumentUnderstandingTextStatsRecord
  layout_hints: DocumentUnderstandingLayoutHintsRecord
  structure_signals: DocumentUnderstandingStructureSignalsRecord
  visual_signals: DocumentUnderstandingVisualSignalsRecord
  content_fingerprint: DocumentUnderstandingContentFingerprintRecord
  classification_evidence: DocumentUnderstandingClassificationEvidenceRecord
  deterministic_assessment: DocumentUnderstandingClassificationAssessmentRecord
}

export type DocumentIngestionUnderstandingRecord = {
  bundle_version: string
  page_count: number
  text_stats: DocumentUnderstandingDocumentTextStatsRecord
  structure_signals: DocumentUnderstandingStructureSignalsRecord
  visual_signals: DocumentUnderstandingDocumentVisualSummaryRecord
  content_fingerprint: DocumentUnderstandingContentFingerprintRecord
  deterministic_assessment: DocumentUnderstandingClassificationAssessmentRecord
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
  understanding: DocumentIngestionPageUnderstandingRecord
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
  source_available: boolean
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
  understanding: DocumentIngestionUnderstandingRecord
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

export type DocumentFacetValueRecord = {
  code: string
  label: string
  description: string | null
}

export type DocumentFacetSchemaRecord = {
  facet_key: string
  label: string
  description: string | null
  value_type: string
  repeatable: boolean
  required: boolean
  allowed_values: DocumentFacetValueRecord[]
}

export type DocumentExtractionObjectSchemaRecord = {
  object_key: string
  label: string
  cardinality: string
  source_object_type: string | null
  canonical_table: string | null
  description: string | null
  field_keys: string[]
  table_template_keys: string[]
  child_object_keys: string[]
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
  facets: DocumentFacetSchemaRecord[]
  extraction_schema_code: string | null
  deep_extraction_required: boolean
  extraction_objects: DocumentExtractionObjectSchemaRecord[]
  validation_rules: string[]
  review_rules: string[]
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
  available_models?: string[]
  base_url: string
  setup_env_var: string
}

export type DocumentGmailInboxRuntimeSettingsRecord = {
  enabled: boolean
  configured: boolean
  provider: 'gmail_api'
  account_email: string | null
  query: string
  max_messages_per_import: number
  auth_status: 'none' | 'partial' | 'configured'
}

export type DocumentGmailInboxAttachmentRecord = {
  filename: string
  mime_type: string
  size_bytes: number
  part_token: string
  attachment_id: string | null
  importable: boolean
  already_imported: boolean
}

export type DocumentGmailInboxMessageSummaryRecord = {
  message_id: string
  thread_id: string | null
  subject: string | null
  sender: string | null
  received_at: string | null
  snippet: string | null
  unread: boolean
  attachment_count: number
  pdf_attachment_count: number
  imported_pdf_attachment_count: number
}

export type DocumentGmailInboxBrowseResultRecord = {
  query: string
  page_size: number
  next_page_token: string | null
  messages: DocumentGmailInboxMessageSummaryRecord[]
}

export type DocumentGmailInboxMessageDetailRecord = {
  message_id: string
  thread_id: string | null
  subject: string | null
  sender: string | null
  to_recipients: string | null
  received_at: string | null
  snippet: string | null
  unread: boolean
  body_text: string | null
  body_truncated: boolean
  attachments: DocumentGmailInboxAttachmentRecord[]
}

export type DocumentProcessorRuntimeSettingsRecord = {
  enabled: boolean
  default_provider: 'openai' | 'anthropic' | 'google'
  effective_default_provider: 'openai' | 'anthropic' | 'google' | null
  configured_provider_count: number
  providers: DocumentProcessorProviderStatusRecord[]
  gmail_inbox?: DocumentGmailInboxRuntimeSettingsRecord | null
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
  allowed_transport_modes?: Array<Exclude<DeliveryRecord['transport_mode'], 'UNSPECIFIED'>>
}

export type AssetRecord = ReferenceRecord & {
  asset_class: string
  asset_type: string
  asset_reality: string
  commodity_code?: string | null
  location_code?: string | null
  latitude?: number | null
  longitude?: number | null
  geometry_geojson?: Record<string, unknown> | null
  capacity_value?: number | null
  capacity_unit_code?: string | null
  operator_name?: string | null
  operating_status: string
  source_name?: string | null
  source_url?: string | null
  confidence?: number | null
  notes?: string | null
}

export type SpatialFeatureRecord = ReferenceRecord & {
  feature_kind: string
  geometry_type: string
  geometry_geojson: Record<string, unknown>
  entity_type?: string | null
  entity_code?: string | null
  label_latitude?: number | null
  label_longitude?: number | null
  is_primary: boolean
  source_name?: string | null
  source_url?: string | null
  confidence?: number | null
  notes?: string | null
}

export type RailRouteRecord = ReferenceRecord & {
  rail_line_code: string
  origin_location_code?: string | null
  destination_location_code?: string | null
  service_calendar_code?: string | null
  route_direction: string
  schedule_timezone?: string | null
  placement_cutoff_time_local?: string | null
  release_cutoff_time_local?: string | null
  placement_free_time_hours?: number | null
  release_free_time_hours?: number | null
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

export type AssetStandards = {
  default_asset_class: string
  default_asset_type_by_class: Record<string, string>
  asset_classes: string[]
  asset_types_by_class: Record<string, string[]>
  default_asset_reality: string
  asset_realities: string[]
  default_operating_status: string
  operating_statuses: string[]
}

export const DEFAULT_ASSET_STANDARDS: AssetStandards = {
  default_asset_class: 'PIPELINE',
  default_asset_type_by_class: {
    PIPELINE: 'TRANSMISSION',
    GENERATION: 'THERMAL',
    REFINERY: 'CONVERSION',
    UPSTREAM_PRODUCTION: 'OIL_FIELD',
    PROCESSING: 'GAS_PLANT',
    STORAGE: 'TANK_FARM',
    TERMINAL: 'MARINE',
    CONSUMPTION: 'INDUSTRIAL',
  },
  asset_classes: [
    'CONSUMPTION',
    'GENERATION',
    'PIPELINE',
    'PROCESSING',
    'REFINERY',
    'STORAGE',
    'TERMINAL',
    'UPSTREAM_PRODUCTION',
  ],
  asset_types_by_class: {
    PIPELINE: ['DISTRIBUTION', 'GATHERING', 'TRANSMISSION'],
    GENERATION: ['HYDRO', 'NUCLEAR', 'RENEWABLE', 'STORAGE', 'THERMAL'],
    REFINERY: ['CONVERSION', 'HYDROSKIMMING', 'INTEGRATED', 'TOPPING'],
    UPSTREAM_PRODUCTION: ['GAS_FIELD', 'LNG_PROJECT', 'OFFSHORE', 'OIL_FIELD'],
    PROCESSING: ['FRACTIONATOR', 'GAS_PLANT', 'LNG_EXPORT', 'LNG_IMPORT', 'PETROCHEMICAL'],
    STORAGE: ['BATTERY', 'CAVERN', 'RESERVOIR', 'TANK_FARM'],
    TERMINAL: ['LNG', 'MARINE', 'PIPELINE', 'RAIL', 'TRUCK'],
    CONSUMPTION: ['DATACENTER', 'INDUSTRIAL', 'POWER_LOAD', 'RESIDENTIAL'],
  },
  default_asset_reality: 'REAL',
  asset_realities: ['REAL', 'SIMULATED'],
  default_operating_status: 'OPERATING',
  operating_statuses: ['IDLED', 'MAINTENANCE', 'OPERATING', 'PLANNED', 'RETIRED', 'UNDER_CONSTRUCTION'],
}

export type SpatialFeatureStandards = {
  default_feature_kind: string
  feature_kinds: string[]
  geometry_types: string[]
  entity_types: string[]
}

export const DEFAULT_SPATIAL_FEATURE_STANDARDS: SpatialFeatureStandards = {
  default_feature_kind: 'REGION',
  feature_kinds: ['AREA', 'BASIN', 'CORRIDOR', 'FOOTPRINT', 'PIPELINE', 'REGION', 'ROUTE', 'TERRITORY'],
  geometry_types: ['AREA', 'LINE', 'MIXED', 'POINT'],
  entity_types: ['ASSET', 'LOCATION', 'RAIL_ROUTE'],
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

export type SemanticDatasetFieldType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'datetime'
export type SemanticDatasetFieldRole = 'identifier' | 'dimension' | 'measure' | 'status' | 'timestamp' | 'narrative'
export type SemanticDatasetSourceKind = 'projection' | 'reference_data' | 'report_service' | 'external_series' | 'manual'
export type SemanticDatasetStatus = 'active' | 'planned'

export type SemanticDatasetField = {
  field_key: string
  label: string
  data_type: SemanticDatasetFieldType
  role: SemanticDatasetFieldRole
  nullable: boolean
  filterable: boolean
  groupable: boolean
  aggregatable: boolean
  formula_eligible: boolean
  description?: string | null
  source_path?: string | null
}

export type SemanticDatasetDefinition = {
  dataset_id: string
  name: string
  description: string
  owning_domain: string
  source_kind: SemanticDatasetSourceKind
  source_ref: string
  grain: string
  fields: SemanticDatasetField[]
  parameter_keys: string[]
  default_sort: string[]
  freshness_policy: string
  access_policy_key: string
  status: SemanticDatasetStatus
}

export type ReportDefinitionValidationStatus = 'valid' | 'invalid'
export type ReportDefinitionIssueSeverity = 'error' | 'warning'
export type ReportDefinitionDependencyRole = 'source' | 'field' | 'parameter' | 'formula_input' | 'prior_run'
export type ReportDefinitionScope = 'personal' | 'team' | 'global'
export type WorkbookSheetKind = 'manual' | 'dataset' | 'report' | 'workbook_run' | 'formula'

export type ReportDefinitionColumnDraft = {
  field_key: string
  label?: string | null
}

export type ReportDefinitionDraft = {
  report_key: string
  name: string
  description?: string | null
  scope?: ReportDefinitionScope
  dataset_id: string
  columns?: ReportDefinitionColumnDraft[]
  parameter_keys?: string[]
  default_sort?: string[]
}

export type WorkbookSheetDefinitionDraft = {
  sheet_key: string
  sheet_name: string
  sheet_kind: WorkbookSheetKind
  dataset_id?: string | null
  report_key?: string | null
  run_id?: string | null
  columns?: ReportDefinitionColumnDraft[]
  depends_on?: string[]
  formulas?: string[]
}

export type WorkbookDefinitionDraft = {
  workbook_key: string
  name: string
  description?: string | null
  scope?: ReportDefinitionScope
  parameter_keys?: string[]
  sheets?: WorkbookSheetDefinitionDraft[]
}

export type ReportDefinitionValidationIssue = {
  severity: ReportDefinitionIssueSeverity
  code: string
  message: string
  location: string
}

export type ReportDefinitionDependencyEdge = {
  from_ref: string
  to_kind: string
  to_ref: string
  dependency_role: ReportDefinitionDependencyRole
  field_ref?: string | null
}

export type ReportDefinitionValidationResult = {
  status: ReportDefinitionValidationStatus
  valid: boolean
  error_count: number
  warning_count: number
  issues: ReportDefinitionValidationIssue[]
  dependency_edges: ReportDefinitionDependencyEdge[]
  referenced_dataset_ids: string[]
}

export type ReportingOverview = {
  active_trade_count: number
  tracked_commodity_count: number
  gross_net_volume: number
  exposure: ExposureSummaryRow[]
  activity: ActivitySummaryRow[]
}

export type TradingEodStatus = 'READY' | 'WARNING' | 'BLOCKED'

export type TradingEodCheck = {
  key: string
  title: string
  status: TradingEodStatus
  owner_role: string
  reason: string
  supporting_metrics: Record<string, string | number | boolean>
}

export type TradingEodTradeSummary = {
  active_trade_count: number
  priced_active_count: number
  pending_pricing_count: number
  pending_settlement_count: number
  tracked_book_count: number
  total_active_volume: number
}

export type TradingEodPnlSummary = {
  basis: string
  methodology: string
  total_pnl: number
  realized_pnl: number
  unrealized_pnl: number
  priced_trade_count: number
  realized_trade_count: number
  unrealized_trade_count: number
}

export type TradingEodOperationsSummary = {
  open_work_item_count: number
  operations_queue_count: number
  settlement_queue_count: number
  attention_count: number
  stale_pricing_count: number
  incomplete_ops_data_count: number
}

export type TradingEodSettlementSummary = {
  invoice_count: number
  overdue_invoice_count: number
  disputed_invoice_count: number
  blocked_exception_count: number
  warning_exception_count: number
  payment_due_count: number
  invoice_pending_count: number
}

export type TradingEodProjectionSummary = {
  structural_issue_count: number
  invariant_issue_count: number
  impacted_trade_count: number
}

export type TradingEodAccrualSummary = {
  row_count: number
  lot_count: number
  unbilled_amount_total: number
  billed_uncollected_amount_total: number
  net_open_amount_total: number
  coverage_basis: string
}

export type TradingEodReport = {
  generated_at: string
  business_date: string
  as_of: string
  evaluation_timestamp: string
  basis: string
  status: TradingEodStatus
  blocked_check_count: number
  warning_check_count: number
  ready_check_count: number
  checks: TradingEodCheck[]
  coverage_notes: string[]
  trade_summary: TradingEodTradeSummary
  pnl_summary: TradingEodPnlSummary
  operations_summary: TradingEodOperationsSummary
  settlement_summary: TradingEodSettlementSummary
  projection_summary: TradingEodProjectionSummary
  accrual_summary: TradingEodAccrualSummary
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
export type PreTradeGovernanceRiskStatus = 'CLEAR' | 'WATCH' | 'ACTION_REQUIRED'
export type PreTradeOpportunityCategory =
  | 'MARK_GAP'
  | 'EXPOSURE_OFFSET'
  | 'RISK_REDUCTION'
  | 'RISK_INCREASE'
  | 'STANDARD_REVIEW'
  | 'WAIT_FOR_DATA'
export type PreTradeExposureDirection = 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN'
export type PreTradeExposureEffect = 'OFFSETS' | 'DEEPENS' | 'NEUTRAL' | 'UNKNOWN'
export type PreTradeNettingCandidateMatchQuality = 'EXACT' | 'PARTIAL' | 'REJECTED'
export type PreTradeHedgeInstrumentType = 'FUTURES' | 'OPTIONS' | 'SWAP' | 'PHYSICAL_OFFSET' | 'NO_HEDGE' | 'WAIT_FOR_DATA'
export type PreTradeMissingEvidenceSeverity = 'BLOCKING' | 'WARNING'
export type PreTradeGovernanceAuditCategory =
  | 'PENDING_REVIEW'
  | 'RISKY_RECOMMENDATION'
  | 'UNRESOLVED_RISKY_RECOMMENDATION'
  | 'OVERRIDE'
  | 'BOOKED_WITH_OVERRIDE'
  | 'STALE_EVIDENCE'
export type PreTradeReviewDriftStatus = 'ALIGNED' | 'REAPPROVAL_REQUIRED' | 'NOT_APPROVED'
export type PreTradeReviewDriftReasonCode =
  | 'MISSING_APPROVAL_SNAPSHOT'
  | 'MISSING_APPROVAL_BASELINE'
  | 'RECOMMENDATION_CHANGED'
  | 'NEWER_RECOMMENDATION_AVAILABLE'
  | 'SOURCE_IMPAIRMENT_APPEARED'
  | 'OVERRIDE_CHANGED'

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
  approval_governance_snapshot: PreTradeGovernanceAuditExportRecord | null
  booking_governance_snapshot: PreTradeGovernanceAuditExportRecord | null
  activity: PreTradeReviewActivityRecord[]
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
}

export type PreTradeReviewDriftReasonRecord = {
  code: PreTradeReviewDriftReasonCode
  summary: string
  detail: string
}

export type PreTradeReviewDriftRecord = {
  review_id: number
  checked_at: string
  review_status: PreTradeReviewStatus
  alignment_status: PreTradeReviewDriftStatus
  requires_reapproval: boolean
  approval_snapshot_generated_at: string | null
  approval_snapshot_exported_by: string | null
  approved_by: string | null
  approved_at: string | null
  approved_recommendation_run_id: number | null
  approved_recommendation_stance: PreTradeRecommendationStance | null
  approved_recommendation_score: number | null
  current_recommendation_run_id: number | null
  current_recommendation_stance: PreTradeRecommendationStance | null
  current_recommendation_score: number | null
  latest_recommendation_run_id: number | null
  latest_recommendation_stance: PreTradeRecommendationStance | null
  latest_recommendation_score: number | null
  current_impaired_sources: string[]
  reasons: PreTradeReviewDriftReasonRecord[]
}

export type PreTradeGovernanceSummaryRecord = {
  generated_at: string
  risk_status: PreTradeGovernanceRiskStatus
  open_review_count: number
  in_review_count: number
  approved_review_count: number
  rejected_review_count: number
  pending_review_count: number
  booked_review_count: number
  risky_recommendation_count: number
  unresolved_risky_recommendation_count: number
  override_count: number
  booked_with_override_count: number
  stale_evidence_run_count: number
  stale_evidence_source_count: number
  recommendation_run_count: number
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

export type PreTradeRecommendationEvidenceRefRecord = {
  source_key: string
  adapter_key: string | null
  adapter_label: string | null
  source_type: PreTradeRecommendationSourceType
  freshness: PreTradeRecommendationFreshness
  quality_status: PreTradeRecommendationSourceQuality
  record_id: string | null
  summary: string | null
}

export type PreTradeRecommendationOpportunitySummaryRecord = {
  category: PreTradeOpportunityCategory
  title: string
  detail: string
  driver_keys: string[]
  source_refs: PreTradeRecommendationEvidenceRefRecord[]
}

export type PreTradeRecommendationResidualExposureRecord = {
  current_net_position: number | null
  proposed_trade_delta: number | null
  residual_after_trade: number | null
  direction_before: PreTradeExposureDirection
  direction_after: PreTradeExposureDirection
  exposure_effect: PreTradeExposureEffect
  detail: string
  source_refs: PreTradeRecommendationEvidenceRefRecord[]
}

export type PreTradeRecommendationNettingCandidateRecord = {
  candidate_id: string
  label: string
  match_quality: PreTradeNettingCandidateMatchQuality
  matched_quantity: number | null
  residual_quantity: number | null
  constraints: string[]
  rejection_reasons: string[]
  source_refs: PreTradeRecommendationEvidenceRefRecord[]
}

export type PreTradeRecommendationHedgeRecommendationRecord = {
  instrument_type: PreTradeHedgeInstrumentType
  rationale: string
  target_delta: number | null
  hedge_ratio: number | null
  policy_stops: string[]
  source_refs: PreTradeRecommendationEvidenceRefRecord[]
}

export type PreTradeRecommendationRejectedAlternativeRecord = {
  alternative: PreTradeHedgeInstrumentType
  reason: string
  source_refs: PreTradeRecommendationEvidenceRefRecord[]
}

export type PreTradeRecommendationMissingEvidenceRecord = {
  evidence_key: string
  label: string
  severity: PreTradeMissingEvidenceSeverity
  detail: string
  source_refs: PreTradeRecommendationEvidenceRefRecord[]
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
  opportunity_summary: PreTradeRecommendationOpportunitySummaryRecord | null
  residual_exposure: PreTradeRecommendationResidualExposureRecord | null
  netting_candidates: PreTradeRecommendationNettingCandidateRecord[]
  hedge_recommendation: PreTradeRecommendationHedgeRecommendationRecord | null
  rejected_alternatives: PreTradeRecommendationRejectedAlternativeRecord[]
  missing_evidence: PreTradeRecommendationMissingEvidenceRecord[]
}

export type PreTradeRecommendationSourceQualityDeltaRecord = {
  adapter_key: string
  adapter_label: string
  previous_quality_status: PreTradeRecommendationSourceQuality | null
  current_quality_status: PreTradeRecommendationSourceQuality | null
  previous_freshness: PreTradeRecommendationFreshness | null
  current_freshness: PreTradeRecommendationFreshness | null
}

export type PreTradeRecommendationInputDeltaRecord = {
  adapter_key: string
  adapter_label: string
  change_type: 'ADDED' | 'REMOVED' | 'CHANGED'
}

export type PreTradeRecommendationRunComparisonRecord = {
  previous_run_id: number
  previous_run_key: string
  previous_created_at: string
  previous_stance: PreTradeRecommendationStance
  previous_score: number
  stance_changed: boolean
  score_delta: number
  added_primary_drivers: string[]
  removed_primary_drivers: string[]
  source_quality_changes: PreTradeRecommendationSourceQualityDeltaRecord[]
  input_snapshot_changes: PreTradeRecommendationInputDeltaRecord[]
  summary: string
}

export type PreTradeRecommendationDraftAnalysisRecord = {
  thesis: string | null
  draft: PreTradeScenarioDraft
  source_scenario_id: number | null
  source_review_id: number | null
  input_snapshots: PreTradeRecommendationSourceSnapshotRecord[]
  recommendation: PreTradeRecommendationResultRecord
  comparison: PreTradeRecommendationRunComparisonRecord | null
  evaluated_at: string
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
  comparison: PreTradeRecommendationRunComparisonRecord | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
}

export type PreTradeGovernanceStaleEvidenceRunRecord = {
  run: PreTradeRecommendationRunRecord
  impaired_snapshots: PreTradeRecommendationSourceSnapshotRecord[]
}

export type PreTradeGovernanceItemsRecord = {
  generated_at: string
  pending_reviews: PreTradeReviewItemRecord[]
  risky_recommendation_reviews: PreTradeReviewItemRecord[]
  unresolved_risky_recommendation_reviews: PreTradeReviewItemRecord[]
  override_reviews: PreTradeReviewItemRecord[]
  booked_with_override_reviews: PreTradeReviewItemRecord[]
  stale_evidence_runs: PreTradeGovernanceStaleEvidenceRunRecord[]
}

export type PreTradeGovernanceAuditRowRecord = {
  category: PreTradeGovernanceAuditCategory
  review_id: number | null
  run_id: number | null
  run_key: string | null
  linked_trade_id: string | null
  name: string
  book: string | null
  commodity: string | null
  review_status: PreTradeReviewStatus | null
  recommendation_stance: PreTradeRecommendationStance | null
  recommendation_score: number | null
  override_reason: string | null
  override_by: string | null
  override_at: string | null
  booked_by: string | null
  booked_at: string | null
  source_adapter_key: string | null
  source_adapter_label: string | null
  source_quality_status: PreTradeRecommendationSourceQuality | null
  source_freshness: PreTradeRecommendationFreshness | null
  source_provider: string | null
  source_dataset: string | null
  source_observed_at: string | null
  summary: string
}

export type PreTradeGovernanceAuditExportRecord = {
  generated_at: string
  exported_by: string
  format_version: string
  summary: PreTradeGovernanceSummaryRecord
  items: PreTradeGovernanceItemsRecord
  audit_rows: PreTradeGovernanceAuditRowRecord[]
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
export type AssistantAgentSkillKey =
  | 'market_intelligence'
  | 'pretrade_structuring'
  | 'risk_monitoring'
  | 'trade_lifecycle_management'
  | 'trade_governance'
  | 'trade_operations_coordination'
  | 'settlement_operations'
  | 'movement_control'
  | 'accrual_control'
  | 'accounting_posting'
  | 'counterparty_state_sync'
  | 'confirmation_control'
  | 'workflow_control'
  | 'invoice_control'
  | 'document_triage'
  | 'reporting_reconciliation'
  | 'logistics_coordination'
  | 'fee_accrual_management'
  | 'counterparty_outreach'
  | 'agent_supervision'
  | 'inter_agent_consultation'
export type AssistantAgentRoleCatalogStatus = 'SEEDED' | 'TEMPLATE' | 'PHASE_1' | 'PHASE_2_PLUS'
export type AssistantAgentProfileKind = 'CURATED' | 'ROLE_DERIVED' | 'CUSTOM'
export type AssistantAgentProfileRequestKind = 'NEW_SPECIALIZATION' | 'EDIT_EXISTING' | 'NARROW_ACCESS'
export type AssistantAgentProfileRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ACTIVATED'
export type AssistantAgentEvalGateStatus = 'PASS' | 'BLOCKED' | 'NOT_REQUIRED'
export type AssistantAgentAuthorityLevel =
  | 'OBSERVE'
  | 'EXPLAIN'
  | 'DRAFT'
  | 'STAGE'
  | 'EXECUTE'
  | 'EXTERNAL_COMMIT'
export const ASSISTANT_ACTION_TYPES = [
  'create_trade',
  'amend_trade',
  'cancel_trade',
  'create_settlement_report_preset',
  'record_delivery_event',
  'reverse_delivery_event',
  'create_manual_accrual_entry',
  'reverse_accrual_entry',
  'issue_trade_confirmation',
  'record_trade_confirmation_response',
  'update_trade_workflow_item',
  'record_trade_actualization',
  'void_trade_actualization',
  'issue_trade_invoice',
  'void_trade_invoice',
  'create_trade_payment',
  'reverse_trade_payment',
  'create_accounting_entry',
  'reverse_accounting_entry',
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
export type AssistantActionReviewOutcome = 'APPROVED_AS_IS' | 'APPROVED_WITH_CORRECTIONS' | 'REJECTED'
export type AssistantControlTowerTrustSignalType =
  | 'MISSING_EVAL_COVERAGE'
  | 'POLICY_WARNING'
  | 'RUN_WARNING'
  | 'ACTION_BACKLOG'
  | 'FAILED_ACTIONS'
  | 'STALE_WORK_PACKAGE'
export type AssistantControlTowerTrustSignalSeverity = 'info' | 'warning' | 'danger'

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

export type AssistantAgentSkillDefinition = {
  name: AssistantAgentSkillKey
  label: string
  description: string
}

export type AssistantActionDefinition = {
  name: AssistantActionType
  label: string
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

export type AssistantAgentEvalGate = {
  status: AssistantAgentEvalGateStatus
  role_key?: string | null
  required_cases: string[]
  covered_cases: string[]
  missing_cases: string[]
  custom_case_count: number
  notes: string[]
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
  default_daily_token_allocation?: number
  providers: AssistantProviderStatus[]
  voice_transcription: AssistantVoiceTranscriptionSettings
  voice_generation: AssistantVoiceGenerationSettings
  available_skills: AssistantAgentSkillDefinition[]
  available_tools: AssistantToolDefinition[]
  available_action_types: AssistantActionDefinition[]
}

export type AssistantVoiceTranscriptionSettings = {
  enabled: boolean
  provider: AssistantProvider
  model: string
  max_upload_bytes: number
  requires_authentication: boolean
  supported_content_types: string[]
}

export type AssistantVoiceTranscription = {
  provider: AssistantProvider
  model: string
  text: string
}

export type AssistantVoiceGenerationSettings = {
  enabled: boolean
  provider: AssistantProvider
  model: string
  default_voice: string
  response_format: string
  max_input_chars: number
  requires_authentication: boolean
}

export type AssistantMessage = {
  role: AssistantMessageRole
  content: string
}

export type AssistantAgentOrchestrationPattern =
  | 'SINGLE'
  | 'MANAGER'
  | 'TRIAGE'
  | 'PARALLEL'
  | 'EVALUATOR'

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
  orchestration_pattern: AssistantAgentOrchestrationPattern
  parent_agent_id?: string | null
  managed_agent_ids: string[]
  delegation_guidance?: string | null
  profile_request_id?: number | null
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  skills: AssistantAgentSkillKey[]
  allowed_tools: string[]
  allowed_action_types: AssistantActionType[]
  daily_token_allocation?: number | null
  token_budget?: AssistantAgentTokenBudget
  effective_policy?: AssistantAgentEffectivePolicy
  eval_gate?: AssistantAgentEvalGate | null
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
  latest_revision_id?: number | null
  published_revision_id?: number | null
  published_at?: string | null
  published_by?: string | null
  has_unpublished_revision?: boolean
}

export type AssistantAgentRevisionPayload = {
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
  orchestration_pattern: AssistantAgentOrchestrationPattern
  parent_agent_id?: string | null
  managed_agent_ids: string[]
  delegation_guidance?: string | null
  profile_request_id?: number | null
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  skills: AssistantAgentSkillKey[]
  allowed_tools: string[]
  allowed_action_types: AssistantActionType[]
  daily_token_allocation?: number | null
  system_prompt: string
}

export type AssistantAgentRevisionDiff = {
  field_key: string
  label: string
  current_value: string
  next_value: string
}

export type AssistantAgentRevision = {
  revision_id: number
  agent_id: string
  version: number
  change_summary: string[]
  diff_summary: AssistantAgentRevisionDiff[]
  payload: AssistantAgentRevisionPayload
  created_at: string
  created_by: string
  published_at: string | null
  published_by: string | null
  restored_from_revision_id?: number | null
  is_published: boolean
}

export type AssistantAgentSelfUpdateEvidence = {
  recommendation_reasons: string[]
  recent_needs_work_feedback: string[]
  failing_eval_cases: string[]
  knowledge_base_titles: string[]
  stop_conditions: string[]
}

export type AssistantAgentSelfUpdateDraft = {
  revision_id: number
  revision_version: number
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
  orchestration_pattern: AssistantAgentOrchestrationPattern
  parent_agent_id?: string | null
  managed_agent_ids: string[]
  delegation_guidance?: string | null
  profile_request_id?: number | null
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  skills: AssistantAgentSkillKey[]
  allowed_tools: string[]
  allowed_action_types: AssistantActionType[]
  daily_token_allocation?: number | null
  system_prompt: string
  source_brief: string
  change_summary: string[]
  diff_summary: AssistantAgentRevisionDiff[]
  warnings: string[]
  builder_provider: AssistantProvider
  builder_model: string
  evidence: AssistantAgentSelfUpdateEvidence
  created_at: string
  created_by: string
  published_at: string | null
  published_by: string | null
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
  skills: AssistantAgentSkillKey[]
  default_tools: string[]
  maximum_action_types: AssistantActionType[]
  authority_ceiling: AssistantAgentAuthorityLevel
  approval_rules: string[]
  stop_conditions: string[]
  success_metrics: string[]
  required_eval_coverage: string[]
  eval_gate?: AssistantAgentEvalGate | null
  base_prompt_guidance: string[]
  recommended_orchestration_pattern: AssistantAgentOrchestrationPattern
  recommended_parent_role_keys: string[]
  recommended_managed_role_keys: string[]
  delegation_guidance: string[]
  current_profile_ids: string[]
}

export type AssistantAgentProfileRequest = {
  request_id: number
  status: AssistantAgentProfileRequestStatus
  request_kind: AssistantAgentProfileRequestKind
  target_agent_id: string | null
  requested_agent_id: string | null
  change_summary: string | null
  business_problem: string
  proposed_mission: string
  human_owner_role: string
  requested_workspaces: ViewKey[]
  work_objects: string[]
  requested_inputs_tools: string[]
  requested_action_types: AssistantActionType[]
  requested_skills: AssistantAgentSkillKey[]
  expected_outputs: string[]
  requested_authority_ceiling: AssistantAgentAuthorityLevel
  stop_conditions: string[]
  success_metrics: string[]
  proposed_eval_cases: string[]
  approval_notes: string | null
  rejection_reason: string | null
  linked_agent_id: string | null
  linked_revision_id: number | null
  applied_diff_summary: AssistantAgentRevisionDiff[]
  requested_at: string
  requested_by: string
  reviewed_at: string | null
  reviewed_by: string | null
  activated_at: string | null
  activated_by: string | null
  updated_at: string
}

export type AssistantAgentEvalRunStatus = 'PASS' | 'FAIL' | 'ERROR'

export type AssistantAgentEvalRun = {
  eval_run_id: number
  eval_id: number
  agent_id: string
  run_id?: number | null
  status: AssistantAgentEvalRunStatus
  failure_reasons: string[]
  observed_tool_names: string[]
  observed_action_types: AssistantActionType[]
  response_message?: string | null
  started_at: string
  completed_at: string
  run_by: string
}

export type AssistantAgentEval = {
  eval_id: number
  agent_id: string
  name: string
  workspace: ViewKey
  prompt: string
  context?: string | null
  use_live_tools: boolean
  expected_substrings: string[]
  expected_tool_names: string[]
  expected_action_types: AssistantActionType[]
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  latest_run?: AssistantAgentEvalRun | null
}

export type AssistantPromptRequest = {
  conversation_id?: number
  agent_id?: string
  provider?: AssistantProvider
  workspace?: ViewKey
  context?: string
  summary_targets?: AssistantWorkspaceSummaryTarget[]
  use_live_tools?: boolean
  messages: AssistantMessage[]
}

export type AssistantToolCall = {
  tool_name: string
  summary: string
  arguments: Record<string, unknown>
  record_count: number | null
  output_preview?: Record<string, unknown>
  evidence_items?: AssistantToolEvidence[]
}

export type AssistantToolEvidenceKind =
  | 'application'
  | 'route_group'
  | 'documentation'
  | 'schema'
  | 'table'
  | 'code_search_hit'
  | 'code_file'
  | 'agent'
  | 'agent_hierarchy'

export type AssistantToolEvidence = {
  kind: AssistantToolEvidenceKind
  title: string
  summary: string
  locator?: string | null
  excerpt?: string | null
  badges: string[]
  metadata: Record<string, unknown>
}

export type AssistantActionReviewObjectRef = {
  type: string
  id: string
  label?: string | null
}

export type AssistantActionReviewSupportingRecord = AssistantActionReviewObjectRef & {
  summary: string
}

export type AssistantActionPreviewFieldChange = {
  field: string
  current_value?: unknown
  proposed_value?: unknown
}

export type AssistantActionPreview = {
  preview_type: string
  status: string
  summary: string
  affected_records: AssistantActionReviewSupportingRecord[]
  field_changes: AssistantActionPreviewFieldChange[]
  expected_side_effects: string[]
  warnings: string[]
  blocking_reasons: string[]
  assumptions: string[]
  existing_invoice_count?: number | null
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
  action_preview?: AssistantActionPreview | null
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
  review_outcome?: AssistantActionReviewOutcome | null
  decision_note?: string | null
  correction_summary?: string | null
  correction_fields: string[]
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
  correction_count: number
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

export type AssistantPromptNavigationOutcomeStatus = 'ACCEPTED' | 'DISMISSED' | 'FAILED'
export type AssistantPromptNavigationSurface = 'PROMPT_HOME'
export type AssistantPromptNavigationFocusType =
  | 'trade'
  | 'workflow_item'
  | 'document'
  | 'invoice'
  | 'payment'
  | 'reference_record'
  | 'market_instrument'
  | 'report'
export type AssistantPromptNavigationSignal = 'OBSERVE' | 'CANDIDATE_FOR_RULE' | 'NARROW' | 'RETIRE'

export type AssistantOutcomeMetricThresholds = {
  min_decided_actions_for_promotion: number
  max_rejection_rate_for_promotion: number
  max_failed_execution_rate_for_promotion: number
  max_stale_action_rate_for_promotion: number
  max_correction_rate_for_promotion: number
  max_pending_actions_for_promotion: number
  min_decided_actions_for_pause_signal: number
  rejection_rate_pause_threshold: number
  failed_execution_rate_pause_threshold: number
  stale_action_rate_pause_threshold: number
  oldest_pending_hours_pause_threshold: number
  repeated_failed_actions_pause_threshold: number
  unsupported_attempt_pause_threshold: number
  policy_drift_pause_threshold: number
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
  correction_count: number
  decided_action_count: number
  stale_action_count: number
  unsupported_attempt_count: number
  policy_drift_count: number
  approval_rate?: number | null
  rejection_rate?: number | null
  failed_execution_rate?: number | null
  correction_rate?: number | null
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
  tool_error_count: number
  tool_error_rate?: number | null
  helpful_feedback_count: number
  needs_work_feedback_count: number
  feedback_helpful_rate?: number | null
  recommendation: AssistantOutcomeMetricRecommendation
}

export type AssistantRoleOutcomeMetricRow = AssistantOutcomeMetricCounters & {
  agent_role_key?: string | null
  run_count: number
  completed_run_count: number
  failed_run_count: number
  warning_count: number
  warning_rate?: number | null
  tool_call_count: number
  tool_error_count: number
  tool_error_rate?: number | null
  recommendation: AssistantOutcomeMetricRecommendation
}

export type AssistantProfileOutcomeMetricRow = AssistantOutcomeMetricCounters & {
  agent_profile_kind?: AssistantAgentProfileKind | null
  run_count: number
  completed_run_count: number
  failed_run_count: number
  warning_count: number
  warning_rate?: number | null
  tool_call_count: number
  tool_error_count: number
  tool_error_rate?: number | null
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

export type AssistantPromptNavigationSummary = {
  total_outcome_count: number
  accepted_count: number
  dismissed_count: number
  failed_count: number
  acceptance_rate?: number | null
  dismiss_rate?: number | null
  failure_rate?: number | null
}

export type AssistantPromptNavigationTargetMetricRow = {
  target_view?: ViewKey | null
  target_label?: string | null
  focus_type?: AssistantPromptNavigationFocusType | null
  outcome_count: number
  accepted_count: number
  dismissed_count: number
  failed_count: number
  acceptance_rate?: number | null
  dismiss_rate?: number | null
  failure_rate?: number | null
  signal: AssistantPromptNavigationSignal
  signal_reasons: string[]
  recent_prompt_examples: string[]
}

export type AssistantPromptNavigationOutcomeInsight = {
  outcome_id: number
  run_id?: number | null
  conversation_id?: number | null
  agent_id?: string | null
  agent_name?: string | null
  source_workspace?: ViewKey | null
  user_id: string
  user_role: string
  surface: AssistantPromptNavigationSurface
  outcome: AssistantPromptNavigationOutcomeStatus
  target_view?: ViewKey | null
  target_label?: string | null
  focus_type?: AssistantPromptNavigationFocusType | null
  focus_id?: string | null
  focus_label?: string | null
  detail?: string | null
  latest_user_message?: string | null
  created_at: string
  updated_at: string
}

export type AssistantPromptNavigationOutcome = {
  outcome_id: number
  run_id?: number | null
  conversation_id?: number | null
  user_id: string
  user_role: string
  surface: AssistantPromptNavigationSurface
  outcome: AssistantPromptNavigationOutcomeStatus
  intent_key: string
  target_view?: ViewKey | null
  target_label?: string | null
  target_rationale?: string | null
  focus_type?: AssistantPromptNavigationFocusType | null
  focus_id?: string | null
  focus_label?: string | null
  detail?: string | null
  created_at: string
  updated_at: string
}

export type AssistantPromptRouteRecommendation = {
  target_view: ViewKey
  target_label?: string | null
  target_rationale?: string | null
  focus_type?: AssistantPromptNavigationFocusType | null
  last_accepted_at?: string | null
  accepted_count: number
  outcome_count: number
  acceptance_rate?: number | null
  signal: AssistantPromptNavigationSignal
  signal_reasons: string[]
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
  by_role: AssistantRoleOutcomeMetricRow[]
  by_profile: AssistantProfileOutcomeMetricRow[]
  by_workspace: AssistantWorkspaceFeedbackMetricRow[]
  by_action_type: AssistantActionTypeOutcomeMetricRow[]
  recent_feedback: AssistantRunFeedbackInsight[]
  prompt_navigation_summary: AssistantPromptNavigationSummary
  by_prompt_target: AssistantPromptNavigationTargetMetricRow[]
  recent_prompt_navigation_outcomes: AssistantPromptNavigationOutcomeInsight[]
}

export type AssistantControlTowerAgentRosterSummary = {
  total_count: number
  active_count: number
  draft_count: number
  paused_count: number
  retired_count: number
  action_capable_count: number
  missing_eval_coverage_count: number
  policy_warning_count: number
}

export type AssistantControlTowerRunSummary = {
  total_count: number
  completed_count: number
  failed_count: number
  warning_count: number
  tool_call_count: number
  latest_run_at?: string | null
}

export type AssistantControlTowerOldestPendingAction = {
  action_request_id: number
  action_type: string
  summary: string
  agent_id?: string | null
  agent_name?: string | null
  user_id: string
  created_at: string
  age_seconds: number
}

export type AssistantControlTowerActionSummary = {
  total_count: number
  pending_count: number
  failed_count: number
  rejected_count: number
  executed_count: number
  preview_blocked_count: number
  oldest_pending_action?: AssistantControlTowerOldestPendingAction | null
}

export type AssistantControlTowerWorkPackageSummary = {
  total_count: number
  accepted_count: number
  in_progress_count: number
  implemented_count: number
  dismissed_count: number
  stale_count: number
  stale_accepted_count: number
  stale_in_progress_count: number
  implemented_with_pr_count: number
  implemented_with_commit_count: number
  implemented_with_eval_count: number
  implemented_with_tests_count: number
  implemented_with_docs_count: number
  implemented_missing_evidence_count: number
}

export type AssistantControlTowerAgentTrustSignal = {
  agent_id: string
  agent_name: string
  status: AssistantAgentStatus
  role_key?: string | null
  profile_kind?: AssistantAgentProfileKind | null
  signal_type: AssistantControlTowerTrustSignalType
  severity: AssistantControlTowerTrustSignalSeverity
  summary: string
  details: string[]
  pending_action_count: number
  failed_action_count: number
  warning_run_count: number
  eval_status?: AssistantAgentEvalGateStatus | null
}

export type AssistantControlTowerSummary = {
  generated_at: string
  created_after?: string | null
  created_before?: string | null
  roster: AssistantControlTowerAgentRosterSummary
  runs: AssistantControlTowerRunSummary
  actions: AssistantControlTowerActionSummary
  work_packages: AssistantControlTowerWorkPackageSummary
  trust_signals: AssistantControlTowerAgentTrustSignal[]
}

export type AssistantAutonomyReviewRecommendationAction =
  | 'KEEP_STAGED'
  | 'NARROW'
  | 'PAUSE'
  | 'ELIGIBLE_FOR_BOUNDED_REVIEW'

export type AssistantAutonomyReviewEvalStatus =
  | 'MISSING_EVAL_PLAN'
  | 'DECLARED'
  | 'ACTIONABLE'

export type AssistantAutonomyKnowledgeEntry = {
  title: string
  entry_type?: string | null
  domain?: string | null
  applies_to?: string | null
  status?: string | null
  lesson?: string | null
  deterministic_opportunity?: string | null
  agent_autonomy_impact?: string | null
}

export type AssistantAutonomyEvalSignal = {
  status: AssistantAutonomyReviewEvalStatus
  required_cases: string[]
  proposed_cases: string[]
  notes: string[]
}

export type AssistantAutonomyReviewBrief = {
  generated_at: string
  agent_id: string
  agent_name: string
  current_status: AssistantAgentStatus
  current_authority?: AssistantAgentAuthorityLevel | null
  recommended_next_authority: AssistantAutonomyReviewRecommendationAction
  recommendation_reasons: string[]
  human_owner_role?: string | null
  allowed_action_types: AssistantActionType[]
  outcome_window_created_after?: string | null
  outcome_window_created_before?: string | null
  outcome_metrics?: AssistantAgentOutcomeMetricRow | null
  action_type_metrics: AssistantActionTypeOutcomeMetricRow[]
  eval_signal: AssistantAutonomyEvalSignal
  stop_conditions: string[]
  knowledge_base_entries: AssistantAutonomyKnowledgeEntry[]
  deterministic_algorithm_candidates: string[]
  review_checklist: string[]
}

export type AssistantAgentHealthWorkPackageType =
  | 'POLICY'
  | 'SERVICE'
  | 'EVAL'
  | 'KNOWLEDGE_BASE'

export type AssistantAgentHealthWorkPackagePriority = 'P1' | 'P2' | 'P3' | 'P4'

export type AssistantAgentHealthWorkPackageStatus = 'CANDIDATE'

export type AssistantAgentWorkPackageStatus =
  | 'CANDIDATE'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'IMPLEMENTED'
  | 'DISMISSED'

export type AssistantAgentHealthReviewItem = {
  agent_id: string
  agent_name: string
  current_status: AssistantAgentStatus
  current_authority?: AssistantAgentAuthorityLevel | null
  recommended_next_authority: AssistantAutonomyReviewRecommendationAction
  recommendation_reasons: string[]
  eval_status: AssistantAutonomyReviewEvalStatus
  decided_action_count: number
  pending_action_count: number
  failed_action_count: number
  deterministic_candidate_count: number
  stop_condition_count: number
  work_package_ids: string[]
}

export type AssistantAgentHealthWorkPackage = {
  work_package_id: string
  title: string
  package_type: AssistantAgentHealthWorkPackageType
  priority: AssistantAgentHealthWorkPackagePriority
  status: AssistantAgentHealthWorkPackageStatus
  source_agent_ids: string[]
  source_agent_names: string[]
  source_recommendations: AssistantAutonomyReviewRecommendationAction[]
  source_candidates: string[]
  recommended_owner_role?: string | null
  rationale: string
  acceptance_checks: string[]
  knowledge_base_titles: string[]
}

export type AssistantAgentHealthReview = {
  generated_at: string
  outcome_window_created_after?: string | null
  outcome_window_created_before?: string | null
  agent_count: number
  pause_count: number
  narrow_count: number
  bounded_review_candidate_count: number
  keep_staged_count: number
  work_package_count: number
  review_items: AssistantAgentHealthReviewItem[]
  work_packages: AssistantAgentHealthWorkPackage[]
}

export type AssistantAgentWorkPackage = {
  id: number
  work_package_id: string
  title: string
  package_type: AssistantAgentHealthWorkPackageType
  priority: AssistantAgentHealthWorkPackagePriority
  status: AssistantAgentWorkPackageStatus
  source_agent_ids: string[]
  source_agent_names: string[]
  source_recommendations: AssistantAutonomyReviewRecommendationAction[]
  source_candidates: string[]
  recommended_owner_role?: string | null
  rationale: string
  acceptance_checks: string[]
  knowledge_base_titles: string[]
  implementation_evidence: {
    pr_url?: string | null
    commit_sha?: string | null
    eval_ids: number[]
    test_names: string[]
    doc_paths: string[]
    owner?: string | null
  }
  accepted_at?: string | null
  accepted_by?: string | null
  implemented_at?: string | null
  implemented_by?: string | null
  notes?: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
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
  summary_targets?: AssistantWorkspaceSummaryTarget[]
  use_live_tools?: boolean
}

export type AssistantWorkspaceSummaryTarget =
  | 'dashboard.attention.confirmation_backlog_count'
  | 'dashboard.attention.nomination_backlog_count'
  | 'dashboard.attention.allocation_backlog_count'
  | 'dashboard.attention.invoice_backlog_count'
  | 'dashboard.attention.overdue_payment_count'
  | 'dashboard.attention.stale_pricing_count'
  | 'dashboard.attention.incomplete_ops_data_count'
  | 'settlement.invoice_pending_count'
  | 'settlement.payment_due_count'
  | 'settlement.trade_exception_count'
  | 'trades.pending_settlement_count'

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
  contract_key?: string | null
  contract_version?: number
  key: string
  title: string
  source: AssistantPromptSectionSource
  scope?: 'SYSTEM' | 'GLOBAL' | 'USER' | 'AGENT' | 'REQUEST' | 'RUNTIME'
  kind?: 'IMMUTABLE' | 'GENERATED' | 'CONFIGURABLE'
  owner?: string
  owner_reference?: string | null
  freshness?: 'STATIC' | 'SESSION' | 'REQUEST' | 'LIVE'
  merge_strategy?: 'APPEND' | 'APPEND_IF_PRESENT'
  uses_fallback?: boolean
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
  | 'pretrade'
  | 'trades'
  | 'events'
  | 'risk'
  | 'positions'
  | 'shipments'
  | 'scheduling'
  | 'operations'
  | 'settlement'
  | 'messages'
  | 'reports'
  | 'library'
  | 'map'
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
  | 'rail-routes'
  | 'spatial-features'
  | 'assets'
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
  allowed_transport_modes: Array<Exclude<DeliveryRecord['transport_mode'], 'UNSPECIFIED'>>
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

export type RailRouteForm = {
  code: string
  name: string
  rail_line_code: string
  origin_location_code: string
  destination_location_code: string
  service_calendar_code: string
  route_direction: string
  schedule_timezone: string
  placement_cutoff_time_local: string
  release_cutoff_time_local: string
  placement_free_time_hours: string
  release_free_time_hours: string
  description: string
}

export type AssetForm = {
  code: string
  name: string
  asset_class: string
  asset_type: string
  asset_reality: string
  commodity_code: string
  location_code: string
  latitude: string
  longitude: string
  geometry_geojson: string
  capacity_value: string
  capacity_unit_code: string
  operator_name: string
  operating_status: string
  description: string
}

export type SpatialFeatureForm = {
  code: string
  name: string
  feature_kind: string
  entity_type: string
  entity_code: string
  label_latitude: string
  label_longitude: string
  is_primary: boolean
  geometry_geojson: string
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
