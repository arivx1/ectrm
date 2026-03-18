import type { TradeLegDraft } from '../../shared/models.ts'
import { tradeFormDefaults } from '../../shared/trading.ts'

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
