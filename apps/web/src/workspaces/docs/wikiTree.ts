import type { WikiPageSummary } from '../../entities/wiki/api'

export type WikiPageTreeItem = WikiPageSummary & {
  children: WikiPageTreeItem[]
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function sortPages(left: WikiPageSummary, right: WikiPageSummary): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order
  }
  return left.title.localeCompare(right.title)
}

export function buildWikiPageTree(pages: WikiPageSummary[]): WikiPageTreeItem[] {
  const itemById = new Map<string, WikiPageTreeItem>()

  pages
    .slice()
    .sort(sortPages)
    .forEach((page) => {
      itemById.set(page.page_id, {
        ...page,
        children: [],
      })
    })

  const roots: WikiPageTreeItem[] = []

  itemById.forEach((item) => {
    if (item.parent_page_id && itemById.has(item.parent_page_id)) {
      itemById.get(item.parent_page_id)?.children.push(item)
      return
    }
    roots.push(item)
  })

  function sortChildren(items: WikiPageTreeItem[]) {
    items.sort(sortPages)
    items.forEach((item) => sortChildren(item.children))
  }

  sortChildren(roots)
  return roots
}

export function filterWikiPageTree(
  items: WikiPageTreeItem[],
  query: string,
): WikiPageTreeItem[] {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    return items
  }

  const visit = (item: WikiPageTreeItem): WikiPageTreeItem | null => {
    const filteredChildren = item.children
      .map(visit)
      .filter((entry): entry is WikiPageTreeItem => Boolean(entry))
    const matchesSelf =
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.summary.toLowerCase().includes(normalizedQuery)

    if (!matchesSelf && filteredChildren.length === 0) {
      return null
    }

    return {
      ...item,
      children: filteredChildren,
    }
  }

  return items
    .map(visit)
    .filter((entry): entry is WikiPageTreeItem => Boolean(entry))
}

export function buildWikiDescendantIdSet(
  pages: WikiPageSummary[],
  rootPageId: string,
): Set<string> {
  const childrenByParentId = new Map<string, string[]>()

  pages.forEach((page) => {
    if (!page.parent_page_id) {
      return
    }
    const current = childrenByParentId.get(page.parent_page_id) ?? []
    current.push(page.page_id)
    childrenByParentId.set(page.parent_page_id, current)
  })

  const descendants = new Set<string>()
  const queue = [...(childrenByParentId.get(rootPageId) ?? [])]

  while (queue.length > 0) {
    const nextPageId = queue.shift()
    if (!nextPageId || descendants.has(nextPageId)) {
      continue
    }

    descendants.add(nextPageId)
    queue.push(...(childrenByParentId.get(nextPageId) ?? []))
  }

  return descendants
}
