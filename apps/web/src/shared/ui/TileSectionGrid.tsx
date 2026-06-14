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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, type CSSProperties, type ReactNode } from 'react'

import { useTileLayoutSection } from './tileLayoutSections'

export type TileSectionGridItem = {
  id: string
  title: string
  content: ReactNode
  className?: string
}

type TileSectionGridProps = {
  sectionId: string
  items: TileSectionGridItem[]
  gridClassName?: string
  itemClassName?: string
}

function SortableTileSectionCard({
  item,
  itemClassName,
  movable,
}: {
  item: TileSectionGridItem
  itemClassName: string
  movable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`${itemClassName} tile-section-card ${item.className ?? ''} ${isDragging ? 'is-dragging' : ''}`.trim()}
    >
      {movable ? (
        <div className="tile-section-card-tools">
          <button
            type="button"
            className="button button-ghost tile-section-card-handle"
            aria-label={`Drag ${item.title}`}
            {...attributes}
            {...listeners}
          >
            Move
          </button>
        </div>
      ) : null}
      {item.content}
    </article>
  )
}

export function TileSectionGrid({
  sectionId,
  items,
  gridClassName = 'dashboard-report-grid',
  itemClassName = 'dashboard-report-card',
}: TileSectionGridProps) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items])
  const { isCustomizingLayout, orderedIds, moveItem } = useTileLayoutSection(sectionId, itemIds)
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items])
  const orderedItems = orderedIds.map((itemId) => itemsById.get(itemId)).filter((item): item is TileSectionGridItem => Boolean(item))
  const movable = isCustomizingLayout && orderedItems.length > 1
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

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null

    if (!overId || activeId === overId) {
      return
    }

    moveItem(activeId, overId)
  }

  if (!movable) {
    return (
      <div className={gridClassName}>
        {orderedItems.map((item) => (
          <article key={item.id} className={`${itemClassName} tile-section-card ${item.className ?? ''}`.trim()}>
            {item.content}
          </article>
        ))}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedItems.map((item) => item.id)} strategy={rectSortingStrategy}>
        <div className={gridClassName}>
          {orderedItems.map((item) => (
            <SortableTileSectionCard key={item.id} item={item} itemClassName={itemClassName} movable={movable} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
