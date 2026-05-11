import type { AssistantToolEvidence } from '../../shared/models'

type AssistantEvidenceListProps = {
  evidenceItems: AssistantToolEvidence[]
  compact?: boolean
  emptyMessage?: string
}

function formatEvidenceKind(kind: AssistantToolEvidence['kind']): string {
  return kind.replaceAll('_', ' ')
}

function normalizeBadges(badges: string[]): string[] {
  const seen = new Set<string>()
  return badges.filter((badge) => {
    const normalized = badge.trim()
    if (!normalized || seen.has(normalized)) {
      return false
    }
    seen.add(normalized)
    return true
  })
}

export function AssistantEvidenceList({
  evidenceItems,
  compact = false,
  emptyMessage,
}: AssistantEvidenceListProps) {
  if (evidenceItems.length === 0) {
    return emptyMessage ? <p className="assistant-evidence-empty">{emptyMessage}</p> : null
  }

  return (
    <div className={`assistant-evidence-list ${compact ? 'assistant-evidence-list-compact' : ''}`}>
      {evidenceItems.map((item, index) => {
        const badges = normalizeBadges(item.badges)
        return (
          <article
            key={`${item.kind}-${item.title}-${item.locator ?? index}`}
            className={`assistant-evidence-card assistant-evidence-card-${item.kind}`}
          >
            <div className="assistant-evidence-head">
              <strong>{item.title}</strong>
              <span>{formatEvidenceKind(item.kind)}</span>
            </div>
            {item.locator ? <code>{item.locator}</code> : null}
            <p>{item.summary}</p>
            {item.excerpt ? <pre>{item.excerpt}</pre> : null}
            {badges.length > 0 ? (
              <div className="assistant-evidence-badge-list">
                {badges.map((badge) => (
                  <span key={`${item.title}-${badge}`}>{badge}</span>
                ))}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
