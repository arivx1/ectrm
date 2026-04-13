type WorkspaceLocalFilterBarProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  description: string
  totalCount: number
  matchedCount: number
  resultLabel: string
  note?: string
}

export function WorkspaceLocalFilterBar({
  value,
  onChange,
  placeholder,
  description,
  totalCount,
  matchedCount,
  resultLabel,
  note,
}: WorkspaceLocalFilterBarProps) {
  const hasQuery = value.trim().length > 0
  const statusLabel = hasQuery
    ? `${matchedCount.toLocaleString()} of ${totalCount.toLocaleString()} ${resultLabel} match`
    : `All ${totalCount.toLocaleString()} ${resultLabel} in view`

  return (
    <section className="surface workspace-local-filter">
      <div className="workspace-local-filter-copy">
        <div>
          <span className="eyebrow">Filter</span>
          <h3>Local Screen Filter</h3>
        </div>
        <p>{description}</p>
      </div>

      <div className="workspace-local-filter-controls">
        <label className="field workspace-local-filter-field">
          <span>Search current screen</span>
          <input
            className="control"
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
        </label>

        <div className="workspace-local-filter-actions">
          <span className="entity-chip entity-chip-soft">{statusLabel}</span>
          {hasQuery ? (
            <button type="button" className="button button-ghost" onClick={() => onChange('')}>
              Clear Filter
            </button>
          ) : null}
        </div>
      </div>

      {note ? <p className="workspace-local-filter-note">{note}</p> : null}
    </section>
  )
}
