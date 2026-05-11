import type { AssistantPromptSection } from '../../shared/models'

type AssistantPromptSectionListProps = {
  sections: AssistantPromptSection[]
  emptyMessage?: string
}

function trimSectionContent(content: string, maxLength = 420): string {
  const normalized = content.trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function sectionBadges(section: AssistantPromptSection): string[] {
  return [
    section.scope ?? 'RUNTIME',
    section.kind ?? 'GENERATED',
    section.freshness ?? 'STATIC',
    section.owner ?? 'unknown owner',
    section.uses_fallback ? 'fallback' : '',
    section.contract_key ? `contract ${section.contract_key}` : '',
  ].filter((value) => value.trim().length > 0)
}

export function AssistantPromptSectionList({
  sections,
  emptyMessage,
}: AssistantPromptSectionListProps) {
  if (sections.length === 0) {
    return emptyMessage ? <p className="assistant-evidence-empty">{emptyMessage}</p> : null
  }

  return (
    <div className="assistant-prompt-section-list">
      {sections.map((section) => {
        const badges = sectionBadges(section)
        return (
          <article
            key={`${section.key}-${section.contract_key ?? 'section'}`}
            className="assistant-prompt-section-card"
          >
            <div className="assistant-evidence-head">
              <strong>{section.title}</strong>
              <span>{section.source}</span>
            </div>
            <p>{trimSectionContent(section.content)}</p>
            {badges.length > 0 ? (
              <div className="assistant-evidence-badge-list">
                {badges.map((badge) => (
                  <span key={`${section.key}-${badge}`}>{badge}</span>
                ))}
              </div>
            ) : null}
            {section.owner_reference ? <code>{section.owner_reference}</code> : null}
          </article>
        )
      })}
    </div>
  )
}
