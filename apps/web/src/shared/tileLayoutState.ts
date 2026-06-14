import type { WorkspaceLayoutState, WorkspaceTileSpan } from './layouts'

export type TileSpan = WorkspaceTileSpan

export type WorkspaceTileLayoutSpec = {
  id: string
  span?: TileSpan
  availableSpans?: TileSpan[]
}

export type WorkspaceTileSectionLayoutSpec = {
  id: string
  itemIds: string[]
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)]
}

export function defaultSpanForTile(tile: Pick<WorkspaceTileLayoutSpec, 'span'>): TileSpan {
  return tile.span ?? 'full'
}

export function availableSpansForTile(
  tile: Pick<WorkspaceTileLayoutSpec, 'span' | 'availableSpans'>,
): TileSpan[] {
  const defaultSpan = defaultSpanForTile(tile)
  const configuredSpans = tile.availableSpans?.length ? uniqueValues(tile.availableSpans) : []
  return configuredSpans.includes(defaultSpan) ? configuredSpans : uniqueValues([defaultSpan, ...configuredSpans])
}

export function sanitizeSectionOrder(itemIds: string[], candidate: unknown): string[] {
  const knownIds = new Set(itemIds)
  const candidateOrder = Array.isArray(candidate)
    ? candidate.filter((value): value is string => typeof value === 'string')
    : []
  const knownOrder = uniqueValues(candidateOrder.filter((value) => knownIds.has(value)))

  return [...knownOrder, ...itemIds.filter((itemId) => !knownOrder.includes(itemId))]
}

function normalizeSectionOrders(
  sections: WorkspaceTileSectionLayoutSpec[],
  candidate: unknown,
): Record<string, string[]> {
  const defaultSections = Object.fromEntries(sections.map((section) => [section.id, [...section.itemIds]]))
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return defaultSections
  }

  const candidateRecord = candidate as Record<string, unknown>
  return Object.fromEntries(
    sections.map((section) => [section.id, sanitizeSectionOrder(section.itemIds, candidateRecord[section.id])]),
  )
}

export function createDefaultLayout(
  tileIds: string[],
  sections: WorkspaceTileSectionLayoutSpec[] = [],
): WorkspaceLayoutState {
  return {
    order: [...tileIds],
    hidden: [],
    spans: {},
    sections: Object.fromEntries(sections.map((section) => [section.id, [...section.itemIds]])),
  }
}

function normalizeSpanOverrides(
  tiles: WorkspaceTileLayoutSpec[],
  candidate: unknown,
): Record<string, TileSpan> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {}
  }

  const spansById: Record<string, TileSpan> = {}
  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]))

  for (const [tileId, rawSpan] of Object.entries(candidate as Record<string, unknown>)) {
    if (typeof rawSpan !== 'string') {
      continue
    }

    const tile = tilesById.get(tileId)
    if (!tile) {
      continue
    }

    const normalizedSpan = rawSpan.toLowerCase() as TileSpan
    const allowedSpans = availableSpansForTile(tile)
    const defaultSpan = defaultSpanForTile(tile)
    if (allowedSpans.includes(normalizedSpan) && normalizedSpan !== defaultSpan) {
      spansById[tileId] = normalizedSpan
    }
  }

  return spansById
}

export function sanitizeLayout(
  tiles: WorkspaceTileLayoutSpec[],
  sections: WorkspaceTileSectionLayoutSpec[],
  candidate: unknown,
): WorkspaceLayoutState {
  const tileIds = tiles.map((tile) => tile.id)
  const defaultLayout = createDefaultLayout(tileIds, sections)
  if (!candidate || typeof candidate !== 'object') {
    return defaultLayout
  }

  const candidateRecord = candidate as Record<string, unknown>
  const knownIds = new Set(tileIds)
  const candidateOrder = Array.isArray(candidateRecord.order)
    ? candidateRecord.order.filter((value): value is string => typeof value === 'string')
    : []
  const candidateHidden = Array.isArray(candidateRecord.hidden)
    ? candidateRecord.hidden.filter((value): value is string => typeof value === 'string')
    : []
  const knownOrder = uniqueValues(candidateOrder.filter((value) => knownIds.has(value)))
  const fullOrder = [...knownOrder, ...tileIds.filter((tileId) => !knownOrder.includes(tileId))]

  return {
    order: fullOrder,
    hidden: uniqueValues(candidateHidden.filter((value) => knownIds.has(value))),
    spans: normalizeSpanOverrides(tiles, candidateRecord.spans),
    sections: normalizeSectionOrders(sections, candidateRecord.sections),
  }
}

export function layoutsMatch(left: WorkspaceLayoutState, right: WorkspaceLayoutState): boolean {
  if (left.order.length !== right.order.length || left.hidden.length !== right.hidden.length) {
    return false
  }

  if (left.order.some((tileId, index) => tileId !== right.order[index])) {
    return false
  }

  if (left.hidden.some((tileId, index) => tileId !== right.hidden[index])) {
    return false
  }

  const leftSections = Object.entries(left.sections).sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
  const rightSections = Object.entries(right.sections).sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
  if (leftSections.length !== rightSections.length) {
    return false
  }

  if (
    leftSections.some(([sectionId, itemIds], index) => {
      const matchingSection = rightSections[index]
      if (!matchingSection || sectionId !== matchingSection[0] || itemIds.length !== matchingSection[1].length) {
        return true
      }

      return itemIds.some((itemId, itemIndex) => itemId !== matchingSection[1][itemIndex])
    })
  ) {
    return false
  }

  const leftSpans = Object.entries(left.spans).sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
  const rightSpans = Object.entries(right.spans).sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
  if (leftSpans.length !== rightSpans.length) {
    return false
  }

  return leftSpans.every(
    ([tileId, span], index) => tileId === rightSpans[index]?.[0] && span === rightSpans[index]?.[1],
  )
}
