import type { ResolvedOperationalWorkboardDefinition } from './operationalWorkboardRegistry'

type OperationalWorkboardBannerProps = {
  workboard: ResolvedOperationalWorkboardDefinition
  variant?: 'chips' | 'section'
}

function visibleMetadataChips(
  workboard: ResolvedOperationalWorkboardDefinition,
  maxChips: number,
): string[] {
  if (workboard.metadataChips.length <= maxChips) {
    return workboard.metadataChips
  }

  const visibleCount = Math.max(0, maxChips - 1)
  return [
    ...workboard.metadataChips.slice(0, visibleCount),
    `+${workboard.metadataChips.length - visibleCount} more`,
  ]
}

export function OperationalWorkboardBanner({
  workboard,
  variant = 'section',
}: OperationalWorkboardBannerProps) {
  const chips = visibleMetadataChips(workboard, variant === 'chips' ? 6 : 8)

  if (variant === 'chips') {
    if (chips.length === 0) {
      return null
    }

    return (
      <div className="shipment-card-actions">
        <span>Resource contract</span>
        <div className="shipment-card-meta">
          {chips.map((chip) => (
            <span key={`${workboard.key}-${chip}`} className="entity-chip entity-chip-soft">
              {chip}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="scheduler-section-banner">
      <div className="scheduler-section-copy">
        <strong>{workboard.title}</strong>
        <p>{workboard.description}</p>
      </div>
      {chips.length > 0 ? (
        <div className="shipment-card-meta">
          {chips.map((chip) => (
            <span key={`${workboard.key}-${chip}`} className="entity-chip entity-chip-soft">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
