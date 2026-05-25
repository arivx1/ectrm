export type AssistantChartType = 'pie' | 'bar' | 'line' | 'area' | 'scatter' | 'histogram'

export type AssistantChartSegment = {
  label: string
  value: number
  count?: number
  percentage?: number
  color?: string
  documentKind?: string
}

export type AssistantChartPoint = {
  label: string
  value: number
  x?: string | number
  color?: string
}

export type AssistantChartArtifact = {
  artifactType: 'ectrm.chart'
  version: number
  chartType: AssistantChartType
  title: string
  valueLabel: string
  xLabel?: string
  yLabel?: string
  segments: AssistantChartSegment[]
  points: AssistantChartPoint[]
}

export type AssistantChartRenderParts = {
  text: string
  charts: AssistantChartArtifact[]
}

const CHART_BLOCK_PATTERN = /```ectrm-chart\s*\n([\s\S]*?)```/g

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function normalizePercentage(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined
  }

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return undefined
  }

  return numericValue > 1 ? numericValue / 100 : numericValue
}

function formatDocumentKindLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

function normalizeChartType(
  value: unknown,
  options: {
    hasBins: boolean
    hasPoints: boolean
  },
): AssistantChartType {
  const normalized = cleanText(value)?.toLowerCase().replace(/[_\s-]+/g, '')
  switch (normalized) {
    case 'bar':
    case 'barchart':
      return 'bar'
    case 'line':
    case 'linechart':
      return 'line'
    case 'area':
    case 'areachart':
      return 'area'
    case 'scatter':
    case 'scatterplot':
      return 'scatter'
    case 'histogram':
      return 'histogram'
    case 'pie':
    case 'piechart':
      return 'pie'
    default:
      if (options.hasBins) {
        return 'histogram'
      }
      if (options.hasPoints) {
        return 'line'
      }
      return 'pie'
  }
}

function formatBinLabel(rawSegment: Record<string, unknown>): string | null {
  const explicitLabel = cleanText(
    rawSegment.label ?? rawSegment.name ?? rawSegment.bin ?? rawSegment.range,
  )
  if (explicitLabel) {
    return explicitLabel
  }

  const start = rawSegment.start ?? rawSegment.min ?? rawSegment.from
  const end = rawSegment.end ?? rawSegment.max ?? rawSegment.to
  if (start !== undefined && end !== undefined) {
    return `${start}-${end}`
  }

  return null
}

function normalizeSegments(
  rawSegments: unknown[],
): AssistantChartSegment[] {
  return rawSegments
    .map((rawSegment, index): AssistantChartSegment | null => {
      if (!isRecord(rawSegment)) {
        return null
      }

      const documentKind = cleanText(rawSegment.document_kind ?? rawSegment.documentKind)
      const label =
        cleanText(rawSegment.label ?? rawSegment.name) ??
        formatBinLabel(rawSegment) ??
        (documentKind ? formatDocumentKindLabel(documentKind) : null)
      const valueNumber = normalizeFiniteNumber(
        rawSegment.value ?? rawSegment.count ?? rawSegment.frequency ?? rawSegment.y,
      )
      if (!label || valueNumber === null) {
        return null
      }

      const countNumber = normalizeFiniteNumber(rawSegment.count)
      return {
        label,
        value: valueNumber,
        count: countNumber ?? undefined,
        percentage: normalizePercentage(rawSegment.percentage),
        color:
          cleanText(rawSegment.color) ??
          ASSISTANT_CHART_COLORS[index % ASSISTANT_CHART_COLORS.length],
        documentKind: documentKind ?? undefined,
      }
    })
    .filter((segment): segment is AssistantChartSegment => segment !== null)
}

