import { useEffect, useMemo, useState } from 'react'
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
  resolveTradeFormMetadata,
  tradeFormMetadataRequiresPriceIndex,
  type TradeMetadata,
} from '../../shared/tradeMetadata'
import {
  buildDefaultTradeLegs,
  tradeHeaderDefaults,
  tradeFormDefaults,
  tradeInstrumentUsesOptionFields,
  tradeStructureSupportsLegs,
} from '../../shared/trading'
import {
  resolveTradeCaptureRuleEvaluation,
  resolveTradeCaptureVisibilityState,
  type TradeCaptureRuleContext,
  type TradeCaptureSettings,
} from '../../shared/tradeCaptureSettings'
import { buildCounterpartySearchDisplayValue } from './counterpartySearch'
import { buildReferenceSearchDisplayValue } from './referenceSearch'
import { findLatestPersistedLegs, makeLegDraft } from './tradeDraftUtils'
import { buildSuggestedTradeId } from './tradeEventPayloads'

export function useTradeCaptureForm(
  tradeMetadata: TradeMetadata,
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  tradeCaptureSettings: TradeCaptureSettings,
  existingTradeIds: string[],
  priceIndices: PriceIndexRecord[],
  activeCounterparties: CounterpartyRecord[],
  activePortfolios: PortfolioRecord[],
  activeUnits: UnitRecord[],
  activeCurrencies: CurrencyRecord[],
  activeLocations: LocationRecord[],
) {
  const tradeFormMetadata = useMemo(() => resolveTradeFormMetadata(tradeMetadata), [tradeMetadata])
  const captureDefaults = useMemo(
    () => ({
      ...tradeFormMetadata.defaults,
      ...tradeCaptureSettings.defaults,
    }),
    [tradeCaptureSettings, tradeFormMetadata],
  )
  const primaryTradeSide = tradeFormMetadata.tradeSideOptions[0] ?? captureDefaults.tradeSide
  const secondaryTradeSide = tradeFormMetadata.tradeSideOptions[1] ?? primaryTradeSide
  const initialRuleEvaluation = resolveTradeCaptureRuleEvaluation({
    context: {
      instrumentType: captureDefaults.instrumentType,
      tradeStructure: captureDefaults.tradeStructure,
      pricingType: captureDefaults.pricingType,
      commodityClass: commodityClassOptions[0] ?? '',
      book: activeBooks[0]?.code ?? '',
    },
    settings: tradeCaptureSettings,
  })
  const initialRuleDefaults = initialRuleEvaluation.defaultOverrides
  const suggestedTradeId = useMemo(() => buildSuggestedTradeId(existingTradeIds), [existingTradeIds])
  const [tradeIdInput, setTradeIdInput] = useState(() => suggestedTradeId)
  const [tradeInstrumentTypeInput, setTradeInstrumentTypeInputState] = useState<string>(captureDefaults.instrumentType)
  const [optionTypeInput, setOptionTypeInput] = useState<string>(initialRuleDefaults.optionType ?? captureDefaults.optionType)
  const [optionStyleInput, setOptionStyleInput] = useState<string>(initialRuleDefaults.optionStyle ?? captureDefaults.optionStyle)
  const [optionExpirationDateInput, setOptionExpirationDateInput] = useState<string>(tradeFormDefaults.optionExpirationDate)
  const [optionStrikePriceInput, setOptionStrikePriceInput] = useState<string>(tradeFormDefaults.optionStrikePrice)
  const [tradeNatureInput, setTradeNatureInput] = useState<string>(initialRuleDefaults.tradeNature ?? captureDefaults.tradeNature)
  const [tradeStructureInput, setTradeStructureInput] = useState<string>(
    initialRuleDefaults.tradeStructure ?? captureDefaults.tradeStructure,
  )
  const [tradeSideInput, setTradeSideInput] = useState<string>(initialRuleDefaults.tradeSide ?? captureDefaults.tradeSide)
  const [bookInput, setBookInput] = useState<string>('')
  const [bookSearchInput, setBookSearchInput] = useState<string>('')
  const [commodityClassInput, setCommodityClassInput] = useState<string>('')
  const [commodityInput, setCommodityInput] = useState<string>('')
  const [pricingTypeInput, setPricingTypeInput] = useState<string>(
    initialRuleDefaults.pricingType ?? captureDefaults.pricingType,
  )
  const [priceIndexInput, setPriceIndexInput] = useState<string>('')
  const [priceInput, setPriceInput] = useState<string>(tradeFormDefaults.price)
  const [volumeInput, setVolumeInput] = useState<string>(tradeFormDefaults.volume)
  const [externalTradeIdInput, setExternalTradeIdInput] = useState<string>(tradeHeaderDefaults.external_trade_id)
  const sourceSystemInput = tradeFormMetadata.sourceSystem
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
  const [portfolioSearchInput, setPortfolioSearchInput] = useState<string>(tradeHeaderDefaults.portfolio)
  const [counterpartyInput, setCounterpartyInput] = useState<string>(tradeHeaderDefaults.counterparty)
  const [counterpartySearchInput, setCounterpartySearchInput] = useState<string>(tradeHeaderDefaults.counterparty)
  const [pricingStatusInput, setPricingStatusInput] = useState<string>(
    initialRuleDefaults.pricingStatus ?? captureDefaults.pricingStatus,
  )
  const [settlementStatusInput, setSettlementStatusInput] = useState<string>(
    initialRuleDefaults.settlementStatus ?? captureDefaults.settlementStatus,
  )
  const [traderUserInput, setTraderUserInput] = useState<string>(tradeHeaderDefaults.trader_user)
  const [createLegs, setCreateLegs] = useState<TradeLegDraft[]>(() =>
    buildDefaultTradeLegs(makeLegDraft, {
      firstLeg: { side: primaryTradeSide },
      secondLeg: { side: secondaryTradeSide },
    }),
  )
  const [duplicateSourceTradeId, setDuplicateSourceTradeId] = useState<string | null>(null)

  const resolvedBookInput = activeBooks.some((book) => book.code === bookInput)
    ? bookInput
    : activeBooks[0]?.code || ''
  const selectedBook = activeBooks.find((book) => book.code === resolvedBookInput) ?? null
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
  const selectedPortfolio =
    createPortfolioOptions.find((portfolio) => portfolio.code === resolvedPortfolioInput) ?? null

  const resolvedCounterpartyInput = activeCounterparties.some((counterparty) => counterparty.code === counterpartyInput)
    ? counterpartyInput
    : ''
  const selectedCounterparty =
    activeCounterparties.find((counterparty) => counterparty.code === resolvedCounterpartyInput) ?? null
  const resolvedTradeCurrencyInput = activeCurrencies.some((currency) => currency.code === tradeCurrencyInput)
    ? tradeCurrencyInput
    : ''
  const resolvedLocationInput = activeLocations.some((location) => location.code === locationInput)
    ? locationInput
    : ''

  const resolvedPriceIndexInput =
    tradeInstrumentUsesOptionFields(tradeInstrumentTypeInput) ||
    !tradeFormMetadataRequiresPriceIndex(tradeFormMetadata, pricingTypeInput)
      ? ''
      : createPriceIndexOptions.some((priceIndex) => priceIndex.code === priceIndexInput)
        ? priceIndexInput
        : createPriceIndexOptions[0]?.code || ''
  const resolvedUnitInput = createUnitOptions.some((unit) => unit.code === unitInput) ? unitInput : ''
  const resolvedPriceUnitInput = createUnitOptions.some((unit) => unit.code === priceUnitInput)
    ? priceUnitInput
    : ''

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Refresh the suggested identifier when the upstream trade id pool changes.
    setTradeIdInput((current) => (current === suggestedTradeId ? current : suggestedTradeId))
  }, [suggestedTradeId])

  useEffect(() => {
    if (!selectedBook) {
      return
    }

    const nextBookSearchInput = buildReferenceSearchDisplayValue(selectedBook)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the visible search text aligned with external book selection changes.
    setBookSearchInput((current) => (current.trim().length === 0 || current === selectedBook.code ? nextBookSearchInput : current))
  }, [selectedBook])

  useEffect(() => {
    if (!selectedPortfolio) {
      return
    }

    const nextPortfolioSearchInput = buildReferenceSearchDisplayValue(selectedPortfolio)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the visible search text aligned with external portfolio selection changes.
    setPortfolioSearchInput((current) =>
      current.trim().length === 0 || current === selectedPortfolio.code ? nextPortfolioSearchInput : current,
    )
  }, [selectedPortfolio])

  useEffect(() => {
    if (!selectedCounterparty) {
      return
    }

    const nextCounterpartySearchInput = buildCounterpartySearchDisplayValue(selectedCounterparty)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the visible search text aligned with external counterparty selection changes.
    setCounterpartySearchInput((current) =>
      current.trim().length === 0 || current === selectedCounterparty.code ? nextCounterpartySearchInput : current,
    )
  }, [selectedCounterparty])

  const activeRuleEvaluation = useMemo(
    () =>
      resolveTradeCaptureRuleEvaluation({
        context: {
          instrumentType: tradeInstrumentTypeInput,
          tradeStructure: tradeStructureInput,
          pricingType: pricingTypeInput,
          commodityClass: resolvedCommodityClassInput,
          book: resolvedBookInput,
        },
        settings: tradeCaptureSettings,
      }),
    [
      pricingTypeInput,
      resolvedBookInput,
      resolvedCommodityClassInput,
      tradeCaptureSettings,
      tradeInstrumentTypeInput,
      tradeStructureInput,
    ],
  )

  const visibilityState = useMemo(
    () =>
      resolveTradeCaptureVisibilityState({
        instrumentType: tradeInstrumentTypeInput,
        tradeStructure: tradeStructureInput,
        pricingType: pricingTypeInput,
        commodityClass: resolvedCommodityClassInput,
        book: resolvedBookInput,
        settings: tradeCaptureSettings,
      }),
    [
      pricingTypeInput,
      resolvedBookInput,
      resolvedCommodityClassInput,
      tradeCaptureSettings,
      tradeInstrumentTypeInput,
      tradeStructureInput,
    ],
  )

  function applyRuleDefaults(overrides: Partial<TradeCaptureRuleContext> = {}) {
    const ruleEvaluation = resolveTradeCaptureRuleEvaluation({
      context: {
        instrumentType: overrides.instrumentType ?? tradeInstrumentTypeInput,
        tradeStructure: overrides.tradeStructure ?? tradeStructureInput,
        pricingType: overrides.pricingType ?? pricingTypeInput,
        commodityClass: overrides.commodityClass ?? resolvedCommodityClassInput,
        book: overrides.book ?? resolvedBookInput,
      },
      settings: tradeCaptureSettings,
    })

    const nextPricingType = ruleEvaluation.defaultOverrides.pricingType ?? ruleEvaluation.context.pricingType
    const nextInstrumentType = ruleEvaluation.context.instrumentType

    if (ruleEvaluation.defaultOverrides.tradeNature && ruleEvaluation.defaultOverrides.tradeNature !== tradeNatureInput) {
      setTradeNatureInput(ruleEvaluation.defaultOverrides.tradeNature)
    }
    if (
      ruleEvaluation.defaultOverrides.tradeStructure &&
      ruleEvaluation.defaultOverrides.tradeStructure !== tradeStructureInput
    ) {
      setTradeStructureInput(ruleEvaluation.defaultOverrides.tradeStructure)
    }
    if (ruleEvaluation.defaultOverrides.tradeSide && ruleEvaluation.defaultOverrides.tradeSide !== tradeSideInput) {
      setTradeSideInput(ruleEvaluation.defaultOverrides.tradeSide)
    }
    if (ruleEvaluation.defaultOverrides.pricingType && ruleEvaluation.defaultOverrides.pricingType !== pricingTypeInput) {
      setPricingTypeInput(ruleEvaluation.defaultOverrides.pricingType)
    }
    if (
      ruleEvaluation.defaultOverrides.pricingStatus &&
      ruleEvaluation.defaultOverrides.pricingStatus !== pricingStatusInput
    ) {
      setPricingStatusInput(ruleEvaluation.defaultOverrides.pricingStatus)
    }
    if (
      ruleEvaluation.defaultOverrides.settlementStatus &&
      ruleEvaluation.defaultOverrides.settlementStatus !== settlementStatusInput
    ) {
      setSettlementStatusInput(ruleEvaluation.defaultOverrides.settlementStatus)
    }
    if (ruleEvaluation.defaultOverrides.optionType && ruleEvaluation.defaultOverrides.optionType !== optionTypeInput) {
      setOptionTypeInput(ruleEvaluation.defaultOverrides.optionType)
    }
    if (ruleEvaluation.defaultOverrides.optionStyle && ruleEvaluation.defaultOverrides.optionStyle !== optionStyleInput) {
      setOptionStyleInput(ruleEvaluation.defaultOverrides.optionStyle)
    }

    if (
      tradeInstrumentUsesOptionFields(nextInstrumentType) ||
      !tradeFormMetadataRequiresPriceIndex(tradeFormMetadata, nextPricingType)
    ) {
      setPriceIndexInput('')
    }
  }

  function setTradeInstrumentTypeInput(value: string) {
    setTradeInstrumentTypeInputState(value)
    applyRuleDefaults({ instrumentType: value })
  }

  function setTradeStructureInputWithRules(value: string) {
    setTradeStructureInput(value)
    applyRuleDefaults({ tradeStructure: value })
  }

  function setBookInputWithRules(value: string) {
    setBookInput(value)
    if (value !== resolvedBookInput) {
      setPortfolioInput('')
      setPortfolioSearchInput('')
    }
    applyRuleDefaults({ book: value })
  }

  function setCommodityClassInputWithRules(value: string) {
    setCommodityClassInput(value)
    applyRuleDefaults({ commodityClass: value })
  }

  function setPricingTypeInputWithRules(value: string) {
    setPricingTypeInput(value)
    applyRuleDefaults({ pricingType: value })
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
        side: current.length % 2 === 0 ? primaryTradeSide : secondaryTradeSide,
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
                side: secondaryTradeSide,
                commodity_class: selectedTrade.commodity_class,
              },
            })
          : buildDefaultTradeLegs(makeLegDraft, {
              firstLeg: { side: primaryTradeSide },
              secondLeg: { side: secondaryTradeSide },
            })

    setTradeIdInput(suggestedTradeId)
    setTradeInstrumentTypeInputState(selectedTrade.instrument_type ?? captureDefaults.instrumentType)
    setOptionTypeInput(selectedTrade.option_type ?? captureDefaults.optionType)
    setOptionStyleInput(selectedTrade.option_style ?? captureDefaults.optionStyle)
    setOptionExpirationDateInput(selectedTrade.option_expiration_date ?? tradeFormDefaults.optionExpirationDate)
    setOptionStrikePriceInput(selectedTrade.option_strike_price?.toString() ?? tradeFormDefaults.optionStrikePrice)
    setTradeNatureInput(selectedTrade.trade_nature ?? captureDefaults.tradeNature)
    setTradeStructureInput(selectedTrade.trade_structure ?? captureDefaults.tradeStructure)
    setTradeSideInput(selectedTrade.trade_side ?? captureDefaults.tradeSide)
    const nextBookInput = selectedTrade.book ?? activeBooks[0]?.code ?? ''
    setBookInput(nextBookInput)
    setBookSearchInput(buildReferenceSearchDisplayValue(activeBooks.find((book) => book.code === nextBookInput) ?? null) || nextBookInput)
    setCommodityClassInput(selectedTrade.commodity_class ?? commodityClassOptions[0] ?? '')
    setCommodityInput(selectedTrade.commodity ?? '')
    setPricingTypeInput(selectedTrade.pricing_type ?? captureDefaults.pricingType)
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
    const nextPortfolioInput = selectedTrade.portfolio ?? tradeHeaderDefaults.portfolio
    setPortfolioInput(nextPortfolioInput)
    setPortfolioSearchInput(
      buildReferenceSearchDisplayValue(
        activePortfolios.find((portfolio) => portfolio.code === nextPortfolioInput && portfolio.book_code === nextBookInput) ??
          null,
      ) || nextPortfolioInput,
    )
    const nextCounterpartyInput = selectedTrade.counterparty ?? tradeHeaderDefaults.counterparty
    setCounterpartyInput(nextCounterpartyInput)
    setCounterpartySearchInput(
      buildCounterpartySearchDisplayValue(
        activeCounterparties.find((counterparty) => counterparty.code === nextCounterpartyInput) ?? null,
      ) || nextCounterpartyInput,
    )
    setPricingStatusInput(selectedTrade.pricing_status ?? captureDefaults.pricingStatus)
    setSettlementStatusInput(captureDefaults.settlementStatus)
    setTraderUserInput(selectedTrade.trader_user ?? tradeHeaderDefaults.trader_user)
    setCreateLegs(duplicateLegs)
    setDuplicateSourceTradeId(selectedTrade.trade_id)
  }

  function reset(nextTradeId: string = suggestedTradeId) {
    const resetRuleEvaluation = resolveTradeCaptureRuleEvaluation({
      context: {
        instrumentType: captureDefaults.instrumentType,
        tradeStructure: captureDefaults.tradeStructure,
        pricingType: captureDefaults.pricingType,
        commodityClass: commodityClassOptions[0] ?? '',
        book: activeBooks[0]?.code ?? '',
      },
      settings: tradeCaptureSettings,
    })

    setTradeIdInput(nextTradeId)
    setTradeInstrumentTypeInputState(captureDefaults.instrumentType)
    setOptionTypeInput(resetRuleEvaluation.defaultOverrides.optionType ?? captureDefaults.optionType)
    setOptionStyleInput(resetRuleEvaluation.defaultOverrides.optionStyle ?? captureDefaults.optionStyle)
    setOptionExpirationDateInput(tradeFormDefaults.optionExpirationDate)
    setOptionStrikePriceInput(tradeFormDefaults.optionStrikePrice)
    setTradeNatureInput(resetRuleEvaluation.defaultOverrides.tradeNature ?? captureDefaults.tradeNature)
    setTradeStructureInput(resetRuleEvaluation.defaultOverrides.tradeStructure ?? captureDefaults.tradeStructure)
    setTradeSideInput(resetRuleEvaluation.defaultOverrides.tradeSide ?? captureDefaults.tradeSide)
    setBookInput(activeBooks[0]?.code ?? '')
    setBookSearchInput(buildReferenceSearchDisplayValue(activeBooks[0] ?? null))
    setCommodityClassInput(commodityClassOptions[0] ?? '')
    setCommodityInput('')
    setPricingTypeInput(resetRuleEvaluation.defaultOverrides.pricingType ?? captureDefaults.pricingType)
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
    setPortfolioSearchInput(tradeHeaderDefaults.portfolio)
    setCounterpartyInput(tradeHeaderDefaults.counterparty)
    setCounterpartySearchInput(tradeHeaderDefaults.counterparty)
    setPricingStatusInput(resetRuleEvaluation.defaultOverrides.pricingStatus ?? captureDefaults.pricingStatus)
    setSettlementStatusInput(
      resetRuleEvaluation.defaultOverrides.settlementStatus ?? captureDefaults.settlementStatus,
    )
    setTraderUserInput(tradeHeaderDefaults.trader_user)
    setCreateLegs(
      buildDefaultTradeLegs(makeLegDraft, {
        firstLeg: { side: primaryTradeSide },
        secondLeg: { side: secondaryTradeSide },
      }),
    )
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
    setTradeStructureInput: setTradeStructureInputWithRules,
    tradeSideInput,
    setTradeSideInput,
    bookInput: resolvedBookInput,
    setBookInput: setBookInputWithRules,
    bookSearchInput,
    setBookSearchInput,
    commodityClassInput: resolvedCommodityClassInput,
    setCommodityClassInput: setCommodityClassInputWithRules,
    commodityInput: resolvedCommodityInput,
    setCommodityInput,
    pricingTypeInput,
    setPricingTypeInput: setPricingTypeInputWithRules,
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
    portfolioSearchInput,
    setPortfolioSearchInput,
    counterpartyInput: resolvedCounterpartyInput,
    setCounterpartyInput,
    counterpartySearchInput,
    setCounterpartySearchInput,
    pricingStatusInput,
    setPricingStatusInput,
    settlementStatusInput,
    setSettlementStatusInput,
    showOptionDetails: visibilityState.showOptionDetails,
    showPriceIndexField: visibilityState.showPriceIndex,
    activeRuleMatches: activeRuleEvaluation.matchedRules,
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
