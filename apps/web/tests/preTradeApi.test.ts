import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const { fetchJsonMock, patchJsonMock, postJsonMock, requestOkMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  patchJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
  requestOkMock: vi.fn(),
}))

vi.mock('../src/shared/api.ts', () => ({
  fetchJson: fetchJsonMock,
  patchJson: patchJsonMock,
  postJson: postJsonMock,
  requestOk: requestOkMock,
}))

import {
  analyzePreTradeRecommendationDraft,
  createPreTradeRecommendationRun,
  createPreTradeReviewItem,
  createPreTradeScenario,
  loadPreTradeHedgeRecommendations,
  loadPreTradeNettingSets,
  loadPreTradeReviewDrift,
  loadPreTradeRiskScenarios,
  promotePreTradeHedgeRecommendationFromGovernance,
  promotePreTradeNettingSetFromGovernance,
  promotePreTradeRiskScenarioFromGovernance,
} from '../src/entities/pretrade/api.ts'

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

beforeEach(() => {
  fetchJsonMock.mockReset()
  patchJsonMock.mockReset()
  postJsonMock.mockReset()
  requestOkMock.mockReset()
})

test('analyzePreTradeRecommendationDraft posts the shared draft-analysis contract', async () => {
  const expected = {
    thesis: 'Use live evidence for the draft.',
    draft,
    source_scenario_id: 17,
    source_review_id: null,
    input_snapshots: [],
    recommendation: {
      stance: 'PROCEED',
      headline: 'Proceed with standard controls.',
      summary: 'Aligned enough to hand into capture.',
      confidence: 'HIGH',
      score: 100,
      estimated_notional: 71000,
      projected_credit_utilization_pct: 18,
      current_net_position: 1000,
      related_active_trade_count: 1,
      latest_mark: 2.83,
      mark_gap_pct: 0,
      explanation: {
        stance_rationale: 'Proceed is supported because current live evidence is aligned.',
        source_quality_rationale: 'Required source adapters captured clean evidence.',
        confidence_rationale: 'High confidence.',
        primary_drivers: [],
        reviewer_focus: [],
      },
      checks: [],
      next_actions: [],
      opportunity_summary: null,
      arbitrage_candidate: null,
      residual_exposure: null,
      netting_candidates: [],
      hedge_recommendation: null,
      rejected_alternatives: [],
      missing_evidence: [],
    },
    comparison: null,
    evaluated_at: '2026-04-23T18:00:00Z',
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await analyzePreTradeRecommendationDraft('http://api.test', 'token-123', {
    thesis: 'Use live evidence for the draft.',
    draft,
    source_scenario_id: 17,
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/pretrade/recommendations/draft-analysis')
  assert.deepEqual(body, {
    thesis: 'Use live evidence for the draft.',
    draft,
    source_scenario_id: 17,
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer token-123')
})

test('createPreTradeRecommendationRun can rely on server-collected live snapshots', async () => {
  const expected = {
    run_id: 44,
    run_key: 'run-44',
    name: 'May gas hedge recommendation',
    thesis: 'Server collected live snapshots.',
    draft,
    source_scenario_id: 17,
    source_review_id: null,
    input_snapshots: [],
    recommendation: {
      stance: 'PROCEED',
      headline: 'Proceed with standard controls.',
      summary: 'Aligned enough to hand into capture.',
      confidence: 'HIGH',
      score: 100,
      estimated_notional: 71000,
      projected_credit_utilization_pct: 18,
      current_net_position: 1000,
      related_active_trade_count: 1,
      latest_mark: 2.83,
      mark_gap_pct: 0,
      explanation: {
        stance_rationale: 'Proceed is supported because current live evidence is aligned.',
        source_quality_rationale: 'Required source adapters captured clean evidence.',
        confidence_rationale: 'High confidence.',
        primary_drivers: [],
        reviewer_focus: [],
      },
      checks: [],
      next_actions: [],
      opportunity_summary: null,
      arbitrage_candidate: null,
      residual_exposure: null,
      netting_candidates: [],
      hedge_recommendation: null,
      rejected_alternatives: [],
      missing_evidence: [],
    },
    comparison: null,
    created_at: '2026-04-23T18:00:00Z',
    created_by: 'trader_one',
    updated_at: '2026-04-23T18:00:00Z',
    updated_by: 'trader_one',
    version: 1,
    can_edit: true,
  }
  postJsonMock.mockResolvedValueOnce(expected)

  const payload = await createPreTradeRecommendationRun('http://api.test', 'token-123', {
    name: 'May gas hedge recommendation',
    thesis: 'Server collected live snapshots.',
    draft,
    source_scenario_id: 17,
  })

  assert.equal(payload, expected)
  const [url, body, init] = postJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/pretrade/recommendations/runs')
  assert.deepEqual(body, {
    name: 'May gas hedge recommendation',
    thesis: 'Server collected live snapshots.',
    draft,
    source_scenario_id: 17,
  })
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer token-123')
})

test('scenario and review payloads can include optional pre-trade enrichment', async () => {
  const enrichment = {
    opportunity_category: 'RISK_REDUCTION' as const,
    hedge_intent: 'SWAP' as const,
    residual_exposure_summary: 'Residual exposure falls inside desk appetite.',
    source_freshness_summary: 'All 6 source snapshots were OK at capture.',
    reviewer_focus: ['Confirm target price against the latest mark.'],
    recommendation_run_id: 44,
    recommendation_run_key: 'run-44',
    recommendation_stance: 'PROCEED' as const,
    recommendation_score: 96,
    recommendation_headline: 'Proceed with standard controls.',
    captured_at: '2026-04-23T18:00:00Z',
  }
  postJsonMock.mockResolvedValueOnce({
    scenario_id: 17,
    name: 'May gas hedge',
    thesis: 'Use live evidence.',
    draft,
    enrichment,
    created_at: '2026-04-23T18:00:00Z',
    created_by: 'trader_one',
    updated_at: '2026-04-23T18:00:00Z',
    updated_by: 'trader_one',
    version: 1,
    can_edit: true,
  })
  postJsonMock.mockResolvedValueOnce({
    review_id: 22,
    name: 'May gas hedge',
    thesis: 'Use live evidence.',
    draft,
    source_scenario_id: 17,
    recommendation_run_id: 44,
    enrichment,
    recommendation_summary: null,
    recommendation_override_reason: null,
    recommendation_override_by: null,
    recommendation_override_at: null,
    review_status: 'OPEN',
    owner: null,
    due_at: null,
    review_notes: 'Review the enriched handoff.',
    linked_trade_id: null,
    linked_trade_status: null,
    booked_at: null,
    booked_by: null,
    approval_governance_snapshot: null,
    booking_governance_snapshot: null,
    activity: [],
    created_at: '2026-04-23T18:00:00Z',
    created_by: 'trader_one',
    updated_at: '2026-04-23T18:00:00Z',
    updated_by: 'trader_one',
    version: 1,
    can_edit: true,
  })

  await createPreTradeScenario('http://api.test', 'token-123', {
    name: 'May gas hedge',
    thesis: 'Use live evidence.',
    draft,
    enrichment,
  })
  await createPreTradeReviewItem('http://api.test', 'token-123', {
    name: 'May gas hedge',
    thesis: 'Use live evidence.',
    draft,
    source_scenario_id: 17,
    recommendation_run_id: 44,
    enrichment,
    review_notes: 'Review the enriched handoff.',
  })

  assert.deepEqual(postJsonMock.mock.calls[0][1], {
    name: 'May gas hedge',
    thesis: 'Use live evidence.',
    draft,
    enrichment,
  })
  assert.deepEqual(postJsonMock.mock.calls[1][1], {
    name: 'May gas hedge',
    thesis: 'Use live evidence.',
    draft,
    source_scenario_id: 17,
    recommendation_run_id: 44,
    enrichment,
    review_notes: 'Review the enriched handoff.',
  })
})

test('loadPreTradeReviewDrift fetches the review drift contract', async () => {
  const expected = {
    review_id: 12,
    checked_at: '2026-04-24T18:00:00Z',
    review_status: 'APPROVED',
    alignment_status: 'REAPPROVAL_REQUIRED',
    requires_reapproval: true,
    approval_snapshot_generated_at: '2026-04-24T17:55:00Z',
    approval_snapshot_exported_by: 'trader_two',
    approved_by: 'trader_two',
    approved_at: '2026-04-24T17:55:00Z',
    approved_recommendation_run_id: 41,
    approved_recommendation_stance: 'ESCALATE',
    approved_recommendation_score: 70,
    current_recommendation_run_id: 44,
    current_recommendation_stance: 'WAIT_FOR_DATA',
    current_recommendation_score: 55,
    latest_recommendation_run_id: 44,
    latest_recommendation_stance: 'WAIT_FOR_DATA',
    latest_recommendation_score: 55,
    current_impaired_sources: ['Latest Mark'],
    reasons: [
      {
        code: 'RECOMMENDATION_CHANGED',
        summary: 'Attached recommendation changed since approval.',
        detail: 'Approved and current recommendations no longer match.',
      },
    ],
  }
  fetchJsonMock.mockResolvedValueOnce(expected)

  const payload = await loadPreTradeReviewDrift('http://api.test', 'token-123', 12)

  assert.equal(payload, expected)
  const [url, init] = fetchJsonMock.mock.calls[0]
  assert.equal(url, 'http://api.test/pretrade/reviews/12/drift')
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer token-123')
  assert.equal((init as RequestInit | undefined)?.cache, 'no-store')
})

test('netting-set promotion endpoints use the governance contract', async () => {
  fetchJsonMock.mockResolvedValueOnce([])
  postJsonMock.mockResolvedValueOnce({
    netting_set_id: 7,
    netting_set_key: 'netting-draft-7',
    name: 'GAS_PHYS HENRY_HUB Exact netting review draft',
    status: 'REVIEW_DRAFT',
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
    source_promotion_candidate_type: 'NETTING_SET',
    source_promotion_status: 'WATCH',
    source_promotion_score: 43,
    source_review_count: 1,
    source_approved_review_count: 1,
    source_booked_review_count: 0,
    source_override_count: 0,
    source_run_count: 1,
    source_latest_review_id: 22,
    source_latest_run_id: 44,
    source_sample_review_ids: [22],
    source_sample_run_ids: [44],
    source_evidence_summary: '1 review, 1 approved, 0 booked, 0 overrides, 1 recommendation run.',
    source_promotion_rationale: 'Reviewer activity reused netting set evidence.',
    source_stop_reasons: ['No booked trade has reused this pattern yet.'],
    draft,
    netting_candidates: [],
    created_at: '2026-04-24T18:00:00Z',
    created_by: 'trader_two',
    updated_at: '2026-04-24T18:00:00Z',
    updated_by: 'trader_two',
    version: 1,
    can_edit: true,
  })

  await loadPreTradeNettingSets('http://api.test', 'token-123')
  await promotePreTradeNettingSetFromGovernance('http://api.test', 'token-123', {
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
  })

  const [getUrl, getInit] = fetchJsonMock.mock.calls[0]
  assert.equal(getUrl, 'http://api.test/pretrade/netting-sets')
  assert.equal(new Headers((getInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer token-123')
  assert.equal((getInit as RequestInit | undefined)?.cache, 'no-store')

  const [postUrl, body, postInit] = postJsonMock.mock.calls[0]
  assert.equal(postUrl, 'http://api.test/pretrade/netting-sets/from-promotion')
  assert.deepEqual(body, {
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
  })
  assert.equal(new Headers((postInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer token-123')
})

test('hedge-recommendation promotion endpoints use the governance contract', async () => {
  fetchJsonMock.mockResolvedValueOnce([])
  postJsonMock.mockResolvedValueOnce({
    hedge_recommendation_id: 9,
    hedge_recommendation_key: 'hedge-draft-9',
    name: 'GAS_PHYS HENRY_HUB Swap hedge review draft',
    status: 'REVIEW_DRAFT',
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
    source_promotion_candidate_type: 'HEDGE_RECOMMENDATION',
    source_promotion_status: 'WATCH',
    source_promotion_score: 72,
    source_review_count: 1,
    source_approved_review_count: 1,
    source_booked_review_count: 1,
    source_override_count: 1,
    source_run_count: 1,
    source_latest_review_id: 22,
    source_latest_run_id: 44,
    source_sample_review_ids: [22],
    source_sample_run_ids: [44],
    source_evidence_summary: '1 review, 1 approved, 1 booked, 1 override, 1 recommendation run.',
    source_promotion_rationale: 'Reviewer activity reused hedge recommendation evidence.',
    source_stop_reasons: ['Promotion evidence includes override decisions.'],
    source_recommendation_stance: 'ESCALATE',
    source_recommendation_score: 70,
    source_recommendation_headline: 'Escalate before capture.',
    draft,
    residual_exposure: null,
    hedge_recommendation: {
      instrument_type: 'SWAP',
      decision_key: 'linear_basis_or_floating_swap',
      rationale: 'Review an index-linked swap.',
      target_delta: -26000,
      hedge_ratio: 1,
      decision_factors: ['residual_delta=26000'],
      policy_stops: [],
      source_refs: [],
    },
    rejected_alternatives: [],
    missing_evidence: [],
    created_at: '2026-04-24T18:00:00Z',
    created_by: 'trader_two',
    updated_at: '2026-04-24T18:00:00Z',
    updated_by: 'trader_two',
    version: 1,
    can_edit: true,
  })

  await loadPreTradeHedgeRecommendations('http://api.test', 'token-123')
  await promotePreTradeHedgeRecommendationFromGovernance('http://api.test', 'token-123', {
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
  })

  const [getUrl, getInit] = fetchJsonMock.mock.calls[0]
  assert.equal(getUrl, 'http://api.test/pretrade/hedge-recommendations')
  assert.equal(new Headers((getInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer token-123')
  assert.equal((getInit as RequestInit | undefined)?.cache, 'no-store')

  const [postUrl, body, postInit] = postJsonMock.mock.calls[0]
  assert.equal(postUrl, 'http://api.test/pretrade/hedge-recommendations/from-promotion')
  assert.deepEqual(body, {
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
  })
  assert.equal(new Headers((postInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer token-123')
})

test('risk-scenario promotion endpoints use the governance contract', async () => {
  fetchJsonMock.mockResolvedValueOnce([])
  postJsonMock.mockResolvedValueOnce({
    risk_scenario_id: 11,
    risk_scenario_key: 'risk-draft-11',
    name: 'GAS_PHYS HENRY_HUB risk scenario review draft',
    status: 'REVIEW_DRAFT',
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
    source_promotion_candidate_type: 'RISK_SCENARIO',
    source_promotion_status: 'WATCH',
    source_promotion_score: 58,
    source_review_count: 1,
    source_approved_review_count: 1,
    source_booked_review_count: 0,
    source_override_count: 0,
    source_run_count: 1,
    source_latest_review_id: 22,
    source_latest_run_id: 44,
    source_sample_review_ids: [22],
    source_sample_run_ids: [44],
    source_evidence_summary: '1 review, 1 approved, 0 booked, 0 overrides, 1 recommendation run.',
    source_promotion_rationale: 'Reviewer activity reused Risk triage evidence.',
    source_stop_reasons: ['No booked trade has reused this pattern yet.'],
    source_review_name: 'Risk triage offset review',
    source_review_status: 'APPROVED',
    source_review_thesis: 'Offset prompt-month exposure.',
    source_review_notes: 'Review residual exposure before capture.',
    source_review_owner: 'risk.owner',
    source_recommendation_stance: 'PROCEED',
    source_recommendation_score: 82,
    source_recommendation_headline: 'Proceed with standard controls.',
    draft,
    enrichment: {
      opportunity_category: 'EXPOSURE_OFFSET',
      hedge_intent: 'NO_HEDGE',
      residual_exposure_summary: 'Offsets current exposure.',
      source_freshness_summary: 'Live sources are fresh.',
      reviewer_focus: ['Confirm residual exposure after proposed trade.'],
      recommendation_run_id: 44,
      recommendation_run_key: 'run-44',
      recommendation_stance: 'PROCEED',
      recommendation_score: 82,
      recommendation_headline: 'Proceed with standard controls.',
      captured_at: '2026-04-24T18:00:00Z',
    },
    residual_exposure: {
      current_net_position: 25000,
      proposed_trade_delta: -25000,
      residual_after_trade: 0,
      direction_before: 'LONG',
      direction_after: 'FLAT',
      exposure_effect: 'OFFSETS',
      detail: 'The draft offsets current exposure.',
      source_refs: [],
    },
    input_snapshots: [],
    missing_evidence: [],
    reviewer_focus: ['Confirm residual exposure after proposed trade.'],
    created_at: '2026-04-24T18:00:00Z',
    created_by: 'trader_two',
    updated_at: '2026-04-24T18:00:00Z',
    updated_by: 'trader_two',
    version: 1,
    can_edit: true,
  })

  await loadPreTradeRiskScenarios('http://api.test', 'token-123')
  await promotePreTradeRiskScenarioFromGovernance('http://api.test', 'token-123', {
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
  })

  const [getUrl, getInit] = fetchJsonMock.mock.calls[0]
  assert.equal(getUrl, 'http://api.test/pretrade/risk-scenarios')
  assert.equal(new Headers((getInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer token-123')
  assert.equal((getInit as RequestInit | undefined)?.cache, 'no-store')

  const [postUrl, body, postInit] = postJsonMock.mock.calls[0]
  assert.equal(postUrl, 'http://api.test/pretrade/risk-scenarios/from-promotion')
  assert.deepEqual(body, {
    owner: 'risk.owner',
    review_note: 'Owner review requested.',
  })
  assert.equal(new Headers((postInit as RequestInit | undefined)?.headers).get('Authorization'), 'Bearer token-123')
})