function normalizePoints(rawPoints: unknown[]): AssistantChartPoint[] {
  return rawPoints
    .map((rawPoint, index): AssistantChartPoint | null => {
      if (!isRecord(rawPoint)) {
        return null
      }

      const xValue = rawPoint.x ?? rawPoint.date ?? rawPoint.period ?? rawPoint.label ?? index + 1
      const label = cleanText(rawPoint.label ?? rawPoint.name ?? String(xValue)) ?? String(index + 1)
      const valueNumber = normalizeFiniteNumber(
        rawPoint.value ?? rawPoint.y ?? rawPoint.count ?? rawPoint.frequency,
      )
      if (valueNumber === null) {
        return null
      }

      return {
        label,
        value: valueNumber,
        x: typeof xValue === 'string' || typeof xValue === 'number' ? xValue : label,
        color:
          cleanText(rawPoint.color) ??
          ASSISTANT_CHART_COLORS[index % ASSISTANT_CHART_COLORS.length],
      }
    })
    .filter((point): point is AssistantChartPoint => point !== null)
}

function derivePointsFromSegments(segments: AssistantChartSegment[]): AssistantChartPoint[] {
  return segments.map((segment) => ({
    label: segment.label,
    value: segment.value,
    x: segment.label,
    color: segment.color,
  }))
}

function deriveSegmentsFromPoints(points: AssistantChartPoint[]): AssistantChartSegment[] {
  return points.map((point) => ({
    label: point.label,
    value: point.value,
    color: point.color,
  }))
}

function normalizeChartPayload(value: unknown): AssistantChartArtifact | null {
  if (!isRecord(value)) {
    return null
  }

  const rawBins = Array.isArray(value.bins) ? value.bins : null
  const rawSegments = Array.isArray(value.segments) ? value.segments : rawBins
  const rawPoints = Array.isArray(value.points) ? value.points : null
  const chartType = normalizeChartType(value.chart_type ?? value.chartType ?? value.type, {
    hasBins: rawBins !== null,
    hasPoints: rawPoints !== null,
  })

  if (!rawSegments && !rawPoints) {
    return null
  }

  const initialSegments = rawSegments ? normalizeSegments(rawSegments) : []
  const explicitPoints = rawPoints ? normalizePoints(rawPoints) : []
  const segments =
    initialSegments.length > 0
      ? initialSegments
      : chartType === 'pie' || chartType === 'bar' || chartType === 'histogram'
        ? deriveSegmentsFromPoints(explicitPoints)
        : []
  const points =
    explicitPoints.length > 0
      ? explicitPoints
      : chartType === 'line' || chartType === 'area' || chartType === 'scatter'
        ? derivePointsFromSegments(segments)
        : []

  if (segments.length === 0 && points.length === 0) {
    return null
  }

  return {
    artifactType: 'ectrm.chart',
    version: Number(value.version) || 1,
    chartType,
    title: cleanText(value.title) ?? 'Chart',
    valueLabel: cleanText(value.value_label ?? value.valueLabel) ?? 'Value',
    xLabel: cleanText(value.x_label ?? value.xLabel) ?? undefined,
    yLabel: cleanText(value.y_label ?? value.yLabel) ?? undefined,
    segments,
    points,
  }
}

export function parseAssistantChartArtifacts(content: string): AssistantChartRenderParts {
  const charts: AssistantChartArtifact[] = []
  const textParts: string[] = []
  let lastIndex = 0

  for (const match of content.matchAll(CHART_BLOCK_PATTERN)) {
    const matchIndex = match.index ?? 0
    textParts.push(content.slice(lastIndex, matchIndex))

    try {
      const chart = normalizeChartPayload(JSON.parse(match[1] ?? ''))
      if (chart) {
        charts.push(chart)
      } else {
        textParts.push(match[0])
      }
    } catch {
      textParts.push(match[0])
    }

    lastIndex = matchIndex + match[0].length
  }

  textParts.push(content.slice(lastIndex))

  return {
    text: textParts.join('').replace(/\n{3,}/g, '\n\n').trim(),
    charts,
  }
}

export function splitAssistantMessageText(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}
