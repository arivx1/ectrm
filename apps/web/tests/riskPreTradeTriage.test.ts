import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { RiskWorkspace } from '../src/workspaces/risk/RiskWorkspace'
import {
  buildRiskPreTradeReviewNotes,
  buildRiskPreTradeTriageCandidates,
} from '../src/workspaces/risk/riskPreTradeTriage'
import type {
  PreTradeRecommendationRunRecord,
  PriceIndexObservationRecord,
  Trade,
} from '../src/shared/models'

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    trade_id: 'TRD-1',
    originating_option_trade_id: null,
    external_trade_id: null,
    source_system: null,
    created_at: '2026-05-28T12:00:00Z',
    updated_at: '2026-05-28T12:00:00Z',
    execution_timestamp: '2026-05-28T12:00:00Z',
    trade_date: '2026-05-28',
    effective_start_date: '2026-06-01',
    effective_end_date: '2026-06-30',
    quality_spec: null,
    unit_of_measure: 'MMBTU',
    trade_currency_code: 'USD',
    location_code: 'HENRY_HUB',
    delivery_start: '2026-06-01',
    delivery_end: '2026-06-30',
    price_unit_code: 'MMBTU',
    instrument_type: 'PHYSICAL',
    option_type: null,
    option_style: null,
    option_strike_price: null,
    option_expiration_date: null,
    trade_nature: 'PHYSICAL',
    trade_structure: 'FLAT',
    trade_side: 'BUY',
    book: 'GAS_PHYS',
    portfolio: 'PROMPT',
    counterparty: 'SHELL_TRADING',
    commodity_class: 'NATURAL_GAS',
    commodity: 'HENRY_HUB',
    pricing_type: 'FLOATING',
    pricing_status: 'UNPRICED',
    confirmation_status: 'PENDING',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    actualization_status: 'PENDING',
    price_index_code: 'NG_HH_PROMPT',
    price: 2.75,
    volume: 18000,
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    trader_user: 'risk.user',
    status: 'ACTIVE',
    last_event_id: 'evt-1',
    ...overrides,
  }
}

function mark(overrides: Partial<PriceIndexObservationRecord> = {}): PriceIndexObservationRecord {
  return {
    id: 1,
    price_index_code: 'NG_HH_PROMPT',
    observation_date: '2026-05-28',
    value: 2.84,
    unit_code: 'MMBTU',
    currency_code: 'USD',
    source_provider: 'ICE',
    source_series_id: 'NG-HH',
    source_frequency: 'DAILY',
    source_published_at: '2026-05-28T17:00:00Z',
    source_revision: null,
    downloaded_at: '2026-05-28T17:05:00Z',
    run_id: 1,
    created_at: '2026-05-28T17:05:00Z',
    updated_at: '2026-05-28T17:05:00Z',
    ...overrides,
  }
}

function recommendationRun(): PreTradeRecommendationRunRecord {
  return {
    run_id: 7,
    run_key: 'run-0007',
    name: 'Risk triage recommendation',
    thesis: 'Reduce prompt exposure.',
    draft: {
      book: 'GAS_PHYS',
      portfolio: 'PROMPT',
      counterparty: 'SHELL_TRADING',
      commodity_class: 'NATURAL_GAS',
      commodity: 'HENRY_HUB',
      trade_side: 'SELL',
      pricing_type: 'FLOATING',
      price_index_code: 'NG_HH_PROMPT',
      target_price: 2.84,
      target_volume: 18000,
      trade_currency_code: 'USD',
      unit_of_measure: 'MMBTU',
      price_unit_code: 'MMBTU',
      location_code: 'HENRY_HUB',
      delivery_start: '2026-06-01',
      delivery_end: '2026-06-30',
    },
    source_scenario_id: 3,
    source_review_id: null,
    input_snapshots: [],
    recommendation: {
      stance: 'PROCEED_WITH_CARE',
      headline: 'Review offset before capture.',
      summary: 'The candidate reduces the current long but still needs desk review.',
      confidence: 'MEDIUM',
      score: 72,
      estimated_notional: 51120,
      projected_credit_utilization_pct: null,
      current_net_position: 18000,
      related_active_trade_count: 1,
      latest_mark: 2.84,
      mark_gap_pct: null,
      explanation: {
        stance_rationale: 'Proceed with care because the draft offsets exposure.',
        source_quality_rationale: 'Latest mark is available.',
        confidence_rationale: 'Confidence is medium because policy evidence still needs review.',
        primary_drivers: ['Residual exposure improves.'],
        reviewer_focus: ['Confirm commercial terms.'],
      },
      checks: [],
      next_actions: ['Submit to shared review.'],
      opportunity_summary: null,
      arbitrage_candidate: null,
      residual_exposure: {
        current_net_position: 18000,
        proposed_trade_delta: -18000,
        residual_after_trade: 0,
        direction_before: 'LONG',
        direction_after: 'FLAT',
        exposure_effect: 'OFFSETS',
        detail: 'Residual exposure is flat after the proposed offset.',
        source_refs: [],
      },
      netting_candidates: [],
      hedge_recommendation: {
        instrument_type: 'PHYSICAL_OFFSET',
        decision_key: 'validated_physical_offset_candidate',
        rationale: 'Review a physical offset before any financial hedge.',
        target_delta: -18000,
        hedge_ratio: 1,
        decision_factors: ['residual_delta=0'],
        policy_stops: [],
        source_refs: [],
      },
      rejected_alternatives: [],
      missing_evidence: [
        {
          evidence_key: 'hedge-policy',
          label: 'Hedge Policy',
          severity: 'WARNING',
          detail: 'Confirm hedge policy before approving the review.',
          source_refs: [],
        },
      ],
    },
    comparison: null,
    created_at: '2026-05-29T12:00:00Z',
    created_by: 'risk.user',
    updated_at: '2026-05-29T12:00:00Z',
    updated_by: 'risk.user',
    version: 1,
    can_edit: true,
  }
}

