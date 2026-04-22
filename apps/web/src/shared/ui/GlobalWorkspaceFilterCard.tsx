type GlobalWorkspaceFilterCardProps = {
  value: string
  onChange: (value: string) => void
  totalCount: number
  matchedCount: number
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function GlobalWorkspaceFilterCard({
  value,
  onChange,
  totalCount,
  matchedCount,
  collapsed,
  onToggleCollapsed,
}: GlobalWorkspaceFilterCardProps) {
  const hasFilter = value.trim().length > 0
  const summary = hasFilter
    ? `${matchedCount.toLocaleString()} of ${totalCount.toLocaleString()} workspaces match`
    : `Search across ${totalCount.toLocaleString()} workspaces and the current screen`

  return (
    <section className="surface workspace-local-filter nav-global-filter">
      <div className="workspace-local-filter-copy">
        <div>
          <span className="eyebrow">Search</span>
          <h3>Global Workspace Filter</h3>
        </div>
        <button
          type="button"
          className="button button-ghost"
          aria-expanded={!collapsed}
          aria-controls="global-workspace-filter-panel"
          onClick={onToggleCollapsed}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      <div className="nav-global-filter-summary" hidden={!collapsed}>
        <span className="entity-chip entity-chip-soft">{summary}</span>
        {hasFilter ? <span>Current filter: &quot;{value}&quot;</span> : null}
      </div>

      <div
        id="global-workspace-filter-panel"
        className="workspace-local-filter-controls"
        hidden={collapsed}
      >
        <label className="field workspace-local-filter-field">
          <span>Search all workspaces</span>
          <input
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
  )
}
