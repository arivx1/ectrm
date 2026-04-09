import type { OptionExposureRow, PriceIndexObservationRecord, Trade } from './models'

type OpenOptionTradeLike = Pick<
  Trade,
  | 'trade_id'
  | 'instrument_type'
  | 'status'
  | 'trade_side'
  | 'option_type'
  | 'option_style'
  | 'option_strike_price'
  | 'option_expiration_date'
  | 'price'
  | 'price_index_code'
  | 'volume'
  | 'book'
  | 'commodity'
  | 'trade_currency_code'
  | 'price_unit_code'
  | 'updated_at'
>

type OptionSettlementTradeLike = Pick<
  Trade,
  | 'trade_id'
  | 'originating_option_trade_id'
  | 'instrument_type'
  | 'status'
  | 'trade_side'
  | 'option_type'
  | 'option_strike_price'
  | 'option_expiration_date'
  | 'price'
  | 'price_index_code'
  | 'volume'
  | 'book'
  | 'commodity'
  | 'updated_at'
>

type PriceIndexMarkLike = Pick<
  PriceIndexObservationRecord,
  | 'price_index_code'
  | 'value'
  | 'observation_date'
  | 'downloaded_at'
  | 'currency_code'
  | 'unit_code'
>

export type OptionMarkStatus =
  | 'VALUED'
  | 'UNPRICED_MISSING_PRICE_INDEX'
  | 'UNPRICED_MISSING_MARK'

export type OptionSettlementMarkStatus = OptionMarkStatus
export type OpenOptionExpiryState =
  | 'OPEN'
  | 'EXPIRING_SOON'
  | 'EXPIRING_TODAY'
  | 'PAST_EXPIRY_UNRESOLVED'
export type OpenOptionDecisionTone = 'active' | 'in-progress' | 'blocked'
export type OpenOptionProfitState = 'PROFITABLE' | 'LOSS_MAKING' | 'BREAK_EVEN'
export type OpenOptionLifecycleAction =
  | 'OptionExercised'
  | 'OptionExpired'
  | 'OptionAssigned'

export type OpenOptionValuation = {
  tradeId: string
  lifecycleStatus: string
  book: string
  commodity: string
  tradeSide: string | null
  optionType: string | null
  optionStyle: string | null
  referencePriceIndexCode: string | null
  strikePrice: number | null
  optionExpirationDate: string | null
  daysToExpiration: number | null
  contracts: number | null
  premiumPrice: number | null
  premiumCashflow: number | null
  underlyingEquivalentVolume: number | null
  referencePrice: number | null
  referenceObservationDate: string | null
  referenceDownloadedAt: string | null
  referenceCurrencyCode: string | null
  referenceUnitCode: string | null
  markStatus: OptionMarkStatus
  markStatusReason: string | null
  intrinsicValuePerUnit: number | null
  intrinsicValue: number | null
  intrinsicExposure: number | null
  breakEvenPrice: number | null
  expiryPnlAtMark: number | null
  profitStateAtMark: OpenOptionProfitState | null
  moneyness: 'ITM' | 'ATM' | 'OTM' | null
  expiryState: OpenOptionExpiryState
  availableActions: OpenOptionLifecycleAction[]
  recommendedAction: OpenOptionLifecycleAction | null
  decisionTone: OpenOptionDecisionTone
  decisionLabel: string
  decisionReason: string
  updatedAt: string
}

export type OptionSettlementValuation = {
  optionTradeId: string
  linkedTradeId: string
  lifecycleStatus: string
  book: string
  commodity: string
  referencePriceIndexCode: string | null
  optionType: string | null
  optionExpirationDate: string | null
  strikePrice: number | null
  linkedPrice: number | null
  referencePrice: number | null
  referenceObservationDate: string | null
  referenceDownloadedAt: string | null
  referenceCurrencyCode: string | null
  referenceUnitCode: string | null
  contracts: number | null
  underlyingDirection: string | null
  underlyingVolume: number | null
  premiumCashflow: number | null
  underlyingCashflow: number | null
  netPackageCashflow: number | null
  effectiveUnitPrice: number | null
  underlyingMarkToMarket: number | null
  packageMarkToMarket: number | null
  markStatus: OptionSettlementMarkStatus
  markStatusReason: string | null
  intrinsicValue: number | null
  moneyness: 'ITM' | 'ATM' | 'OTM' | null
  updatedAt: string
}

function normalizePriceIndexCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? ''
  return normalized === '' ? null : normalized
}

function normalizeSideSign(tradeSide: string | null | undefined): number {
  return (tradeSide ?? 'BUY').trim().toUpperCase() === 'SELL' ? -1 : 1
}

function normalizeOptionSign(optionType: string | null | undefined): number {
  return (optionType ?? 'CALL').trim().toUpperCase() === 'PUT' ? -1 : 1
}

function roundCalculatedValue(value: number): number {
  return Number(value.toFixed(6))
}

export function calculateUnderlyingEquivalentVolume(
  tradeSide: string | null | undefined,
  optionType: string | null | undefined,
  contractVolume: number | null | undefined,
): number {
  return (contractVolume ?? 0) * normalizeSideSign(tradeSide) * normalizeOptionSign(optionType)
}

export function calculatePremiumCashflow(
  tradeSide: string | null | undefined,
  premiumPrice: number | null | undefined,
  contractVolume: number | null | undefined,
): number | null {
  if (premiumPrice === null || premiumPrice === undefined) {
    return null
  }

  return premiumPrice * (contractVolume ?? 0) * normalizeSideSign(tradeSide)
}

export function calculateTradeCashflow(
  tradeSide: string | null | undefined,
  price: number | null | undefined,
  volume: number | null | undefined,
): number | null {
  if (price === null || price === undefined || volume === null || volume === undefined) {
    return null
  }

  return price * volume * normalizeSideSign(tradeSide)
}

export function calculateOptionIntrinsicValuePerUnit(
  optionType: string | null | undefined,
  strikePrice: number | null | undefined,
  referencePrice: number | null | undefined,
): number | null {
  if (
    strikePrice === null ||
    strikePrice === undefined ||
    referencePrice === null ||
    referencePrice === undefined
  ) {
    return null
  }

  if ((optionType ?? 'CALL').trim().toUpperCase() === 'PUT') {
    return Math.max(0, strikePrice - referencePrice)
  }

  return Math.max(0, referencePrice - strikePrice)
}

export function calculateOptionIntrinsicValue(
  optionType: string | null | undefined,
  strikePrice: number | null | undefined,
  referencePrice: number | null | undefined,
  volume: number | null | undefined,
): number | null {
  const intrinsicValuePerUnit = calculateOptionIntrinsicValuePerUnit(
    optionType,
    strikePrice,
    referencePrice,
  )
  if (intrinsicValuePerUnit === null || volume === null || volume === undefined) {
    return null
  }

  return intrinsicValuePerUnit * volume
}

export function calculateOptionBreakEvenPrice(
  optionType: string | null | undefined,
  strikePrice: number | null | undefined,
  premiumPrice: number | null | undefined,
): number | null {
  if (
    strikePrice === null ||
    strikePrice === undefined ||
    premiumPrice === null ||
    premiumPrice === undefined
  ) {
    return null
  }

  if ((optionType ?? 'CALL').trim().toUpperCase() === 'PUT') {
    return roundCalculatedValue(strikePrice - premiumPrice)
  }

  return roundCalculatedValue(strikePrice + premiumPrice)
}

function describeOpenOptionProfitState(
  expiryPnlAtMark: number | null,
  tolerance = 0.005,
): OpenOptionProfitState | null {
  if (expiryPnlAtMark === null) {
    return null
  }
  if (Math.abs(expiryPnlAtMark) <= tolerance) {
    return 'BREAK_EVEN'
  }
  return expiryPnlAtMark > 0 ? 'PROFITABLE' : 'LOSS_MAKING'
}

export function describeOptionMoneyness(
  optionType: string | null | undefined,
  strikePrice: number | null | undefined,
  referencePrice: number | null | undefined,
  tolerance = 0.005,
): 'ITM' | 'ATM' | 'OTM' | null {
  if (
    strikePrice === null ||
    strikePrice === undefined ||
    referencePrice === null ||
    referencePrice === undefined
  ) {
    return null
  }

  if (Math.abs(referencePrice - strikePrice) <= tolerance) {
    return 'ATM'
  }

  const isPut = (optionType ?? 'CALL').trim().toUpperCase() === 'PUT'
  if (isPut) {
    return referencePrice < strikePrice ? 'ITM' : 'OTM'
  }

  return referencePrice > strikePrice ? 'ITM' : 'OTM'
}

