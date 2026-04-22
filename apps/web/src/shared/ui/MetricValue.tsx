import type { ReactNode } from 'react'

type MetricValueProps = {
  value: ReactNode
  unit?: string | null
  as?: 'strong' | 'b'
  className?: string
}

export function MetricValue({
  value,
  unit,
  as = 'strong',
  className,
}: MetricValueProps) {
  const Tag = as
  const resolvedClassName = className ? `metric-value-with-unit ${className}` : 'metric-value-with-unit'

  return (
    <Tag className={resolvedClassName}>
      <span className="metric-value-text">{value}</span>
      {unit ? <span className="metric-unit-label">{unit}</span> : null}
    </Tag>
  )
}
