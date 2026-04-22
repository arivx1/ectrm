import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import {
  loadPersonalWorkspaceLayout,
  resetPersonalWorkspaceLayout,
  savePersonalWorkspaceLayout,
} from '../../entities/layouts/api'
import { TileLayoutSectionContext, type TileLayoutSectionContextValue } from './tileLayoutSections'
import { appConfig } from '../config'
import type { PersonalizableWorkspaceId, WorkspaceLayoutState, WorkspaceTileSpan } from '../layouts'
import type { StoredAuthSession } from '../mutation'

export type TileSpan = WorkspaceTileSpan

export type WorkspaceTile = {
  id: string
  eyebrow: string
  title: string
  description: string
  span?: TileSpan
  availableSpans?: TileSpan[]
  content: ReactNode
}

export type WorkspaceTileSection = {
  id: string
  itemIds: string[]
}

type TileLayoutProps = {
  workspaceId: PersonalizableWorkspaceId
  workspaceLabel: string
  tiles: WorkspaceTile[]
  sections?: WorkspaceTileSection[]
  authSession: StoredAuthSession | null
  headerContent?: ReactNode
  toolbarDescription?: string
}

type TileLayoutState = WorkspaceLayoutState
type WorkspaceTileLayoutSpec = Pick<WorkspaceTile, 'id' | 'span' | 'availableSpans'>
type WorkspaceTileSectionLayoutSpec = WorkspaceTileSection

const STORAGE_VERSION = 'v1'
const TILE_SPAN_LABELS: Record<TileSpan, string> = {
  full: 'Full',
  wide: 'Wide',
  half: 'Half',
  side: 'Side',
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)]
}

function defaultSpanForTile(tile: Pick<WorkspaceTile, 'span'>): TileSpan {
  return tile.span ?? 'full'
}

function availableSpansForTile(tile: Pick<WorkspaceTile, 'span' | 'availableSpans'>): TileSpan[] {
  const defaultSpan = defaultSpanForTile(tile)
  const configuredSpans = tile.availableSpans?.length ? uniqueValues(tile.availableSpans) : []
  return configuredSpans.includes(defaultSpan) ? configuredSpans : uniqueValues([defaultSpan, ...configuredSpans])
}

