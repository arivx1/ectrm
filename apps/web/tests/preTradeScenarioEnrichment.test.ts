import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildPreTradeScenarioEnrichmentFromAnalysis,
  buildPreTradeSourceFreshnessSummary,
} from '../src/workspaces/pretrade/preTradeScenarioEnrichment'
import type { PreTradeRecommendationDraftAnalysisRecord, PreTradeRecommendationSourceSnapshotRecord } from '../src/shared/models'

const snapshots: PreTradeRecommendationSourceSnapshotRecord[] = [
  {
    source_key: 'desk-context',
    adapter_key: 'desk-context',
    adapter_label: 'Desk Context',
    source_type: 'INTERNAL',
    source_available: true,
    captured_at: '2026-04-23T18:00:00Z',
    freshness: 'FRESH',
    quality_status: 'OK',
    quality_score: 100,
    summary: 'Desk exposure is loaded.',
    provenance: {
      provider: null,
      dataset: 'positions',
      record_id: null,
      observed_at: '2026-04-23T17:55:00Z',
      ingested_at: '2026-04-23T18:00:00Z',
      captured_by: 'system',
    },
    payload: {},
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
    quality_score: 65,
    summary: 'Latest mark is stale.',
    provenance: {
      provider: 'ICE',
      dataset: 'marks',
      record_id: 'hh-prompt',
      observed_at: '2026-04-22T20:00:00Z',
      ingested_at: '2026-04-23T18:00:00Z',
      captured_by: 'system',
    },
    payload: {},
  },
]

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
  price_unit_code: 'MMBTU',
  location_code: 'HENRY_HUB',
  delivery_start: '2026-05-01',
  delivery_end: '2026-05-31',
}

test('buildPreTradeSourceFreshnessSummary names impaired sources', () => {
  assert.equal(
    buildPreTradeSourceFreshnessSummary(snapshots),
    '1 of 2 source snapshots need review: Latest Mark.',
  )
})

test('buildPreTradeScenarioEnrichmentFromAnalysis preserves review rationale fields', () => {
  const analysis: PreTradeRecommendationDraftAnalysisRecord = {
    thesis: 'Use live evidence for the draft.',
    draft,
    source_scenario_id: 17,
    source_review_id: null,
    input_snapshots: snapshots,
    recommendation: {
      stance: 'PROCEED_WITH_CARE',
      headline: 'Proceed with basis controls before capture.',
      summary: 'The scenario is workable but needs stale-source review.',
      confidence: 'MEDIUM',
      score: 74,
      estimated_notional: 71000,
      projected_credit_utilization_pct: 18,
      current_net_position: 18000,
      related_active_trade_count: 2,
      latest_mark: 2.81,
      mark_gap_pct: 3,
      explanation: {
        stance_rationale: 'Proceed with care because source freshness degraded.',
        source_quality_rationale: 'One required market source is stale.',
        confidence_rationale: 'Confidence is medium until the mark refreshes.',
        primary_drivers: ['Residual exposure remains after the draft.'],
        reviewer_focus: ['Confirm whether the stale mark still supports the target price.'],
      },
      checks: [],
      next_actions: ['Refresh the latest Henry Hub mark before final capture.'],
      opportunity_summary: {
        title: 'Prompt gas offset',
        category: 'RISK_REDUCTION',
        detail: 'The draft reduces prompt imbalance without flipping the desk short.',
        driver_keys: [],
        source_refs: [],
      },
      arbitrage_candidate: null,
      residual_exposure: {
        current_net_position: 18000,
        proposed_trade_delta: -25000,
        residual_after_trade: -7000,
        direction_before: 'LONG',
        direction_after: 'SHORT',
        exposure_effect: 'OFFSETS',
        detail: 'Residual flips slightly short after the draft.',
        source_refs: [],
      },
      netting_candidates: [],
      hedge_recommendation: {
        instrument_type: 'SWAP',
        rationale: 'A prompt swap hedge keeps the structure internal until the mark refreshes.',
        target_delta: -25000,
        hedge_ratio: 1,
        policy_stops: ['Do not capture until the stale mark is refreshed.'],
        source_refs: [],
      },
      rejected_alternatives: [],
      missing_evidence: [
        {
          evidence_key: 'latest-mark',
          label: 'Latest Mark',
          severity: 'WARNING',
          detail: 'Latest Henry Hub prompt mark is stale.',
          source_refs: [],
        },
      ],
    },
    comparison: null,
    evaluated_at: '2026-04-23T18:00:00Z',
  }

  const enrichment = buildPreTradeScenarioEnrichmentFromAnalysis(analysis)

  assert.equal(enrichment?.opportunity_category, 'RISK_REDUCTION')
  assert.equal(enrichment?.hedge_intent, 'SWAP')
  assert.equal(enrichment?.recommendation_run_id, null)
  assert.match(enrichment?.residual_exposure_summary ?? '', /Residual flips slightly short/)
  assert.match(enrichment?.source_freshness_summary ?? '', /Latest Mark/)
  assert.ok(enrichment?.reviewer_focus.some((item) => item.includes('stale mark')))
})
