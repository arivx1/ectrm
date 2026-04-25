import type {
  CounterpartyExternalCreditSnapshotRecord,
  PositionRow,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeScenarioDraft,
  Trade,
} from '../../shared/models'

export type PositionedRow = PositionRow & { commodity_class?: string }

export function listRelatedTradesForDraft(
  draft: Pick<PreTradeScenarioDraft, 'book' | 'commodity' | 'commodity_class'>,
  activeTrades: Trade[],
): Trade[] {
  return activeTrades.filter(
    (trade) =>
      trade.book === draft.book &&
      trade.commodity_class === draft.commodity_class &&
      trade.commodity === draft.commodity,
  )
}

export function sumRelatedPositionNetVolume(
  draft: Pick<PreTradeScenarioDraft, 'commodity' | 'commodity_class'>,
  positions: PositionedRow[],
): number | null {
  const relevantPositions = positions.filter(
    (position) =>
      position.commodity === draft.commodity &&
      (!position.commodity_class || position.commodity_class === draft.commodity_class),
  )
  if (relevantPositions.length === 0) {
    return null
  }
  return relevantPositions.reduce((sum, position) => sum + position.net_volume, 0)
}

export function findLatestCounterpartyExternalSnapshot(
  counterpartyCode: string | null,
  snapshots: CounterpartyExternalCreditSnapshotRecord[],
): CounterpartyExternalCreditSnapshotRecord | null {
  if (!counterpartyCode) {
    return null
  }

  return (
    snapshots
      .filter((snapshot) => snapshot.counterparty_code === counterpartyCode)
      .sort((left, right) => right.as_of_date.localeCompare(left.as_of_date))[0] ?? null
  )
}

export function summarizePreTradeSourceQuality(
  snapshots: PreTradeRecommendationSourceSnapshotRecord[],
): string {
  const impaired = snapshots.filter((snapshot) => snapshot.quality_status !== 'OK')
  if (impaired.length === 0) {
    return 'all sources clean'
  }
  return `${impaired.length} source${impaired.length === 1 ? '' : 's'} need attention`
}
