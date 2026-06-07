import { useEffect, useRef, type ReactNode } from 'react'

import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'

type SettingsDisclosureCardProps = {
  cardKey: string
  hashAnchorId?: string
  eyebrow: string
  title: string
  summary: string
  defaultExpanded?: boolean
  children: ReactNode
}

function settingsDisclosurePanelId(cardKey: string): string {
  return `${cardKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}-panel`
}

export function SettingsDisclosureCard({
  cardKey,
  hashAnchorId,
  eyebrow,
  title,
  summary,
  defaultExpanded = false,
  children,
}: SettingsDisclosureCardProps) {
  const { expanded, setExpanded } = usePersistentCollapsibleCardState(cardKey, defaultExpanded)
  const panelId = settingsDisclosurePanelId(cardKey)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || expanded) {
      return
    }

    const targetId = window.location.hash.replace(/^#/, '').trim()
    if (!targetId) {
      return
    }

    if (hashAnchorId && targetId === hashAnchorId) {
      setExpanded(true)
      return
    }

    const target = document.getElementById(targetId)
    if (target && bodyRef.current?.contains(target)) {
      setExpanded(true)
    }
  }, [expanded, hashAnchorId, setExpanded])

  return (
    <article
      id={hashAnchorId}
      className={`surface settings-disclosure-card ${expanded ? 'is-expanded' : 'is-collapsed'}`.trim()}
    >
      <button
        type="button"
        className="settings-disclosure-toggle"
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="settings-disclosure-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <strong>{summary}</strong>
        </div>
        <div className="settings-disclosure-toggle-meta">
          <span className="settings-disclosure-toggle-indicator" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </div>
      </button>

      <div ref={bodyRef} id={panelId} className="settings-disclosure-body" hidden={!expanded}>
        {children}
      </div>
    </article>
  )
}
