export type OperationalQueueLayoutSection = {
  key: string
  label: string
  detail: string
  tone: string
  match_values: string[]
}

export type OperationalQueueLayoutSortRule = {
  field_path: string
  direction: 'asc' | 'desc'
  value_order: string[]
  nulls_last: boolean
}

export type OperationalQueueLayout = {
  key: string
  resource_key: string
  resource_label: string
  field_path: string
  sections: OperationalQueueLayoutSection[]
  sort_rules: OperationalQueueLayoutSortRule[]
}

export type OperationalQueueSection<T> = OperationalQueueLayoutSection & {
  items: T[]
}

function valueAtPath(row: unknown, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[segment]
  }, row)
}

function compareValues(
  left: unknown,
  right: unknown,
  rule: OperationalQueueLayoutSortRule,
): number {
  const leftMissing = left === null || left === undefined || left === ''
  const rightMissing = right === null || right === undefined || right === ''
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) {
      return 0
    }
    const missingResult = leftMissing ? 1 : -1
    return rule.nulls_last ? missingResult : -missingResult
  }

  const leftText = String(left)
  const rightText = String(right)
  if (rule.value_order.length > 0) {
    const leftIndex = rule.value_order.indexOf(leftText)
    const rightIndex = rule.value_order.indexOf(rightText)
    if (leftIndex !== rightIndex) {
      if (leftIndex === -1) {
        return 1
      }
      if (rightIndex === -1) {
        return -1
      }
      return leftIndex - rightIndex
    }
  }

  return leftText.localeCompare(rightText, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortRows<T>(rows: T[], sortRules: OperationalQueueLayoutSortRule[]): T[] {
  return [...rows].sort((left, right) => {
    for (const rule of sortRules) {
      const result = compareValues(valueAtPath(left, rule.field_path), valueAtPath(right, rule.field_path), rule)
      if (result !== 0) {
        return rule.direction === 'desc' ? -result : result
      }
    }
    return 0
  })
}

export function buildOperationalQueueSections<T>(
  rows: T[],
  layout: OperationalQueueLayout,
): Array<OperationalQueueSection<T>> {
  const sortedRows = sortRows(rows, layout.sort_rules)
  const sections = layout.sections.map((section) => ({
    ...section,
    items: [] as T[],
  }))
  const otherItems: T[] = []

  for (const row of sortedRows) {
    const value = valueAtPath(row, layout.field_path)
    const matchedSection = sections.find((section) => section.match_values.includes(String(value)))
    if (matchedSection) {
      matchedSection.items.push(row)
    } else {
      otherItems.push(row)
    }
  }

  const visibleSections = sections.filter((section) => section.items.length > 0)
  if (otherItems.length > 0) {
    visibleSections.push({
      key: 'OTHER',
      label: 'Other',
      detail: `Rows not covered by ${layout.resource_label} layout sections.`,
      tone: 'planned',
      match_values: [],
      items: otherItems,
    })
  }
  return visibleSections
}
