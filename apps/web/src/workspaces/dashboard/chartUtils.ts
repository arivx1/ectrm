export const CHART_WIDTH = 320
export const CHART_HEIGHT = 112
export const CHART_PADDING = 10

export type ChartPoint = {
  x: number
  y: number
}

function chartBounds(values: number[]) {
  const drawableWidth = CHART_WIDTH - CHART_PADDING * 2
  const drawableHeight = CHART_HEIGHT - CHART_PADDING * 2
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const span = maxValue - minValue

  return {
    drawableWidth,
    drawableHeight,
    maxValue,
    span,
  }
}

export function projectChartY(value: number, values: number[], clamp = false): number {
  if (values.length === 0) {
    return CHART_HEIGHT / 2
  }

  const { drawableHeight, maxValue, span } = chartBounds(values)
  const rawY =
    span === 0
      ? CHART_PADDING + drawableHeight / 2
      : CHART_PADDING + ((maxValue - value) / span) * drawableHeight

  if (!clamp) {
    return rawY
  }

  return Math.min(CHART_HEIGHT - CHART_PADDING, Math.max(CHART_PADDING, rawY))
}

export function buildChartPoints(values: number[]): ChartPoint[] {
  if (values.length === 0) {
    return []
  }

  const { drawableWidth } = chartBounds(values)

  return values.map((value, index) => {
    const x =
      values.length === 1
        ? CHART_WIDTH / 2
        : CHART_PADDING + (drawableWidth * index) / (values.length - 1)

    return {
      x,
      y: projectChartY(value, values),
    }
  })
}

export function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return ''
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

export function buildAreaPath(points: ChartPoint[], baseline = CHART_HEIGHT - CHART_PADDING): string {
  if (points.length === 0) {
    return ''
  }

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  return `${buildLinePath(points)} L ${lastPoint.x.toFixed(2)} ${baseline.toFixed(2)} L ${firstPoint.x.toFixed(2)} ${baseline.toFixed(2)} Z`
}
