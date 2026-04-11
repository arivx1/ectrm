import type { ReactNode } from 'react'

import type { WorkspaceTile } from '../../shared/ui/TileLayout'

type BuildAsyncReportTileOptions = Omit<WorkspaceTile, 'content'> & {
  loading: boolean
  error: string
  isEmpty: boolean
  renderContent: () => ReactNode
  emptyTitle: string
  emptyDescription: string
  skeletonBlockCount?: number
}

function renderSkeletonStack(blockCount: number): ReactNode {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: blockCount }, (_, index) => (
        <div key={index} className="skeleton-block" />
      ))}
    </div>
  )
}

export function renderReportEmptyState(title: string, description: string): ReactNode {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

export function reportErrorState(message: string): ReactNode {
  return renderReportEmptyState('Reporting is unavailable', message)
}

export function buildAsyncReportTile({
  loading,
  error,
  isEmpty,
  renderContent,
  emptyTitle,
  emptyDescription,
  skeletonBlockCount = 1,
  ...tile
}: BuildAsyncReportTileOptions): WorkspaceTile {
  return {
    ...tile,
    content: loading
      ? renderSkeletonStack(skeletonBlockCount)
      : error
        ? reportErrorState(error)
        : isEmpty
          ? renderReportEmptyState(emptyTitle, emptyDescription)
          : renderContent(),
  }
}
