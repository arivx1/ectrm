import { type MouseEvent as ReactMouseEvent } from 'react'

import {
  primaryNavigationSectionByKey,
  shouldHandleClientSideNavigation,
  type PrimaryNavigationSectionKey,
} from '../../app/navigation'
import { HERO_BODY_BY_VIEW, HERO_TITLE_BY_VIEW } from '../../entities/app/appViews'
import type { ViewKey } from '../../shared/models'

type NavigationSectionWorkspaceProps = {
  sectionKey: PrimaryNavigationSectionKey
  getViewHref: (view: ViewKey) => string
  onOpenView: (view: ViewKey) => void
}

export function NavigationSectionWorkspace({
  sectionKey,
  getViewHref,
  onOpenView,
}: NavigationSectionWorkspaceProps) {
  const section = primaryNavigationSectionByKey(sectionKey)

  function handleWorkspaceLinkClick(event: ReactMouseEvent<HTMLAnchorElement>, view: ViewKey) {
    if (!shouldHandleClientSideNavigation(event)) {
      return
    }

    event.preventDefault()
    onOpenView(view)
  }

  return (
    <div className="workspace-grid docs-workspace section-landing-workspace">
      <section className="stack">
        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">{section.kicker}</span>
              <h3>{section.label}</h3>
            </div>
            <p>{section.landingBody}</p>
          </div>

          <div className="feedback-banner feedback-banner-success">
            {section.views.length} workspace{section.views.length === 1 ? '' : 's'} live inside this section. Open the
            one that matches the job you are doing right now.
          </div>
        </article>

        <div className="dashboard-report-grid section-landing-grid">
          {section.views.map((view, index) => (
            <article key={view.key} className="dashboard-report-card section-landing-card">
              <div className="section-landing-card-copy">
                <span>{view.kicker}</span>
                <strong>{view.label}</strong>
                <p>{HERO_TITLE_BY_VIEW[view.key]}</p>
              </div>
              <p>{HERO_BODY_BY_VIEW[view.key]}</p>
              <div className="section-landing-card-actions">
                <span className="entity-chip entity-chip-soft">
                  {index === 0 ? 'Suggested start' : `Page ${index + 1}`}
                </span>
                <a
                  href={getViewHref(view.key)}
                  className="button button-secondary"
                  onClick={(event) => handleWorkspaceLinkClick(event, view.key)}
                >
                  Open {view.label}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="surface inspector-panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Section Map</span>
            <h3>{section.label} Surfaces</h3>
          </div>
          <p>Use these links when you know the destination already and just need a richer jump list than the left rail.</p>
        </div>

        <div className="stack">
          {section.views.map((view) => (
            <a
              key={view.key}
              href={getViewHref(view.key)}
              className="button button-ghost button-link docs-action-button"
              onClick={(event) => handleWorkspaceLinkClick(event, view.key)}
            >
              <span className="docs-action-copy">
                <span>{view.kicker}</span>
                <strong>{view.label}</strong>
              </span>
              <small>{HERO_TITLE_BY_VIEW[view.key]}</small>
            </a>
          ))}
        </div>
      </aside>
    </div>
  )
}
