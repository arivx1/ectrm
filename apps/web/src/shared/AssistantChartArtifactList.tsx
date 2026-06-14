import type {
  AssistantChartArtifact,
  AssistantChartPoint,
  AssistantChartSegment,
} from './assistantChartArtifacts'

const ASSISTANT_CHART_COLORS = [
  '#1f9d8f',
  '#3478f6',
  '#d8891f',
  '#c94f5f',
  '#6d5bd0',
  '#2f9f58',
  '#b45a9a',
  '#607382',
]

function segmentColor(segment: AssistantChartSegment, index: number): string {
  return segment.color ?? ASSISTANT_CHART_COLORS[index % ASSISTANT_CHART_COLORS.length]
}

function formatChartNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

function formatChartPercent(segment: AssistantChartSegment, total: number): string {
  const ratio = segment.percentage ?? (total > 0 ? segment.value / total : 0)
  const percentage = ratio * 100
  return `${percentage >= 10 ? percentage.toFixed(0) : percentage.toFixed(1)}%`
}

function chartValueItems(chart: AssistantChartArtifact): Array<AssistantChartSegment | AssistantChartPoint> {
  return chart.segments.length > 0 ? chart.segments : chart.points
}

function chartHeaderMetric(chart: AssistantChartArtifact): string {
  if (
    chart.chartType === 'line' ||
    chart.chartType === 'area' ||
    chart.chartType === 'scatter'
  ) {
    return `${chart.points.length} ${chart.points.length === 1 ? 'point' : 'points'}`
  }

  const total = chart.segments.reduce((sum, segment) => sum + segment.value, 0)
  return `${formatChartNumber(total)} ${chart.valueLabel}`
}

function polarToCartesian(angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180
  return {
    x: 50 + 42 * Math.cos(angleInRadians),
    y: 50 + 42 * Math.sin(angleInRadians),
  }
}

