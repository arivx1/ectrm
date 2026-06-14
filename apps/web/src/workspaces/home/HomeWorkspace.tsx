import { useEffect, useMemo } from 'react'

import type {
  EventRow,
  PriceIndexRecord,
  PriceIndexObservationRecord,
  Trade,
  ViewKey,
} from '../../shared/models'
import { formatDate, formatDateOnly, formatNumber } from '../../shared/format'
import type { WorkspaceBootstrapSummary } from '../../entities/app/api'
import { useLatestPriceIndexMarks } from '../../entities/market-data/useLatestPriceIndexMarks'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import { buildPriceIndexBiReportHandoff } from '../reports/reportRouteHandoffs'

type HomeWorkspaceProps = {
  authDisplayName?: string | null
  health: string
  summary: WorkspaceBootstrapSummary | null
  activeTrades: Trade[]
  events: EventRow[]
  priceIndices: PriceIndexRecord[]
  appLoading: boolean
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void
  onOpenTrade: (tradeId: string) => void
  onRefreshData?: () => Promise<void>
}

type HomeAction = {
  title: string
  detail: string
  signal: string
  hoverDetail: string
  view: ViewKey
  actionLabel: string
}

type HomePressureSummary = {
  attention: number
  settlement: number
  pricing: number
  operations: number
  isClear: boolean
}

type HomeSignal = {
  label: string
  value: string
  detail: string
}

type HomeTimelineItem = {
  label: string
  detail: string
  timeLabel: string
  tone: 'clear' | 'active' | 'attention'
}

type CleanMorningState = {
  lastDate: string | null
  streak: number
}

const CLEAN_MORNINGS_STORAGE_KEY = 'ectrm.home-clean-mornings.v1'

function knownCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function buildHomePressureSummary(summary: WorkspaceBootstrapSummary | null): HomePressureSummary {
  const attention = knownCount(summary?.dashboard.attention.total_count)
  const settlement =
    knownCount(summary?.settlement.invoice_pending_count) +
    knownCount(summary?.settlement.payment_due_count) +
    knownCount(summary?.settlement.trade_exception_count)
  const pricing =
    knownCount(summary?.dashboard.attention.stale_pricing_count) +
    knownCount(summary?.trades.pending_pricing_count)
  const operations = knownCount(summary?.work_items.operations_queue_count)

  return {
    attention,
    settlement,
    pricing,
    operations,
    isClear: attention + settlement + pricing + operations === 0,
  }
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function previousLocalDateKey(dateKey: string): string | null {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part))
  if (!year || !month || !day) {
    return null
  }

  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() - 1)
  return localDateKey(date)
}

function normalizeCleanMorningState(value: unknown): CleanMorningState {
  if (!value || typeof value !== 'object') {
    return { lastDate: null, streak: 0 }
  }

  const record = value as Partial<CleanMorningState>
  return {
    lastDate: typeof record.lastDate === 'string' && record.lastDate.trim() ? record.lastDate : null,
    streak: typeof record.streak === 'number' && Number.isFinite(record.streak) && record.streak > 0
      ? Math.floor(record.streak)
      : 0,
  }
}

function readCleanMorningState(): CleanMorningState {
  if (typeof window === 'undefined') {
    return { lastDate: null, streak: 0 }
  }

  const storedValue = window.localStorage.getItem(CLEAN_MORNINGS_STORAGE_KEY)
  if (!storedValue) {
    return { lastDate: null, streak: 0 }
  }

  try {
    return normalizeCleanMorningState(JSON.parse(storedValue))
  } catch {
    return { lastDate: null, streak: 0 }
  }
}

function writeCleanMorningState(state: CleanMorningState): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(CLEAN_MORNINGS_STORAGE_KEY, JSON.stringify(state))
}

function advanceCleanMorningState(current: CleanMorningState, isClear: boolean, today = localDateKey()): CleanMorningState {
  if (current.lastDate === today) {
    if (isClear && current.streak === 0) {
      return { lastDate: today, streak: 1 }
    }

    return current
  }

  if (!isClear) {
    return { lastDate: today, streak: 0 }
  }

  return {
    lastDate: today,
    streak: current.lastDate === previousLocalDateKey(today) ? current.streak + 1 : 1,
  }
}

function statusLooksOpen(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase() ?? ''
  return Boolean(normalized) && !['COMPLETE', 'COMPLETED', 'SETTLED', 'CLOSED', 'CANCELLED'].includes(normalized)
}

function statusLooksUnpriced(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase() ?? ''
  return Boolean(normalized) && !['PRICED', 'FIXED', 'FINAL', 'COMPLETE', 'COMPLETED'].includes(normalized)
}

