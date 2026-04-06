import type {
  EventRow,
  ReferenceRecord,
  Trade,
  TradeLegDraft,
} from '../../shared/models.ts'
import {
  buildDefaultTradeLegs,
  tradeHeaderDefaults,
  tradeFormDefaults,
  tradeStructureSupportsLegs,
} from '../../shared/trading.ts'
import {
  makeLegDraft,
  findLatestPersistedLegs,
  toLocalDateTimeInput,
} from './tradeDraftUtils.ts'

export type AmendDraft = {
  externalTradeIdInput: string
  sourceSystemInput: string
  executionTimestampInput: string
  tradeDateInput: string
  effectiveStartDateInput: string
  effectiveEndDateInput: string
  qualitySpecInput: string
  unitInput: string
  tradeCurrencyInput: string
  locationInput: string
  deliveryStartInput: string
  deliveryEndInput: string
  priceUnitInput: string
  tradeNatureInput: string
  tradeStructureInput: string
  tradeSideInput: string
  bookInput: string
  portfolioInput: string
  counterpartyInput: string
  commodityClassInput: string
  commodityInput: string
  pricingTypeInput: string
  pricingStatusInput: string
  priceIndexInput: string
  priceInput: string
  volumeInput: string
  settlementStatusInput: string
  traderUserInput: string
  legs: TradeLegDraft[]
}

export function buildAmendDraft(
  selectedTrade: Trade | null,
  selectedTradeEvents: EventRow[],
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
): AmendDraft {
  if (selectedTrade) {
    const parsedLegs = findLatestPersistedLegs(selectedTradeEvents)
    const shouldBlockSyntheticSwapLegs =
      tradeStructureSupportsLegs(selectedTrade.trade_structure) && parsedLegs.length === 0

    return {
      externalTradeIdInput: selectedTrade.external_trade_id ?? tradeHeaderDefaults.external_trade_id,
      sourceSystemInput: selectedTrade.source_system ?? tradeHeaderDefaults.source_system,
      executionTimestampInput: toLocalDateTimeInput(selectedTrade.execution_timestamp),
      tradeDateInput: selectedTrade.trade_date ?? tradeHeaderDefaults.trade_date,
      effectiveStartDateInput:
        selectedTrade.effective_start_date ?? tradeHeaderDefaults.effective_start_date,
      effectiveEndDateInput:
        selectedTrade.effective_end_date ?? tradeHeaderDefaults.effective_end_date,
      qualitySpecInput: selectedTrade.quality_spec ?? tradeHeaderDefaults.quality_spec,
      unitInput: selectedTrade.unit_of_measure ?? tradeHeaderDefaults.unit_of_measure,
      tradeCurrencyInput:
        selectedTrade.trade_currency_code ?? tradeHeaderDefaults.trade_currency_code,
      locationInput: selectedTrade.location_code ?? tradeHeaderDefaults.location_code,
      deliveryStartInput: selectedTrade.delivery_start ?? tradeHeaderDefaults.delivery_start,
      deliveryEndInput: selectedTrade.delivery_end ?? tradeHeaderDefaults.delivery_end,
      priceUnitInput: selectedTrade.price_unit_code ?? tradeHeaderDefaults.price_unit_code,
      tradeNatureInput: selectedTrade.trade_nature ?? tradeFormDefaults.nature,
      tradeStructureInput: selectedTrade.trade_structure ?? tradeFormDefaults.structure,
      tradeSideInput: selectedTrade.trade_side ?? tradeFormDefaults.side,
      bookInput: selectedTrade.book ?? '',
      portfolioInput: selectedTrade.portfolio ?? tradeHeaderDefaults.portfolio,
      counterpartyInput: selectedTrade.counterparty ?? tradeHeaderDefaults.counterparty,
      commodityClassInput: selectedTrade.commodity_class ?? '',
      commodityInput: selectedTrade.commodity ?? '',
      pricingTypeInput: selectedTrade.pricing_type ?? tradeFormDefaults.pricingType,
      pricingStatusInput: selectedTrade.pricing_status ?? tradeHeaderDefaults.pricing_status,
      priceIndexInput: selectedTrade.price_index_code ?? '',
      priceInput: selectedTrade.price?.toString() ?? '',
      volumeInput: selectedTrade.volume?.toString() ?? '',
      settlementStatusInput: selectedTrade.settlement_status ?? tradeHeaderDefaults.settlement_status,
      traderUserInput: selectedTrade.trader_user ?? tradeHeaderDefaults.trader_user,
      legs:
        parsedLegs.length > 0
          ? parsedLegs
          : shouldBlockSyntheticSwapLegs
            ? []
            : buildDefaultTradeLegs(makeLegDraft, {
                firstLeg: {
                  side: selectedTrade.trade_side ?? tradeFormDefaults.side,
                  commodity_class: selectedTrade.commodity_class,
                  commodity: selectedTrade.commodity,
                  volume: selectedTrade.volume?.toString() ?? '',
                },
                secondLeg: {
                  commodity_class: selectedTrade.commodity_class,
                },
              }),
    }
  }

  return {
    externalTradeIdInput: tradeHeaderDefaults.external_trade_id,
    sourceSystemInput: tradeHeaderDefaults.source_system,
    executionTimestampInput: tradeHeaderDefaults.execution_timestamp,
    tradeDateInput: tradeHeaderDefaults.trade_date,
    effectiveStartDateInput: tradeHeaderDefaults.effective_start_date,
    effectiveEndDateInput: tradeHeaderDefaults.effective_end_date,
    qualitySpecInput: tradeHeaderDefaults.quality_spec,
    unitInput: tradeHeaderDefaults.unit_of_measure,
    tradeCurrencyInput: tradeHeaderDefaults.trade_currency_code,
    locationInput: tradeHeaderDefaults.location_code,
    deliveryStartInput: tradeHeaderDefaults.delivery_start,
    deliveryEndInput: tradeHeaderDefaults.delivery_end,
    priceUnitInput: tradeHeaderDefaults.price_unit_code,
    tradeNatureInput: tradeFormDefaults.nature,
    tradeStructureInput: tradeFormDefaults.structure,
    tradeSideInput: tradeFormDefaults.side,
    bookInput: activeBooks[0]?.code ?? '',
    portfolioInput: tradeHeaderDefaults.portfolio,
    counterpartyInput: tradeHeaderDefaults.counterparty,
    commodityClassInput: commodityClassOptions[0] ?? '',
    commodityInput: '',
    pricingTypeInput: tradeFormDefaults.pricingType,
    pricingStatusInput: tradeHeaderDefaults.pricing_status,
    priceIndexInput: '',
    priceInput: '',
    volumeInput: '',
    settlementStatusInput: tradeHeaderDefaults.settlement_status,
    traderUserInput: tradeHeaderDefaults.trader_user,
    legs: buildDefaultTradeLegs(makeLegDraft),
  }
}
