import type { useTradeCaptureForm } from './useTradeCaptureForm'
import type { PreTradeScenarioDraft } from '../../shared/models'

function toInputNumber(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

export function applyPreTradeScenarioToCaptureForm(
  captureForm: ReturnType<typeof useTradeCaptureForm>,
  draft: PreTradeScenarioDraft,
) {
  captureForm.reset()
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
