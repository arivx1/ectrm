type CounterpartyCreditRecord = {
  code: string
  name: string
  credit_status?: string | null
}

type CounterpartyCreditProfileRecord = {
  counterparty_code: string
  limit_currency_code?: string | null
  limit_amount?: number | null
  breach_action: string
}

type TradeExposureRecord = {
  trade_id?: string | null
  status?: string | null
  counterparty?: string | null
  trade_currency_code?: string | null
  price?: number | null
  volume?: number | null
}

export type CounterpartyCreditPolicyPreview = {
  title: string
  message: string
  tone: 'info' | 'warning' | 'error'
  breach_action?: string | null
  limit_breached: boolean
}

const TRADABLE_COUNTERPARTY_CREDIT_STATUSES = new Set(['APPROVED'])

import { tradeStatusIsActive } from '../../shared/trading'

function normalizeOptionalUppercase(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase()
  return normalized || null
}

function normalizeTradeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMoney(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`
  }
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)}%`
}

function tradeExposureAmount(
  tradeCurrencyCode: string | null,
  price: number | null,
  volume: number | null,
  requiredCurrencyCode: string | null,
): number | null {
  if (!tradeCurrencyCode || !requiredCurrencyCode || tradeCurrencyCode !== requiredCurrencyCode) {
    return null
  }
  if (price == null || volume == null) {
    return null
  }
  return Math.abs(price * volume)
}

export function normalizeCounterpartyCreditStatus(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase()
  return normalized || 'APPROVED'
}

export function formatCounterpartyCreditLabel(value: string | null | undefined): string {
  return normalizeCounterpartyCreditStatus(value).replaceAll('_', ' ')
}

export function counterpartyCreditStatusAllowsTrading(value: string | null | undefined): boolean {
  return TRADABLE_COUNTERPARTY_CREDIT_STATUSES.has(normalizeCounterpartyCreditStatus(value))
}

export function buildCounterpartyCreditRestrictionMessage(
  counterparty: CounterpartyCreditRecord | null | undefined,
): string | null {
  if (!counterparty || counterpartyCreditStatusAllowsTrading(counterparty.credit_status)) {
    return null
  }

  return `${counterparty.name} (${counterparty.code}) is ${formatCounterpartyCreditLabel(
    counterparty.credit_status,
  )}. Trade booking and amendment stay blocked until credit returns to APPROVED.`
}

export function formatCounterpartyOptionLabel(
  counterparty: CounterpartyCreditRecord,
): string {
  const normalizedCreditStatus = normalizeCounterpartyCreditStatus(counterparty.credit_status)
  if (normalizedCreditStatus === 'APPROVED') {
    return counterparty.name
  }

  return `${counterparty.name} · ${formatCounterpartyCreditLabel(counterparty.credit_status)}`
}

export function buildCounterpartyCreditPolicyPreview(args: {
  profiles: CounterpartyCreditProfileRecord[]
  trades: TradeExposureRecord[]
  tradeId?: string | null
  counterpartyCode?: string | null
  tradeCurrencyCode?: string | null
  price?: number | null
  volume?: number | null
}): CounterpartyCreditPolicyPreview | null {
  const counterpartyCode = normalizeOptionalUppercase(args.counterpartyCode)
  if (!counterpartyCode) {
    return null
  }

  const profile =
    args.profiles.find((entry) => entry.counterparty_code === counterpartyCode) ?? null
  const limitCurrencyCode = normalizeOptionalUppercase(profile?.limit_currency_code)
  const limitAmount = normalizeTradeNumber(profile?.limit_amount)
  if (!profile || !limitCurrencyCode || limitAmount == null || limitAmount <= 0) {
    return null
  }

  const currentExposureAmount = args.trades.reduce((sum, trade) => {
    if (
      !tradeStatusIsActive(trade.status) ||
      trade.counterparty !== counterpartyCode ||
      (args.tradeId && trade.trade_id === args.tradeId)
    ) {
      return sum
    }

    const exposureAmount = tradeExposureAmount(
      normalizeOptionalUppercase(trade.trade_currency_code),
      normalizeTradeNumber(trade.price),
      normalizeTradeNumber(trade.volume),
      limitCurrencyCode,
    )
    return sum + (exposureAmount ?? 0)
  }, 0)

  const projectedTradeExposureAmount = tradeExposureAmount(
    normalizeOptionalUppercase(args.tradeCurrencyCode),
    normalizeTradeNumber(args.price),
    normalizeTradeNumber(args.volume),
    limitCurrencyCode,
  )

  if (projectedTradeExposureAmount == null) {
    if (normalizeOptionalUppercase(args.tradeCurrencyCode) && normalizeOptionalUppercase(args.tradeCurrencyCode) !== limitCurrencyCode) {
      return {
        title: 'Projected utilization unavailable',
        message: `This trade is using ${normalizeOptionalUppercase(args.tradeCurrencyCode)} while the governed credit limit is ${limitCurrencyCode}, so projected utilization is not directly comparable yet.`,
        tone: 'info',
        breach_action: profile.breach_action,
        limit_breached: false,
      }
    }

    return {
      title: 'Projected utilization unavailable',
      message: `A governed limit of ${formatMoney(limitAmount, limitCurrencyCode)} is saved for this counterparty, but projected utilization needs trade currency, price, and volume before it can be calculated.`,
      tone: 'info',
      breach_action: profile.breach_action,
      limit_breached: false,
    }
  }

  const projectedExposureAmount = currentExposureAmount + projectedTradeExposureAmount
  const projectedUtilizationPercent = (projectedExposureAmount / limitAmount) * 100
  const limitBreachMessage = `Projected exposure would be ${formatMoney(
    projectedExposureAmount,
    limitCurrencyCode,
  )} against a governed limit of ${formatMoney(limitAmount, limitCurrencyCode)} (${formatPercent(
    projectedUtilizationPercent,
  )} utilization).`

  if (projectedExposureAmount <= limitAmount) {
    return {
      title: 'Projected counterparty utilization',
      message: limitBreachMessage,
      tone: 'info',
      breach_action: profile.breach_action,
      limit_breached: false,
    }
  }

  const normalizedBreachAction = normalizeOptionalUppercase(profile.breach_action) ?? 'REQUIRE_APPROVAL'
  if (normalizedBreachAction === 'BLOCK') {
    return {
      title: 'Counterparty limit would block submission',
      message: `${limitBreachMessage} Submission will be blocked because the breach action is BLOCK.`,
      tone: 'error',
      breach_action: normalizedBreachAction,
      limit_breached: true,
    }
  }
  if (normalizedBreachAction === 'REQUIRE_APPROVAL') {
    return {
      title: 'Counterparty limit requires credit review',
      message: `${limitBreachMessage} Submission is allowed, but it will open a CREDIT_APPROVAL workflow item for follow-up.`,
      tone: 'warning',
      breach_action: normalizedBreachAction,
      limit_breached: true,
    }
  }

  return {
    title: 'Counterparty limit exceeded',
    message: `${limitBreachMessage} The breach action is WARN, so the trade can still be submitted.`,
    tone: 'warning',
    breach_action: normalizedBreachAction,
    limit_breached: true,
  }
}
