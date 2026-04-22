import {
  formatCounterpartyCreditLabel,
  formatCounterpartyOptionLabel,
  normalizeCounterpartyCreditStatus,
} from './counterpartyCredit'

type CounterpartySearchRecord = {
  code: string
  name: string
  credit_status?: string | null
}

export type CounterpartySearchOption = {
  code: string
  name: string
  displayValue: string
  secondaryLabel: string
}

function normalizeSearchValue(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/g, ' ')
}

function buildSearchBlob(counterparty: CounterpartySearchRecord): string {
  return normalizeSearchValue(
    [
      counterparty.code,
      counterparty.name,
      formatCounterpartyOptionLabel(counterparty),
      formatCounterpartyCreditLabel(counterparty.credit_status),
      buildCounterpartySearchDisplayValue(counterparty),
    ].join(' '),
  )
}

function rankCounterpartyMatch(counterparty: CounterpartySearchRecord, normalizedQuery: string): number | null {
  if (!normalizedQuery) {
    return 0
  }

  const normalizedCode = normalizeSearchValue(counterparty.code)
  const normalizedName = normalizeSearchValue(counterparty.name)
  const normalizedOptionLabel = normalizeSearchValue(formatCounterpartyOptionLabel(counterparty))
  const normalizedDisplayValue = normalizeSearchValue(buildCounterpartySearchDisplayValue(counterparty))
  const searchBlob = buildSearchBlob(counterparty)

  if (normalizedCode === normalizedQuery) {
    return 0
  }
  if (normalizedName === normalizedQuery) {
    return 1
  }
  if (normalizedDisplayValue === normalizedQuery || normalizedOptionLabel === normalizedQuery) {
    return 2
  }
  if (normalizedCode.startsWith(normalizedQuery)) {
    return 3
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 4
  }
  if (normalizedDisplayValue.startsWith(normalizedQuery) || normalizedOptionLabel.startsWith(normalizedQuery)) {
    return 5
  }
  if (searchBlob.includes(` ${normalizedQuery}`)) {
    return 6
  }
  if (searchBlob.includes(normalizedQuery)) {
    return 7
  }
  return null
}

function buildSecondaryLabel(counterparty: CounterpartySearchRecord): string {
  return `${counterparty.code} · ${formatCounterpartyCreditLabel(counterparty.credit_status)}`
}

function compareCounterpartyOptions(a: CounterpartySearchOption, b: CounterpartySearchOption): number {
  const nameComparison = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  if (nameComparison !== 0) {
    return nameComparison
  }
  return a.code.localeCompare(b.code, 'en', { sensitivity: 'base' })
}

export function buildCounterpartySearchDisplayValue(
  counterparty: CounterpartySearchRecord | null | undefined,
): string {
  if (!counterparty) {
    return ''
  }
  return `${counterparty.name} (${counterparty.code})`
}

export function buildCounterpartySearchSelectionLabel(
  counterparty: CounterpartySearchRecord | null | undefined,
): string | null {
  if (!counterparty) {
    return null
  }

  const normalizedStatus = normalizeCounterpartyCreditStatus(counterparty.credit_status)
  if (normalizedStatus === 'APPROVED') {
    return `Submitting as ${counterparty.code}.`
  }

  return `Submitting as ${counterparty.code} · ${formatCounterpartyCreditLabel(counterparty.credit_status)}.`
}

export function findCounterpartySearchMatch<T extends CounterpartySearchRecord>(
  counterparties: readonly T[],
  query: string,
): T | null {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) {
    return null
  }

  return (
    counterparties.find((counterparty) => normalizeSearchValue(counterparty.code) === normalizedQuery) ??
    counterparties.find((counterparty) => normalizeSearchValue(counterparty.name) === normalizedQuery) ??
    counterparties.find(
      (counterparty) => normalizeSearchValue(buildCounterpartySearchDisplayValue(counterparty)) === normalizedQuery,
    ) ??
    counterparties.find(
      (counterparty) => normalizeSearchValue(formatCounterpartyOptionLabel(counterparty)) === normalizedQuery,
    ) ??
    null
  )
}

export function buildVisibleCounterpartySearchOptions<T extends CounterpartySearchRecord>(
  counterparties: readonly T[],
  query: string,
  selectedCode: string,
  limit: number = 8,
): CounterpartySearchOption[] {
  const normalizedQuery = normalizeSearchValue(query)
  const visibleOptions =
    normalizedQuery.length === 0
      ? counterparties
          .map((counterparty) => ({
            code: counterparty.code,
            name: counterparty.name,
            displayValue: buildCounterpartySearchDisplayValue(counterparty),
            secondaryLabel: buildSecondaryLabel(counterparty),
            selected: counterparty.code === selectedCode,
          }))
          .sort((a, b) => {
            if (a.selected !== b.selected) {
              return a.selected ? -1 : 1
            }
            return compareCounterpartyOptions(a, b)
          })
      : counterparties
          .map((counterparty) => {
            const rank = rankCounterpartyMatch(counterparty, normalizedQuery)
            if (rank == null) {
              return null
            }

            return {
              code: counterparty.code,
              name: counterparty.name,
              displayValue: buildCounterpartySearchDisplayValue(counterparty),
              secondaryLabel: buildSecondaryLabel(counterparty),
              rank,
            }
          })
          .filter((option): option is CounterpartySearchOption & { rank: number } => option != null)
          .sort((a, b) => {
            if (a.rank !== b.rank) {
              return a.rank - b.rank
            }
            return compareCounterpartyOptions(a, b)
          })

  return visibleOptions.slice(0, limit).map(({ code, name, displayValue, secondaryLabel }) => ({
    code,
    name,
    displayValue,
    secondaryLabel,
  }))
}
