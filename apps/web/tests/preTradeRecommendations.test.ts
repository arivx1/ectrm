import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildPreTradeRecommendationWorkspaceBrief } from '../src/workspaces/pretrade/preTradeRecommendations'
import type {
  PreTradeRecommendationDraftAnalysisRecord,
  PreTradeRecommendationResultRecord,
  PreTradeRecommendationSourceSnapshotRecord,
} from '../src/shared/models'

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

function sourceSnapshot(
  overrides: Partial<PreTradeRecommendationSourceSnapshotRecord>,
): PreTradeRecommendationSourceSnapshotRecord {
  return {
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
    ...overrides,
  }
}

const baseRecommendation: PreTradeRecommendationResultRecord = {
  stance: 'PROCEED',
  headline: 'Proceed with offset controls.',
  summary: 'The scenario reduces prompt exposure and keeps the handoff reviewable.',
  confidence: 'HIGH',
  score: 88,
  estimated_notional: 71000,
  projected_credit_utilization_pct: 18,
  current_net_position: 18000,
  related_active_trade_count: 2,
  latest_mark: 2.81,
  mark_gap_pct: 3,
  explanation: {
    stance_rationale: 'Proceed because the draft offsets an existing long book.',
    source_quality_rationale: 'Required source snapshots are fresh.',
    confidence_rationale: 'Confidence is high because required evidence is available.',
    primary_drivers: ['Residual exposure improves after the draft.'],
    reviewer_focus: ['Confirm final commercial terms before capture.'],
  },
  checks: [],
  next_actions: ['Submit the scenario for desk review.'],
  opportunity_summary: {
    title: 'Prompt gas offset',
    category: 'RISK_REDUCTION',
    detail: 'The draft reduces prompt imbalance without flipping the desk short.',
    driver_keys: ['residual-exposure'],
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
    rationale: 'A prompt swap hedge keeps the structure internal until final review.',
    target_delta: -25000,
    hedge_ratio: 1,
    policy_stops: [],
    source_refs: [],
  },
  rejected_alternatives: [],
  missing_evidence: [],
}

function analysis(
  overrides: {
    snapshots?: PreTradeRecommendationSourceSnapshotRecord[]
    recommendation?: Partial<PreTradeRecommendationResultRecord>
  } = {},
): PreTradeRecommendationDraftAnalysisRecord {
  const recommendation = {
    ...baseRecommendation,
    ...overrides.recommendation,
    explanation: {
      ...baseRecommendation.explanation,
      ...overrides.recommendation?.explanation,
    },
  }
  return {
    thesis: 'Use live evidence for the draft.',
    draft,
    source_scenario_id: 17,
    source_review_id: null,
    input_snapshots: overrides.snapshots ?? [sourceSnapshot({})],
    recommendation,
    comparison: null,
    evaluated_at: '2026-04-23T18:00:00Z',
  }
}

test('buildPreTradeRecommendationWorkspaceBrief fails closed to manual review without analysis', () => {
  const brief = buildPreTradeRecommendationWorkspaceBrief(null)

  assert.equal(brief.ready, false)
  assert.equal(brief.tone, 'in-progress')
  assert.equal(brief.stanceLabel, 'MANUAL REVIEW')
  assert.match(brief.sourceSummary, /No source snapshots/)
  assert.match(brief.missingEvidenceSummary, /not run/i)
  assert.ok(brief.sections.some((section) => section.key === 'source-freshness'))
  assert.ok(brief.primaryFocus.some((item) => item.includes('Confirm structure')))
})

test('buildPreTradeRecommendationWorkspaceBrief surfaces stale source and warning evidence', () => {
  const brief = buildPreTradeRecommendationWorkspaceBrief(
    analysis({
      snapshots: [
        sourceSnapshot({}),
        sourceSnapshot({
          source_key: 'latest-mark',
          adapter_key: 'latest-mark',
          adapter_label: 'Latest Mark',
          source_type: 'EXTERNAL',
          freshness: 'STALE',
          quality_status: 'STALE',
          summary: 'Henry Hub prompt mark is stale.',
        }),
      ],
      recommendation: {
        stance: 'PROCEED_WITH_CARE',
        confidence: 'MEDIUM',
        missing_evidence: [
          {
            evidence_key: 'latest-mark',
            label: 'Latest Mark',
            severity: 'WARNING',
            detail: 'Latest Henry Hub prompt mark is stale.',
            source_refs: [],
          },
        ],
        hedge_recommendation: {
          instrument_type: 'SWAP',
          rationale: 'A prompt swap hedge keeps the structure internal until the mark refreshes.',
          target_delta: -25000,
          hedge_ratio: 1,
          policy_stops: ['Refresh the stale mark before final capture.'],
          source_refs: [],
        },
      },
    }),
  )

  assert.equal(brief.ready, true)
  assert.equal(brief.tone, 'in-progress')
  assert.match(brief.sourceSummary, /1 of 2/)
  assert.match(brief.missingEvidenceSummary, /0 blocking and 1 warning/)
  assert.ok(brief.sections.some((section) => section.key === 'opportunity'))
  assert.ok(brief.sections.some((section) => section.key === 'exposure'))
  assert.equal(brief.sections.find((section) => section.key === 'source-freshness')?.tone, 'in-progress')
  assert.equal(brief.sections.find((section) => section.key === 'missing-evidence')?.tone, 'in-progress')
  assert.equal(brief.sections.find((section) => section.key === 'hedge')?.tone, 'in-progress')
  assert.ok(brief.primaryFocus.some((item) => item.includes('stale mark')))
})

test('buildPreTradeRecommendationWorkspaceBrief blocks handoff when data is unavailable', () => {
  const brief = buildPreTradeRecommendationWorkspaceBrief(
    analysis({
      snapshots: [
        sourceSnapshot({
          source_key: 'weather-intelligence',
          adapter_key: 'weather-intelligence',
          adapter_label: 'Weather Intelligence',
          source_available: false,
          freshness: 'UNKNOWN',
          quality_status: 'MISSING',
          summary: 'Weather source is unavailable.',
        }),
      ],
      recommendation: {
        stance: 'WAIT_FOR_DATA',
        headline: 'Wait for source refresh.',
        summary: 'Required source evidence is missing.',
        missing_evidence: [
          {
            evidence_key: 'weather-intelligence',
            label: 'Weather Intelligence',
            severity: 'BLOCKING',
            detail: 'Weather intelligence is unavailable.',
            source_refs: [],
          },
        ],
        hedge_recommendation: {
          instrument_type: 'WAIT_FOR_DATA',
          rationale: 'No hedge draft should be used while required evidence is missing.',
          target_delta: null,
          hedge_ratio: null,
          policy_stops: ['Refresh required evidence first.'],
          source_refs: [],
        },
      },
    }),
  )

  assert.equal(brief.tone, 'blocked')
  assert.equal(brief.sections.find((section) => section.key === 'source-freshness')?.tone, 'blocked')
  assert.equal(brief.sections.find((section) => section.key === 'missing-evidence')?.tone, 'blocked')
  assert.equal(brief.sections.find((section) => section.key === 'hedge')?.tone, 'blocked')
  assert.ok(brief.primaryFocus.some((item) => item.includes('Weather intelligence')))
})
