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
  qualitySpecInput: string
  unitInput: string
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
      qualitySpecInput: selectedTrade.quality_spec ?? tradeHeaderDefaults.quality_spec,
      unitInput: selectedTrade.unit_of_measure ?? tradeHeaderDefaults.unit_of_measure,
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
    qualitySpecInput: tradeHeaderDefaults.quality_spec,
    unitInput: tradeHeaderDefaults.unit_of_measure,
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
