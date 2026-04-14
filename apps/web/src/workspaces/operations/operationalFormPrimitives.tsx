import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

type OperationalFormGridProps = {
  children: ReactNode
  className?: string
}

export function OperationalFormGrid({ children, className }: OperationalFormGridProps) {
  return <div className={joinClassNames('workflow-item-grid', className)}>{children}</div>
}

type OperationalFormFieldProps = {
  children: ReactNode
  label: string
  wide?: boolean
}

export function OperationalFormField({ children, label, wide = false }: OperationalFormFieldProps) {
  return (
    <label className={joinClassNames('field', wide && 'field-wide')}>
      <span>{label}</span>
      {children}
    </label>
  )
}

type OperationalInputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  controlClassName?: string
  label: string
  wide?: boolean
}

export function OperationalInputField({
  controlClassName,
  label,
  wide = false,
  ...props
}: OperationalInputFieldProps) {
  return (
    <OperationalFormField label={label} wide={wide}>
      <input className={joinClassNames('control', 'control-compact', controlClassName)} {...props} />
    </OperationalFormField>
  )
}

type OperationalSelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'className'> & {
  children: ReactNode
  controlClassName?: string
  label: string
  wide?: boolean
}

export function OperationalSelectField({
  children,
  controlClassName,
  label,
  wide = false,
  ...props
}: OperationalSelectFieldProps) {
  return (
    <OperationalFormField label={label} wide={wide}>
      <select className={joinClassNames('control', 'control-compact', controlClassName)} {...props}>
        {children}
      </select>
    </OperationalFormField>
  )
}

type OperationalTextareaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  controlClassName?: string
  label: string
  variant?: 'compact' | 'textarea'
  wide?: boolean
}

export function OperationalTextareaField({
  controlClassName,
  label,
  variant = 'textarea',
  wide = false,
  ...props
}: OperationalTextareaFieldProps) {
  return (
    <OperationalFormField label={label} wide={wide}>
      <textarea
        className={joinClassNames(
          'control',
          variant === 'compact' ? 'control-compact' : 'control-textarea',
          controlClassName,
        )}
        {...props}
      />
    </OperationalFormField>
  )
}

type OperationalFormActionsProps = {
  children: ReactNode
  className?: string
}

export function OperationalFormActions({ children, className }: OperationalFormActionsProps) {
  return <div className={joinClassNames('workflow-item-actions', className)}>{children}</div>
}

type OperationalFormActionsCopyProps = {
  children: ReactNode
  className?: string
}

export function OperationalFormActionsCopy({
  children,
  className,
}: OperationalFormActionsCopyProps) {
  return <div className={joinClassNames('shipment-card-copy', className)}>{children}</div>
}

type OperationalFormButtonRowProps = {
  children: ReactNode
  className?: string
}

export function OperationalFormButtonRow({ children, className }: OperationalFormButtonRowProps) {
  return <div className={joinClassNames('workflow-item-button-row', className)}>{children}</div>
}
