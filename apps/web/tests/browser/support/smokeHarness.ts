import assert from 'node:assert/strict'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import type { Page } from 'playwright/test'
import { createServer as createViteServer, type ViteDevServer } from 'vite'

import type {
  DeliveryTrackingSignalRecord,
  DeliveryTruckMovementRecord,
  DeliveryTruckMovementSummaryRecord,
  DeliveryTruckTrackingExceptionRecord,
  PreTradeGovernanceAuditExportRecord,
  PreTradeHedgeRecommendationRecord,
  PreTradeGovernanceItemsRecord,
  PreTradeGovernanceSummaryRecord,
  PreTradeNettingSetRecord,
  PreTradePromotionOutcomeSummaryRecord,
  PreTradeRecommendationDraftAnalysisRecord,
  PreTradeRecommendationEvidenceRefRecord,
  PreTradeRecommendationResultRecord,
  PreTradeRecommendationRunRecord,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeReviewActivityRecord,
  PreTradeReviewDriftRecord,
  PreTradeReviewItemRecord,
  PreTradeReviewRecommendationSummaryRecord,
  PreTradeReviewStatus,
  PreTradeMarketOpportunityRecord,
  PreTradeRiskScenarioRecord,
  PreTradeScenarioDraft,
  PreTradeScenarioEnrichmentRecord,
  PreTradeScenarioRecord,
  TradeWorkflowItemRecord,
} from '../../../src/shared/models'
import { buildFallbackTradeMetadata } from '../../../src/shared/tradeMetadata'
import {
  assets,
  assetStandards,
  adminRoadmapDocument,
  assistantActionRequests,
  assistantAdminAgents,
  assistantOutcomeMetrics,
  assistantPromptRouteRecommendations,
  assistantRoleArchetypes,
  assistantRuntimeSettings,
  books,
  buildWorkspaceSummary,
  commodities,
  counterparties,
  codexTasks,
  codexTaskSettings,
  currencies,
  invoiceIssueCandidates,
  locations,
  portfolios,
  positions,
  priceIndices,
  projectionMonitoringAdminRecord,
  publicRuntimeSettings,
  spatialFeatures,
  spatialFeatureStandards,
  smokeDeliveries,
  smokeTruckMovements,
  smokeTruckMovementSummaries,
  smokeTruckTrackingSignals,
  type RecordedRequest,
  selectedTradeEvents,
  smokeAccessToken,
  smokeSession,
  tradeAttentionCandidates,
  trades,
  userAccounts,
  units,
  weatherForecastPeriodsByCode,
  weatherLocations,
  weatherObservationsByCode,
  weatherSyncStatus,
  wikiPages,
} from './smokeFixtures'

type SmokeTradeRow = (typeof trades)[number]
type SmokeEventRow = (typeof selectedTradeEvents)[number]
type SmokeAssistantActionPreview = {
  preview_type: string
  status: string
  summary: string
  affected_records: Record<string, unknown>[]
  field_changes: Record<string, unknown>[]
  expected_side_effects: string[]
  warnings: string[]
  blocking_reasons: string[]
  assumptions: string[]
  metadata?: unknown
}
type SmokeAssistantReviewContext = {
  owning_work_object: Record<string, unknown>
  required_reviewer_role: string
  business_rationale: string
  proposed_mutation: Record<string, unknown>
  supporting_records: Record<string, unknown>[]
  assumptions: string[]
  missing_evidence: string[]
  expected_downstream_effects: string[]
  stale_state_basis: Record<string, unknown>
  idempotency_key?: string
  action_preview?: SmokeAssistantActionPreview | null
}
type SmokeAssistantActionLifecycle = {
  stage: string
  label: string
  tone: string
  is_terminal: boolean
  can_approve: boolean
  can_reject: boolean
  reviewer_action_label: string | null
  decided_label: string | null
  review_risk_flags: string[]
}
type SmokeAssistantActionRequestRow = {
  action_request_id: number
  run_id: number
  user_id: string
  status: string
  workspace: string | null
  agent_id: string | null
  agent_name: string | null
  action_type: string
  summary: string
  description: string
  payload: Record<string, unknown>
  review_context: SmokeAssistantReviewContext
  lifecycle: SmokeAssistantActionLifecycle
  result: Record<string, unknown> | null
  error_detail: string | null
  review_outcome: string | null
  decision_note: string | null
  correction_summary: string | null
  correction_fields: string[]
  created_at: string
  decided_at: string | null
  decided_by: string | null
}
type SmokeHomeViewCardRow = {
  card_id: string
  kind: string
  label: string
  visible: boolean
  placement: {
    order: number
    column_span: number
    row_span: number
    collapsed_column_span: number
    collapsed_row_span: number
    expanded_column_span: number
    expanded_row_span: number
  }
  parameters: Record<string, unknown>
  filters: Record<string, unknown>
  data_bindings: string[]
}
type SmokeHomeViewDefinitionRow = {
  definition_id: number
  definition_key: string
  name: string
  scope: string
  scope_owner_key: string
  base_template_key: string
  base_template_version: number
  persona_hint: string | null
  cards: SmokeHomeViewCardRow[]
  global_filters: Record<string, unknown>
  status: string
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
  can_duplicate: boolean
  can_publish: boolean
  can_retire: boolean
  can_restore: boolean
  is_shared: boolean
  validation_warnings: string[]
}
type SmokeAssistantProfileRequestKind = 'NEW_SPECIALIZATION' | 'EDIT_EXISTING' | 'NARROW_ACCESS'
type SmokeAssistantProfileRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ACTIVATED'
type SmokeAssistantProfileRequestDiffRow = {
  field_key: string
  label: string
  current_value: string
  next_value: string
}
type SmokeAssistantProfileRequestRow = {
  request_id: number
  status: SmokeAssistantProfileRequestStatus
  request_kind: SmokeAssistantProfileRequestKind
  target_agent_id: string | null
  requested_agent_id: string | null
  change_summary: string | null
  business_problem: string
  proposed_mission: string
  human_owner_role: string
  requested_workspaces: string[]
  work_objects: string[]
  requested_inputs_tools: string[]
  requested_action_types: string[]
  requested_skills: string[]
  expected_outputs: string[]
  requested_authority_ceiling: string
  stop_conditions: string[]
  success_metrics: string[]
  proposed_eval_cases: string[]
  approval_notes: string | null
  rejection_reason: string | null
  linked_agent_id: string | null
  linked_revision_id: number | null
  applied_diff_summary: SmokeAssistantProfileRequestDiffRow[]
  requested_at: string
  requested_by: string
  reviewed_at: string | null
  reviewed_by: string | null
  activated_at: string | null
  activated_by: string | null
  updated_at: string
}
type SmokeAssistantFeedbackRating = 'HELPFUL' | 'NEEDS_WORK'
type SmokeAssistantFeedbackRow = {
  feedback_id: number
  run_id: number
  conversation_id: number
  user_id: string
  user_role: string
  rating: SmokeAssistantFeedbackRating
  comment: string | null
  created_at: string
  updated_at: string
}
type SmokeAssistantPromptNavigationOutcomeStatus = 'ACCEPTED' | 'DISMISSED' | 'FAILED'
type SmokeAssistantPromptNavigationOutcomeRow = {
  outcome_id: number
  run_id: number | null
  conversation_id: number | null
  user_id: string
  user_role: string
  surface: 'PROMPT_HOME'
  outcome: SmokeAssistantPromptNavigationOutcomeStatus
  intent_key: string
  target_view: string | null
  target_label: string | null
  target_rationale: string | null
  focus_type: string | null
  focus_id: string | null
  focus_label: string | null
  detail: string | null
  created_at: string
  updated_at: string
}

type MockApiServer = {
  baseUrl: string
  expireSession: () => void
  mutationRequests: RecordedRequest[]
  operationWorkItemRequests: TradeWorkflowItemRecord[]
  promptNavigationOutcomeRequests: RecordedRequest[]
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
  operationWorkItemRequests: TradeWorkflowItemRecord[]
  promptNavigationOutcomeRequests: RecordedRequest[]
  unexpectedRequests: RecordedRequest[]
  close: () => Promise<void>
}

const MAX_WIKI_RECENT_REVISIONS = 12

const webRoot = fileURLToPath(new URL('../../..', import.meta.url))

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildTradeCreatedEventRow(args: {
  eventId: string
  tradeId: string
  occurredAt: string
  actorId: string | null
  schemaVersion: number
  payload: Record<string, unknown>
}): SmokeEventRow {
  const { eventId, tradeId, occurredAt, actorId, schemaVersion, payload } = args

  return {
    event_id: eventId,
    aggregate_type: 'trade',
    aggregate_id: tradeId,
    event_type: 'TradeCreated',
    occurred_at: occurredAt,
    recorded_at: occurredAt,
    actor_id: actorId,
    correlation_id: null,
    causation_id: null,
    schema_version: schemaVersion,
    payload,
  }
}

