type ReferenceSearchRecord = {
  code: string
  name: string
}

export type ReferenceSearchOption = {
  code: string
  name: string
  displayValue: string
  secondaryLabel: string
}

function normalizeSearchValue(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/g, ' ')
}

function compareReferenceOptions(a: ReferenceSearchOption, b: ReferenceSearchOption): number {
  const nameComparison = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  if (nameComparison !== 0) {
    return nameComparison
  }
  return a.code.localeCompare(b.code, 'en', { sensitivity: 'base' })
}

function rankReferenceMatch<RecordType extends ReferenceSearchRecord>(
  record: RecordType,
  normalizedQuery: string,
  secondaryLabel: (record: RecordType) => string,
): number | null {
  if (!normalizedQuery) {
    return 0
  }

  const normalizedCode = normalizeSearchValue(record.code)
  const normalizedName = normalizeSearchValue(record.name)
  const normalizedDisplayValue = normalizeSearchValue(buildReferenceSearchDisplayValue(record))
  const normalizedSecondaryLabel = normalizeSearchValue(secondaryLabel(record))
  const searchBlob = normalizeSearchValue(
    [record.code, record.name, buildReferenceSearchDisplayValue(record), secondaryLabel(record)].join(' '),
  )

  if (normalizedCode === normalizedQuery) {
    return 0
  }
  if (normalizedName === normalizedQuery) {
    return 1
  }
  if (normalizedDisplayValue === normalizedQuery || normalizedSecondaryLabel === normalizedQuery) {
    return 2
  }
  if (normalizedCode.startsWith(normalizedQuery)) {
    return 3
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 4
  }
  if (normalizedDisplayValue.startsWith(normalizedQuery) || normalizedSecondaryLabel.startsWith(normalizedQuery)) {
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

export function buildReferenceSearchDisplayValue(
  record: ReferenceSearchRecord | null | undefined,
): string {
  if (!record) {
    return ''
  }
  return `${record.name} (${record.code})`
}

export function findReferenceSearchMatch<RecordType extends ReferenceSearchRecord>(
  records: readonly RecordType[],
  query: string,
): RecordType | null {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) {
    return null
  }

  return (
    records.find((record) => normalizeSearchValue(record.code) === normalizedQuery) ??
    records.find((record) => normalizeSearchValue(record.name) === normalizedQuery) ??
    records.find((record) => normalizeSearchValue(buildReferenceSearchDisplayValue(record)) === normalizedQuery) ??
    null
  )
}

export function buildVisibleReferenceSearchOptions<RecordType extends ReferenceSearchRecord>(
  records: readonly RecordType[],
  query: string,
  selectedCode: string,
  secondaryLabel: (record: RecordType) => string,
  limit: number = 8,
): ReferenceSearchOption[] {
  const normalizedQuery = normalizeSearchValue(query)
  const visibleOptions =
    normalizedQuery.length === 0
      ? records
          .map((record) => ({
            code: record.code,
            name: record.name,
            displayValue: buildReferenceSearchDisplayValue(record),
            secondaryLabel: secondaryLabel(record),
            selected: record.code === selectedCode,
          }))
          .sort((a, b) => {
            if (a.selected !== b.selected) {
              return a.selected ? -1 : 1
            }
            return compareReferenceOptions(a, b)
          })
      : records
          .map((record) => {
            const rank = rankReferenceMatch(record, normalizedQuery, secondaryLabel)
            if (rank == null) {
              return null
            }

            return {
              code: record.code,
              name: record.name,
              displayValue: buildReferenceSearchDisplayValue(record),
              secondaryLabel: secondaryLabel(record),
              rank,
            }
          })
          .filter((option): option is ReferenceSearchOption & { rank: number } => option != null)
          .sort((a, b) => {
            if (a.rank !== b.rank) {
              return a.rank - b.rank
            }
            return compareReferenceOptions(a, b)
          })

  return visibleOptions.slice(0, limit).map(({ code, name, displayValue, secondaryLabel }) => ({
    code,
    name,
    displayValue,
    secondaryLabel,
  }))
}