export function calculateDaysToExpiration(
  optionExpirationDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const normalizedDate = optionExpirationDate?.trim()
  if (!normalizedDate) {
    return null
  }

  const [yearText, monthText, dayText] = normalizedDate.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const targetUtc = Date.UTC(year, month - 1, day)
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((targetUtc - todayUtc) / 86_400_000)
}

function buildOpenOptionAvailableActions(args: {
  tradeSide: string | null
  optionStyle: string | null
  daysToExpiration: number | null
}): OpenOptionLifecycleAction[] {
  const normalizedSide = (args.tradeSide ?? 'BUY').trim().toUpperCase()
  const normalizedStyle = (args.optionStyle ?? 'AMERICAN').trim().toUpperCase()
  const actions: OpenOptionLifecycleAction[] = []
  const canExpire = args.daysToExpiration !== null && args.daysToExpiration <= 0
  const canExercise =
    normalizedSide === 'BUY' &&
    args.daysToExpiration !== null &&
    (normalizedStyle === 'EUROPEAN'
      ? args.daysToExpiration === 0
      : args.daysToExpiration >= 0)
  const canAssign =
    normalizedSide === 'SELL' &&
    args.daysToExpiration !== null &&
    (normalizedStyle === 'EUROPEAN'
      ? args.daysToExpiration === 0
      : args.daysToExpiration >= 0)

  if (canExercise) {
    actions.push('OptionExercised')
  }
  if (canAssign) {
    actions.push('OptionAssigned')
  }
  if (canExpire) {
    actions.push('OptionExpired')
  }

  return actions
}

function buildOpenOptionExpiryState(daysToExpiration: number | null): OpenOptionExpiryState {
  if (daysToExpiration === null) {
    return 'OPEN'
  }
  if (daysToExpiration < 0) {
    return 'PAST_EXPIRY_UNRESOLVED'
  }
  if (daysToExpiration === 0) {
    return 'EXPIRING_TODAY'
  }
  if (daysToExpiration <= 5) {
    return 'EXPIRING_SOON'
  }
  return 'OPEN'
}

