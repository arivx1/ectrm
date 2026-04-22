import { useEffect, useState, type ReactNode } from 'react'

type TradeFormDisclosureProps = {
  title: string
  summary: string
  description: string
  defaultOpen?: boolean
  children: ReactNode
}

export function TradeFormDisclosure({
  title,
  summary,
  description,
  defaultOpen = false,
  children,
}: TradeFormDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (defaultOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Re-open the disclosure when parent defaults switch it on.
      setOpen(true)
    }
  }, [defaultOpen])

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
