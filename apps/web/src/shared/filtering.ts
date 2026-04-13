type SearchFilterValue = string | number | boolean | null | undefined

function normalizedSearchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function normalizedSearchHaystack(values: readonly SearchFilterValue[]): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) {
        return ''
      }

      if (typeof value === 'boolean') {
        return value ? 'true' : 'false'
      }

      return String(value).trim().toLowerCase()
    })
    .filter(Boolean)
    .join(' ')
}

export function matchesTextFilter(query: string, values: readonly SearchFilterValue[]): boolean {
  const tokens = normalizedSearchTokens(query)
  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizedSearchHaystack(values)
  return tokens.every((token) => haystack.includes(token))
}
