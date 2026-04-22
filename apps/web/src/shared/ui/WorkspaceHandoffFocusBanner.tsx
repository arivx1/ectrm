import type { ViewKey } from '../models'
import {
  describeAppRouteHandoff,
  getAppRouteHandoffFilterValue,
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
  type AppRouteHandoffFocusType,
} from '../appRouteHandoff'

type WorkspaceHandoffFocusBannerAction = {
  label: string
  onClick: () => void
  disabled?: boolean
}

type WorkspaceHandoffFocusBannerProps = {
  handoff: AppRouteHandoff | null
  currentView: ViewKey
  onClear: () => void
  clearLabel?: string
  actions?: WorkspaceHandoffFocusBannerAction[]
}

function focusTypeLabel(focusType: AppRouteHandoffFocusType): string {
  switch (focusType) {
    case 'workflow_item':
      return 'Workflow item'
    case 'reference_record':
      return 'Reference record'
    default:
      return focusType.charAt(0).toUpperCase() + focusType.slice(1)
  }
}

function sourceLabel(handoff: AppRouteHandoff): string {
  if (handoff.source === 'assistant') {
    if (handoff.sourceRunId !== null) {
      return `Assistant run #${handoff.sourceRunId}`
    }
    if (handoff.sourceConversationId !== null) {
      return `Assistant conversation #${handoff.sourceConversationId}`
    }
    return 'Assistant'
  }

  return 'Activity Feed'
}

export function WorkspaceHandoffFocusBanner({
  handoff,
  currentView,
  onClear,
  clearLabel = 'Show Full Workspace',
  actions = [],
}: WorkspaceHandoffFocusBannerProps) {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  const description = describeAppRouteHandoff(normalizedHandoff, currentView)

  if (!normalizedHandoff || !description) {
    return null
  }

  const focusLabel = normalizedHandoff.focus.label ?? normalizedHandoff.focus.id
  const filterValue = getAppRouteHandoffFilterValue(normalizedHandoff)

  return (
    <section className="feedback-banner feedback-banner-success workspace-focus-banner">
      <div className="workspace-handoff-banner-copy">
        <strong>{description.title}</strong>
        <p>{description.detail}</p>
        <div className="workspace-handoff-meta" aria-label="Handoff context">
          <span>{sourceLabel(normalizedHandoff)}</span>
          <span>
            {focusTypeLabel(normalizedHandoff.focus.type)}: {focusLabel}
          </span>
          {filterValue ? <span>Filter: {filterValue}</span> : null}
          {normalizedHandoff.tradeInspectorTab ? (
            <span>Inspector: {normalizedHandoff.tradeInspectorTab}</span>
          ) : null}
        </div>
      </div>
      <div className="workspace-handoff-actions">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="button button-secondary"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
        <button type="button" className="button button-ghost" onClick={onClear}>
          {clearLabel}
        </button>
      </div>
    </section>
  )
}
