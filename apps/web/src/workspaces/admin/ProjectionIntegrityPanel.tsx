import type { StoredAuthSession } from '../../shared/mutation'

type ProjectionIntegrityPanelProps = {
  authSession: StoredAuthSession | null
  onOpenSettings: () => void
  onRefreshData: () => Promise<void>
  formatDate: (value: string | null | undefined) => string
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

// This admin panel intentionally keeps a small local access helper beside the
// component until the projection-repair work grows a shared permissions module.
export function ProjectionIntegrityPanel({
  authSession,
  onOpenSettings,
}: ProjectionIntegrityPanelProps) {
  const adminEnabled = hasAdministrativeAccess(authSession)

  return (
    <section className="surface feature-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Operations</span>
          <h3>Projection Audit and Repair</h3>
        </div>
        <p>Review projection drift, scope repairs to explicit trades, and reconcile safe operational projections.</p>
      </div>

      {!adminEnabled ? (
        <div className="empty-state empty-state-tall">
          <strong>Administrative session required</strong>
          <p>
            {authSession
              ? `Signed in as ${authSession.user.display_name} with role ${authSession.user.role}.`
              : 'Sign in with an OPS_ADMIN or ADMIN account to audit and repair projections.'}
          </p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      ) : (
        <div className="admin-grid">
          <article className="admin-card">
            <strong>Structural Findings</strong>
            <p>Refresh the audit before repairing so the repair scope reflects the latest trade state.</p>
            <div className="toolbar">
              <button type="button" className="button button-secondary">
                Refresh Audit
              </button>
              <button type="button" className="button button-primary">
                Repair Drifted Trades
              </button>
            </div>
          </article>
          <article className="admin-card">
            <strong>Repair Scope</strong>
            <p>Paste trade IDs separated by commas, spaces, or new lines to target a deterministic repair.</p>
          </article>
        </div>
      )}
    </section>
  )
}
