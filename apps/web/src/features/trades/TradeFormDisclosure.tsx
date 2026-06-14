import { type ReactNode } from 'react'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'

type TradeFormDisclosureProps = {
  persistenceKey?: string
  title: string
  summary: string
  description: string
  defaultOpen?: boolean
  children: ReactNode
}

export function TradeFormDisclosure({
  persistenceKey,
  title,
  summary,
  description,
  defaultOpen = false,
  children,
}: TradeFormDisclosureProps) {
  const { expanded: open, setExpanded: setOpen } =
    usePersistentCollapsibleCardState(
      persistenceKey ?? `trade-form-disclosure:${title}`,
      defaultOpen,
    )

  return (
    <details
      className="trade-form-disclosure field-full"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="trade-form-disclosure-toggle">
        <div className="trade-form-disclosure-copy">
          <span>{title}</span>
          <strong>{summary}</strong>
          <p>{description}</p>
        </div>
      </summary>
      <div className="trade-form-disclosure-grid">{children}</div>
    </details>
  )
}