function sanitizeSectionOrder(itemIds: string[], candidate: unknown): string[] {
  const knownIds = new Set(itemIds)
  const candidateOrder = Array.isArray(candidate) ? candidate.filter((value): value is string => typeof value === 'string') : []
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

function createDefaultLayout(
  tileIds: string[],
  sections: WorkspaceTileSectionLayoutSpec[] = [],
): TileLayoutState {
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

function sanitizeLayout(
  tiles: WorkspaceTileLayoutSpec[],
  sections: WorkspaceTileSectionLayoutSpec[],
  candidate: unknown,
): TileLayoutState {
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

function layoutsMatch(left: TileLayoutState, right: TileLayoutState): boolean {
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

function storageKey(workspaceId: string): string {
  return `ectrm.tile-layout.${workspaceId}.${STORAGE_VERSION}`
}

function hasStoredLayout(workspaceId: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(storageKey(workspaceId)) !== null
}

function readStoredLayout(
  workspaceId: string,
  tiles: WorkspaceTileLayoutSpec[],
  sections: WorkspaceTileSectionLayoutSpec[],
): TileLayoutState {
  if (typeof window === 'undefined') {
    return createDefaultLayout(
      tiles.map((tile) => tile.id),
      sections,
    )
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey(workspaceId))
    if (!rawValue) {
      return createDefaultLayout(
        tiles.map((tile) => tile.id),
        sections,
      )
    }

    return sanitizeLayout(tiles, sections, JSON.parse(rawValue))
  } catch {
    return createDefaultLayout(
      tiles.map((tile) => tile.id),
      sections,
    )
  }
}

function replaceVisibleOrder(currentOrder: string[], hiddenIds: string[], nextVisibleOrder: string[]): string[] {
  const hidden = new Set(hiddenIds)
  const reorderedVisible = [...nextVisibleOrder]
  let visibleIndex = 0

  return currentOrder.map((tileId) => {
    if (hidden.has(tileId)) {
      return tileId
    }

    const nextTileId = reorderedVisible[visibleIndex]
    visibleIndex += 1
    return nextTileId ?? tileId
  })
}

function SortableTileCard({
  tile,
  onHide,
  onSpanChange,
}: {
  tile: WorkspaceTile
  onHide: (tileId: string) => void
  onSpanChange: (tileId: string, nextSpan: TileSpan) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const availableSpans = availableSpansForTile(tile)

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`surface workspace-tile workspace-tile-span-${tile.span ?? 'full'} ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="workspace-tile-head">
        <div className="workspace-tile-copy">
          <span className="eyebrow">{tile.eyebrow}</span>
          <h3>{tile.title}</h3>
          <p>{tile.description}</p>
        </div>
        <div className="workspace-tile-controls">
          {availableSpans.length > 1 ? (
            <div className="workspace-tile-size-group" role="group" aria-label={`Resize ${tile.title} tile`}>
              {availableSpans.map((span) => (
                <button
                  key={span}
                  type="button"
                  className={`workspace-tile-size-button ${tile.span === span ? 'is-active' : ''}`}
                  onClick={() => onSpanChange(tile.id, span)}
                  aria-pressed={tile.span === span}
                >
                  {TILE_SPAN_LABELS[span]}
                </button>
              ))}
            </div>
          ) : null}
          <div className="workspace-tile-tools">
            <button
              type="button"
              className="button button-ghost workspace-tile-handle"
              aria-label={`Drag ${tile.title} tile`}
              {...attributes}
              {...listeners}
            >
              Move
            </button>
            <button
              type="button"
              className="button button-ghost workspace-tile-remove"
              onClick={() => onHide(tile.id)}
              aria-label={`Remove ${tile.title} tile from the workspace`}
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div className="workspace-tile-body">{tile.content}</div>
    </section>
  )
}

export function TileLayout({
  workspaceId,
  workspaceLabel,
  tiles,
  sections = [],
  authSession,
  headerContent,
  toolbarDescription,
}: TileLayoutProps) {
  const tileDefinitionSignature = JSON.stringify(
    tiles.map((tile) => ({
      id: tile.id,
      span: defaultSpanForTile(tile),
      availableSpans: availableSpansForTile(tile),
    })),
  )
  const tileLayoutSpec = useMemo<WorkspaceTileLayoutSpec[]>(
    () => JSON.parse(tileDefinitionSignature) as WorkspaceTileLayoutSpec[],
    [tileDefinitionSignature],
  )
  const sectionDefinitionSignature = JSON.stringify(
    sections.map((section) => ({
      id: section.id,
      itemIds: uniqueValues(section.itemIds),
    })),
  )
  const sectionLayoutSpec = useMemo<WorkspaceTileSectionLayoutSpec[]>(
    () => JSON.parse(sectionDefinitionSignature) as WorkspaceTileSectionLayoutSpec[],
    [sectionDefinitionSignature],
  )
  const tileIds = tileLayoutSpec.map((tile) => tile.id)
  const [layout, setLayout] = useState<TileLayoutState>(() => readStoredLayout(workspaceId, tileLayoutSpec, sectionLayoutSpec))
  const toolbarDescriptionId = useId()
  const remoteHydrationInFlightRef = useRef(false)
  const remoteSnapshotRef = useRef<string | null>(null)
  const accessToken = authSession?.accessToken ?? null
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    setLayout((current) => {
      const nextLayout = sanitizeLayout(tileLayoutSpec, sectionLayoutSpec, current)
      return layoutsMatch(current, nextLayout) ? current : nextLayout
    })
  }, [sectionLayoutSpec, tileLayoutSpec])

  useEffect(() => {
    if (!accessToken) {
      remoteHydrationInFlightRef.current = false
      remoteSnapshotRef.current = null
      return
    }

    const sessionAccessToken = accessToken
    let cancelled = false
    remoteHydrationInFlightRef.current = true

    async function hydrateLayout() {
      try {
        const record = await loadPersonalWorkspaceLayout(appConfig.apiBase, sessionAccessToken, workspaceId)
        if (cancelled) {
          return
        }

        if (record) {
          const nextLayout = sanitizeLayout(tileLayoutSpec, sectionLayoutSpec, record)
          setLayout(nextLayout)
          remoteSnapshotRef.current = JSON.stringify(nextLayout)
          return
        }

        const fallbackLayout = readStoredLayout(workspaceId, tileLayoutSpec, sectionLayoutSpec)
        setLayout(fallbackLayout)
        remoteSnapshotRef.current = hasStoredLayout(workspaceId) ? null : JSON.stringify(fallbackLayout)
      } catch {
        if (cancelled) {
          return
        }

        const fallbackLayout = readStoredLayout(workspaceId, tileLayoutSpec, sectionLayoutSpec)
        setLayout(fallbackLayout)
        remoteSnapshotRef.current = JSON.stringify(fallbackLayout)
      } finally {
        if (!cancelled) {
          remoteHydrationInFlightRef.current = false
        }
      }
    }

    void hydrateLayout()

    return () => {
      cancelled = true
    }
  }, [accessToken, sectionLayoutSpec, tileLayoutSpec, workspaceId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(layout))
    } catch {
      // Ignore persistence issues and keep the layout interactive in-memory.
    }
  }, [layout, workspaceId])

  useEffect(() => {
    if (!accessToken || remoteHydrationInFlightRef.current) {
      return
    }

    const snapshot = JSON.stringify(layout)
    if (snapshot === remoteSnapshotRef.current) {
      return
    }

    const previousSnapshot = remoteSnapshotRef.current
    remoteSnapshotRef.current = snapshot

    void savePersonalWorkspaceLayout(appConfig.apiBase, accessToken, workspaceId, layout).catch(() => {
      remoteSnapshotRef.current = previousSnapshot
    })
  }, [accessToken, layout, workspaceId])

  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]))
  const hiddenSet = new Set(layout.hidden)
  const resolvedToolbarDescription =
    toolbarDescription ??
    `Drag tiles to reorder this workspace, change each tile's footprint from its header, and remove anything you do not need right now before adding it back later without leaving the screen. ${
      authSession ? 'Your layout is saved to your account.' : 'Layouts stay in this browser until you sign in.'
    }`
  const orderedTileIds = [
    ...layout.order.filter((tileId) => tilesById.has(tileId)),
    ...tileIds.filter((tileId) => !layout.order.includes(tileId)),
  ]
  const orderedTiles: WorkspaceTile[] = []
  for (const tileId of orderedTileIds) {
    const tile = tilesById.get(tileId)
    if (!tile) {
      continue
    }

    orderedTiles.push({
      ...tile,
      span: layout.spans[tileId] ?? defaultSpanForTile(tile),
    })
  }
  const visibleTiles = orderedTiles.filter((tile) => !hiddenSet.has(tile.id))
  const hiddenTiles = orderedTiles.filter((tile) => hiddenSet.has(tile.id))

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null

    if (!overId || activeId === overId) {
      return
    }

    const visibleOrder = visibleTiles.map((tile) => tile.id)
    const oldIndex = visibleOrder.indexOf(activeId)
    const newIndex = visibleOrder.indexOf(overId)
    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const nextVisibleOrder = arrayMove(visibleOrder, oldIndex, newIndex)
    setLayout((current) => ({
      ...current,
      order: replaceVisibleOrder(current.order, current.hidden, nextVisibleOrder),
    }))
  }

  function handleHideTile(tileId: string) {
    setLayout((current) => {
      if (current.hidden.includes(tileId)) {
        return current
      }

      return {
        ...current,
        hidden: [...current.hidden, tileId],
      }
    })
  }

  function handleShowTile(tileId: string) {
    setLayout((current) => {
      if (!current.hidden.includes(tileId)) {
        return current
      }

      return {
        ...current,
        hidden: current.hidden.filter((hiddenId) => hiddenId !== tileId),
      }
    })
  }

  function handleSetTileSpan(tileId: string, nextSpan: TileSpan) {
    const tile = tilesById.get(tileId)
    if (!tile) {
      return
    }

    const allowedSpans = availableSpansForTile(tile)
    if (!allowedSpans.includes(nextSpan)) {
      return
    }

    const defaultSpan = defaultSpanForTile(tile)
    setLayout((current) => {
      const currentSpan = current.spans[tileId] ?? defaultSpan
      if (currentSpan === nextSpan) {
        return current
      }

      const nextSpans = { ...current.spans }
      if (nextSpan === defaultSpan) {
        delete nextSpans[tileId]
      } else {
        nextSpans[tileId] = nextSpan
      }

      return {
        ...current,
        spans: nextSpans,
      }
    })
  }

  function handleMoveSectionItem(sectionId: string, itemIds: string[], activeId: string, overId: string) {
    if (activeId === overId) {
      return
    }

    setLayout((current) => {
      const currentOrder = sanitizeSectionOrder(itemIds, current.sections[sectionId])
      const oldIndex = currentOrder.indexOf(activeId)
      const newIndex = currentOrder.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1) {
        return current
      }

      return {
        ...current,
        sections: {
          ...current.sections,
          [sectionId]: arrayMove(currentOrder, oldIndex, newIndex),
        },
      }
    })
  }

  function handleResetLayout() {
    const defaultLayout = createDefaultLayout(tileIds, sectionLayoutSpec)
    setLayout(defaultLayout)

    if (accessToken) {
      const defaultSnapshot = JSON.stringify(defaultLayout)
      remoteSnapshotRef.current = defaultSnapshot
      void resetPersonalWorkspaceLayout(appConfig.apiBase, accessToken, workspaceId).catch(async () => {
        try {
          await savePersonalWorkspaceLayout(appConfig.apiBase, accessToken, workspaceId, defaultLayout)
        } catch {
          remoteSnapshotRef.current = null
        }
      })
    }
  }

  const sectionContextValue: TileLayoutSectionContextValue = {
    getSectionOrder: (sectionId, itemIds) => sanitizeSectionOrder(itemIds, layout.sections[sectionId]),
    moveSectionItem: handleMoveSectionItem,
  }

  return (
    <TileLayoutSectionContext.Provider value={sectionContextValue}>
      <div className="tile-layout-shell">
        {headerContent}
        <section className="surface tile-layout-toolbar">
          <div className="tile-layout-toolbar-head">
            <div>
              <span className="eyebrow">Layout</span>
              <h3>{workspaceLabel} Tiles</h3>
            </div>
            <span className="entity-chip entity-chip-soft">
              {visibleTiles.length} of {tiles.length} on screen
            </span>
          </div>
          <p id={toolbarDescriptionId}>{resolvedToolbarDescription}</p>
          <div className="tile-layout-toolbar-actions">
            {hiddenTiles.length > 0 ? (
              hiddenTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className="button button-ghost tile-layout-add-button"
                  onClick={() => handleShowTile(tile.id)}
                >
                  Add {tile.title}
                </button>
              ))
            ) : (
              <span className="entity-chip">All tiles are visible</span>
            )}
            <button type="button" className="button button-secondary tile-layout-reset-button" onClick={handleResetLayout}>
              Reset layout
            </button>
          </div>
        </section>

        {visibleTiles.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleTiles.map((tile) => tile.id)} strategy={rectSortingStrategy}>
              <div className="tile-workspace-grid" aria-describedby={toolbarDescriptionId}>
                {visibleTiles.map((tile) => (
                  <SortableTileCard key={tile.id} tile={tile} onHide={handleHideTile} onSpanChange={handleSetTileSpan} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <section className="surface empty-state workspace-tile-empty-state">
            <strong>No tiles on screen</strong>
            <p>Use the add buttons above to bring tiles back or reset the workspace layout.</p>
          </section>
        )}
      </div>
    </TileLayoutSectionContext.Provider>
  )
}
