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
import type { PersonalizableWorkspaceId, WorkspaceLayoutState } from '../layouts'
import type { StoredAuthSession } from '../mutation'
import {
  availableSpansForTile,
  createDefaultLayout,
  defaultSpanForTile,
  layoutsMatch,
  sanitizeLayout,
  sanitizeSectionOrder,
  type TileSpan,
  type WorkspaceTileLayoutSpec,
} from '../tileLayoutState'
import { resolveWorkspaceLayoutPresets } from '../workspaceLayoutPresets'

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
type WorkspaceTileSectionLayoutSpec = WorkspaceTileSection

const STORAGE_VERSION = 'v1'
const TILE_SPAN_LABELS: Record<TileSpan, string> = {
  full: 'Full',
  wide: 'Wide',
  half: 'Half',
  side: 'Side',
}
const LEGACY_SETTLEMENT_TILE_ORDER = [
  'settlement-summary',
  'settlement-status',
  'settlement-disputes',
  'settlement-document-record-creation',
  'settlement-queue',
]

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)]
}

function arraysMatch(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function migrateWorkspaceLayoutOrder(
  workspaceId: PersonalizableWorkspaceId,
  layout: TileLayoutState,
  defaultOrder: string[],
): TileLayoutState {
  if (workspaceId === 'settlement' && arraysMatch(layout.order, LEGACY_SETTLEMENT_TILE_ORDER)) {
    return {
      ...layout,
      order: [...defaultOrder],
    }
  }

  return layout
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
  isCustomizingLayout,
  onHide,
  onSpanChange,
}: {
  tile: WorkspaceTile
  isCustomizingLayout: boolean
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
      id={tile.id}
      tabIndex={-1}
      data-terminal-shortcut-target="workspace-tile"
      style={style}
      className={`surface workspace-tile workspace-tile-span-${tile.span ?? 'full'} ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="workspace-tile-head">
        <div className="workspace-tile-copy">
          <span className="eyebrow">{tile.eyebrow}</span>
          <h3>{tile.title}</h3>
          <p>{tile.description}</p>
        </div>
        {isCustomizingLayout ? (
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
        ) : null}
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
  const toolbarDescriptionId = useId()
  const presetSelectId = useId()
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
  const tileIds = useMemo(() => tileLayoutSpec.map((tile) => tile.id), [tileLayoutSpec])
  const [layout, setLayout] = useState<TileLayoutState>(() =>
    migrateWorkspaceLayoutOrder(workspaceId, readStoredLayout(workspaceId, tileLayoutSpec, sectionLayoutSpec), tileIds),
  )
  const [isCustomizingLayout, setIsCustomizingLayout] = useState(false)
  const remoteHydrationInFlightRef = useRef(false)
  const remoteSnapshotRef = useRef<string | null>(null)
  const accessToken = authSession?.accessToken ?? null
  const layoutPresets = useMemo(
    () => resolveWorkspaceLayoutPresets(workspaceId, tileLayoutSpec, sectionLayoutSpec),
    [sectionLayoutSpec, tileLayoutSpec, workspaceId],
  )
  const activePreset = useMemo(
    () => layoutPresets.find((preset) => layoutsMatch(layout, preset.layout)) ?? null,
    [layout, layoutPresets],
  )
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
      const nextLayout = migrateWorkspaceLayoutOrder(
        workspaceId,
        sanitizeLayout(tileLayoutSpec, sectionLayoutSpec, current),
        tileIds,
      )
      return layoutsMatch(current, nextLayout) ? current : nextLayout
    })
  }, [sectionLayoutSpec, tileIds, tileLayoutSpec, workspaceId])

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
          const nextLayout = migrateWorkspaceLayoutOrder(
            workspaceId,
            sanitizeLayout(tileLayoutSpec, sectionLayoutSpec, record),
            tileIds,
          )
          setLayout(nextLayout)
          remoteSnapshotRef.current = JSON.stringify(nextLayout)
          return
        }

        const fallbackLayout = migrateWorkspaceLayoutOrder(
          workspaceId,
          readStoredLayout(workspaceId, tileLayoutSpec, sectionLayoutSpec),
          tileIds,
        )
        setLayout(fallbackLayout)
        remoteSnapshotRef.current = hasStoredLayout(workspaceId) ? null : JSON.stringify(fallbackLayout)
      } catch {
        if (cancelled) {
          return
        }

        const fallbackLayout = migrateWorkspaceLayoutOrder(
          workspaceId,
          readStoredLayout(workspaceId, tileLayoutSpec, sectionLayoutSpec),
          tileIds,
        )
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
  }, [accessToken, sectionLayoutSpec, tileIds, tileLayoutSpec, workspaceId])

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
  const presetSelectValue = activePreset?.id ?? 'custom'
  const presetStatus = activePreset
    ? activePreset.description
    : 'A saved personal variation is active. Choose a monitor preset to reapply a terminal-friendly starting layout.'

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

  function handleApplyPreset(presetId: string) {
    const preset = layoutPresets.find((candidate) => candidate.id === presetId)
    if (!preset) {
      return
    }

    setLayout(preset.layout)
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
    isCustomizingLayout,
    getSectionOrder: (sectionId, itemIds) => sanitizeSectionOrder(itemIds, layout.sections[sectionId]),
    moveSectionItem: handleMoveSectionItem,
  }

  return (
    <TileLayoutSectionContext.Provider value={sectionContextValue}>
      <div className="tile-layout-shell">
        {headerContent}
        {isCustomizingLayout ? (
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
            {layoutPresets.length > 0 ? (
              <div className="tile-layout-preset-bar">
                <label className="tile-layout-preset-picker" htmlFor={presetSelectId}>
                  <span className="eyebrow">Monitor preset</span>
                  <select
                    id={presetSelectId}
                    className="control"
                    value={presetSelectValue}
                    onChange={(event) => {
                      if (event.target.value !== 'custom') {
                        handleApplyPreset(event.target.value)
                      }
                    }}
                  >
                    <option value="custom">Personal layout</option>
                    {layoutPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="tile-layout-preset-note">{presetStatus}</p>
              </div>
            ) : null}
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
              <button type="button" className="button button-primary" onClick={() => setIsCustomizingLayout(false)}>
                Done
              </button>
            </div>
          </section>
        ) : (
          <section className="surface tile-layout-customize-bar">
            <span className="entity-chip entity-chip-soft">
              {visibleTiles.length} of {tiles.length} tiles visible
            </span>
            <button
              type="button"
              className="button button-secondary"
              aria-expanded={false}
              onClick={() => setIsCustomizingLayout(true)}
            >
              Customize view
            </button>
          </section>
        )}

        {visibleTiles.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleTiles.map((tile) => tile.id)} strategy={rectSortingStrategy}>
              <div className="tile-workspace-grid" aria-describedby={isCustomizingLayout ? toolbarDescriptionId : undefined}>
                {visibleTiles.map((tile) => (
                  <SortableTileCard
                    key={tile.id}
                    tile={tile}
                    isCustomizingLayout={isCustomizingLayout}
                    onHide={handleHideTile}
                    onSpanChange={handleSetTileSpan}
                  />
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