test('risk pre-trade triage builds an offset draft from live linear exposure', () => {
  const candidates = buildRiskPreTradeTriageCandidates({
    positions: [
      {
        commodity: 'HENRY_HUB',
        commodity_class: 'NATURAL_GAS',
        net_volume: 18000,
        updated_at: '2026-05-28T12:00:00Z',
      },
    ],
    activeTrades: [trade()],
    latestMarksByCode: {
      NG_HH_PROMPT: mark(),
    },
    asOf: new Date('2026-05-29T12:00:00Z'),
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.draft.trade_side, 'SELL')
  assert.equal(candidates[0]?.draft.target_volume, 18000)
  assert.equal(candidates[0]?.draft.target_price, 2.84)
  assert.equal(candidates[0]?.markStatus, 'FRESH')
  assert.deepEqual(candidates[0]?.sourceTradeIds, ['TRD-1'])
  assert.match(candidates[0]?.thesis ?? '', /review-only SELL draft/i)
})

test('risk pre-trade triage keeps stale mark evidence visible before review staging', () => {
  const candidates = buildRiskPreTradeTriageCandidates({
    positions: [
      {
        commodity: 'HENRY_HUB',
        commodity_class: 'NATURAL_GAS',
        net_volume: -12000,
        updated_at: '2026-05-28T12:00:00Z',
      },
    ],
    activeTrades: [trade({ trade_side: 'SELL', volume: -12000 })],
    latestMarksByCode: {
      NG_HH_PROMPT: mark({ observation_date: '2026-05-20' }),
    },
    asOf: new Date('2026-05-29T12:00:00Z'),
  })

  assert.equal(candidates[0]?.draft.trade_side, 'BUY')
  assert.equal(candidates[0]?.markStatus, 'STALE')
  assert.equal(candidates[0]?.tone, 'in-progress')
  assert.match(candidates[0]?.markStatusLabel ?? '', /stale/i)
})

test('risk pre-trade review notes carry source evidence and deterministic recommendation output', () => {
  const [candidate] = buildRiskPreTradeTriageCandidates({
    positions: [
      {
        commodity: 'HENRY_HUB',
        commodity_class: 'NATURAL_GAS',
        net_volume: 18000,
        updated_at: '2026-05-28T12:00:00Z',
      },
    ],
    activeTrades: [trade()],
    latestMarksByCode: {
      NG_HH_PROMPT: mark(),
    },
    asOf: new Date('2026-05-29T12:00:00Z'),
  })

  assert.ok(candidate)
  const notes = buildRiskPreTradeReviewNotes(candidate, recommendationRun())

  assert.match(notes, /Risk workspace triage/)
  assert.match(notes, /Source position/)
  assert.match(notes, /Latest mark/)
  assert.match(notes, /Recommendation: PROCEED WITH CARE/)
  assert.match(notes, /Residual exposure is flat/)
  assert.match(notes, /Hedge draft: PHYSICAL OFFSET/)
  assert.match(notes, /Manual review is required/)
})

test('risk workspace renders pre-trade triage candidates beside live exposure', () => {
  const activeTrade = trade()
  const markup = renderToStaticMarkup(
    createElement(RiskWorkspace, {
      authSession: null,
      globalFilter: '',
      trades: [activeTrade],
      activeTrades: [activeTrade],
      positionsByClass: [{ commodityClass: 'NATURAL_GAS', netVolume: 18000 }],
      positionsWithClass: [
        {
          commodity: 'HENRY_HUB',
          commodity_class: 'NATURAL_GAS',
          net_volume: 18000,
          updated_at: '2026-05-28T12:00:00Z',
        },
      ],
      optionExposures: [],
      formatCommodityClass: (value: string) => value.replaceAll('_', ' '),
      formatNumber: (value: number | null) => (value === null ? '—' : String(value)),
      formatMoney: (value: number | null) => (value === null ? '—' : `$${value}`),
      formatDate: (value: string | null | undefined) => value ?? '—',
      formatDateOnly: (value: string | null | undefined) => value ?? '—',
      onOpenTrade: () => undefined,
      onOpenPreTrade: () => undefined,
      onOptionLifecycleEvent: async () => undefined,
      optionLifecycleSubmittingEvent: null,
      optionLifecycleSubmittingTradeId: null,
    }),
  )

  assert.match(markup, /Pre-Trade Risk Triage/)
  assert.match(markup, /Create Review Scenario/)
  assert.match(markup, /Source Position/)
  assert.match(markup, /NG_HH_PROMPT mark is missing/)
  assert.match(markup, /Review-only scenario staging/)
})
