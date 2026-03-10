type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

type PositionsWorkspaceProps = {
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  positionsWithClass: PositionRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

export function PositionsWorkspace({
  positionsByClass,
  positionsWithClass,
  formatCommodityClass,
  formatNumber,
  formatDate,
}: PositionsWorkspaceProps) {
  return (
    <div className="stack">
      <section className="surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Grouped View</span>
            <h3>Exposure by Commodity Class</h3>
          </div>
          <p>A top-level risk summary before you inspect exact line items.</p>
        </div>
        {positionsByClass.length > 0 ? (
          <div className="position-class-grid">
            {positionsByClass.map((row) => (
              <article key={row.commodityClass} className="position-class-card">
                <span>{formatCommodityClass(row.commodityClass)}</span>
                <strong>{formatNumber(row.netVolume, 0)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No positions</strong>
            <p>Create active trades to populate this risk surface.</p>
          </div>
        )}
      </section>

      <section className="surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Detailed View</span>
            <h3>Commodity Rows</h3>
          </div>
          <p>Exact commodity-level net volume currently held in the projection.</p>
        </div>
        <div className="position-list">
          {positionsWithClass.map((position) => (
            <article key={position.commodity} className="position-card">
              <div>
                <strong>{position.commodity}</strong>
                <span>{formatCommodityClass(position.commodity_class)}</span>
              </div>
              <div className="position-value">
                <b>{formatNumber(position.net_volume, 0)}</b>
                <span>{formatDate(position.updated_at)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
