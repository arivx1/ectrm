import {
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
} from '../../shared/appRouteHandoff'
import type { Trade as TradeRecord } from '../../shared/models'

type DashboardInstrumentPriceIndex = {
  code: string
  name: string
  provider: string
  unit_code: string
  currency_code: string
  is_active: boolean
  commodity_code?: string | null
  market?: string | null
  location_code?: string | null
}

type DashboardInstrumentPosition = {
  commodity: string
  commodity_class: string
  net_volume: number
}

type DashboardInstrumentEvent = {
  event_id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  recorded_at: string
}

export type DashboardInstrumentBriefKind = 'price_index' | 'commodity_class'

export type DashboardInstrumentBriefSelection = {
  kind: DashboardInstrumentBriefKind
  id: string
  label: string
}

export type DashboardInstrumentBrief = {
  selection: DashboardInstrumentBriefSelection
  title: string
  subtitle: string
  ownerView: 'reference' | 'positions'
  relatedTrades: TradeRecord[]
  relatedPositions: DashboardInstrumentPosition[]
  relatedEvents: DashboardInstrumentEvent[]
  linkedPriceIndices: DashboardInstrumentPriceIndex[]
}

const INSTRUMENT_FOCUS_PREFIXES: Record<DashboardInstrumentBriefKind, string> = {
  price_index: 'price_index',
  commodity_class: 'commodity_class',
}

function instrumentFocusId(selection: Pick<DashboardInstrumentBriefSelection, 'kind' | 'id'>): string {
  return `${INSTRUMENT_FOCUS_PREFIXES[selection.kind]}:${selection.id}`
}

export function buildDashboardInstrumentHandoff(selection: DashboardInstrumentBriefSelection): AppRouteHandoff {
  const focusId = instrumentFocusId(selection)
  return {
    source: 'terminal',
    tradeId: focusId,
    focus: {
      type: 'market_instrument',
      id: focusId,
      label: selection.label,
    },
    tradeInspectorTab: null,
    eventType: null,
    label: `Open ${selection.label} brief`,
    rationale:
      'The market terminal opened a read-only instrument brief so you can review market context beside related trades, exposure, and workflow activity.',
    filter: selection.id,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  }
}

export function resolveDashboardInstrumentBriefSelection(
  handoff: AppRouteHandoff | null | undefined,
): DashboardInstrumentBriefSelection | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (normalizedHandoff?.focus.type !== 'market_instrument') {
    return null
  }

  const [rawKind, ...rawIdParts] = normalizedHandoff.focus.id.split(':')
  const id = rawIdParts.join(':').trim()
  if (!id) {
    return null
  }

  const kind = (Object.entries(INSTRUMENT_FOCUS_PREFIXES).find(([, prefix]) => prefix === rawKind)?.[0] ??
    null) as DashboardInstrumentBriefKind | null
  if (!kind) {
    return null
  }

  return {
    kind,
    id,
    label: normalizedHandoff.focus.label ?? id,
  }
}

export function buildDashboardInstrumentBrief({
  selection,
  activeTrades,
  priceIndices,
  positionsWithClass,
  events,
}: {
  selection: DashboardInstrumentBriefSelection
  activeTrades: TradeRecord[]
  priceIndices: DashboardInstrumentPriceIndex[]
  positionsWithClass: DashboardInstrumentPosition[]
  events: DashboardInstrumentEvent[]
}): DashboardInstrumentBrief | null {
  if (selection.kind === 'price_index') {
    const priceIndex = priceIndices.find((candidate) => candidate.code === selection.id)
    if (!priceIndex) {
      return null
    }

    const relatedTrades = activeTrades.filter(
      (trade) =>
        trade.price_index_code === priceIndex.code ||
        (priceIndex.commodity_code !== null &&
          priceIndex.commodity_code !== undefined &&
          trade.commodity === priceIndex.commodity_code),
    )
    const relatedTradeIds = new Set(relatedTrades.map((trade) => trade.trade_id))
    const relatedCommodities = new Set(relatedTrades.map((trade) => trade.commodity))

    return {
      selection: {
        kind: 'price_index',
        id: priceIndex.code,
        label: priceIndex.name,
      },
      title: priceIndex.name,
      subtitle: `${priceIndex.provider} ${priceIndex.currency_code}/${priceIndex.unit_code}`,
      ownerView: 'reference',
      relatedTrades,
      relatedPositions: positionsWithClass.filter((position) => relatedCommodities.has(position.commodity)),
      relatedEvents: events.filter((event) => relatedTradeIds.has(event.aggregate_id)),
      linkedPriceIndices: [priceIndex],
    }
  }

  const relatedTrades = activeTrades.filter((trade) => trade.commodity_class === selection.id)
  const relatedTradeIds = new Set(relatedTrades.map((trade) => trade.trade_id))
  const relatedPositions = positionsWithClass.filter((position) => position.commodity_class === selection.id)
  if (relatedTrades.length === 0 && relatedPositions.length === 0) {
    return null
  }

  const linkedPriceIndexCodes = new Set(
    relatedTrades
      .map((trade) => trade.price_index_code)
      .filter((priceIndexCode): priceIndexCode is string => Boolean(priceIndexCode)),
  )
  const linkedPriceIndices = priceIndices.filter((priceIndex) => {
    if (linkedPriceIndexCodes.has(priceIndex.code)) {
      return true
    }

    return relatedPositions.some((position) => position.commodity === priceIndex.commodity_code)
  })

  return {
    selection,
    title: selection.label,
    subtitle: 'Commodity class instrument brief',
    ownerView: 'positions',
    relatedTrades,
    relatedPositions,
    relatedEvents: events.filter((event) => relatedTradeIds.has(event.aggregate_id)),
    linkedPriceIndices,
  }
}
