import { useMemo, useState } from 'react'
import type {
  CounterpartyRecord,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  TradeLegDraft,
} from '../../shared/models'
import {
  buildDefaultTradeLegs,
  pricingTypeRequiresPriceIndex,
  tradeHeaderDefaults,
  tradeFormDefaults,
  tradeSideOptions,
} from '../../shared/trading'
import { makeLegDraft } from './tradeDraftUtils'

export function useTradeCaptureForm(
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  priceIndices: PriceIndexRecord[],
  activeCounterparties: CounterpartyRecord[],
  activePortfolios: PortfolioRecord[],
) {
  const [tradeIdInput, setTradeIdInput] = useState('')
  const [tradeNatureInput, setTradeNatureInput] = useState<string>(tradeFormDefaults.nature)
  const [tradeStructureInput, setTradeStructureInput] = useState<string>(tradeFormDefaults.structure)
  const [tradeSideInput, setTradeSideInput] = useState<string>(tradeFormDefaults.side)
  const [bookInput, setBookInput] = useState<string>('')
  const [commodityClassInput, setCommodityClassInput] = useState<string>('')
  const [commodityInput, setCommodityInput] = useState<string>('')
  const [pricingTypeInput, setPricingTypeInput] = useState<string>(tradeFormDefaults.pricingType)
  const [priceIndexInput, setPriceIndexInput] = useState<string>('')
  const [priceInput, setPriceInput] = useState<string>(tradeFormDefaults.price)
  const [volumeInput, setVolumeInput] = useState<string>(tradeFormDefaults.volume)
  const [externalTradeIdInput, setExternalTradeIdInput] = useState<string>(tradeHeaderDefaults.external_trade_id)
  const [sourceSystemInput, setSourceSystemInput] = useState<string>(tradeHeaderDefaults.source_system)
  const [executionTimestampInput, setExecutionTimestampInput] = useState<string>(tradeHeaderDefaults.execution_timestamp)
  const [portfolioInput, setPortfolioInput] = useState<string>(tradeHeaderDefaults.portfolio)
  const [counterpartyInput, setCounterpartyInput] = useState<string>(tradeHeaderDefaults.counterparty)
  const [pricingStatusInput, setPricingStatusInput] = useState<string>(tradeHeaderDefaults.pricing_status)
  const [settlementStatusInput, setSettlementStatusInput] = useState<string>(tradeHeaderDefaults.settlement_status)
  const [traderUserInput, setTraderUserInput] = useState<string>(tradeHeaderDefaults.trader_user)
  const [createLegs, setCreateLegs] = useState<TradeLegDraft[]>(() => buildDefaultTradeLegs(makeLegDraft))

  const resolvedBookInput = bookInput || activeBooks[0]?.code || ''
  const resolvedCommodityClassInput = commodityClassInput || commodityClassOptions[0] || ''

  const createCommodityOptions = useMemo(
    () => activeCommodities.filter((commodity) => commodity.commodity_class === resolvedCommodityClassInput),
    [activeCommodities, resolvedCommodityClassInput],
  )

  const resolvedCommodityInput = createCommodityOptions.some((commodity) => commodity.code === commodityInput)
    ? commodityInput
    : createCommodityOptions[0]?.code || ''

  const createPriceIndexOptions = useMemo(
    () =>
      priceIndices.filter(
        (priceIndex) => priceIndex.is_active && (!resolvedCommodityInput || priceIndex.commodity_code === resolvedCommodityInput),
      ),
    [priceIndices, resolvedCommodityInput],
  )

  const createPortfolioOptions = useMemo(
    () => activePortfolios.filter((portfolio) => portfolio.book_code === resolvedBookInput),
    [activePortfolios, resolvedBookInput],
  )

  const resolvedPortfolioInput = createPortfolioOptions.some((portfolio) => portfolio.code === portfolioInput)
    ? portfolioInput
    : ''

  const resolvedCounterpartyInput = activeCounterparties.some((counterparty) => counterparty.code === counterpartyInput)
    ? counterpartyInput
    : ''

  const resolvedPriceIndexInput =
    !pricingTypeRequiresPriceIndex(pricingTypeInput)
      ? ''
      : createPriceIndexOptions.some((priceIndex) => priceIndex.code === priceIndexInput)
        ? priceIndexInput
        : createPriceIndexOptions[0]?.code || ''

  function updateDraftLeg(index: number, field: keyof TradeLegDraft, value: string) {
    setCreateLegs((current) =>
      current.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]: field === 'leg_no' ? Number(value) || leg.leg_no : value,
            }
          : leg,
      ),
    )
  }

  function addDraftLeg() {
    setCreateLegs((current) => [
      ...current,
      makeLegDraft({
        leg_no: current.length + 1,
        side: current.length % 2 === 0 ? tradeSideOptions[0] : tradeSideOptions[1],
      }),
    ])
  }

  function removeDraftLeg(index: number) {
    setCreateLegs((current) =>
      current
        .filter((_, legIndex) => legIndex !== index)
        .map((leg, legIndex) => ({ ...leg, leg_no: legIndex + 1 })),
    )
  }

  function reset() {
    setTradeIdInput('')
    setTradeNatureInput(tradeFormDefaults.nature)
    setTradeStructureInput(tradeFormDefaults.structure)
    setTradeSideInput(tradeFormDefaults.side)
    setBookInput(activeBooks[0]?.code ?? '')
    setCommodityClassInput(commodityClassOptions[0] ?? '')
    setCommodityInput('')
    setPricingTypeInput(tradeFormDefaults.pricingType)
    setPriceIndexInput('')
    setPriceInput(tradeFormDefaults.price)
    setVolumeInput(tradeFormDefaults.volume)
    setExternalTradeIdInput(tradeHeaderDefaults.external_trade_id)
    setSourceSystemInput(tradeHeaderDefaults.source_system)
    setExecutionTimestampInput(tradeHeaderDefaults.execution_timestamp)
    setPortfolioInput(tradeHeaderDefaults.portfolio)
    setCounterpartyInput(tradeHeaderDefaults.counterparty)
    setPricingStatusInput(tradeHeaderDefaults.pricing_status)
    setSettlementStatusInput(tradeHeaderDefaults.settlement_status)
    setTraderUserInput(tradeHeaderDefaults.trader_user)
    setCreateLegs(buildDefaultTradeLegs(makeLegDraft))
  }

  return {
    tradeIdInput,
    setTradeIdInput,
    tradeNatureInput,
    setTradeNatureInput,
    tradeStructureInput,
    setTradeStructureInput,
    tradeSideInput,
    setTradeSideInput,
    bookInput: resolvedBookInput,
    setBookInput,
    commodityClassInput: resolvedCommodityClassInput,
    setCommodityClassInput,
    commodityInput: resolvedCommodityInput,
    setCommodityInput,
    pricingTypeInput,
    setPricingTypeInput,
    priceIndexInput: resolvedPriceIndexInput,
    setPriceIndexInput,
    priceInput,
    setPriceInput,
    volumeInput,
    setVolumeInput,
    externalTradeIdInput,
    setExternalTradeIdInput,
    sourceSystemInput,
    setSourceSystemInput,
    executionTimestampInput,
    setExecutionTimestampInput,
    portfolioInput: resolvedPortfolioInput,
    setPortfolioInput,
    counterpartyInput: resolvedCounterpartyInput,
    setCounterpartyInput,
    pricingStatusInput,
    setPricingStatusInput,
    settlementStatusInput,
    setSettlementStatusInput,
    traderUserInput,
    setTraderUserInput,
    createLegs,
    createCommodityOptions,
    createPriceIndexOptions,
    createPortfolioOptions,
    createCounterpartyOptions: activeCounterparties,
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
    reset,
  }
}
