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
        </div>
        {children}
      </div>
      {detail ? <aside className={joinClassNames('operational-board-shell-detail', detailClassName)}>{detail}</aside> : null}
    </div>
  )
}
