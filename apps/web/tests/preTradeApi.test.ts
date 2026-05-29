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
  loadPreTradeReviewDrift,
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
