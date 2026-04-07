import { Tooltip } from '../../shared/ui/Tooltip'

export function ReferenceTabButton({
  label,
  active,
  tooltip,
  onClick,
}: {
  label: string
  active: boolean
  tooltip: string
  onClick: () => void
}) {
  return (
    <Tooltip content={tooltip} placement="bottom">
      <button type="button" className={`tab-pill ${active ? 'is-active' : ''}`} onClick={onClick}>
        {label}
      </button>
    </Tooltip>
  )
}

export function ReferenceStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Tooltip
      content={
        isActive
          ? 'Active records are available to operators and validation rules throughout the product.'
          : 'Inactive records remain in history but should not be available for new operational choices.'
      }
    >
      <span className={`reference-status ${isActive ? 'is-active' : 'is-inactive'} tooltip-trigger-hint`}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </Tooltip>
  )
}

export function EditorStateBadge({ isDirty }: { isDirty: boolean }) {
  return (
    <Tooltip
      content={
        isDirty
          ? 'You have local edits that differ from the saved reference record.'
          : 'The form currently matches the saved reference record.'
      }
      focusable
    >
      <span className={`editor-state-pill ${isDirty ? 'is-dirty' : 'is-clean'} tooltip-trigger-hint`}>
        {isDirty ? 'Unsaved changes' : 'Saved'}
      </span>
    </Tooltip>
  )
}