function buildOpenOptionDecision(args: {
  tradeSide: string | null
  optionType: string | null
  optionStyle: string | null
  daysToExpiration: number | null
  moneyness: 'ITM' | 'ATM' | 'OTM' | null
  availableActions: OpenOptionLifecycleAction[]
}): {
  expiryState: OpenOptionExpiryState
  recommendedAction: OpenOptionLifecycleAction | null
  decisionTone: OpenOptionDecisionTone
  decisionLabel: string
  decisionReason: string
} {
  const normalizedSide = (args.tradeSide ?? 'BUY').trim().toUpperCase()
  const normalizedOptionType = (args.optionType ?? 'CALL').trim().toUpperCase()
  const normalizedStyle = (args.optionStyle ?? 'AMERICAN').trim().toUpperCase()
  const sideLabel = normalizedSide === 'SELL' ? 'sell-side' : 'buy-side'
  const optionLabel = normalizedOptionType === 'PUT' ? 'put' : 'call'
  const styleLabel = normalizedStyle === 'EUROPEAN' ? 'European' : 'American'
  const expiryState = buildOpenOptionExpiryState(args.daysToExpiration)

  if (expiryState === 'PAST_EXPIRY_UNRESOLVED') {
    const daysPast = Math.abs(args.daysToExpiration ?? 0)
    return {
      expiryState,
      recommendedAction: args.availableActions.includes('OptionExpired') ? 'OptionExpired' : null,
      decisionTone: 'blocked',
      decisionLabel: 'Past expiry unresolved',
      decisionReason: `Expiration date passed ${daysPast} day${daysPast === 1 ? '' : 's'} ago and the option is still ACTIVE. Record the closing lifecycle outcome now.`,
    }
  }

  if (expiryState === 'EXPIRING_TODAY') {
    if (args.moneyness === 'ITM' && normalizedSide === 'BUY' && args.availableActions.includes('OptionExercised')) {
      return {
        expiryState,
        recommendedAction: 'OptionExercised',
        decisionTone: 'blocked',
        decisionLabel: 'Exercise candidate today',
        decisionReason: `${styleLabel} ${sideLabel} ${optionLabel} is in the money on expiry day. Exercise will close the option and trigger the underlying settlement path.`,
      }
    }
    if (args.moneyness === 'ITM' && normalizedSide === 'SELL' && args.availableActions.includes('OptionAssigned')) {
      return {
        expiryState,
        recommendedAction: 'OptionAssigned',
        decisionTone: 'blocked',
        decisionLabel: 'Assignment candidate today',
        decisionReason: `${styleLabel} ${sideLabel} ${optionLabel} is in the money on expiry day. Record assignment if the holder has taken up the option.`,
      }
    }
    return {
      expiryState,
      recommendedAction: args.availableActions.includes('OptionExpired') ? 'OptionExpired' : null,
      decisionTone: 'blocked',
      decisionLabel: 'Expiry decision due today',
      decisionReason:
        args.moneyness === 'OTM'
          ? `Option is out of the money on expiry day and can usually be expired if no other action is required.`
          : args.moneyness === 'ATM'
            ? `Option is at the money on expiry day. Confirm desk intent, then record exercise, assignment, or expiry.`
            : `Expiration date is today. Confirm the final lifecycle outcome before the option rolls off the book.`,
    }
  }

  if (expiryState === 'EXPIRING_SOON') {
    const daysText = `${args.daysToExpiration} day${args.daysToExpiration === 1 ? '' : 's'}`
    if (args.moneyness === 'ITM' && normalizedStyle === 'AMERICAN' && normalizedSide === 'BUY' && args.availableActions.includes('OptionExercised')) {
      return {
        expiryState,
        recommendedAction: 'OptionExercised',
        decisionTone: 'in-progress',
        decisionLabel: 'Early exercise available',
        decisionReason: `American ${sideLabel} ${optionLabel} is in the money with ${daysText} left to expiry. Exercise is available before expiration if the desk wants the underlying now.`,
      }
    }
    if (args.moneyness === 'ITM' && normalizedStyle === 'AMERICAN' && normalizedSide === 'SELL' && args.availableActions.includes('OptionAssigned')) {
      return {
        expiryState,
        recommendedAction: 'OptionAssigned',
        decisionTone: 'in-progress',
        decisionLabel: 'Assignment risk into expiry',
        decisionReason: `American ${sideLabel} ${optionLabel} is in the money with ${daysText} left to expiry. Be ready to record assignment if the holder acts early.`,
      }
    }
    if (args.moneyness === 'ITM' && normalizedStyle === 'EUROPEAN') {
      return {
        expiryState,
        recommendedAction: null,
        decisionTone: 'in-progress',
        decisionLabel: 'Expiry watch',
        decisionReason: `European ${sideLabel} ${optionLabel} is in the money with ${daysText} left. Exercise or assignment can only be recorded on expiry day.`,
      }
    }
    return {
      expiryState,
      recommendedAction: null,
      decisionTone: 'in-progress',
      decisionLabel: 'Expiry watch',
      decisionReason: `Option expires in ${daysText} and is currently ${args.moneyness ?? 'unmarked'}. Monitor the final lifecycle decision before expiry.`,
    }
  }

  return {
    expiryState,
    recommendedAction: null,
    decisionTone: 'active',
    decisionLabel: 'Monitor',
    decisionReason:
      args.daysToExpiration === null
        ? 'Option expiration date is missing, so expiry management cues are limited.'
        : `Option remains open with ${args.daysToExpiration} day${args.daysToExpiration === 1 ? '' : 's'} to expiry.`,
  }
}

