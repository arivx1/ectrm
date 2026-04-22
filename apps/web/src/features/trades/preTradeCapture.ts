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
  if (reviewThesis) {
    lines.push(`Thesis: ${reviewThesis}`)
  }
  if (reviewNotes) {
    lines.push(`Review notes: ${reviewNotes}`)
  }

  return lines.join('\n')
}
