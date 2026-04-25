import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildPreTradeStructuringDraftPacket } from '../src/workspaces/pretrade/preTradeStructuringDraft'
import type { CounterpartyCreditProfileRecord, CounterpartyExternalCreditSnapshotRecord, PreTradeRecommendationDraftAnalysisRecord } from '../src/shared/models'

const draft = {
  book: 'GAS_PHYS',
  portfolio: 'PROMPT',
  counterparty: 'SHELL_TRADING',
  commodity_class: 'NATURAL_GAS',
  commodity: 'HENRY_HUB',
  trade_side: 'BUY' as const,
  pricing_type: 'FLOATING',
  price_index_code: 'NG_HH_PROMPT',
  target_price: 2.84,
  target_volume: 25000,
  trade_currency_code: 'USD',
  unit_of_measure: 'MMBTU',
  price_unit_code: 'USD_MMBTU',
  location_code: 'HENRY_HUB',
  delivery_start: '2026-05-01',
  delivery_end: '2026-05-31',
}

const creditProfile: CounterpartyCreditProfileRecord = {
  counterparty_code: 'SHELL_TRADING',
  credit_rating: 'BBB+',
  review_due_at: '2026-05-15',
  limit_currency_code: 'USD',
  limit_amount: 500000,
  breach_action: 'REQUIRE_APPROVAL',
  notes: 'Monitor prompt utilization.',
  created_at: '2026-04-01T00:00:00Z',
  created_by: 'ops_admin',
  updated_at: '2026-04-20T00:00:00Z',
  updated_by: 'ops_admin',
  version: 1,
}

const externalSnapshot: CounterpartyExternalCreditSnapshotRecord = {
  id: 7,
  counterparty_code: 'SHELL_TRADING',
  provider: 'DNB',
  source_entity_id: 'dnb-7',
  source_entity_name: 'Shell Trading',
  match_basis: 'lei',
  matched_identifier_value: 'LEI-123',
  as_of_date: '2026-04-22',
  rating_scale: 'internal',
  rating_value: 'BBB',
  rating_outlook: 'Stable',
  credit_score: 76,
  probability_of_default: 0.02,
  recommended_limit_currency_code: 'USD',
  recommended_limit_amount: 450000,
  commentary: 'Prompt exposure remains acceptable.',
  downloaded_at: '2026-04-22T08:00:00Z',
  run_id: 18,
  created_at: '2026-04-22T08:00:00Z',
  updated_at: '2026-04-22T08:00:00Z',
  version: 1,
}