function buildCreatedTradeRow(args: {
  tradeId: string
  occurredAt: string
  eventId: string
  payload: Record<string, unknown>
}): SmokeTradeRow {
  const { tradeId, occurredAt, eventId, payload } = args
  const tradeNature = normalizeOptionalText(payload.trade_nature) ?? 'PHYSICAL'
  const requiresPhysicalWorkflow = tradeNature === 'PHYSICAL'
  const tradeStructure = normalizeOptionalText(payload.trade_structure) ?? 'SINGLE'

  return {
    trade_id: tradeId,
    originating_option_trade_id: null,
    external_trade_id: normalizeOptionalText(payload.external_trade_id),
    source_system: normalizeOptionalText(payload.source_system),
    created_at: occurredAt,
    updated_at: occurredAt,
    execution_timestamp: normalizeOptionalText(payload.execution_timestamp) ?? occurredAt,
    trade_date: normalizeOptionalText(payload.trade_date) ?? occurredAt.slice(0, 10),
    effective_start_date: normalizeOptionalText(payload.effective_start_date),
    effective_end_date: normalizeOptionalText(payload.effective_end_date),
    quality_spec: normalizeOptionalText(payload.quality_spec),
    unit_of_measure: normalizeOptionalText(payload.unit_of_measure),
    trade_currency_code: normalizeOptionalText(payload.trade_currency_code),
    location_code: normalizeOptionalText(payload.location_code),
    delivery_start: normalizeOptionalText(payload.delivery_start),
    delivery_end: normalizeOptionalText(payload.delivery_end),
    price_unit_code: normalizeOptionalText(payload.price_unit_code),
    instrument_type: normalizeOptionalText(payload.instrument_type) ?? 'LINEAR',
    option_type: normalizeOptionalText(payload.option_type),
    option_style: normalizeOptionalText(payload.option_style),
    option_strike_price: normalizeOptionalNumber(payload.option_strike_price),
    option_expiration_date: normalizeOptionalText(payload.option_expiration_date),
    trade_nature: tradeNature,
    trade_structure: tradeStructure,
    trade_side:
      tradeStructure === 'SWAP'
        ? null
        : normalizeOptionalText(payload.trade_side) ?? 'BUY',
    book: normalizeOptionalText(payload.book) ?? 'GULF_GAS',
    portfolio: normalizeOptionalText(payload.portfolio),
    counterparty: normalizeOptionalText(payload.counterparty),
    commodity_class: normalizeOptionalText(payload.commodity_class) ?? 'NATURAL_GAS',
    commodity: normalizeOptionalText(payload.commodity) ?? 'HENRY_HUB_GAS',
    pricing_type: normalizeOptionalText(payload.pricing_type) ?? 'FIXED',
    pricing_status: normalizeOptionalText(payload.pricing_status) ?? 'PENDING',
    confirmation_status: normalizeOptionalText(payload.confirmation_status) ?? 'PENDING',
    nomination_status:
      normalizeOptionalText(payload.nomination_status) ??
      (requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED'),
    allocation_status:
      normalizeOptionalText(payload.allocation_status) ??
      (requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED'),
    actualization_status: requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED',
    price_index_code: normalizeOptionalText(payload.price_index_code),
    price: normalizeOptionalNumber(payload.price),
    volume: normalizeOptionalNumber(payload.volume),
    invoice_status:
      normalizeOptionalText(payload.invoice_status) ??
      (requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED'),
    payment_status: normalizeOptionalText(payload.payment_status) ?? 'PENDING',
    settlement_status: normalizeOptionalText(payload.settlement_status) ?? 'PENDING',
    trader_user: normalizeOptionalText(payload.trader_user),
    status: 'ACTIVE',
    last_event_id: eventId,
    active_credit_exception: null,
    credit_approval_status: 'APPROVED',
    credit_hold_active: false,
    credit_hold_reason: null,
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizePreTradeScenarioDraft(value: unknown): PreTradeScenarioDraft {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

  return {
    book: normalizeOptionalText(source.book) ?? 'GULF_GAS',
    portfolio: normalizeOptionalText(source.portfolio) ?? 'GULF_PROMPT',
    counterparty: normalizeOptionalText(source.counterparty) ?? 'ALPHA_MKT',
    commodity_class: normalizeOptionalText(source.commodity_class) ?? 'NATURAL_GAS',
    commodity: normalizeOptionalText(source.commodity) ?? 'HENRY_HUB_GAS',
    trade_side: normalizeOptionalText(source.trade_side) === 'SELL' ? 'SELL' : 'BUY',
    pricing_type: normalizeOptionalText(source.pricing_type) ?? 'FIXED',
    price_index_code: normalizeOptionalText(source.price_index_code),
    target_price: normalizeOptionalNumber(source.target_price),
    target_volume: normalizeOptionalNumber(source.target_volume),
    trade_currency_code: normalizeOptionalText(source.trade_currency_code) ?? 'USD',
    unit_of_measure: normalizeOptionalText(source.unit_of_measure) ?? 'MMBTU',
    price_unit_code: normalizeOptionalText(source.price_unit_code) ?? 'USD/MMBTU',
    location_code: normalizeOptionalText(source.location_code) ?? 'HENRY_HUB',
    delivery_start: normalizeOptionalText(source.delivery_start),
    delivery_end: normalizeOptionalText(source.delivery_end),
  }
}

function buildPreTradeEvidenceRef(
  snapshot: PreTradeRecommendationSourceSnapshotRecord,
): PreTradeRecommendationEvidenceRefRecord {
  return {
    source_key: snapshot.source_key,
    adapter_key: snapshot.adapter_key,
    adapter_label: snapshot.adapter_label,
    source_type: snapshot.source_type,
    freshness: snapshot.freshness,
    quality_status: snapshot.quality_status,
    record_id: snapshot.provenance.record_id,
    summary: snapshot.summary,
  }
}

function buildSmokePreTradeInputSnapshots(
  draft: PreTradeScenarioDraft,
): PreTradeRecommendationSourceSnapshotRecord[] {
  return [
    {
      source_key: 'desk-context',
      adapter_key: 'desk-context',
      adapter_label: 'Desk Context',
      source_type: 'INTERNAL',
      source_available: true,
      captured_at: '2026-04-11T00:05:00Z',
      freshness: 'FRESH',
      quality_status: 'OK',
      quality_score: 96,
      summary: 'Desk context shows one existing long Henry Hub prompt position.',
      provenance: {
        provider: null,
        dataset: 'positions',
        record_id: draft.commodity,
        observed_at: '2026-04-11T00:00:00Z',
        ingested_at: '2026-04-11T00:05:00Z',
        captured_by: 'smoke-harness',
      },
      payload: {
        current_net_position: 25000,
        related_active_trade_count: 1,
      },
    },
    {
      source_key: 'latest-mark',
      adapter_key: 'latest-mark',
      adapter_label: 'Latest Mark',
      source_type: 'EXTERNAL',
      source_available: true,
      captured_at: '2026-04-11T00:05:00Z',
      freshness: 'STALE',
      quality_status: 'STALE',
      quality_score: 62,
      summary: 'Henry Hub IFERC mark is one day stale in the smoke fixture.',
      provenance: {
        provider: 'ICE',
        dataset: 'price-index-observations',
        record_id: 'HH_IFERC',
        observed_at: '2026-04-10T20:00:00Z',
        ingested_at: '2026-04-11T00:05:00Z',
        captured_by: 'smoke-harness',
      },
      payload: {
        latest_mark: 3.21,
      },
    },
    {
      source_key: 'weather-intelligence',
      adapter_key: 'weather-intelligence',
      adapter_label: 'Weather Intelligence',
      source_type: 'EXTERNAL',
      source_available: true,
      captured_at: '2026-04-11T00:05:00Z',
      freshness: 'FRESH',
      quality_status: 'OK',
      quality_score: 90,
      summary: 'Weather risk is muted in the current smoke scenario.',
      provenance: {
        provider: 'NWS',
        dataset: 'weather-intelligence',
        record_id: draft.commodity_class,
        observed_at: '2026-04-11T00:00:00Z',
        ingested_at: '2026-04-11T00:05:00Z',
        captured_by: 'smoke-harness',
      },
      payload: {
        headline: 'Weather risk is muted in the current smoke scenario.',
      },
    },
  ]
}

function sourceFreshnessSummary(snapshots: PreTradeRecommendationSourceSnapshotRecord[]): string {
  const impaired = snapshots.filter((snapshot) => snapshot.quality_status !== 'OK' || snapshot.freshness !== 'FRESH')
  if (impaired.length === 0) {
    return `${snapshots.length} source snapshots are fresh.`
  }
  return `${impaired.length} of ${snapshots.length} source snapshots need review: ${impaired.map((snapshot) => snapshot.adapter_label ?? snapshot.source_key).join(', ')}.`
}

function buildSmokePreTradeRecommendation(
  draft: PreTradeScenarioDraft,
  snapshots: PreTradeRecommendationSourceSnapshotRecord[],
): PreTradeRecommendationResultRecord {
  const targetVolume = draft.target_volume ?? 12500
  const proposedTradeDelta = draft.trade_side === 'SELL' ? -targetVolume : targetVolume
  const currentNetPosition = 25000
  const residualAfterTrade = currentNetPosition + proposedTradeDelta
  const offsetsExposure = Math.abs(residualAfterTrade) < Math.abs(currentNetPosition)
  const sourceRefs = snapshots.map(buildPreTradeEvidenceRef)

  return {
    stance: 'PROCEED_WITH_CARE',
    headline: 'Proceed with smoke-offset review.',
    summary: 'The draft reduces the seeded Henry Hub long while keeping stale mark evidence visible before capture.',
    confidence: 'MEDIUM',
    score: 78,
    estimated_notional: draft.target_price && draft.target_volume ? draft.target_price * draft.target_volume : null,
    projected_credit_utilization_pct: 22,
    current_net_position: currentNetPosition,
    related_active_trade_count: 1,
    latest_mark: 3.21,
    mark_gap_pct: draft.target_price ? Number((((draft.target_price - 3.21) / 3.21) * 100).toFixed(2)) : null,
    explanation: {
      stance_rationale:
        'Proceed with care because the scenario offsets the existing prompt long, but the latest mark must be acknowledged before booking.',
      source_quality_rationale: sourceFreshnessSummary(snapshots),
      confidence_rationale: 'Confidence is medium because the source package has one stale external mark.',
      primary_drivers: [
        offsetsExposure
          ? 'The proposed trade offsets existing prompt exposure.'
          : 'The proposed trade deepens existing prompt exposure.',
        'The latest mark is stale and remains visible before handoff.',
      ],
      reviewer_focus: [
        'Confirm the stale Henry Hub IFERC mark still supports the target price.',
        'Confirm final counterparty terms before Trade Capture.',
      ],
    },
    checks: [
      {
        key: 'source-freshness',
        label: 'Source Freshness',
        status: 'watch',
        detail: 'One source snapshot is stale and should be acknowledged by the reviewer.',
        score_impact: -12,
      },
      {
        key: 'residual-exposure',
        label: 'Residual Exposure',
        status: offsetsExposure ? 'good' : 'watch',
        detail: offsetsExposure
          ? 'The draft reduces the current long position.'
          : 'The draft increases the current long position.',
        score_impact: offsetsExposure ? 8 : -8,
      },
    ],
    next_actions: ['Submit the scenario to the shared pre-trade review queue.'],
    opportunity_summary: {
      title: 'Henry Hub prompt offset',
      category: offsetsExposure ? 'RISK_REDUCTION' : 'RISK_INCREASE',
      detail: offsetsExposure
        ? 'The draft reduces the seeded prompt long without flipping the book short.'
        : 'The draft increases prompt exposure and needs desk review.',
      driver_keys: ['residual-exposure', 'source-freshness'],
      source_refs: sourceRefs,
    },
    arbitrage_candidate: null,
    residual_exposure: {
      current_net_position: currentNetPosition,
      proposed_trade_delta: proposedTradeDelta,
      residual_after_trade: residualAfterTrade,
      direction_before: 'LONG',
      direction_after: residualAfterTrade > 0 ? 'LONG' : residualAfterTrade < 0 ? 'SHORT' : 'FLAT',
      exposure_effect: offsetsExposure ? 'OFFSETS' : 'DEEPENS',
      detail: offsetsExposure
        ? 'Residual exposure is lower after the proposed trade.'
        : 'Residual exposure is higher after the proposed trade.',
      source_refs: sourceRefs,
    },
    netting_candidates: [],
    hedge_recommendation: {
      instrument_type: 'PHYSICAL_OFFSET',
      rationale: 'A physical offset is enough for this smoke scenario; no hedge execution is authorized.',
      target_delta: proposedTradeDelta,
      hedge_ratio: 1,
      policy_stops: ['Human review and Trade Capture are still required before booking.'],
      source_refs: sourceRefs,
    },
    rejected_alternatives: [
      {
        alternative: 'FUTURES',
        reason: 'A financial hedge is unnecessary for this simple physical offset smoke fixture.',
        source_refs: sourceRefs,
      },
    ],
    missing_evidence: [
      {
        evidence_key: 'latest-mark',
        label: 'Latest Mark',
        severity: 'WARNING',
        detail: 'Latest Henry Hub IFERC mark is stale in the smoke fixture.',
        source_refs: [sourceRefs[1]],
      },
    ],
  }
}

function buildSmokePreTradeDraftAnalysis(args: {
  thesis: string | null
  draft: PreTradeScenarioDraft
  sourceScenarioId: number | null
  sourceReviewId: number | null
  inputSnapshots?: PreTradeRecommendationSourceSnapshotRecord[]
}): PreTradeRecommendationDraftAnalysisRecord {
  const inputSnapshots = args.inputSnapshots?.length ? args.inputSnapshots : buildSmokePreTradeInputSnapshots(args.draft)

  return {
    thesis: args.thesis,
    draft: cloneJson(args.draft),
    source_scenario_id: args.sourceScenarioId,
    source_review_id: args.sourceReviewId,
    input_snapshots: cloneJson(inputSnapshots),
    recommendation: buildSmokePreTradeRecommendation(args.draft, inputSnapshots),
    comparison: null,
    evaluated_at: '2026-04-11T00:05:00Z',
  }
}

function buildPreTradeScenarioEnrichmentFromRun(
  run: PreTradeRecommendationRunRecord,
): PreTradeScenarioEnrichmentRecord {
  return {
    opportunity_category: run.recommendation.opportunity_summary?.category ?? null,
    hedge_intent: run.recommendation.hedge_recommendation?.instrument_type ?? null,
    residual_exposure_summary: run.recommendation.residual_exposure?.detail ?? null,
    source_freshness_summary: sourceFreshnessSummary(run.input_snapshots),
    reviewer_focus: [
      ...run.recommendation.explanation.reviewer_focus,
      ...run.recommendation.missing_evidence.map((item) => item.detail),
    ].slice(0, 5),
    recommendation_run_id: run.run_id,
    recommendation_run_key: run.run_key,
    recommendation_stance: run.recommendation.stance,
    recommendation_score: run.recommendation.score,
    recommendation_headline: run.recommendation.headline,
    captured_at: run.created_at,
  }
}

function buildPreTradeReviewRecommendationSummary(
  run: PreTradeRecommendationRunRecord | null,
): PreTradeReviewRecommendationSummaryRecord | null {
  if (!run) {
    return null
  }

  return {
    run_id: run.run_id,
    run_key: run.run_key,
    name: run.name,
    stance: run.recommendation.stance,
    headline: run.recommendation.headline,
    confidence: run.recommendation.confidence,
    score: run.recommendation.score,
    explanation: cloneJson(run.recommendation.explanation),
    source_scenario_id: run.source_scenario_id,
    source_review_id: run.source_review_id,
    input_snapshot_count: run.input_snapshots.length,
    created_at: run.created_at,
    created_by: run.created_by,
  }
}

function impairedPreTradeSnapshots(
  snapshots: PreTradeRecommendationSourceSnapshotRecord[],
): PreTradeRecommendationSourceSnapshotRecord[] {
  return snapshots.filter(
    (snapshot) => !snapshot.source_available || snapshot.quality_status !== 'OK' || snapshot.freshness !== 'FRESH',
  )
}

function buildPreTradeGovernanceSummary(
  reviews: PreTradeReviewItemRecord[],
  runs: PreTradeRecommendationRunRecord[],
): PreTradeGovernanceSummaryRecord {
  const riskyReviews = reviews.filter((review) =>
    review.recommendation_summary?.stance === 'ESCALATE' || review.recommendation_summary?.stance === 'WAIT_FOR_DATA',
  )

  return {
    generated_at: '2026-04-11T00:10:00Z',
    risk_status: riskyReviews.length > 0 || runs.some((run) => impairedPreTradeSnapshots(run.input_snapshots).length > 0)
      ? 'WATCH'
      : 'CLEAR',
    open_review_count: reviews.filter((review) => review.review_status === 'OPEN').length,
    in_review_count: reviews.filter((review) => review.review_status === 'IN_REVIEW').length,
    approved_review_count: reviews.filter((review) => review.review_status === 'APPROVED').length,
    rejected_review_count: reviews.filter((review) => review.review_status === 'REJECTED').length,
    pending_review_count: reviews.filter((review) => review.review_status === 'OPEN' || review.review_status === 'IN_REVIEW').length,
    booked_review_count: reviews.filter((review) => review.linked_trade_id !== null).length,
    risky_recommendation_count: riskyReviews.length,
    unresolved_risky_recommendation_count: riskyReviews.filter((review) => review.review_status !== 'APPROVED').length,
    override_count: reviews.filter((review) => review.recommendation_override_reason !== null).length,
    booked_with_override_count: reviews.filter((review) => review.linked_trade_id !== null && review.recommendation_override_reason !== null).length,
    stale_evidence_run_count: runs.filter((run) => impairedPreTradeSnapshots(run.input_snapshots).length > 0).length,
    stale_evidence_source_count: runs.reduce((count, run) => count + impairedPreTradeSnapshots(run.input_snapshots).length, 0),
    recommendation_run_count: runs.length,
    promotion_candidate_count: 0,
    top_promotion_candidate_type: null,
  }
}

function buildPreTradeGovernanceItems(
  reviews: PreTradeReviewItemRecord[],
  runs: PreTradeRecommendationRunRecord[],
): PreTradeGovernanceItemsRecord {
  const riskyReviews = reviews.filter((review) =>
    review.recommendation_summary?.stance === 'ESCALATE' || review.recommendation_summary?.stance === 'WAIT_FOR_DATA',
  )

  return {
    generated_at: '2026-04-11T00:10:00Z',
    pending_reviews: reviews.filter((review) => review.review_status === 'OPEN' || review.review_status === 'IN_REVIEW').map(cloneJson),
    risky_recommendation_reviews: riskyReviews.map(cloneJson),
    unresolved_risky_recommendation_reviews: riskyReviews.filter((review) => review.review_status !== 'APPROVED').map(cloneJson),
    override_reviews: reviews.filter((review) => review.recommendation_override_reason !== null).map(cloneJson),
    booked_with_override_reviews: reviews.filter((review) => review.linked_trade_id !== null && review.recommendation_override_reason !== null).map(cloneJson),
    stale_evidence_runs: runs
      .map((run) => ({
        run: cloneJson(run),
        impaired_snapshots: impairedPreTradeSnapshots(run.input_snapshots).map(cloneJson),
      }))
      .filter((item) => item.impaired_snapshots.length > 0),
    promotion_candidates: [],
  }
}

function buildPreTradeGovernanceExport(
  reviews: PreTradeReviewItemRecord[],
  runs: PreTradeRecommendationRunRecord[],
): PreTradeGovernanceAuditExportRecord {
  const summary = buildPreTradeGovernanceSummary(reviews, runs)
  const items = buildPreTradeGovernanceItems(reviews, runs)

  return {
    generated_at: summary.generated_at,
    exported_by: smokeSession.user.user_id,
    format_version: 'smoke-v1',
    summary,
    items,
    audit_rows: [],
  }
}

function buildPreTradePromotionOutcomeSummary(): PreTradePromotionOutcomeSummaryRecord {
  return {
    generated_at: '2026-04-11T00:10:00Z',
    total_draft_count: 0,
    metrics: [
      { outcome: 'CREATED', count: 0 },
      { outcome: 'REUSED', count: 0 },
      { outcome: 'RETIRED', count: 0 },
      { outcome: 'REJECTED', count: 0 },
      { outcome: 'MERGED_INTO_BOOKED_TRADE', count: 0 },
      { outcome: 'BLOCKED_BY_MISSING_EVIDENCE', count: 0 },
    ],
    by_draft_type: [
      {
        draft_type: 'NETTING_SET',
        label: 'Netting Set',
        total_count: 0,
        created_count: 0,
        reused_count: 0,
        retired_count: 0,
        rejected_count: 0,
        merged_into_booked_trade_count: 0,
        blocked_by_missing_evidence_count: 0,
      },
      {
        draft_type: 'HEDGE_RECOMMENDATION',
        label: 'Hedge Recommendation',
        total_count: 0,
        created_count: 0,
        reused_count: 0,
        retired_count: 0,
        rejected_count: 0,
        merged_into_booked_trade_count: 0,
        blocked_by_missing_evidence_count: 0,
      },
      {
        draft_type: 'RISK_SCENARIO',
        label: 'Risk Scenario',
        total_count: 0,
        created_count: 0,
        reused_count: 0,
        retired_count: 0,
        rejected_count: 0,
        merged_into_booked_trade_count: 0,
        blocked_by_missing_evidence_count: 0,
      },
      {
        draft_type: 'MARKET_OPPORTUNITY',
        label: 'Market Opportunity',
        total_count: 0,
        created_count: 0,
        reused_count: 0,
        retired_count: 0,
        rejected_count: 0,
        merged_into_booked_trade_count: 0,
        blocked_by_missing_evidence_count: 0,
      },
    ],
    drafts: [],
  }
}

function buildPreTradeReviewDrift(review: PreTradeReviewItemRecord): PreTradeReviewDriftRecord {
  return {
    review_id: review.review_id,
    checked_at: '2026-04-11T00:12:00Z',
    review_status: review.review_status,
    alignment_status: review.review_status === 'APPROVED' ? 'ALIGNED' : 'NOT_APPROVED',
    requires_reapproval: false,
    approval_snapshot_generated_at: review.approval_governance_snapshot?.generated_at ?? null,
    approval_snapshot_exported_by: review.approval_governance_snapshot?.exported_by ?? null,
    approved_by: review.review_status === 'APPROVED' ? review.updated_by : null,
    approved_at: review.review_status === 'APPROVED' ? review.updated_at : null,
    approved_recommendation_run_id: review.recommendation_run_id,
    approved_recommendation_stance: review.recommendation_summary?.stance ?? null,
    approved_recommendation_score: review.recommendation_summary?.score ?? null,
    current_recommendation_run_id: review.recommendation_run_id,
    current_recommendation_stance: review.recommendation_summary?.stance ?? null,
    current_recommendation_score: review.recommendation_summary?.score ?? null,
    latest_recommendation_run_id: review.recommendation_run_id,
    latest_recommendation_stance: review.recommendation_summary?.stance ?? null,
    latest_recommendation_score: review.recommendation_summary?.score ?? null,
    current_impaired_sources: [],
    reasons: [],
  }
}

function buildTradeWorkflowItemFromPayload(args: {
  itemId: number
  payload: Record<string, unknown>
  tradeRows: SmokeTradeRow[]
}): TradeWorkflowItemRecord {
  const tradeId = normalizeOptionalText(args.payload.trade_id) ?? 'UNKNOWN'
  const trade = args.tradeRows.find((row) => row.trade_id === tradeId) ?? null
  const now = '2026-04-11T00:15:00Z'

  return {
    item_id: args.itemId,
    trade_id: tradeId,
    linked_trade_id: tradeId,
    linked_trade_status: trade?.status ?? 'ACTIVE',
    queue: 'operations',
    workflow_type: 'CONFIRMATION',
    status: normalizeOptionalText(args.payload.status) ?? 'PENDING',
    owner: normalizeOptionalText(args.payload.owner),
    due_at: normalizeOptionalText(args.payload.due_at),
    notes: normalizeOptionalText(args.payload.notes),
    created_at: now,
    created_by: smokeSession.user.user_id,
    updated_at: now,
    updated_by: smokeSession.user.user_id,
    version: 1,
    is_closed: false,
    is_overdue: false,
    age_days: 0,
    trade_nature: trade?.trade_nature ?? 'PHYSICAL',
    book: trade?.book ?? 'GULF_GAS',
    portfolio: trade?.portfolio ?? null,
    counterparty: trade?.counterparty ?? null,
    commodity_class: trade?.commodity_class ?? 'NATURAL_GAS',
    commodity: trade?.commodity ?? 'HENRY_HUB_GAS',
    trader_user: trade?.trader_user ?? null,
    trade_date: trade?.trade_date ?? null,
    delivery_start: trade?.delivery_start ?? null,
    delivery_end: trade?.delivery_end ?? null,
    action_states: [],
    credit_approval_freshness: null,
    active_credit_exception: null,
    credit_decision_history: [],
    credit_approval_status: trade?.credit_approval_status ?? 'APPROVED',
    credit_hold_active: trade?.credit_hold_active ?? false,
    credit_hold_reason: trade?.credit_hold_reason ?? null,
  }
}

function cloneWikiPage(page: SmokeWikiPageRow): SmokeWikiPageRow {
  return {
    ...page,
  }
}

function cloneWikiPageRevision(revision: SmokeWikiPageRevisionRow): SmokeWikiPageRevisionRow {
  return {
    ...revision,
    change_summary: [...revision.change_summary],
  }
}

function plainTextFromWikiMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\[\[([^[\]|]+)\|([^[\]]+)\]\]/g, '$1')
    .replace(/\[\[([^[\]]+)\]\]/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wikiLinkSnippet(markdown: string, matchIndex: number, matchLength: number, label: string, target: string): string {
  const lineStart = markdown.lastIndexOf('\n', matchIndex - 1) + 1
  const lineEndIndex = markdown.indexOf('\n', matchIndex + matchLength)
  const lineEnd = lineEndIndex >= 0 ? lineEndIndex : markdown.length
  const context = plainTextFromWikiMarkdown(markdown.slice(lineStart, lineEnd))

  if (!context) {
    return label || target
  }

  if (context.length <= 180) {
    return context
  }

  const normalizedContext = context.toLowerCase()
  const candidates = [label, target].map((value) => value.trim().toLowerCase()).filter(Boolean)
  const firstMatchIndex = candidates.reduce<number | null>((bestIndex, candidate) => {
    const nextIndex = normalizedContext.indexOf(candidate)
    if (nextIndex < 0) {
      return bestIndex
    }
    return bestIndex === null || nextIndex < bestIndex ? nextIndex : bestIndex
  }, null) ?? 0
  const start = Math.max(0, firstMatchIndex - 60)
  const end = Math.min(context.length, start + 180)
  const sliceStart = Math.max(0, end - 180)
  const snippet = context.slice(sliceStart, end).trim()

  return `${sliceStart > 0 ? '...' : ''}${snippet}${end < context.length ? '...' : ''}` || label || target
}

function parseWikiMarkdownLinks(markdown: string): Array<{ label: string; target: string; snippet: string }> {
  const links: Array<{ label: string; target: string; snippet: string }> = []
  const linkPattern = /\[\[([^[\]|]+)\|([^[\]]+)\]\]|\[\[([^[\]]+)\]\]/g

  for (const match of markdown.matchAll(linkPattern)) {
    if (typeof match[1] === 'string' && typeof match[2] === 'string') {
      const label = match[1].trim()
      const target = match[2].trim()
      links.push({
        label,
        target,
        snippet: wikiLinkSnippet(markdown, match.index ?? 0, match[0].length, label, target),
      })
      continue
    }

    if (typeof match[3] === 'string') {
      const label = match[3].trim()
      links.push({
        label,
        target: label,
        snippet: wikiLinkSnippet(markdown, match.index ?? 0, match[0].length, label, label),
      })
    }
  }

  return links
}

function summarizeWikiMarkdown(markdown: string): string {
  const plainText = plainTextFromWikiMarkdown(markdown)
  if (!plainText) {
    return 'No page summary yet.'
  }

  const words = plainText.split(' ')
  if (words.length <= 24) {
    return plainText
  }

  return `${words.slice(0, 24).join(' ')}...`
}

function countWikiWords(markdown: string): number {
  const plainText = plainTextFromWikiMarkdown(markdown)
  return plainText ? plainText.split(' ').filter(Boolean).length : 0
}

function isWikiPageArchived(page: SmokeWikiPageRow): boolean {
  return page.archived_at !== null
}

function filterWikiPagesByArchiveState(
  rows: SmokeWikiPageRow[],
  isArchived: boolean,
): SmokeWikiPageRow[] {
  return rows.filter((page) => isWikiPageArchived(page) === isArchived)
}

function buildWikiChildCount(rows: SmokeWikiPageRow[], pageId: string): number {
  return rows.filter((page) => page.parent_page_id === pageId).length
}

function sortWikiPages(rows: SmokeWikiPageRow[]): SmokeWikiPageRow[] {
  return [...rows].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order
    }
    return left.title.localeCompare(right.title)
  })
}

function serializeWikiRevision(revision: SmokeWikiPageRevisionRow) {
  return {
    revision_id: revision.revision_id,
    version: revision.version,
    parent_page_id: revision.parent_page_id,
    title: revision.title,
    sort_order: revision.sort_order,
    change_summary: [...revision.change_summary],
    created_at: revision.created_at,
    created_by: revision.created_by,
    restored_from_revision_id: revision.restored_from_revision_id,
  }
}

function serializeWikiPageSummary(rows: SmokeWikiPageRow[], page: SmokeWikiPageRow) {
  return {
    page_id: page.page_id,
    parent_page_id: page.parent_page_id,
    title: page.title,
    summary: summarizeWikiMarkdown(page.content_markdown),
    links: parseWikiMarkdownLinks(page.content_markdown),
    child_count: buildWikiChildCount(rows, page.page_id),
    word_count: countWikiWords(page.content_markdown),
    sort_order: page.sort_order,
    created_at: page.created_at,
    created_by: page.created_by,
    updated_at: page.updated_at,
    updated_by: page.updated_by,
    is_archived: isWikiPageArchived(page),
    archived_at: page.archived_at,
    archived_by: page.archived_by,
    version: page.version,
  }
}

function buildWikiDescendantIds(rows: SmokeWikiPageRow[], rootPageId: string): Set<string> {
  const descendants = new Set<string>()
  const queue = rows.filter((page) => page.parent_page_id === rootPageId).map((page) => page.page_id)

  while (queue.length > 0) {
    const nextPageId = queue.shift()
    if (!nextPageId || descendants.has(nextPageId)) {
      continue
    }

    descendants.add(nextPageId)
    rows.forEach((page) => {
      if (page.parent_page_id === nextPageId) {
        queue.push(page.page_id)
      }
    })
  }

  return descendants
}

function nextWikiTimestamp(sequence: number): string {
  const minute = String(5 + sequence).padStart(2, '0')
  return `2026-05-16T16:${minute}:00Z`
}

function nextWikiSortOrder(rows: SmokeWikiPageRow[], parentPageId: string | null): number {
  const siblingSortOrders = rows
    .filter((page) => page.parent_page_id === parentPageId)
    .map((page) => page.sort_order)

  return (siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) : 0) + 100
}

function buildWikiChangeSummary(args: {
  previousTitle: string
  previousParentPageId: string | null
  previousContentMarkdown: string
  previousSortOrder: number
  page: SmokeWikiPageRow
  pagesById: Map<string, SmokeWikiPageRow>
}): string[] {
  const {
    previousTitle,
    previousParentPageId,
    previousContentMarkdown,
    previousSortOrder,
    page,
    pagesById,
  } = args
  const changeSummary: string[] = []

  if (page.title !== previousTitle) {
    changeSummary.push(`Renamed page to '${page.title}'.`)
  }

  if (page.parent_page_id !== previousParentPageId) {
    if (page.parent_page_id === null) {
      changeSummary.push('Moved page to the top level.')
    } else {
      const parentTitle = pagesById.get(page.parent_page_id)?.title ?? page.parent_page_id
      changeSummary.push(`Moved page under '${parentTitle}'.`)
    }
  }

  if (page.sort_order !== previousSortOrder) {
    changeSummary.push('Adjusted page ordering.')
  }

  if (page.content_markdown !== previousContentMarkdown) {
    if (!previousContentMarkdown.trim() && page.content_markdown.trim()) {
      changeSummary.push('Added page content.')
    } else if (previousContentMarkdown.trim() && !page.content_markdown.trim()) {
      changeSummary.push('Cleared page content.')
    } else {
      changeSummary.push('Updated page content.')
    }
  }

  return changeSummary.length > 0 ? changeSummary : ['Saved page changes.']
}

function recordWikiRevision(args: {
  revisionsByPageId: Map<string, SmokeWikiPageRevisionRow[]>
  nextRevisionId: number
  page: SmokeWikiPageRow
  createdAt: string
  createdBy: string
  changeSummary: string[]
  restoredFromRevisionId?: number | null
}): SmokeWikiPageRevisionRow {
  const {
    revisionsByPageId,
    nextRevisionId,
    page,
    createdAt,
    createdBy,
    changeSummary,
    restoredFromRevisionId = null,
  } = args
  const revision = {
    revision_id: nextRevisionId,
    page_id: page.page_id,
    version: page.version,
    parent_page_id: page.parent_page_id,
    title: page.title,
    content_markdown: page.content_markdown,
    sort_order: page.sort_order,
    change_summary: [...changeSummary],
    created_at: createdAt,
    created_by: createdBy,
    restored_from_revision_id: restoredFromRevisionId,
  } satisfies SmokeWikiPageRevisionRow

  const currentRevisions = revisionsByPageId.get(page.page_id) ?? []
  currentRevisions.unshift(revision)
  revisionsByPageId.set(page.page_id, currentRevisions)

  return revision
}

function serializeWikiPageDetail(
  rows: SmokeWikiPageRow[],
  revisionsByPageId: Map<string, SmokeWikiPageRevisionRow[]>,
  page: SmokeWikiPageRow,
) {
  return {
    ...serializeWikiPageSummary(rows, page),
    content_markdown: page.content_markdown,
    recent_revisions: (revisionsByPageId.get(page.page_id) ?? [])
      .slice()
      .sort((left, right) => {
        if (left.version !== right.version) {
          return right.version - left.version
        }
        return right.revision_id - left.revision_id
      })
      .slice(0, MAX_WIKI_RECENT_REVISIONS)
      .map(serializeWikiRevision),
  }
}

function validateWikiParentPage(
  rows: SmokeWikiPageRow[],
  pageId: string | null,
  parentPageId: string | null,
): string | null {
  if (parentPageId === null) {
    return null
  }

  const pagesById = new Map(rows.map((page) => [page.page_id, page] as const))
  if (!pagesById.has(parentPageId)) {
    return `Parent wiki page '${parentPageId}' was not found`
  }

  if (pageId !== null && parentPageId === pageId) {
    return 'A wiki page cannot be its own parent'
  }

  if (isWikiPageArchived(pagesById.get(parentPageId)!)) {
    return 'Archived wiki pages cannot accept child pages'
  }

  const descendants = pageId === null ? new Set<string>() : buildWikiDescendantIds(rows, pageId)
  if (pageId !== null && descendants.has(parentPageId)) {
    return 'A wiki page cannot move underneath one of its descendants'
  }

  let currentParentId: string | null = parentPageId
  const visited = new Set<string>()
  while (currentParentId !== null) {
    if (visited.has(currentParentId)) {
      return 'Wiki page hierarchy contains a cycle'
    }
    visited.add(currentParentId)

    if (pageId !== null && currentParentId === pageId) {
      return 'A wiki page cannot move underneath one of its descendants'
    }

    currentParentId = pagesById.get(currentParentId)?.parent_page_id ?? null
  }

  return null
}
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

function writeSse(
  response: ServerResponse,
  events: Array<{ event: string; data: Record<string, unknown> }>,
): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  })

  for (const event of events) {
    response.write(`event: ${event.event}\n`)
    response.write(`data: ${JSON.stringify(event.data)}\n\n`)
  }

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

function normalizedReviewText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizedCorrectionFields(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((field) => (typeof field === 'string' ? field.trim() : ''))
            .filter(Boolean),
        ),
      )
    : []
}

function buildTradeAttentionCandidateList(candidateType: string | null, limit: number) {
  const matchingCandidates = tradeAttentionCandidates
    .filter((candidate) => candidateType === null || candidate.candidate_types.includes(candidateType))
    .slice(0, limit)
  const candidateTypeCounts = Object.fromEntries(
    Array.from(
      matchingCandidates.reduce((counts, candidate) => {
        for (const itemType of candidate.candidate_types) {
          counts.set(itemType, (counts.get(itemType) ?? 0) + 1)
        }
        return counts
      }, new Map<string, number>()),
    ),
  )

  return {
    count: matchingCandidates.length,
    total_count: matchingCandidates.length,
    items: matchingCandidates,
    candidate_type_counts: candidateTypeCounts,
    candidate_type: candidateType,
    source_count_key:
      candidateType === 'confirmation_backlog'
        ? 'dashboard.attention.confirmation_backlog_count'
        : candidateType === 'payment_due'
          ? 'settlement.payment_due_count'
          : candidateType === 'overdue_payment'
            ? 'dashboard.attention.overdue_payment_count'
            : candidateType === 'stale_pricing'
              ? 'dashboard.attention.stale_pricing_count'
              : null,
    description:
      candidateType === 'confirmation_backlog'
        ? 'Trades executed 1+ day ago that still are not confirmed.'
        : candidateType === 'payment_due'
          ? 'Trades currently waiting on due or overdue payment collection/settlement.'
          : candidateType === 'overdue_payment'
            ? 'Trades with overdue payment state or aging invoices that still are not paid.'
            : candidateType === 'stale_pricing'
              ? 'Trades still marked pending or partial pricing 2+ days after execution.'
              : null,
    candidate_types: candidateType === null ? [] : [candidateType],
  }
}

function buildInvoiceIssueCandidateList(limit: number) {
  const items = invoiceIssueCandidates.slice(0, limit)
  return {
    count: items.length,
    total_count: items.length,
    ready_count: items.filter((candidate) => candidate.readiness_status === 'READY').length,
    blocked_count: items.filter((candidate) => candidate.readiness_status !== 'READY').length,
    items,
  }
}

