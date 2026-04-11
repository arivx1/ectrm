import type { ReactNode } from 'react'

import type { PrimaryNavigationSectionKey } from '../../app/navigation'
import { NavigationSectionWorkspace } from '../../workspaces/navigation/NavigationSectionWorkspace'
import {
  renderWorkspaceByView,
  type WorkspaceViewRenderContext,
} from './workspaceDescriptors'
import {
  buildWorkspaceWindowNotices,
  type WorkspaceWindowNotice,
} from './workspaceWindowNotices'

type AppWorkspaceContentProps = WorkspaceViewRenderContext & {
  activeNavigationSectionKey: PrimaryNavigationSectionKey | null
}

function renderWorkspaceWithWindowNotices(
  workspace: ReactNode,
  notices: WorkspaceWindowNotice[],
) {
  const visibleNotices = notices.filter((notice) => notice.hasMore || notice.error)

  if (visibleNotices.length === 0) {
    return workspace
  }

  return (
    <div className="stack workspace-window-shell">
      {visibleNotices.map((notice) => (
        <section
          key={notice.key}
          className={`feedback-banner workspace-window-banner ${notice.error ? 'feedback-banner-error' : ''}`}
        >
          <div className="workspace-window-banner-copy">
            <strong>
              {notice.totalCount !== null && notice.totalCount !== undefined
                ? `Showing ${notice.loadedCount.toLocaleString()} of ${notice.totalCount.toLocaleString()} ${notice.label.toLowerCase()} in the current workspace window.`
                : `Showing ${notice.loadedCount.toLocaleString()} ${notice.label.toLowerCase()} in the current workspace window.`}
            </strong>
            <p>{notice.error || notice.description}</p>
          </div>
          {notice.hasMore ? (
            <button
              type="button"
              className="button button-secondary workspace-window-banner-action"
              onClick={notice.onLoadMore}
              disabled={notice.loading}
            >
              {notice.loading ? `Loading more ${notice.label.toLowerCase()}...` : `Load more ${notice.label.toLowerCase()}`}
            </button>
          ) : null}
        </section>
      ))}
      {workspace}
    </div>
  )
}

export function AppWorkspaceContent({
  activeNavigationSectionKey,
  ...workspaceContext
}: AppWorkspaceContentProps) {
  if (activeNavigationSectionKey !== null) {
    return (
      <NavigationSectionWorkspace
        sectionKey={activeNavigationSectionKey}
        getViewHref={workspaceContext.hrefForView}
        onOpenView={workspaceContext.navigateToView}
      />
    )
  }

  const workspaceWindowNotices = buildWorkspaceWindowNotices({
    currentView: workspaceContext.currentView,
    summary: workspaceContext.summary,
    workspaceData: workspaceContext.workspaceData,
  })

  return renderWorkspaceWithWindowNotices(
    renderWorkspaceByView(workspaceContext),
    workspaceWindowNotices,
  )
}
