import type { Trade } from '../../shared/models'

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

type PositionTradeContext = {
  matchingTrades: Trade[]
  primaryTrade: Trade | null
}

export function buildPositionTradeContext(
  position: Pick<PositionRow, 'commodity' | 'commodity_class'>,
  activeTrades: Trade[],
): PositionTradeContext {
  const matchingTrades = [...activeTrades]
    .filter(
      (trade) =>
        trade.commodity === position.commodity && trade.commodity_class === position.commodity_class,
    )
    .sort((left, right) => {
      const volumeDelta = Math.abs(right.volume ?? 0) - Math.abs(left.volume ?? 0)
      if (volumeDelta !== 0) {
        return volumeDelta
      }

      const updatedAtDelta = right.updated_at.localeCompare(left.updated_at)
      if (updatedAtDelta !== 0) {
        return updatedAtDelta
      }

      return left.trade_id.localeCompare(right.trade_id)
    })

  return {
    matchingTrades,
    primaryTrade: matchingTrades[0] ?? null,
  }
}