function statusLooksSettlementPressure(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase() ?? ''
  return Boolean(normalized) && !['SETTLED', 'PAID', 'COMPLETE', 'COMPLETED', 'CLOSED', 'CANCELLED'].includes(normalized)
}

function findFocusTrade(activeTrades: Trade[]): Trade | null {
  return (
    activeTrades.find((trade) => statusLooksSettlementPressure(trade.payment_status)) ??
    activeTrades.find((trade) => statusLooksSettlementPressure(trade.invoice_status)) ??
    activeTrades.find((trade) => statusLooksUnpriced(trade.pricing_status)) ??
    activeTrades.find(
      (trade) =>
        statusLooksOpen(trade.confirmation_status) ||
        statusLooksOpen(trade.nomination_status) ||
        statusLooksOpen(trade.allocation_status),
    ) ??
    activeTrades[0] ??
    null
  )
}

function buildRecommendedAction(
  pressure: HomePressureSummary,
  focusTrade: Trade | null,
): HomeAction {
  if (pressure.settlement > 0) {
    return {
      title: focusTrade ? `Settlement · ${focusTrade.trade_id}` : 'Settlement',
      detail: `${formatNumber(pressure.settlement, 0)} item${pressure.settlement === 1 ? '' : 's'}`,
      signal: 'High signal',
      hoverDetail: 'Invoice, payment, or exception pressure is leading Home.',
      view: 'settlement',
      actionLabel: 'Settlement',
    }
  }

  if (pressure.pricing > 0) {
    return {
      title: focusTrade ? `Pricing · ${focusTrade.trade_id}` : 'Pricing',
      detail: `${formatNumber(pressure.pricing, 0)} item${pressure.pricing === 1 ? '' : 's'}`,
      signal: 'High signal',
      hoverDetail: 'Stale marks or pending pricing need the first look.',
      view: 'risk',
      actionLabel: 'Exposure',
    }
  }

  if (pressure.operations > 0) {
    return {
      title: focusTrade ? `Ops · ${focusTrade.trade_id}` : 'Ops',
      detail: `${formatNumber(pressure.operations, 0)} item${pressure.operations === 1 ? '' : 's'}`,
      signal: 'Active',
      hoverDetail: 'Operations queue work is open.',
      view: 'operations',
      actionLabel: 'Work queue',
    }
  }

  if (focusTrade) {
    return {
      title: `Focus · ${focusTrade.trade_id}`,
      detail: 'No priority queue',
      signal: 'Steady',
      hoverDetail: 'No promoted pressure; continue from the current focus trade.',
      view: 'trades',
      actionLabel: 'Trade',
    }
  }

  return {
    title: 'No active trades',
    detail: 'Ready for capture',
    signal: 'Quiet',
    hoverDetail: 'No active book is loaded.',
    view: 'trades',
    actionLabel: 'Capture',
  }
}

function buildBriefLines(args: {
  health: string
  summary: WorkspaceBootstrapSummary | null
  pressure: HomePressureSummary
  focusTrade: Trade | null
}): string[] {
  const healthLabel = args.health.trim() ? args.health.trim() : 'unknown'

  if (!args.summary) {
    return [`Loading · API ${healthLabel}`]
  }

  if (args.pressure.isClear) {
    return [`Clear · API ${healthLabel}`]
  }

  if (args.pressure.settlement > 0) {
    return [`${formatNumber(args.pressure.settlement, 0)} settlement · ${args.focusTrade?.trade_id ?? 'Open'}`]
  }

  if (args.pressure.pricing > 0) {
    return [`${formatNumber(args.pressure.pricing, 0)} pricing · Exposure`]
  }

  return [`${formatNumber(args.pressure.operations || args.pressure.attention, 0)} ops · Work queue`]
}

function buildHomeSignals(args: {
  pressure: HomePressureSummary
  recentEventCount: number
  cleanMorningCount: number
}): HomeSignal[] {
  return [
    {
      label: 'Settle',
      value: formatNumber(args.pressure.settlement, 0),
      detail: 'Invoice, payment, and settlement exception count.',
    },
    {
      label: 'Price',
      value: formatNumber(args.pressure.pricing, 0),
      detail: 'Stale marks and pending pricing count.',
    },
    {
      label: 'Ops',
      value: formatNumber(args.pressure.operations, 0),
      detail: 'Open operations queue count.',
    },
    {
      label: 'Clean',
      value: `${formatNumber(args.cleanMorningCount, 0)}d`,
      detail: 'Consecutive local mornings with no promoted pressure.',
    },
    {
      label: 'Events',
      value: formatNumber(args.recentEventCount, 0),
      detail: 'Recent event rows currently loaded.',
    },
  ]
}

