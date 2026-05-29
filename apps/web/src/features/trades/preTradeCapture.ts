import type { useTradeCaptureForm } from './useTradeCaptureForm'
import type { PreTradeReviewCaptureContext, PreTradeScenarioDraft } from '../../shared/models'

function toInputNumber(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function applyPreTradeScenarioToCaptureForm(
  captureForm: ReturnType<typeof useTradeCaptureForm>,
  draft: PreTradeScenarioDraft,
  reviewContext: PreTradeReviewCaptureContext | null = null,
) {
  captureForm.reset()
  captureForm.setPreTradeReviewContext(reviewContext)
  captureForm.setBookInput(draft.book)
  captureForm.setBookSearchInput(draft.book)
  captureForm.setCommodityClassInput(draft.commodity_class)
  captureForm.setCommodityInput(draft.commodity)
  captureForm.setTradeSideInput(draft.trade_side)
  captureForm.setPricingTypeInput(draft.pricing_type)
  captureForm.setPriceIndexInput(draft.price_index_code ?? '')
  captureForm.setPriceInput(toInputNumber(draft.target_price))
  captureForm.setVolumeInput(toInputNumber(draft.target_volume))
  captureForm.setPortfolioInput(draft.portfolio ?? '')
  captureForm.setPortfolioSearchInput(draft.portfolio ?? '')
  captureForm.setCounterpartyInput(draft.counterparty ?? '')
  captureForm.setCounterpartySearchInput(draft.counterparty ?? '')
  captureForm.setTradeCurrencyInput(draft.trade_currency_code ?? '')
  captureForm.setUnitInput(draft.unit_of_measure ?? '')
  captureForm.setPriceUnitInput(draft.price_unit_code ?? '')
  captureForm.setLocationInput(draft.location_code ?? '')
  captureForm.setDeliveryStartInput(draft.delivery_start ?? '')
  captureForm.setDeliveryEndInput(draft.delivery_end ?? '')
}

export function buildPreTradeWorkflowNote(reviewContext: PreTradeReviewCaptureContext): string {
  const reviewName = normalizeOptionalText(reviewContext.reviewName) ?? 'Untitled review'
  const reviewOwner = normalizeOptionalText(reviewContext.reviewOwner)
  const reviewThesis = normalizeOptionalText(reviewContext.reviewThesis)
  const reviewNotes = normalizeOptionalText(reviewContext.reviewNotes)
  const enrichment = reviewContext.enrichment
  const recommendationSummary = [
    reviewContext.recommendationRunId ?? enrichment?.recommendation_run_id
      ? `#${reviewContext.recommendationRunId ?? enrichment?.recommendation_run_id}`
      : null,
    normalizeOptionalText(reviewContext.recommendationStance ?? enrichment?.recommendation_stance),
    typeof (reviewContext.recommendationScore ?? enrichment?.recommendation_score) === 'number'
      ? `score ${reviewContext.recommendationScore ?? enrichment?.recommendation_score}`
      : null,
  ]
    .filter(Boolean)
    .join(' • ')
  const approvalSummary = [normalizeOptionalText(reviewContext.approvedBy), normalizeOptionalText(reviewContext.approvedAt)]
    .filter(Boolean)
    .join(' • ')
  const lines = [
    'Pre-trade governance context attached from approved shared review.',
    `Review: #${reviewContext.reviewId} ${reviewName}`,
  ]

  if (approvalSummary) {
    lines.push(`Approved: ${approvalSummary}`)
  }
  if (reviewOwner) {
    lines.push(`Review owner: ${reviewOwner}`)
  }
  if (typeof reviewContext.sourceScenarioId === 'number') {
    lines.push(`Source scenario: #${reviewContext.sourceScenarioId}`)
  }
  if (recommendationSummary) {
    lines.push(`Recommendation run: ${recommendationSummary}`)
  }
  if (reviewContext.recommendationHeadline ?? enrichment?.recommendation_headline) {
    lines.push(`Recommendation: ${reviewContext.recommendationHeadline ?? enrichment?.recommendation_headline}`)
  }
  if (reviewContext.recommendationRationale) {
    lines.push(`Recommendation rationale: ${reviewContext.recommendationRationale}`)
  }
  if (enrichment?.opportunity_category) {
    lines.push(`Opportunity category: ${enrichment.opportunity_category.replaceAll('_', ' ')}`)
  }
  if (enrichment?.hedge_intent) {
    lines.push(`Hedge intent: ${enrichment.hedge_intent.replaceAll('_', ' ')}`)
  }
  if (enrichment?.residual_exposure_summary) {
    lines.push(`Residual exposure: ${enrichment.residual_exposure_summary}`)
  }
  if (enrichment?.source_freshness_summary) {
    lines.push(`Source freshness: ${enrichment.source_freshness_summary}`)
  }
  if (enrichment?.reviewer_focus.length) {
    lines.push(`Reviewer focus: ${enrichment.reviewer_focus.join(' | ')}`)
  }
  if (reviewContext.recommendationOverrideReason) {
    const overrideSummary = [
      normalizeOptionalText(reviewContext.recommendationOverrideReason),
      normalizeOptionalText(reviewContext.recommendationOverrideBy),
      normalizeOptionalText(reviewContext.recommendationOverrideAt),
    ]
      .filter(Boolean)
      .join(' • ')
    lines.push(`Recommendation override: ${overrideSummary}`)
  }
  if (reviewThesis) {
    lines.push(`Thesis: ${reviewThesis}`)
  }
  if (reviewNotes) {
    lines.push(`Review notes: ${reviewNotes}`)
  }

  return lines.join('\n')
}