async function startMockApiServer(
  options: StartSmokeHarnessOptions = {},
): Promise<MockApiServer> {
  const mutationRequests: RecordedRequest[] = []
  const operationWorkItemRequests: TradeWorkflowItemRecord[] = []
  const promptNavigationOutcomeRequests: RecordedRequest[] = []
  const unexpectedRequests: RecordedRequest[] = []
  const tradeRows: SmokeTradeRow[] = trades.map((trade) => ({ ...trade }))
  const tradeWorkflowItemRows: TradeWorkflowItemRecord[] = []
  const preTradeScenarioRows: PreTradeScenarioRecord[] = []
  const preTradeRecommendationRunRows: PreTradeRecommendationRunRecord[] = []
  const preTradeReviewRows: PreTradeReviewItemRecord[] = []
  const preTradeNettingSetRows: PreTradeNettingSetRecord[] = []
  const preTradeHedgeRecommendationRows: PreTradeHedgeRecommendationRecord[] = []
  const preTradeRiskScenarioRows: PreTradeRiskScenarioRecord[] = []
  const preTradeMarketOpportunityRows: PreTradeMarketOpportunityRecord[] = []
  const truckMovementSummaries: DeliveryTruckMovementSummaryRecord[] = smokeTruckMovementSummaries.map((movement) => ({
    ...movement,
    tracking_health: movement.tracking_health ? { ...movement.tracking_health } : movement.tracking_health,
  }))
  const truckMovementRows: DeliveryTruckMovementRecord[] = smokeTruckMovements.map((movement) => ({
    ...movement,
    tracking_health: movement.tracking_health ? { ...movement.tracking_health } : movement.tracking_health,
    stops: movement.stops.map((stop) => ({ ...stop })),
  }))
  const truckTrackingSignalRows: DeliveryTrackingSignalRecord[] = smokeTruckTrackingSignals.map((signal) => ({
    ...signal,
    raw_payload: { ...signal.raw_payload },
  }))
  const wikiPageRows: SmokeWikiPageRow[] = wikiPages.map(cloneWikiPage)
  const wikiPageRevisionsByPageId = new Map<string, SmokeWikiPageRevisionRow[]>(
    wikiPageRows.map((page, index) => [
      page.page_id,
      [
        {
          revision_id: index + 1,
          page_id: page.page_id,
          version: page.version,
          parent_page_id: page.parent_page_id,
          title: page.title,
          content_markdown: page.content_markdown,
          sort_order: page.sort_order,
          change_summary: ['Created starter wiki page.'],
          created_at: page.updated_at,
          created_by: page.updated_by,
          restored_from_revision_id: null,
        } satisfies SmokeWikiPageRevisionRow,
      ].map(cloneWikiPageRevision),
    ]),
  )
  const tradeEventsByAggregateId = new Map<string, SmokeEventRow[]>(
    [['T-AMEND-100', selectedTradeEvents.map((event) => ({ ...event }))]],
  )
  function cloneAssistantActionRequest(
    request: SmokeAssistantActionRequestRow,
  ): SmokeAssistantActionRequestRow {
    return {
      ...request,
      payload: { ...request.payload },
      review_context: request.review_context
        ? {
            ...request.review_context,
            owning_work_object: { ...request.review_context.owning_work_object },
            supporting_records: request.review_context.supporting_records.map((record) => ({
              ...record,
            })),
            assumptions: [...request.review_context.assumptions],
            missing_evidence: [...request.review_context.missing_evidence],
            expected_downstream_effects: [...request.review_context.expected_downstream_effects],
            stale_state_basis: { ...request.review_context.stale_state_basis },
            action_preview: request.review_context.action_preview
              ? {
                  ...request.review_context.action_preview,
                  affected_records: (request.review_context.action_preview.affected_records ?? []).map(
                    (record) => ({ ...record }),
                  ),
                  field_changes: (request.review_context.action_preview.field_changes ?? []).map((change) => ({
                    ...change,
                  })),
                  expected_side_effects: [...(request.review_context.action_preview.expected_side_effects ?? [])],
                  warnings: [...(request.review_context.action_preview.warnings ?? [])],
                  blocking_reasons: [...(request.review_context.action_preview.blocking_reasons ?? [])],
                  assumptions: [...(request.review_context.action_preview.assumptions ?? [])],
                  metadata:
                    request.review_context.action_preview.metadata &&
                    typeof request.review_context.action_preview.metadata === 'object'
                      ? { ...request.review_context.action_preview.metadata }
                      : request.review_context.action_preview.metadata,
                }
              : request.review_context.action_preview,
          }
        : request.review_context,
      lifecycle: {
        ...request.lifecycle,
        review_risk_flags: [...request.lifecycle.review_risk_flags],
      },
      result: request.result ? { ...request.result } : null,
      correction_fields: [...request.correction_fields],
    }
  }

  function smokeHomeViewCardDefaults(cardId: string): Omit<SmokeHomeViewCardRow, 'visible' | 'placement' | 'parameters' | 'filters'> {
    const defaults: Record<string, Omit<SmokeHomeViewCardRow, 'visible' | 'placement' | 'parameters' | 'filters'>> = {
      timeframe: {
        card_id: 'timeframe',
        kind: 'desk_time',
        label: 'Desk Time',
        data_bindings: [],
      },
      exchanges: {
        card_id: 'exchanges',
        kind: 'exchange_sessions',
        label: 'Exchanges',
        data_bindings: [],
      },
      calendar: {
        card_id: 'calendar',
        kind: 'calendar',
        label: 'Calendar',
        data_bindings: ['calendar_events', 'user_events'],
      },
      prices: {
        card_id: 'prices',
        kind: 'market_prices',
        label: 'Market Prices',
        data_bindings: ['latest_price_marks', 'market_price_indices'],
      },
      news: {
        card_id: 'news',
        kind: 'market_news',
        label: 'Market News',
        data_bindings: ['market_news_headlines', 'market_price_indices'],
      },
      map: {
        card_id: 'map',
        kind: 'asset_map',
        label: 'Asset map',
        data_bindings: ['asset_map', 'spatial_features', 'weather_overlays'],
      },
      documents: {
        card_id: 'documents',
        kind: 'document_upload',
        label: 'Upload documents',
        data_bindings: ['document_ingestion'],
      },
      communication: {
        card_id: 'communication',
        kind: 'communication_center',
        label: 'Communication center',
        data_bindings: ['message_threads', 'operator_attention_counts'],
      },
      prompt: {
        card_id: 'prompt',
        kind: 'assistant_prompt',
        label: 'Desk Assistant',
        data_bindings: ['assistant_conversation', 'operator_attention_counts'],
      },
    }
    return defaults[cardId] ?? defaults.prompt
  }

  function buildSmokeHomeViewSystemCards(): SmokeHomeViewCardRow[] {
    return [
      'timeframe',
      'exchanges',
      'calendar',
      'prices',
      'news',
      'map',
      'documents',
      'communication',
      'prompt',
    ].map(
      (cardId, index) => ({
        ...smokeHomeViewCardDefaults(cardId),
        visible: true,
        placement: {
          order: index,
          column_span: 2,
          row_span: 4,
          collapsed_column_span: 2,
          collapsed_row_span: 1,
          expanded_column_span: 2,
          expanded_row_span: 4,
        },
        parameters: {},
        filters: {},
      }),
    )
  }

  function normalizeSmokeHomeViewCards(rawCards: unknown): SmokeHomeViewCardRow[] {
    const rows = Array.isArray(rawCards) ? rawCards : []
    const normalized: SmokeHomeViewCardRow[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        continue
      }
      const record = row as Record<string, unknown>
      const cardId = normalizeOptionalText(record.card_id) ?? normalizeOptionalText(record.cardId)
      if (!cardId || seen.has(cardId)) {
        continue
      }
      const defaults = smokeHomeViewCardDefaults(cardId)
      const placementRecord =
        record.placement && typeof record.placement === 'object' && !Array.isArray(record.placement)
          ? (record.placement as Record<string, unknown>)
          : {}
      normalized.push({
        ...defaults,
        visible: typeof record.visible === 'boolean' ? record.visible : true,
        placement: {
          order: normalized.length,
          column_span: Number(
            placementRecord.expanded_column_span ??
              placementRecord.expandedColumnSpan ??
              placementRecord.column_span ??
              placementRecord.columnSpan ??
              2,
          ),
          row_span: Number(
            placementRecord.expanded_row_span ??
              placementRecord.expandedRowSpan ??
              placementRecord.row_span ??
              placementRecord.rowSpan ??
              4,
          ),
          collapsed_column_span: Number(
            placementRecord.collapsed_column_span ??
              placementRecord.collapsedColumnSpan ??
              2,
          ),
          collapsed_row_span: Number(
            placementRecord.collapsed_row_span ??
              placementRecord.collapsedRowSpan ??
              1,
          ),
          expanded_column_span: Number(
            placementRecord.expanded_column_span ??
              placementRecord.expandedColumnSpan ??
              2,
          ),
          expanded_row_span: Number(
            placementRecord.expanded_row_span ??
              placementRecord.expandedRowSpan ??
              4,
          ),
        },
        parameters:
          record.parameters && typeof record.parameters === 'object' && !Array.isArray(record.parameters)
            ? { ...(record.parameters as Record<string, unknown>) }
            : {},
        filters:
          record.filters && typeof record.filters === 'object' && !Array.isArray(record.filters)
            ? { ...(record.filters as Record<string, unknown>) }
            : {},
        data_bindings: Array.isArray(record.data_bindings)
          ? record.data_bindings.map((binding) => String(binding))
          : Array.isArray(record.dataBindings)
            ? record.dataBindings.map((binding) => String(binding))
            : [...defaults.data_bindings],
      })
      seen.add(cardId)
    }

    for (const systemCard of buildSmokeHomeViewSystemCards()) {
      if (seen.has(systemCard.card_id)) {
        continue
      }
      normalized.push({
        ...systemCard,
        placement: {
          ...systemCard.placement,
          order: normalized.length,
        },
      })
    }
    return normalized
  }

  function buildSmokeHomeViewDefinition(args: {
    definitionId: number
    name: string
    cards: SmokeHomeViewCardRow[]
    personaHint?: string | null
    globalFilters?: Record<string, unknown>
    createdBy?: string
  }): SmokeHomeViewDefinitionRow {
    const actor = args.createdBy ?? smokeSession.user.user_id
    return {
      definition_id: args.definitionId,
      definition_key: `home_view_smoke_${args.definitionId}`,
      name: args.name,
      scope: 'PERSONAL',
      scope_owner_key: actor,
      base_template_key: 'system_home',
      base_template_version: 1,
      persona_hint: args.personaHint ?? 'trader',
      cards: args.cards.map((card) => ({
        ...card,
        placement: { ...card.placement },
        parameters: { ...card.parameters },
        filters: { ...card.filters },
        data_bindings: [...card.data_bindings],
      })),
      global_filters: { ...(args.globalFilters ?? {}) },
      status: 'ACTIVE',
      created_at: assistantRunRecordedAt,
      created_by: actor,
      updated_at: assistantRunRecordedAt,
      updated_by: actor,
      version: 1,
      can_edit: true,
      can_duplicate: false,
      can_publish: true,
      can_retire: false,
      can_restore: false,
      is_shared: false,
      validation_warnings: [],
    }
  }

  function cloneHomeViewDefinition(row: SmokeHomeViewDefinitionRow): SmokeHomeViewDefinitionRow {
    return {
      ...row,
      cards: row.cards.map((card) => ({
        ...card,
        placement: { ...card.placement },
        parameters: { ...card.parameters },
        filters: { ...card.filters },
        data_bindings: [...card.data_bindings],
      })),
      global_filters: { ...row.global_filters },
      validation_warnings: [...row.validation_warnings],
    }
  }

  function createHomeViewDefinitionFromPayload(payload: Record<string, unknown>): SmokeHomeViewDefinitionRow {
    const name = normalizeOptionalText(payload.name) ?? 'New Home view'
    const definition = buildSmokeHomeViewDefinition({
      definitionId: nextHomeViewDefinitionId++,
      name,
      cards: normalizeSmokeHomeViewCards(payload.cards),
      personaHint: normalizeOptionalText(payload.persona_hint) ?? 'trader',
      globalFilters:
        payload.global_filters && typeof payload.global_filters === 'object' && !Array.isArray(payload.global_filters)
          ? { ...(payload.global_filters as Record<string, unknown>) }
          : {},
    })
    homeViewDefinitionRows.unshift(definition)
    return cloneHomeViewDefinition(definition)
  }

  function ensureHomeViewActionRequest(): SmokeAssistantActionRequestRow {
    const existing = assistantActionRequestRows.find((request) => request.action_request_id === 7101)
    if (existing) {
      return cloneAssistantActionRequest(existing)
    }

    const cards = normalizeSmokeHomeViewCards([
      {
        card_id: 'prices',
        visible: true,
        placement: { order: 0, column_span: 2, row_span: 1 },
        parameters: { price_sort: 'updated_desc' },
        filters: { price_index_code: 'HH_IFERC', commodity_code: 'HENRY_HUB_GAS' },
        data_bindings: ['latest_price_marks', 'market_price_indices'],
      },
      {
        card_id: 'news',
        visible: true,
        placement: { order: 1, column_span: 2, row_span: 1 },
        parameters: { news_limit: 5, news_lookback_days: 7 },
        filters: { price_index_code: 'HH_IFERC', commodity_code: 'HENRY_HUB_GAS' },
        data_bindings: ['market_news_headlines', 'market_price_indices'],
      },
      {
        card_id: 'map',
        visible: true,
        placement: { order: 2, column_span: 2, row_span: 2 },
        parameters: { map_record_limit: 250 },
        filters: { commodity_code: 'HENRY_HUB_GAS', geography: 'North America' },
        data_bindings: ['asset_map', 'spatial_features', 'weather_overlays'],
      },
      {
        card_id: 'prompt',
        visible: true,
        placement: { order: 3, column_span: 2, row_span: 1 },
        parameters: { starter_kit: 'market_watch' },
        filters: { workflow_category: 'market_monitoring' },
        data_bindings: ['assistant_conversation', 'operator_attention_counts'],
      },
    ])
    const actionRequest: SmokeAssistantActionRequestRow = {
      action_request_id: 7101,
      run_id: assistantRunId,
      user_id: smokeSession.user.user_id,
      status: 'PENDING',
      workspace: 'assistant',
      agent_id: 'home-view-stager',
      agent_name: 'Home View Stager',
      action_type: 'create_home_view_instance',
      summary: 'Create Home view "HH NG Watch"',
      description: 'Create a personal Home view named "HH NG Watch" with Henry Hub natural gas cards and filters.',
      payload: {
        name: 'HH NG Watch',
        scope: 'PERSONAL',
        base_template_key: 'system_home',
        base_template_version: 1,
        persona_hint: 'trader',
        cards,
        global_filters: { commodity_code: 'HENRY_HUB_GAS' },
      },
      review_context: {
        owning_work_object: {
          type: 'home_view_definition',
          id: 'PERSONAL:hh ng watch',
          label: 'Home view HH NG Watch',
        },
        required_reviewer_role: 'REQUESTING_USER_OR_ADMIN',
        business_rationale: 'The user asked to save a personal HH NG Home view from Prompt Home.',
        proposed_mutation: {
          operation: 'create_home_view_instance',
          recipe_key: 'hub_basis_watch',
          name: 'HH NG Watch',
          scope: 'PERSONAL',
          visible_cards: ['prices', 'news', 'map', 'prompt'],
          global_filters: { commodity_code: 'HENRY_HUB_GAS' },
        },
        supporting_records: [
          {
            type: 'home_system_template',
            id: 'system_home:v1',
            label: 'System Home template',
            summary: 'The immutable System Home template remains unchanged.',
          },
        ],
        assumptions: ['Interpreted HH NG as Henry Hub natural gas.'],
        missing_evidence: ['No related active natural-gas price indices were available for basis context.'],
        expected_downstream_effects: [
          'Create one active personal Home view definition for the requesting user.',
          'Expose the saved Home view instance in the Home view switcher.',
          'Leave the immutable System Home template unchanged.',
        ],
        stale_state_basis: {
          scope: 'PERSONAL',
          name_key: 'hh ng watch',
          existing_definition_id: null,
          base_template_key: 'system_home',
          base_template_version: 1,
        },
        idempotency_key: 'assistant-action:create_home_view_instance:PERSONAL:hh ng watch',
        action_preview: {
          preview_type: 'home_view_recipe',
          status: 'READY',
          summary: 'Henry Hub Natural Gas recipe selected prices, map, prompt for a personal Home view.',
          affected_records: [],
          field_changes: [
            { field: 'recipe_key', current_value: null, proposed_value: 'hub_basis_watch' },
            { field: 'visible_cards', current_value: [], proposed_value: ['prices', 'map', 'prompt'] },
          ],
          expected_side_effects: [
            'Create a validated personal Home view definition after approval.',
            'Leave the immutable System Home template unchanged.',
          ],
          warnings: ['No related active natural-gas price indices were available for basis context.'],
          blocking_reasons: [],
          assumptions: ['Interpreted HH NG as Henry Hub natural gas.'],
          metadata: { recipe_key: 'hub_basis_watch', recipe_label: 'Henry Hub Natural Gas' },
        },
      },
      lifecycle: {
        stage: 'AWAITING_REVIEW',
        label: 'Awaiting review',
        tone: 'attention',
        is_terminal: false,
        can_approve: true,
        can_reject: true,
        reviewer_action_label: 'Review evidence, then approve or reject',
        decided_label: null,
        review_risk_flags: [],
      },
      result: null,
      error_detail: null,
      review_outcome: null,
      decision_note: null,
      correction_summary: null,
      correction_fields: [],
      created_at: assistantRunRecordedAt,
      decided_at: null,
      decided_by: null,
    }
    assistantActionRequestRows.push(actionRequest)
    return cloneAssistantActionRequest(actionRequest)
  }

  function cloneAssistantAgent(agent: (typeof assistantAdminAgents)[number]) {
    return {
      ...agent,
      managed_agent_ids: [...agent.managed_agent_ids],
      allowed_workspaces: [...agent.allowed_workspaces],
      capabilities: [...agent.capabilities],
      skills: [...agent.skills],
      allowed_tools: [...agent.allowed_tools],
      allowed_action_types: [...agent.allowed_action_types],
      effective_policy: {
        ...agent.effective_policy,
        allowed_tools: agent.effective_policy.allowed_tools.map((decision) => ({ ...decision })),
        blocked_tools: agent.effective_policy.blocked_tools.map((decision) => ({ ...decision })),
        allowed_actions: agent.effective_policy.allowed_actions.map((decision) => ({ ...decision })),
        blocked_actions: agent.effective_policy.blocked_actions.map((decision) => ({ ...decision })),
        policy_notes: [...agent.effective_policy.policy_notes],
      },
      eval_gate: agent.eval_gate
        ? {
            ...agent.eval_gate,
            required_cases: [...agent.eval_gate.required_cases],
            covered_cases: [...agent.eval_gate.covered_cases],
            missing_cases: [...agent.eval_gate.missing_cases],
            notes: [...agent.eval_gate.notes],
          }
        : null,
    }
  }

  function cloneAssistantProfileRequest(
    request: SmokeAssistantProfileRequestRow,
  ): SmokeAssistantProfileRequestRow {
    return {
      ...request,
      requested_workspaces: [...request.requested_workspaces],
      work_objects: [...request.work_objects],
      requested_inputs_tools: [...request.requested_inputs_tools],
      requested_action_types: [...request.requested_action_types],
      requested_skills: [...request.requested_skills],
      expected_outputs: [...request.expected_outputs],
      applied_diff_summary: request.applied_diff_summary.map((diffRow) => ({ ...diffRow })),
      stop_conditions: [...request.stop_conditions],
      success_metrics: [...request.success_metrics],
      proposed_eval_cases: [...request.proposed_eval_cases],
    }
  }

  const assistantAgentOverrides = new Map<string, Record<string, unknown>>()
  let nextAssistantAgentRevisionId = 7001

  const smokeProfileRequestDiffFields = [
    ['status', 'Status'],
    ['authority_ceiling', 'Authority ceiling'],
    ['human_owner_role', 'Human owner role'],
    ['allowed_workspaces', 'Allowed workspaces'],
    ['capabilities', 'Capabilities'],
    ['skills', 'Skills'],
    ['allowed_tools', 'Allowed tools'],
    ['allowed_action_types', 'Allowed action types'],
    ['orchestration_pattern', 'Orchestration pattern'],
    ['parent_agent_id', 'Parent agent'],
    ['managed_agent_ids', 'Managed agents'],
    ['delegation_guidance', 'Delegation guidance'],
    ['system_prompt', 'System prompt'],
  ] as const

  function formatSmokeProfileRequestDiffValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value.length > 0 ? value.map((entry) => String(entry)).join(', ') : 'None'
    }
    if (value === null || value === undefined || value === '') {
      return 'None'
    }
    if (typeof value === 'string' && value.length > 160) {
      return `${value.slice(0, 157)}...`
    }
    return String(value)
  }

  function buildSmokeProfileRequestDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): SmokeAssistantProfileRequestDiffRow[] {
    return smokeProfileRequestDiffFields.flatMap(([fieldKey, label]) => {
      const currentValue = before[fieldKey]
      const nextValue = after[fieldKey]
      if (JSON.stringify(currentValue ?? null) === JSON.stringify(nextValue ?? null)) {
        return []
      }
      return [{
        field_key: fieldKey,
        label,
        current_value: formatSmokeProfileRequestDiffValue(currentValue),
        next_value: formatSmokeProfileRequestDiffValue(nextValue),
      }]
    })
  }

  function currentAssistantAgent(agentId: string) {
    const fixtureAgent = assistantAdminAgents.find((agent) => agent.agent_id === agentId)
    if (!fixtureAgent) {
      return null
    }
    return cloneAssistantAgent({
      ...fixtureAgent,
      ...(assistantAgentOverrides.get(agentId) ?? {}),
    })
  }

  const assistantActionRequestRows: SmokeAssistantActionRequestRow[] = assistantActionRequests.map(
    cloneAssistantActionRequest,
  )
  const assistantConversationId = 902
  const assistantRunId = 8801
  const assistantRunRecordedAt = '2026-04-11T09:08:00Z'
  let nextHomeViewDefinitionId = 9100
  const homeViewDefinitionRows: SmokeHomeViewDefinitionRow[] = [
    buildSmokeHomeViewDefinition({
      definitionId: nextHomeViewDefinitionId++,
      name: 'Default Home',
      cards: buildSmokeHomeViewSystemCards(),
    }),
  ]
  const assistantProfileRequestRows: SmokeAssistantProfileRequestRow[] = []
  let nextAssistantProfileRequestId = 9001
  const assistantRunFeedbackByRunId = new Map<number, SmokeAssistantFeedbackRow>()
  const assistantPromptNavigationOutcomeRows = new Map<string, SmokeAssistantPromptNavigationOutcomeRow>()
  const assistantUserPrompt = 'Where should I handle the confirmation blocker?'
  let nextWikiPageSequence = wikiPageRows.length + 1
  let nextWikiRevisionId = wikiPageRows.length + 1
  let wikiMutationSequence = 0
  let sessionExpired = false
  const runtimeSettings = {
    ...publicRuntimeSettings,
    single_user_auth_enabled: options.singleUserAuthEnabled ?? publicRuntimeSettings.single_user_auth_enabled,
  }

  function buildAssistantActionRequestsForPrompt(prompt: string): SmokeAssistantActionRequestRow[] {
    const normalizedPrompt = prompt.toLowerCase()
    if (normalizedPrompt.includes('hh ng') || normalizedPrompt.includes('home view')) {
      return [ensureHomeViewActionRequest()]
    }
    if (normalizedPrompt.includes('cancel') || normalizedPrompt.includes('unwind')) {
      return assistantActionRequestRows
        .filter((request) => request.action_request_id === 7001)
        .map(cloneAssistantActionRequest)
    }

    return []
  }

  function buildAssistantResponseContentForPrompt(prompt: string): string {
    const normalizedPrompt = prompt.toLowerCase()
    if (normalizedPrompt.includes('hh ng') || normalizedPrompt.includes('home view')) {
      return 'I staged a Home view request for HH NG. Review the card mix and filters before anything changes. Approval is still required.'
    }
    if (normalizedPrompt.includes('cancel') || normalizedPrompt.includes('unwind')) {
      return 'I staged a governed cancellation request for T-AMEND-100. Review the evidence below before anything changes. Approval is still required.'
    }

    if (normalizedPrompt.includes('broken handoff') || normalizedPrompt.includes('invalid handoff')) {
      return [
        'Stay on Home for now while we confirm the route.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          target_view: 'not-a-real-workspace',
          label: 'Broken Handoff',
        }),
        '```',
      ].join('\n')
    }

    if (normalizedPrompt.includes('settlement') || normalizedPrompt.includes('invoice')) {
      return [
        'Settlement is the right place to continue because the open item is invoice and payment follow-through.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          targetView: 'settlement',
          label: 'Open Settlement',
          rationale: 'Review settlement follow-through for T-AMEND-100 before changing invoice or payment state.',
          focus: {
            type: 'trade',
            id: 'T-AMEND-100',
            label: 'T-AMEND-100',
          },
        }),
        '```',
      ].join('\n')
    }

    if (normalizedPrompt.includes('trade capture') || normalizedPrompt.includes('amend')) {
      return [
        'Trade Capture is the right place to continue because the next step is an amendment review.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          targetView: 'trades',
          label: 'Open Trade Capture',
          rationale: 'Open the amend panel for T-AMEND-100 so economics and workflow changes stay in one place.',
          focus: {
            type: 'trade',
            id: 'T-AMEND-100',
            label: 'T-AMEND-100',
          },
          inspectorTab: 'amend',
        }),
        '```',
      ].join('\n')
    }

    return [
      'Operations is the right place to continue because the blocker is tied to the confirmation queue.',
      '```navigation_intent',
      JSON.stringify({
        kind: 'open_workspace',
        targetView: 'operations',
        label: 'Open Work Queue',
        rationale: 'Review the confirmation blocker with the operations owner before changing trade state.',
        focus: {
          type: 'trade',
          id: 'T-AMEND-100',
          label: 'T-AMEND-100',
        },
        inspectorTab: 'events',
      }),
      '```',
    ].join('\n')
  }

  function latestUserPromptFromPayload(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return ''
    }

    const messages = (payload as { messages?: unknown }).messages
    if (!Array.isArray(messages)) {
      return ''
    }

    for (const message of [...messages].reverse()) {
      if (typeof message !== 'object' || message === null || Array.isArray(message)) {
        continue
      }
      const candidate = message as { role?: unknown; content?: unknown }
      if (candidate.role === 'user' && typeof candidate.content === 'string') {
        return candidate.content
      }
    }

    return ''
  }

  const assistantResponseContent = buildAssistantResponseContentForPrompt(assistantUserPrompt)

  function buildAssistantConversationSummary() {
    return {
      conversation_id: assistantConversationId,
      created_at: '2026-04-11T09:00:00Z',
      updated_at: assistantRunRecordedAt,
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
      latest_run_id: assistantRunId,
      latest_user_message: assistantUserPrompt,
      latest_assistant_message: 'Operations is the right place to continue.',
    }
  }

  function buildAssistantConversation() {
    return {
      ...buildAssistantConversationSummary(),
      messages: [
        {
          role: 'user',
          content: assistantUserPrompt,
          recorded_at: '2026-04-11T09:07:00Z',
          run_id: null,
          provider: null,
          model: null,
          warnings: [],
          tool_calls: [],
          feedback: null,
        },
        {
          role: 'assistant',
          content: assistantResponseContent,
          recorded_at: assistantRunRecordedAt,
          run_id: assistantRunId,
          provider: 'openai',
          model: 'gpt-5.4',
          warnings: [],
          tool_calls: [],
          feedback: assistantRunFeedbackByRunId.get(assistantRunId) ?? null,
        },
      ],
    }
  }

  function buildAssistantRunSummary() {
    return {
      conversation_id: assistantConversationId,
      run_id: assistantRunId,
      status: 'COMPLETED',
      created_at: assistantRunRecordedAt,
      completed_at: assistantRunRecordedAt,
      user_id: smokeSession.user.user_id,
      user_role: smokeSession.user.role,
      workspace: 'assistant',
      agent_id: null,
      agent_name: null,
      agent_role_key: null,
      agent_profile_kind: null,
      provider: 'openai',
      model: 'gpt-5.4',
      use_live_tools: true,
      warning_count: 0,
      tool_call_count: 0,
      input_tokens: 120,
      output_tokens: 60,
      latest_user_message: assistantUserPrompt,
      assistant_message: assistantResponseContent,
      error_detail: null,
    }
  }

  function buildAssistantRun() {
    return {
      ...buildAssistantRunSummary(),
      request_messages: [{ role: 'user', content: assistantUserPrompt }],
      application_context: 'Selected trade T-AMEND-100.',
      prompt_sections: [
        {
          key: 'workspace',
          title: 'Workspace',
          source: 'workspace',
          content: 'Assistant workspace smoke context.',
        },
      ],
      rendered_system_prompt: 'Answer with grounded operational context and stage reviewable actions only.',
      warnings: [],
      tool_calls: [],
    }
  }

  function buildAssistantResponseMetadata(prompt: string) {
    const actionRequests = buildAssistantActionRequestsForPrompt(prompt)
    const responseRunId = actionRequests[0]?.run_id ?? assistantRunId

    return {
      conversation_id: assistantConversationId,
      conversation_updated_at: assistantRunRecordedAt,
      run_id: responseRunId,
      run_recorded_at: assistantRunRecordedAt,
      agent_id: null,
      agent_name: null,
      agent_role_key: null,
      agent_profile_kind: null,
      provider: 'openai',
      model: 'gpt-5.4',
      usage: {
        input_tokens: 120,
        output_tokens: 60,
      },
      warnings: [],
      tool_calls: [],
      action_requests: actionRequests,
    }
  }

  function buildAssistantOutcomeMetrics() {
    const feedbackRows = Array.from(assistantRunFeedbackByRunId.values())
    const promptNavigationRows = Array.from(assistantPromptNavigationOutcomeRows.values())
    if (feedbackRows.length === 0 && promptNavigationRows.length === 0) {
      return assistantOutcomeMetrics
    }

    const helpfulFeedbackDelta = feedbackRows.filter((row) => row.rating === 'HELPFUL').length
    const needsWorkFeedbackDelta = feedbackRows.filter((row) => row.rating === 'NEEDS_WORK').length
    const totalFeedbackCount = assistantOutcomeMetrics.total_feedback_count + feedbackRows.length
    const helpfulFeedbackCount = assistantOutcomeMetrics.helpful_feedback_count + helpfulFeedbackDelta
    const needsWorkFeedbackCount = assistantOutcomeMetrics.needs_work_feedback_count + needsWorkFeedbackDelta
    const acceptedPromptCount = promptNavigationRows.filter((row) => row.outcome === 'ACCEPTED').length
    const dismissedPromptCount = promptNavigationRows.filter((row) => row.outcome === 'DISMISSED').length
    const failedPromptCount = promptNavigationRows.filter((row) => row.outcome === 'FAILED').length
    const totalPromptCount = acceptedPromptCount + dismissedPromptCount + failedPromptCount
    const promptTargetGroups = new Map<
      string,
      {
        target_view: string | null
        target_label: string | null
        focus_type: string | null
        accepted_count: number
        dismissed_count: number
        failed_count: number
        recent_prompt_examples: string[]
      }
    >()
    for (const row of promptNavigationRows) {
      const key = `${row.target_view ?? '__invalid__'}::${row.target_label ?? '__unlabeled__'}::${row.focus_type ?? '__workspace__'}`
      const group = promptTargetGroups.get(key) ?? {
        target_view: row.target_view,
        target_label: row.target_label,
        focus_type: row.focus_type,
        accepted_count: 0,
        dismissed_count: 0,
        failed_count: 0,
        recent_prompt_examples: [],
      }
      if (row.outcome === 'ACCEPTED') {
        group.accepted_count += 1
      } else if (row.outcome === 'DISMISSED') {
        group.dismissed_count += 1
      } else if (row.outcome === 'FAILED') {
        group.failed_count += 1
      }
      if (!group.recent_prompt_examples.includes(assistantUserPrompt)) {
        group.recent_prompt_examples.push(assistantUserPrompt)
      }
      promptTargetGroups.set(key, group)
    }
    const byPromptTarget = Array.from(promptTargetGroups.values()).map((group) => {
      const outcomeCount = group.accepted_count + group.dismissed_count + group.failed_count
      const acceptanceRate = outcomeCount > 0 ? group.accepted_count / outcomeCount : null
      const dismissRate = outcomeCount > 0 ? group.dismissed_count / outcomeCount : null
      const failureRate = outcomeCount > 0 ? group.failed_count / outcomeCount : null
      let signal: 'OBSERVE' | 'CANDIDATE_FOR_RULE' | 'NARROW' | 'RETIRE' = 'OBSERVE'
      let signalReason = 'Keep observing until the route has enough repeated outcomes to justify product logic.'
      if (group.failed_count >= 2 && (failureRate ?? 0) >= 0.5) {
        signal = 'RETIRE'
        signalReason = 'Repeated failed handoff payloads suggest this route should be paused or rebuilt.'
      } else if (group.dismissed_count >= 2 && (dismissRate ?? 0) >= 0.5) {
        signal = 'NARROW'
        signalReason = 'Users dismiss this destination often enough that the routing rule should narrow or ask for confirmation.'
      } else if (group.accepted_count >= 3 && (acceptanceRate ?? 0) >= 0.75 && group.failed_count === 0) {
        signal = 'CANDIDATE_FOR_RULE'
        signalReason = 'Repeated accepted handoffs make this destination a strong deterministic rule candidate.'
      }
      return {
        target_view: group.target_view,
        target_label: group.target_label,
        focus_type: group.focus_type,
        outcome_count: outcomeCount,
        accepted_count: group.accepted_count,
        dismissed_count: group.dismissed_count,
        failed_count: group.failed_count,
        acceptance_rate: acceptanceRate,
        dismiss_rate: dismissRate,
        failure_rate: failureRate,
        signal,
        signal_reasons: [signalReason],
        recent_prompt_examples: group.recent_prompt_examples.slice(0, 3),
      }
    })

    return {
      ...assistantOutcomeMetrics,
      total_feedback_count: totalFeedbackCount,
      helpful_feedback_count: helpfulFeedbackCount,
      needs_work_feedback_count: needsWorkFeedbackCount,
      feedback_helpful_rate: helpfulFeedbackCount / totalFeedbackCount,
      by_workspace: assistantOutcomeMetrics.by_workspace.map((row) => {
        if (row.workspace !== 'assistant') {
          return row
        }

        const workspaceFeedbackCount = row.feedback_count + feedbackRows.length
        const workspaceHelpfulFeedbackCount = row.helpful_feedback_count + helpfulFeedbackDelta
        return {
          ...row,
          run_count: row.run_count + feedbackRows.length,
          helpful_feedback_count: workspaceHelpfulFeedbackCount,
          needs_work_feedback_count: row.needs_work_feedback_count + needsWorkFeedbackDelta,
          feedback_count: workspaceFeedbackCount,
          feedback_helpful_rate: workspaceHelpfulFeedbackCount / workspaceFeedbackCount,
        }
      }),
      recent_feedback: [
        ...feedbackRows.map((row) => ({
          ...row,
          agent_id: null,
          agent_name: null,
          workspace: 'assistant',
        })),
        ...assistantOutcomeMetrics.recent_feedback,
      ],
      prompt_navigation_summary: {
        total_outcome_count: totalPromptCount,
        accepted_count: acceptedPromptCount,
        dismissed_count: dismissedPromptCount,
        failed_count: failedPromptCount,
        acceptance_rate: totalPromptCount > 0 ? acceptedPromptCount / totalPromptCount : null,
        dismiss_rate: totalPromptCount > 0 ? dismissedPromptCount / totalPromptCount : null,
        failure_rate: totalPromptCount > 0 ? failedPromptCount / totalPromptCount : null,
      },
      by_prompt_target: byPromptTarget,
      recent_prompt_navigation_outcomes: promptNavigationRows.map((row) => ({
        ...row,
        agent_id: null,
        agent_name: null,
        source_workspace: row.run_id === null ? null : 'assistant',
        latest_user_message: row.run_id === null ? null : assistantUserPrompt,
      })),
    }
  }

  function buildAssistantControlTowerSummary() {
    const oldestPendingAction = assistantActionRequestRows
      .filter((requestRow) => requestRow.status === 'PENDING')
      .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))[0]
    const trackedWorkPackages = buildAssistantAgentWorkPackages()
    const implementedPackages = trackedWorkPackages.filter((workPackage) => workPackage.status === 'IMPLEMENTED')

    return {
      generated_at: '2026-04-11T09:10:00Z',
      created_after: null,
      created_before: null,
      roster: {
        total_count: assistantAdminAgents.length,
        active_count: assistantAdminAgents.filter((agent) => agent.status === 'ACTIVE').length,
        draft_count: assistantAdminAgents.filter((agent) => agent.status === 'DRAFT').length,
        paused_count: assistantAdminAgents.filter((agent) => agent.status === 'PAUSED').length,
        retired_count: assistantAdminAgents.filter((agent) => agent.status === 'RETIRED').length,
        action_capable_count: assistantAdminAgents.filter((agent) => agent.capabilities.includes('ACTION')).length,
        missing_eval_coverage_count: 0,
        policy_warning_count: 0,
      },
      runs: {
        total_count: 12,
        completed_count: 11,
        failed_count: 1,
        warning_count: 1,
        tool_call_count: 15,
        latest_run_at: assistantRunRecordedAt,
      },
      actions: {
        total_count: assistantActionRequestRows.length,
        pending_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'PENDING').length,
        failed_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'FAILED').length,
        rejected_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'REJECTED').length,
        executed_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'EXECUTED').length,
        preview_blocked_count: 0,
        oldest_pending_action: oldestPendingAction
          ? {
              action_request_id: oldestPendingAction.action_request_id,
              action_type: oldestPendingAction.action_type,
              summary: oldestPendingAction.summary,
              agent_id: oldestPendingAction.agent_id,
              agent_name: oldestPendingAction.agent_name,
              user_id: oldestPendingAction.user_id,
              created_at: oldestPendingAction.created_at,
              age_seconds: 1500,
            }
          : null,
      },
      work_packages: {
        total_count: trackedWorkPackages.length,
        accepted_count: trackedWorkPackages.filter((workPackage) => workPackage.status === 'ACCEPTED').length,
        in_progress_count: trackedWorkPackages.filter((workPackage) => workPackage.status === 'IN_PROGRESS').length,
        implemented_count: implementedPackages.length,
        dismissed_count: trackedWorkPackages.filter((workPackage) => workPackage.status === 'DISMISSED').length,
        stale_count: 0,
        stale_accepted_count: 0,
        stale_in_progress_count: 0,
        implemented_with_pr_count: implementedPackages.filter((workPackage) => Boolean(workPackage.implementation_evidence.pr_url)).length,
        implemented_with_commit_count: implementedPackages.filter((workPackage) => Boolean(workPackage.implementation_evidence.commit_sha)).length,
        implemented_with_eval_count: implementedPackages.filter((workPackage) => workPackage.implementation_evidence.eval_ids.length > 0).length,
        implemented_with_tests_count: implementedPackages.filter((workPackage) => workPackage.implementation_evidence.test_names.length > 0).length,
        implemented_with_docs_count: implementedPackages.filter((workPackage) => workPackage.implementation_evidence.doc_paths.length > 0).length,
        implemented_missing_evidence_count: implementedPackages.filter(
          (workPackage) =>
            !workPackage.implementation_evidence.pr_url &&
            !workPackage.implementation_evidence.commit_sha &&
            workPackage.implementation_evidence.eval_ids.length === 0 &&
            workPackage.implementation_evidence.test_names.length === 0 &&
            workPackage.implementation_evidence.doc_paths.length === 0,
        ).length,
      },
      trust_signals: oldestPendingAction
        ? [
            {
              agent_id: oldestPendingAction.agent_id ?? 'ops-governor',
              agent_name: oldestPendingAction.agent_name ?? 'Ops Governor',
              status: 'ACTIVE',
              role_key: 'trade-ops-copilot',
              profile_kind: 'ROLE_DERIVED',
              signal_type: 'ACTION_BACKLOG',
              severity: 'warning',
              summary: 'One staged action is waiting for human review.',
              details: ['Approve or reject the oldest pending action before considering broader autonomy.'],
              pending_action_count: 1,
              failed_action_count: 0,
              warning_run_count: 1,
              eval_status: 'PASS',
            },
          ]
        : [],
    }
  }

  function buildAssistantAgentWorkPackages() {
    return [
      {
        id: 1,
        work_package_id: 'wp-smoke-eval-coverage',
        title: 'Add assistant approval eval coverage',
        package_type: 'EVAL',
        priority: 'P2',
        status: 'ACCEPTED',
        source_agent_ids: ['ops-governor'],
        source_agent_names: ['Ops Governor'],
        source_recommendations: ['KEEP_STAGED'],
        source_candidates: ['Approval inbox smoke coverage'],
        recommended_owner_role: 'Platform Owner',
        rationale: 'Keep approval-gated action behavior covered by deterministic smoke and eval checks.',
        acceptance_checks: ['Run browser smoke for the approval inbox.', 'Run assistant evals before promotion.'],
        knowledge_base_titles: ['Prompt Navigation Is A UI Intent'],
        implementation_evidence: {
          eval_ids: [],
          test_names: [],
          doc_paths: [],
        },
        accepted_at: '2026-04-11T09:00:00Z',
        accepted_by: 'ops_admin',
        implemented_at: null,
        implemented_by: null,
        notes: 'Smoke fixture backlog item.',
        created_at: '2026-04-11T08:55:00Z',
        created_by: 'ops_admin',
        updated_at: '2026-04-11T09:00:00Z',
        updated_by: 'ops_admin',
      },
    ]
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
      !(method === 'POST' && url.pathname === '/auth/logout') &&
      !(method === 'POST' && url.pathname === '/auth/session') &&
      !(method === 'POST' && url.pathname === '/auth/single-user-session') &&
      !(method === 'POST' && url.pathname === '/assistant/context') &&
      !(method === 'POST' && /^\/admin\/assistant\/agents\/[^/]+\/context-preview$/.test(url.pathname)) &&
      !(method === 'POST' && url.pathname === '/assistant/respond') &&
      !(method === 'POST' && url.pathname === '/assistant/respond/stream') &&
      !(method === 'POST' && url.pathname === '/assistant/prompt-navigation-outcomes') &&
      !(method === 'POST' && /\/assistant\/runs\/\d+\/prompt-navigation-outcomes$/.test(url.pathname)) &&
      !(method === 'POST' && url.pathname === '/integrations/attio/client-enrichment') &&
      !(method === 'POST' && url.pathname === '/market-data/news/headlines/tagging') &&
      !(method === 'POST' && url.pathname === '/pretrade/recommendations/draft-analysis') &&
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

    if (url.pathname === '/home-view-definitions/system-template' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, {
        template_key: 'system_home',
        template_version: 1,
        label: 'System Home',
        immutable: true,
        cards: buildSmokeHomeViewSystemCards(),
      })
      return
    }

    if (url.pathname === '/home-view-definitions' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, homeViewDefinitionRows.map(cloneHomeViewDefinition))
      return
    }

    if (url.pathname === '/home-view-definitions/admin/inventory' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      writeJson(response, homeViewDefinitionRows.map(cloneHomeViewDefinition))
      return
    }

    if (url.pathname === '/home-view-definitions' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const payload = await readJsonBody(request)
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}
      writeJson(response, createHomeViewDefinitionFromPayload(record), 201)
      return
    }

    const homeViewDefinitionMatch = url.pathname.match(/^\/home-view-definitions\/(\d+)$/)
    if (homeViewDefinitionMatch && method === 'PATCH') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const definitionId = Number(homeViewDefinitionMatch[1])
      const definitionIndex = homeViewDefinitionRows.findIndex((row) => row.definition_id === definitionId)
      if (definitionIndex < 0) {
        writeJson(response, { detail: 'Home view definition was not found.' }, 404)
        return
      }
      const payload = await readJsonBody(request)
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}
      const current = homeViewDefinitionRows[definitionIndex]
      const next = {
        ...current,
        name: normalizeOptionalText(record.name) ?? current.name,
        cards: record.cards ? normalizeSmokeHomeViewCards(record.cards) : current.cards,
        global_filters:
          record.global_filters && typeof record.global_filters === 'object' && !Array.isArray(record.global_filters)
            ? { ...(record.global_filters as Record<string, unknown>) }
            : current.global_filters,
        updated_at: assistantRunRecordedAt,
        updated_by: smokeSession.user.user_id,
        version: current.version + 1,
      }
      homeViewDefinitionRows[definitionIndex] = next
      writeJson(response, cloneHomeViewDefinition(next))
      return
    }

    if (homeViewDefinitionMatch && method === 'DELETE') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const definitionId = Number(homeViewDefinitionMatch[1])
      const definitionIndex = homeViewDefinitionRows.findIndex((row) => row.definition_id === definitionId)
      if (definitionIndex >= 0) {
        homeViewDefinitionRows.splice(definitionIndex, 1)
      }
      response.statusCode = 204
      response.end()
      return
    }

    const homeViewResetMatch = url.pathname.match(/^\/home-view-definitions\/(\d+)\/reset$/)
    if (homeViewResetMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const definitionId = Number(homeViewResetMatch[1])
      const definitionIndex = homeViewDefinitionRows.findIndex((row) => row.definition_id === definitionId)
      if (definitionIndex < 0) {
        writeJson(response, { detail: 'Home view definition was not found.' }, 404)
        return
      }
      const current = homeViewDefinitionRows[definitionIndex]
      const next = {
        ...current,
        cards: buildSmokeHomeViewSystemCards(),
        global_filters: {},
        updated_at: assistantRunRecordedAt,
        updated_by: smokeSession.user.user_id,
        version: current.version + 1,
      }
      homeViewDefinitionRows[definitionIndex] = next
      writeJson(response, cloneHomeViewDefinition(next))
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
        show_start_here: smokeSession.showStartHere,
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
        show_start_here: smokeSession.showStartHere,
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

    if (url.pathname === '/auth/logout' && method === 'POST') {
      sessionExpired = true
      writeNoContent(response)
      return
    }

    if (url.pathname === '/assistant/settings' && method === 'GET') {
      writeJson(response, assistantRuntimeSettings)
      return
    }

    if (url.pathname === '/integrations/attio/client-enrichment' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const body = await readJsonBody(request)
      const clientName =
        body && typeof body === 'object' && typeof (body as { client_name?: unknown }).client_name === 'string'
          ? (body as { client_name: string }).client_name
          : ''
      if (clientName.trim().toLowerCase() !== 'hartree') {
        writeJson(response, {
          provider: 'attio_rest_api',
          configured: true,
          client_name: clientName,
          matched: false,
          match_basis: 'none',
          company: null,
          contacts: [],
          deals: [],
          required_scopes: ['object_configuration:read', 'record_permission:read'],
          warnings: ['No Attio company match found for this client.'],
        })
        return
      }
      writeJson(response, {
        provider: 'attio_rest_api',
        configured: true,
        client_name: 'Hartree',
        matched: true,
        match_basis: 'search',
        company: {
          object_slug: 'companies',
          record_id: 'company-hartree',
          label: 'Hartree Partners',
          web_url: 'https://app.attio.com/company-hartree',
          domains: ['hartreepartners.com'],
          description: 'Global energy and commodities firm.',
          status: 'Customer',
        },
        contacts: [
          {
            record_id: 'person-hartree-1',
            name: 'Alex Hartree',
            title: 'Commercial lead',
            email: 'alex.hartree@example.com',
            phone: null,
            web_url: 'https://app.attio.com/person-hartree-1',
          },
        ],
        deals: [
          {
            record_id: 'deal-hartree-1',
            name: 'Hartree Partners (Expansion)',
            stage: 'Won',
            value: null,
            close_date: '2025-05-20',
            web_url: 'https://app.attio.com/deal-hartree-1',
          },
        ],
        required_scopes: ['object_configuration:read', 'record_permission:read'],
        warnings: [],
      })
      return
    }

    if (url.pathname === '/assistant/token-usage' && method === 'GET') {
      const activeAgentBudget = currentAssistantAgent('ops-governor')?.token_budget
      writeJson(response, {
        used_tokens: activeAgentBudget?.used_tokens ?? 0,
        input_tokens: 120,
        output_tokens: 60,
        recorded_run_count: activeAgentBudget && activeAgentBudget.used_tokens > 0 ? 1 : 0,
        managed_agent_tokens: activeAgentBudget?.used_tokens ?? 0,
        unassigned_tokens: 0,
        window_started_at: activeAgentBudget?.window_started_at ?? assistantRunRecordedAt,
        reset_at: activeAgentBudget?.reset_at ?? assistantRunRecordedAt,
      })
      return
    }

    if (url.pathname === '/messages/workspace' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, { conversations: [] })
      return
    }

    if (url.pathname === '/assistant/agents' && method === 'GET') {
      writeJson(
        response,
        assistantAdminAgents
          .map((agent) => currentAssistantAgent(agent.agent_id))
          .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
          .filter((agent) => agent.status === 'ACTIVE'),
      )
      return
    }

    if (url.pathname === '/assistant/profile-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestedStatus = url.searchParams.get('status')
      const limit = Number(url.searchParams.get('limit') ?? '100')
      const offset = Number(url.searchParams.get('offset') ?? '0')
      const filteredRequests = assistantProfileRequestRows.filter(
        (requestRow) =>
          requestRow.requested_by === smokeSession.user.user_id &&
          (!requestedStatus || requestRow.status === requestedStatus),
      )
      writeJson(
        response,
        filteredRequests
          .slice(Math.max(offset, 0), Math.max(offset, 0) + Math.max(1, limit))
          .map(cloneAssistantProfileRequest),
      )
      return
    }

    if (url.pathname === '/assistant/profile-requests' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestPayload = await readJsonBody(request)
      const requestRecord =
        requestPayload && typeof requestPayload === 'object' && !Array.isArray(requestPayload)
          ? (requestPayload as Record<string, unknown>)
          : {}
      const now = '2026-04-11T09:10:00Z'
      const createdRequest: SmokeAssistantProfileRequestRow = {
        request_id: nextAssistantProfileRequestId,
        status: 'REQUESTED',
        request_kind:
          requestRecord.request_kind === 'EDIT_EXISTING' || requestRecord.request_kind === 'NARROW_ACCESS'
            ? requestRecord.request_kind
            : 'NEW_SPECIALIZATION',
        target_agent_id: normalizedReviewText(requestRecord.target_agent_id),
        requested_agent_id: normalizedReviewText(requestRecord.requested_agent_id),
        change_summary: normalizedReviewText(requestRecord.change_summary),
        business_problem: normalizedReviewText(requestRecord.business_problem) ?? 'Smoke change request.',
        proposed_mission: normalizedReviewText(requestRecord.proposed_mission) ?? 'Smoke governed profile update.',
        human_owner_role: normalizedReviewText(requestRecord.human_owner_role) ?? 'Operations Lead',
        requested_workspaces: Array.isArray(requestRecord.requested_workspaces)
          ? requestRecord.requested_workspaces.filter((workspace): workspace is string => typeof workspace === 'string')
          : [],
        work_objects: Array.isArray(requestRecord.work_objects)
          ? requestRecord.work_objects.filter((workObject): workObject is string => typeof workObject === 'string')
          : [],
        requested_inputs_tools: Array.isArray(requestRecord.requested_inputs_tools)
          ? requestRecord.requested_inputs_tools.filter((tool): tool is string => typeof tool === 'string')
          : [],
        requested_action_types: Array.isArray(requestRecord.requested_action_types)
          ? requestRecord.requested_action_types.filter((action): action is string => typeof action === 'string')
          : [],
        requested_skills: Array.isArray(requestRecord.requested_skills)
          ? requestRecord.requested_skills.filter((skill): skill is string => typeof skill === 'string')
          : [],
        expected_outputs: Array.isArray(requestRecord.expected_outputs)
          ? requestRecord.expected_outputs.filter((output): output is string => typeof output === 'string')
          : [],
        requested_authority_ceiling: normalizedReviewText(requestRecord.requested_authority_ceiling) ?? 'DRAFT',
        stop_conditions: Array.isArray(requestRecord.stop_conditions)
          ? requestRecord.stop_conditions.filter((condition): condition is string => typeof condition === 'string')
          : [],
        success_metrics: Array.isArray(requestRecord.success_metrics)
          ? requestRecord.success_metrics.filter((metric): metric is string => typeof metric === 'string')
          : [],
        proposed_eval_cases: Array.isArray(requestRecord.proposed_eval_cases)
          ? requestRecord.proposed_eval_cases.filter((evalCase): evalCase is string => typeof evalCase === 'string')
          : [],
        approval_notes: null,
        rejection_reason: null,
        linked_agent_id: null,
        linked_revision_id: null,
        applied_diff_summary: [],
        requested_at: now,
        requested_by: smokeSession.user.user_id,
        reviewed_at: null,
        reviewed_by: null,
        activated_at: null,
        activated_by: null,
        updated_at: now,
      }
      nextAssistantProfileRequestId += 1
      assistantProfileRequestRows.unshift(createdRequest)
      writeJson(response, cloneAssistantProfileRequest(createdRequest), 201)
      return
    }

    if (url.pathname === '/assistant/conversations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [buildAssistantConversationSummary()])
      return
    }

    const assistantConversationMatch = url.pathname.match(/^\/assistant\/conversations\/(\d+)$/)
    if (assistantConversationMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const conversationId = Number(assistantConversationMatch[1])
      if (conversationId !== assistantConversationId) {
        writeJson(response, { detail: 'Assistant conversation not found.' }, 404)
        return
      }

      writeJson(response, buildAssistantConversation())
      return
    }

    if (url.pathname === '/assistant/runs' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [buildAssistantRunSummary()])
      return
    }

    if (url.pathname === '/assistant/prompt-route-recommendations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, assistantPromptRouteRecommendations)
      return
    }

    const assistantRunMatch = url.pathname.match(/^\/assistant\/runs\/(\d+)$/)
    if (assistantRunMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(assistantRunMatch[1])
      if (runId !== assistantRunId) {
        writeJson(response, { detail: 'Assistant run not found.' }, 404)
        return
      }

      writeJson(response, buildAssistantRun())
      return
    }

    const assistantRunFeedbackMatch = url.pathname.match(/^\/assistant\/runs\/(\d+)\/feedback$/)
    if (assistantRunFeedbackMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(assistantRunFeedbackMatch[1])
      if (runId !== assistantRunId) {
        writeJson(response, { detail: 'Assistant run not found.' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const feedbackPayload = payload as {
        rating?: unknown
        comment?: unknown
      }
      if (feedbackPayload.rating !== 'HELPFUL' && feedbackPayload.rating !== 'NEEDS_WORK') {
        writeJson(response, { detail: 'Unsupported feedback rating.' }, 422)
        return
      }

      const previousFeedback = assistantRunFeedbackByRunId.get(runId)
      const feedback: SmokeAssistantFeedbackRow = {
        feedback_id: previousFeedback?.feedback_id ?? 990,
        run_id: runId,
        conversation_id: assistantConversationId,
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        rating: feedbackPayload.rating,
        comment: normalizeOptionalText(feedbackPayload.comment),
        created_at: previousFeedback?.created_at ?? '2026-04-11T09:12:00Z',
        updated_at: '2026-04-11T09:12:00Z',
      }

      assistantRunFeedbackByRunId.set(runId, feedback)
      writeJson(response, feedback)
      return
    }

    const assistantPromptNavigationOutcomeMatch = url.pathname.match(
      /^\/assistant\/runs\/(\d+)\/prompt-navigation-outcomes$/,
    )
    if (assistantPromptNavigationOutcomeMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      promptNavigationOutcomeRequests.push(record)

      const runId = Number(assistantPromptNavigationOutcomeMatch[1])
      if (runId !== assistantRunId) {
        writeJson(response, { detail: 'Assistant run not found.' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const outcomePayload = payload as {
        outcome?: unknown
        intent_key?: unknown
        target_view?: unknown
        target_label?: unknown
        target_rationale?: unknown
        focus_type?: unknown
        focus_id?: unknown
        focus_label?: unknown
        detail?: unknown
      }
      if (
        outcomePayload.outcome !== 'ACCEPTED' &&
        outcomePayload.outcome !== 'DISMISSED' &&
        outcomePayload.outcome !== 'FAILED'
      ) {
        writeJson(response, { detail: 'Unsupported prompt navigation outcome.' }, 422)
        return
      }

      const intentKey = normalizeOptionalText(outcomePayload.intent_key)
      if (!intentKey) {
        writeJson(response, { detail: 'Prompt navigation intent key is required.' }, 422)
        return
      }

      const outcomeMapKey = `${runId}:${outcomePayload.outcome}:${intentKey}`
      const previousOutcome = assistantPromptNavigationOutcomeRows.get(outcomeMapKey)
      const outcome: SmokeAssistantPromptNavigationOutcomeRow = {
        outcome_id: previousOutcome?.outcome_id ?? 1200 + assistantPromptNavigationOutcomeRows.size + 1,
        run_id: runId,
        conversation_id: assistantConversationId,
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        surface: 'PROMPT_HOME',
        outcome: outcomePayload.outcome,
        intent_key: intentKey,
        target_view: normalizeOptionalText(outcomePayload.target_view),
        target_label: normalizeOptionalText(outcomePayload.target_label),
        target_rationale: normalizeOptionalText(outcomePayload.target_rationale),
        focus_type: normalizeOptionalText(outcomePayload.focus_type),
        focus_id: normalizeOptionalText(outcomePayload.focus_id),
        focus_label: normalizeOptionalText(outcomePayload.focus_label),
        detail: normalizeOptionalText(outcomePayload.detail),
        created_at: previousOutcome?.created_at ?? '2026-04-11T09:12:00Z',
        updated_at: '2026-04-11T09:12:00Z',
      }

      assistantPromptNavigationOutcomeRows.set(outcomeMapKey, outcome)
      writeJson(response, outcome)
      return
    }

    if (url.pathname === '/assistant/prompt-navigation-outcomes' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      promptNavigationOutcomeRequests.push(record)

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const outcomePayload = payload as {
        outcome?: unknown
        intent_key?: unknown
        target_view?: unknown
        target_label?: unknown
        target_rationale?: unknown
        focus_type?: unknown
        focus_id?: unknown
        focus_label?: unknown
        detail?: unknown
      }
      if (
        outcomePayload.outcome !== 'ACCEPTED' &&
        outcomePayload.outcome !== 'DISMISSED' &&
        outcomePayload.outcome !== 'FAILED'
      ) {
        writeJson(response, { detail: 'Unsupported prompt navigation outcome.' }, 422)
        return
      }

      const intentKey = normalizeOptionalText(outcomePayload.intent_key)
      if (!intentKey) {
        writeJson(response, { detail: 'Prompt navigation intent key is required.' }, 422)
        return
      }

      const outcome: SmokeAssistantPromptNavigationOutcomeRow = {
        outcome_id: 1200 + assistantPromptNavigationOutcomeRows.size + 1,
        run_id: null,
        conversation_id: null,
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        surface: 'PROMPT_HOME',
        outcome: outcomePayload.outcome,
        intent_key: intentKey,
        target_view: normalizeOptionalText(outcomePayload.target_view),
        target_label: normalizeOptionalText(outcomePayload.target_label),
        target_rationale: normalizeOptionalText(outcomePayload.target_rationale),
        focus_type: normalizeOptionalText(outcomePayload.focus_type),
        focus_id: normalizeOptionalText(outcomePayload.focus_id),
        focus_label: normalizeOptionalText(outcomePayload.focus_label),
        detail: normalizeOptionalText(outcomePayload.detail),
        created_at: '2026-04-11T09:12:00Z',
        updated_at: '2026-04-11T09:12:00Z',
      }

      assistantPromptNavigationOutcomeRows.set(`standalone:${outcome.outcome_id}`, outcome)
      writeJson(response, outcome)
      return
    }

    if (url.pathname === '/assistant/context' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const requestedAgentId = normalizeOptionalText(payload.agent_id)
      const previewAgent = requestedAgentId ? currentAssistantAgent(requestedAgentId) : null
      const previewSections = [
        {
          key: 'system-mission',
          title: 'System Mission',
          source: 'system',
          scope: 'SYSTEM',
          kind: 'IMMUTABLE',
          freshness: 'STATIC',
          owner: 'Platform',
          contract_key: 'assistant-prompt-foundation',
          contract_version: 1,
          content: 'Answer with grounded operational context and stage reviewable actions only.',
        },
        {
          key: 'workspace',
          title: 'Admin Workspace',
          source: 'workspace',
          scope: 'REQUEST',
          kind: 'GENERATED',
          freshness: 'REQUEST',
          owner: 'Application Shell',
          content: 'Admin workspace smoke context.',
        },
        ...(previewAgent
          ? [
              {
                key: 'managed-agent',
                title: `${previewAgent.name} profile`,
                source: 'agent',
                scope: 'AGENT',
                kind: 'CONFIGURABLE',
                freshness: 'STATIC',
                owner: previewAgent.human_owner_role ?? 'Operations Lead',
                owner_reference: previewAgent.agent_id,
                contract_key: 'assistant-agent-profile',
                contract_version: previewAgent.version,
                content: [
                  `role_key: ${previewAgent.role_key ?? 'none'}`,
                  `profile_kind: ${previewAgent.profile_kind}`,
                  `authority: ${previewAgent.authority_ceiling ?? 'none'}`,
                  `skills: ${previewAgent.skills.join(', ') || 'none'}`,
                ].join('\n'),
              },
            ]
          : []),
        {
          key: 'data-inventory',
          title: 'Live Data Inventory',
          source: 'data',
          scope: 'RUNTIME',
          kind: 'GENERATED',
          freshness: 'LIVE',
          uses_fallback: true,
          content: 'Smoke inventory uses deterministic fixture counts.',
        },
      ]

      writeJson(response, {
        agent_id: previewAgent?.agent_id ?? null,
        agent_name: previewAgent?.name ?? null,
        agent_role_key: previewAgent?.role_key ?? null,
        agent_profile_kind: previewAgent?.profile_kind ?? null,
        provider: 'openai',
        model: 'gpt-5.4',
        generated_at: assistantRunRecordedAt,
        warnings: [],
        sections: previewSections,
        rendered_system_prompt: 'Answer with grounded operational context and stage reviewable actions only.',
      })
      return
    }

    if (url.pathname === '/assistant/respond' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const prompt = latestUserPromptFromPayload(payload)
      const responseContent = buildAssistantResponseContentForPrompt(prompt)

      writeJson(response, {
        ...buildAssistantResponseMetadata(prompt),
        message: {
          role: 'assistant',
          content: responseContent,
        },
      })
      return
    }

    if (url.pathname === '/assistant/respond/stream' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const prompt = latestUserPromptFromPayload(payload)
      const responseContent = buildAssistantResponseContentForPrompt(prompt)

      const metadata = buildAssistantResponseMetadata(prompt)
      writeSse(response, [
        {
          event: 'conversation',
          data: {
            conversation_id: assistantConversationId,
            updated_at: assistantRunRecordedAt,
          },
        },
        {
          event: 'assistant.metadata',
          data: metadata,
        },
        {
          event: 'assistant.delta',
          data: {
            delta: responseContent,
          },
        },
        {
          event: 'assistant.complete',
          data: metadata,
        },
      ])
      return
    }

    if (url.pathname === '/assistant/action-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestedStatus = normalizeOptionalText(url.searchParams.get('status'))
      const limitParam = Number(url.searchParams.get('limit') ?? '')
      const offsetParam = Number(url.searchParams.get('offset') ?? '')
      const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : assistantActionRequestRows.length

      let filteredRequests = assistantActionRequestRows
      if (requestedStatus) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.status === requestedStatus)
      }

      writeJson(
        response,
        filteredRequests.slice(offset, offset + limit).map(cloneAssistantActionRequest),
      )
      return
    }

    if (url.pathname === '/admin/assistant/agents' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(
        response,
        assistantAdminAgents
          .map((agent) => currentAssistantAgent(agent.agent_id))
          .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent)),
      )
      return
    }

    const draftAgentContextPreviewMatch = url.pathname.match(
      /^\/admin\/assistant\/agents\/([^/]+)\/context-preview$/,
    )
    if (draftAgentContextPreviewMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const agentId = decodeURIComponent(draftAgentContextPreviewMatch[1] ?? '')
      const currentAgent = currentAssistantAgent(agentId)
      if (!currentAgent) {
        writeJson(response, { detail: 'Assistant agent not found' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}
      const arrayOrCurrent = <T extends string>(value: unknown, current: T[]): T[] =>
        Array.isArray(value) ? value.map((entry) => String(entry)) as T[] : [...current]
      const optionalTextOrCurrent = (value: unknown, current: string | null) =>
        value === undefined ? current : normalizeOptionalText(value)
      const draftAgent = {
        ...currentAgent,
        name: normalizedReviewText(record.name) ?? currentAgent.name,
        description: normalizedReviewText(record.description) ?? currentAgent.description,
        status: normalizedReviewText(record.status) ?? currentAgent.status,
        scope: normalizedReviewText(record.scope) ?? currentAgent.scope,
        provider: optionalTextOrCurrent(record.provider, currentAgent.provider),
        model: optionalTextOrCurrent(record.model, currentAgent.model),
        role_key: optionalTextOrCurrent(record.role_key, currentAgent.role_key),
        profile_kind: normalizedReviewText(record.profile_kind) ?? currentAgent.profile_kind,
        specialization_summary: optionalTextOrCurrent(
          record.specialization_summary,
          currentAgent.specialization_summary,
        ),
        human_owner_role: optionalTextOrCurrent(record.human_owner_role, currentAgent.human_owner_role),
        authority_ceiling: optionalTextOrCurrent(record.authority_ceiling, currentAgent.authority_ceiling),
        activation_notes: optionalTextOrCurrent(record.activation_notes, currentAgent.activation_notes),
        orchestration_pattern:
          normalizedReviewText(record.orchestration_pattern) ?? currentAgent.orchestration_pattern,
        parent_agent_id: optionalTextOrCurrent(record.parent_agent_id, currentAgent.parent_agent_id),
        managed_agent_ids: arrayOrCurrent(record.managed_agent_ids, currentAgent.managed_agent_ids),
        delegation_guidance: optionalTextOrCurrent(record.delegation_guidance, currentAgent.delegation_guidance),
        profile_request_id:
          record.profile_request_id === undefined
            ? currentAgent.profile_request_id
            : normalizeOptionalNumber(record.profile_request_id),
        allowed_workspaces: arrayOrCurrent(record.allowed_workspaces, currentAgent.allowed_workspaces),
        capabilities: arrayOrCurrent(record.capabilities, currentAgent.capabilities),
        skills: arrayOrCurrent(record.skills, currentAgent.skills),
        allowed_tools: arrayOrCurrent(record.allowed_tools, currentAgent.allowed_tools),
        allowed_action_types: arrayOrCurrent(record.allowed_action_types, currentAgent.allowed_action_types),
        daily_token_allocation:
          record.daily_token_allocation === undefined
            ? currentAgent.daily_token_allocation
            : normalizeOptionalNumber(record.daily_token_allocation),
        system_prompt: normalizedReviewText(record.system_prompt) ?? currentAgent.system_prompt,
        has_unpublished_revision: true,
      }
      const previewSections = [
        {
          key: 'system-mission',
          title: 'System Mission',
          source: 'system',
          scope: 'SYSTEM',
          kind: 'IMMUTABLE',
          freshness: 'STATIC',
          owner: 'Platform',
          contract_key: 'assistant-prompt-foundation',
          contract_version: 1,
          content: 'Answer with grounded operational context and stage reviewable actions only.',
        },
        {
          key: 'workspace',
          title: 'Admin Workspace',
          source: 'workspace',
          scope: 'REQUEST',
          kind: 'GENERATED',
          freshness: 'REQUEST',
          owner: 'Application Shell',
          content: 'Admin workspace smoke context.',
        },
        {
          key: 'managed-agent',
          title: `${draftAgent.name} draft profile`,
          source: 'agent',
          scope: 'AGENT',
          kind: 'CONFIGURABLE',
          freshness: 'REQUEST',
          owner: draftAgent.human_owner_role ?? 'Operations Lead',
          owner_reference: draftAgent.agent_id,
          contract_key: 'assistant-agent-profile',
          contract_version: Number(draftAgent.version ?? 0) + 1,
          content: [
            `role_key: ${draftAgent.role_key ?? 'none'}`,
            `profile_kind: ${draftAgent.profile_kind}`,
            `authority_ceiling: ${draftAgent.authority_ceiling ?? 'none'}`,
            `skills: ${draftAgent.skills.join(', ') || 'none'}`,
            `allowed_tools: ${draftAgent.allowed_tools.join(', ') || 'none'}`,
            `allowed_actions: ${draftAgent.allowed_action_types.join(', ') || 'none'}`,
            `instructions:\n${draftAgent.system_prompt}`,
          ].join('\n'),
        },
        {
          key: 'application-context',
          title: 'Application Context',
          source: 'application',
          scope: 'REQUEST',
          kind: 'GENERATED',
          freshness: 'REQUEST',
          owner: 'request-payload',
          content: 'Admin managed-agent draft construction preview.',
        },
        {
          key: 'data-inventory',
          title: 'Live Data Inventory',
          source: 'data',
          scope: 'RUNTIME',
          kind: 'GENERATED',
          freshness: 'LIVE',
          uses_fallback: true,
          content: 'Smoke inventory uses deterministic fixture counts.',
        },
      ]

      writeJson(response, {
        agent_id: draftAgent.agent_id,
        agent_name: draftAgent.name,
        agent_role_key: draftAgent.role_key,
        agent_profile_kind: draftAgent.profile_kind,
        provider: draftAgent.provider ?? 'openai',
        model: draftAgent.model ?? 'gpt-5.4',
        generated_at: assistantRunRecordedAt,
        warnings: [
          'Draft preview is built from an unsaved admin agent payload; save the agent to make these construction changes runtime-active.',
        ],
        sections: previewSections,
        rendered_system_prompt: previewSections.map((section) => `${section.title}:\n${section.content}`).join('\n\n'),
      })
      return
    }

    const updateAgentMatch = url.pathname.match(/^\/admin\/assistant\/agents\/([^/]+)$/)
    if (updateAgentMatch && method === 'PUT') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const agentId = decodeURIComponent(updateAgentMatch[1] ?? '')
      const currentAgent = currentAssistantAgent(agentId)
      if (!currentAgent) {
        writeJson(response, { detail: 'Assistant agent not found' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}
      const nextRevisionId = nextAssistantAgentRevisionId
      nextAssistantAgentRevisionId += 1
      const now = '2026-04-11T09:12:45Z'
      const nextStatus = normalizedReviewText(record.status) ?? currentAgent.status
      const updatedBy = normalizedReviewText(record.updated_by) ?? smokeSession.user.user_id
      const arrayOrCurrent = <T extends string>(value: unknown, current: T[]): T[] =>
        Array.isArray(value) ? value.map((entry) => String(entry)) as T[] : [...current]

      const updatedAgent = {
        ...currentAgent,
        name: normalizedReviewText(record.name) ?? currentAgent.name,
        description: normalizedReviewText(record.description) ?? currentAgent.description,
        status: nextStatus,
        scope: normalizedReviewText(record.scope) ?? currentAgent.scope,
        provider: normalizeOptionalText(record.provider),
        model: normalizeOptionalText(record.model),
        role_key: normalizeOptionalText(record.role_key),
        profile_kind: normalizedReviewText(record.profile_kind) ?? currentAgent.profile_kind,
        specialization_summary: normalizeOptionalText(record.specialization_summary),
        human_owner_role: normalizeOptionalText(record.human_owner_role),
        authority_ceiling: normalizeOptionalText(record.authority_ceiling),
        activation_notes: normalizeOptionalText(record.activation_notes),
        orchestration_pattern: normalizedReviewText(record.orchestration_pattern) ?? currentAgent.orchestration_pattern,
        parent_agent_id: normalizeOptionalText(record.parent_agent_id),
        managed_agent_ids: arrayOrCurrent(record.managed_agent_ids, currentAgent.managed_agent_ids),
        delegation_guidance: normalizeOptionalText(record.delegation_guidance),
        profile_request_id: normalizeOptionalNumber(record.profile_request_id),
        allowed_workspaces: arrayOrCurrent(record.allowed_workspaces, currentAgent.allowed_workspaces),
        capabilities: arrayOrCurrent(record.capabilities, currentAgent.capabilities),
        skills: arrayOrCurrent(record.skills, currentAgent.skills),
        allowed_tools: arrayOrCurrent(record.allowed_tools, currentAgent.allowed_tools),
        allowed_action_types: arrayOrCurrent(record.allowed_action_types, currentAgent.allowed_action_types),
        daily_token_allocation: normalizeOptionalNumber(record.daily_token_allocation),
        system_prompt: normalizedReviewText(record.system_prompt) ?? currentAgent.system_prompt,
        updated_at: now,
        updated_by: updatedBy,
        version: Number(currentAgent.version ?? 0) + 1,
        latest_revision_id: nextRevisionId,
        published_revision_id: nextStatus === 'DRAFT' ? currentAgent.published_revision_id ?? null : nextRevisionId,
        published_at: nextStatus === 'DRAFT' ? currentAgent.published_at ?? null : now,
        published_by: nextStatus === 'DRAFT' ? currentAgent.published_by ?? null : updatedBy,
        has_unpublished_revision: nextStatus === 'DRAFT',
      }
      assistantAgentOverrides.set(agentId, updatedAgent)
      const profileRequestId = normalizeOptionalNumber(record.profile_request_id)
      if (profileRequestId !== null && updatedAgent.published_revision_id) {
        const profileRequestIndex = assistantProfileRequestRows.findIndex(
          (requestRow) => requestRow.request_id === profileRequestId,
        )
        if (profileRequestIndex >= 0) {
          assistantProfileRequestRows[profileRequestIndex] = {
            ...assistantProfileRequestRows[profileRequestIndex],
            applied_diff_summary: buildSmokeProfileRequestDiff(currentAgent, updatedAgent),
            linked_agent_id: agentId,
          }
        }
      }
      writeJson(response, cloneAssistantAgent(updatedAgent))
      return
    }

    const agentRevisionsMatch = url.pathname.match(/^\/admin\/assistant\/agents\/([^/]+)\/revisions$/)
    if (agentRevisionsMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/assistant/role-archetypes' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(
        response,
        assistantRoleArchetypes.map((role) => ({
          ...role,
          mission: [...role.mission],
          allowed_workspaces: [...role.allowed_workspaces],
          work_objects: [...role.work_objects],
          capability_ceiling: [...role.capability_ceiling],
          skills: [...role.skills],
          default_tools: [...role.default_tools],
          maximum_action_types: [...role.maximum_action_types],
          approval_rules: [...role.approval_rules],
          stop_conditions: [...role.stop_conditions],
          success_metrics: [...role.success_metrics],
          required_eval_coverage: [...role.required_eval_coverage],
          eval_gate: role.eval_gate
            ? {
                ...role.eval_gate,
                required_cases: [...role.eval_gate.required_cases],
                covered_cases: [...role.eval_gate.covered_cases],
                missing_cases: [...role.eval_gate.missing_cases],
                notes: [...role.eval_gate.notes],
              }
            : null,
          base_prompt_guidance: [...role.base_prompt_guidance],
          recommended_parent_role_keys: [...role.recommended_parent_role_keys],
          recommended_managed_role_keys: [...role.recommended_managed_role_keys],
          delegation_guidance: [...role.delegation_guidance],
          current_profile_ids: [...role.current_profile_ids],
        })),
      )
      return
    }

    if (url.pathname === '/admin/assistant/profile-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestedStatus = url.searchParams.get('status')
      const limit = Number(url.searchParams.get('limit') ?? '100')
      const offset = Number(url.searchParams.get('offset') ?? '0')
      const filteredRequests = requestedStatus
        ? assistantProfileRequestRows.filter((requestRow) => requestRow.status === requestedStatus)
        : assistantProfileRequestRows
      writeJson(
        response,
        filteredRequests
          .slice(Math.max(offset, 0), Math.max(offset, 0) + Math.max(1, limit))
          .map(cloneAssistantProfileRequest),
      )
      return
    }

    const approveProfileRequestMatch = url.pathname.match(/^\/admin\/assistant\/profile-requests\/(\d+)\/approve$/)
    if (approveProfileRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestId = Number(approveProfileRequestMatch[1])
      const profileRequestIndex = assistantProfileRequestRows.findIndex(
        (requestRow) => requestRow.request_id === requestId,
      )
      if (profileRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant agent profile request not found.' }, 404)
        return
      }

      const currentRequest = assistantProfileRequestRows[profileRequestIndex]
      if (currentRequest.status !== 'REQUESTED' && currentRequest.status !== 'APPROVED') {
        writeJson(response, { detail: `Profile request ${requestId} cannot be approved from ${currentRequest.status}.` }, 409)
        return
      }

      const decisionPayload = await readJsonBody(request)
      const decisionRecord =
        decisionPayload && typeof decisionPayload === 'object' && !Array.isArray(decisionPayload)
          ? (decisionPayload as Record<string, unknown>)
          : {}
      const now = '2026-04-11T09:12:00Z'
      const updatedRequest: SmokeAssistantProfileRequestRow = {
        ...currentRequest,
        status: 'APPROVED',
        approval_notes: normalizedReviewText(decisionRecord.approval_notes) ?? 'Approved through smoke review.',
        rejection_reason: null,
        reviewed_at: now,
        reviewed_by: normalizedReviewText(decisionRecord.reviewed_by) ?? smokeSession.user.user_id,
        updated_at: now,
      }
      assistantProfileRequestRows[profileRequestIndex] = updatedRequest
      writeJson(response, cloneAssistantProfileRequest(updatedRequest))
      return
    }

    const activateProfileRequestMatch = url.pathname.match(/^\/admin\/assistant\/profile-requests\/(\d+)\/activate$/)
    if (activateProfileRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestId = Number(activateProfileRequestMatch[1])
      const profileRequestIndex = assistantProfileRequestRows.findIndex(
        (requestRow) => requestRow.request_id === requestId,
      )
      if (profileRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant agent profile request not found.' }, 404)
        return
      }

      const currentRequest = assistantProfileRequestRows[profileRequestIndex]
      if (currentRequest.status !== 'APPROVED' && currentRequest.status !== 'ACTIVATED') {
        writeJson(response, { detail: `Profile request ${requestId} must be approved before activation.` }, 409)
        return
      }

      const activationPayload = await readJsonBody(request)
      const activationRecord =
        activationPayload && typeof activationPayload === 'object' && !Array.isArray(activationPayload)
          ? (activationPayload as Record<string, unknown>)
          : {}
      const linkedAgentId =
        normalizedReviewText(activationRecord.linked_agent_id) ??
        currentRequest.linked_agent_id ??
        currentRequest.target_agent_id
      const linkedRevisionId = normalizeOptionalNumber(activationRecord.linked_revision_id)
      const linkedAgent = linkedAgentId ? currentAssistantAgent(linkedAgentId) : null
      if (!linkedAgentId || !linkedAgent || !linkedRevisionId) {
        writeJson(response, { detail: 'Profile request activation requires a linked agent and published revision.' }, 422)
        return
      }
      if (
        linkedAgent.profile_request_id !== currentRequest.request_id ||
        linkedAgent.published_revision_id !== linkedRevisionId
      ) {
        writeJson(
          response,
          { detail: 'Linked agent revision must carry the approved profile request before activation.' },
          422,
        )
        return
      }
      const now = '2026-04-11T09:13:00Z'
      const fixtureLinkedAgent = assistantAdminAgents.find((agent) => agent.agent_id === linkedAgentId)
      const updatedRequest: SmokeAssistantProfileRequestRow = {
        ...currentRequest,
        status: 'ACTIVATED',
        linked_agent_id: linkedAgentId,
        linked_revision_id: linkedRevisionId,
        applied_diff_summary:
          currentRequest.applied_diff_summary.length > 0
            ? [...currentRequest.applied_diff_summary]
            : fixtureLinkedAgent
              ? buildSmokeProfileRequestDiff(cloneAssistantAgent(fixtureLinkedAgent), linkedAgent)
              : [],
        activated_at: now,
        activated_by: normalizedReviewText(activationRecord.activated_by) ?? smokeSession.user.user_id,
        updated_at: now,
      }
      assistantProfileRequestRows[profileRequestIndex] = updatedRequest
      writeJson(response, cloneAssistantProfileRequest(updatedRequest))
      return
    }

    const rejectProfileRequestMatch = url.pathname.match(/^\/admin\/assistant\/profile-requests\/(\d+)\/reject$/)
    if (rejectProfileRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestId = Number(rejectProfileRequestMatch[1])
      const profileRequestIndex = assistantProfileRequestRows.findIndex(
        (requestRow) => requestRow.request_id === requestId,
      )
      if (profileRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant agent profile request not found.' }, 404)
        return
      }

      const currentRequest = assistantProfileRequestRows[profileRequestIndex]
      if (currentRequest.status === 'ACTIVATED' || currentRequest.status === 'REJECTED') {
        writeJson(response, { detail: `Profile request ${requestId} cannot be rejected from ${currentRequest.status}.` }, 409)
        return
      }

      const decisionPayload = await readJsonBody(request)
      const decisionRecord =
        decisionPayload && typeof decisionPayload === 'object' && !Array.isArray(decisionPayload)
          ? (decisionPayload as Record<string, unknown>)
          : {}
      const now = '2026-04-11T09:12:30Z'
      const updatedRequest: SmokeAssistantProfileRequestRow = {
        ...currentRequest,
        status: 'REJECTED',
        approval_notes: null,
        rejection_reason: normalizedReviewText(decisionRecord.rejection_reason) ?? 'Rejected through smoke review.',
        reviewed_at: now,
        reviewed_by: normalizedReviewText(decisionRecord.reviewed_by) ?? smokeSession.user.user_id,
        updated_at: now,
      }
      assistantProfileRequestRows[profileRequestIndex] = updatedRequest
      writeJson(response, cloneAssistantProfileRequest(updatedRequest))
      return
    }

    if (url.pathname === '/admin/assistant/agent-evals' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/assistant/control-tower/summary' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildAssistantControlTowerSummary())
      return
    }

    if (url.pathname === '/admin/assistant/agent-work-packages' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildAssistantAgentWorkPackages())
      return
    }

    const assistantAuditTraceMatch = url.pathname.match(/^\/admin\/assistant\/runs\/(\d+)\/audit-trace$/)
    if (assistantAuditTraceMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(assistantAuditTraceMatch[1])
      const traceActionRequests = assistantActionRequestRows.filter((requestRow) => requestRow.run_id === runId)
      if (traceActionRequests.length === 0) {
        writeJson(response, { detail: 'Assistant run not found' }, 404)
        return
      }

      const primaryRequest = traceActionRequests[0]
      const mutationEvents = traceActionRequests.flatMap((requestRow) => {
        const eventId =
          requestRow.result && typeof requestRow.result.event_id === 'string' ? requestRow.result.event_id : null
        return eventId
          ? [
              {
                event_id: eventId,
                aggregate_type: 'trade',
                aggregate_id:
                  typeof requestRow.result?.trade_id === 'string' ? requestRow.result.trade_id : 'T-AMEND-100',
                event_type: 'TradeCancelled',
                occurred_at: requestRow.decided_at ?? '2026-04-11T09:05:00Z',
                recorded_at: requestRow.decided_at ?? '2026-04-11T09:05:00Z',
                actor_id: requestRow.decided_by,
                correlation_id: `assistant-action-${requestRow.action_request_id}`,
                causation_id: `assistant-action-request:${requestRow.action_request_id}`,
                payload: {
                  assistant_action_request_id: requestRow.action_request_id,
                  assistant_run_id: requestRow.run_id,
                  status: 'CANCELLED',
                },
              },
            ]
          : []
      })
      const actionTraces = traceActionRequests.map((requestRow) => ({
        action_request: requestRow,
        mutation_events: mutationEvents.filter(
          (event) => event.causation_id === `assistant-action-request:${requestRow.action_request_id}`,
        ),
      }))
      const timeline = [
        {
          entry_type: 'run_started',
          occurred_at: primaryRequest.created_at,
          title: 'Run started',
          summary: 'Cancel the selected trade.',
          status: 'COMPLETED',
          metadata: {
            run_id: runId,
            agent_id: primaryRequest.agent_id,
            workspace: primaryRequest.workspace,
          },
        },
        {
          entry_type: 'action_requested',
          occurred_at: primaryRequest.created_at,
          title: primaryRequest.summary,
          summary: primaryRequest.description,
          status: primaryRequest.status,
          metadata: {
            action_request_id: primaryRequest.action_request_id,
            action_type: primaryRequest.action_type,
            payload: primaryRequest.payload,
          },
        },
        {
          entry_type: 'tool_call',
          occurred_at: primaryRequest.created_at,
          title: 'Tool call: get_trade_by_id',
          summary: 'Loaded trade T-AMEND-100 for governance review.',
          status: null,
          metadata: {
            tool_name: 'get_trade_by_id',
            arguments: { trade_id: 'T-AMEND-100' },
            record_count: 1,
          },
        },
        ...traceActionRequests
          .filter((requestRow) => requestRow.decided_at !== null)
          .map((requestRow) => ({
            entry_type: 'decision',
            occurred_at: requestRow.decided_at,
            title: `Decision: ${requestRow.status}`,
            summary: `${requestRow.decided_by ?? 'ops_admin'} decided action request #${requestRow.action_request_id}.`,
            status: requestRow.status,
            metadata: {
              action_request_id: requestRow.action_request_id,
              result: requestRow.result ?? {},
            },
          })),
        ...mutationEvents.map((event) => ({
          entry_type: 'mutation',
          occurred_at: event.occurred_at,
          title: `Mutation event: ${event.event_type}`,
          summary: `${event.aggregate_type} ${event.aggregate_id}`,
          status: null,
          metadata: {
            event_id: event.event_id,
            payload: event.payload,
          },
        })),
        {
          entry_type: 'run_completed',
          occurred_at: primaryRequest.created_at,
          title: 'Run completed',
          summary: 'Assistant run completed.',
          status: 'COMPLETED',
          metadata: {
            action_request_count: traceActionRequests.length,
            tool_call_count: 1,
          },
        },
      ]

      writeJson(response, {
        run: {
          conversation_id: 601,
          run_id: runId,
          status: 'COMPLETED',
          created_at: primaryRequest.created_at,
          completed_at: primaryRequest.created_at,
          user_id: primaryRequest.user_id,
          user_role: 'TRADER',
          workspace: primaryRequest.workspace,
          agent_id: primaryRequest.agent_id,
          agent_name: primaryRequest.agent_name,
          provider: 'openai',
          model: 'gpt-5.4',
          use_live_tools: true,
          warning_count: 0,
          tool_call_count: 1,
          input_tokens: 120,
          output_tokens: 60,
          latest_user_message: 'Cancel the selected trade.',
          assistant_message: primaryRequest.description,
          error_detail: null,
          request_messages: [{ role: 'user', content: 'Cancel the selected trade.' }],
          application_context: 'Selected trade T-AMEND-100.',
          prompt_sections: [],
          rendered_system_prompt: 'Escalate cross-user trade actions into an approval inbox before execution.',
          warnings: [],
          tool_calls: [
            {
              tool_name: 'get_trade_by_id',
              summary: 'Loaded trade T-AMEND-100 for governance review.',
              arguments: { trade_id: 'T-AMEND-100' },
              record_count: 1,
            },
          ],
        },
        action_requests: actionTraces,
        timeline,
        mutation_event_count: mutationEvents.length,
      })
      return
    }

    if (url.pathname === '/admin/assistant/action-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const status = url.searchParams.get('status')?.trim().toUpperCase() ?? ''
      const actionType = url.searchParams.get('action_type')?.trim() ?? ''
      const agentId = url.searchParams.get('agent_id')?.trim().toLowerCase() ?? ''
      const userId = url.searchParams.get('user_id')?.trim() ?? ''
      const decidedBy = url.searchParams.get('decided_by')?.trim() ?? ''
      const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
      const createdAfter = Date.parse(url.searchParams.get('created_after') ?? '')
      const createdBefore = Date.parse(url.searchParams.get('created_before') ?? '')
      const decidedAfter = Date.parse(url.searchParams.get('decided_after') ?? '')
      const decidedBefore = Date.parse(url.searchParams.get('decided_before') ?? '')
      const limit = Number(url.searchParams.get('limit') ?? '')
      const offset = Number(url.searchParams.get('offset') ?? '')

      let filteredRequests = assistantActionRequestRows
      if (status) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.status === status)
      }
      if (actionType) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.action_type === actionType)
      }
      if (agentId) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.agent_id?.toLowerCase() === agentId)
      }
      if (userId) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.user_id === userId)
      }
      if (decidedBy) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.decided_by === decidedBy)
      }
      if (Number.isFinite(createdAfter)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => Date.parse(requestRow.created_at) >= createdAfter,
        )
      }
      if (Number.isFinite(createdBefore)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => Date.parse(requestRow.created_at) <= createdBefore,
        )
      }
      if (Number.isFinite(decidedAfter)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => requestRow.decided_at !== null && Date.parse(requestRow.decided_at) >= decidedAfter,
        )
      }
      if (Number.isFinite(decidedBefore)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => requestRow.decided_at !== null && Date.parse(requestRow.decided_at) <= decidedBefore,
        )
      }
      if (search) {
        filteredRequests = filteredRequests.filter((requestRow) =>
          [
            requestRow.summary,
            requestRow.description,
            requestRow.user_id,
            requestRow.agent_id,
            requestRow.agent_name,
            requestRow.decided_by,
            requestRow.action_type,
          ].some((value) => String(value ?? '').toLowerCase().includes(search)),
        )
      }

      const normalizedOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
      const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : null
      const pagedRequests =
        normalizedLimit === null
          ? filteredRequests.slice(normalizedOffset)
          : filteredRequests.slice(normalizedOffset, normalizedOffset + normalizedLimit)

      const decidedRequests = filteredRequests.filter((requestRow) => requestRow.decided_at !== null)
      const totalDecisionSeconds = decidedRequests.reduce((total, requestRow) => {
        const createdAt = Date.parse(requestRow.created_at)
        const decidedAt = Date.parse(requestRow.decided_at ?? '')
        return Number.isFinite(createdAt) && Number.isFinite(decidedAt)
          ? total + Math.max((decidedAt - createdAt) / 1000, 0)
          : total
      }, 0)
      const summary = {
        total_count: filteredRequests.length,
        pending_count: filteredRequests.filter((requestRow) => requestRow.status === 'PENDING').length,
        executed_count: filteredRequests.filter((requestRow) => requestRow.status === 'EXECUTED').length,
        rejected_count: filteredRequests.filter((requestRow) => requestRow.status === 'REJECTED').length,
        failed_count: filteredRequests.filter((requestRow) => requestRow.status === 'FAILED').length,
        correction_count: filteredRequests.filter(
          (requestRow) => requestRow.review_outcome === 'APPROVED_WITH_CORRECTIONS',
        ).length,
        avg_decision_seconds:
          decidedRequests.length > 0 ? totalDecisionSeconds / decidedRequests.length : null,
      }

      writeJson(response, {
        items: pagedRequests,
        total_count: filteredRequests.length,
        limit: normalizedLimit ?? filteredRequests.length,
        offset: normalizedOffset,
        has_more: normalizedOffset + pagedRequests.length < filteredRequests.length,
        summary,
      })
      return
    }

    if (url.pathname === '/admin/assistant/outcome-metrics' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildAssistantOutcomeMetrics())
      return
    }

    if (url.pathname === '/users' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, userAccounts)
      return
    }

    if (url.pathname === '/admin/roadmap' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, adminRoadmapDocument)
      return
    }

    if (url.pathname === '/admin/data/projection-monitoring' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, projectionMonitoringAdminRecord)
      return
    }

    if (url.pathname === '/admin/data/assistant-agents/seed' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      const requestedBy =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? normalizeOptionalText((payload as Record<string, unknown>).requested_by) ?? smokeSession.user.user_id
          : smokeSession.user.user_id
      const seededAgentIds = assistantRoleArchetypes.flatMap((role) => role.current_profile_ids)
      writeJson(response, {
        requested_by: requestedBy,
        total_profiles: seededAgentIds.length,
        total_templates: seededAgentIds.length,
        created_count: 0,
        updated_count: seededAgentIds.length,
        agent_ids: seededAgentIds,
      })
      return
    }

    if (url.pathname === '/admin/codex/settings' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, codexTaskSettings)
      return
    }

    if (url.pathname === '/admin/codex/tasks' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [...codexTasks])
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

    if (url.pathname === '/admin/external-data/price-sources' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [
        {
          id: 1,
          price_index_code: 'HH_IFERC',
          price_index_name: 'Henry Hub IFERC',
          commodity_code: 'HENRY_HUB_GAS',
          quote_type: 'PHYSICAL',
          market: 'PHYSICAL',
          location_code: 'HENRY_HUB',
          price_unit_code: 'USD/MMBTU',
          price_currency_code: 'USD',
          price_index_is_active: true,
          provider: 'ICE',
          dataset_code: 'SMOKE',
          series_id: 'HH_IFERC',
          frequency: 'daily',
          source_unit: 'USD/MMBTU',
          source_currency_code: 'USD',
          transform_rule: null,
          is_active: true,
          review_status: 'current',
          provider_health_status: 'healthy',
          latest_run_status: 'success',
          latest_run_id: 1,
          last_success_at: '2026-04-11T00:00:00Z',
          provider_error_summary: null,
          latest_observation_date: '2026-04-11',
          latest_value: 3.21,
          latest_unit_code: 'USD/MMBTU',
          latest_currency_code: 'USD',
          latest_source_revision: null,
          latest_downloaded_at: '2026-04-11T00:00:00Z',
          latest_observation_run_id: 1,
          created_at: '2026-04-11T00:00:00Z',
          updated_at: '2026-04-11T00:00:00Z',
          version: 1,
        },
      ])
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

      writeJson(response, weatherLocations)
      return
    }

    if (url.pathname === '/admin/weather/sync/status' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, weatherSyncStatus)
      return
    }

    if (url.pathname === '/weather/locations' && method === 'GET') {
      writeJson(response, weatherLocations)
      return
    }

    if (url.pathname === '/weather/sync/status' && method === 'GET') {
      writeJson(response, weatherSyncStatus)
      return
    }

    const weatherForecastMatch = url.pathname.match(/^\/weather\/locations\/([^/]+)\/forecast-periods$/)
    if (weatherForecastMatch && method === 'GET') {
      const locationCode = decodeURIComponent(weatherForecastMatch[1] ?? '').toUpperCase()
      writeJson(response, weatherForecastPeriodsByCode[locationCode as keyof typeof weatherForecastPeriodsByCode] ?? [])
      return
    }

    const weatherObservationMatch = url.pathname.match(/^\/weather\/locations\/([^/]+)\/observations$/)
    if (weatherObservationMatch && method === 'GET') {
      const locationCode = decodeURIComponent(weatherObservationMatch[1] ?? '').toUpperCase()
      writeJson(response, weatherObservationsByCode[locationCode as keyof typeof weatherObservationsByCode] ?? [])
      return
    }

    const approveActionRequestMatch = url.pathname.match(/^\/assistant\/action-requests\/(\d+)\/approve$/)
    if (approveActionRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const actionRequestId = Number(approveActionRequestMatch[1])
      const actionRequestIndex = assistantActionRequestRows.findIndex(
        (requestRow) => requestRow.action_request_id === actionRequestId,
      )

      if (actionRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant action request not found.' }, 404)
        return
      }

      const currentRequest = assistantActionRequestRows[actionRequestIndex]
      if (currentRequest.status !== 'PENDING') {
        writeJson(response, { detail: 'Only pending assistant action requests can be approved.' }, 409)
        return
      }

      const decisionPayload = await readJsonBody(request)
      const decisionRecord =
        decisionPayload && typeof decisionPayload === 'object' && !Array.isArray(decisionPayload)
          ? (decisionPayload as Record<string, unknown>)
          : {}
      const reviewOutcome =
        decisionRecord.review_outcome === 'APPROVED_WITH_CORRECTIONS'
          ? 'APPROVED_WITH_CORRECTIONS'
          : 'APPROVED_AS_IS'
      const correctionFields = normalizedCorrectionFields(decisionRecord.correction_fields)
      let result: Record<string, unknown>
      if (currentRequest.action_type === 'create_home_view_instance') {
        const homeViewDefinition = createHomeViewDefinitionFromPayload(currentRequest.payload)
        result = {
          home_view_definition: homeViewDefinition,
        }
      } else {
        const tradeId =
          typeof currentRequest.payload.trade_id === 'string' && currentRequest.payload.trade_id.trim()
            ? currentRequest.payload.trade_id.trim()
            : 'T-AMEND-100'
        const eventId = `evt-assistant-cancel-${actionRequestId}`
        const tradeIndex = tradeRows.findIndex((trade) => trade.trade_id === tradeId)
        if (tradeIndex >= 0) {
          tradeRows[tradeIndex] = {
            ...tradeRows[tradeIndex],
            status: 'CANCELLED',
            updated_at: '2026-04-11T09:05:00Z',
            last_event_id: eventId,
          } as SmokeTradeRow
        }
        result = {
          event_id: eventId,
          trade_id: tradeId,
          trade_status: 'CANCELLED',
        }
      }
      const updatedRequest = {
        ...currentRequest,
        status: 'EXECUTED',
        lifecycle: {
          ...currentRequest.lifecycle,
          stage: 'EXECUTED',
          label: 'Executed',
          tone: 'success',
          is_terminal: true,
          can_approve: false,
          can_reject: false,
          reviewer_action_label: null,
          decided_label: `Executed by ${smokeSession.user.user_id}`,
        },
        result,
        decided_at: '2026-04-11T09:05:00Z',
        decided_by: smokeSession.user.user_id,
        review_outcome: reviewOutcome,
        decision_note: normalizedReviewText(decisionRecord.decision_note),
        correction_summary:
          reviewOutcome === 'APPROVED_WITH_CORRECTIONS'
            ? normalizedReviewText(decisionRecord.correction_summary)
            : null,
        correction_fields: reviewOutcome === 'APPROVED_WITH_CORRECTIONS' ? correctionFields : [],
      } satisfies SmokeAssistantActionRequestRow

      assistantActionRequestRows[actionRequestIndex] = updatedRequest
      writeJson(response, updatedRequest)
      return
    }

    const rejectActionRequestMatch = url.pathname.match(/^\/assistant\/action-requests\/(\d+)\/reject$/)
    if (rejectActionRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const actionRequestId = Number(rejectActionRequestMatch[1])
      const actionRequestIndex = assistantActionRequestRows.findIndex(
        (requestRow) => requestRow.action_request_id === actionRequestId,
      )

      if (actionRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant action request not found.' }, 404)
        return
      }

      const currentRequest = assistantActionRequestRows[actionRequestIndex]
      if (currentRequest.status !== 'PENDING') {
        writeJson(response, { detail: 'Only pending assistant action requests can be rejected.' }, 409)
        return
      }

      const decisionPayload = await readJsonBody(request)
      const decisionRecord =
        decisionPayload && typeof decisionPayload === 'object' && !Array.isArray(decisionPayload)
          ? (decisionPayload as Record<string, unknown>)
          : {}
      const updatedRequest = {
        ...currentRequest,
        status: 'REJECTED',
        lifecycle: {
          ...currentRequest.lifecycle,
          stage: 'REJECTED',
          label: 'Rejected',
          tone: 'neutral',
          is_terminal: true,
          can_approve: false,
          can_reject: false,
          reviewer_action_label: null,
          decided_label: `Rejected by ${smokeSession.user.user_id}`,
        },
        result: null,
        decided_at: '2026-04-11T09:05:00Z',
        decided_by: smokeSession.user.user_id,
        review_outcome: 'REJECTED',
        decision_note: normalizedReviewText(decisionRecord.decision_note),
        correction_summary: null,
        correction_fields: [],
      } satisfies SmokeAssistantActionRequestRow

      assistantActionRequestRows[actionRequestIndex] = updatedRequest
      writeJson(response, updatedRequest)
      return
    }

    if (url.pathname === '/operations/system-overview' && method === 'GET') {
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
        open_trade_count: tradeRows.length,
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

    if (url.pathname === '/operations/workspace-summary' && method === 'GET') {
      writeJson(response, buildWorkspaceSummary(tradeRows))
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
        default_daily_token_allocation: 100000,
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

    if (url.pathname === '/wiki/pages' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const includeArchived = url.searchParams.get('include_archived') === 'true'
      const visiblePages = includeArchived
        ? sortWikiPages(wikiPageRows)
        : sortWikiPages(filterWikiPagesByArchiveState(wikiPageRows, false))
      const activePages = filterWikiPagesByArchiveState(visiblePages, false)
      const archivedPages = filterWikiPagesByArchiveState(visiblePages, true)

      writeJson(response, {
        pages: visiblePages.map((page) =>
          serializeWikiPageSummary(
            isWikiPageArchived(page) ? archivedPages : activePages,
            page,
          ),
        ),
      })
      return
    }

    if (url.pathname === '/wiki/pages' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        writeJson(response, { detail: 'Invalid wiki page payload.' }, 422)
        return
      }

      const pageRecord = payload as Record<string, unknown>
      const title = normalizeOptionalText(pageRecord.title)
      if (!title) {
        writeJson(response, { detail: 'title is required.' }, 422)
        return
      }

      const parentPageId =
        pageRecord.parent_page_id === undefined || pageRecord.parent_page_id === null
          ? null
          : normalizeOptionalText(pageRecord.parent_page_id)
      const parentValidationError = validateWikiParentPage(wikiPageRows, null, parentPageId)
      if (parentValidationError) {
        writeJson(
          response,
          { detail: parentValidationError },
          parentValidationError.includes('not found') ? 404 : 422,
        )
        return
      }

      const contentMarkdown =
        typeof pageRecord.content_markdown === 'string'
          ? pageRecord.content_markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          : ''
      const sortOrder =
        typeof pageRecord.sort_order === 'number' && Number.isFinite(pageRecord.sort_order)
          ? Math.trunc(pageRecord.sort_order)
          : nextWikiSortOrder(wikiPageRows, parentPageId)

      wikiMutationSequence += 1
      const timestamp = nextWikiTimestamp(wikiMutationSequence)
      const createdPage = {
        page_id: `wiki-page-${String(nextWikiPageSequence).padStart(4, '0')}`,
        parent_page_id: parentPageId,
        title,
        content_markdown: contentMarkdown,
        sort_order: sortOrder,
        created_at: timestamp,
        created_by: smokeSession.user.user_id,
        updated_at: timestamp,
        updated_by: smokeSession.user.user_id,
        archived_at: null,
        archived_by: null,
        version: 1,
      } satisfies SmokeWikiPageRow
      nextWikiPageSequence += 1
      wikiPageRows.push(createdPage)
      recordWikiRevision({
        revisionsByPageId: wikiPageRevisionsByPageId,
        nextRevisionId: nextWikiRevisionId,
        page: createdPage,
        createdAt: timestamp,
        createdBy: smokeSession.user.user_id,
        changeSummary: ['Created wiki page.'],
      })
      nextWikiRevisionId += 1

      writeJson(
        response,
        serializeWikiPageDetail(
          filterWikiPagesByArchiveState(wikiPageRows, false),
          wikiPageRevisionsByPageId,
          createdPage,
        ),
        201,
      )
      return
    }

    const wikiPageRestoreMatch = url.pathname.match(/^\/wiki\/pages\/([^/]+)\/revisions\/(\d+)\/restore$/)
    if (wikiPageRestoreMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageRestoreMatch[1] ?? '')
      const revisionId = Number(wikiPageRestoreMatch[2])
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }
      if (isWikiPageArchived(page)) {
        writeJson(response, { detail: 'Archived wiki pages must be restored before applying a revision' }, 422)
        return
      }

      const revision = (wikiPageRevisionsByPageId.get(pageId) ?? []).find(
        (entry) => entry.revision_id === revisionId,
      )
      if (!revision) {
        writeJson(response, { detail: `Wiki page revision '${revisionId}' was not found` }, 404)
        return
      }

      const restorePayload = await readJsonBody(request)
      if (!restorePayload || typeof restorePayload !== 'object' || Array.isArray(restorePayload)) {
        writeJson(response, { detail: 'Invalid wiki revision restore payload.' }, 422)
        return
      }

      const restoredBy = normalizeOptionalText((restorePayload as Record<string, unknown>).restored_by)
      if (!restoredBy) {
        writeJson(response, { detail: 'restored_by is required.' }, 422)
        return
      }

      const parentValidationError = validateWikiParentPage(wikiPageRows, pageId, revision.parent_page_id)
      if (parentValidationError) {
        writeJson(
          response,
          { detail: parentValidationError },
          parentValidationError.includes('not found') ? 404 : 422,
        )
        return
      }

      wikiMutationSequence += 1
      const timestamp = nextWikiTimestamp(wikiMutationSequence)
      page.parent_page_id = revision.parent_page_id
      page.title = revision.title
      page.content_markdown = revision.content_markdown
      page.sort_order = revision.sort_order
      page.updated_at = timestamp
      page.updated_by = restoredBy
      page.version += 1

      recordWikiRevision({
        revisionsByPageId: wikiPageRevisionsByPageId,
        nextRevisionId: nextWikiRevisionId,
        page,
        createdAt: timestamp,
        createdBy: restoredBy,
        changeSummary: [`Restored from revision ${revisionId}.`],
        restoredFromRevisionId: revisionId,
      })
      nextWikiRevisionId += 1

      writeJson(
        response,
        serializeWikiPageDetail(
          filterWikiPagesByArchiveState(wikiPageRows, false),
          wikiPageRevisionsByPageId,
          page,
        ),
      )
      return
    }

    const wikiPageMatch = url.pathname.match(/^\/wiki\/pages\/([^/]+)$/)
    if (wikiPageMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageMatch[1] ?? '')
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }

      writeJson(
        response,
        serializeWikiPageDetail(
          filterWikiPagesByArchiveState(wikiPageRows, isWikiPageArchived(page)),
          wikiPageRevisionsByPageId,
          page,
        ),
      )
      return
    }

    if (wikiPageMatch && method === 'PATCH') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageMatch[1] ?? '')
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }
      if (isWikiPageArchived(page)) {
        writeJson(response, { detail: 'Archived wiki pages must be restored before editing' }, 422)
        return
      }

      const payload = await readJsonBody(request)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        writeJson(response, { detail: 'Invalid wiki page payload.' }, 422)
        return
      }

      const pageRecord = payload as Record<string, unknown>
      const hasTitle = Object.prototype.hasOwnProperty.call(pageRecord, 'title')
      const hasParentPageId = Object.prototype.hasOwnProperty.call(pageRecord, 'parent_page_id')
      const hasContentMarkdown = Object.prototype.hasOwnProperty.call(pageRecord, 'content_markdown')
      const hasSortOrder = Object.prototype.hasOwnProperty.call(pageRecord, 'sort_order')

      if (!hasTitle && !hasParentPageId && !hasContentMarkdown && !hasSortOrder) {
        writeJson(response, { detail: 'Provide at least one wiki page field to update.' }, 422)
        return
      }

      const nextTitle = hasTitle ? normalizeOptionalText(pageRecord.title) : page.title
      if (hasTitle && !nextTitle) {
        writeJson(response, { detail: 'title is required.' }, 422)
        return
      }

      const nextParentPageId = hasParentPageId
        ? pageRecord.parent_page_id === null
          ? null
          : normalizeOptionalText(pageRecord.parent_page_id)
        : page.parent_page_id
      const parentValidationError = validateWikiParentPage(wikiPageRows, pageId, nextParentPageId)
      if (parentValidationError) {
        writeJson(
          response,
          { detail: parentValidationError },
          parentValidationError.includes('not found') ? 404 : 422,
        )
        return
      }

      const nextContentMarkdown = hasContentMarkdown
        ? typeof pageRecord.content_markdown === 'string'
          ? pageRecord.content_markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          : ''
        : page.content_markdown
      const nextSortOrder = hasSortOrder
        ? typeof pageRecord.sort_order === 'number' && Number.isFinite(pageRecord.sort_order)
          ? Math.trunc(pageRecord.sort_order)
          : page.sort_order
        : page.sort_order

      const previousTitle = page.title
      const previousParentPageId = page.parent_page_id
      const previousContentMarkdown = page.content_markdown
      const previousSortOrder = page.sort_order

      const effectiveChange =
        nextTitle !== page.title ||
        nextParentPageId !== page.parent_page_id ||
        nextContentMarkdown !== page.content_markdown ||
        nextSortOrder !== page.sort_order

      if (!effectiveChange) {
        writeJson(
          response,
          serializeWikiPageDetail(
            filterWikiPagesByArchiveState(wikiPageRows, false),
            wikiPageRevisionsByPageId,
            page,
          ),
        )
        return
      }

      page.title = nextTitle ?? page.title
      page.parent_page_id = nextParentPageId
      page.content_markdown = nextContentMarkdown
      page.sort_order = nextSortOrder
      wikiMutationSequence += 1
      const timestamp = nextWikiTimestamp(wikiMutationSequence)
      page.updated_at = timestamp
      page.updated_by = smokeSession.user.user_id
      page.version += 1

      const pagesById = new Map(wikiPageRows.map((entry) => [entry.page_id, entry] as const))
      const changeSummary = buildWikiChangeSummary({
        previousTitle,
        previousParentPageId,
        previousContentMarkdown,
        previousSortOrder,
        page,
        pagesById,
      })
      recordWikiRevision({
        revisionsByPageId: wikiPageRevisionsByPageId,
        nextRevisionId: nextWikiRevisionId,
        page,
        createdAt: timestamp,
        createdBy: smokeSession.user.user_id,
        changeSummary,
      })
      nextWikiRevisionId += 1

      writeJson(
        response,
        serializeWikiPageDetail(
          filterWikiPagesByArchiveState(wikiPageRows, false),
          wikiPageRevisionsByPageId,
          page,
        ),
      )
      return
    }

    const wikiPageArchiveMatch = url.pathname.match(/^\/wiki\/pages\/([^/]+)\/archive$/)
    if (wikiPageArchiveMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageArchiveMatch[1] ?? '')
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }
      if (isWikiPageArchived(page)) {
        writeJson(
          response,
          serializeWikiPageDetail(
            filterWikiPagesByArchiveState(wikiPageRows, true),
            wikiPageRevisionsByPageId,
            page,
          ),
        )
        return
      }

      const descendantIds = buildWikiDescendantIds(wikiPageRows, pageId)
      const timestamp = nextWikiTimestamp(++wikiMutationSequence)
      const targetPageIds = new Set<string>([pageId, ...descendantIds])

      wikiPageRows.forEach((currentPage) => {
        if (!targetPageIds.has(currentPage.page_id)) {
          return
        }

        currentPage.archived_at = timestamp
        currentPage.archived_by = smokeSession.user.user_id
        currentPage.updated_at = timestamp
        currentPage.updated_by = smokeSession.user.user_id
        currentPage.version += 1
        recordWikiRevision({
          revisionsByPageId: wikiPageRevisionsByPageId,
          nextRevisionId: nextWikiRevisionId,
          page: currentPage,
          createdAt: timestamp,
          createdBy: smokeSession.user.user_id,
          changeSummary: [
            currentPage.page_id === pageId
              ? 'Archived page.'
              : `Archived with parent page '${page.title}'.`,
          ],
        })
        nextWikiRevisionId += 1
      })

      writeJson(
        response,
        serializeWikiPageDetail(
          filterWikiPagesByArchiveState(wikiPageRows, true),
          wikiPageRevisionsByPageId,
          page,
        ),
      )
      return
    }

    const wikiPageUnarchiveMatch = url.pathname.match(/^\/wiki\/pages\/([^/]+)\/unarchive$/)
    if (wikiPageUnarchiveMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageUnarchiveMatch[1] ?? '')
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }
      if (!isWikiPageArchived(page)) {
        writeJson(
          response,
          serializeWikiPageDetail(
            filterWikiPagesByArchiveState(wikiPageRows, false),
            wikiPageRevisionsByPageId,
            page,
          ),
        )
        return
      }

      if (page.parent_page_id) {
        const parentPage = wikiPageRows.find((entry) => entry.page_id === page.parent_page_id)
        if (parentPage && isWikiPageArchived(parentPage)) {
          writeJson(response, { detail: 'Restore the archived parent page before restoring this page' }, 422)
          return
        }
      }

      const descendantIds = buildWikiDescendantIds(wikiPageRows, pageId)
      const timestamp = nextWikiTimestamp(++wikiMutationSequence)
      const targetPageIds = new Set<string>([pageId, ...descendantIds])

      wikiPageRows.forEach((currentPage) => {
        if (!targetPageIds.has(currentPage.page_id)) {
          return
        }

        currentPage.archived_at = null
        currentPage.archived_by = null
        currentPage.updated_at = timestamp
        currentPage.updated_by = smokeSession.user.user_id
        currentPage.version += 1
        recordWikiRevision({
          revisionsByPageId: wikiPageRevisionsByPageId,
          nextRevisionId: nextWikiRevisionId,
          page: currentPage,
          createdAt: timestamp,
          createdBy: smokeSession.user.user_id,
          changeSummary: [
            currentPage.page_id === pageId
              ? 'Restored page from archive.'
              : `Restored with parent page '${page.title}'.`,
          ],
        })
        nextWikiRevisionId += 1
      })

      writeJson(
        response,
        serializeWikiPageDetail(
          filterWikiPagesByArchiveState(wikiPageRows, false),
          wikiPageRevisionsByPageId,
          page,
        ),
      )
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

    if (url.pathname === '/operations/trade-attention-candidates' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const candidateType = normalizeOptionalText(url.searchParams.get('candidate_type'))
      const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '8') || 8)
      writeJson(response, buildTradeAttentionCandidateList(candidateType, limit))
      return
    }

    if (url.pathname === '/trades' && method === 'GET') {
      writeJson(response, tradeRows)
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

    if (url.pathname === '/settlement/invoices' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/payments' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/invoice-issue-candidates' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '8') || 8)
      writeJson(response, buildInvoiceIssueCandidateList(limit))
      return
    }

    if (url.pathname === '/deliveries' && method === 'GET') {
      writeJson(response, smokeDeliveries)
      return
    }

    if (url.pathname === '/truck-tracking/exceptions' && method === 'GET') {
      const includeClear = url.searchParams.get('include_clear') === 'true'
      const severity = url.searchParams.get('severity')
      const parsedLimit = Number(url.searchParams.get('limit') ?? '50')
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50
      const rows: DeliveryTruckTrackingExceptionRecord[] = truckMovementSummaries
        .flatMap((movement) => {
          const trackingHealth = movement.tracking_health
          const delivery = smokeDeliveries.find((row) => row.delivery_id === movement.delivery_id)
          if (!trackingHealth || !delivery) {
            return []
          }
          if (severity) {
            if (trackingHealth.exception_severity !== severity) {
              return []
            }
          } else if (!includeClear && trackingHealth.exception_severity === 'CLEAR') {
            return []
          }
          return [
            {
              delivery_id: delivery.delivery_id,
              trade_id: delivery.trade_id,
              leg_no: delivery.leg_no,
              external_trade_id: delivery.external_trade_id,
              book: delivery.book,
              portfolio: delivery.portfolio,
              counterparty: delivery.counterparty,
              commodity_class: delivery.commodity_class,
              commodity: delivery.commodity,
              transport_mode: delivery.transport_mode,
              execution_status: delivery.execution_status,
              delivery_start: delivery.delivery_start,
              delivery_end: delivery.delivery_end,
              location_code: delivery.location_code,
              origin_location_code: delivery.origin_location_code,
              destination_location_code: delivery.destination_location_code,
              operations_owner: delivery.operations_owner,
              movement,
              tracking_health: trackingHealth,
            },
          ]
        })
        .sort((left, right) => {
          const severityOrder = { ACTION_REQUIRED: 0, WATCH: 1, CLEAR: 2 }
          const leftSeverity = severityOrder[left.tracking_health.exception_severity] ?? 99
          const rightSeverity = severityOrder[right.tracking_health.exception_severity] ?? 99
          if (leftSeverity !== rightSeverity) {
            return leftSeverity - rightSeverity
          }
          return left.trade_id.localeCompare(right.trade_id) || left.movement.sequence_no - right.movement.sequence_no
        })
        .slice(0, limit)
      writeJson(response, rows)
      return
    }

    const truckMovementListMatch = /^\/deliveries\/([^/]+)\/truck-movements$/.exec(url.pathname)
    if (truckMovementListMatch && method === 'GET') {
      const deliveryId = decodeURIComponent(truckMovementListMatch[1])
      writeJson(
        response,
        truckMovementSummaries.filter((movement) => movement.delivery_id === deliveryId),
      )
      return
    }

    const truckMovementDetailMatch = /^\/truck-movements\/([^/]+)$/.exec(url.pathname)
    if (truckMovementDetailMatch && method === 'GET') {
      const movementId = decodeURIComponent(truckMovementDetailMatch[1])
      const movement = truckMovementRows.find((row) => row.movement_id === movementId)
      if (!movement) {
        writeJson(response, { detail: 'Truck movement not found' }, 404)
        return
      }
      writeJson(response, movement)
      return
    }

    const truckTrackingHealthMatch = /^\/truck-movements\/([^/]+)\/tracking-health$/.exec(url.pathname)
    if (truckTrackingHealthMatch && method === 'GET') {
      const movementId = decodeURIComponent(truckTrackingHealthMatch[1])
      const movement = truckMovementRows.find((row) => row.movement_id === movementId)
      if (!movement?.tracking_health) {
        writeJson(response, { detail: 'Truck movement not found' }, 404)
        return
      }
      writeJson(response, movement.tracking_health)
      return
    }

    const truckTrackingSignalsMatch = /^\/truck-movements\/([^/]+)\/tracking-signals$/.exec(url.pathname)
    if (truckTrackingSignalsMatch && method === 'GET') {
      const movementId = decodeURIComponent(truckTrackingSignalsMatch[1])
      writeJson(
        response,
        truckTrackingSignalRows
          .filter((signal) => signal.movement_id === movementId)
          .sort((left, right) => {
            const rightTime = new Date(right.occurred_at).getTime()
            const leftTime = new Date(left.occurred_at).getTime()
            if (rightTime !== leftTime) {
              return rightTime - leftTime
            }
            return right.signal_id - left.signal_id
          }),
      )
      return
    }

    if (truckTrackingSignalsMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const movementId = decodeURIComponent(truckTrackingSignalsMatch[1])
      const movement = truckMovementRows.find((row) => row.movement_id === movementId)
      const movementSummary = truckMovementSummaries.find((row) => row.movement_id === movementId)
      if (!movement || !movementSummary) {
        writeJson(response, { detail: 'Truck movement not found' }, 404)
        return
      }

      const payload = (await readJsonBody(request)) as Record<string, unknown>
      const textValue = (value: unknown): string | null =>
        typeof value === 'string' && value.trim() ? value.trim() : null
      const numericValue = (value: unknown): number | null => {
        const parsedValue = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(parsedValue) ? parsedValue : null
      }
      const sourceSystem = (textValue(payload.source_system) ?? 'TRUCK_MANUAL_DISPATCH').toUpperCase()
      const sourceEventId = textValue(payload.source_event_id)
      const duplicateSignal =
        sourceEventId === null
          ? null
          : truckTrackingSignalRows.find(
              (signal) =>
                signal.movement_id === movementId &&
                signal.source_system === sourceSystem &&
                signal.source_event_id === sourceEventId,
            )
      if (duplicateSignal) {
        writeJson(response, {
          ingest_status: 'DUPLICATE',
          duplicate: true,
          signal: duplicateSignal,
          movement: movementSummary,
        })
        return
      }

      const requestedStopId = textValue(payload.stop_id)
      const locationCode = textValue(payload.location_code)
      let matchedStop = requestedStopId
        ? movement.stops.find((stop) => stop.stop_id === requestedStopId) ?? null
        : null
      let processingStatus: DeliveryTrackingSignalRecord['processing_status'] = 'MATCHED'
      let processingError: string | null = null
      let matchConfidence = numericValue(payload.match_confidence)

      if (requestedStopId && !matchedStop) {
        processingStatus = 'REJECTED'
        processingError = `Truck stop '${requestedStopId}' was not found.`
        matchConfidence = 0
      } else if (matchedStop) {
        matchConfidence = matchConfidence ?? 1
      } else if (locationCode) {
        const matchingStops = movement.stops.filter(
          (stop) =>
            stop.location_code === locationCode &&
            stop.status !== 'SKIPPED' &&
            stop.status !== 'CANCELLED',
        )
        if (matchingStops.length === 1) {
          matchedStop = matchingStops[0]
          matchConfidence = matchConfidence ?? 0.75
        } else {
          processingStatus = 'UNRESOLVED'
          processingError =
            matchingStops.length > 1
              ? `Location '${locationCode}' matched multiple active truck stops.`
              : `Location '${locationCode}' did not match an active truck stop.`
        }
      } else {
        matchConfidence = matchConfidence ?? 0.5
      }

      const rawPayloadCandidate = payload.raw_payload
      const rawPayload =
        rawPayloadCandidate && typeof rawPayloadCandidate === 'object' && !Array.isArray(rawPayloadCandidate)
          ? { ...(rawPayloadCandidate as Record<string, unknown>) }
          : {}
      const etaAtDestination = textValue(payload.eta_at_destination)
      if (etaAtDestination) {
        rawPayload.eta_at_destination = etaAtDestination
      }
      const occurredAt = textValue(payload.occurred_at) ?? '2026-05-10T10:00:00Z'
      const nextSignal: DeliveryTrackingSignalRecord = {
        signal_id:
          Math.max(0, ...truckTrackingSignalRows.map((signal) => signal.signal_id)) + 1,
        delivery_id: movement.delivery_id,
        movement_id: movement.movement_id,
        stop_id: matchedStop?.stop_id ?? null,
        source_system: sourceSystem,
        source_event_id: sourceEventId,
        signal_type: (textValue(payload.signal_type) ?? 'POSITION').toUpperCase(),
        occurred_at: occurredAt,
        received_at: '2026-05-10T10:01:00Z',
        latitude: numericValue(payload.latitude),
        longitude: numericValue(payload.longitude),
        location_code: locationCode,
        external_status: textValue(payload.external_status),
        normalized_status: textValue(payload.normalized_status)?.toUpperCase() ?? null,
        match_confidence: matchConfidence,
        dedupe_key: `${sourceSystem}:smoke-${sourceEventId ?? truckTrackingSignalRows.length + 1}`,
        processing_status: processingStatus,
        processing_error: processingError,
        raw_payload: rawPayload,
      }
      truckTrackingSignalRows.unshift(nextSignal)

      if (processingStatus !== 'REJECTED') {
        movementSummary.last_signal_at = occurredAt
        movement.last_signal_at = occurredAt
        if (etaAtDestination) {
          movementSummary.current_eta_at_destination = etaAtDestination
          movement.current_eta_at_destination = etaAtDestination
        }
        const nextTrackingHealth = {
          ...(movementSummary.tracking_health ?? {
            last_evaluated_at: '2026-05-10T10:01:00Z',
            eta_status: 'UNKNOWN',
            eta_status_reason: 'Tracking health fixture unavailable.',
            tracking_freshness_status: 'FRESH',
            tracking_freshness_reason: 'Last tracking signal is current.',
            dwell_status: 'NOT_DWELLING',
            dwell_status_reason: 'Truck is not currently arrived or working at an active stop.',
            exception_severity: 'CLEAR' as const,
            primary_exception: null,
            stale_after_minutes: 240,
            dwell_threshold_minutes: 120,
            destination_stop_id: null,
            current_stop_id: null,
            minutes_since_last_signal: 0,
            current_dwell_minutes: null,
            eta_late_minutes: null,
          }),
          last_evaluated_at: '2026-05-10T10:01:00Z',
          eta_status: 'ON_TIME',
          eta_status_reason: 'Current destination ETA is inside the planned arrival window.',
          tracking_freshness_status: 'FRESH',
          tracking_freshness_reason: 'Last tracking signal is current.',
          exception_severity: 'CLEAR' as const,
          primary_exception: null,
          minutes_since_last_signal: 0,
          eta_late_minutes: null,
        }
        movementSummary.tracking_health = nextTrackingHealth
        movement.tracking_health = nextTrackingHealth
        movementSummary.updated_at = '2026-05-10T10:01:00Z'
        movement.updated_at = '2026-05-10T10:01:00Z'
        movementSummary.version += 1
        movement.version += 1
      }

      writeJson(
        response,
        {
          ingest_status: 'CREATED',
          duplicate: false,
          signal: nextSignal,
          movement: movementSummary,
        },
        201,
      )
      return
    }

    const truckCheckpointReverseMatch = /^\/truck-stops\/([^/]+)\/checkpoints\/(\d+)\/reverse$/.exec(url.pathname)
    if (truckCheckpointReverseMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      await readJsonBody(request)
      const stopId = decodeURIComponent(truckCheckpointReverseMatch[1])
      const eventId = Number(truckCheckpointReverseMatch[2])
      if (stopId === 'STOP-SMOKE-1' && eventId === 3) {
        writeJson(
          response,
          {
            detail:
              'DEPARTED_PICKUP cannot be reversed while downstream truck stop STOP-SMOKE-2 has active progress. Reverse or correct downstream stop progress first.',
          },
          422,
        )
        return
      }

      writeJson(response, { detail: 'Truck checkpoint event not found' }, 404)
      return
    }

    if (url.pathname === '/operations/work-items' && method === 'GET') {
      writeJson(response, tradeWorkflowItemRows.map(cloneJson))
      return
    }

    if (url.pathname === '/operations/work-items' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const workItem = buildTradeWorkflowItemFromPayload({
        itemId: tradeWorkflowItemRows.length + 1,
        payload: payload as Record<string, unknown>,
        tradeRows,
      })
      tradeWorkflowItemRows.unshift(workItem)
      operationWorkItemRequests.push(cloneJson(workItem))
      writeJson(response, cloneJson(workItem), 201)
      return
    }

    if (url.pathname === '/pretrade/scenarios' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, preTradeScenarioRows.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/scenarios' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const record = payload as {
        name?: unknown
        thesis?: unknown
        draft?: unknown
        enrichment?: PreTradeScenarioEnrichmentRecord | null
      }
      const now = '2026-04-11T00:09:00Z'
      const scenario: PreTradeScenarioRecord = {
        scenario_id: preTradeScenarioRows.length + 1,
        name: normalizeOptionalText(record.name) ?? 'Smoke pre-trade scenario',
        thesis: normalizeOptionalText(record.thesis),
        draft: normalizePreTradeScenarioDraft(record.draft),
        enrichment: record.enrichment ?? null,
        created_at: now,
        created_by: smokeSession.user.user_id,
        updated_at: now,
        updated_by: smokeSession.user.user_id,
        version: 1,
        can_edit: true,
      }
      preTradeScenarioRows.unshift(scenario)
      writeJson(response, cloneJson(scenario), 201)
      return
    }

    if (url.pathname === '/pretrade/reviews' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, preTradeReviewRows.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/reviews' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const record = payload as {
        name?: unknown
        thesis?: unknown
        draft?: unknown
        source_scenario_id?: unknown
        recommendation_run_id?: unknown
        enrichment?: PreTradeScenarioEnrichmentRecord | null
        owner?: unknown
        due_at?: unknown
        review_notes?: unknown
      }
      const now = '2026-04-11T00:11:00Z'
      const recommendationRunId = normalizeOptionalNumber(record.recommendation_run_id)
      const recommendationRun = preTradeRecommendationRunRows.find((run) => run.run_id === recommendationRunId) ?? null
      const review: PreTradeReviewItemRecord = {
        review_id: preTradeReviewRows.length + 1,
        name: normalizeOptionalText(record.name) ?? 'Smoke pre-trade review',
        thesis: normalizeOptionalText(record.thesis),
        draft: normalizePreTradeScenarioDraft(record.draft),
        source_scenario_id: normalizeOptionalNumber(record.source_scenario_id),
        recommendation_run_id: recommendationRunId,
        enrichment: record.enrichment ?? (recommendationRun ? buildPreTradeScenarioEnrichmentFromRun(recommendationRun) : null),
        recommendation_summary: buildPreTradeReviewRecommendationSummary(recommendationRun),
        recommendation_override_reason: null,
        recommendation_override_by: null,
        recommendation_override_at: null,
        review_status: 'OPEN',
        owner: normalizeOptionalText(record.owner),
        due_at: normalizeOptionalText(record.due_at),
        review_notes: normalizeOptionalText(record.review_notes),
        linked_trade_id: null,
        linked_trade_status: null,
        booked_at: null,
        booked_by: null,
        approval_governance_snapshot: null,
        booking_governance_snapshot: null,
        activity: [
          {
            activity_id: `ptr-activity-${preTradeReviewRows.length + 1}-submitted`,
            action: 'SUBMITTED',
            actor_id: smokeSession.user.user_id,
            occurred_at: now,
            comment: normalizeOptionalText(record.review_notes),
            payload: {},
          },
        ],
        created_at: now,
        created_by: smokeSession.user.user_id,
        updated_at: now,
        updated_by: smokeSession.user.user_id,
        version: 1,
        can_edit: true,
      }
      preTradeReviewRows.unshift(review)
      writeJson(response, cloneJson(review), 201)
      return
    }

    const preTradeReviewDriftMatch = url.pathname.match(/^\/pretrade\/reviews\/(\d+)\/drift$/)
    if (preTradeReviewDriftMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const reviewId = Number(preTradeReviewDriftMatch[1])
      const review = preTradeReviewRows.find((row) => row.review_id === reviewId)
      if (!review) {
        writeJson(response, { detail: 'Pre-trade review not found.' }, 404)
        return
      }

      writeJson(response, buildPreTradeReviewDrift(review))
      return
    }

    const preTradeReviewMatch = url.pathname.match(/^\/pretrade\/reviews\/(\d+)$/)
    if (preTradeReviewMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const reviewId = Number(preTradeReviewMatch[1])
      const review = preTradeReviewRows.find((row) => row.review_id === reviewId)
      if (!review) {
        writeJson(response, { detail: 'Pre-trade review not found.' }, 404)
        return
      }

      writeJson(response, cloneJson(review))
      return
    }

    if (preTradeReviewMatch && method === 'PATCH') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const reviewId = Number(preTradeReviewMatch[1])
      const reviewIndex = preTradeReviewRows.findIndex((row) => row.review_id === reviewId)
      if (reviewIndex < 0) {
        writeJson(response, { detail: 'Pre-trade review not found.' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const record = payload as {
        owner?: unknown
        review_status?: PreTradeReviewStatus
        activity_comment?: unknown
        recommendation_override_reason?: unknown
      }
      const current = preTradeReviewRows[reviewIndex]
      const now = '2026-04-11T00:13:00Z'
      const nextStatus = record.review_status ?? current.review_status
      const nextActivityAction: PreTradeReviewActivityRecord['action'] =
        nextStatus === 'APPROVED'
          ? 'APPROVED'
          : nextStatus === 'REJECTED'
            ? 'REJECTED'
            : nextStatus === 'IN_REVIEW'
              ? 'CLAIMED'
              : 'COMMENTED'
      const comment = normalizeOptionalText(record.activity_comment)
      const next: PreTradeReviewItemRecord = {
        ...current,
        owner: normalizeOptionalText(record.owner) ?? current.owner,
        review_status: nextStatus,
        recommendation_override_reason: normalizeOptionalText(record.recommendation_override_reason) ?? current.recommendation_override_reason,
        recommendation_override_by:
          normalizeOptionalText(record.recommendation_override_reason) || current.recommendation_override_reason
            ? smokeSession.user.user_id
            : current.recommendation_override_by,
        recommendation_override_at:
          normalizeOptionalText(record.recommendation_override_reason) || current.recommendation_override_reason
            ? now
            : current.recommendation_override_at,
        approval_governance_snapshot:
          nextStatus === 'APPROVED'
            ? buildPreTradeGovernanceExport(preTradeReviewRows, preTradeRecommendationRunRows)
            : current.approval_governance_snapshot,
        activity: [
          ...current.activity,
          {
            activity_id: `ptr-activity-${reviewId}-${current.activity.length + 1}`,
            action: nextActivityAction,
            actor_id: smokeSession.user.user_id,
            occurred_at: now,
            comment,
            payload: {},
          },
        ],
        updated_at: now,
        updated_by: smokeSession.user.user_id,
        version: current.version + 1,
      }
      preTradeReviewRows[reviewIndex] = next
      writeJson(response, cloneJson(next))
      return
    }

    const preTradeReviewActivityMatch = url.pathname.match(/^\/pretrade\/reviews\/(\d+)\/activity$/)
    if (preTradeReviewActivityMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const reviewId = Number(preTradeReviewActivityMatch[1])
      const reviewIndex = preTradeReviewRows.findIndex((row) => row.review_id === reviewId)
      if (reviewIndex < 0) {
        writeJson(response, { detail: 'Pre-trade review not found.' }, 404)
        return
      }
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const current = preTradeReviewRows[reviewIndex]
      const now = '2026-04-11T00:13:30Z'
      const next: PreTradeReviewItemRecord = {
        ...current,
        activity: [
          ...current.activity,
          {
            activity_id: `ptr-activity-${reviewId}-${current.activity.length + 1}`,
            action: 'COMMENTED',
            actor_id: smokeSession.user.user_id,
            occurred_at: now,
            comment: normalizeOptionalText((payload as { comment?: unknown }).comment),
            payload: {},
          },
        ],
        updated_at: now,
        updated_by: smokeSession.user.user_id,
        version: current.version + 1,
      }
      preTradeReviewRows[reviewIndex] = next
      writeJson(response, cloneJson(next))
      return
    }

    if (url.pathname === '/pretrade/governance/summary' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildPreTradeGovernanceSummary(preTradeReviewRows, preTradeRecommendationRunRows))
      return
    }

    if (url.pathname === '/pretrade/governance/items' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildPreTradeGovernanceItems(preTradeReviewRows, preTradeRecommendationRunRows))
      return
    }

    if (url.pathname === '/pretrade/governance/export' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildPreTradeGovernanceExport(preTradeReviewRows, preTradeRecommendationRunRows))
      return
    }

    if (url.pathname === '/pretrade/promotion-outcomes' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildPreTradePromotionOutcomeSummary())
      return
    }

    if (url.pathname === '/pretrade/netting-sets' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, preTradeNettingSetRows.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/hedge-recommendations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, preTradeHedgeRecommendationRows.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/risk-scenarios' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, preTradeRiskScenarioRows.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/market-opportunities' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, preTradeMarketOpportunityRows.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/recommendations/runs' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const sourceScenarioId = url.searchParams.get('source_scenario_id')
      const sourceReviewId = url.searchParams.get('source_review_id')
      const limit = Number(url.searchParams.get('limit') ?? '20')
      const filtered = preTradeRecommendationRunRows
        .filter((run) => !sourceScenarioId || run.source_scenario_id === Number(sourceScenarioId))
        .filter((run) => !sourceReviewId || run.source_review_id === Number(sourceReviewId))
        .slice(0, Number.isFinite(limit) ? limit : 20)
      writeJson(response, filtered.map(cloneJson))
      return
    }

    if (url.pathname === '/pretrade/recommendations/runs' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const record = payload as {
        name?: unknown
        thesis?: unknown
        draft?: unknown
        source_scenario_id?: unknown
        source_review_id?: unknown
        input_snapshots?: PreTradeRecommendationSourceSnapshotRecord[]
      }
      const runId = preTradeRecommendationRunRows.length + 1
      const draft = normalizePreTradeScenarioDraft(record.draft)
      const analysis = buildSmokePreTradeDraftAnalysis({
        thesis: normalizeOptionalText(record.thesis),
        draft,
        sourceScenarioId: normalizeOptionalNumber(record.source_scenario_id),
        sourceReviewId: normalizeOptionalNumber(record.source_review_id),
        inputSnapshots: Array.isArray(record.input_snapshots) ? record.input_snapshots : undefined,
      })
      const now = '2026-04-11T00:10:00Z'
      const run: PreTradeRecommendationRunRecord = {
        run_id: runId,
        run_key: `PTR-SMOKE-${String(runId).padStart(3, '0')}`,
        name: normalizeOptionalText(record.name) ?? 'Smoke pre-trade recommendation',
        thesis: analysis.thesis,
        draft: analysis.draft,
        source_scenario_id: analysis.source_scenario_id,
        source_review_id: analysis.source_review_id,
        input_snapshots: analysis.input_snapshots,
        recommendation: analysis.recommendation,
        comparison: null,
        created_at: now,
        created_by: smokeSession.user.user_id,
        updated_at: now,
        updated_by: smokeSession.user.user_id,
        version: 1,
        can_edit: true,
      }
      preTradeRecommendationRunRows.unshift(run)
      writeJson(response, cloneJson(run), 201)
      return
    }

    const preTradeRecommendationRunMatch = url.pathname.match(/^\/pretrade\/recommendations\/runs\/(\d+)$/)
    if (preTradeRecommendationRunMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(preTradeRecommendationRunMatch[1])
      const run = preTradeRecommendationRunRows.find((row) => row.run_id === runId)
      if (!run) {
        writeJson(response, { detail: 'Pre-trade recommendation run not found.' }, 404)
        return
      }
      writeJson(response, cloneJson(run))
      return
    }

    if (url.pathname === '/pretrade/recommendations/draft-analysis' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const record = payload as {
        thesis?: unknown
        draft?: unknown
        source_scenario_id?: unknown
        source_review_id?: unknown
        input_snapshots?: PreTradeRecommendationSourceSnapshotRecord[]
      }
      const draft = normalizePreTradeScenarioDraft(record.draft)
      writeJson(
        response,
        buildSmokePreTradeDraftAnalysis({
          thesis: normalizeOptionalText(record.thesis),
          draft,
          sourceScenarioId: normalizeOptionalNumber(record.source_scenario_id),
          sourceReviewId: normalizeOptionalNumber(record.source_review_id),
          inputSnapshots: Array.isArray(record.input_snapshots) ? record.input_snapshots : undefined,
        }),
      )
      return
    }

    if (url.pathname === '/operations/document-record-creation-requests' && method === 'GET') {
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

    if (url.pathname === '/reference/rail-routes' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/reference/assets/map-scope-summary' && method === 'GET') {
      writeJson(response, {
        total_count: assets.length,
        total_map_ready_count: assets.length,
        filtered_total_count: assets.length,
        filtered_map_ready_count: assets.length,
      })
      return
    }

    if (url.pathname === '/reference/assets' && method === 'GET') {
      writeJson(response, assets)
      return
    }

    if (url.pathname === '/reference/assets/standards' && method === 'GET') {
      writeJson(response, assetStandards)
      return
    }

    if (url.pathname === '/reference/spatial-features' && method === 'GET') {
      writeJson(response, spatialFeatures)
      return
    }

    if (url.pathname === '/reference/spatial-features/standards' && method === 'GET') {
      writeJson(response, spatialFeatureStandards)
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
        writeJson(response, tradeEventsByAggregateId.get(aggregateId) ?? [])
        return
      }

      writeJson(
        response,
        Array.from(tradeEventsByAggregateId.values()).flat(),
      )
      return
    }

    if (url.pathname === '/events' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const eventRequest = payload as {
        aggregate_type?: unknown
        aggregate_id?: unknown
        event_type?: unknown
        occurred_at?: unknown
        actor_id?: unknown
        payload?: unknown
        schema_version?: unknown
      }

      assert.equal(eventRequest.aggregate_type, 'trade')
      assert.equal(eventRequest.event_type, 'TradeCreated')
      assert.equal(typeof eventRequest.aggregate_id, 'string')
      assert.equal(typeof eventRequest.occurred_at, 'string')
      assert.ok(
        eventRequest.payload &&
          typeof eventRequest.payload === 'object' &&
          !Array.isArray(eventRequest.payload),
      )

      const tradeId = eventRequest.aggregate_id.trim()
      const occurredAt = eventRequest.occurred_at
      const actorId = normalizeOptionalText(eventRequest.actor_id)
      const eventPayload = eventRequest.payload as Record<string, unknown>
      const schemaVersion =
        typeof eventRequest.schema_version === 'number' &&
        Number.isFinite(eventRequest.schema_version)
          ? eventRequest.schema_version
          : 1
      const eventId = `evt-trade-created-${tradeId.toLowerCase()}`
      const createdEvent = buildTradeCreatedEventRow({
        eventId,
        tradeId,
        occurredAt,
        actorId,
        schemaVersion,
        payload: eventPayload,
      })
      const createdTrade = buildCreatedTradeRow({
        tradeId,
        occurredAt,
        eventId,
        payload: eventPayload,
      })

      tradeEventsByAggregateId.set(tradeId, [createdEvent])
      tradeRows.unshift(createdTrade)

      writeJson(response, createdEvent, 201)
      return
    }

    const layoutDefinitionMatch = url.pathname.match(/^\/layout-definitions\/([^/]+)$/)
    if (layoutDefinitionMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
      return
    }

    if (layoutDefinitionMatch && method === 'PUT') {
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

      const workspaceId = layoutDefinitionMatch[1]
      writeJson(response, {
        workspace_id: workspaceId,
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

    if (url.pathname === '/market-data/news/headlines' && method === 'GET') {
      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        commodity: url.searchParams.get('commodity'),
        search_query: url.searchParams.get('query') ?? 'Henry Hub natural gas',
        count: 1,
        items: [
          {
            title: 'Henry Hub gas holds steady in smoke fixture',
            source: 'Smoke News',
            published_at: '2026-04-11T00:00:00Z',
            link: 'https://news.example.test/henry-hub-smoke',
          },
        ],
      })
      return
    }

    if (url.pathname === '/market-data/news/headlines/tagging' && method === 'POST') {
      const payload = await readJsonBody(request)
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}
      const items = Array.isArray(record.items) ? record.items : []

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        provider: 'smoke',
        model: null,
        items: items
          .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : 'smoke-news-item',
            supply: {
              direction: 'neutral',
              horizon: 'near_term',
              confidence: 0.5,
              rationale: 'Smoke harness neutral news tag.',
              source: 'ai',
            },
            demand: {
              direction: 'neutral',
              horizon: 'near_term',
              confidence: 0.5,
              rationale: 'Smoke harness neutral news tag.',
              source: 'ai',
            },
            market_location: {
              label: 'Henry Hub',
              scope: 'region',
              confidence: 0.5,
              rationale: 'Smoke harness market location.',
              source: 'ai',
            },
          })),
        warnings: [],
      })
      return
    }

    if (url.pathname === '/market-data/external-series' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/market-data/price-indices/observations/latest' && method === 'GET') {
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

    if (url.pathname === '/reports/counterparty-credit' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/reports/overview' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        active_trade_count: tradeRows.length,
        tracked_commodity_count: 1,
        gross_net_volume: 10000,
        exposure: [],
        activity: [],
      })
      return
    }

    if (url.pathname === '/reports/datasets' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/reports/trading-eod' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        business_date: '2026-04-11',
        as_of: '2026-04-11',
        evaluation_timestamp: '2026-04-11T00:00:00Z',
        basis: 'SMOKE_HARNESS',
        status: 'READY',
        blocked_check_count: 0,
        warning_check_count: 0,
        ready_check_count: 0,
        checks: [],
        coverage_notes: [],
        trade_summary: {
          active_trade_count: tradeRows.length,
          priced_active_count: 1,
          pending_pricing_count: 0,
          pending_settlement_count: 0,
          tracked_book_count: 1,
          total_active_volume: 10000,
        },
        pnl_summary: {
          basis: 'MARK_TO_MARKET',
          methodology: 'Smoke report fixture.',
          total_pnl: 8900,
          realized_pnl: 1800,
          unrealized_pnl: 7100,
          priced_trade_count: 1,
          realized_trade_count: 0,
          unrealized_trade_count: 1,
        },
        operations_summary: {
          open_work_item_count: 0,
          operations_queue_count: 0,
          settlement_queue_count: 0,
          attention_count: 0,
          stale_pricing_count: 0,
          incomplete_ops_data_count: 0,
        },
        settlement_summary: {
          invoice_count: 0,
          overdue_invoice_count: 0,
          disputed_invoice_count: 0,
          blocked_exception_count: 0,
          warning_exception_count: 0,
          payment_due_count: 0,
          invoice_pending_count: 0,
        },
        projection_summary: {
          structural_issue_count: 0,
          invariant_issue_count: 0,
          impacted_trade_count: 0,
        },
        accrual_summary: {
          row_count: 0,
          lot_count: 0,
          unbilled_amount_total: 0,
          billed_uncollected_amount_total: 0,
          net_open_amount_total: 0,
          coverage_basis: 'none',
        },
      })
      return
    }

    if (url.pathname === '/reports/exposure-summary' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/reports/activity-summary' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/reports/settlement-filter-options' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        books: [],
        counterparties: [],
        currencies: ['USD'],
        exception_types: [],
        severities: ['blocked', 'in-progress'],
      })
      return
    }

    if (url.pathname === '/reports/settlement-presets' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/reports/settlement-aging' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        as_of: '2026-04-11',
        row_count: 0,
        invoice_count: 0,
        overdue_invoice_count: 0,
        disputed_invoice_count: 0,
        currency_summaries: [],
        rows: [],
      })
      return
    }

    if (url.pathname === '/reports/cash-forecast' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        as_of: '2026-04-11',
        horizon_days: 30,
        basis: 'SMOKE_HARNESS',
        row_count: 0,
        currency_summaries: [],
        points: [],
      })
      return
    }

    if (url.pathname === '/reports/settlement-exceptions' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        as_of: '2026-04-11',
        row_count: 0,
        blocked_count: 0,
        warning_count: 0,
        summaries: [],
        rows: [],
      })
      return
    }

    if (url.pathname === '/reports/pnl-compare' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const fromAsOf = url.searchParams.get('from_as_of') ?? '2026-04-10'
      const toAsOf = url.searchParams.get('to_as_of') ?? '2026-04-11'
      const zeroSummary = {
        total_pnl: 0,
        realized_pnl: 0,
        unrealized_pnl: 0,
        priced_trade_count: 0,
        realized_trade_count: 0,
        unrealized_trade_count: 0,
      }
      const attributionSummary = {
        market_move_pnl: 0,
        quantity_change_pnl: 0,
        coverage_change_pnl: 0,
        other_change_pnl: 0,
        realization_transfer_pnl: 0,
        reconciled_pnl_delta: 0,
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        basis: 'MARK_TO_MARKET',
        methodology: 'Smoke report fixture.',
        from_as_of: fromAsOf,
        to_as_of: toAsOf,
        from_snapshot: zeroSummary,
        to_snapshot: zeroSummary,
        delta: zeroSummary,
        attribution_summary: attributionSummary,
        portfolio_deltas: [],
        attributions: [],
        daily_bridge: [
          {
            from_as_of: fromAsOf,
            to_as_of: toAsOf,
            delta: zeroSummary,
            attribution_summary: attributionSummary,
            changed_trade_count: 0,
            top_driver_trade_id: null,
            top_driver_category: null,
            top_driver_pnl_delta: null,
            top_driver_summary: null,
          },
        ],
      })
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
    operationWorkItemRequests,
    promptNavigationOutcomeRequests,
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
    operationWorkItemRequests: mockApi.operationWorkItemRequests,
    promptNavigationOutcomeRequests: mockApi.promptNavigationOutcomeRequests,
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