function buildTimeline(summary: WorkspaceBootstrapSummary | null): HomeTimelineItem[] {
  const settlementPressure =
    knownCount(summary?.settlement.invoice_pending_count) +
    knownCount(summary?.settlement.payment_due_count) +
    knownCount(summary?.settlement.trade_exception_count)
  const operationsPressure = knownCount(summary?.work_items.operations_queue_count)
  const stalePricingCount = knownCount(summary?.dashboard.attention.stale_pricing_count)
  const activeTrades = knownCount(summary?.trades.active_count)

  return [
    {
      label: 'Settlement',
      detail: settlementPressure > 0 ? `${formatNumber(settlementPressure, 0)} open` : 'Clear',
      timeLabel: 'Now',
      tone: settlementPressure > 0 ? 'attention' : 'clear',
    },
    {
      label: 'Ops',
      detail: operationsPressure > 0 ? `${formatNumber(operationsPressure, 0)} open` : 'Quiet',
      timeLabel: 'Queue',
      tone: operationsPressure > 0 ? 'active' : 'clear',
    },
    {
      label: 'Pricing',
      detail: stalePricingCount > 0 ? `${formatNumber(stalePricingCount, 0)} stale` : 'Current',
      timeLabel: 'Marks',
      tone: stalePricingCount > 0 ? 'attention' : 'clear',
    },
    {
      label: 'Book',
      detail: activeTrades > 0 ? `${formatNumber(activeTrades, 0)} active` : 'Empty',
      timeLabel: 'Live',
      tone: activeTrades > 0 ? 'active' : 'clear',
    },
  ]
}

function formatPriceMark(mark: PriceIndexObservationRecord | undefined): string {
  if (!mark) {
    return 'No mark'
  }

  const currency = mark.currency_code?.trim() ? `${mark.currency_code} ` : ''
  return `${currency}${formatNumber(mark.value, 4)}`
}

function formatPriceFreshness(mark: PriceIndexObservationRecord | undefined): string {
  if (!mark) {
    return 'Awaiting data'
  }

  return `${formatDateOnly(mark.observation_date)} · ${mark.source_provider}`
}

