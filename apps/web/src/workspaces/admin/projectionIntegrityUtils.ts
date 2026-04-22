export function parseProjectionTradeScope(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((tradeId) => tradeId.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
}