export function buildOptionExposureSummary(
  optionExposures: OptionExposureRow[],
  now: Date = new Date(),
): {
  optionCount: number
  grossContracts: number
  netUnderlyingEquivalentVolume: number
  grossPremiumAtRisk: number
  exposureByClass: Array<{ commodityClass: string; underlyingEquivalentVolume: number }>
  soonestExpirationTradeId: string | null
  soonestExpirationDate: string | null
  soonestExpirationDays: number | null
} {
  let grossContracts = 0
  let netUnderlyingEquivalentVolume = 0
  let grossPremiumAtRisk = 0
  let soonestExpirationTradeId: string | null = null
  let soonestExpirationDate: string | null = null
  let soonestExpirationDays: number | null = null

  const exposureByClass = new Map<string, number>()

  for (const row of optionExposures) {
    grossContracts += Math.abs(row.contract_volume)
    netUnderlyingEquivalentVolume += row.underlying_equivalent_volume
    grossPremiumAtRisk += Math.abs(row.premium_cashflow ?? 0)

    const currentClassExposure = exposureByClass.get(row.commodity_class) ?? 0
    exposureByClass.set(
      row.commodity_class,
      currentClassExposure + row.underlying_equivalent_volume,
    )

    const nextDays = calculateDaysToExpiration(row.option_expiration_date, now)
    if (nextDays === null) {
      continue
    }
    if (soonestExpirationDays === null || nextDays < soonestExpirationDays) {
      soonestExpirationTradeId = row.trade_id
      soonestExpirationDate = row.option_expiration_date
      soonestExpirationDays = nextDays
    }
  }

  return {
    optionCount: optionExposures.length,
    grossContracts,
    netUnderlyingEquivalentVolume,
    grossPremiumAtRisk,
    exposureByClass: [...exposureByClass.entries()]
      .map(([commodityClass, underlyingEquivalentVolume]) => ({
        commodityClass,
        underlyingEquivalentVolume,
      }))
      .sort(
        (left, right) =>
          Math.abs(right.underlyingEquivalentVolume) - Math.abs(left.underlyingEquivalentVolume),
      ),
    soonestExpirationTradeId,
    soonestExpirationDate,
    soonestExpirationDays,
  }
}

export function buildOpenOptionValuation(
  optionTrade: OpenOptionTradeLike,
  latestMarksByPriceIndexCode: Record<string, PriceIndexMarkLike> = {},
  now: Date = new Date(),
): OpenOptionValuation | null {
  if ((optionTrade.instrument_type ?? 'LINEAR').trim().toUpperCase() !== 'OPTION') {
    return null
  }
  if ((optionTrade.status ?? 'ACTIVE').trim().toUpperCase() !== 'ACTIVE') {
    return null
  }

  const referencePriceIndexCode = normalizePriceIndexCode(optionTrade.price_index_code)
  const latestReferenceMark = referencePriceIndexCode
    ? latestMarksByPriceIndexCode[referencePriceIndexCode] ?? null
    : null
  const referencePrice = latestReferenceMark?.value ?? null
  let markStatus: OptionMarkStatus = 'VALUED'
  let markStatusReason: string | null = null

  if (referencePriceIndexCode === null) {
    markStatus = 'UNPRICED_MISSING_PRICE_INDEX'
    markStatusReason = 'No linked price index is available for this option trade.'
  } else if (latestReferenceMark === null) {
    markStatus = 'UNPRICED_MISSING_MARK'
    markStatusReason = 'No market observation is available yet for the linked price index.'
  }

  const intrinsicValuePerUnit = calculateOptionIntrinsicValuePerUnit(
    optionTrade.option_type,
    optionTrade.option_strike_price,
    referencePrice,
  )
  const intrinsicValue = calculateOptionIntrinsicValue(
    optionTrade.option_type,
    optionTrade.option_strike_price,
    referencePrice,
    optionTrade.volume,
  )
  const intrinsicExposure =
    intrinsicValue !== null
      ? roundCalculatedValue(intrinsicValue * normalizeSideSign(optionTrade.trade_side))
      : null
  const moneyness = describeOptionMoneyness(
    optionTrade.option_type,
    optionTrade.option_strike_price,
    referencePrice,
  )
  const daysToExpiration = calculateDaysToExpiration(optionTrade.option_expiration_date, now)
  const availableActions = buildOpenOptionAvailableActions({
    tradeSide: optionTrade.trade_side,
    optionStyle: optionTrade.option_style,
    daysToExpiration,
  })
  const premiumCashflow = calculatePremiumCashflow(
    optionTrade.trade_side,
    optionTrade.price,
    optionTrade.volume,
  )
  const breakEvenPrice = calculateOptionBreakEvenPrice(
    optionTrade.option_type,
    optionTrade.option_strike_price,
    optionTrade.price,
  )
  const expiryPnlAtMark =
    intrinsicExposure !== null && premiumCashflow !== null
      ? roundCalculatedValue(intrinsicExposure - premiumCashflow)
      : null
  const decision = buildOpenOptionDecision({
    tradeSide: optionTrade.trade_side,
    optionType: optionTrade.option_type,
    optionStyle: optionTrade.option_style,
    daysToExpiration,
    moneyness,
    availableActions,
  })

  return {
    tradeId: optionTrade.trade_id,
    lifecycleStatus: optionTrade.status,
    book: optionTrade.book,
    commodity: optionTrade.commodity,
    tradeSide: optionTrade.trade_side,
    optionType: optionTrade.option_type,
    optionStyle: optionTrade.option_style,
    referencePriceIndexCode,
    strikePrice: optionTrade.option_strike_price,
    optionExpirationDate: optionTrade.option_expiration_date,
    daysToExpiration,
    contracts: optionTrade.volume,
    premiumPrice: optionTrade.price,
    premiumCashflow,
    underlyingEquivalentVolume: calculateUnderlyingEquivalentVolume(
      optionTrade.trade_side,
      optionTrade.option_type,
      optionTrade.volume,
    ),
    referencePrice,
    referenceObservationDate: latestReferenceMark?.observation_date ?? null,
    referenceDownloadedAt: latestReferenceMark?.downloaded_at ?? null,
    referenceCurrencyCode: latestReferenceMark?.currency_code ?? optionTrade.trade_currency_code ?? null,
    referenceUnitCode: latestReferenceMark?.unit_code ?? optionTrade.price_unit_code ?? null,
    markStatus,
    markStatusReason,
    intrinsicValuePerUnit,
    intrinsicValue,
    intrinsicExposure,
    breakEvenPrice,
    expiryPnlAtMark,
    profitStateAtMark: describeOpenOptionProfitState(expiryPnlAtMark),
    moneyness,
    expiryState: decision.expiryState,
    availableActions,
    recommendedAction: decision.recommendedAction,
    decisionTone: decision.decisionTone,
    decisionLabel: decision.decisionLabel,
    decisionReason: decision.decisionReason,
    updatedAt:
      [optionTrade.updated_at, latestReferenceMark?.downloaded_at ?? '']
        .filter((value) => value.trim() !== '')
        .sort()
        .at(-1) ?? optionTrade.updated_at,
  }
}

