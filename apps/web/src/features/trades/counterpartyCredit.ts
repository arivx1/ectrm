type CounterpartyCreditRecord = {
  code: string
  name: string
  credit_status?: string | null
}

const TRADABLE_COUNTERPARTY_CREDIT_STATUSES = new Set(['APPROVED'])

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
