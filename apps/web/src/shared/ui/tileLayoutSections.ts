import { createContext, useContext, useMemo } from 'react'

export type TileLayoutSectionContextValue = {
  isCustomizingLayout: boolean
  getSectionOrder: (sectionId: string, itemIds: string[]) => string[]
  moveSectionItem: (sectionId: string, itemIds: string[], activeId: string, overId: string) => void
}

export const TileLayoutSectionContext = createContext<TileLayoutSectionContextValue | null>(null)

export function useTileLayoutSection(
  sectionId: string,
  itemIds: string[],
): { isCustomizingLayout: boolean; orderedIds: string[]; moveItem: (activeId: string, overId: string) => void } {
  const context = useContext(TileLayoutSectionContext)

  return useMemo(() => {
    if (!context) {
      return {
        isCustomizingLayout: false,
        orderedIds: [...itemIds],
        moveItem: () => undefined,
      }
    }

    return {
      isCustomizingLayout: context.isCustomizingLayout,
      orderedIds: context.getSectionOrder(sectionId, itemIds),
      moveItem: (activeId: string, overId: string) => context.moveSectionItem(sectionId, itemIds, activeId, overId),
    }
  }, [context, itemIds, sectionId])
}