export function buildOpenOptionValuationSummary(
  optionTrades: OpenOptionTradeLike[],
  latestMarksByPriceIndexCode: Record<string, PriceIndexMarkLike> = {},
  now: Date = new Date(),
): {
  optionCount: number
  markedCount: number
  awaitingMarkCount: number
  inTheMoneyCount: number
  profitableCount: number
  expiringSoonCount: number
  expiringTodayCount: number
  pastExpiryCount: number
  netIntrinsicExposure: number
  grossIntrinsicExposure: number
  netExpiryPnlAtMark: number
  valuations: OpenOptionValuation[]
} {
  const valuations = optionTrades
    .map((trade) => buildOpenOptionValuation(trade, latestMarksByPriceIndexCode, now))
    .filter((valuation): valuation is OpenOptionValuation => valuation !== null)

  valuations.sort((left, right) => {
    const intrinsicDelta = Math.abs(right.intrinsicExposure ?? 0) - Math.abs(left.intrinsicExposure ?? 0)
    if (intrinsicDelta !== 0) {
      return intrinsicDelta
    }
    if (left.daysToExpiration !== null && right.daysToExpiration !== null) {
      if (left.daysToExpiration !== right.daysToExpiration) {
        return left.daysToExpiration - right.daysToExpiration
      }
    } else if (left.daysToExpiration !== null) {
      return -1
    } else if (right.daysToExpiration !== null) {
      return 1
    }
    return right.updatedAt.localeCompare(left.updatedAt)
  })

  return {
    optionCount: valuations.length,
    markedCount: valuations.filter((valuation) => valuation.markStatus === 'VALUED').length,
    awaitingMarkCount: valuations.filter((valuation) => valuation.markStatus !== 'VALUED').length,
    inTheMoneyCount: valuations.filter((valuation) => valuation.moneyness === 'ITM').length,
    profitableCount: valuations.filter((valuation) => valuation.profitStateAtMark === 'PROFITABLE').length,
    expiringSoonCount: valuations.filter((valuation) => valuation.expiryState === 'EXPIRING_SOON').length,
    expiringTodayCount: valuations.filter((valuation) => valuation.expiryState === 'EXPIRING_TODAY').length,
    pastExpiryCount: valuations.filter((valuation) => valuation.expiryState === 'PAST_EXPIRY_UNRESOLVED').length,
    netIntrinsicExposure: valuations.reduce((sum, valuation) => sum + (valuation.intrinsicExposure ?? 0), 0),
    grossIntrinsicExposure: valuations.reduce(
      (sum, valuation) => sum + Math.abs(valuation.intrinsicExposure ?? 0),
      0,
    ),
    netExpiryPnlAtMark: valuations.reduce((sum, valuation) => sum + (valuation.expiryPnlAtMark ?? 0), 0),
    valuations,
  }
}

