import { createContext, useContext, useMemo } from 'react'

export type TileLayoutSectionContextValue = {
  getSectionOrder: (sectionId: string, itemIds: string[]) => string[]
  moveSectionItem: (sectionId: string, itemIds: string[], activeId: string, overId: string) => void
}

export const TileLayoutSectionContext = createContext<TileLayoutSectionContextValue | null>(null)

export function useTileLayoutSection(
  sectionId: string,
  itemIds: string[],
): { orderedIds: string[]; moveItem: (activeId: string, overId: string) => void } {
  const context = useContext(TileLayoutSectionContext)

  return useMemo(() => {
    if (!context) {
      return {
        orderedIds: [...itemIds],
        moveItem: () => undefined,
      }
    }

    return {
      orderedIds: context.getSectionOrder(sectionId, itemIds),
      moveItem: (activeId: string, overId: string) => context.moveSectionItem(sectionId, itemIds, activeId, overId),
    }
  }, [context, itemIds, sectionId])
}