export function HomeWorkspace({
  authDisplayName,
  health,
  summary,
  activeTrades,
  events,
  priceIndices,
  appLoading,
  onOpenView,
  onOpenTrade,
  onRefreshData,
}: HomeWorkspaceProps) {
  const focusTrade = useMemo(() => findFocusTrade(activeTrades), [activeTrades])
  const pressure = useMemo(() => buildHomePressureSummary(summary), [summary])
  const recommendedAction = useMemo(
    () => buildRecommendedAction(pressure, focusTrade),
    [focusTrade, pressure],
  )
  const briefLines = useMemo(
    () => buildBriefLines({ health, summary, pressure, focusTrade }),
    [focusTrade, health, pressure, summary],
  )
  const timelineItems = useMemo(() => buildTimeline(summary), [summary])
  const pulsePriceIndices = useMemo(
    () => priceIndices.filter((priceIndex) => priceIndex.is_active).slice(0, 5),
    [priceIndices],
  )
  const latestPriceMarks = useLatestPriceIndexMarks(
    pulsePriceIndices.map((priceIndex) => priceIndex.code),
    {
      limitPerCode: 1,
      refreshIntervalMs: 0,
    },
  )
  const recentEvents = events.slice(0, 4)
  const displayName = authDisplayName?.trim() || 'there'
  const cleanMorningState = useMemo(() => {
    const current = readCleanMorningState()
    return summary ? advanceCleanMorningState(current, pressure.isClear) : current
  }, [pressure.isClear, summary])

  useEffect(() => {
    if (!summary) {
      return
    }

    writeCleanMorningState(cleanMorningState)
  }, [cleanMorningState, summary])

  const cleanMorningCount = cleanMorningState.lastDate === localDateKey()
    ? cleanMorningState.streak
    : pressure.isClear
      ? Math.max(cleanMorningState.streak, 1)
      : 0
  const homeSignals = useMemo(
    () =>
      buildHomeSignals({
        pressure,
        recentEventCount: recentEvents.length,
        cleanMorningCount,
      }),
    [cleanMorningCount, pressure, recentEvents.length],
  )

  function openRecommendedAction() {
    if (recommendedAction.view === 'trades' && focusTrade) {
      onOpenTrade(focusTrade.trade_id)
      return
    }

    onOpenView(recommendedAction.view)
  }

  return (
    <div className="home-workspace">
      <section className="home-brief-panel" aria-labelledby="home-brief-title">
        <div className="home-brief-copy">
          <span className="eyebrow">Today</span>
          <h3 id="home-brief-title">Morning, {displayName}.</h3>
          <div className="home-brief-lines">
            {briefLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="home-signal-strip" aria-label="Morning delta">
            {homeSignals.map((signal) => (
              <span key={signal.label} className="home-mini-chip" title={signal.detail}>
                <strong>{signal.label}</strong>
                {signal.value}
              </span>
            ))}
          </div>
        </div>

        <div className="home-brief-actions">
          <button type="button" className="home-command" aria-label="Open Apps" onClick={() => onOpenView('prompt')}>
            <span>Apps</span>
            <strong>Open</strong>
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void onRefreshData?.()}
            disabled={appLoading}
          >
            {appLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      <section className="home-focus-panel" aria-labelledby="home-focus-title" title={recommendedAction.hoverDetail}>
        <div className="home-section-head">
          <span className="eyebrow">Next</span>
          <div className="home-action-title">
            <h3 id="home-focus-title">{recommendedAction.title}</h3>
            <span className="home-mini-chip home-signal-chip">{recommendedAction.signal}</span>
          </div>
        </div>
        <p>{recommendedAction.detail}</p>

        {focusTrade ? (
          <div className="home-focus-object">
            <div>
              <span>Focus</span>
              <strong>{focusTrade.trade_id}</strong>
              <p>
                {focusTrade.book} · {focusTrade.commodity}
              </p>
            </div>
            <div className="home-focus-status">
              <span>{focusTrade.pricing_status}</span>
              <span>{focusTrade.invoice_status}</span>
              <span>{focusTrade.payment_status}</span>
            </div>
          </div>
        ) : null}

        <div className="home-focus-actions">
          <button type="button" className="button button-primary" onClick={openRecommendedAction}>
            {recommendedAction.actionLabel}
          </button>
          <button type="button" className="button button-ghost" onClick={() => onOpenView('prompt')}>
            Ask
          </button>
        </div>
      </section>

      <section className="home-timeline-panel" aria-labelledby="home-timeline-title">
        <div className="home-section-head">
          <span className="eyebrow">Pressure</span>
          <h3 id="home-timeline-title">Now</h3>
        </div>
        <div className="home-timeline">
          {timelineItems.map((item) => (
            <article
              key={`${item.timeLabel}-${item.label}`}
              className={`home-timeline-item is-${item.tone}`}
              title={`${item.label}: ${item.detail}`}
            >
              <span>{item.timeLabel}</span>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-pulse-panel" aria-labelledby="home-pulse-title">
        <div className="home-section-head">
          <span className="eyebrow">Markets</span>
          <h3 id="home-pulse-title">Marks</h3>
        </div>
        {pulsePriceIndices.length > 0 ? (
          <div className="home-market-strip">
            {pulsePriceIndices.map((priceIndex) => {
              const latestMark = latestPriceMarks.latestMarksByCode[priceIndex.code.toUpperCase()]
              return (
                <button
                  key={priceIndex.code}
                  type="button"
                  className="home-market-mark"
                  onClick={() =>
                    onOpenView('reports', buildPriceIndexBiReportHandoff({
                      priceIndexCode: priceIndex.code,
                      priceIndexName: priceIndex.name,
                      product: priceIndex.commodity_code,
                      location: priceIndex.location_code,
                      source: priceIndex.provider,
                    }))
                  }
                >
                  <span>{priceIndex.code}</span>
                  <strong>{formatPriceMark(latestMark)}</strong>
                  <small>{formatPriceFreshness(latestMark)}</small>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="home-empty-line">
            <strong>No markets</strong>
            <p>Add active indices.</p>
          </div>
        )}
        {latestPriceMarks.error ? <small className="home-load-note">{latestPriceMarks.error}</small> : null}
      </section>

      <section className="home-truth-panel" aria-labelledby="home-truth-title">
        <div className="home-section-head">
          <span className="eyebrow">Changes</span>
          <h3 id="home-truth-title">Recent</h3>
        </div>
        {recentEvents.length > 0 ? (
          <div className="home-truth-list">
            {recentEvents.map((event) => (
              <article key={event.event_id} className="home-truth-row">
                <span>{formatDate(event.occurred_at)}</span>
                <strong>{event.event_type}</strong>
                <p>{event.aggregate_id}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-empty-line">
            <strong>No events</strong>
            <p>Nothing new.</p>
          </div>
        )}
        <small className="home-load-note">
          {summary?.generated_at ? formatDate(summary.generated_at) : 'Loading'}.
        </small>
      </section>
    </div>
  )
}
