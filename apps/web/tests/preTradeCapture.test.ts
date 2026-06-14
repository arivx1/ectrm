import { describe, expect, it, vi } from 'vitest'

import {
  applyPreTradeScenarioToCaptureForm,
  buildPreTradeWorkflowNote,
} from '../src/features/trades/preTradeCapture'
import type { PreTradeReviewCaptureContext, PreTradeScenarioDraft } from '../src/shared/models'

describe('applyPreTradeScenarioToCaptureForm', () => {
  it('maps a pre-trade draft into the trade capture form setters and clears review context by default', () => {
    const draft: PreTradeScenarioDraft = {
      book: 'GAS_PHYS',
      portfolio: 'PROMPT',
      counterparty: 'SHELL_TRADING',
      commodity_class: 'NATURAL_GAS',
      commodity: 'HENRY_HUB',
      trade_side: 'BUY',
      pricing_type: 'FLOATING',
      price_index_code: 'NG_HH_PROMPT',
      target_price: 2.75,
      target_volume: 25000,
      trade_currency_code: 'USD',
      unit_of_measure: 'MMBTU',
      price_unit_code: 'MMBTU',
      location_code: 'HENRY_HUB',
      delivery_start: '2026-05-01',
      delivery_end: '2026-05-31',
    }

    const captureForm = {
      reset: vi.fn(),
      setPreTradeReviewContext: vi.fn(),
      setBookInput: vi.fn(),
      setBookSearchInput: vi.fn(),
      setCommodityClassInput: vi.fn(),
      setCommodityInput: vi.fn(),
      setTradeSideInput: vi.fn(),
      setPricingTypeInput: vi.fn(),
      setPriceIndexInput: vi.fn(),
      setPriceInput: vi.fn(),
      setVolumeInput: vi.fn(),
      setPortfolioInput: vi.fn(),
      setPortfolioSearchInput: vi.fn(),
      setCounterpartyInput: vi.fn(),
      setCounterpartySearchInput: vi.fn(),
      setTradeCurrencyInput: vi.fn(),
      setUnitInput: vi.fn(),
      setPriceUnitInput: vi.fn(),
      setLocationInput: vi.fn(),
      setDeliveryStartInput: vi.fn(),
      setDeliveryEndInput: vi.fn(),
    } as const

    applyPreTradeScenarioToCaptureForm(captureForm as never, draft)

    expect(captureForm.reset).toHaveBeenCalledOnce()
    expect(captureForm.setPreTradeReviewContext).toHaveBeenCalledWith(null)
    expect(captureForm.setBookInput).toHaveBeenCalledWith('GAS_PHYS')
    expect(captureForm.setCommodityInput).toHaveBeenCalledWith('HENRY_HUB')
    expect(captureForm.setPriceIndexInput).toHaveBeenCalledWith('NG_HH_PROMPT')
    expect(captureForm.setPriceInput).toHaveBeenCalledWith('2.75')
    expect(captureForm.setVolumeInput).toHaveBeenCalledWith('25000')
    expect(captureForm.setDeliveryEndInput).toHaveBeenCalledWith('2026-05-31')
  })

  it('attaches approved review context when a ticket is opened from the shared queue', () => {
    const draft: PreTradeScenarioDraft = {
      book: 'WEST_POWER',
      portfolio: 'REALTIME',
      counterparty: 'CASCADE_UTIL',
      commodity_class: 'POWER',
      commodity: 'MIDC_PEAK',
      trade_side: 'SELL',
      pricing_type: 'FIXED',
      price_index_code: null,
      target_price: 48.25,
      target_volume: 500,
      trade_currency_code: 'USD',
      unit_of_measure: 'MWH',
      price_unit_code: 'MWH',
      location_code: 'MIDC',
      delivery_start: '2026-06-01',
      delivery_end: '2026-06-30',
    }
    const reviewContext: PreTradeReviewCaptureContext = {
      reviewId: 42,
      reviewName: 'June peak hedge',
      reviewThesis: 'Short prompt exposure before heat-risk weekend.',
      reviewNotes: 'Approved for capture once the desk locks the fixed strip.',
      reviewOwner: 'risk.ops',
      sourceScenarioId: 7,
      recommendationRunId: 99,
      recommendationHeadline: 'Proceed with standard controls.',
      recommendationStance: 'PROCEED',
      recommendationScore: 96,
      recommendationRationale: 'Proceed is supported because all required checks passed.',
      enrichment: null,
      recommendationOverrideReason: null,
      recommendationOverrideBy: null,
      recommendationOverrideAt: null,
      approvedBy: 'chief.risk',
      approvedAt: '2026-04-15T15:30:00Z',
    }
    const captureForm = {
      reset: vi.fn(),
      setPreTradeReviewContext: vi.fn(),
      setBookInput: vi.fn(),
      setBookSearchInput: vi.fn(),
      setCommodityClassInput: vi.fn(),
      setCommodityInput: vi.fn(),
      setTradeSideInput: vi.fn(),
      setPricingTypeInput: vi.fn(),
      setPriceIndexInput: vi.fn(),
      setPriceInput: vi.fn(),
      setVolumeInput: vi.fn(),
      setPortfolioInput: vi.fn(),
      setPortfolioSearchInput: vi.fn(),
      setCounterpartyInput: vi.fn(),
      setCounterpartySearchInput: vi.fn(),
      setTradeCurrencyInput: vi.fn(),
      setUnitInput: vi.fn(),
      setPriceUnitInput: vi.fn(),
      setLocationInput: vi.fn(),
      setDeliveryStartInput: vi.fn(),
      setDeliveryEndInput: vi.fn(),
    } as const

    applyPreTradeScenarioToCaptureForm(captureForm as never, draft, reviewContext)

    expect(captureForm.setPreTradeReviewContext).toHaveBeenCalledWith(reviewContext)
    expect(captureForm.setBookInput).toHaveBeenCalledWith('WEST_POWER')
    expect(captureForm.setPriceInput).toHaveBeenCalledWith('48.25')
  })
})