const analysis = {
  thesis: 'Add prompt length while basis stays favorable.',
  draft,
  input_snapshots: [
    {
      source_key: 'desk-context',
      adapter_key: 'desk-context',
      adapter_label: 'Desk Context',
      source_type: 'INTERNAL',
      source_available: true,
      captured_at: '2026-04-23T18:00:00Z',
      freshness: 'FRESH',
      quality_status: 'OK',
      quality_score: 1,
      summary: 'Desk context shows 2 related active trades and a long net position.',
      provenance: {
        provider: null,
        dataset: 'positions',
        record_id: 'desk-1',
        observed_at: '2026-04-23T17:55:00Z',
        ingested_at: '2026-04-23T18:00:00Z',
        captured_by: 'system',
      },
      payload: {
        related_active_trade_count: 2,
        current_net_position: 18000,
      },
    },
    {
      source_key: 'latest-mark',
      adapter_key: 'latest-mark',
      adapter_label: 'Latest Mark',
      source_type: 'EXTERNAL',
      source_available: true,
      captured_at: '2026-04-23T18:00:00Z',
      freshness: 'STALE',
      quality_status: 'STALE',
      quality_score: 0.5,
      summary: 'Henry Hub prompt mark is stale relative to today.',
      provenance: {
        provider: 'ICE',
        dataset: 'marks',
        record_id: 'hh-prompt',
        observed_at: '2026-04-22T20:00:00Z',
        ingested_at: '2026-04-23T18:00:00Z',
        captured_by: 'system',
      },
      payload: {
        latest_mark: 2.81,
      },
    },
  ],
  recommendation: {
    stance: 'PROCEED_WITH_CARE' as const,
    headline: 'Proceed with basis controls before capture.',
    summary: 'The scenario is workable, but the stale mark and existing long exposure need explicit desk review.',
    confidence: 'MEDIUM' as const,
    score: 74,
    estimated_notional: 71000,
    projected_credit_utilization_pct: 18,
    current_net_position: 18000,
    related_active_trade_count: 2,
    latest_mark: 2.81,
    mark_gap_pct: 3,
    explanation: {
      stance_rationale: 'Proceed with care because the draft offsets some exposure, but source freshness degraded.',
      source_quality_rationale: 'One required market source is stale.',
      confidence_rationale: 'Confidence is medium until the mark refreshes.',
      primary_drivers: ['Residual long exposure remains after the draft.'],
      reviewer_focus: ['Confirm whether the stale mark still supports the target price.'],
    },
    checks: [
      {
        key: 'credit',
        label: 'Credit',
        status: 'good' as const,
        detail: 'Current utilization stays inside internal limits.',
      },
    ],
    next_actions: ['Refresh the latest Henry Hub mark before final capture.'],
    opportunity_summary: {
      title: 'Prompt gas offset',
      category: 'RISK_REDUCTION' as const,
      detail: 'The draft reduces prompt imbalance without flipping the desk short.',
    },
    residual_exposure: {
      current_position: 18000,
      current_direction: 'LONG' as const,
      proposed_trade_delta: 25000,
      residual_after_trade: -7000,
      residual_direction_after_trade: 'SHORT' as const,
      exposure_effect: 'OFFSETS' as const,
      basis_commentary: 'Residual flips slightly short after the trade.',
    },
    netting_candidates: [],
    hedge_recommendation: {
      instrument_type: 'SWAP' as const,
      rationale: 'A prompt swap hedge keeps the structure internal until the mark refreshes.',
      policy_stops: ['Do not capture until the stale mark is refreshed.'],
    },
    rejected_alternatives: [
      {
        alternative: 'WAIT_FOR_DATA',
        reason: 'Desk wants a review-ready draft prepared before the next market refresh.',
      },
    ],
    missing_evidence: [
      {
        evidence_key: 'latest-mark',
        severity: 'WARNING' as const,
        detail: 'Latest Henry Hub prompt mark is stale.',
      },
    ],
  },
  comparison: {
    summary: 'Score improved by 4 points, but source freshness worsened on the latest mark.',
    previous_run_id: 21,
    previous_stance: 'PROCEED' as const,
    previous_score: 70,
    score_delta: 4,
    stance_changed: true,
    added_primary_drivers: ['Prompt weather risk widened.'],
    removed_primary_drivers: [],
    source_quality_changes: [
      {
        adapter_key: 'latest-mark',
        adapter_label: 'Latest Mark',
        previous_quality_status: 'OK',
        current_quality_status: 'STALE',
      },
    ],
    input_snapshot_changes: [
      {
        adapter_key: 'latest-mark',
        adapter_label: 'Latest Mark',
        change_type: 'UPDATED',
      },
    ],
  },
  evaluated_at: '2026-04-23T18:00:00Z',
} satisfies PreTradeRecommendationDraftAnalysisRecord

test('buildPreTradeStructuringDraftPacket assembles a review-ready draft with guardrails', () => {
  const packet = buildPreTradeStructuringDraftPacket({
    scenarioName: 'May Henry Hub prompt hedge',
    thesis: 'Add prompt length while basis stays favorable.',
    draft,
    analysis,
    relatedTradeCount: 2,
    relatedPositionNetVolume: 18000,
    latestMark: {
      price_index_code: 'NG_HH_PROMPT',
      value: 2.81,
      observation_date: '2026-04-22',
    },
    counterpartyCreditProfile: creditProfile,
    externalCreditSnapshot: externalSnapshot,
    weatherHeadline: 'Cooling demand is fading, but weekend maintenance risk remains.',
  })

  assert.equal(packet.title, 'May Henry Hub prompt hedge')
  assert.match(packet.reviewSummary, /PROCEED WITH CARE/)
  assert.ok(packet.assumptions.some((line) => line.includes('Current net position')))
  assert.ok(packet.sourceContext.some((line) => line.includes('Desk Context')))
  assert.ok(packet.reviewFocus.some((line) => line.includes('stale mark')))
  assert.ok(packet.handoffFields.some((line) => line.includes('Book: GAS_PHYS')))
  assert.ok(packet.guardrails.some((line) => line.includes('does not book a trade')))
  assert.match(packet.reviewNotes, /Trade capture handoff fields:/)
  assert.match(packet.reviewNotes, /Guardrails:/)
  assert.match(packet.reviewNotes, /does not book a trade/)
})

test('buildPreTradeStructuringDraftPacket fails closed when analysis is unavailable', () => {
  const packet = buildPreTradeStructuringDraftPacket({
    scenarioName: '',
    thesis: null,
    draft,
    analysis: null,
    relatedTradeCount: 0,
    relatedPositionNetVolume: null,
    latestMark: null,
    counterpartyCreditProfile: null,
    externalCreditSnapshot: null,
    weatherHeadline: null,
  })

  assert.equal(packet.title, 'GAS_PHYS HENRY_HUB buy')
  assert.match(packet.reviewSummary, /still pending/i)
  assert.ok(packet.reviewFocus.length > 0)
  assert.match(packet.reviewNotes, /review the scenario fields/i)
  assert.match(packet.reviewNotes, /does not book a trade/i)
})