export function buildOpenOptionActionQueue(
  optionTrades: OpenOptionTradeLike[],
  latestMarksByPriceIndexCode: Record<string, PriceIndexMarkLike> = {},
  now: Date = new Date(),
): OpenOptionValuation[] {
  const expiryStatePriority: Record<OpenOptionExpiryState, number> = {
    PAST_EXPIRY_UNRESOLVED: 0,
    EXPIRING_TODAY: 1,
    EXPIRING_SOON: 2,
    OPEN: 3,
  }

  return optionTrades
    .map((trade) => buildOpenOptionValuation(trade, latestMarksByPriceIndexCode, now))
    .filter((valuation): valuation is OpenOptionValuation => valuation !== null)
    .filter((valuation) => valuation.expiryState !== 'OPEN')
    .sort((left, right) => {
      const expiryPriorityDelta =
        expiryStatePriority[left.expiryState] - expiryStatePriority[right.expiryState]
      if (expiryPriorityDelta !== 0) {
        return expiryPriorityDelta
      }
      if (left.recommendedAction && !right.recommendedAction) {
        return -1
      }
      if (!left.recommendedAction && right.recommendedAction) {
        return 1
      }
      if (left.daysToExpiration !== null && right.daysToExpiration !== null) {
        if (left.daysToExpiration !== right.daysToExpiration) {
          return left.daysToExpiration - right.daysToExpiration
        }
      } else if (left.daysToExpiration !== null) {
        return -1
      } else if (right.daysToExpiration !== null) {
        return 1
      }
      const intrinsicExposureDelta =
        Math.abs(right.intrinsicExposure ?? 0) - Math.abs(left.intrinsicExposure ?? 0)
      if (intrinsicExposureDelta !== 0) {
        return intrinsicExposureDelta
      }
      return right.updatedAt.localeCompare(left.updatedAt)
    })
}

