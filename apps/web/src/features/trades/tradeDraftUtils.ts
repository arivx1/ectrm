import type { EventRow, TradeLegDraft } from '../../shared/models.ts'
import { defaultTradeExecutionTime, tradeFormDefaults } from '../../shared/trading.ts'

export function makeLegDraft(overrides: Partial<TradeLegDraft> = {}): TradeLegDraft {
  return {
    leg_no: overrides.leg_no ?? 1,
    side: overrides.side ?? tradeFormDefaults.side,
    commodity_class: overrides.commodity_class ?? '',
    commodity: overrides.commodity ?? '',
    volume: overrides.volume ?? '',
  }
}

export function parseLegsFromPayload(payload: Record<string, unknown> | null | undefined): TradeLegDraft[] {
  const rawLegs = payload?.legs
  if (!Array.isArray(rawLegs)) {
    return []
  }

  return rawLegs
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row, index) =>
      makeLegDraft({
        leg_no: typeof row.leg_no === 'number' ? row.leg_no : index + 1,
        side: typeof row.side === 'string' ? row.side : tradeFormDefaults.side,
        commodity_class: typeof row.commodity_class === 'string' ? row.commodity_class : '',
        commodity: typeof row.commodity === 'string' ? row.commodity : '',
        volume:
          typeof row.volume === 'number'
            ? String(row.volume)
            : typeof row.volume === 'string'
              ? row.volume
              : '',
      }),
    )
}

export function findLatestPersistedLegs(selectedTradeEvents: EventRow[]): TradeLegDraft[] {
  for (const event of selectedTradeEvents) {
    if (event.event_type !== 'TradeAmended' && event.event_type !== 'TradeCreated') {
      continue
    }

    const parsedLegs = parseLegsFromPayload(event.payload)
    if (parsedLegs.length > 0) {
      return parsedLegs
    }
  }

  return []
}

export function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const pad = (segment: number) => String(segment).padStart(2, '0')
  return [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate()),
  ].join('-') + `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

export function splitLocalDateTimeInput(value: string | null | undefined): { date: string; time: string } {
  const localValue = toLocalDateTimeInput(value)
  if (!localValue) {
    return { date: '', time: defaultTradeExecutionTime }
  }

  const [date, time = defaultTradeExecutionTime] = localValue.split('T')
  return { date, time }
}

export function combineLocalDateTimeInput(date: string, time: string): string {
  const normalizedDate = date.trim()
  if (!normalizedDate) {
    return ''
  }

  const normalizedTime = time.trim() || defaultTradeExecutionTime
  return `${normalizedDate}T${normalizedTime}`
}
