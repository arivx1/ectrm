import type { ReactNode } from 'react'

import { OperationalBoardShell } from './OperationalBoardShell'
import type { ResolvedOperationalWorkboardDefinition } from './operationalWorkboardRegistry'

type OperationalBoardControllerProps = {
  workboard: ResolvedOperationalWorkboardDefinition
  children: ReactNode
  isEmpty?: boolean
  emptyStateTitle?: string
  emptyStateDetail?: string
  emptyStateContent?: ReactNode
  summary?: ReactNode
  detail?: ReactNode
  className?: string
  mainClassName?: string
  detailClassName?: string
  bannerVariant?: 'chips' | 'section'
}

function fallbackEmptyStateTitle(workboard: ResolvedOperationalWorkboardDefinition): string {
  return `No ${workboard.title.toLowerCase()}`
}

function fallbackEmptyStateDetail(workboard: ResolvedOperationalWorkboardDefinition): string {
  return `${workboard.title} will appear here once operational records start populating this board.`
}

function renderDefaultEmptyState(
  workboard: ResolvedOperationalWorkboardDefinition,
  title?: string,
  detail?: string,
) {
  const resolvedTitle = title ?? workboard.emptyState?.title ?? fallbackEmptyStateTitle(workboard)
  const resolvedDetail = detail ?? workboard.emptyState?.detail ?? fallbackEmptyStateDetail(workboard)

  return (
    <div className="empty-state">
      <strong>{resolvedTitle}</strong>
      <p>{resolvedDetail}</p>
    </div>
  )
}

export function OperationalBoardController({
  workboard,
  children,
  isEmpty = false,
  emptyStateTitle,
  emptyStateDetail,
  emptyStateContent,
  summary,
  detail,
  className,
  mainClassName,
  detailClassName,
  bannerVariant = 'section',
}: OperationalBoardControllerProps) {
  return (
    <OperationalBoardShell
      workboard={workboard}
      summary={summary}
      detail={detail}
      className={className}
      mainClassName={mainClassName}
      detailClassName={detailClassName}
      bannerVariant={bannerVariant}
    >
      {isEmpty ? emptyStateContent ?? renderDefaultEmptyState(workboard, emptyStateTitle, emptyStateDetail) : children}
    </OperationalBoardShell>
  )
}