function describePieSlice(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(endAngle)
  const end = polarToCartesian(startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? '1' : '0'
  return `M 50 50 L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A 42 42 0 ${largeArcFlag} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`
}

function buildChartSummary(chart: AssistantChartArtifact): string {
  const segmentSummary = chartValueItems(chart)
    .map((item) => `${item.label} ${formatChartNumber(item.value)}`)
    .join(', ')
  return `${chart.title}: ${segmentSummary}`
}

function AssistantPieChart({ chart }: { chart: AssistantChartArtifact }) {
  const total = chart.segments.reduce((sum, segment) => sum + segment.value, 0)
  const sliceAngles = chart.segments.reduce<
    Array<{
      segment: AssistantChartSegment
      index: number
      startAngle: number
      endAngle: number
    }>
  >((slices, segment, index) => {
    const startAngle = slices.at(-1)?.endAngle ?? 0
    const sweepAngle = total > 0 ? (segment.value / total) * 360 : 0
    const endAngle = index === chart.segments.length - 1 ? 360 : startAngle + sweepAngle
    return [...slices, { segment, index, startAngle, endAngle }]
  }, [])

  return (
    <svg
      className="assistant-chart-pie"
      viewBox="0 0 100 100"
      role="img"
      aria-label={buildChartSummary(chart)}
    >
      {sliceAngles.map(({ segment, index, startAngle, endAngle }) => {
        const color = segmentColor(segment, index)
        if (endAngle - startAngle >= 359.99) {
          return (
            <circle key={`${segment.label}-${index}`} cx="50" cy="50" r="42" fill={color}>
              <title>{`${segment.label}: ${formatChartNumber(segment.value)}`}</title>
            </circle>
          )
        }

        return (
          <path
            key={`${segment.label}-${index}`}
            d={describePieSlice(startAngle, endAngle)}
            fill={color}
          >
            <title>{`${segment.label}: ${formatChartNumber(segment.value)}`}</title>
          </path>
        )
      })}
      <circle className="assistant-chart-pie-ring" cx="50" cy="50" r="42" />
    </svg>
  )
}

function AssistantBarChart({ chart }: { chart: AssistantChartArtifact }) {
  const maxValue = Math.max(...chart.segments.map((segment) => segment.value))

  return (
    <div className="assistant-chart-bars" aria-label={buildChartSummary(chart)}>
      {chart.segments.map((segment, index) => (
        <div key={`${segment.label}-${index}`} className="assistant-chart-bar-row">
          <span className="assistant-chart-bar-label">{segment.label}</span>
          <span className="assistant-chart-bar-track" aria-hidden="true">
            <span
              className="assistant-chart-bar-fill"
              style={{
                backgroundColor: segmentColor(segment, index),
                width: `${maxValue > 0 ? (segment.value / maxValue) * 100 : 0}%`,
              }}
            />
          </span>
          <strong>{formatChartNumber(segment.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function AssistantHistogramChart({ chart }: { chart: AssistantChartArtifact }) {
  const maxValue = Math.max(...chart.segments.map((segment) => segment.value), 0)

  return (
    <div className="assistant-chart-histogram" aria-label={buildChartSummary(chart)}>
      {chart.segments.map((segment, index) => (
        <div key={`${segment.label}-${index}`} className="assistant-chart-histogram-bin">
          <span className="assistant-chart-histogram-column" aria-hidden="true">
            <span
              className="assistant-chart-histogram-fill"
              style={{
                backgroundColor: segmentColor(segment, index),
                height: `${maxValue > 0 ? (segment.value / maxValue) * 100 : 0}%`,
              }}
            />
          </span>
          <strong>{formatChartNumber(segment.value)}</strong>
          <span>{segment.label}</span>
        </div>
      ))}
    </div>
  )
}

function scaleLinePoint(
  point: AssistantChartPoint,
  index: number,
  points: AssistantChartPoint[],
  minValue: number,
  maxValue: number,
) {
  const plotLeft = 32
  const plotRight = 232
  const plotTop = 12
  const plotBottom = 110
  const x =
    points.length === 1
      ? (plotLeft + plotRight) / 2
      : plotLeft + (index / (points.length - 1)) * (plotRight - plotLeft)
  const valueRange = maxValue - minValue || 1
  const y = plotBottom - ((point.value - minValue) / valueRange) * (plotBottom - plotTop)
  return { x, y }
}

function AssistantLineChart({ chart }: { chart: AssistantChartArtifact }) {
  const values = chart.points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const coordinates = chart.points.map((point, index) =>
    scaleLinePoint(point, index, chart.points, minValue, maxValue),
  )
  const linePath = coordinates
    .map((coordinate, index) => `${index === 0 ? 'M' : 'L'} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`)
    .join(' ')
  const areaPath =
    chart.chartType === 'area' && coordinates.length > 0
      ? `${linePath} L ${coordinates.at(-1)?.x.toFixed(2)} 110 L ${coordinates[0]?.x.toFixed(2)} 110 Z`
      : ''
  const firstLabel = chart.points[0]?.label ?? ''
  const lastLabel = chart.points.at(-1)?.label ?? ''

  return (
    <div className="assistant-chart-line-wrap">
      <svg
        className={`assistant-chart-line is-${chart.chartType}`}
        viewBox="0 0 244 140"
        role="img"
        aria-label={buildChartSummary(chart)}
      >
        <line className="assistant-chart-axis" x1="32" y1="110" x2="232" y2="110" />
        <line className="assistant-chart-axis" x1="32" y1="12" x2="32" y2="110" />
        <line className="assistant-chart-gridline" x1="32" y1="61" x2="232" y2="61" />
        <text className="assistant-chart-axis-value" x="6" y="16">
          {formatChartNumber(maxValue)}
        </text>
        <text className="assistant-chart-axis-value" x="6" y="112">
          {formatChartNumber(minValue)}
        </text>
        {areaPath ? <path className="assistant-chart-area-fill" d={areaPath} /> : null}
        {chart.chartType !== 'scatter' ? <path className="assistant-chart-line-path" d={linePath} /> : null}
        {coordinates.map((coordinate, index) => (
          <circle
            key={`${chart.points[index]?.label ?? 'point'}-${index}`}
            className="assistant-chart-line-point"
            cx={coordinate.x}
            cy={coordinate.y}
            r={chart.chartType === 'scatter' ? 3.4 : 2.6}
            style={{ fill: chart.points[index]?.color }}
          >
            <title>{`${chart.points[index]?.label}: ${formatChartNumber(chart.points[index]?.value ?? 0)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="assistant-chart-axis-labels" aria-hidden="true">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}

function AssistantChartLegend({ chart }: { chart: AssistantChartArtifact }) {
  const total = chart.segments.reduce((sum, segment) => sum + segment.value, 0)

  if (chart.segments.length === 0) {
    return <AssistantPointSummary chart={chart} />
  }

  return (
    <div className="assistant-chart-legend">
      {chart.segments.map((segment, index) => (
        <div key={`${segment.label}-${index}`} className="assistant-chart-legend-item">
          <span
            className="assistant-chart-swatch"
            style={{ backgroundColor: segmentColor(segment, index) }}
            aria-hidden="true"
          />
          <span className="assistant-chart-label">{segment.label}</span>
          <strong className="assistant-chart-value">
            {formatChartNumber(segment.value)}
            <span>{formatChartPercent(segment, total)}</span>
          </strong>
        </div>
      ))}
    </div>
  )
}

function AssistantPointSummary({ chart }: { chart: AssistantChartArtifact }) {
  if (chart.points.length === 0) {
    return null
  }

  const firstPoint = chart.points[0]
  const lastPoint = chart.points.at(-1)
  const values = chart.points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)

  return (
    <div className="assistant-chart-point-summary">
      {firstPoint ? (
        <span>
          First <strong>{formatChartNumber(firstPoint.value)}</strong>
        </span>
      ) : null}
      {lastPoint ? (
        <span>
          Latest <strong>{formatChartNumber(lastPoint.value)}</strong>
        </span>
      ) : null}
      <span>
        Range <strong>{formatChartNumber(minValue)}-{formatChartNumber(maxValue)}</strong>
      </span>
    </div>
  )
}

function AssistantChartVisual({ chart }: { chart: AssistantChartArtifact }) {
  if (chart.chartType === 'histogram') {
    return <AssistantHistogramChart chart={chart} />
  }
  if (chart.chartType === 'line' || chart.chartType === 'area' || chart.chartType === 'scatter') {
    return <AssistantLineChart chart={chart} />
  }
  if (chart.chartType === 'bar') {
    return <AssistantBarChart chart={chart} />
  }
  return <AssistantPieChart chart={chart} />
}

function AssistantChartArtifactCard({ chart }: { chart: AssistantChartArtifact }) {
  return (
    <figure className="assistant-chart-card" aria-label={buildChartSummary(chart)}>
      <figcaption className="assistant-chart-header">
        <strong>{chart.title}</strong>
        <span>{chartHeaderMetric(chart)}</span>
      </figcaption>
      <div className={`assistant-chart-visual is-${chart.chartType}`}>
        <AssistantChartVisual chart={chart} />
        <AssistantChartLegend chart={chart} />
      </div>
    </figure>
  )
}

export function AssistantChartArtifactList({ charts }: { charts: AssistantChartArtifact[] }) {
  if (charts.length === 0) {
    return null
  }

  return (
    <div className="assistant-chart-artifact-list">
      {charts.map((chart, index) => (
        <AssistantChartArtifactCard key={`${chart.title}-${index}`} chart={chart} />
      ))}
    </div>
  )
}
