import type { ReactNode } from 'react'

import { OperationalWorkboardBanner } from './OperationalWorkboardBanner'
import type { ResolvedOperationalWorkboardDefinition } from './operationalWorkboardRegistry'

type OperationalBoardShellProps = {
  workboard: ResolvedOperationalWorkboardDefinition
  children: ReactNode
  summary?: ReactNode
  detail?: ReactNode
  className?: string
  mainClassName?: string
  detailClassName?: string
  bannerVariant?: 'chips' | 'section'
}

function joinClassNames(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(' ')
}

function visiblePrimaryActions(workboard: ResolvedOperationalWorkboardDefinition) {
  return workboard.primaryActions.slice(0, 4)
}

function visibleSummaryStats(workboard: ResolvedOperationalWorkboardDefinition) {
  return workboard.summaryStats.slice(0, 4)
}

export function OperationalBoardShell({
  workboard,
  children,
  summary,
  detail,
  className,
  mainClassName,
  detailClassName,
  bannerVariant = 'section',
}: OperationalBoardShellProps) {
  const primaryActions = visiblePrimaryActions(workboard)
  const summaryStats = visibleSummaryStats(workboard)

  return (
    <div
      className={joinClassNames(
        'operational-board-shell',
        detail ? 'operational-board-shell-split' : null,
        className,
      )}
    >
      <div className={joinClassNames('operational-board-shell-main', mainClassName)}>
        <div className="operational-board-shell-header">
          <OperationalWorkboardBanner workboard={workboard} variant={bannerVariant} />
          {summary}
          {!summary && primaryActions.length > 0 ? (
            <div className="shipment-card-actions">
              <span>Primary actions</span>
              <div className="shipment-card-meta">
                {primaryActions.map((action) => (
                  <span key={`${action.resource_key}-${action.key}`} className="entity-chip entity-chip-soft">
                    {action.resource_label}: {action.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {!summary && summaryStats.length > 0 ? (
            <div className="dashboard-report-grid operational-summary-grid">
              {summaryStats.map((summaryStat) => (
                <article
                  key={`${summaryStat.resource_key}-${summaryStat.key}`}
                  className="dashboard-report-card operational-summary-card"
                >
                  <span>{summaryStat.resource_label}</span>
                  <strong>{summaryStat.label}</strong>
                  <p>{summaryStat.detail}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
        {children}
      </div>
      {detail ? <aside className={joinClassNames('operational-board-shell-detail', detailClassName)}>{detail}</aside> : null}
    </div>
  )
}
