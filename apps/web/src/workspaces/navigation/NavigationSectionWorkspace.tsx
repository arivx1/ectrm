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
  const recommendedViewKeys = new Set(section.startPaths.map((path) => path.view.key))

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
            Pick the job you are doing first, then jump into the workspace built for it. Every page in this section is
            still available below if you already know the destination.
          </div>
        </article>

        <div className="dashboard-report-grid section-start-grid">
          {section.startPaths.map((path) => (
            <article key={`${section.key}-${path.view.key}`} className="dashboard-report-card section-start-card">
              <div className="section-start-card-copy">
                <span>{path.view.kicker}</span>
                <strong>{path.title}</strong>
                <p>{path.detail}</p>
              </div>
              <div className="section-start-card-actions">
                <span className="entity-chip entity-chip-soft">{path.view.label}</span>
                <a
                  href={getViewHref(path.view.key)}
                  className="button button-secondary"
                  onClick={(event) => handleWorkspaceLinkClick(event, path.view.key)}
                >
                  {path.actionLabel}
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="dashboard-report-grid section-landing-grid">
          {section.views.map((view) => (
            <article key={view.key} className="dashboard-report-card section-landing-card">
              <div className="section-landing-card-copy">
                <span>{view.kicker}</span>
                <strong>{view.label}</strong>
                <p>{HERO_TITLE_BY_VIEW[view.key]}</p>
              </div>
              <p>{HERO_BODY_BY_VIEW[view.key]}</p>
              <div className="section-landing-card-actions">
                <span className="entity-chip entity-chip-soft">
                  {recommendedViewKeys.has(view.key) ? 'Common path' : 'Supporting workspace'}
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
            <span className="eyebrow">All Workspaces</span>
            <h3>{section.label} Surfaces</h3>
          </div>
          <p>Use this jump list when you already know the destination and just want a richer map than the left rail.</p>
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