describe('buildPreTradeWorkflowNote', () => {
  it('builds a workflow note from the approved review context', () => {
    const note = buildPreTradeWorkflowNote({
      reviewId: 42,
      reviewName: 'June peak hedge',
      reviewThesis: 'Short prompt exposure before heat-risk weekend.',
      reviewNotes: 'Approved for capture once the desk locks the fixed strip.',
      reviewOwner: 'risk.ops',
      sourceScenarioId: 7,
      recommendationRunId: 99,
      recommendationHeadline: 'Proceed with standard controls.',
      recommendationStance: 'PROCEED',
      recommendationScore: 96,
      recommendationRationale: 'Proceed is supported because all required checks passed.',
      enrichment: {
        opportunity_category: 'RISK_REDUCTION',
        hedge_intent: 'SWAP',
        residual_exposure_summary: 'Residual exposure falls inside desk appetite.',
        source_freshness_summary: 'All 6 source snapshots were OK at capture.',
        reviewer_focus: ['Confirm the desk still wants the prompt hedge.'],
        recommendation_run_id: 99,
        recommendation_run_key: 'run-99',
        recommendation_stance: 'PROCEED',
        recommendation_score: 96,
        recommendation_headline: 'Proceed with standard controls.',
        captured_at: '2026-04-15T15:20:00Z',
      },
      recommendationOverrideReason: 'Credit approved the temporary utilization overage.',
      recommendationOverrideBy: 'chief.risk',
      recommendationOverrideAt: '2026-04-15T15:29:00Z',
      approvedBy: 'chief.risk',
      approvedAt: '2026-04-15T15:30:00Z',
    })

    expect(note).toContain('Pre-trade governance context attached from approved shared review.')
    expect(note).toContain('Review: #42 June peak hedge')
    expect(note).toContain('Approved: chief.risk • 2026-04-15T15:30:00Z')
    expect(note).toContain('Source scenario: #7')
    expect(note).toContain('Recommendation run: #99 • PROCEED • score 96')
    expect(note).toContain('Recommendation: Proceed with standard controls.')
    expect(note).toContain('Recommendation rationale: Proceed is supported because all required checks passed.')
    expect(note).toContain('Opportunity category: RISK REDUCTION')
    expect(note).toContain('Hedge intent: SWAP')
    expect(note).toContain('Source freshness: All 6 source snapshots were OK at capture.')
    expect(note).toContain('Reviewer focus: Confirm the desk still wants the prompt hedge.')
    expect(note).toContain('Recommendation override: Credit approved the temporary utilization overage. • chief.risk • 2026-04-15T15:29:00Z')
    expect(note).toContain('Review notes: Approved for capture once the desk locks the fixed strip.')
  })
})
