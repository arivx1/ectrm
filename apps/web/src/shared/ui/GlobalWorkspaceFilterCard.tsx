import { useEffect, useRef, useState } from 'react'

type GlobalWorkspaceFilterCardProps = {
  value: string
  onChange: (value: string) => void
  totalCount: number
  matchedCount: number
  defaultCollapsed?: boolean
}

export function GlobalWorkspaceFilterCard({
  value,
  onChange,
  totalCount,
  matchedCount,
  defaultCollapsed = true,
}: GlobalWorkspaceFilterCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasFilter = value.trim().length > 0
  const summary = hasFilter
    ? `${matchedCount.toLocaleString()} of ${totalCount.toLocaleString()} workspaces match`
    : `Search across ${totalCount.toLocaleString()} workspaces and the current screen`
  const toggleActionLabel = collapsed ? 'Show filter' : 'Hide filter'

  useEffect(() => {
    if (!collapsed) {
      inputRef.current?.focus()
    }
  }, [collapsed])

  return (
    <section className={`nav-global-filter${collapsed ? ' is-collapsed' : ''}`}>
      {collapsed ? (
        <div className="nav-section-header nav-global-filter-collapsed-head">
          <button
            type="button"
            className="nav-item nav-section-toggle nav-global-filter-collapsed-card"
            aria-label="Open global workspace filter"
            aria-expanded={false}
            aria-controls="global-workspace-filter-panel"
            onClick={() => setCollapsed(false)}
          >
            <div className="nav-section-copy nav-global-filter-collapsed-copy">
              <strong>Global Workspace Filter</strong>
              <small>Search the nav and current workspace together.</small>
            </div>
          </button>

          <button
            type="button"
            className="nav-item nav-section-toggle-button nav-global-filter-toggle"
            aria-label={toggleActionLabel}
            aria-expanded={false}
            aria-controls="global-workspace-filter-panel"
            onClick={() => setCollapsed(false)}
          >
            <span className="nav-section-indicator" aria-hidden="true">
              +
            </span>
          </button>
        </div>
      ) : (
        <section className="surface workspace-local-filter nav-global-filter-panel">
          <div className="nav-global-filter-head">
            <div className="workspace-local-filter-copy">
              <div>
                <span className="eyebrow">Search</span>
                <h3>Global Workspace Filter</h3>
              </div>
              <p>Narrow the left nav and the current workspace with one shared text filter.</p>
            </div>
            <button
              type="button"
              className="nav-item nav-section-toggle-button nav-global-filter-toggle is-active"
              aria-label={toggleActionLabel}
              aria-expanded={true}
              aria-controls="global-workspace-filter-panel"
              onClick={() => setCollapsed(true)}
            >
              <span className="nav-section-indicator" aria-hidden="true">
                -
              </span>
            </button>
          </div>

          <div
            id="global-workspace-filter-panel"
            className="workspace-local-filter-controls"
          >
            <label className="field workspace-local-filter-field">
              <span>Search all workspaces</span>
              <input
                ref={inputRef}
                className="control"
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Workspace, trade, delivery, counterparty, book, or provider"
              />
            </label>

            <div className="workspace-local-filter-actions">
              <span className="entity-chip entity-chip-soft">{summary}</span>
              {hasFilter ? (
                <button type="button" className="button button-ghost" onClick={() => onChange('')}>
                  Clear Global
                </button>
              ) : null}
            </div>
          </div>
        </section>
      )}

      <div className="nav-global-filter-summary" hidden={!collapsed}>
        <div className="nav-global-filter-summary-copy">
          <span className="entity-chip entity-chip-soft">{summary}</span>
          {hasFilter ? (
            <>
              <small>Current filter</small>
              <span className="nav-global-filter-summary-value">{`"${value}"`}</span>
            </>
          ) : null}
        </div>
        {hasFilter ? (
          <button type="button" className="button button-ghost" onClick={() => onChange('')}>
            Clear Global
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div
          id="global-workspace-filter-panel"
          className="workspace-local-filter-controls"
          hidden
        >
          <label className="field workspace-local-filter-field">
            <span>Search all workspaces</span>
            <input
              ref={inputRef}
              className="control"
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Workspace, trade, delivery, counterparty, book, or provider"
            />
          </label>

          <div className="workspace-local-filter-actions">
            <span className="entity-chip entity-chip-soft">{summary}</span>
            {hasFilter ? (
              <button type="button" className="button button-ghost" onClick={() => onChange('')}>
                Clear Global
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
