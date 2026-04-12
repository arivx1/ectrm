import type { ReactNode } from 'react'

import { OperationalWorkboardBanner } from './OperationalWorkboardBanner'
import type { ResolvedOperationalWorkboardDefinition } from './operationalWorkboardRegistry'

export type OperationalInspectorMetric = {
  label: string
  value: string
}

type OperationalInspectorShellProps = {
  children: ReactNode
  actions?: ReactNode
  eyebrow?: string
  title?: string | null
  subtitle?: string
  statusRow?: ReactNode
  workboard?: ResolvedOperationalWorkboardDefinition | null
  notices?: ReactNode
  related?: ReactNode
  metrics?: OperationalInspectorMetric[]
}

export function OperationalInspectorShell({
  children,
  actions,
  eyebrow,
  title,
  subtitle,
  statusRow,
  workboard,
  notices,
  related,
  metrics = [],
}: OperationalInspectorShellProps) {
  return (
    <div className="workspace-tile-inspector operational-inspector-shell">
      {actions}
      {title ? (
        <section className="operational-inspector-summary trade-inspector-summary">
          <div className="operational-inspector-summary-copy trade-inspector-summary-copy">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <strong>{title}</strong>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {statusRow ? <div className="operational-inspector-pill-row trade-inspector-pill-row">{statusRow}</div> : null}
          {workboard ? <OperationalWorkboardBanner workboard={workboard} variant="chips" /> : null}
          {notices ? <div className="operational-inspector-notes">{notices}</div> : null}
          {related ? <div className="operational-inspector-related">{related}</div> : null}
          {metrics.length > 0 ? (
            <div className="operational-inspector-grid trade-inspector-summary-grid">
              {metrics.map((metric) => (
                <article key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {children}
    </div>
  )
}
