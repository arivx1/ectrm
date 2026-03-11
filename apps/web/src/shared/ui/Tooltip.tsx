import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

type TooltipProps = {
  content: ReactNode
  children: ReactNode
  className?: string
  placement?: 'top' | 'bottom'
  align?: 'center' | 'start' | 'end'
  focusable?: boolean
}

type InfoTooltipProps = {
  content: ReactNode
  label?: string
  placement?: 'top' | 'bottom'
  align?: 'center' | 'start' | 'end'
}

type InlineTooltipLabelProps = {
  children: ReactNode
  tooltip?: ReactNode
  tooltipLabel?: string
  className?: string
  placement?: 'top' | 'bottom'
  align?: 'center' | 'start' | 'end'
}

type FieldLabelProps = {
  label: string
  tooltip?: ReactNode
}

export function Tooltip({
  content,
  children,
  className = '',
  placement = 'top',
  align = 'center',
  focusable = false,
}: TooltipProps) {
  const tooltipId = useId()
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const bubbleRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    function positionBubble() {
      const anchor = anchorRef.current
      const bubble = bubbleRef.current
      if (!anchor || !bubble) {
        return
      }

      const rect = anchor.getBoundingClientRect()
      const gap = 12
      const left =
        align === 'start'
          ? rect.left
          : align === 'end'
            ? rect.right
            : rect.left + rect.width / 2
      const top = placement === 'top' ? rect.top - gap : rect.bottom + gap

      bubble.style.left = `${left}px`
      bubble.style.top = `${top}px`
      bubble.style.visibility = 'visible'
      bubble.style.opacity = '1'
    }

    positionBubble()

    window.addEventListener('resize', positionBubble)
    window.addEventListener('scroll', positionBubble, true)

    return () => {
      window.removeEventListener('resize', positionBubble)
      window.removeEventListener('scroll', positionBubble, true)
    }
  }, [align, open, placement])

  function openTooltip() {
    setOpen(true)
  }

  function closeTooltip() {
    setOpen(false)
  }

  return (
    <span
      ref={anchorRef}
      className={`tooltip-anchor ${className}`.trim()}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable && open ? tooltipId : undefined}
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
      onFocus={openTooltip}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeTooltip()
        }
      }}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={bubbleRef}
              id={tooltipId}
              role="tooltip"
              className={`tooltip-bubble tooltip-bubble-${placement} tooltip-bubble-align-${align}`}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

export function InfoTooltip({
  content,
  label = 'More information',
  placement = 'top',
  align = 'center',
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} placement={placement} align={align}>
      <button type="button" className="tooltip-info-button" aria-label={label}>
        i
      </button>
    </Tooltip>
  )
}

export function InlineTooltipLabel({
  children,
  tooltip,
  tooltipLabel = 'More information',
  className = '',
  placement = 'top',
  align = 'center',
}: InlineTooltipLabelProps) {
  return (
    <span className={`tooltip-inline-label ${className}`.trim()}>
      {children}
      {tooltip ? <InfoTooltip content={tooltip} label={tooltipLabel} placement={placement} align={align} /> : null}
    </span>
  )
}

export function FieldLabel({ label, tooltip }: FieldLabelProps) {
  return (
    <InlineTooltipLabel className="field-label" tooltip={tooltip} tooltipLabel={`More information about ${label}`}>
      {label}
    </InlineTooltipLabel>
  )
}
