import { useMemo, useState } from 'react'
import type {
  CounterpartyRecord,
  CurrencyRecord,
  EventRow,
  LocationRecord,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  TradeLegDraft,
  UnitRecord,
} from '../../shared/models'
import {
  buildDefaultTradeLegs,
  defaultTradeSourceSystem,
  pricingTypeRequiresPriceIndex,
  tradeHeaderDefaults,
  tradeFormDefaults,
  tradeInstrumentUsesOptionFields,
  tradeSideOptions,
  tradeStructureSupportsLegs,
} from '../../shared/trading'
import { findLatestPersistedLegs, makeLegDraft } from './tradeDraftUtils'

export function useTradeCaptureForm(
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  priceIndices: PriceIndexRecord[],
  activeCounterparties: CounterpartyRecord[],
  activePortfolios: PortfolioRecord[],
  activeUnits: UnitRecord[],
  activeCurrencies: CurrencyRecord[],
  activeLocations: LocationRecord[],
) {
  const [tradeIdInput, setTradeIdInput] = useState('')
  const [tradeInstrumentTypeInput, setTradeInstrumentTypeInputState] = useState<string>(tradeFormDefaults.instrumentType)
  const [optionTypeInput, setOptionTypeInput] = useState<string>(tradeFormDefaults.optionType)
  const [optionStyleInput, setOptionStyleInput] = useState<string>(tradeFormDefaults.optionStyle)
  const [optionExpirationDateInput, setOptionExpirationDateInput] = useState<string>(tradeFormDefaults.optionExpirationDate)
  const [optionStrikePriceInput, setOptionStrikePriceInput] = useState<string>(tradeFormDefaults.optionStrikePrice)
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
  const [sourceSystemInput] = useState<string>(defaultTradeSourceSystem)
  const [executionTimestampInput, setExecutionTimestampInput] = useState<string>(tradeHeaderDefaults.execution_timestamp)
  const [tradeDateInput, setTradeDateInput] = useState<string>(tradeHeaderDefaults.trade_date)
  const [effectiveStartDateInput, setEffectiveStartDateInput] = useState<string>(tradeHeaderDefaults.effective_start_date)
  const [effectiveEndDateInput, setEffectiveEndDateInput] = useState<string>(tradeHeaderDefaults.effective_end_date)
  const [qualitySpecInput, setQualitySpecInput] = useState<string>(tradeHeaderDefaults.quality_spec)
  const [unitInput, setUnitInput] = useState<string>(tradeHeaderDefaults.unit_of_measure)
  const [tradeCurrencyInput, setTradeCurrencyInput] = useState<string>(tradeHeaderDefaults.trade_currency_code)
  const [locationInput, setLocationInput] = useState<string>(tradeHeaderDefaults.location_code)
  const [deliveryStartInput, setDeliveryStartInput] = useState<string>(tradeHeaderDefaults.delivery_start)
  const [deliveryEndInput, setDeliveryEndInput] = useState<string>(tradeHeaderDefaults.delivery_end)
  const [priceUnitInput, setPriceUnitInput] = useState<string>(tradeHeaderDefaults.price_unit_code)
  const [portfolioInput, setPortfolioInput] = useState<string>(tradeHeaderDefaults.portfolio)
  const [counterpartyInput, setCounterpartyInput] = useState<string>(tradeHeaderDefaults.counterparty)
  const [pricingStatusInput, setPricingStatusInput] = useState<string>(tradeHeaderDefaults.pricing_status)
  const [settlementStatusInput, setSettlementStatusInput] = useState<string>(tradeHeaderDefaults.settlement_status)
  const [traderUserInput, setTraderUserInput] = useState<string>(tradeHeaderDefaults.trader_user)
  const [createLegs, setCreateLegs] = useState<TradeLegDraft[]>(() => buildDefaultTradeLegs(makeLegDraft))
  const [duplicateSourceTradeId, setDuplicateSourceTradeId] = useState<string | null>(null)

  const resolvedBookInput = activeBooks.some((book) => book.code === bookInput)
    ? bookInput
    : activeBooks[0]?.code || ''
  const swapPrimaryLeg = tradeStructureSupportsLegs(tradeStructureInput) ? createLegs[0] : null
  const resolvedCommodityClassInput =
    swapPrimaryLeg?.commodity_class || commodityClassInput || commodityClassOptions[0] || ''

  const createCommodityOptions = useMemo(
    () => activeCommodities.filter((commodity) => commodity.commodity_class === resolvedCommodityClassInput),
    [activeCommodities, resolvedCommodityClassInput],
  )

  const preferredCommodityInput = swapPrimaryLeg?.commodity || commodityInput
  const resolvedCommodityInput = createCommodityOptions.some((commodity) => commodity.code === preferredCommodityInput)
    ? preferredCommodityInput
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
  const createUnitOptions = useMemo(() => {
    const matchingUnits = activeUnits.filter(
      (unit) => !unit.commodity_class || unit.commodity_class === resolvedCommodityClassInput,
    )
    return matchingUnits.length > 0 ? matchingUnits : activeUnits
  }, [activeUnits, resolvedCommodityClassInput])

  const resolvedPortfolioInput = createPortfolioOptions.some((portfolio) => portfolio.code === portfolioInput)
    ? portfolioInput
    : ''

  const resolvedCounterpartyInput = activeCounterparties.some((counterparty) => counterparty.code === counterpartyInput)
    ? counterpartyInput
    : ''
  const resolvedTradeCurrencyInput = activeCurrencies.some((currency) => currency.code === tradeCurrencyInput)
    ? tradeCurrencyInput
    : ''
  const resolvedLocationInput = activeLocations.some((location) => location.code === locationInput)
    ? locationInput
    : ''

  const resolvedPriceIndexInput =
    tradeInstrumentUsesOptionFields(tradeInstrumentTypeInput) || !pricingTypeRequiresPriceIndex(pricingTypeInput)
      ? ''
      : createPriceIndexOptions.some((priceIndex) => priceIndex.code === priceIndexInput)
        ? priceIndexInput
        : createPriceIndexOptions[0]?.code || ''
  const resolvedUnitInput = createUnitOptions.some((unit) => unit.code === unitInput) ? unitInput : ''
  const resolvedPriceUnitInput = createUnitOptions.some((unit) => unit.code === priceUnitInput)
    ? priceUnitInput
    : ''

  function setTradeInstrumentTypeInput(value: string) {
    setTradeInstrumentTypeInputState(value)
    if (!tradeInstrumentUsesOptionFields(value)) {
      return
    }
    setTradeNatureInput('FINANCIAL')
    setTradeStructureInput('SINGLE')
    setPricingTypeInput('FIXED')
    setPriceIndexInput('')
  }

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

  function duplicateFromTrade(selectedTrade: Trade, selectedTradeEvents: EventRow[]) {
    const persistedLegs = findLatestPersistedLegs(selectedTradeEvents)
    const duplicateLegs =
      persistedLegs.length > 0
        ? persistedLegs
        : tradeStructureSupportsLegs(selectedTrade.trade_structure)
          ? buildDefaultTradeLegs(makeLegDraft, {
              firstLeg: {
                side: selectedTrade.trade_side ?? tradeFormDefaults.side,
                commodity_class: selectedTrade.commodity_class,
                commodity: selectedTrade.commodity,
                volume: selectedTrade.volume?.toString() ?? '',
              },
              secondLeg: {
                commodity_class: selectedTrade.commodity_class,
              },
            })
          : buildDefaultTradeLegs(makeLegDraft)

    setTradeIdInput('')
    setTradeInstrumentTypeInputState(selectedTrade.instrument_type ?? tradeFormDefaults.instrumentType)
    setOptionTypeInput(selectedTrade.option_type ?? tradeFormDefaults.optionType)
    setOptionStyleInput(selectedTrade.option_style ?? tradeFormDefaults.optionStyle)
    setOptionExpirationDateInput(selectedTrade.option_expiration_date ?? tradeFormDefaults.optionExpirationDate)
    setOptionStrikePriceInput(selectedTrade.option_strike_price?.toString() ?? tradeFormDefaults.optionStrikePrice)
    setTradeNatureInput(selectedTrade.trade_nature ?? tradeFormDefaults.nature)
    setTradeStructureInput(selectedTrade.trade_structure ?? tradeFormDefaults.structure)
    setTradeSideInput(selectedTrade.trade_side ?? tradeFormDefaults.side)
    setBookInput(selectedTrade.book ?? activeBooks[0]?.code ?? '')
    setCommodityClassInput(selectedTrade.commodity_class ?? commodityClassOptions[0] ?? '')
    setCommodityInput(selectedTrade.commodity ?? '')
    setPricingTypeInput(selectedTrade.pricing_type ?? tradeFormDefaults.pricingType)
    setPriceIndexInput(selectedTrade.price_index_code ?? '')
    setPriceInput(selectedTrade.price?.toString() ?? tradeFormDefaults.price)
    setVolumeInput(selectedTrade.volume?.toString() ?? tradeFormDefaults.volume)
    setExternalTradeIdInput('')
    setExecutionTimestampInput(tradeHeaderDefaults.execution_timestamp)
    setTradeDateInput(tradeHeaderDefaults.trade_date)
    setEffectiveStartDateInput(selectedTrade.effective_start_date ?? tradeHeaderDefaults.effective_start_date)
    setEffectiveEndDateInput(selectedTrade.effective_end_date ?? tradeHeaderDefaults.effective_end_date)
    setQualitySpecInput(selectedTrade.quality_spec ?? tradeHeaderDefaults.quality_spec)
    setUnitInput(selectedTrade.unit_of_measure ?? tradeHeaderDefaults.unit_of_measure)
    setTradeCurrencyInput(selectedTrade.trade_currency_code ?? tradeHeaderDefaults.trade_currency_code)
    setLocationInput(selectedTrade.location_code ?? tradeHeaderDefaults.location_code)
    setDeliveryStartInput(selectedTrade.delivery_start ?? tradeHeaderDefaults.delivery_start)
    setDeliveryEndInput(selectedTrade.delivery_end ?? tradeHeaderDefaults.delivery_end)
    setPriceUnitInput(selectedTrade.price_unit_code ?? tradeHeaderDefaults.price_unit_code)
    setPortfolioInput(selectedTrade.portfolio ?? tradeHeaderDefaults.portfolio)
    setCounterpartyInput(selectedTrade.counterparty ?? tradeHeaderDefaults.counterparty)
    setPricingStatusInput(selectedTrade.pricing_status ?? tradeHeaderDefaults.pricing_status)
    setSettlementStatusInput(tradeHeaderDefaults.settlement_status)
    setTraderUserInput(selectedTrade.trader_user ?? tradeHeaderDefaults.trader_user)
    setCreateLegs(duplicateLegs)
    setDuplicateSourceTradeId(selectedTrade.trade_id)
  }

  function reset() {
    setTradeIdInput('')
    setTradeInstrumentTypeInputState(tradeFormDefaults.instrumentType)
    setOptionTypeInput(tradeFormDefaults.optionType)
    setOptionStyleInput(tradeFormDefaults.optionStyle)
    setOptionExpirationDateInput(tradeFormDefaults.optionExpirationDate)
    setOptionStrikePriceInput(tradeFormDefaults.optionStrikePrice)
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
    setExecutionTimestampInput(tradeHeaderDefaults.execution_timestamp)
    setTradeDateInput(tradeHeaderDefaults.trade_date)
    setEffectiveStartDateInput(tradeHeaderDefaults.effective_start_date)
    setEffectiveEndDateInput(tradeHeaderDefaults.effective_end_date)
    setQualitySpecInput(tradeHeaderDefaults.quality_spec)
    setUnitInput(tradeHeaderDefaults.unit_of_measure)
    setTradeCurrencyInput(tradeHeaderDefaults.trade_currency_code)
    setLocationInput(tradeHeaderDefaults.location_code)
    setDeliveryStartInput(tradeHeaderDefaults.delivery_start)
    setDeliveryEndInput(tradeHeaderDefaults.delivery_end)
    setPriceUnitInput(tradeHeaderDefaults.price_unit_code)
    setPortfolioInput(tradeHeaderDefaults.portfolio)
    setCounterpartyInput(tradeHeaderDefaults.counterparty)
    setPricingStatusInput(tradeHeaderDefaults.pricing_status)
    setSettlementStatusInput(tradeHeaderDefaults.settlement_status)
    setTraderUserInput(tradeHeaderDefaults.trader_user)
    setCreateLegs(buildDefaultTradeLegs(makeLegDraft))
    setDuplicateSourceTradeId(null)
  }

  return {
    tradeIdInput,
    setTradeIdInput,
    tradeInstrumentTypeInput,
    setTradeInstrumentTypeInput,
    optionTypeInput,
    setOptionTypeInput,
    optionStyleInput,
    setOptionStyleInput,
    optionExpirationDateInput,
    setOptionExpirationDateInput,
    optionStrikePriceInput,
    setOptionStrikePriceInput,
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
    executionTimestampInput,
    setExecutionTimestampInput,
    tradeDateInput,
    setTradeDateInput,
    effectiveStartDateInput,
    setEffectiveStartDateInput,
    effectiveEndDateInput,
    setEffectiveEndDateInput,
    qualitySpecInput,
    setQualitySpecInput,
    unitInput: resolvedUnitInput,
    setUnitInput,
    tradeCurrencyInput: resolvedTradeCurrencyInput,
    setTradeCurrencyInput,
    createCurrencyOptions: activeCurrencies,
    locationInput: resolvedLocationInput,
    setLocationInput,
    createLocationOptions: activeLocations,
    deliveryStartInput,
    setDeliveryStartInput,
    deliveryEndInput,
    setDeliveryEndInput,
    priceUnitInput: resolvedPriceUnitInput,
    setPriceUnitInput,
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
    duplicateSourceTradeId,
    createLegs,
    createCommodityOptions,
    createPriceIndexOptions,
    createUnitOptions,
    createPortfolioOptions,
    createCounterpartyOptions: activeCounterparties,
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
    duplicateFromTrade,
    reset,
  }
}