export function buildOptionSettlementValuation(
  optionTrade: OptionSettlementTradeLike,
  linkedTrade: OptionSettlementTradeLike,
  latestMarksByPriceIndexCode: Record<string, PriceIndexMarkLike> = {},
): OptionSettlementValuation | null {
  if ((optionTrade.instrument_type ?? 'LINEAR').trim().toUpperCase() !== 'OPTION') {
    return null
  }
  if (linkedTrade.originating_option_trade_id !== optionTrade.trade_id) {
    return null
  }

  const premiumCashflow = calculatePremiumCashflow(
    optionTrade.trade_side,
    optionTrade.price,
    optionTrade.volume,
  )
  const underlyingCashflow = calculateTradeCashflow(
    linkedTrade.trade_side,
    linkedTrade.price,
    linkedTrade.volume,
  )
  const netPackageCashflow =
    premiumCashflow === null || underlyingCashflow === null
      ? null
      : premiumCashflow + underlyingCashflow
  const effectiveUnitPrice =
    netPackageCashflow !== null && linkedTrade.volume && linkedTrade.volume !== 0
      ? roundCalculatedValue(Math.abs(netPackageCashflow / linkedTrade.volume))
      : null
  const referencePriceIndexCode =
    normalizePriceIndexCode(linkedTrade.price_index_code) ??
    normalizePriceIndexCode(optionTrade.price_index_code)
  const latestReferenceMark = referencePriceIndexCode
    ? latestMarksByPriceIndexCode[referencePriceIndexCode] ?? null
    : null
  const referencePrice = latestReferenceMark?.value ?? null
  let markStatus: OptionSettlementMarkStatus = 'VALUED'
  let markStatusReason: string | null = null

  if (referencePriceIndexCode === null) {
    markStatus = 'UNPRICED_MISSING_PRICE_INDEX'
    markStatusReason = 'No linked price index is available for this option settlement package.'
  } else if (latestReferenceMark === null) {
    markStatus = 'UNPRICED_MISSING_MARK'
    markStatusReason = 'No market observation is available yet for the linked price index.'
  }

  const underlyingMarkToMarket =
    referencePrice !== null &&
    linkedTrade.price !== null &&
    linkedTrade.volume !== null &&
    linkedTrade.volume !== 0
      ? roundCalculatedValue(
          (referencePrice - linkedTrade.price) *
            linkedTrade.volume *
            normalizeSideSign(linkedTrade.trade_side),
        )
      : null
  const packageMarkToMarket =
    referencePrice !== null &&
    effectiveUnitPrice !== null &&
    linkedTrade.volume !== null &&
    linkedTrade.volume !== 0
      ? roundCalculatedValue(
          (referencePrice - effectiveUnitPrice) *
            linkedTrade.volume *
            normalizeSideSign(linkedTrade.trade_side),
        )
      : null
  const intrinsicValue = calculateOptionIntrinsicValue(
    optionTrade.option_type,
    optionTrade.option_strike_price,
    referencePrice,
    linkedTrade.volume ?? optionTrade.volume,
  )
  const moneyness = describeOptionMoneyness(
    optionTrade.option_type,
    optionTrade.option_strike_price,
    referencePrice,
  )

  return {
    optionTradeId: optionTrade.trade_id,
    linkedTradeId: linkedTrade.trade_id,
    lifecycleStatus: optionTrade.status,
    book: optionTrade.book,
    commodity: optionTrade.commodity,
    referencePriceIndexCode,
    optionType: optionTrade.option_type,
    optionExpirationDate: optionTrade.option_expiration_date,
    strikePrice: optionTrade.option_strike_price,
    linkedPrice: linkedTrade.price,
    referencePrice,
    referenceObservationDate: latestReferenceMark?.observation_date ?? null,
    referenceDownloadedAt: latestReferenceMark?.downloaded_at ?? null,
    referenceCurrencyCode: latestReferenceMark?.currency_code ?? null,
    referenceUnitCode: latestReferenceMark?.unit_code ?? null,
    contracts: optionTrade.volume,
    underlyingDirection: linkedTrade.trade_side,
    underlyingVolume: linkedTrade.volume,
    premiumCashflow,
    underlyingCashflow,
    netPackageCashflow,
    effectiveUnitPrice,
    underlyingMarkToMarket,
    packageMarkToMarket,
    markStatus,
    markStatusReason,
    intrinsicValue,
    moneyness,
    updatedAt:
      [linkedTrade.updated_at, optionTrade.updated_at, latestReferenceMark?.downloaded_at ?? '']
        .filter((value) => value.trim() !== '')
        .sort()
        .at(-1) ?? linkedTrade.updated_at,
  }
}

export function buildOptionSettlementSummary(
  trades: OptionSettlementTradeLike[],
  latestMarksByPriceIndexCode: Record<string, PriceIndexMarkLike> = {},
): {
  pairCount: number
  grossContracts: number
  netUnderlyingVolume: number
  netPackageCashflow: number
  grossPackageCashflow: number
  valuations: OptionSettlementValuation[]
} {
  const tradesByOptionId = new Map<string, OptionSettlementTradeLike>()
  const valuations: OptionSettlementValuation[] = []

  for (const trade of trades) {
    if ((trade.instrument_type ?? 'LINEAR').trim().toUpperCase() === 'OPTION') {
      tradesByOptionId.set(trade.trade_id, trade)
    }
  }

  for (const trade of trades) {
    if (!trade.originating_option_trade_id) {
      continue
    }
    const optionTrade = tradesByOptionId.get(trade.originating_option_trade_id)
    if (!optionTrade) {
      continue
    }

    const valuation = buildOptionSettlementValuation(
      optionTrade,
      trade,
      latestMarksByPriceIndexCode,
    )
    if (valuation) {
      valuations.push(valuation)
    }
  }

  valuations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  return {
    pairCount: valuations.length,
    grossContracts: valuations.reduce((sum, row) => sum + Math.abs(row.contracts ?? 0), 0),
    netUnderlyingVolume: valuations.reduce(
      (sum, row) => sum + ((row.underlyingVolume ?? 0) * normalizeSideSign(row.underlyingDirection)),
      0,
    ),
    netPackageCashflow: valuations.reduce((sum, row) => sum + (row.netPackageCashflow ?? 0), 0),
    grossPackageCashflow: valuations.reduce((sum, row) => sum + Math.abs(row.netPackageCashflow ?? 0), 0),
    valuations,
  }
}
